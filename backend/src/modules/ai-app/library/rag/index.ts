/**
 * RAG Module Exports
 *
 * 核心能力从 AI Engine 重新导出
 * 业务服务从本模块导出
 */

export * from "./rag.module";

// 从 AI Engine Facade 重新导出核心能力 (向后兼容)
export {
  EmbeddingService,
  EmbeddingResult,
  EmbeddingBatch,
  VectorService,
  SimilaritySearchOptions,
  SimilarityResult,
  VectorSearchResult,
  DocumentChunker,
  DEFAULT_CHUNKING_CONFIG,
  ChildChunkData,
  ParentChunkData,
  ChunkedDocument,
} from "../../../ai-engine/facade";
export type {
  EmbeddingModelConfig,
  ChunkingConfig,
} from "../../../ai-engine/facade";

// 业务服务
export * from "./services/document-processor.service";
export * from "./services/embedding-processor.service";
export * from "./services/rag-pipeline.service";
export * from "./services/knowledge-base.service";
export * from "./services/google-drive-rag.service";

// 接口和 DTO
export * from "./interfaces/rag.interfaces";
export * from "./dto";
