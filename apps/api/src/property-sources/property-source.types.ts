export type PropertyChange = "LISTING_CREATED" | "LISTING_UPDATED" | "PRICE_CHANGED" | "MEDIA_UPDATED" | "LISTING_SOLD" | "LISTING_RENTED" | "LISTING_DELETED";
export type NormalizedProperty = { externalId: string; title: string; address: string; type: string; price?: number; currency?: string; bedrooms?: number; bathrooms?: number; images: string[]; amenities: string[]; status: string; sourcePayload: unknown };
export type PropertyEvent = { tenantId: string; source: "rest" | "wordpress" | "webhook" | "manual"; change: PropertyChange; property: NormalizedProperty; occurredAt: string };
export interface PropertySourceAdapter { fetch(tenantId: string): Promise<NormalizedProperty[]>; }
