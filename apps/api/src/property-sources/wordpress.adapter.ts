import { NormalizedProperty, PropertySourceAdapter } from "./property-source.types";
export class WordPressPropertySourceAdapter implements PropertySourceAdapter {
  constructor(private readonly baseUrl: string, private readonly postType = "properties") {}
  async fetch(_: string): Promise<NormalizedProperty[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/${this.postType}?per_page=100&_embed=1`);
    if (!response.ok) throw new Error(`WordPress source failed: ${response.status}`);
    const posts = await response.json() as Record<string, any>[];
    return posts.map(post => { const acf = post.acf ?? {}; const media = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url; return { externalId: String(post.id), title: String(post.title?.rendered ?? "Untitled property"), address: String(acf.address ?? ""), type: String(acf.property_type ?? "Property"), price: Number(acf.price ?? 0) || undefined, currency: String(acf.currency ?? "USD"), bedrooms: Number(acf.bedrooms ?? 0) || undefined, bathrooms: Number(acf.bathrooms ?? 0) || undefined, images: media ? [media] : [], amenities: Array.isArray(acf.amenities) ? acf.amenities.map(String) : [], status: String(acf.status ?? "ACTIVE"), sourcePayload: post }; });
  }
}
