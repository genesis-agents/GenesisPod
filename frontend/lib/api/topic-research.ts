/**
 * Topic Research API Client
 *
 * 专题研究模块的 API 调用
 */

import { getAuthTokens } from '../utils/auth';
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
  TopicEvidence,
  TopicSchedule,
  TopicRefreshLog,
  TopicStats,
  ResearchTemplate,
  RefreshStatusResponse,
  ReportComparisonResult,
  CreateTopicDto,
  UpdateTopicDto,
  ListTopicsDto,
  TriggerRefreshDto,
  AddDimensionDto,
  UpdateDimensionDto,
  ReorderDimensionsDto,
  ListReportsDto,
  ExportReportDto,
  CompareReportsDto,
  ListEvidenceDto,
  UpdateScheduleDto,
  ListLogsDto,
  ResearchTopicType,
} from '@/types/topic-research';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_PREFIX = '/api/v1/topic-research';

/**
 * 带认证的 fetch 封装
 */
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== Topics CRUD ====================

/**
 * 创建专题
 */
export async function createTopic(dto: CreateTopicDto): Promise<ResearchTopic> {
  return fetchWithAuth(`${API_PREFIX}/topics`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * 获取专题列表
 */
export async function getTopics(
  options?: ListTopicsDto
): Promise<ResearchTopic[]> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.status) params.set('status', options.status);
  if (options?.search) params.set('search', options.search);
  if (options?.skip) params.set('skip', options.skip.toString());
  if (options?.take) params.set('take', options.take.toString());

  const query = params.toString();
  const response = await fetchWithAuth(
    `${API_PREFIX}/topics${query ? `?${query}` : ''}`
  );
  // Backend returns { topics, total, skip, take }, extract the topics array
  return Array.isArray(response) ? response : response.topics || [];
}

/**
 * 获取专题详情
 */
export async function getTopic(topicId: string): Promise<ResearchTopic> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}`);
}

/**
 * 更新专题
 */
export async function updateTopic(
  topicId: string,
  dto: UpdateTopicDto
): Promise<ResearchTopic> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/**
 * 删除专题
 */
export async function deleteTopic(topicId: string): Promise<void> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}`, {
    method: 'DELETE',
  });
}

// ==================== Refresh Operations ====================

/**
 * 触发刷新
 */
export async function triggerRefresh(
  topicId: string,
  dto?: TriggerRefreshDto
): Promise<{ jobId: string; message: string }> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/refresh`, {
    method: 'POST',
    body: JSON.stringify(dto || {}),
  });
}

/**
 * 获取刷新状态
 */
export async function getRefreshStatus(
  topicId: string
): Promise<RefreshStatusResponse> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/refresh/status`);
}

/**
 * 取消刷新
 */
export async function cancelRefresh(
  topicId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/refresh/cancel`, {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  });
}

/**
 * 创建刷新进度 SSE 连接
 */
export function createRefreshProgressStream(
  topicId: string,
  handlers: {
    onProgress?: (event: {
      phase: string;
      progress: number;
      message: string;
      currentDimension?: string;
      completedDimensions: number;
      totalDimensions: number;
    }) => void;
    onComplete?: (event: { reportId: string }) => void;
    onError?: (event: { error: string }) => void;
  }
): { close: () => void } {
  const tokens = getAuthTokens();
  const url = `${API_BASE}${API_PREFIX}/topics/${topicId}/refresh/progress`;

  const eventSource = new EventSource(
    `${url}${tokens?.accessToken ? `?token=${tokens.accessToken}` : ''}`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.phase === 'completed') {
        handlers.onComplete?.({ reportId: data.reportId });
        eventSource.close();
      } else if (data.phase === 'failed') {
        handlers.onError?.({ error: data.error || 'Refresh failed' });
        eventSource.close();
      } else {
        handlers.onProgress?.(data);
      }
    } catch (error) {
      handlers.onError?.({ error: 'Failed to parse progress event' });
      eventSource.close();
    }
  };

  eventSource.onerror = () => {
    handlers.onError?.({ error: 'Connection error' });
    eventSource.close();
  };

  return {
    close: () => eventSource.close(),
  };
}

// ==================== Dimensions ====================

/**
 * 获取维度列表
 */
export async function getDimensions(
  topicId: string
): Promise<TopicDimension[]> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/dimensions`);
}

/**
 * 添加维度
 */
