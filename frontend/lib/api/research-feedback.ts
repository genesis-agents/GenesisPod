/**
 * 研究反馈闭环 API
 */

import { apiClient } from './client';

// ==================== 类型定义 ====================

export type ResearchFeedbackSource = 'REPORT_ANNOTATION' | 'MANUAL' | 'SYSTEM';

export type ResearchFeedbackCategory =
  | 'QUALITY_ISSUE'
  | 'CONTENT_ERROR'
  | 'FEATURE_REQUEST'
  | 'IMPROVEMENT'
  | 'POSITIVE';

export type ResearchFeedbackItemStatus =
  | 'PENDING'
  | 'ANALYZING'
  | 'REVIEWING'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'CLOSED';

export type FeedbackPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type ImprovementType =
  | 'PROMPT_UPDATE'
  | 'STRATEGY_CHANGE'
  | 'QUALITY_RULE'
  | 'DOCUMENTATION';

export interface ResearchFeedbackItem {
  id: string;
  sourceType: ResearchFeedbackSource;
  sourceId?: string;
  content: string;
  selectedText?: string;
  category?: ResearchFeedbackCategory;
  subcategory?: string;
  priority: FeedbackPriority;
  aiAnalysis?: AIAnalysisResult;
  status: ResearchFeedbackItemStatus;
  assignedTo?: string;
  knowledgeItemId?: string;
  actionTaken?: string;
  topicId?: string;
  reportId?: string;
  sectionId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  user?: {
    id: string;
    username?: string;
    fullName?: string;
    avatarUrl?: string;
  };
  topic?: {
    id: string;
    name: string;
  };
  report?: {
    id: string;
    version: number;
  };
  assignee?: {
    id: string;
    username?: string;
    fullName?: string;
  };
  knowledgeItem?: ResearchFeedbackKnowledge;
}

export interface AIAnalysisResult {
  summary: string;
  rootCause: string;
  suggestedAction: string;
  confidence: number;
  relatedFeedback?: string[];
  improvementSuggestions?: string[];
}

export interface ResearchFeedbackKnowledge {
  id: string;
  feedbackItemId: string;
  title: string;
  content: string;
  tags: string[];
  improvementType: ImprovementType;
  improvementData?: Record<string, unknown>;
  appliedAt?: string;
  effectScore?: number;
  effectNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackStats {
  total: number;
  byCategory: Record<ResearchFeedbackCategory, number>;
  byStatus: Record<ResearchFeedbackItemStatus, number>;
  byPriority: Record<FeedbackPriority, number>;
  recentTrend: { date: string; count: number }[];
}

export interface FeedbackCluster {
  clusterId: string;
  theme: string;
  feedbackIds: string[];
  count: number;
  priority: FeedbackPriority;
  suggestedCategory: ResearchFeedbackCategory;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==================== 反馈管理 API ====================

export interface CreateFeedbackDto {
  content: string;
  selectedText?: string;
  sourceType?: ResearchFeedbackSource;
  sourceId?: string;
  topicId?: string;
  reportId?: string;
  sectionId?: string;
  category?: ResearchFeedbackCategory;
}

export interface UpdateFeedbackDto {
  content?: string;
  status?: ResearchFeedbackItemStatus;
  category?: ResearchFeedbackCategory;
  subcategory?: string;
  priority?: FeedbackPriority;
  assignedTo?: string;
  actionTaken?: string;
}

export interface FeedbackQueryParams {
  status?: ResearchFeedbackItemStatus;
  category?: ResearchFeedbackCategory;
  priority?: FeedbackPriority;
  topicId?: string;
  reportId?: string;
  assignedTo?: string;
  page?: number;
  limit?: number;
}

/**
 * 创建反馈
 */
export async function createFeedback(
  dto: CreateFeedbackDto
): Promise<ResearchFeedbackItem> {
  return apiClient.post('/api/v1/feedback', dto);
}

/**
 * 从批注创建反馈
 */
export async function createFeedbackFromAnnotation(
  annotationId: string,
  additionalNotes?: string
): Promise<ResearchFeedbackItem> {
  return apiClient.post(`/api/v1/feedback/from-annotation/${annotationId}`, {
    additionalNotes,
  });
}

/**
 * 获取反馈列表
 */
export async function getFeedbackItems(
  params?: FeedbackQueryParams
): Promise<PaginatedResponse<ResearchFeedbackItem>> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
  }
  const query = searchParams.toString();
  return apiClient.get(`/api/v1/feedback${query ? `?${query}` : ''}`);
}

/**
 * 获取反馈详情
 */
export async function getFeedbackItem(
  id: string
): Promise<ResearchFeedbackItem> {
  return apiClient.get(`/api/v1/feedback/${id}`);
}

/**
 * 更新反馈
 */
export async function updateFeedback(
  id: string,
  dto: UpdateFeedbackDto
): Promise<ResearchFeedbackItem> {
  return apiClient.patch(`/api/v1/feedback/${id}`, dto);
}

/**
 * 删除反馈
 */
export async function deleteFeedback(
  id: string
): Promise<{ success: boolean }> {
  return apiClient.delete(`/api/v1/feedback/${id}`);
}

