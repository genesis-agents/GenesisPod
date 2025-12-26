'use client';

import { useState, useCallback } from 'react';
import { useApiGet, useApiPost, useApiMutation } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';

/**
 * Knowledge Base 类型定义
 */
export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  sourceType: 'GOOGLE_DRIVE' | 'MANUAL' | 'URL';
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'UPDATING' | 'ERROR';
  googleDriveConnectionId?: string;
  googleDriveFolderIds?: string[];
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
  };
}

export interface KnowledgeBaseStats {
  documentCount: number;
  parentChunkCount: number;
  childChunkCount: number;
  totalTokens: number;
  lastSyncedAt?: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  title: string;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
  mimeType?: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';
  processedAt?: string;
  chunkCount: number;
  lastError?: string;
  createdAt: string;
}

export interface CreateKnowledgeBaseDto {
  name: string;
  description?: string;
  sourceType: 'GOOGLE_DRIVE' | 'MANUAL' | 'URL';
  googleDriveConnectionId?: string;
  googleDriveFolderIds?: string[];
}

export interface AddDocumentDto {
  title: string;
  content: string;
  sourceType?: string;
  sourceUrl?: string;
  mimeType?: string;
}

export interface RAGQueryResult {
  context: {
    text: string;
    sources: Array<{
      documentId: string;
      documentTitle: string;
      chunkId: string;
      excerpt: string;
      score: number;
      pageStart?: number;
      pageEnd?: number;
      sectionTitle?: string;
    }>;
    totalTokens: number;
  };
  hydeQuery?: string;
  searchResults: Array<{
    childChunkId: string;
    parentChunkId: string;
    documentId: string;
    content: string;
    parentContent: string;
    score: number;
  }>;
  processingTime: {
    hyde?: number;
    search: number;
    rerank?: number;
    total: number;
  };
}

/**
 * Knowledge Base 管理 Hook
 */
export function useKnowledgeBase() {
  const [deleting, setDeleting] = useState(false);

  // 获取知识库列表
  const {
    data: knowledgeBases,
    loading: listLoading,
    error: listError,
    execute: fetchList,
  } = useApiGet<KnowledgeBase[]>('/rag/knowledge-bases', {
    immediate: true,
  });

  // 创建知识库
  const { execute: createKnowledgeBase, loading: creating } = useApiPost<
    KnowledgeBase,
    CreateKnowledgeBaseDto
  >('/rag/knowledge-bases');

  // 删除知识库 - 使用 apiClient 直接调用
  const deleteKnowledgeBase = useCallback(
    async (id: string) => {
      setDeleting(true);
      try {
        await apiClient.delete(`/rag/knowledge-bases/${id}`);
        await fetchList();
      } finally {
        setDeleting(false);
      }
    },
    [fetchList]
  );

  return {
    knowledgeBases: knowledgeBases || [],
    loading: listLoading,
    error: listError,
    creating,
    deleting,
    fetchList,
    refreshList: fetchList,
    createKnowledgeBase: async (dto: CreateKnowledgeBaseDto) => {
      const result = await createKnowledgeBase(dto);
      await fetchList();
      return result;
    },
    deleteKnowledgeBase,
  };
}

/**
 * 单个知识库详情 Hook
 */
export function useKnowledgeBaseDetail(id: string | null) {
  // 获取知识库详情 - 只在有 id 时请求
  const {
    data: knowledgeBase,
    loading,
    error,
    execute: refresh,
  } = useApiGet<KnowledgeBase>(`/rag/knowledge-bases/${id || 'placeholder'}`, {
    immediate: !!id,
  });

  // 获取统计信息
  const {
    data: stats,
    loading: statsLoading,
    execute: fetchStats,
  } = useApiGet<KnowledgeBaseStats>(
    `/rag/knowledge-bases/${id || 'placeholder'}/stats`,
    { immediate: !!id }
  );

  // 更新知识库
  const { execute: updateKnowledgeBase, loading: updating } = useApiMutation<
    KnowledgeBase,
    Partial<CreateKnowledgeBaseDto>
  >('patch', `/rag/knowledge-bases/${id || 'placeholder'}`);

  // 处理文档
  const { execute: processDocuments, loading: processing } = useApiPost<
    { processed: number },
    Record<string, never>
  >(`/rag/knowledge-bases/${id || 'placeholder'}/process`);

  // 同步 Google Drive
  const { execute: syncGoogleDrive, loading: syncing } = useApiPost<
    {
      added: number;
      updated: number;
      deleted: number;
      errors: string[];
    },
    Record<string, never>
  >(`/rag/knowledge-bases/${id || 'placeholder'}/sync`);

  // 添加文档
  const { execute: addDocument, loading: addingDocument } = useApiPost<
    KnowledgeBaseDocument,
    AddDocumentDto
  >(`/rag/knowledge-bases/${id || 'placeholder'}/documents`);

  return {
    knowledgeBase: id ? knowledgeBase : undefined,
    stats: id ? stats : undefined,
    loading: id ? loading || statsLoading : false,
    updating,
    processing,
    syncing,
    addingDocument,
    error: id ? error : null,
    refresh,
    fetchStats,
    updateKnowledgeBase: async (data: Partial<CreateKnowledgeBaseDto>) => {
      if (!id) return undefined;
      const result = await updateKnowledgeBase(data);
      await refresh();
      return result;
    },
    processDocuments: async () => {
      if (!id) return undefined;
      const result = await processDocuments({} as Record<string, never>);
      await refresh();
      await fetchStats();
      return result;
    },
    syncGoogleDrive: async () => {
      if (!id) return undefined;
      const result = await syncGoogleDrive({} as Record<string, never>);
      await refresh();
      await fetchStats();
      return result;
    },
    addDocument: async (doc: AddDocumentDto) => {
      if (!id) return undefined;
      const result = await addDocument(doc);
      await refresh();
      await fetchStats();
      return result;
    },
  };
}

/**
 * RAG 查询 Hook
 */
export function useRAGQuery() {
  const [result, setResult] = useState<RAGQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const query = useCallback(
    async (
      queryText: string,
      knowledgeBaseIds: string[],
      options?: {
        topK?: number;
        useHyde?: boolean;
        useRerank?: boolean;
        hybridAlpha?: number;
        minScore?: number;
      }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.post<RAGQueryResult>('/rag/query', {
          query: queryText,
          knowledgeBaseIds,
          ...options,
        });
        setResult(data);
        return data;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    query,
    reset,
  };
}
