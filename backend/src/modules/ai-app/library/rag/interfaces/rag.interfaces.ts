/**
 * RAG Interfaces - Re-export from AI Engine
 *
 * These interfaces have been migrated to AI Engine for cross-module reuse.
 * This file re-exports them for backward compatibility.
 */

// Pipeline-specific types
export type {
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
} from "../../../../ai-engine/facade";

// Embedding types (moved from pipeline to avoid duplicate exports)
export type {
  EmbeddingResult,
  EmbeddingBatch,
} from "../../../../ai-engine/facade";

// Shared types from chunking (already exported by ai-engine/rag)
export type {
  ChunkingConfig,
  ChildChunkData,
  ParentChunkData,
} from "../../../../ai-engine/facade";
export { DEFAULT_CHUNKING_CONFIG } from "../../../../ai-engine/facade";
