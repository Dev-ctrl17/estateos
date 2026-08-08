import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { CampaignController, PropertyEventsController } from "./campaigns.controller";
import { CampaignService } from "./campaigns.service";
import { PropertySourceController } from "./property-sources/property-source.controller";
import { PropertySourceService } from "./property-sources/property-source.service";
import { OperationsController } from "./operations/operations.controller";
import { AuditService, NotificationService, MetricsService, MediaService, HiggsfieldService, SocialOAuthService, SocialPublisherService, AnalyticsWorker, LearningWorker, RetryWorker, PublishingWorker, PropertyEventWorker, MarketingWorkflowWorker, NotificationWorker } from "./operations/operations.service";
import { PrismaService } from "./data/prisma.service";
import { CampaignPersistenceService } from "./data/campaign-persistence.service";
import { SocialConnectionsService } from "./operations/social-connections.service";
import { TenantController } from "./tenants/tenant.controller";
import { TenantService } from "./tenants/tenant.service";
@Module({ imports: [BullModule.forRoot({ connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } }), BullModule.registerQueue({ name: "property-events" }, { name: "ai-generation" }, { name: "publishing" }, { name: "analytics" }, { name: "learning" }, { name: "retries" }, { name: "notifications" })], controllers: [CampaignController, PropertyEventsController, PropertySourceController, OperationsController, TenantController], providers: [PrismaService, CampaignPersistenceService, SocialConnectionsService, CampaignService, PropertySourceService, TenantService, AuditService, NotificationService, MetricsService, MediaService, HiggsfieldService, SocialOAuthService, SocialPublisherService, AnalyticsWorker, LearningWorker, RetryWorker, PublishingWorker, PropertyEventWorker, MarketingWorkflowWorker, NotificationWorker] }) export class AppModule {}
