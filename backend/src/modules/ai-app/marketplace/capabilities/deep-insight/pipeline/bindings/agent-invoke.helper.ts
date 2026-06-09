/**
 * agent-invoke.helper —— bindings 内统一的 AgentRunner 调用封装。
 *
 * 所有 14 阶段 binding 跑共享 @DefineAgent 都经此 helper：
 *   - 解析 spec（resolveAgentSpec，与 playground / company 同一份 agent-spec-catalog）
 *   - 透传 RunOptions（userId / preferredModelId / signal / billingMeta / onEvent relay）
 *   - 把 tokens / cost 累计进 CrossStageState（deep-insight.tokensUsed / .costCents）
 *   - 不碰 provider/model 硬编码（preferredModelId 缺省即走 TaskProfile + BYOK）
 */
import type {
  AgentRunner,
  CrossStageState,
  IAgentEvent,
} from "@/modules/ai-harness/facade";
import { resolveAgentSpec } from "@/modules/ai-app/contracts/agent-spec-catalog";
import { CS_KEY, type AgentInvocation } from "../ports";

/** agentRunner.run 的最小返回投影（只取 bindings 用到的字段）。 */
export interface AgentRunProjection {
  readonly output: unknown;
  readonly state: "completed" | "failed" | "cancelled" | "degraded";
  readonly tokensUsed: { total: number };
  readonly costCents: number;
}

/**
 * 跑一个共享 agent，累计算力到 crossState。
 * spec 未沉淀 → 抛错（recipe 已声明的角色必须可解析）。
 */
export async function invokeAgent(args: {
  runner: AgentRunner;
  specId: string;
  input: Record<string, unknown>;
  invocation: AgentInvocation;
  crossStageState: CrossStageState;
  signal?: AbortSignal;
  stepId: string;
  role: string;
  dimension?: string;
  operationType: string;
}): Promise<AgentRunProjection> {
  const Spec = resolveAgentSpec(args.specId);
  if (!Spec) {
    throw new Error(
      `[deep-insight] agent spec "${args.specId}" 未在 agent-spec-catalog 沉淀`,
    );
  }
  const { invocation } = args;
  const res = await args.runner.run(Spec, args.input, {
    userId: invocation.userId,
    ...(invocation.preferredModelId
      ? { preferredModelId: invocation.preferredModelId }
      : {}),
    ...(args.signal ? { signal: args.signal } : {}),
    billingMeta: {
      moduleType: "marketplace-deep-insight",
      operationType: args.operationType,
    },
    onEvent: (ev: IAgentEvent) => {
      invocation.onAgentEvent?.(args.stepId, args.role, args.dimension, ev);
    },
  });
  const tokens = res.tokensUsed?.total ?? 0;
  const cost = res.costCents ?? 0;
  if (tokens) args.crossStageState.incr(CS_KEY.tokensUsed, tokens);
  if (cost) args.crossStageState.incr(CS_KEY.costCents, cost);
  return {
    output: res.output,
    state: res.state,
    tokensUsed: { total: tokens },
    costCents: cost,
  };
}
