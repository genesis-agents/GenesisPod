/**
 * Agent 类型定义
 * 基于 Genspark 架构设计的 Agent 矩阵系统
 */

// ==================== Agent 类型枚举 ====================

/**
 * Agent 类型
 */
export enum AgentType {
  SLIDES = "SLIDES",
  DOCS = "DOCS",
  DESIGNER = "DESIGNER",
  DEVELOPER = "DEVELOPER",
}

/**
 * 任务状态
 */
export enum AgentTaskStatus {
  PENDING = "PENDING",
  PLANNING = "PLANNING",
  EXECUTING = "EXECUTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/**
 * 工具类型
 * 完整的工具类型定义，涵盖 8 大类别共 48 种工具
 */
export enum ToolType {
  // ============================================================================
  // 1. 信息获取 (Information Retrieval)
  // ============================================================================
  WEB_SEARCH = "web_search",
  WEB_SCRAPER = "web_scraper",
  DATA_FETCH = "data_fetch",
  RAG_SEARCH = "rag_search",
  DATABASE_QUERY = "database_query",
  KNOWLEDGE_GRAPH = "knowledge_graph",

  // ============================================================================
  // 2. 内容生成 (Content Generation)
  // ============================================================================
  TEXT_GENERATION = "text_generation",
  IMAGE_GENERATION = "image_generation",
  CODE_GENERATION = "code_generation",
  AUDIO_GENERATION = "audio_generation",
  VIDEO_GENERATION = "video_generation",
  STRUCTURED_OUTPUT = "structured_output",

  // ============================================================================
  // 3. 数据处理 (Data Processing)
  // ============================================================================
  DATA_ANALYSIS = "data_analysis",
  FILE_CONVERSION = "file_conversion",
  FILE_PARSER = "file_parser",
  DATA_VALIDATION = "data_validation",
  DATA_CLEANING = "data_cleaning",
  DOCUMENT_DIFF = "document_diff",
  TEMPLATE_RENDER = "template_render",

  // ============================================================================
  // 4. 代码执行 (Code Execution)
  // ============================================================================
  PYTHON_EXECUTOR = "python_executor",
  JAVASCRIPT_EXECUTOR = "javascript_executor",
  SQL_EXECUTOR = "sql_executor",
  SHELL_EXECUTOR = "shell_executor",
  CONTAINER_EXECUTOR = "container_executor",
  OCR_RECOGNITION = "ocr_recognition",

  // ============================================================================
  // 5. 外部集成 (External Integration)
  // ============================================================================
  MESSAGE_PUSH = "message_push",
  CLOUD_STORAGE = "cloud_storage",
  GITHUB_INTEGRATION = "github_integration",
  EMAIL_SENDER = "email_sender",
  CALENDAR_INTEGRATION = "calendar_integration",
  WEBHOOK_TRIGGER = "webhook_trigger",

  // ============================================================================
  // 6. 记忆管理 (Memory Management)
  // ============================================================================
  SHORT_TERM_MEMORY = "short_term_memory",
  LONG_TERM_MEMORY = "long_term_memory",
  ENTITY_MEMORY = "entity_memory",
  KNOWLEDGE_BASE = "knowledge_base",
  USER_PREFERENCES = "user_preferences",

  // ============================================================================
  // 7. 导出 (Export)
  // ============================================================================
  EXPORT_PPTX = "export_pptx",
  EXPORT_DOCX = "export_docx",
  EXPORT_PDF = "export_pdf",
  EXPORT_IMAGE = "export_image",

  // ============================================================================
  // 8. Agent 协作 (Agent Collaboration)
  // ============================================================================
  AGENT_HANDOFF = "agent_handoff",
  HUMAN_APPROVAL = "human_approval",
  AGENT_COMMUNICATION = "agent_communication",
  TASK_DELEGATION = "task_delegation",
  CONSENSUS_MECHANISM = "consensus_mechanism",
  WORKFLOW_ORCHESTRATION = "workflow_orchestration",
}

/**
 * 产出物类型
 */
export enum ArtifactType {
  PPTX = "PPTX",
  DOCX = "DOCX",
  PDF = "PDF",
  IMAGE = "IMAGE",
  CODE = "CODE",
  DATA = "DATA",
}

/**
 * AI 模型类型
 */
export enum AIModelType {
  CHAT = "chat", // 高级推理模型 (GPT-4, Claude Opus)
  CHAT_FAST = "chat_fast", // 快速模型 (GPT-4o-mini, Claude Haiku)
  MULTIMODAL = "multimodal", // 多模态模型 (Gemini 2.0)
  EMBEDDING = "embedding", // 嵌入模型
  IMAGE = "image", // 图像生成模型
}

// ==================== Agent 输入/输出 ====================

/**
 * 上传的文件
 */
export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  content?: Buffer;
}

