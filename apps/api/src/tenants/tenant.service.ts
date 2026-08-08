import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../data/prisma.service";
import { PropertySourceService } from "../property-sources/property-source.service";
import { NormalizedProperty } from "../property-sources/property-source.types";

type BrandInput = {
  tone?: string;
  preferredEmojis?: string[];
  forbiddenWords?: string[];
  primaryColor?: string;
  cta?: string;
  promotionBrief?: string;
};

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: PropertySourceService,
  ) {}

  async onboard(input: {
    name: string;
    slug: string;
    website?: string;
    brand?: BrandInput;
  }) {
    if (!input.name?.trim() || !input.slug?.trim())
      throw new BadRequestException(
        "Agency name and workspace slug are required",
      );
    const slug = input.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/(^-|-$)/g, "");
    return this.prisma.tenant.upsert({
      where: { slug },
      update: {
        name: input.name.trim(),
        website: input.website?.trim() || null,
        brandProfile: {
          upsert: {
            create: this.brand(input.brand),
            update: this.brand(input.brand),
          },
        },
      },
      create: {
        name: input.name.trim(),
        slug,
        website: input.website?.trim() || null,
        brandProfile: { create: this.brand(input.brand) },
      },
      include: { brandProfile: true },
    });
  }

  async dashboard(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { brandProfile: true },
    });
    if (!tenant) throw new NotFoundException("Workspace not found");
    const [properties, campaigns, approvals] = await Promise.all([
      this.prisma.property.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      this.prisma.campaign.findMany({
        where: { tenantId },
        include: { property: true, content: true, approvals: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      this.prisma.campaign.count({
        where: { tenantId, status: "AWAITING_APPROVAL" },
      }),
    ]);
    return {
      tenant,
      properties,
      campaigns,
      metrics: {
        activeProperties: properties.filter(
          (property) => property.status === "ACTIVE",
        ).length,
        awaitingApproval: approvals,
        totalCampaigns: campaigns.length,
      },
    };
  }

  async updateBrand(tenantId: string, brand: BrandInput) {
    await this.requireTenant(tenantId);
    return this.prisma.brandProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...this.brand(brand) },
      update: this.brand(brand),
    });
  }

  async addProperty(tenantId: string, property: NormalizedProperty) {
    await this.requireTenant(tenantId);
    return this.sources.ingest(
      tenantId,
      "manual",
      "LISTING_UPDATED",
      this.normalize(property),
    );
  }

  async importProperties(tenantId: string, properties: NormalizedProperty[]) {
    await this.requireTenant(tenantId);
    if (!Array.isArray(properties) || properties.length === 0)
      throw new BadRequestException("Provide at least one property");
    return Promise.all(
      properties.map((property) =>
        this.sources.ingest(
          tenantId,
          "manual",
          "LISTING_UPDATED",
          this.normalize(property),
        ),
      ),
    );
  }

  private async requireTenant(tenantId: string) {
    if (
      !(await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Workspace not found");
  }
  private brand(brand: BrandInput = {}) {
    return {
      tone: brand.tone || "Warm, informed, aspirational",
      preferredEmojis: brand.preferredEmojis || [],
      forbiddenWords: brand.forbiddenWords || [],
      primaryColor: brand.primaryColor || "#C6A15B",
    cta: brand.cta || "Book a private viewing",
    promotionBrief: brand.promotionBrief?.trim() || null,
    };
  }
  private normalize(property: NormalizedProperty): NormalizedProperty {
    return {
      ...property,
      images: property.images || [],
      amenities: property.amenities || [],
      status: property.status || "ACTIVE",
      currency: property.currency || "NGN",
    };
  }
}
