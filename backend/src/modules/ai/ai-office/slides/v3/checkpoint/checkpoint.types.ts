/**
 * Slides Engine v3.0 - Checkpoint Types
 *
 * 检查点系统类型定义，支持版本管理和回滚
 */

import { AIModelType } from "@prisma/client";

// ============================================================================
// Checkpoint Core Types
// ============================================================================

/**
 * 检查点类型枚举
 */
export type CheckpointType =
  | "task_decomposition" // 任务分解完成
  | "outline_confirmed" // 大纲确认
  | "page_rendered" // 单页渲染完成
  | "batch_rendered" // 批量渲染完成
  | "user_modified" // 用户手动修改
  | "auto_save"; // 自动保存

/**
 * 检查点接口
 */
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

/**
 * 检查点状态 - 包含完整的生成状态
 */
export interface CheckpointState {
  taskDecomposition?: TaskDecomposition;
  outlinePlan?: OutlinePlan;
  pages: PageState[];
  conversation: ConversationMessage[];
  globalStyles?: GlobalStyles;
}

/**
 * 检查点元数据
 */
export interface CheckpointMetadata {
  previousCheckpointId?: string;
  trigger: "auto" | "user";
  description?: string;
  tags?: string[];
  modelUsed?: string;
  tokensUsed?: number;
  durationMs?: number;
}

// ============================================================================
// Task Decomposition Types (Phase 1)
// ============================================================================

/**
 * 任务分解结果
 */
export interface TaskDecomposition {
  totalPages: number;
  chapters: Chapter[];
  todoList: TodoItem[];
  designStrategy: DesignStrategy;
  sourceAnalysis?: SourceAnalysis;
}

/**
 * 章节定义
 */
export interface Chapter {
  id: string;
  title: string;
  pageRange: [number, number];
  keyPoints: string[];
  emphasis?: "high" | "medium" | "low";
}

/**
 * 待办事项
 */
export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  pageNumber?: number;
}

/**
 * 设计策略
 */
export interface DesignStrategy {
  colorScheme: "dark" | "light" | "custom";
  accentColor: string;
  styleReference: string;
  fontFamily?: string;
  targetAudience?: string;
}

/**
 * 源内容分析
 */
export interface SourceAnalysis {
  totalWords: number;
  language: string;
  topics: string[];
  dataPoints: DataPoint[];
  quotes: string[];
  keyInsights: string[];
}

/**
 * 数据点
 */
export interface DataPoint {
  type: "percentage" | "currency" | "number" | "date" | "comparison";
  value: string;
  context: string;
  source?: string;
}

// ============================================================================
// Outline Planning Types (Phase 2)
// ============================================================================

/**
 * 大纲规划结果
 */
export interface OutlinePlan {
  title: string;
  pages: PageOutline[];
  globalStyles: GlobalStyles;
  contentFlow: ContentFlowAnalysis;
}

/**
 * 页面大纲
 */
export interface PageOutline {
  pageNumber: number;
  title: string;
  subtitle?: string;
  templateType: PageTemplateType;
  contentBrief: string;
  keyElements: string[];
  layoutHints: LayoutHint[];
  dataRequirements?: DataRequirement[];
  imageRequirements?: ImageRequirement[];
  sourceRef?: string;
}

/**
 * 15种页面模板类型
 */
export type PageTemplateType =
  | "cover"
  | "toc"
  | "questions"
  | "pillars"
  | "framework"
  | "timeline"
  | "evolutionRoadmap"
  | "dashboard"
  | "comparison"
  | "splitLayout"
  | "caseStudy"
  | "multiColumn"
  | "recommendations"
  | "maturityModel"
  | "riskOpportunity";

/**
 * 布局提示
 */
export interface LayoutHint {
  type: "alignment" | "spacing" | "emphasis" | "ratio";
  value: string;
  description?: string;
}

/**
 * 数据需求
 */
export interface DataRequirement {
  type: "chart" | "table" | "metric" | "list";
  description: string;
  mustInclude: boolean;
  sourceRef?: string;
}

/**
 * 图像需求
 */
export interface ImageRequirement {
  position: "background" | "inline" | "card" | "icon";
  semanticContext: string;
  style?: string;
  optional: boolean;
}

/**
 * 全局样式
 */
export interface GlobalStyles {
  backgroundColor: string;
  cardBackground: string;
  borderColor: string;
  accentColor: string;
  secondaryAccent: string;
  textPrimary: string;
  textSecondary: string;
  fontFamily: string;
  canvasWidth: number;
  canvasHeight: number;
  pagePadding: string;
  bottomSafeZone: number;
}

/**
 * 内容流分析
 */
export interface ContentFlowAnalysis {
  narrativeArc: "problem-solution" | "chronological" | "topical" | "comparison";
  keyTransitions: string[];
  climaxPage?: number;
  conclusionStyle: "summary" | "cta" | "recommendations";
}

// ============================================================================
// Page Rendering Types (Phase 3)
// ============================================================================

/**
 * 页面状态
 */
export interface PageState {
  pageNumber: number;
  outline: PageOutline;
  content?: PageContent;
  design?: PageDesign;
  html?: string;
  images?: GeneratedImage[];
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
}

/**
 * 页面内容 (Writer 输出)
 */
