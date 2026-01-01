/**
 * Slides Team - Type Definitions
 *
 * 定义 Team 协作架构的类型系统
 */

// ============================================================================
// Agent 定义
// ============================================================================

export type SlidesAgentRole =
  | "leader" // 协调者 - 分解任务、汇总结果
  | "analyst" // 分析师 - 分析源内容
  | "strategist" // 策略师 - 设计策略
  | "writer" // 写手 - 内容生成
  | "reviewer"; // 审核员 - 质量检查

export interface SlidesAgentConfig {
  role: SlidesAgentRole;
  name: string;
  description: string;
  skills: string[]; // 使用的 skills
}

// 5 个 Agent 配置
export const SLIDES_TEAM_AGENTS: SlidesAgentConfig[] = [
  {
    role: "leader",
    name: "Slides Architect",
    description: "协调整个 PPT 生成流程，分解任务并汇总结果",
    skills: ["task-decomposition", "quality-review"],
  },
  {
    role: "analyst",
    name: "Content Analyst",
    description: "分析源文本，提取主题、数据点、关键洞察",
    skills: ["task-decomposition"],
  },
  {
    role: "strategist",
    name: "Visual Strategist",
    description: "确定设计策略、模板选择、配色方案",
    skills: ["outline-planning"],
  },
  {
    role: "writer",
    name: "Content Writer",
    description: "生成每页的具体内容",
    skills: ["content-compression"],
  },
  {
    role: "reviewer",
    name: "Quality Reviewer",
    description: "检查内容质量、排版、一致性",
    skills: ["quality-review"],
  },
];

// ============================================================================
// 执行状态
// ============================================================================

export type SlidesTeamPhase =
  | "initializing" // 初始化
  | "analyzing" // 内容分析
  | "planning" // 结构规划
  | "generating" // 内容生成
  | "rendering" // 渲染 HTML
  | "reviewing" // 质量审核
  | "completed" // 完成
  | "failed"; // 失败

export interface PhaseProgress {
  phase: SlidesTeamPhase;
  progress: number; // 0-100
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
}

// ============================================================================
// SSE 事件类型
// ============================================================================

export type SlidesTeamEventType =
  // 执行生命周期
  | "execution:started"
  | "execution:completed"
  | "execution:failed"
  // 阶段变化
  | "phase:started"
  | "phase:progress"
  | "phase:completed"
  | "phase:retry" // 阶段重试
  // Agent 活动
  | "agent:thinking"
  | "agent:working"
  | "agent:completed"
  | "agent:handoff" // Agent 交接
  // 内容生成
  | "slide:generating"
  | "slide:generated"
  // 质量检查
  | "review:issue_found"
  | "review:auto_fixed"
  | "review:rejected" // Leader 驳回
  | "review:scoring" // Leader 评分
  | "review:max_retries_reached" // 达到最大重试次数
  // Agent 管理
  | "agent:switched" // Agent 被替换
  // 心跳
  | "heartbeat";

export interface SlidesTeamEvent {
  type: SlidesTeamEventType;
  timestamp: Date;
  executionId: string;
  data: SlidesTeamEventData;
}

export type SlidesTeamEventData =
  | ExecutionStartedData
  | ExecutionCompletedData
  | ExecutionFailedData
  | PhaseStartedData
  | PhaseProgressData
  | PhaseCompletedData
  | PhaseRetryData
  | AgentThinkingData
  | AgentWorkingData
  | AgentCompletedData
  | AgentHandoffData
  | AgentSwitchedData
  | SlideGeneratingData
  | SlideGeneratedData
  | ReviewIssueData
  | ReviewFixedData
  | ReviewRejectedData
  | ReviewScoringData
  | ReviewMaxRetriesData
  | HeartbeatData;

export interface ExecutionStartedData {
  sessionId: string;
  sourceLength: number;
  targetPages?: number;
}

export interface ExecutionCompletedData {
  totalPages: number;
  totalTime: number; // ms
  checkpointId: string;
}

export interface ExecutionFailedData {
  error: string;
  phase: SlidesTeamPhase;
  recoverable: boolean;
}

export interface PhaseStartedData {
  phase: SlidesTeamPhase;
  agent: SlidesAgentRole;
  description: string;
}

export interface PhaseProgressData {
  phase: SlidesTeamPhase;
  progress: number;
  message: string;
}

export interface PhaseCompletedData {
  phase: SlidesTeamPhase;
  duration: number; // ms
  result?: unknown; // 阶段结果摘要
}

export interface PhaseRetryData {
  phase: string;
  attempt: number;
  maxAttempts: number;
  reason: string;
}

export interface AgentThinkingData {
  agent: SlidesAgentRole;
  agentName: string;
  thought: string;
}

