import OpenAI from "openai";
import { Agent, MarketingState } from "./marketing-graph.js";

type JsonSchema = Record<string, unknown>;
type Provider = "openai" | "gemini" | "xai" | "groq";
const propertySchema: JsonSchema = { type: "object", additionalProperties: false, properties: { classification: { type: "string" }, luxuryScore: { type: "number" }, investmentScore: { type: "number" }, audience: { type: "array", items: { type: "string" } }, angles: { type: "array", items: { type: "string" } } }, required: ["classification", "luxuryScore", "investmentScore", "audience", "angles"] };
const strategySchema: JsonSchema = { type: "object", additionalProperties: false, properties: { headline: { type: "string" }, hook: { type: "string" }, targetAudience: { type: "array", items: { type: "string" } }, searchIntent: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, cta: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, captions: { type: "array", items: { type: "object", additionalProperties: false, properties: { platform: { type: "string" }, body: { type: "string" } }, required: ["platform", "body"] } } }, required: ["headline", "hook", "targetAudience", "searchIntent", "keywords", "cta", "hashtags", "captions"] };
const videoSchema: JsonSchema = { type: "object", additionalProperties: false, properties: { higgsfieldPrompt: { type: "string" }, durationSeconds: { type: "number" }, aspectRatio: { type: "string" }, scenes: { type: "array", items: { type: "string" } } }, required: ["higgsfieldPrompt", "durationSeconds", "aspectRatio", "scenes"] };
const seoSchema: JsonSchema = { type: "object", additionalProperties: false, properties: { metaTitle: { type: "string" }, metaDescription: { type: "string" }, keywords: { type: "array", items: { type: "string" } }, jsonLd: { type: "object" } }, required: ["metaTitle", "metaDescription", "keywords", "jsonLd"] };

function providers(): Provider[] {
  const selected = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  const available: Provider[] = ["openai", "gemini", "xai", "groq"].filter(provider => ({ openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY, xai: process.env.XAI_API_KEY, groq: process.env.GROQ_API_KEY }[provider])) as Provider[];
  if (selected !== "auto" && available.includes(selected as Provider)) return [selected as Provider, ...available.filter(provider => provider !== selected)];
  return available;
}

const contentPolicy = `All output must target qualified property buyers, investors, or other high-intent prospects. Use research-led location, property-type, investment, and transaction keywords from the supplied evidence; clearly identify the search intent. Make the creative catchy and memorable with a strong opening hook, human emotion, vivid but truthful language, and a platform-appropriate rhythm. If a promotionBrief exists in the brand profile, make it a central campaign angle and preserve its eligibility, reward, dates, and call to action exactly. Always include a useful reason to act and a specific conversion CTA (inquiry, viewing, valuation, referral, or investment consultation). Never use clickbait, generic filler, unsupported returns, invented amenities, or claims that are not present in the listing, promotion brief, or brand data.`;

function prompt(instruction: string, state: typeof MarketingState.State) { return `${instruction}\n\n${contentPolicy}\n\nNever invent property facts. Respect the supplied brand rules. Return only the requested JSON.\n\nSTATE:\n${JSON.stringify(state)}`; }

async function openai(name: string, schema: JsonSchema, input: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.create({ model: process.env.OPENAI_MARKETING_MODEL ?? "gpt-5.6-luna", reasoning: { effort: "low" }, input, text: { format: { type: "json_schema", name, strict: true, schema } } } as any);
  if (!response.output_text) throw new Error(`${name} returned no structured output`);
  return JSON.parse(response.output_text) as Record<string, any>;
}

async function gemini(schema: JsonSchema, input: string) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: input }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema } }) });
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const output = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!output) throw new Error("Gemini returned no structured output");
  return JSON.parse(output) as Record<string, any>;
}

async function compatible(provider: "xai" | "groq", name: string, schema: JsonSchema, input: string) {
  const apiKey = provider === "xai" ? process.env.XAI_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
  const baseURL = provider === "xai" ? "https://api.x.ai/v1" : "https://api.groq.com/openai/v1";
  const model = provider === "xai" ? process.env.XAI_MODEL : process.env.GROQ_MODEL;
  if (!model) throw new Error(`${provider === "xai" ? "XAI_MODEL" : "GROQ_MODEL"} is required when ${provider} is enabled`);
  const response = await new OpenAI({ apiKey, baseURL }).chat.completions.create({ model, messages: [{ role: "user", content: input }], response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } } as any);
  const output = response.choices?.[0]?.message?.content;
  if (!output) throw new Error(`${provider} returned no structured output`);
  return JSON.parse(output) as Record<string, any>;
}

async function generate(name: string, schema: JsonSchema, instruction: string, state: typeof MarketingState.State) {
  const errors: string[] = [];
  for (const provider of providers()) {
    try { const input = prompt(instruction, state); return provider === "openai" ? await openai(name, schema, input) : provider === "gemini" ? await gemini(schema, input) : await compatible(provider, name, schema, input); }
    catch (error) { errors.push(`${provider}: ${error instanceof Error ? error.message : "generation failed"}`); }
  }
  throw new Error(`No AI provider completed ${name}. ${errors.join(" | ")}`);
}

export function createMarketingAgents(): { analyze: Agent; strategy: Agent; brand: Agent; video: Agent; voiceover: Agent; seo: Agent; approval: Agent; publish: Agent } {
  return {
    analyze: async state => ({ analysis: await generate("property_analysis", propertySchema, "You are the Property Analysis Agent. Classify the listing, score luxury and investment potential from evidence, and identify audiences and defensible angles.", state) }),
    strategy: async state => { const strategy = await generate("content_strategy", strategySchema, "You are the Content Strategy Agent. First infer the highest-intent buyer/investor audience and search intent from the listing and available research context. Then produce platform-specific, concise, catchy marketing copy, a hook, researched keywords, CTA and hashtags for Instagram, Facebook, LinkedIn, X and Threads.", state); return { strategy, assets: strategy.captions.map((item: any) => ({ kind: item.platform, body: item.body })) }; },
    brand: async () => ({ assets: [{ kind: "brand-review", body: "Brand rules applied: tone, forbidden words, CTA, and luxury level." }] }),
    video: async state => { const video = await generate("video_direction", videoSchema, "You are the Video Director Agent. Create a cinematic yet factual Higgsfield prompt with camera directions, scene order and premium but realistic typography guidance.", state); return { assets: [{ kind: "higgsfield-brief", body: JSON.stringify(video) }] }; },
    voiceover: async state => ({ assets: [{ kind: "voiceover-brief", body: `Create a warm, elegant narration and subtitles grounded only in this property data: ${JSON.stringify(state.property)}` }] }),
    seo: async state => { const seo = await generate("seo_package", seoSchema, "You are the SEO Agent. Produce property SEO metadata and high-intent buyer/investor keywords grounded in the listing and available research context, plus Schema.org JSON-LD. Prioritize local and transaction-ready search intent. Do not claim facts absent from the listing.", state); return { assets: [{ kind: "seo", body: JSON.stringify(seo) }] }; },
    approval: async () => ({ requiresApproval: true }),
    publish: async () => ({ assets: [{ kind: "publish-intent", body: "Eligible only after a recorded human approval." }] }),
  };
}

export const createOpenAIMarketingAgents = createMarketingAgents;
