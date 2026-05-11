/**
 * KB Query Augmentor — Dependency Inversion port (PR-Wiki-Aug 2026-05-10)
 *
 * Lets ai-engine consumers (such as the `rag-search` tool used by L3 AI
 * apps that need internal-knowledge retrieval) optionally upgrade a plain
 * RAG query into a wiki-aware query without taking a source-code
 * dependency on `ai-app/library/kb-query`. The implementation lives in
 * ai-app (KbQueryService); the port lives here in ai-engine so the layer
 * direction stays L3 → L2 only.
 *
 * Same Dependency Inversion pattern as `engine-skill-provider.adapter.ts`
 * — already an allowlisted reverse-import in
 * `__tests__/architecture/layer-boundaries.spec.ts`.
 *
 * Contract: same shape as `RAGPipelineService.simpleQuery` so the tool
 * can swap the call destination 1:1 — `searchService.simpleQuery(...)`.
 * The augmentor itself decides whether to use wiki / chunk RAG / merge
 * — the consumer doesn't care.
 */

import type { SearchResult } from "../pipeline/rag-pipeline.interface";

export interface IKbQueryAugmentor {
  simpleQuery(
    query: string,
    knowledgeBaseIds: string[],
    topK?: number,
  ): Promise<SearchResult[]>;
}

/**
 * NestJS DI token. KbQueryModule (ai-app/library/kb-query) registers
 * KbQueryService against this token via `useExisting` and exports it as a
 * `@Global()` provider so the rag-search tool sees it everywhere without
 * an explicit module import.
 */
export const KB_QUERY_AUGMENTOR = Symbol("KB_QUERY_AUGMENTOR");