export interface AgentWorkingData {
  agent: SlidesAgentRole;
  agentName: string;
  task: string;
  progress?: number;
}

export interface AgentCompletedData {
  agent: SlidesAgentRole;
  agentName: string;
  result: string;
  duration: number;
}

export interface AgentHandoffData {
  fromAgent: SlidesAgentRole;
  toAgent: SlidesAgentRole;
  message: string;
  context?: unknown;
}

export interface SlideGeneratingData {
  pageNumber: number;
  totalPages: number;
  title: string;
  templateType: string;
}

export interface SlideGeneratedData {
  pageNumber: number;
  title: string;
  contentLength: number;
  html: string; // 渲染后的 HTML 内容
}

export interface ReviewIssueData {
  pageNumber: number;
  severity: "error" | "warning" | "info";
  type: string;
  message: string;
}

export interface ReviewFixedData {
  pageNumber: number;
  issueType: string;
  fixDescription: string;
}

/**
 * Leader 评分数据
 */
export interface ReviewScoringData {
  phase: string;
  agent: SlidesAgentRole;
  score: number; // 综合分数 0-100
  threshold: number; // 通过阈值
  passed: boolean;
  dimensions: ReviewDimension[];
  summary: string; // 评价摘要
}

export interface ReviewRejectedData {
  phase: string;
  attempt: number;
  score: number; // 0-100 分数
  threshold: number; // 通过阈值
  feedback?: string;
  suggestions?: string[];
  dimensions?: ReviewDimension[]; // 各维度评分
  willRetry: boolean;
}

export interface ReviewMaxRetriesData {
  phase: string;
  attempts: number;
  lastScore: number;
  lastFeedback?: string;
  action: "switching_agent" | "escalating" | "proceeding_with_best_effort";
  newAgent?: string; // 切换到的新 Agent
}

/**
 * 审核评分维度
 */
export interface ReviewDimension {
  name: string; // 维度名称
  score: number; // 0-100
  weight: number; // 权重 0-1
  comment?: string; // 评价
}

/**
 * Agent 切换事件数据
 */
export interface AgentSwitchedData {
  phase: string;
  originalAgent: SlidesAgentRole;
  newAgent: string; // 新 Agent 标识（如 "analyst-v2", "analyst-enhanced"）
  reason: string;
  previousScore: number;
}

export interface HeartbeatData {
  phase: SlidesTeamPhase;
  progress: number;
  activeAgent?: SlidesAgentRole;
}

// ============================================================================
// 输入输出类型
// ============================================================================

export interface SlidesTeamInput {
  sessionId: string;
  userId: string;
  sourceText: string;
  userRequirement?: string;
  targetPages?: number;
  stylePreference?: "dark" | "light" | "custom";
  targetAudience?: string;
  themeId?: string;
}

export interface SlidesTeamOutput {
  executionId: string;
  sessionId: string;
  status: "completed" | "failed";
  totalPages: number;
  checkpointId?: string;
  error?: string;
  metrics: {
    totalTime: number;
    phaseTimings: Record<SlidesTeamPhase, number>;
    tokenUsage: number;
  };
}

// ============================================================================
// 内部状态类型
// ============================================================================

export interface SlidesTeamState {
  executionId: string;
  sessionId: string;
  phase: SlidesTeamPhase;
  progress: number;
  startTime: Date;
  phaseStartTime: Date;

  // 各阶段结果
  analysisResult?: AnalysisResult;
  planningResult?: PlanningResult;
  generationResult?: GenerationResult;
  reviewResult?: ReviewResult;

  // 错误信息
  error?: {
    message: string;
    phase: SlidesTeamPhase;
    stack?: string;
  };
}

export interface AnalysisResult {
  topics: string[];
  keyEntities: string[];
  dataPoints: Array<{
    type: string;
    value: string;
    context: string;
  }>;
  keyInsights: string[];
  sourceWordCount: number;
  suggestedPages: number;
}

export interface PlanningResult {
  totalPages: number;
  chapters: Array<{
    id: string;
    title: string;
    pageRange: [number, number];
  }>;
  designStrategy: {
    colorScheme: string;
    accentColor: string;
    styleReference: string;
  };
  pageOutlines: Array<{
    pageNumber: number;
    templateType: string;
    title: string;
    keyElements: string[];
  }>;
}

export interface GenerationResult {
  pages: Array<{
    pageNumber: number;
    title: string;
    content: unknown;
    html: string;
  }>;
  totalContentLength: number;
}

export interface ReviewResult {
  overallScore: number;
  issuesFound: number;
  issuesFixed: number;
  pageScores: Array<{
    pageNumber: number;
    score: number;
    issues: string[];
  }>;
}
