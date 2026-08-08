import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { TenantService } from "./tenant.service";
import { NormalizedProperty } from "../property-sources/property-source.types";

@Controller("tenants")
export class TenantController {
  constructor(private readonly tenants: TenantService) {}
  @Post("onboard") onboard(@Body() body: { name: string; slug: string; website?: string; brand?: Record<string, unknown> }) { return this.tenants.onboard(body); }
  @Get(":tenantId/dashboard") dashboard(@Param("tenantId") tenantId: string) { return this.tenants.dashboard(tenantId); }
  @Put(":tenantId/brand") updateBrand(@Param("tenantId") tenantId: string, @Body() body: Record<string, unknown>) { return this.tenants.updateBrand(tenantId, body); }
  @Post(":tenantId/properties") addProperty(@Param("tenantId") tenantId: string, @Body() body: NormalizedProperty) { return this.tenants.addProperty(tenantId, body); }
  @Post(":tenantId/properties/import") importProperties(@Param("tenantId") tenantId: string, @Body() body: { properties: NormalizedProperty[] }) { return this.tenants.importProperties(tenantId, body.properties); }
}
