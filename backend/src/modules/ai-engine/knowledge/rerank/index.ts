/**
 * ai-harness/governance/rerank —— LLM Reranker (沉淀自 {app}, 2026-04-29)
 *
 * RAG 两阶段检索的第二阶段：对 fusion 后的候选集做 LLM 精排。
 * Generic over T extends RerankableItem，让任意 ai-app 的 retrieval item 类型可用。
 *
 * 落 ai-harness/governance/ 而非 ai-engine/knowledge/ —— 因为它依赖 ChatFacade
 * 走 BillingContext + 用户 BYOK key 路径。ai-engine 不允许反向 import ai-harness。
 *
 * TI 仍在使用 ai-app/{app}/services/search/rerank/。
 */

export { LlmRerankerAdapter } from "./llm-reranker.adapter";
export {
  type RerankableItem,
  type RerankCandidate,
  type RerankedItem,
  type RerankResult,
  type RerankRequest,
  type RerankAdapter,
  type RerankConfig,
  DEFAULT_RERANK_CONFIG,
} from "./rerank.types";