export async function addDimension(
  topicId: string,
  dto: AddDimensionDto
): Promise<TopicDimension> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/dimensions`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * 更新维度
 */
export async function updateDimension(
  topicId: string,
  dimensionId: string,
  dto: UpdateDimensionDto
): Promise<TopicDimension> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/dimensions/${dimensionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }
  );
}

/**
 * 删除维度
 */
export async function deleteDimension(
  topicId: string,
  dimensionId: string
): Promise<void> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/dimensions/${dimensionId}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * 刷新单个维度
 */
export async function refreshDimension(
  topicId: string,
  dimensionId: string,
  options?: { priority?: string; regenerate?: boolean }
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/dimensions/${dimensionId}/refresh`,
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

/**
 * 调整维度顺序
 */
export async function reorderDimensions(
  topicId: string,
  dto: ReorderDimensionsDto
): Promise<TopicDimension[]> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/dimensions/reorder`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

// ==================== Reports ====================

/**
 * 获取报告列表
 */
export async function getReports(
  topicId: string,
  options?: ListReportsDto
): Promise<{ reports: TopicReport[]; hasMore: boolean; nextCursor?: string }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.cursor) params.set('cursor', options.cursor);

  const query = params.toString();
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports${query ? `?${query}` : ''}`
  );
}

/**
 * 获取最新报告
 */
export async function getLatestReport(topicId: string): Promise<TopicReport> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/reports/latest`);
}

/**
 * 获取指定报告
 */
export async function getReport(
  topicId: string,
  reportId: string
): Promise<TopicReport> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/reports/${reportId}`);
}

/**
 * 导出任务响应类型
 */
export interface ExportJobResponse {
  jobId?: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  downloadUrl?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

/**
 * 导出报告 - 创建导出任务
 */
export async function exportReport(
  topicId: string,
  reportId: string,
  dto: ExportReportDto
): Promise<ExportJobResponse> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/export`,
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
}

/**
 * 获取导出任务状态
 */
export async function getExportJobStatus(
  jobId: string
): Promise<ExportJobResponse> {
  return fetchWithAuth(`/api/v1/export/jobs/${jobId}`, {
    method: 'GET',
  });
}

/**
 * 等待导出完成并返回下载URL
 * 轮询直到任务完成或失败
 */
export async function waitForExportCompletion(
  topicId: string,
  reportId: string,
  dto: ExportReportDto,
  onProgress?: (progress: number) => void
): Promise<string> {
  // 1. 创建导出任务
  const initialResponse = await exportReport(topicId, reportId, dto);

  // 如果已经完成，直接返回
  if (initialResponse.status === 'COMPLETED' && initialResponse.downloadUrl) {
    return initialResponse.downloadUrl;
  }

  // 如果失败，抛出错误
  if (initialResponse.status === 'FAILED') {
    throw new Error(initialResponse.error || '导出失败');
  }

  // 没有 jobId，无法轮询
  if (!initialResponse.jobId) {
    throw new Error('导出任务创建失败');
  }

  // 2. 轮询等待完成
  const maxAttempts = 60; // 最多等待 60 秒
  const pollInterval = 1000; // 每秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const status = await getExportJobStatus(initialResponse.jobId);
    onProgress?.(status.progress || 0);

    if (status.status === 'COMPLETED' && status.downloadUrl) {
      return status.downloadUrl;
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || '导出失败');
    }
  }

  throw new Error('导出超时，请稍后重试');
}

/**
 * 比较报告版本
 */
export async function compareReports(
  topicId: string,
  dto: CompareReportsDto
): Promise<ReportComparisonResult> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/reports/compare`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * 获取报告修订历史
 */
export interface ReportRevision {
  id: string;
  reportId: string;
  revisionNumber: number;
  content: string;
  changeDescription: string;
  editedBy: string;
  editOperation: string;
  createdAt: string;
}

export async function getReportRevisions(
  topicId: string,
  reportId: string
): Promise<ReportRevision[]> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/revisions`
  );
}

/**
 * 回滚报告到指定版本
 */
export interface RollbackReportResponse {
  report: TopicReport;
  rolledBackFrom: number;
  rolledBackTo: number;
}

export async function rollbackReport(
  topicId: string,
  reportId: string,
  revisionNumber: number
): Promise<RollbackReportResponse> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({ revisionNumber }),
    }
  );
}

// ==================== Evidence ====================

/**
 * 获取证据列表
 */
export async function getEvidence(
  topicId: string,
  reportId: string,
  options?: ListEvidenceDto
): Promise<{ evidence: TopicEvidence[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.dimensionId) params.set('dimensionId', options.dimensionId);
  if (options?.sourceType) params.set('sourceType', options.sourceType);
  if (options?.minCredibility)
    params.set('minCredibility', options.minCredibility.toString());
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.pageSize) params.set('pageSize', options.pageSize.toString());
  if (options?.page) params.set('page', options.page.toString());

  const query = params.toString();
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/evidence${query ? `?${query}` : ''}`
  );
}

