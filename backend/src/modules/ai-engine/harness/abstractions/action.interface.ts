/**
 * Action — Agent 在每次 loop 迭代里决定做的事
 */

/** Action 的六种大类 */
export type ActionKind =
  | "tool_call" // 调用单个 tool
  | "parallel_tool_call" // 并行调用多个 tool（SOTA：一轮 LLM 触发多 tool）
  | "skill_invoke" // 激活某个 skill
  | "subagent_spawn" // 派生子 agent
  | "llm_generate" // 直接 LLM 生成（无 tool）
  | "finalize"; // 终止并产出结果

export interface IToolCallAction {
  kind: "tool_call";
  toolId: string;
  input: Record<string, unknown>;
  /** 可选 callId，用于关联 LLM tool_use_id（native function calling 透传） */
  callId?: string;
}

/**
 * 并行 tool 调用 —— LLM 在同一轮决策里产出 N 个 tool_call。
 * Loop 用 ToolInvoker.invokeMany 并行执行，全部完成后将每个结果各自写回 envelope。
 */
export interface IParallelToolCallAction {
  kind: "parallel_tool_call";
  calls: readonly IToolCallAction[];
  /** 并发上限；默认 5。超出按批执行。 */
  maxConcurrency?: number;
}

export interface ISkillInvokeAction {
  kind: "skill_invoke";
  skillId: string;
  input?: Record<string, unknown>;
}

export interface ISubagentSpawnAction {
  kind: "subagent_spawn";
  name: string;
  prompt: string;
  isolation?: "none" | "context" | "worktree";
  budget?: { tokens?: number; iterations?: number };
}

export interface ILlmGenerateAction {
  kind: "llm_generate";
  prompt: string;
}

export interface IFinalizeAction {
  kind: "finalize";
  output: string | Record<string, unknown>;
}

export type IAction =
  | IToolCallAction
  | IParallelToolCallAction
  | ISkillInvokeAction
  | ISubagentSpawnAction
  | ILlmGenerateAction
  | IFinalizeAction;

/** Action 执行结果 */
export interface IActionResult {
  readonly action: IAction;
  readonly output: unknown;
  readonly error?: Error;
  readonly latencyMs: number;
  readonly tokensUsed?: number;
  /**
   * 并行 tool 执行时的子结果数组（kind === "parallel_tool_call" 才有）。
   * 每个子结果对应 calls[i] 的执行情况；output 字段汇总每个 call 的 output。
   */
  readonly subResults?: readonly IActionResult[];
}
