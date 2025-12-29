/**
 * Slides Engine v3.0 - 前端类型定义
 *
 * 与后端 checkpoint.types.ts 对应
 */

// ============================================================================
// 检查点类型
// ============================================================================

export type CheckpointType =
  | 'task_decomposition'
  | 'outline_confirmed'
  | 'page_rendered'
  | 'batch_rendered'
  | 'user_modified'
  | 'auto_save';

export interface Checkpoint {
  id: string;
  sessionId: string;
  name: string;
  type: CheckpointType;
  version: string;
  timestamp: Date;
  state: CheckpointState;
  metadata: CheckpointMetadata;
}

export interface CheckpointMetadata {
  trigger: 'auto' | 'user';
  description?: string;
  previousCheckpointId?: string;
  durationMs?: number;
}

// ============================================================================
// 会话类型
// ============================================================================

export interface SlidesSession {
  id: string;
  userId: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  currentCheckpointId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 检查点状态
// ============================================================================

export interface CheckpointState {
  taskDecomposition?: TaskDecomposition;
  outlinePlan?: OutlinePlan;
  pages: PageState[];
  conversation: ConversationMessage[];
  globalStyles?: GlobalStyles;
}

// ============================================================================
// 任务分解
// ============================================================================

export interface TaskDecomposition {
  totalPages: number;
  estimatedDuration: number;
  chapters: Chapter[];
  todoList: TodoItem[];
  designStrategy: DesignStrategy;
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  pageRange: { start: number; end: number };
  keyPoints: string[];
}

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed';
  dependencies: string[];
  pageNumber?: number;
}

export interface DesignStrategy {
  overallStyle: string;
  colorScheme: 'dark' | 'light' | 'custom';
  emphasis: string[];
  targetAudience: string;
}

// ============================================================================
// 大纲规划
// ============================================================================

export interface OutlinePlan {
  title: string;
  totalPages: number;
  pages: PageOutline[];
  globalStyles: GlobalStyles;
  contentFlow: ContentFlow;
}

export interface PageOutline {
  pageNumber: number;
  title: string;
  templateType: PageTemplateType;
  purpose: string;
  keyPoints: string[];
  sourceReference?: string;
  imageRequirements?: ImageRequirement[];
  estimatedDuration?: number;
}

export interface ContentFlow {
  narrative: string;
  transitions: Array<{
    from: number;
    to: number;
    type: string;
  }>;
}

// ============================================================================
// 页面类型
// ============================================================================

export type PageTemplateType =
  | 'cover'
  | 'toc'
  | 'questions'
  | 'pillars'
  | 'framework'
  | 'timeline'
  | 'evolutionRoadmap'
  | 'dashboard'
  | 'comparison'
  | 'splitLayout'
  | 'caseStudy'
  | 'multiColumn'
  | 'recommendations'
  | 'maturityModel'
  | 'riskOpportunity';

// ============================================================================
// 页面状态
// ============================================================================

export interface PageState {
  pageNumber: number;
  outline: PageOutline;
  content?: PageContent;
  design?: PageDesign;
  html?: string;
  images?: GeneratedImage[];
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface PageContent {
  title: string;
  sections: ContentSection[];
  keyPoints: string[];
  dataPoints?: DataPoint[];
  quotes?: Quote[];
}

export interface ContentSection {
  id: string;
  heading?: string;
  content: string;
  type: 'text' | 'list' | 'table' | 'chart' | 'image';
}

export interface DataPoint {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface Quote {
  text: string;
  author?: string;
  source?: string;
}

// ============================================================================
// 页面设计（四步设计过程）
// ============================================================================

export interface PageDesign {
  step1_drafting: DraftingResult;
  step2_refiningLayout: LayoutResult;
  step3_planningVisuals: VisualResult;
  step4_formulatingHTML: HTMLResult;
}

export interface DraftingResult {
  style: string;
  coreElements: string[];
  mood: string;
}

export interface LayoutResult {
  alignment: string;
  graphicsPosition: string;
  spacing: string;
}

export interface VisualResult {
  backgroundColor: string;
  accentColors: string[];
  decorations: string[];
}

export interface HTMLResult {
  html: string;
  externalDependencies: string[];
}

// ============================================================================
// 图像相关
// ============================================================================

export interface ImageRequirement {
  position: 'background' | 'inline' | 'card' | 'icon';
  semanticContext: string;
  style?: string;
  optional?: boolean;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  semanticContext?: string;
  position: 'background' | 'inline' | 'card' | 'icon';
  width?: number;
  height?: number;
  generatedAt: Date;
}

// ============================================================================
// 全局样式（Genspark 设计系统）
// ============================================================================

export interface GlobalStyles {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  cardBackground: string;
  borderColor: string;
  accentColor: string;
  accentColorSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fontFamily: string;
  bottomSafeZone: number;
}

export const GENSPARK_DESIGN_SYSTEM: GlobalStyles = {
  canvasWidth: 1280,
  canvasHeight: 720,
  backgroundColor: '#0F172A',
  cardBackground: '#1E293B',
  borderColor: '#334155',
  accentColor: '#D4AF37',
  accentColorSecondary: '#3B82F6',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  fontFamily: "'Noto Sans SC', sans-serif",
  bottomSafeZone: 80,
};

// ============================================================================
// 对话消息
// ============================================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    toolCalls?: ToolCall[];
    pageReferences?: number[];
  };
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  duration?: number;
}

// ============================================================================
// 质量报告
// ============================================================================

export interface QualityReport {
  overall: 'pass' | 'warning' | 'fail';
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
  checkedAt: Date;
}

export interface QualityIssue {
  type: 'layout' | 'content' | 'consistency' | 'accessibility';
  severity: 'error' | 'warning' | 'info';
  pageNumber?: number;
  description: string;
  suggestion?: string;
}

// ============================================================================
// 流事件
// ============================================================================

export type StreamEventType =
  | 'session_created'
  | 'phase_started'
  | 'phase_completed'
  | 'checkpoint_created'
  | 'page_started'
  | 'page_completed'
  | 'progress_update'
  | 'error'
  | 'complete';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: Date;
  sessionId: string;
  data: unknown;
}

// ============================================================================
// 生成进度
// ============================================================================

export interface GenerationProgress {
  phase:
    | 'task_decomposition'
    | 'outline_planning'
    | 'page_rendering'
    | 'quality_review';
  phaseProgress: number;
  overallProgress: number;
  currentPage?: number;
  totalPages?: number;
  message: string;
}

// ============================================================================
// API 请求/响应类型
// ============================================================================

export interface GenerateV3Request {
  title: string;
  sourceText: string;
  userRequirement?: string;
  targetPages?: number;
  stylePreference?: 'dark' | 'light' | 'custom';
  targetAudience?: string;
  customStyles?: Partial<GlobalStyles>;
}

export interface SessionResponse {
  success: boolean;
  session: SlidesSession;
  latestCheckpoint?: {
    id: string;
    type: CheckpointType;
    timestamp: Date;
    pagesCount: number;
  };
}

export interface CheckpointsResponse {
  success: boolean;
  checkpoints: Checkpoint[];
}

export interface RestoreResponse {
  success: boolean;
  message: string;
  state: {
    pagesCount: number;
    hasOutline: boolean;
    hasTaskDecomposition: boolean;
  };
}
