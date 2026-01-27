/**
 * 研究反馈闭环 Hooks
 */

import { useApiGet, useApiPost, useApiMutation, useApiDelete } from '../core';
import { apiClient } from '@/lib/api/client';
import { useState, useCallback } from 'react';
import type {
  ResearchFeedbackItem,
  ResearchFeedbackKnowledge,
  FeedbackStats,
  FeedbackCluster,
  PaginatedResponse,
  CreateFeedbackDto,
  UpdateFeedbackDto,
  FeedbackQueryParams,
  CreateKnowledgeDto,
  UpdateKnowledgeDto,
  AIAnalysisResult,
  ResearchFeedbackItemStatus,
  ResearchFeedbackCategory,
  FeedbackPriority,
  ImprovementType,
} from '@/lib/api/research-feedback';

// ==================== 反馈管理 Hooks ====================

/**
 * 获取反馈列表
 * @param params 查询参数
 * @param options.enabled 是否启用请求（默认 true），用于条件加载
 */
export function useFeedbackItems(
  params?: FeedbackQueryParams,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
  }
  const query = searchParams.toString();

  return useApiGet<PaginatedResponse<ResearchFeedbackItem>>(
    `/api/v1/feedback${query ? `?${query}` : ''}`,
    {
      immediate: enabled,
      cacheKey: enabled ? `feedback-items-${query}` : undefined,
      cacheTTL: 30 * 1000, // 30 秒
    }
  );
}

/**
 * 获取单个反馈详情
 */
export function useFeedbackItem(id: string | undefined) {
  return useApiGet<ResearchFeedbackItem>(id ? `/api/v1/feedback/${id}` : '', {
    immediate: !!id,
    cacheKey: id ? `feedback-item-${id}` : undefined,
  });
}

/**
 * 创建反馈
 */
export function useCreateFeedback() {
  return useApiPost<ResearchFeedbackItem, CreateFeedbackDto>(
    '/api/v1/feedback'
  );
}

/**
 * 从批注创建反馈
 */
export function useCreateFeedbackFromAnnotation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (annotationId: string, additionalNotes?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.post<ResearchFeedbackItem>(
          `/api/v1/feedback/from-annotation/${annotationId}`,
          { additionalNotes }
        );
        return result;
      } catch (err) {
        setError(err as Error);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { execute, loading, error };
}

/**
 * 更新反馈
 */
