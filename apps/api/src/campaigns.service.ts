import { Injectable, ForbiddenException, NotFoundException, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "./data/prisma.service";

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectQueue("property-events") private readonly propertyEvents: Queue,
    @InjectQueue("publishing") private readonly publishing: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueueEvent(event: { tenantId: string; externalId: string; type: string; payload: unknown }) {
    try {
      return await this.propertyEvents.add("detect-change", event, {
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
      });
    } catch (error) {
      this.logger.warn(`Redis queue event enqueue skipped: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { property: true, content: true, approvals: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    return campaign;
  }

  async approve(id: string, input: { reviewerId: string; notes?: string }) {
    if (!input.reviewerId) throw new ForbiddenException("Administrator required");
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    const approval = await this.prisma.approval.create({
      data: { campaignId: id, reviewerId: input.reviewerId, decision: "APPROVED", notes: input.notes },
    });
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    return { campaign: updated, approval, publishingQueued: false };
  }
}
