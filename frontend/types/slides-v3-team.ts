/**
 * Slides Engine v3.0 - Team SSE 类型定义
 *
 * 对应后端 slides-team.types.ts
 */

// ============================================================================
// Agent 定义
// ============================================================================

export type SlidesAgentRole =
  | 'leader' // 协调者 - 分解任务、汇总结果
  | 'analyst' // 分析师 - 分析源内容
  | 'strategist' // 策略师 - 设计策略
  | 'writer' // 写手 - 内容生成
  | 'reviewer'; // 审核员 - 质量检查

export interface SlidesAgentConfig {
  role: SlidesAgentRole;
  name: string;
  description: string;
  icon: string; // Lucide icon name
}

// 5 个 Agent 配置
export const SLIDES_TEAM_AGENTS: SlidesAgentConfig[] = [
  {
    role: 'leader',
    name: 'Slides Architect',
    description: '协调整个 PPT 生成流程',
    icon: 'Crown',
  },
  {
    role: 'analyst',
    name: 'Content Analyst',
    description: '分析源文本，提取关键信息',
    icon: 'Search',
  },
  {
    role: 'strategist',
    name: 'Visual Strategist',
    description: '确定设计策略和模板',
    icon: 'Palette',
  },
  {
    role: 'writer',
    name: 'Content Writer',
    description: '生成每页的具体内容',
    icon: 'PenTool',
  },
  {
    role: 'reviewer',
    name: 'Quality Reviewer',
    description: '检查内容质量和一致性',
    icon: 'CheckCircle',
  },
];

// ============================================================================
// 执行状态
// ============================================================================

export type SlidesTeamPhase =
  | 'initializing' // 初始化
  | 'analyzing' // 内容分析
  | 'planning' // 结构规划
  | 'generating' // 内容生成
  | 'rendering' // 渲染 HTML
  | 'reviewing' // 质量审核
  | 'completed' // 完成
  | 'failed'; // 失败

// ============================================================================
// SSE 事件类型
// ============================================================================

export type SlidesTeamEventType =
  // 执行生命周期
  | 'execution:started'
  | 'execution:completed'
  | 'execution:failed'
  // 阶段变化
  | 'phase:started'
  | 'phase:progress'
  | 'phase:completed'
  // Agent 活动
  | 'agent:thinking'
  | 'agent:working'
  | 'agent:completed'
  | 'agent:handoff' // Agent 交接
  // 内容生成
  | 'slide:generating'
  | 'slide:generated'
  // 质量检查
  | 'review:issue_found'
  | 'review:auto_fixed'
  // 心跳
  | 'heartbeat';

export interface SlidesTeamEvent {
  type: SlidesTeamEventType;
  timestamp: string;
  executionId: string;
  data: SlidesTeamEventData;
}

// ============================================================================
// 事件数据类型
// ============================================================================

export type SlidesTeamEventData =
  | ExecutionStartedData
  | ExecutionCompletedData
  | ExecutionFailedData
  | PhaseStartedData
  | PhaseProgressData
  | PhaseCompletedData
  | AgentThinkingData
  | AgentWorkingData
  | AgentCompletedData
  | AgentHandoffData
  | SlideGeneratingData
  | SlideGeneratedData
  | ReviewIssueData
  | ReviewFixedData
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
  html?: string;
}

export interface ReviewIssueData {
  pageNumber: number;
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
}

export interface ReviewFixedData {
  pageNumber: number;
  issueType: string;
  fixDescription: string;
}

export interface HeartbeatData {
  phase: SlidesTeamPhase;
  progress: number;
  activeAgent?: SlidesAgentRole;
}

// ============================================================================
// Agent 状态（前端 UI 用）
// ============================================================================

export interface AgentState {
  role: SlidesAgentRole;
  name: string;
  status: 'idle' | 'thinking' | 'working' | 'completed' | 'error';
  currentTask?: string;
  thought?: string;
  progress?: number;
  duration?: number;
  result?: string;
}

export interface TeamExecutionState {
  executionId: string;
  sessionId: string;
  phase: SlidesTeamPhase;
  phaseProgress: number;
  overallProgress: number;
  agents: Record<SlidesAgentRole, AgentState>;
  currentAgent?: SlidesAgentRole;
  handoffs: AgentHandoffData[];
  issues: ReviewIssueData[];
  fixes: ReviewFixedData[];
}

// ============================================================================
// API 请求类型
// ============================================================================

export interface GenerateTeamRequest {
  sourceText: string;
  userRequirement?: string;
  targetPages?: number;
  stylePreference?: 'dark' | 'light' | 'custom';
  targetAudience?: string;
  themeId?: string;
}