/**
 * 触发 AI 分析
 */
export async function analyzeFeedback(id: string): Promise<AIAnalysisResult> {
  return apiClient.post(`/api/v1/feedback/${id}/analyze`, {});
}

/**
 * 批量处理待分析反馈
 */
export async function processPendingFeedback(
  limit?: number
): Promise<{ processed: number }> {
  const query = limit ? `?limit=${limit}` : '';
  return apiClient.post(`/api/v1/feedback/process-pending${query}`, {});
}

/**
 * 聚类相似反馈
 */
export async function clusterSimilarFeedback(params?: {
  topicId?: string;
  minItems?: number;
}): Promise<FeedbackCluster[]> {
  const searchParams = new URLSearchParams();
  if (params?.topicId) searchParams.set('topicId', params.topicId);
  if (params?.minItems) searchParams.set('minItems', String(params.minItems));
  const query = searchParams.toString();
  return apiClient.get(
    `/api/v1/feedback/clusters/similar${query ? `?${query}` : ''}`
  );
}

// ==================== 仪表板 API ====================

/**
 * 获取仪表板统计
 */
export async function getFeedbackStats(): Promise<FeedbackStats> {
  return apiClient.get('/api/v1/feedback/dashboard/stats');
}

/**
 * 获取待审核列表
 */
export async function getPendingReview(
  page?: number,
  limit?: number
): Promise<PaginatedResponse<ResearchFeedbackItem>> {
  const searchParams = new URLSearchParams();
  if (page) searchParams.set('page', String(page));
  if (limit) searchParams.set('limit', String(limit));
  const query = searchParams.toString();
  return apiClient.get(
    `/api/v1/feedback/dashboard/pending${query ? `?${query}` : ''}`
  );
}

/**
 * 获取改进追踪
 */
export async function getImprovementTracking(): Promise<{
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
}> {
  return apiClient.get('/api/v1/feedback/dashboard/tracking');
}

/**
 * 获取高优先级反馈
 */
export async function getHighPriorityItems(
  limit?: number
): Promise<ResearchFeedbackItem[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiClient.get(`/api/v1/feedback/dashboard/high-priority${query}`);
}

/**
 * 获取专题反馈统计
 */
export async function getTopicFeedbackStats(topicId: string): Promise<{
  total: number;
  resolved: number;
  resolutionRate: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
}> {
  return apiClient.get(`/api/v1/feedback/dashboard/topic/${topicId}`);
}

// ==================== 知识沉淀 API ====================

export interface CreateKnowledgeDto {
  title: string;
  content: string;
  tags?: string[];
  improvementType: ImprovementType;
  improvementData?: Record<string, unknown>;
}

export interface UpdateKnowledgeDto {
  title?: string;
  content?: string;
  tags?: string[];
  improvementData?: Record<string, unknown>;
}

export interface KnowledgeQueryParams {
  improvementType?: ImprovementType;
  tags?: string[];
  applied?: boolean;
  page?: number;
  limit?: number;
}

/**
 * 创建知识条目
 */
export async function createKnowledge(
  feedbackId: string,
  dto: CreateKnowledgeDto
): Promise<ResearchFeedbackKnowledge> {
  return apiClient.post(`/api/v1/feedback/${feedbackId}/knowledge`, dto);
}

/**
 * AI 自动提取知识
 */
export async function extractKnowledge(feedbackId: string): Promise<{
  shouldExtract: boolean;
  suggestion: CreateKnowledgeDto | null;
}> {
  return apiClient.post(`/api/v1/feedback/${feedbackId}/extract-knowledge`, {});
}

/**
 * 获取知识列表
 */
export async function getKnowledgeItems(
  params?: KnowledgeQueryParams
): Promise<PaginatedResponse<ResearchFeedbackKnowledge>> {
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
  return apiClient.get(`/api/v1/feedback/knowledge${query ? `?${query}` : ''}`);
}

/**
 * 获取知识详情
 */
export async function getKnowledgeItem(
  id: string
): Promise<ResearchFeedbackKnowledge> {
  return apiClient.get(`/api/v1/feedback/knowledge/${id}`);
}

/**
 * 更新知识条目
 */
export async function updateKnowledge(
  id: string,
  dto: UpdateKnowledgeDto
): Promise<ResearchFeedbackKnowledge> {
  return apiClient.patch(`/api/v1/feedback/knowledge/${id}`, dto);
}

/**
 * 应用改进措施
 */
export async function applyImprovement(
  id: string
): Promise<{ success: boolean }> {
  return apiClient.post(`/api/v1/feedback/knowledge/${id}/apply`, {});
}

/**
 * 评估改进效果
 */
export async function evaluateEffect(
  id: string,
  effectScore: number,
  effectNotes?: string
): Promise<ResearchFeedbackKnowledge> {
  return apiClient.post(`/api/v1/feedback/knowledge/${id}/evaluate`, {
    effectScore,
    effectNotes,
  });
}

/**
 * 同步到知识库
 */
export async function syncToKnowledgeBase(
  id: string,
  kbId: string
): Promise<{ success: boolean; message: string }> {
  return apiClient.post(`/api/v1/feedback/knowledge/${id}/sync-kb`, { kbId });
}
