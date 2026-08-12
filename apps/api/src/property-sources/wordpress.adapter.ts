import { BadRequestException } from "@nestjs/common";
import { NormalizedProperty, PropertySourceAdapter } from "./property-source.types";

export class WordPressPropertySourceAdapter implements PropertySourceAdapter {
  constructor(private readonly baseUrl: string, private readonly postType = "properties") {}

  async fetch(_: string): Promise<NormalizedProperty[]> {
    if (!this.baseUrl?.trim()) {
      throw new BadRequestException("WordPress URL is required");
    }

    const cleanUrl = this.baseUrl.replace(/\/$/, "");
    const targetUrl = `${cleanUrl}/wp-json/wp/v2/${this.postType}?per_page=100&_embed=1`;

    let response: Response;
    try {
      response = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    } catch (err: any) {
      throw new BadRequestException(
        `Could not reach WordPress feed URL (${targetUrl}): ${err.message || "Request timed out"}`
      );
    }

    if (!response.ok) {
      throw new BadRequestException(`WordPress feed returned HTTP status ${response.status}`);
    }

    let posts: Record<string, any>[];
    try {
      posts = await response.json();
    } catch {
      throw new BadRequestException("WordPress feed did not return valid JSON");
    }

    if (!Array.isArray(posts)) {
      throw new BadRequestException("WordPress feed response is not an array of posts");
    }

    return posts.map((post) => {
      const acf = post.acf ?? {};
      const media = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
      return {
        externalId: String(post.id),
        title: String(post.title?.rendered ?? "Untitled property"),
        address: String(acf.address ?? ""),
        type: String(acf.property_type ?? "Property"),
        price: Number(acf.price ?? 0) || undefined,
        currency: String(acf.currency ?? "NGN"),
        bedrooms: Number(acf.bedrooms ?? 0) || undefined,
        bathrooms: Number(acf.bathrooms ?? 0) || undefined,
        images: media ? [media] : [],
        amenities: Array.isArray(acf.amenities) ? acf.amenities.map(String) : [],
        status: String(acf.status ?? "ACTIVE"),
        sourcePayload: post,
      };
    });
  }
}
