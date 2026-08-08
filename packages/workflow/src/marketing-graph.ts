import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

export type ListingEvent = "LISTING_CREATED" | "LISTING_UPDATED" | "PRICE_CHANGED" | "MEDIA_UPDATED" | "LISTING_SOLD";
export const MarketingState = Annotation.Root({
  tenantId: Annotation<string>, propertyId: Annotation<string>, event: Annotation<ListingEvent>,
  property: Annotation<Record<string, unknown>>, brandProfile: Annotation<Record<string, unknown>>,
  analysis: Annotation<Record<string, unknown>>, strategy: Annotation<Record<string, unknown>>,
  assets: Annotation<Array<{ kind: string; body: string }>>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  requiresApproval: Annotation<boolean>({ value: (_current, next) => next, default: () => true }), errors: Annotation<string[]>({ reducer: (a,b) => [...a,...b], default: () => [] }),
});

export type Agent = (state: typeof MarketingState.State) => Promise<Partial<typeof MarketingState.State>>;
export function createMarketingGraph(agents: { analyze: Agent; strategy: Agent; brand: Agent; video: Agent; voiceover: Agent; seo: Agent; approval: Agent; publish: Agent }) {
  return new StateGraph(MarketingState)
    .addNode("analyze", agents.analyze).addNode("strategy", agents.strategy).addNode("brand", agents.brand)
    .addNode("video", agents.video).addNode("voiceover", agents.voiceover).addNode("seo", agents.seo)
    .addNode("approval", agents.approval).addNode("publish", agents.publish)
    .addEdge(START, "analyze").addEdge("analyze", "strategy").addEdge("strategy", "brand")
    .addEdge("brand", "video").addEdge("video", "voiceover").addEdge("voiceover", "seo")
    .addEdge("seo", "approval")
    .addConditionalEdges("approval", state => state.requiresApproval ? END : "publish")
    .addEdge("publish", END).compile();
}