/**
 * Agent 输入
 */
export interface AgentInput {
  prompt: string;
  files?: UploadedFile[];
  urls?: string[];
  resourceIds?: string[];
  templateId?: string;
  options?: Record<string, unknown>;
}

/**
 * 执行计划步骤
 */
export interface PlanStep {
  id: string;
  name: string;
  description: string;
  tool?: ToolType;
  model?: AIModelType;
  dependencies: string[];
  estimatedDuration: number; // 毫秒
}

/**
 * Agent 执行计划
 */
export interface AgentPlan {
  taskId: string;
  agentType: AgentType;
  steps: PlanStep[];
  estimatedTime: number; // 毫秒
  toolsRequired: ToolType[];
  modelsRequired: AIModelType[];
  metadata?: Record<string, unknown>;
}

/**
 * Agent 模板
 */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  defaultPrompt?: string;
  defaultOptions?: Record<string, unknown>;
}

/**
 * Agent 产出物
 */
export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Agent 结果
 */
export interface AgentResult {
  success: boolean;
  artifacts: Artifact[];
  summary?: string;
  tokensUsed: number;
  duration: number; // 毫秒
  error?: string;
}

// ==================== Agent 事件 (流式输出) ====================

/**
 * 计划就绪事件
 */
export interface PlanReadyEvent {
  type: "plan_ready";
  plan: AgentPlan;
}

/**
 * 步骤开始事件
 */
export interface StepStartEvent {
  type: "step_start";
  stepId: string;
  message: string;
}

/**
 * 步骤进度事件
 */
export interface StepProgressEvent {
  type: "step_progress";
  stepId: string;
  progress: number; // 0-100
  message: string;
}

/**
 * 步骤完成事件
 */
export interface StepCompleteEvent {
  type: "step_complete";
  stepId: string;
  result: unknown;
}

/**
 * 工具调用事件
 */
export interface ToolCallEvent {
  type: "tool_call";
  tool: ToolType;
  input: unknown;
}

/**
 * 工具结果事件
 */
export interface ToolResultEvent {
  type: "tool_result";
  tool: ToolType;
  output: unknown;
  duration: number; // 毫秒
}

/**
 * 产出物生成事件
 */
export interface ArtifactEvent {
  type: "artifact";
  artifact: Artifact;
}

/**
 * 完成事件
 */
export interface CompleteEvent {
  type: "complete";
  result: AgentResult;
}

/**
 * 错误事件
 */
export interface ErrorEvent {
  type: "error";
  error: string;
  stepId?: string;
}

/**
 * 所有 Agent 事件的联合类型
 */
export type AgentEvent =
  | PlanReadyEvent
  | StepStartEvent
  | StepProgressEvent
  | StepCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | ArtifactEvent
  | CompleteEvent
  | ErrorEvent;

// ==================== Agent 配置 ====================

/**
 * Agent 配置
 */
export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  icon: string;
  color: string;
  capabilities: string[];
  templates: AgentTemplate[];
}

/**
 * 预定义的 Agent 配置
 */
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  [AgentType.SLIDES]: {
    type: AgentType.SLIDES,
    name: "AI Slides",
    description: "智能 PPT 生成器，快速创建专业演示文稿",
    icon: "📊",
    color: "#3B82F6", // blue-500
    capabilities: ["自动生成大纲", "智能配图", "多种主题风格", "导出 PPTX"],
    templates: [],
  },
  [AgentType.DOCS]: {
    type: AgentType.DOCS,
    name: "AI Docs",
    description: "智能文档助手，撰写专业文档报告",
    icon: "📄",
    color: "#10B981", // emerald-500
    capabilities: ["自动调研资料", "生成大纲", "撰写内容", "导出 Word/PDF"],
    templates: [],
  },
  [AgentType.DESIGNER]: {
    type: AgentType.DESIGNER,
    name: "AI Designer",
    description: "智能设计工具，生成创意设计图",
    icon: "🎨",
    color: "#F59E0B", // amber-500
    capabilities: ["海报设计", "Logo 设计", "Banner 生成", "多风格变体"],
    templates: [],
  },
  [AgentType.DEVELOPER]: {
    type: AgentType.DEVELOPER,
    name: "AI Developer",
    description: "智能代码助手，生成高质量代码",
    icon: "💻",
    color: "#8B5CF6", // violet-500
    capabilities: ["代码生成", "代码解释", "代码重构", "单元测试"],
    templates: [],
  },
};