/**
 * 获取单个证据详情
 */
export async function getEvidenceDetail(
  topicId: string,
  reportId: string,
  evidenceId: string
): Promise<TopicEvidence> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/evidence/${evidenceId}`
  );
}

// ==================== Templates ====================

/**
 * 获取模板列表
 */
export async function getTemplates(
  type: ResearchTopicType
): Promise<ResearchTemplate[]> {
  const response = await fetchWithAuth(`${API_PREFIX}/templates?type=${type}`);
  // Backend returns { type, dimensions }, convert to template format
  if (Array.isArray(response)) {
    return response;
  }
  // If dimensions exist, create a single template from them
  if (response.dimensions && Array.isArray(response.dimensions)) {
    return [
      {
        id: `template-${response.type}`,
        name:
          response.type === 'MACRO'
            ? '宏观洞察模板'
            : response.type === 'TECHNOLOGY'
              ? '技术趋势模板'
              : '企业追踪模板',
        description: `${response.type} 类型的默认研究维度模板`,
        type: response.type,
        dimensions: response.dimensions,
      },
    ];
  }
  return [];
}

/**
 * 从模板创建专题
 */
export async function createFromTemplate(
  templateId: string,
  overrides?: Partial<CreateTopicDto>
): Promise<ResearchTopic> {
  return fetchWithAuth(`${API_PREFIX}/topics/from-template`, {
    method: 'POST',
    body: JSON.stringify({ templateId, ...overrides }),
  });
}

// ==================== Schedule ====================

/**
 * 获取刷新计划
 */
export async function getSchedule(topicId: string): Promise<TopicSchedule> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/schedule`);
}

/**
 * 更新刷新计划
 */
export async function updateSchedule(
  topicId: string,
  dto: UpdateScheduleDto
): Promise<TopicSchedule> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/schedule`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

// ==================== Logs ====================

/**
 * 获取刷新日志
 */
export async function getLogs(
  topicId: string,
  options?: ListLogsDto
): Promise<TopicRefreshLog[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.status) params.set('status', options.status);

  const query = params.toString();
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/logs${query ? `?${query}` : ''}`
  );
}

// ==================== Stats ====================

/**
 * 获取专题统计
 */
export async function getStats(topicId: string): Promise<TopicStats> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/stats`);
}

// ==================== Leader API ====================

/**
 * Leader 生成研究规划
 */
export async function leaderPlan(
  topicId: string,
  options?: { userPrompt?: string; userContext?: Record<string, unknown> }
): Promise<ResearchMission> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/leader/plan`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

/**
 * 处理 @Leader 消息
 */
export async function sendLeaderMessage(
  topicId: string,
  content: string
): Promise<{ response: string; planAdjustments?: unknown }> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/leader/message`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/**
 * 获取 Leader 决策历史
 */
export async function getLeaderDecisions(
  topicId: string
): Promise<LeaderDecision[]> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/leader/decisions`);
}

// ==================== Mission API ====================

/**
 * 获取当前 Mission 状态
 */
export async function getMission(
  topicId: string
): Promise<MissionStatus | null> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/mission`);
}

/**
 * 重试失败的任务
 */
export async function retryMission(
  topicId: string,
  taskIds?: string[]
): Promise<{ retriedTasks?: number } | ResearchMission> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/mission/retry`, {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  });
}

/**
 * 取消当前 Mission
 */
