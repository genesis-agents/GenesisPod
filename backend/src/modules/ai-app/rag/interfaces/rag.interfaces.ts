/**
 * RAG Interfaces - Re-export from AI Engine
 *
 * These interfaces have been migrated to AI Engine for cross-module reuse.
 * This file re-exports them for backward compatibility.
 */

// Pipeline-specific types
export {
  RAGQuery,
  RAGOptions,
  RAGResponse,
  RAGContext,
  ContextSource,
  SearchResult,
  HybridSearchParams,
  ProcessedDocument,
  DocumentMetadata,
  KnowledgeBaseStats,
  SyncResult,
  GoogleDriveFile,
} from "../../../ai-engine/rag/pipeline/rag-pipeline.interfaces";

// Embedding types (moved from pipeline to avoid duplicate exports)
export {
  EmbeddingResult,
  EmbeddingBatch,
} from "../../../ai-engine/rag/embedding";

// Shared types from chunking (already exported by ai-engine/rag)
export {
  ChunkingConfig,
  DEFAULT_CHUNKING_CONFIG,
  ChildChunkData,
  ParentChunkData,
} from "../../../ai-engine/rag/chunking";
