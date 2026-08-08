import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, Queue } from "bullmq";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { existsSync } from "fs";
import { resolve } from "path";
import { v2 as cloudinary } from "cloudinary";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";
import { CampaignPersistenceService } from "../data/campaign-persistence.service";
import { PrismaService } from "../data/prisma.service";

export type Platform =
  | "FACEBOOK"
  | "INSTAGRAM"
  | "LINKEDIN"
  | "X"
  | "TIKTOK"
  | "YOUTUBE";
export type PublishRequest = {
  tenantId: string;
  campaignId: string;
  platform: Platform;
  accountId: string;
  accessToken: string;
  body: string;
  mediaUrl?: string;
  approved: boolean;
};

@Injectable()
export class AuditService {
  private readonly log = new Logger("Audit");
  record(input: {
    tenantId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  }) {
    this.log.log(JSON.stringify({ ...input, at: new Date().toISOString() }));
  }
}
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly jobs = new Counter({
    name: "estateos_jobs_total",
    help: "Processed jobs",
    labelNames: ["queue", "outcome"],
    registers: [this.registry],
  });
  readonly queueDepth = new Gauge({
    name: "estateos_queue_depth",
    help: "Queue waiting jobs",
    labelNames: ["queue"],
    registers: [this.registry],
  });
  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "estateos_" });
  }
  async metrics() {
    return this.registry.metrics();
  }
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue("notifications") private readonly notifications: Queue,
    private readonly audit: AuditService,
  ) {}
  async notify(input: {
    tenantId: string;
    type: string;
    message: string;
    metadata?: unknown;
  }) {
    this.audit.record({
      tenantId: input.tenantId,
      actorId: "system",
      action: `notification.${input.type}`,
      entityType: "notification",
      entityId: randomUUID(),
      metadata: input,
    });
    return this.notifications.add("send", input, {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
    });
  }
}

@Injectable()
export class MediaService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  async ingestRemote(url: string, folder: string) {
    if (!process.env.CLOUDINARY_CLOUD_NAME)
      throw new ServiceUnavailableException("Cloudinary is not configured");
    return cloudinary.uploader.upload(url, {
      folder,
      resource_type: "auto",
      overwrite: false,
    });
  }
}
@Injectable()
export class HiggsfieldService {
  private readonly base = process.env.HIGGSFIELD_API_BASE_URL;
  async create(
    prompt: string,
    options: { aspectRatio: string; durationSeconds: number },
  ) {
    if (!this.base || !process.env.HIGGSFIELD_API_KEY)
      throw new ServiceUnavailableException("Higgsfield is not configured");
    const res = await fetch(
      `${this.base.replace(/\/$/, "")}/v1/video/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          aspect_ratio: options.aspectRatio,
          duration_seconds: options.durationSeconds,
        }),
      },
    );
    if (!res.ok) throw new Error(`Higgsfield request failed: ${res.status}`);
    return res.json();
  }
  async status(id: string) {
    const res = await fetch(
      `${this.base?.replace(/\/$/, "")}/v1/video/generations/${id}`,
      {
        headers: { Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY}` },
      },
    );
    if (!res.ok) throw new Error(`Higgsfield status failed: ${res.status}`);
    return res.json();
  }
}

