/**
 * Slides Team Orchestrator 类型定义
 *
 * 基于 AI Teams 的 Leader 协调模式
 * 实现动态任务规划、审核修订、质量审计
 */

import type { GeneratedSlide, PPTOutline } from "../types/slides.types";

// ============================================
// 团队成员定义
// ============================================

export type SlidesTeamMemberRole =
  | "leader"
  | "analyst"
  | "strategist"
  | "writer"
  | "reviewer";

export interface SlidesTeamMemberConfig {
  role: SlidesTeamMemberRole;
  name: string;
  description: string;
  skills: string[];
}

export const SLIDES_TEAM_MEMBERS: Record<
  SlidesTeamMemberRole,
  SlidesTeamMemberConfig
> = {
  leader: {
    role: "leader",
    name: "Slides Architect",
    description: "幻灯片架构师，负责规划、审核和综合",
    skills: ["task-planning", "quality-review", "task-assignment", "synthesis"],
  },
  analyst: {
    role: "analyst",
    name: "Content Analyst",
    description: "内容分析师，负责源文本分析和结构解析",
    skills: ["task-decomposition", "content-analyzer"],
  },
  strategist: {
    role: "strategist",
    name: "Visual Strategist",
    description: "视觉策略师，负责设计策略和模板选择",
    skills: ["outline-planning", "template-matcher", "page-type-selection"],
  },
  writer: {
    role: "writer",
    name: "Content Writer",
    description: "内容撰写师，负责页面内容生成和渲染",
    skills: [
      "four-step-design",
      "layout-optimizer",
      "chart-renderer",
      "image-fetcher",
      "content-compression",
      "data-supplement",
    ],
  },
  reviewer: {
    role: "reviewer",
    name: "Quality Reviewer",
    description: "质量审核员，负责一致性和质量检查",
    skills: ["terminology-unifier", "transition-checker", "quality-audit"],
  },
};

// ============================================
// 任务定义
// ============================================

export type SlidesTaskStatus =
  | "pending"
  | "in_progress"
  | "awaiting_review"
  | "revision_needed"
  | "completed"
  | "failed"
  | "cancelled";

export type SlidesTaskPriority = "critical" | "high" | "medium" | "low";

export interface SlidesTask {
  id: string;
  title: string;
  description: string;
  assignee: SlidesTeamMemberRole;
  skillId: string;
  input: unknown;
  dependencies: string[];
  status: SlidesTaskStatus;
  priority: SlidesTaskPriority;
  result?: unknown;
  revisionCount: number;
  maxRevisions: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  reviewFeedback?: string;
}

export interface TaskBreakdownItem {
  title: string;
  description: string;
  assignee: SlidesTeamMemberRole;
  skillId: string;
  priority: SlidesTaskPriority;
  dependsOn: number[];
  inputSpec: Record<string, unknown>;
}

export interface TaskBreakdown {
  understanding: string;
  tasks: TaskBreakdownItem[];
  executionPlan: string;
  risks: string;
}

// ============================================
// Mission 定义
// ============================================

export type SlidesMissionPhase =
  | "planning"
  | "executing"
  | "reviewing"
  | "auditing"
  | "synthesizing"
  | "completed"
  | "failed";

export type SlidesMissionStatus =
  | "pending"
  | "planning"
  | "in_progress"
  | "reviewing"
  | "auditing"
  | "synthesizing"
  | "completed"
  | "failed";

export interface SlidesMission {
  id: string;
  userId: string;
  sessionId: string;
  sourceText: string;
  userRequirement?: string;
  targetPages?: number;
  stylePreference?: "dark" | "light";
  themeId?: string;
  tasks: SlidesTask[];
  currentPhase: SlidesMissionPhase;
  status: SlidesMissionStatus;
  taskBreakdown?: TaskBreakdown;
  outline?: PPTOutline;
  pages: GeneratedSlide[];
  qualityAudit?: QualityAuditResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalTasks: number;
  completedTasks: number;
  metadata: Record<string, unknown>;
}

// ============================================
// 事件定义
// ============================================

export type SlidesMissionEventType =
  | "mission:created"
  | "mission:started"
  | "mission:phase_changed"
  | "mission:status_changed"
  | "mission:completed"
  | "mission:failed"
  | "planning:started"
  | "planning:completed"
  | "task:created"
  | "task:started"
  | "task:completed"
  | "task:awaiting_review"
  | "task:revision_needed"
  | "task:failed"
  | "review:started"
  | "review:approved"
  | "review:revision_requested"
  | "audit:started"
  | "audit:completed"
  | "synthesis:started"
  | "synthesis:completed"
  | "page:generated"
  | "progress";

export interface SlidesMissionEvent {
  type: SlidesMissionEventType;
  missionId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ============================================
// Leader 审核结果
// ============================================

export type ReviewDecision = "approved" | "revision_needed" | "failed";

export interface ReviewResult {
  decision: ReviewDecision;
  feedback: string;
  score?: number;
  suggestions?: string[];
}

// ============================================
// 质量审计结果
// ============================================

export interface QualityAuditResult {
  passed: boolean;
  overallScore: number;
  terminologyScore: number;
  transitionScore: number;
  consistencyScore: number;
  issues: SlidesQualityIssue[];
  suggestions: string[];
}

export interface SlidesQualityIssue {
  type: "terminology" | "transition" | "consistency" | "layout" | "content";
  severity: "critical" | "warning" | "info";
  pageIndex?: number;
  description: string;
  suggestion?: string;
}

// ============================================
// 错误追踪定义
// ============================================

export type SlidesExecutionErrorType =
  | "skill_not_found"
  | "execution_failed"
  | "review_failed"
  | "audit_failed"
  | "synthesis_failed";

export interface SlidesExecutionError {
  taskId: string;
  phase: SlidesMissionPhase;
  errorType: SlidesExecutionErrorType;
  message: string;
  timestamp: Date;
  retryCount: number;
  stack?: string;
}

// ============================================
// 输入/输出定义
// ============================================

export interface SlidesTeamOrchestratorInput {
  userId: string;
  sessionId: string;
  sourceText: string;
  userRequirement?: string;
  targetPages?: number;
  stylePreference?: "dark" | "light";
  themeId?: string;
  targetAudience?: string;
}

export interface SlidesTeamOrchestratorOutput {
  success: boolean;
  missionId: string;
  sessionId: string;
  pages: GeneratedSlide[];
  outline?: PPTOutline;
  qualityAudit?: QualityAuditResult;
  duration: number;
  error?: string;
}

// ============================================
// Skill 调用上下文
// ============================================

export interface SkillExecutionContext {
  missionId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  previousOutputs: Record<string, unknown>;
  globalContext: {
    sourceText: string;
    outline?: PPTOutline;
    themeId?: string;
    stylePreference?: "dark" | "light";
  };
}
