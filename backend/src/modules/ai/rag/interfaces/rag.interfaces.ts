/**
 * RAG (Retrieval-Augmented Generation) Interfaces
 * Defines types for the 5-stage RAG pipeline
 */

// ==================== Query & Response ====================

export interface RAGQuery {
  query: string;
  knowledgeBaseIds: string[];
  options?: RAGOptions;
}

export interface RAGOptions {
  topK?: number; // Number of results to retrieve (default: 10)
  useHyde?: boolean; // Use HyDE query enhancement (default: true)
  useRerank?: boolean; // Use Cohere reranking (default: true)
  hybridAlpha?: number; // Balance between vector/keyword (0-1, default: 0.5)
  minScore?: number; // Minimum relevance score (default: 0.3)
  includeMetadata?: boolean; // Include document metadata (default: true)
}

export interface RAGResponse {
  context: RAGContext;
  hydeQuery?: string;
  searchResults: SearchResult[];
  processingTime: {
    hyde?: number;
    search: number;
    rerank?: number;
    total: number;
  };
}

export interface RAGContext {
  text: string;
  sources: ContextSource[];
  totalTokens: number;
}

export interface ContextSource {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  excerpt: string;
  score: number;
  pageStart?: number;
  pageEnd?: number;
  sectionTitle?: string;
  metadata?: Record<string, any>;
}

// ==================== Search ====================

export interface SearchResult {
  childChunkId: string;
  parentChunkId: string;
  documentId: string;
  content: string;
  parentContent: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  rerankScore?: number;
  metadata?: Record<string, any>;
}

export interface HybridSearchParams {
  queryEmbedding: number[];
  queryText: string;
  knowledgeBaseIds: string[];
  topK: number;
  alpha: number; // 0 = keyword only, 1 = vector only
}

// ==================== Document Processing ====================

export interface ProcessedDocument {
  documentId: string;
  title: string;
  parentChunks: ParentChunkData[];
  metadata: DocumentMetadata;
}

export interface ParentChunkData {
  id: string;
  content: string;
  tokenCount: number;
  position: number;
  pageStart?: number;
  pageEnd?: number;
  sectionTitle?: string;
  metadata?: Record<string, any>;
  childChunks: ChildChunkData[];
}

export interface ChildChunkData {
  id: string;
  content: string;
  tokenCount: number;
  position: number;
  parentPosition: number;
  documentId?: string;
}

export interface DocumentMetadata {
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  mimeType?: string;
  fileSize?: number;
  processedAt: Date;
}

// ==================== Chunking Configuration ====================

export interface ChunkingConfig {
  parentChunkSize: number; // Target tokens for parent chunks (default: 2000)
  parentChunkOverlap: number; // Overlap tokens for parent chunks (default: 200)
  childChunkSize: number; // Target tokens for child chunks (default: 400)
  childChunkOverlap: number; // Overlap tokens for child chunks (default: 50)
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  parentChunkSize: 2000,
  parentChunkOverlap: 200,
  childChunkSize: 400,
  childChunkOverlap: 50,
};

// ==================== Embeddings ====================

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

export interface EmbeddingBatch {
  texts: string[];
  embeddings: number[][];
  totalTokens: number;
}

// ==================== Knowledge Base ====================

export interface KnowledgeBaseStats {
  documentCount: number;
  parentChunkCount: number;
  childChunkCount: number;
  embeddingCount: number;
  totalTokens: number;
  lastSyncedAt?: Date;
}

// ==================== Sync ====================

export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
}
