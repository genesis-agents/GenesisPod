/**
 * Context Envelope — Agent 的显式上下文容器
 *
 * SOTA 2026 关键概念（Context Engineering）：
 * 上下文不再隐式散落在参数里，而是作为一等公民，支持 fork / compact / prune。
 */

export interface IContextMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string; // tool 调用时的工具名
  toolCallId?: string;
  timestamp?: number;
}

/** 注入上下文的系统提醒（类似 Claude Code 的 <system-reminder>） */
export interface ISystemReminder {
  source: string; // 产生方，用于追溯
  priority: "low" | "medium" | "high";
  content: string;
  transient?: boolean; // 是否只对本次 turn 生效
}

/** 运行预算快照 */
export interface IBudgetSnapshot {
  tokensUsed: number;
  tokensRemaining: number;
  iterationsUsed: number;
  iterationsRemaining: number;
  wallTimeStartMs: number;
}

/** Memory 挂载点（运行时由 memory-bridge 填充） */
export interface IMemoryBinding {
  sessionId: string;
  userId?: string;
  workingMemoryKey?: string;
  longTermScope?: string;
}

/**
 * Context Envelope —— Agent 的一次运行所需的全部上下文。
 *
 * 可以被 fork（给 subagent）、compact（长对话压缩）、prune（按优先级裁剪）。
 */
export interface IContextEnvelope {
  readonly id: string;
  readonly system: string; // 系统提示词
  readonly messages: readonly IContextMessage[];
  readonly reminders: readonly ISystemReminder[];
  readonly tools: readonly string[]; // 可用 tool id 列表
  readonly memory: IMemoryBinding;
  readonly budget: IBudgetSnapshot;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Envelope 变更操作的返回值（不可变语义） */
export interface IContextMutation {
  readonly envelope: IContextEnvelope;
  readonly diff: {
    addedMessages?: number;
    addedReminders?: number;
    compactedTokens?: number;
    prunedMessages?: number;
  };
}