export function useUpdateFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (id: string, dto: UpdateFeedbackDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.patch<ResearchFeedbackItem>(
        `/api/v1/feedback/${id}`,
        dto
      );
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * 删除反馈
 */
export function useDeleteFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.delete<{ success: boolean }>(
        `/api/v1/feedback/${id}`
      );
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * AI 分析反馈
 */
export function useAnalyzeFeedback() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.post<AIAnalysisResult>(
        `/api/v1/feedback/${id}/analyze`,
        {}
      );
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * 聚类相似反馈
 */
export function useClusterFeedback(params?: {
  topicId?: string;
  minItems?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.topicId) searchParams.set('topicId', params.topicId);
  if (params?.minItems) searchParams.set('minItems', String(params.minItems));
  const query = searchParams.toString();

  return useApiGet<FeedbackCluster[]>(
    `/api/v1/feedback/clusters/similar${query ? `?${query}` : ''}`,
    { immediate: false }
  );
}

// ==================== 仪表板 Hooks ====================

/**
 * 获取仪表板统计
 */
export function useFeedbackStats() {
  return useApiGet<FeedbackStats>('/api/v1/feedback/dashboard/stats', {
    immediate: true,
    cacheKey: 'feedback-stats',
    cacheTTL: 60 * 1000, // 1 分钟
  });
}

/**
 * 获取待审核列表
 */
/**
 * 获取待审核列表
 * @param page 页码
 * @param limit 每页数量
 * @param options.enabled 是否启用请求（默认 true），用于条件加载
 */
export function usePendingReview(
  page = 1,
  limit = 20,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  return useApiGet<PaginatedResponse<ResearchFeedbackItem>>(
    `/api/v1/feedback/dashboard/pending?page=${page}&limit=${limit}`,
    {
      immediate: enabled,
      cacheKey: enabled ? `pending-review-${page}-${limit}` : undefined,
      cacheTTL: 30 * 1000,
    }
  );
}

/**
 * 获取改进追踪
 */
export function useImprovementTracking() {
  return useApiGet<{
    applied: number;
    pending: number;
    avgEffectScore: number;
    recentImprovements: Array<{
      id: string;
      title: string;
      improvementType: ImprovementType;
      appliedAt: string | null;
      effectScore: number | null;
    }>;
  }>('/api/v1/feedback/dashboard/tracking', {
    immediate: true,
    cacheKey: 'improvement-tracking',
    cacheTTL: 60 * 1000,
  });
}

/**
 * 获取高优先级反馈
 */
export function useHighPriorityFeedback(limit = 5) {
  return useApiGet<ResearchFeedbackItem[]>(
    `/api/v1/feedback/dashboard/high-priority?limit=${limit}`,
    {
      immediate: true,
      cacheKey: `high-priority-${limit}`,
      cacheTTL: 30 * 1000,
    }
  );
}

/**
 * 获取专题反馈统计
 */
export function useTopicFeedbackStats(topicId: string | undefined) {
  return useApiGet<{
    total: number;
    resolved: number;
    resolutionRate: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  }>(topicId ? `/api/v1/feedback/dashboard/topic/${topicId}` : '', {
    immediate: !!topicId,
    cacheKey: topicId ? `topic-feedback-stats-${topicId}` : undefined,
  });
}

// ==================== 知识沉淀 Hooks ====================

/**
 * 获取知识列表
 */
export function useKnowledgeItems(params?: {
  improvementType?: ImprovementType;
  tags?: string[];
  applied?: boolean;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, v));
        } else {
          searchParams.set(key, String(value));
        }
      }
    });
  }
  const query = searchParams.toString();

  return useApiGet<PaginatedResponse<ResearchFeedbackKnowledge>>(
    `/api/v1/feedback/knowledge${query ? `?${query}` : ''}`,
    {
      immediate: true,
      cacheKey: `knowledge-items-${query}`,
      cacheTTL: 30 * 1000,
    }
  );
}

/**
 * 获取知识详情
 */
export function useKnowledgeItem(id: string | undefined) {
  return useApiGet<ResearchFeedbackKnowledge>(
    id ? `/api/v1/feedback/knowledge/${id}` : '',
    {
      immediate: !!id,
      cacheKey: id ? `knowledge-item-${id}` : undefined,
    }
  );
}

/**
 * 创建知识条目
 */
export function useCreateKnowledge() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (feedbackId: string, dto: CreateKnowledgeDto) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.post<ResearchFeedbackKnowledge>(
          `/api/v1/feedback/${feedbackId}/knowledge`,
          dto
        );
        return result;
      } catch (err) {
        setError(err as Error);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { execute, loading, error };
}

/**
 * AI 提取知识建议
 */
export function useExtractKnowledge() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (feedbackId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.post<{
        shouldExtract: boolean;
        suggestion: CreateKnowledgeDto | null;
      }>(`/api/v1/feedback/${feedbackId}/extract-knowledge`, {});
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * 更新知识条目
 */
export function useUpdateKnowledge() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (id: string, dto: UpdateKnowledgeDto) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.patch<ResearchFeedbackKnowledge>(
        `/api/v1/feedback/knowledge/${id}`,
        dto
      );
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * 应用改进
 */
export function useApplyImprovement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.post<{ success: boolean }>(
        `/api/v1/feedback/knowledge/${id}/apply`,
        {}
      );
      return result;
    } catch (err) {
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading, error };
}

/**
 * 评估效果
 */
export function useEvaluateEffect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (id: string, effectScore: number, effectNotes?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.post<ResearchFeedbackKnowledge>(
          `/api/v1/feedback/knowledge/${id}/evaluate`,
          { effectScore, effectNotes }
        );
        return result;
      } catch (err) {
        setError(err as Error);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { execute, loading, error };
}

// ==================== 类型导出 ====================

export type {
  ResearchFeedbackItem,
  ResearchFeedbackKnowledge,
  FeedbackStats,
  FeedbackCluster,
  AIAnalysisResult,
  ResearchFeedbackItemStatus,
  ResearchFeedbackCategory,
  FeedbackPriority,
  ImprovementType,
  CreateFeedbackDto,
  UpdateFeedbackDto,
  CreateKnowledgeDto,
  UpdateKnowledgeDto,
};
