/**
 * Knowledge & RAG exports
 */
export type { SaveEvidenceRequest } from "../../knowledge/evidence/abstractions/evidence.interface";
export type { EmbeddingResult } from "../../knowledge/rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../../knowledge/rag/vector/vector.service";
export { EmbeddingService } from "../../knowledge/rag/embedding";
export type {
  EmbeddingModelConfig,
  EmbeddingBatch,
} from "../../knowledge/rag/embedding";
export { VectorService } from "../../knowledge/rag/vector";
export type { VectorSearchResult } from "../../knowledge/rag/vector";
export { DocumentChunker } from "../../knowledge/rag/chunking";
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "../../knowledge/rag/chunking";
export { DEFAULT_CHUNKING_CONFIG } from "../../knowledge/rag/chunking";
export { RAGPipelineService } from "../../knowledge/rag/pipeline";
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
} from "../../knowledge/rag/pipeline/rag-pipeline.interfaces";
export { SearchService } from "../../knowledge/search/search.service";
