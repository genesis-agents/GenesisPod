/**
 * Action — Agent 在每次 loop 迭代里决定做的事
 */

/** Action 的四种大类 */
export type ActionKind =
  | "tool_call" // 调用 tool（ToolRegistry）
  | "skill_invoke" // 激活某个 skill
  | "subagent_spawn" // 派生子 agent
  | "llm_generate" // 直接 LLM 生成（无 tool）
  | "finalize"; // 终止并产出结果

export interface IToolCallAction {
  kind: "tool_call";
  toolId: string;
  input: Record<string, unknown>;
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
}
