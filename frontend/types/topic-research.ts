/**
 * Topic Research Frontend Types
 *
 * 专题研究模块的类型定义
 */

// ==================== Enums ====================

export enum ResearchTopicType {
  MACRO = 'MACRO',
  TECHNOLOGY = 'TECHNOLOGY',
  COMPANY = 'COMPANY',
}

export enum ResearchTopicStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum RefreshFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  MANUAL = 'MANUAL',
}

export enum DimensionStatus {
  PENDING = 'PENDING',
  RESEARCHING = 'RESEARCHING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum RefreshType {
  FULL = 'FULL',
  INCREMENTAL = 'INCREMENTAL',
  DIMENSION = 'DIMENSION',
}

export enum RefreshPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export enum RefreshLogStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ==================== Core Types ====================

/**
 * 研究专题
 */
// 专题可见性
export type TopicVisibility = 'PRIVATE' | 'SHARED' | 'PUBLIC';

export interface ResearchTopic {
  id: string;
  name: string;
  description: string | null;
  type: ResearchTopicType;
  status: ResearchTopicStatus;
  visibility?: TopicVisibility; // 可见性：私有/共享/公开
  icon: string | null;
  color: string | null;
  refreshFrequency: RefreshFrequency;
  lastRefreshAt: string | null;
  totalReports: number;
  totalSources: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // Relations
  dimensions?: TopicDimension[];
  latestReport?: TopicReport | null;
  schedule?: TopicSchedule | null;
}

/**
 * 研究维度
 */
