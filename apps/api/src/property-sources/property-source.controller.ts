import { Body, Controller, Headers, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { PropertySourceService } from "./property-source.service";
import { NormalizedProperty, PropertyChange } from "./property-source.types";
import { RestPropertySourceAdapter } from "./rest.adapter";
import { WordPressPropertySourceAdapter } from "./wordpress.adapter";
@Controller("property-sources")
export class PropertySourceController {
  constructor(private readonly sources: PropertySourceService) {}
  @Post(":tenantId/poll") async poll(@Param("tenantId") tenantId: string, @Body() body: { kind: "rest" | "wordpress"; url: string; token?: string; itemsPath?: string; postType?: string }) {
    const adapter = body.kind === "wordpress" ? new WordPressPropertySourceAdapter(body.url, body.postType) : new RestPropertySourceAdapter({ url: body.url, token: body.token, itemsPath: body.itemsPath });
    return this.sources.poll(tenantId, body.kind, adapter);
  }
  @Post(":tenantId/webhook") async webhook(@Param("tenantId") tenantId: string, @Body() body: { change: PropertyChange; property: NormalizedProperty }, @Headers("x-estateos-signature") signature: string | undefined, @Req() req: { rawBody?: Buffer }) {
    const secret = process.env.PROPERTY_WEBHOOK_SECRET;
    if (!secret || !signature || !req.rawBody) throw new UnauthorizedException("Webhook signature is required");
    const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new UnauthorizedException("Invalid webhook signature");
    return this.sources.ingest(tenantId, "webhook", body.change, body.property);
  }
}
