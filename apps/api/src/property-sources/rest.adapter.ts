import { NormalizedProperty, PropertySourceAdapter } from "./property-source.types";
export class RestPropertySourceAdapter implements PropertySourceAdapter {
  constructor(private readonly config: { url: string; token?: string; itemsPath?: string }) {}
  async fetch(_: string): Promise<NormalizedProperty[]> {
    const response = await fetch(this.config.url, { headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {} });
    if (!response.ok) throw new Error(`Property REST source failed: ${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    const items = (body[this.config.itemsPath ?? "items"] ?? body) as Record<string, unknown>[];
    if (!Array.isArray(items)) throw new Error("REST source response does not contain a listing array");
    return items.map(item => ({ externalId: String(item.id ?? item.externalId), title: String(item.title ?? item.name ?? "Untitled property"), address: String(item.address ?? item.location ?? ""), type: String(item.type ?? "Property"), price: Number(item.price ?? 0) || undefined, currency: String(item.currency ?? "USD"), bedrooms: Number(item.bedrooms ?? 0) || undefined, bathrooms: Number(item.bathrooms ?? 0) || undefined, images: Array.isArray(item.images) ? item.images.map(String) : [], amenities: Array.isArray(item.amenities) ? item.amenities.map(String) : [], status: String(item.status ?? "ACTIVE"), sourcePayload: item }));
  }
}
