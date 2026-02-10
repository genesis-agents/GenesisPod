/**
 * Interactive Research Types
 *
 * P0: 交互式研究流程
 * 支持研究过程中的用户交互：暂停、调整方向、追问、审批
 */

/**
 * 交互类型
 */
export enum InteractionType {
  /** 暂停研究 */
  PAUSE = "pause",
  /** 恢复研究 */
  RESUME = "resume",
  /** 调整研究方向 */
  REDIRECT = "redirect",
  /** 用户追问 */
  FOLLOW_UP = "follow_up",
  /** 审批中间结果 */
  APPROVE = "approve",
  /** 拒绝中间结果 */
  REJECT = "reject",
  /** 添加新维度 */
  ADD_DIMENSION = "add_dimension",
  /** 移除维度 */
  REMOVE_DIMENSION = "remove_dimension",
  /** 调整深度 */
  ADJUST_DEPTH = "adjust_depth",
  /** 添加约束 */
  ADD_CONSTRAINT = "add_constraint",
}

/**
 * 交互请求
 */
export interface InteractionRequest {
  /** 研究任务 ID */
  missionId: string;
  /** 专题 ID */
  topicId: string;
  /** 用户 ID */
  userId: string;
  /** 交互类型 */
  type: InteractionType;
  /** 交互内容 */
  payload: InteractionPayload;
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 交互载荷（按类型区分）
 */
export type InteractionPayload =
  | PausePayload
  | ResumePayload
  | RedirectPayload
  | FollowUpPayload
  | ApprovePayload
  | RejectPayload
  | AddDimensionPayload
  | RemoveDimensionPayload
  | AdjustDepthPayload
  | AddConstraintPayload;

export interface PausePayload {
  type: InteractionType.PAUSE;
  reason?: string;
}

export interface ResumePayload {
  type: InteractionType.RESUME;
}

export interface RedirectPayload {
  type: InteractionType.REDIRECT;
  newDirection: string;
  affectedDimensions?: string[];
}

export interface FollowUpPayload {
  type: InteractionType.FOLLOW_UP;
  question: string;
  context?: string;
  targetDimensionId?: string;
}

export interface ApprovePayload {
  type: InteractionType.APPROVE;
  targetId: string;
  comment?: string;
}

export interface RejectPayload {
  type: InteractionType.REJECT;
  targetId: string;
  reason: string;
  suggestions?: string[];
}

export interface AddDimensionPayload {
  type: InteractionType.ADD_DIMENSION;
  dimensionName: string;
  dimensionDescription: string;
  searchQueries?: string[];
}

export interface RemoveDimensionPayload {
  type: InteractionType.REMOVE_DIMENSION;
  dimensionId: string;
  reason?: string;
}

export interface AdjustDepthPayload {
  type: InteractionType.ADJUST_DEPTH;
  newDepth: "quick" | "standard" | "deep" | "comprehensive";
  dimensionId?: string;
}

export interface AddConstraintPayload {
  type: InteractionType.ADD_CONSTRAINT;
  constraint: string;
  scope: "global" | "dimension";
  dimensionId?: string;
}

/**
 * 交互响应
 */
export interface InteractionResponse {
  /** 是否成功 */
  success: boolean;
  /** 交互类型 */
  type: InteractionType;
  /** 响应消息 */
  message: string;
  /** 研究状态变化 */
  stateChange?: ResearchStateChange;
  /** 后续动作建议 */
  suggestedActions?: string[];
}

/**
 * 研究状态变化
 */
export interface ResearchStateChange {
  previousState: ResearchState;
  newState: ResearchState;
  affectedDimensions?: string[];
  addedDimensions?: string[];
  removedDimensions?: string[];
}

/**
 * 研究状态
 */
export enum ResearchState {
  PLANNING = "planning",
  RESEARCHING = "researching",
  PAUSED = "paused",
  REVIEWING = "reviewing",
  REDIRECTING = "redirecting",
  SYNTHESIZING = "synthesizing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * 交互检查点
 */
export interface InteractionCheckpoint {
  missionId: string;
  checkpointId: string;
  phase: string;
  progress: number;
  completedDimensions: string[];
  pendingDimensions: string[];
  interimFindings: string[];
  timestamp: Date;
}
