import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { createHash } from "crypto";
import { PrismaService } from "../data/prisma.service";
import { NormalizedProperty, PropertyChange, PropertyEvent, PropertySourceAdapter } from "./property-source.types";

@Injectable()
export class PropertySourceService {
  private readonly logger = new Logger(PropertySourceService.name);

  constructor(
    @InjectQueue("property-events") private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  private hash(property: NormalizedProperty) {
    return createHash("sha256")
      .update(
        JSON.stringify({
          ...property,
          images: [...(property.images || [])].sort(),
          amenities: [...(property.amenities || [])].sort(),
        }),
      )
      .digest("hex");
  }

  private async emit(
    tenantId: string,
    source: PropertyEvent["source"],
    change: PropertyChange,
    property: NormalizedProperty,
  ) {
    const event: PropertyEvent = {
      tenantId,
      source,
      change,
      property,
      occurredAt: new Date().toISOString(),
    };
    try {
      return await this.queue.add("detect-change", event, {
        jobId: `property:${tenantId}:${property.externalId}:${change}:${this.hash(property)}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
      });
    } catch (error) {
      this.logger.warn(
        `Redis queue emit skipped for property ${property.externalId}: ${error instanceof Error ? error.message : error}`
      );
      return null;
    }
  }

  async ingest(
    tenantId: string,
    source: PropertyEvent["source"],
    hint: PropertyChange,
    property: NormalizedProperty,
  ) {
    if (!tenantId || !property.externalId || !property.title)
      throw new BadRequestException("tenantId, externalId, and title are required");
    const change = await this.reconcile(tenantId, property, hint);
    await this.emit(tenantId, source, change, property);
    return { success: true, tenantId, externalId: property.externalId, change };
  }

  async poll(tenantId: string, source: "rest" | "wordpress", adapter: PropertySourceAdapter) {
    const fetched = await adapter.fetch(tenantId);
    const seen = new Set(fetched.map((p) => p.externalId));
    const jobs = await Promise.all(
      fetched.map((property) => this.ingest(tenantId, source, "LISTING_UPDATED", property)),
    );
    const missing = await this.prisma.property.findMany({
      where: { tenantId, status: { not: "ARCHIVED" }, externalId: { notIn: [...seen] } },
    });
    for (const record of missing) {
      await this.prisma.property.update({
        where: { id: record.id },
        data: { status: "ARCHIVED" },
      });
      await this.emit(tenantId, source, "LISTING_DELETED", {
        externalId: record.externalId,
        title: record.title,
        address: record.address,
        type: record.type,
        price: Number(record.price),
        currency: record.currency,
        bedrooms: record.bedrooms ?? undefined,
        bathrooms: record.bathrooms ?? undefined,
        images: (record.images as string[] | null) ?? [],
        amenities: (record.amenities as string[] | null) ?? [],
        status: "ARCHIVED",
        sourcePayload: record.sourcePayload as any,
      });
    }
    return { count: fetched.length, imported: jobs.length };
  }

  private async reconcile(
    tenantId: string,
    property: NormalizedProperty,
    hint: PropertyChange,
  ): Promise<PropertyChange> {
    const incomingHash = this.hash(property);
    const current = await this.prisma.property.findUnique({
      where: { tenantId_externalId: { tenantId, externalId: property.externalId } },
    });
    if (!current) {
      await this.prisma.property.create({
        data: {
          tenantId,
          externalId: property.externalId,
          title: property.title,
          address: property.address,
          type: property.type,
          price: property.price ?? 0,
          currency: property.currency ?? "NGN",
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          images: property.images,
          amenities: property.amenities,
          status: this.status(property.status),
          sourcePayload: property.sourcePayload as any,
          sourceHash: incomingHash,
        },
      });
      return "LISTING_CREATED";
    }
    const change =
      current.status !== this.status(property.status)
        ? property.status === "SOLD"
          ? "LISTING_SOLD"
          : property.status === "RENTED"
            ? "LISTING_RENTED"
            : "LISTING_UPDATED"
        : String(current.price) !== String(property.price ?? current.price)
          ? "PRICE_CHANGED"
          : JSON.stringify(current.images ?? []) !== JSON.stringify(property.images)
            ? "MEDIA_UPDATED"
            : current.sourceHash === incomingHash
              ? hint
              : "LISTING_UPDATED";
    if (current.sourceHash !== incomingHash)
      await this.prisma.property.update({
        where: { id: current.id },
        data: {
          title: property.title,
          address: property.address,
          type: property.type,
          price: property.price ?? Number(current.price),
          currency: property.currency ?? current.currency,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          images: property.images,
          amenities: property.amenities,
          status: this.status(property.status),
          sourcePayload: property.sourcePayload as any,
          sourceHash: incomingHash,
        },
      });
    return change;
  }

  private status(value: string): "DRAFT" | "ACTIVE" | "SOLD" | "RENTED" | "ARCHIVED" {
    return (["DRAFT", "ACTIVE", "SOLD", "RENTED", "ARCHIVED"].includes(value) ? value : "ACTIVE") as any;
  }
}
