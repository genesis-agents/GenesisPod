/**
 * Agent runner 契约
 *
 * 每个 Core Agent 都实现 AgentRunner<TInput, TOutput>：
 * - id: 唯一标识（对应 02-target-architecture 的 AG-XX-YY）
 * - accessTools: access matrix 白名单（对应 02-target-architecture §4）
 * - run(input, identity, signal): 产出 Zod 校验过的结构化 output
 *
 * 基类 `BaseAgentRunner` 负责：
 * - 检查 signal.aborted
 * - stub 模式短路（HARNESS_AGENTS_STUB=1）
 * - LLM 调用（委托 AiChatService）
 * - Zod 解析 + 业务规则校验（custom validate）
 * - Budget charge（tokens/cost）
 */

import type { z } from "zod";
import type { PipelineIdentityContext } from "../../pipeline/types";

/** Access matrix tool id（对应 02 文档；后续 PR 接真 ToolRegistry 时强约束） */
export type AccessToolId =
  | "short-term-memory"
  | "long-term-memory"
  | "rag-search"
  | "knowledge-graph"
  | "web-search"
  | "TL-02-EVSAVE"
  | "TL-03-FIGEXT"
  | "TL-04-DIMMEM"
  | "TL-06-SEARCHMULTI"
  | "TL-07-MODEL";

export interface AgentRunContext<TInput> {
  readonly input: TInput;
  readonly identity: PipelineIdentityContext;
  readonly signal: AbortSignal;
}

export interface AgentRunResult<TOutput> {
  readonly agentId: string;
  readonly output: TOutput;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly stub: boolean;
}

export interface AgentRunner<TInput, TOutput> {
  readonly id: string; // AG-XX-YY
  readonly name: string;
  readonly tools: ReadonlyArray<AccessToolId>;
  /** 用于 access matrix 强校验 */
  readonly forbiddenTools?: ReadonlyArray<AccessToolId>;
  readonly outputSchema: z.ZodType<TOutput>;

  run(ctx: AgentRunContext<TInput>): Promise<AgentRunResult<TOutput>>;
}

export class AgentAccessDeniedError extends Error {
  constructor(agentId: string, tool: string) {
    super(
      `[${agentId}] access denied to tool "${tool}" (not in whitelist / explicitly forbidden)`,
    );
    this.name = "AgentAccessDeniedError";
  }
}

/** 判断 agent 是否有权限使用某工具；stage 调用前必须检查 */
export function canUseTool(
  runner: AgentRunner<unknown, unknown>,
  tool: AccessToolId,
): boolean {
  if (runner.forbiddenTools?.includes(tool)) return false;
  return runner.tools.includes(tool);
}

/** stub 模式开关（测试 / CI 默认开启） */
export function isStubMode(): boolean {
  return process.env.HARNESS_AGENTS_STUB !== "0";
}