@Injectable()
export class SocialOAuthService {
  private readonly secret = process.env.SOCIAL_OAUTH_STATE_SECRET ?? "";
  private signed(payload: Record<string, string>) {
    if (!this.secret)
      throw new ServiceUnavailableException(
        "SOCIAL_OAUTH_STATE_SECRET is required",
      );
    const raw = Buffer.from(
      JSON.stringify({ ...payload, exp: Date.now() + 600000 }),
    ).toString("base64url");
    return `${raw}.${createHmac("sha256", this.secret).update(raw).digest("hex")}`;
  }
  verify(state: string) {
    const [raw, sig] = state.split(".");
    const expected = createHmac("sha256", this.secret)
      .update(raw)
      .digest("hex");
    if (
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      throw new Error("Invalid OAuth state");
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (payload.exp < Date.now()) throw new Error("Expired OAuth state");
    return payload as { tenantId: string; platform: Platform; exp: number };
  }
  authorizationUrl(tenantId: string, platform: Platform, redirectUri: string) {
    const state = this.signed({ tenantId, platform });
    const p = new URLSearchParams({
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      client_id: this.clientId(platform),
    });
    if (platform === "YOUTUBE") {
      p.set(
        "scope",
        "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      );
      p.set("access_type", "offline");
      p.set("prompt", "consent");
      return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
    }
    if (platform === "LINKEDIN") {
      p.set("scope", "w_organization_social r_organization_social");
      return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
    }
    if (platform === "X") {
      p.set("scope", "tweet.read tweet.write users.read offline.access");
      return `https://twitter.com/i/oauth2/authorize?${p}`;
    }
    if (platform === "TIKTOK") {
      p.set("scope", "user.info.basic video.publish");
      return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
    }
    p.set(
      "scope",
      platform === "INSTAGRAM"
        ? "instagram_basic instagram_content_publish pages_show_list"
        : "pages_manage_posts pages_read_engagement",
    );
    return `https://www.facebook.com/${process.env.META_GRAPH_VERSION ?? "v22.0"}/dialog/oauth?${p}`;
  }
  private clientId(platform: Platform) {
    const id = process.env[`${platform}_OAUTH_CLIENT_ID`];
    if (!id)
      throw new ServiceUnavailableException(
        `${platform}_OAUTH_CLIENT_ID is required`,
      );
    return id;
  }
}

@Injectable()
export class SocialPublisherService {
  async publish(input: PublishRequest) {
    if (!input.approved)
      throw new Error("Publishing requires recorded approval");
    if (input.platform === "LINKEDIN") return this.linkedin(input);
    if (input.platform === "X") return this.x(input);
    if (input.platform === "INSTAGRAM") return this.instagram(input);
    if (input.platform === "FACEBOOK") return this.facebook(input);
    if (input.platform === "YOUTUBE") return this.youtube(input);
    throw new Error(
      "TikTok publishing must be enabled with an approved Content Posting API integration",
    );
  }
  private async post(
    url: string,
    token: string,
    body: unknown,
    extra: Record<string, string> = {},
  ) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(
        `Publisher request failed: ${res.status} ${await res.text()}`,
      );
    return res.json();
  }
  private facebook(i: PublishRequest) {
    const v = process.env.META_GRAPH_VERSION ?? "v22.0";
    return this.post(
      `https://graph.facebook.com/${v}/${i.accountId}/feed`,
      i.accessToken,
      { message: i.body, link: i.mediaUrl },
    );
  }
  private async instagram(i: PublishRequest) {
    if (!i.mediaUrl)
      throw new Error(
        "Instagram publishing requires a public Cloudinary media URL",
      );
    const v = process.env.META_GRAPH_VERSION ?? "v22.0";
    const create = await this.post(
      `https://graph.facebook.com/${v}/${i.accountId}/media`,
      i.accessToken,
      { image_url: i.mediaUrl, caption: i.body },
    );
    return this.post(
      `https://graph.facebook.com/${v}/${i.accountId}/media_publish`,
      i.accessToken,
      { creation_id: create.id },
    );
  }
  private linkedin(i: PublishRequest) {
    return this.post(
      "https://api.linkedin.com/rest/posts",
      i.accessToken,
      {
        author: i.accountId,
        commentary: i.body,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
      {
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": process.env.LINKEDIN_VERSION ?? "202607",
      },
    );
  }
  private x(i: PublishRequest) {
    return this.post("https://api.x.com/2/tweets", i.accessToken, {
      text: i.body,
    });
  }
  private async youtube(i: PublishRequest) {
    if (!i.mediaUrl)
      throw new Error("YouTube publishing requires a public video URL");
    const media = await fetch(i.mediaUrl);
    if (!media.ok)
      throw new Error(`YouTube media fetch failed: ${media.status}`);
    const bytes = Buffer.from(await media.arrayBuffer());
    const contentType = media.headers.get("content-type") ?? "video/mp4";
    const title =
      i.body.replace(/\s+/g, " ").trim().slice(0, 100) ||
      "EstateOS property video";
    const init = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${i.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(bytes.length),
        },
        body: JSON.stringify({
          snippet: { title, description: i.body, categoryId: "22" },
          status: {
            privacyStatus:
              process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS ?? "public",
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );
    if (!init.ok)
      throw new Error(
        `YouTube upload initialization failed: ${init.status} ${await init.text()}`,
      );
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return an upload URL");
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${i.accessToken}`,
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    });
    if (!upload.ok)
      throw new Error(
        `YouTube upload failed: ${upload.status} ${await upload.text()}`,
      );
    return upload.json();
  }
}

@Processor("analytics")
export class AnalyticsWorker extends WorkerHost {
  constructor(
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }
  async process(
    job: Job<{ tenantId: string; campaignId: string; platform: Platform }>,
  ) {
    this.audit.record({
      tenantId: job.data.tenantId,
      actorId: "system",
      action: "analytics.collect",
      entityType: "campaign",
      entityId: job.data.campaignId,
      metadata: job.data,
    });
    this.metrics.jobs.inc({ queue: "analytics", outcome: "success" });
    return { capturedAt: new Date().toISOString() };
  }
}
@Processor("learning")
export class LearningWorker extends WorkerHost {
  constructor(private readonly audit: AuditService) {
    super();
  }
  async process(job: Job<{ tenantId: string; period: string }>) {
    const recommendation = {
      period: job.data.period,
      action:
        "Prioritize video variants and the strongest historic publishing window.",
    };
    this.audit.record({
      tenantId: job.data.tenantId,
      actorId: "system",
      action: "learning.recommend",
      entityType: "tenant",
      entityId: job.data.tenantId,
      metadata: recommendation,
    });
    return recommendation;
  }
}
@Processor("retries")
export class RetryWorker extends WorkerHost {
  constructor(private readonly audit: AuditService) {
    super();
  }
  async process(
    job: Job<{ tenantId: string; operation: string; attempt: number }>,
  ) {
    this.audit.record({
      tenantId: job.data.tenantId,
      actorId: "system",
      action: "retry.execute",
      entityType: "operation",
      entityId: job.id ?? "unknown",
      metadata: job.data,
    });
    return { retryScheduled: true };
  }
}
@Processor("publishing")
export class PublishingWorker extends WorkerHost {
  constructor(
    private readonly publisher: SocialPublisherService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }
  async process(job: Job<PublishRequest>) {
    try {
      const result = await this.publisher.publish(job.data);
      this.audit.record({
        tenantId: job.data.tenantId,
        actorId: "system",
        action: "publish.success",
        entityType: "campaign",
        entityId: job.data.campaignId,
        metadata: result,
      });
      this.metrics.jobs.inc({ queue: "publishing", outcome: "success" });
      await this.notifications.notify({
        tenantId: job.data.tenantId,
        type: "published",
        message: `${job.data.platform} post published`,
        metadata: result,
      });
      return result;
    } catch (error) {
      this.metrics.jobs.inc({ queue: "publishing", outcome: "failed" });
      throw error;
    }
  }
}
@Processor("property-events")
export class PropertyEventWorker extends WorkerHost {
  constructor(
    @InjectQueue("ai-generation") private readonly ai: Queue,
    private readonly audit: AuditService,
  ) {
    super();
  }
  async process(job: Job<any>) {
    this.audit.record({
      tenantId: job.data.tenantId,
      actorId: "system",
      action: "property.event.accepted",
      entityType: "property",
      entityId: job.data.property.externalId,
      metadata: job.data,
    });
    return this.ai.add("run-marketing-workflow", job.data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
  }
}
@Processor("ai-generation")
export class MarketingWorkflowWorker extends WorkerHost {
  constructor(
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly campaigns: CampaignPersistenceService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }
  async process(
    job: Job<any>,
  ): Promise<{ campaignId: string; result: unknown }> {
    const candidate = resolve(
      process.cwd(),
      "packages/workflow/dist/marketing-graph.js",
    );
    const file = existsSync(candidate)
      ? candidate
      : resolve(
          process.cwd(),
          "../../packages/workflow/dist/marketing-graph.js",
        );
    const workflow = require(file) as {
      createMarketingGraph: (agents: any) => {
        invoke: (state: any) => Promise<any>;
      };
    };
    const agents = require(
      file.replace("marketing-graph.js", "openai-agents.js"),
    ).createOpenAIMarketingAgents();
    const graph = workflow.createMarketingGraph(agents);
    const brandProfile = await this.prisma.brandProfile.findUnique({
      where: { tenantId: job.data.tenantId },
    });
    const result = await graph.invoke({
      tenantId: job.data.tenantId,
      propertyId: job.data.property.externalId,
      event: "LISTING_UPDATED",
      property: job.data.property,
      brandProfile: brandProfile ?? job.data.brandProfile ?? {},
      analysis: {},
      strategy: {},
      assets: [],
      requiresApproval: true,
      errors: [],
    });
    const campaign = await this.campaigns.persistWorkflow(
      job.data.tenantId,
      job.data.property.externalId,
      result,
    );
    this.audit.record({
      tenantId: job.data.tenantId,
      actorId: "system",
      action: "workflow.completed",
      entityType: "campaign",
      entityId: campaign.id,
      metadata: { assetCount: result.assets.length },
    });
    await this.notifications.notify({
      tenantId: job.data.tenantId,
      type: "approval_required",
      message: "New marketing campaign is ready for approval",
      metadata: { campaignId: campaign.id },
    });
    return { campaignId: campaign.id, result };
  }
}
@Processor("notifications")
export class NotificationWorker extends WorkerHost {
  async process(
    job: Job<{ type: string; message: string; metadata?: unknown }>,
  ) {
    const target = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!target)
      return { delivered: false, reason: "No notification webhook configured" };
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job.data),
    });
    if (!res.ok) throw new Error(`Notification delivery failed: ${res.status}`);
    return { delivered: true };
  }
}