export interface TopicDimension {
  id: string;
  topicId: string;
  name: string;
  description: string | null;
  searchQueries: string[];
  searchSources: string[];
  sortOrder: number;
  isEnabled: boolean;
  minSources: number;
  status: DimensionStatus;
  lastResearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 研究报告
 */
export interface TopicReport {
  id: string;
  topicId: string;
  version: number;
  title: string | null;
  summary: string | null;
  executiveSummary?: string; // 执行摘要
  fullReport?: string; // 完整报告（Markdown）
  highlights: ReportHighlight[] | null;
  totalSources: number;
  status: ReportStatus;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  dimensionAnalyses?: DimensionAnalysis[];
  evidence?: TopicEvidence[];
}

/**
 * 报告高亮
 */
export interface ReportHighlight {
  type: 'trend' | 'finding' | 'opportunity' | 'challenge';
  title: string;
  content: string;
  dimensionId?: string;
}

/**
 * 维度分析
 */
export interface DimensionAnalysis {
  id: string;
  reportId: string;
  dimensionId: string;
  summary: string | null;
  keyFindings: KeyFinding[];
  trends: Trend[];
  challenges: Challenge[];
  opportunities: Opportunity[];
  confidenceLevel: 'high' | 'medium' | 'low' | null;
  detailedContent: string | null;
  createdAt: string;
  // Relations
  dimension?: TopicDimension;
}

/**
 * 关键发现
 */
export interface KeyFinding {
  finding: string;
  significance: 'high' | 'medium' | 'low';
  evidenceIds: string[];
}

/**
 * 趋势
 */
export interface Trend {
  trend: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'emerging';
  timeframe: string;
  evidenceIds: string[];
}

/**
 * 挑战
 */
export interface Challenge {
  challenge: string;
  impact: string;
  evidenceIds: string[];
}

/**
 * 机会
 */
export interface Opportunity {
  opportunity: string;
  potential: string;
  evidenceIds: string[];
}

/**
 * 证据
 */
export interface TopicEvidence {
  id: string;
  reportId: string;
  title: string;
  url: string;
  domain: string | null;
  snippet: string | null;
  sourceType: string | null;
  publishedAt: string | null;
  credibilityScore: number | null;
  fetchedAt: string | null;
  createdAt: string;
}

/**
 * 刷新计划
 */
export interface TopicSchedule {
  id: string;
  topicId: string;
  frequency: RefreshFrequency;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  preferredTime: string | null;
  preferredDayOfWeek: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 刷新日志
 */
export interface TopicRefreshLog {
  id: string;
  topicId: string;
  reportId: string | null;
  triggerType: 'manual' | 'scheduled' | 'forced';
  status: RefreshLogStatus;
  startedAt: string;
  completedAt: string | null;
  dimensionsRefreshed: number;
  sourcesFound: number;
  error: string | null;
}

// ==================== DTOs ====================

/**
 * 创建专题 DTO
 */
export interface CreateTopicDto {
  name: string;
  description?: string;
  type: ResearchTopicType;
  topicConfig?: Record<string, unknown>;
  icon?: string;
  color?: string;
  refreshFrequency?: RefreshFrequency;
  dimensions?: DimensionConfigDto[];
}

/**
 * 维度配置 DTO
 */
export interface DimensionConfigDto {
  name: string;
  description?: string;
  searchQueries?: string[];
  searchSources?: string[];
  sortOrder?: number;
  isEnabled?: boolean;
  minSources?: number;
}

/**
 * 更新专题 DTO
 */
export interface UpdateTopicDto {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  refreshFrequency?: RefreshFrequency;
  status?: ResearchTopicStatus;
}

/**
 * 查询专题 DTO
 */
export interface ListTopicsDto {
  type?: ResearchTopicType;
  status?: ResearchTopicStatus;
  search?: string;
  skip?: number;
  take?: number;
}

/**
 * 触发刷新 DTO
 */
export interface TriggerRefreshDto {
  type?: RefreshType;
  dimensionIds?: string[];
  priority?: RefreshPriority;
  notify?: boolean;
  notificationEmail?: string;
}

/**
 * 添加维度 DTO
 */
export interface AddDimensionDto {
  name: string;
  description?: string;
  searchQueries?: string[];
  searchSources?: string[];
  sortOrder?: number;
  isEnabled?: boolean;
  minSources?: number;
}

/**
 * 更新维度 DTO
 */
export interface UpdateDimensionDto {
  name?: string;
  description?: string;
  searchQueries?: string[];
  searchSources?: string[];
  isEnabled?: boolean;
  minSources?: number;
}

/**
 * 调整维度顺序 DTO
 */
export interface ReorderDimensionsDto {
  dimensionIds: string[];
}

/**
 * 报告列表 DTO
 */
export interface ListReportsDto {
  limit?: number;
  cursor?: string;
}

/**
 * 导出报告 DTO
 */
export interface ExportReportDto {
  format: 'pdf' | 'docx';
  includeEvidence?: boolean;
  includeMetadata?: boolean;
}

/**
 * 比较报告 DTO
 */
export interface CompareReportsDto {
  from: number;
  to: number;
}

/**
 * 证据列表 DTO
 */
export interface ListEvidenceDto {
  dimensionId?: string;
  sourceType?: string;
  minCredibility?: number;
  sortBy?: 'credibility' | 'date' | 'relevance';
  pageSize?: number;
  page?: number;
}

/**
 * 更新刷新计划 DTO
 */
export interface UpdateScheduleDto {
  frequency?: RefreshFrequency;
  isEnabled?: boolean;
  preferredTime?: string;
  preferredDayOfWeek?: number;
}

/**
 * 日志列表 DTO
 */
export interface ListLogsDto {
  limit?: number;
  status?: RefreshLogStatus;
}

// ==================== Response Types ====================

/**
 * 刷新状态响应
 */
export interface RefreshStatusResponse {
  isRunning: boolean;
  startedAt?: string;
  currentPhase?: string;
  progress?: number;
  currentDimension?: string;
  completedDimensions?: number;
  totalDimensions?: number;
}

/**
 * 刷新进度事件
 */
export interface RefreshProgressEvent {
  topicId: string;
  reportId: string;
  phase: 'starting' | 'researching' | 'synthesizing' | 'completed' | 'failed';
  progress: number;
  currentDimension?: string;
  completedDimensions: number;
  totalDimensions: number;
  message: string;
  error?: string;
}

/**
 * 报告比较结果
 */
export interface ReportComparisonResult {
  fromVersion: number;
  toVersion: number;
  summary: {
    totalChanges: number;
    newFindings: number;
    removedFindings: number;
    updatedFindings: number;
  };
  dimensions: DimensionComparisonResult[];
}

/**
 * 维度比较结果
 */
export interface DimensionComparisonResult {
  dimensionId: string;
  dimensionName: string;
  changes: {
    type: 'added' | 'removed' | 'modified';
    field: string;
    oldValue?: string;
    newValue?: string;
  }[];
}

/**
 * 统计数据
 */
export interface TopicStats {
  totalReports: number;
  totalSources: number;
  totalEvidence: number;
  lastRefreshAt: string | null;
  avgCredibilityScore: number | null;
  dimensionStats: {
    dimensionId: string;
    name: string;
    status: DimensionStatus;
    evidenceCount: number;
  }[];
}

/**
 * 模板
 */
export interface ResearchTemplate {
  id: string;
  name: string;
  description: string;
  type: ResearchTopicType;
  dimensions: DimensionConfigDto[];
  icon?: string;
  color?: string;
}

// ==================== TODO Types ====================

/**
 * TODO 任务类型
 */
export enum ResearchTodoType {
  LEADER_PLANNING = 'LEADER_PLANNING',
  DIMENSION_RESEARCH = 'DIMENSION_RESEARCH',
  REPORT_WRITING = 'REPORT_WRITING',
  QUALITY_REVIEW = 'QUALITY_REVIEW',
  USER_REQUEST = 'USER_REQUEST',
}

/**
 * TODO 任务状态
 */
export enum ResearchTodoStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 研究 TODO
 */
export interface ResearchTodo {
  id: string;
  topicId: string;
  missionId: string;
  type: ResearchTodoType;
  title: string;
  description?: string;
  dimensionId?: string;
  dimensionName?: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  status: ResearchTodoStatus;
  progress: number;
  statusMessage?: string;
  priority: number;
  dependsOn: string[];
  startedAt?: string;
  completedAt?: string;
  estimatedMs?: number;
  actualMs?: number;
  result?: TodoResult;
  userCanPause: boolean;
  userCanCancel: boolean;
  userCanPrioritize: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * TODO 结果
 * 支持两种格式：
 * 1. 简单统计（keyFindings 为数字）
 * 2. 完整分析数据（包含 summary, keyFindings 数组, trends 等）
 */
export interface TodoResult {
  sourcesFound?: number;
  wordCount?: number;
  // keyFindings 可以是数量(number)或完整的发现列表
  keyFindings?: number | KeyFinding[];
  // 完整分析数据
  summary?: string;
  trends?: Trend[];
  challenges?: Challenge[];
  opportunities?: Opportunity[];
  error?: string;
}

/**
 * TODO 汇总
 */
export interface TodoSummary {
  total: number;
  pending: number;
  queued: number;
  inProgress: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
  overallProgress: number;
}

/**
 * TODO 列表响应
 */
export interface TodoListResponse {
  todos: ResearchTodo[];
  summary: TodoSummary;
}

/**
 * TODO 分组
 */
export interface TodoGroup {
  status: 'in_progress' | 'pending' | 'completed' | 'failed';
  label: string;
  todos: ResearchTodo[];
  isExpanded: boolean;
}

/**
 * TODO WebSocket 事件类型
 */
export enum TodoEventType {
  TODO_CREATED = 'todo:created',
  TODO_STATUS_CHANGED = 'todo:status_changed',
  TODO_PROGRESS = 'todo:progress',
  TODO_COMPLETED = 'todo:completed',
  TODO_FAILED = 'todo:failed',
  TODO_CANCELLED = 'todo:cancelled',
  TODO_PAUSED = 'todo:paused',
  TODO_RESUMED = 'todo:resumed',
}
