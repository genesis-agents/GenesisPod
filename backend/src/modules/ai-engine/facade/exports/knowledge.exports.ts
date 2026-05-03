/**
 * Knowledge & RAG exports
 */
export type { SaveEvidenceRequest } from "../../knowledge/evidence/abstractions/evidence.interface";
export type { EmbeddingResult } from "@/modules/ai-engine/rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "@/modules/ai-engine/rag/vector/vector.service";
export { EmbeddingService } from "@/modules/ai-engine/rag/embedding";
export type {
  EmbeddingModelConfig,
  EmbeddingBatch,
} from "@/modules/ai-engine/rag/embedding";
export { VectorService } from "@/modules/ai-engine/rag/vector";
export type { VectorSearchResult } from "@/modules/ai-engine/rag/vector";
export { DocumentChunker } from "@/modules/ai-engine/rag/chunking";
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "@/modules/ai-engine/rag/chunking";
export { DEFAULT_CHUNKING_CONFIG } from "@/modules/ai-engine/rag/chunking";
export { RAGPipelineService } from "@/modules/ai-engine/rag/pipeline";
export type {
  RAGQuery,
  RAGOptions,
  RAGResponse,
  RAGContext,
  SearchResult,
  HybridSearchParams,
  ProcessedDocument,
  DocumentMetadata,
  KnowledgeBaseStats,
  SyncResult,
  GoogleDriveFile,
} from "@/modules/ai-engine/rag/pipeline/rag-pipeline.interface";
export { SearchService } from "../../knowledge/search/search.service";