export async function cancelMission(
  topicId: string
): Promise<{ success: boolean }> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/mission/cancel`, {
    method: 'POST',
  });
}

/**
 * 获取研究团队信息
 */
export async function getTeam(topicId: string): Promise<TeamInfo> {
  return fetchWithAuth(`${API_PREFIX}/topics/${topicId}/team`);
}

// ==================== Mission Types ====================

export interface ResearchMission {
  id: string;
  topicId: string;
  status: 'PLANNING' | 'EXECUTING' | 'REVIEWING' | 'COMPLETED' | 'FAILED';
  leaderModelId?: string;
  leaderModelName?: string;
  leaderPlan?: LeaderPlan;
  userPrompt?: string;
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderPlan {
  taskUnderstanding: {
    topic: string;
    scope: string;
    objectives: string[];
    constraints?: string[];
  };
  dimensions: LeaderPlannedDimension[];
  executionStrategy: {
    parallelism: number;
    priorityOrder: string[];
    estimatedTime?: string;
  };
  agentAssignments: AgentAssignment[];
}

export interface LeaderPlannedDimension {
  id: string;
  name: string;
  description: string;
  searchQueries: string[];
  dataSources: string[];
  priority: number;
}

export interface AgentAssignment {
  agentId: string;
  agentType: 'dimension_researcher' | 'quality_reviewer' | 'report_writer';
  assignedDimensions?: string[];
  role: string;
}

export interface MissionStatus {
  id: string;
  status: 'PLANNING' | 'EXECUTING' | 'REVIEWING' | 'COMPLETED' | 'FAILED';
  progress: number;
  totalTasks: number;
  completedTasks: number;
  currentPhase: string;
  tasks: TaskStatus[];
  leaderPlan?: LeaderPlan;
}

export interface TaskStatus {
  id: string;
  title: string;
  taskType: string;
  dimensionName?: string;
  assignedAgent: string;
  status:
    | 'PENDING'
    | 'ASSIGNED'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'NEEDS_REVISION'
    | 'FAILED';
  reviewStatus?: string;
  progress?: number;
}

export interface TeamInfo {
  leaderId: string | null;
  leaderModel: string | null;
  agents: AgentInfo[];
}

export interface AgentInfo {
  id: string;
  type: string;
  role: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
  assignedDimensions?: string[];
}

export interface LeaderDecision {
  id: string;
  missionId: string;
  type: 'PLAN' | 'REVIEW' | 'ADJUST' | 'INTERVENE';
  input: unknown;
  decision: unknown;
  reasoning: string;
  modelUsed?: string;
  latencyMs?: number;
  createdAt: string;
}

// ==================== Team Messages & Agent Activities ====================

/**
 * 团队互动消息
 */
export interface TeamMessage {
  id: string;
  topicId: string;
  missionId?: string;
  messageType:
    | 'LEADER_RESPONSE'
    | 'USER_MESSAGE'
    | 'SYSTEM_MESSAGE'
    | 'AGENT_REPORT';
  senderRole: 'leader' | 'user' | 'system';
  senderName: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Agent 活动记录
 */
export interface AgentActivity {
  id: string;
  topicId: string;
  missionId?: string;
  agentId?: string;
  agentName: string;
  agentRole: 'leader' | 'researcher' | 'reviewer' | 'synthesizer';
  activityType:
    | 'THINKING'
    | 'PLANNING'
    | 'RESEARCHING'
    | 'WRITING'
    | 'REVIEWING'
    | 'COMPLETED'
    | 'FAILED';
  phase?: string;
  content: string;
  progress?: number;
  dimensionId?: string;
  dimensionName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * 获取团队互动消息
 */
export async function getTeamMessages(
  topicId: string,
  options?: { limit?: number; missionId?: string }
): Promise<TeamMessage[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.missionId) params.append('missionId', options.missionId);

  const queryString = params.toString();
  const url = `${API_PREFIX}/topics/${topicId}/team-messages${queryString ? `?${queryString}` : ''}`;
  return fetchWithAuth(url);
}

/**
 * 获取 Agent 活动记录
 */
export async function getAgentActivities(
  topicId: string,
  options?: { limit?: number; missionId?: string; agentRole?: string }
): Promise<AgentActivity[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.missionId) params.append('missionId', options.missionId);
  if (options?.agentRole) params.append('agentRole', options.agentRole);

  const queryString = params.toString();
  const url = `${API_PREFIX}/topics/${topicId}/agent-activities${queryString ? `?${queryString}` : ''}`;
  return fetchWithAuth(url);
}

// ==================== Credibility Report (Phase 2) ====================

/**
 * 可信度报告数据
 */
export interface CredibilityReportData {
  overallScore: number;
  authorityScore: number;
  diversityScore: number;
  timelinessScore: number;
  coverageScore: number;
  sourceBreakdown: {
    government: number;
    academic: number;
    industry: number;
    news: number;
    blog: number;
    other: number;
    total: number;
  };
  timeBreakdown: {
    within1Month: number;
    within3Months: number;
    within6Months: number;
    within1Year: number;
    older: number;
    unknown: number;
    total: number;
  };
  coverageDetails: Array<{
    dimensionId: string;
    dimensionName: string;
    sourceCount: number;
    targetCount: number;
    status: 'excellent' | 'good' | 'fair' | 'poor';
    coveragePercent: number;
  }>;
  aiQualityMetrics: {
    planningRounds: number;
    revisionAverage: number;
    approvalRate: number;
    averageConfidence: string;
    totalAgentActivities: number;
  };
  limitations: string[];
}

/**
 * 获取报告的可信度评估
 */
export async function getCredibilityReport(
  topicId: string,
  reportId: string
): Promise<CredibilityReportData> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/credibility`
  );
}

