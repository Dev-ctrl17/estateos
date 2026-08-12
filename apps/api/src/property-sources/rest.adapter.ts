import { BadRequestException } from "@nestjs/common";
import { NormalizedProperty, PropertySourceAdapter } from "./property-source.types";

export class RestPropertySourceAdapter implements PropertySourceAdapter {
  constructor(private readonly config: { url: string; token?: string; itemsPath?: string }) {}

  async fetch(_: string): Promise<NormalizedProperty[]> {
    if (!this.config.url?.trim()) {
      throw new BadRequestException("Feed URL is required");
    }

    let response: Response;
    try {
      response = await fetch(this.config.url, {
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {},
        signal: AbortSignal.timeout(12000),
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Could not reach property feed URL (${this.config.url}): ${err.message || "Request timed out"}`
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Property feed URL returned HTTP status ${response.status}`
      );
    }

    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new BadRequestException("Property feed URL did not return valid JSON");
    }

    const itemsPath = this.config.itemsPath?.trim();
    let rawItems: any = body;
    if (itemsPath && body && typeof body === "object" && itemsPath in body) {
      rawItems = body[itemsPath];
    } else if (body && typeof body === "object" && !Array.isArray(body)) {
      rawItems = body.items ?? body.data ?? body.properties ?? body.listings ?? body;
    }

    const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(Boolean);

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("REST property feed does not contain any listing items");
    }

    return items.map((item: Record<string, unknown>, index: number) => ({
      externalId: String(item.id ?? item.externalId ?? item.guid ?? `listing-${index + 1}`),
      title: String(item.title ?? item.name ?? item.post_title ?? "Untitled property"),
      address: String(item.address ?? item.location ?? ""),
      type: String(item.type ?? "Property"),
      price: Number(item.price ?? 0) || undefined,
      currency: String(item.currency ?? "NGN"),
      bedrooms: Number(item.bedrooms ?? 0) || undefined,
      bathrooms: Number(item.bathrooms ?? 0) || undefined,
      images: Array.isArray(item.images) ? item.images.map(String) : [],
      amenities: Array.isArray(item.amenities) ? item.amenities.map(String) : [],
      status: String(item.status ?? "ACTIVE"),
      sourcePayload: item,
    }));
  }
}
