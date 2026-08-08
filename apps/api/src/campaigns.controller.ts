import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CampaignService } from "./campaigns.service";
@Controller("campaigns") export class CampaignController { constructor(private readonly campaigns: CampaignService) {} @Get(":id") get(@Param("id") id: string) { return this.campaigns.get(id); } @Post(":id/approve") approve(@Param("id") id: string, @Body() body: { reviewerId: string; notes?: string }) { return this.campaigns.approve(id, body); } }
@Controller("property-events") export class PropertyEventsController { constructor(private readonly campaigns: CampaignService) {} @Post() ingest(@Body() event: { tenantId: string; externalId: string; type: string; payload: unknown }) { return this.campaigns.enqueueEvent(event); } }