/**
 * 重新生成可信度报告
 */
export async function regenerateCredibilityReport(
  topicId: string,
  reportId: string
): Promise<CredibilityReportData> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/credibility/regenerate`,
    { method: 'POST' }
  );
}

// ==================== Research History (Phase 2.3) ====================

/**
 * 研究历史记录
 */
export interface ResearchHistoryItem {
  id: string;
  topicId: string;
  missionId: string;
  researchNumber: number;
  startedAt: string;
  completedAt?: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'IN_PROGRESS';
  researchGoal?: string;
  researchStrategy?: string;
  dimensionsUpdated: string[];
  dimensionsKept: string[];
  wordsAdded: number;
  wordsRemoved: number;
  newSourcesCount: number;
  totalDurationMs?: number;
  reportVersionBefore?: number;
  reportVersionAfter?: number;
}

/**
 * 获取研究历史时间线
 */
export async function getResearchHistory(
  topicId: string,
  limit?: number
): Promise<ResearchHistoryItem[]> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  const queryString = params.toString();
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/research-history${queryString ? `?${queryString}` : ''}`
  );
}

// ==================== Review Workflow (Phase 3.3) ====================

/**
 * 审核任务
 */
export interface ReviewTask {
  id: string;
  reportId: string;
  sectionId?: string;
  sectionName: string;
  sectionOrder: number;
  assigneeId?: string;
  assigneeName?: string;
  assignedById?: string;
  assignedAt?: string;
  dueAt?: string;
  completedAt?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  approved?: boolean;
  score?: number;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 审核任务统计
 */
export interface ReviewTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  approved: number;
  rejected: number;
  averageScore: number | null;
}

/**
 * 获取报告的审核任务列表
 */
export async function getReviewTasks(
  topicId: string,
  reportId: string
): Promise<ReviewTask[]> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks`
  );
}

/**
 * 创建审核任务
 */
export async function createReviewTasks(
  topicId: string,
  reportId: string
): Promise<{
  created: number;
  tasks: Array<{ id: string; sectionName: string }>;
}> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks`,
    { method: 'POST' }
  );
}

/**
 * 分配审核任务
 */
export async function assignReviewTask(
  topicId: string,
  reportId: string,
  taskId: string,
  assigneeId: string,
  assigneeName: string
): Promise<ReviewTask> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks/${taskId}/assign`,
    {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId, assigneeName }),
    }
  );
}

/**
 * 完成审核任务
 */
export async function completeReviewTask(
  topicId: string,
  reportId: string,
  taskId: string,
  approved: boolean,
  comments?: string,
  score?: number
): Promise<ReviewTask> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks/${taskId}/complete`,
    {
      method: 'PATCH',
      body: JSON.stringify({ approved, comments, score }),
    }
  );
}

/**
 * 获取审核任务统计
 */
export async function getReviewTaskStats(
  topicId: string,
  reportId: string
): Promise<ReviewTaskStats> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks/stats`
  );
}

/**
 * 检查报告是否可发布
 */
export async function canPublishReport(
  topicId: string,
  reportId: string
): Promise<{
  canPublish: boolean;
  reason?: string;
  pendingTasks: number;
  rejectedTasks: number;
}> {
  return fetchWithAuth(
    `${API_PREFIX}/topics/${topicId}/reports/${reportId}/review-tasks/can-publish`
  );
}