export interface PageContent {
  title: string;
  subtitle?: string;
  sections: ContentSection[];
  footer?: string;
  citations?: string[];
}

/**
 * 内容区块
 */
export interface ContentSection {
  type: "text" | "list" | "quote" | "stat" | "chart" | "image";
  position: "left" | "right" | "center" | "full";
  content: string | string[] | StatContent | ChartContent;
}

/**
 * 统计内容
 */
export interface StatContent {
  value: string;
  label: string;
  trend?: "up" | "down" | "neutral";
  change?: string;
}

/**
 * 图表内容
 */
export interface ChartContent {
  type: "bar" | "line" | "pie" | "radar";
  data: Record<string, number | string>[];
  title?: string;
}

/**
 * 页面设计 (Renderer 四步设计输出)
 */
export interface PageDesign {
  step1_drafting: {
    style: string;
    coreElements: string[];
    mood: string;
  };
  step2_refiningLayout: {
    alignment: string;
    graphicsPosition: string;
    spacing: string;
    ratio?: string;
  };
  step3_planningVisuals: {
    backgroundColor: string;
    accentColors: string[];
    decorations: string[];
    shadows?: string;
  };
  step4_formulatingHTML: {
    html: string;
    css?: string;
    externalDependencies: string[];
  };
}

/**
 * 生成的图像
 */
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  semanticContext: string;
  position: "background" | "inline" | "card" | "icon";
  width?: number;
  height?: number;
  generatedAt: Date;
}

// ============================================================================
// Conversation Types
// ============================================================================

/**
 * 对话消息
 */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: ToolType;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 工具类型
 */
export type ToolType = "think" | "search" | "docview" | "write" | "render";

// ============================================================================
// Session Types
// ============================================================================

/**
 * Slides 会话
 */
export interface SlidesSession {
  id: string;
  userId: string;
  title: string;
  status: "active" | "completed" | "archived";
  currentCheckpointId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Model Role Types
// ============================================================================

/**
 * 角色类型
 */
export type SlidesRole =
  | "architect"
  | "writer"
  | "renderer"
  | "image"
  | "reviewer";

/**
 * 角色配置
 */
export interface RoleConfig {
  role: SlidesRole;
  modelType: AIModelType;
  strategy: "DEFAULT" | "COST_OPTIMIZED" | "QUALITY_FIRST" | "SPEED_FIRST";
  description: string;
}

/**
 * 角色配置映射
 */
export const ROLE_CONFIGS: Record<SlidesRole, RoleConfig> = {
  architect: {
    role: "architect",
    modelType: "CHAT" as AIModelType,
    strategy: "QUALITY_FIRST",
    description: "任务分解、大纲规划、质量审核",
  },
  writer: {
    role: "writer",
    modelType: "CHAT_FAST" as AIModelType,
    strategy: "COST_OPTIMIZED",
    description: "内容填充、文案润色",
  },
  renderer: {
    role: "renderer",
    modelType: "CHAT" as AIModelType,
    strategy: "QUALITY_FIRST",
    description: "四步设计、HTML生成",
  },
  image: {
    role: "image",
    modelType: "IMAGE_GENERATION" as AIModelType,
    strategy: "DEFAULT",
    description: "图像生成",
  },
  reviewer: {
    role: "reviewer",
    modelType: "CHAT" as AIModelType,
    strategy: "QUALITY_FIRST",
    description: "质量检查、一致性验证",
  },
};

// ============================================================================
// Stream Event Types
// ============================================================================

/**
 * 流事件类型
 */
export type StreamEventType =
  | "session_created"
  | "phase_started"
  | "phase_completed"
  | "tool_call_started"
  | "tool_call_completed"
  | "checkpoint_created"
  | "page_started"
  | "page_completed"
  | "progress_update"
  | "heartbeat"
  | "error"
  | "complete";

/**
 * 流事件
 */
export interface StreamEvent {
  type: StreamEventType;
  timestamp: Date;
  data: unknown;
  sessionId: string;
  checkpointId?: string;
}

// ============================================================================
// Quality Report Types
// ============================================================================

/**
 * 质量报告
 */
export interface QualityReport {
  overall: "pass" | "warning" | "fail";
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
  checkedAt: Date;
}

/**
 * 质量问题
 */
export interface QualityIssue {
  type: "layout" | "content" | "image" | "consistency";
  severity: "error" | "warning" | "info";
  pageNumber?: number;
  description: string;
  suggestion?: string;
}

// ============================================================================
// Genspark Design System Constants
// ============================================================================

/**
 * Genspark 设计系统常量
 */
export const GENSPARK_DESIGN_SYSTEM: GlobalStyles = {
  backgroundColor: "#0F172A",
  cardBackground: "#1E293B",
  borderColor: "#334155",
  accentColor: "#D4AF37",
  secondaryAccent: "#3B82F6",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  fontFamily: "'Noto Sans SC', sans-serif",
  canvasWidth: 1280,
  canvasHeight: 720,
  pagePadding: "50px 80px 80px 80px",
  bottomSafeZone: 80,
};

/**
 * CDN 资源
 */
export const CDN_RESOURCES = {
  tailwind:
    "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css",
  fontAwesome:
    "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css",
  echarts: "https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js",
  notoSansSC:
    "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap",
};
