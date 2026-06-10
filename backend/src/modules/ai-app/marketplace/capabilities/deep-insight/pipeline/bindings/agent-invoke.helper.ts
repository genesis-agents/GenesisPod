/**
 * agent-invoke.helper —— bindings 内统一的 AgentRunner 调用封装。
 *
 * 所有 14 阶段 binding 跑共享 @DefineAgent 都经此 helper：
 *   - 解析 spec（resolveAgentSpec，与 playground / company 同一份 agent-spec-catalog）
 *   - 透传 RunOptions（userId / preferredModelId / signal / billingMeta / onEvent relay）
 *   - 把 tokens / cost 累计进 CrossStageState（deep-insight.tokensUsed / .costCents）
 *   - 每次 agent 调用完成后 emit "domain" agent:lifecycle 事件（tokensUsed/costCents）
 *   - 不碰 provider/model 硬编码（preferredModelId 缺省即走 TaskProfile + BYOK）
 */
import type {
  AgentRunner,
  CrossStageState,
  IAgentEvent,
} from "@/modules/ai-harness/facade";
import { resolveAgentSpec } from "@/modules/ai-app/contracts/agent-spec-catalog";
import type { CapabilityRunEvent } from "../../../../capability/capability-runner.port";
import { CS_KEY, type AgentInvocation } from "../ports";

/** agentRunner.run 的最小返回投影（只取 bindings 用到的字段）。 */
export interface AgentRunProjection {
  readonly output: unknown;
  readonly state: "completed" | "failed" | "cancelled" | "degraded";
  readonly tokensUsed: { total: number };
  readonly costCents: number;
}

/**
 * 发 domain 事件（best-effort，catch 吞错，绝不因发事件失败破坏 mission 执行）。
 * event: 业务事件名（如 "agent:lifecycle" / "agent:narrative" / "dimension:research:started"）。
 * data: 事件载荷（与消费方 bridge 约定的字段）。
 */
export function emitDomain(
  onEvent: ((e: CapabilityRunEvent) => void | Promise<void>) | undefined,
  event: string,
  data: Record<string, unknown>,
): void {
  if (!onEvent) return;
  try {
    void onEvent({
      type: "domain",
      timestamp: Date.now(),
      payload: { event, data },
    });
  } catch {
    // best-effort：emit 失败不影响 mission 执行
  }
}

/**
 * 跑一个共享 agent，累计算力到 crossState，并 emit domain agent:lifecycle 事件。
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
  /** optional：ctx.onEvent 引用，用于 emit domain 事件（best-effort）。 */
  onEvent?: ((e: CapabilityRunEvent) => void | Promise<void>) | undefined;
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

  // ★ P0 #16b：每次 agent 调用完成后 emit domain agent:lifecycle 事件（best-effort）。
  // costCents → costUsd 换算（前端 useMissionLegacyView 读 costUsd 字段）。
  emitDomain(args.onEvent, "agent:lifecycle", {
    agentId: args.specId,
    role: args.role,
    ...(args.dimension !== undefined ? { dimension: args.dimension } : {}),
    stepId: args.stepId,
    phase: res.state === "completed" ? "completed" : "failed",
    tokensUsed: tokens,
    costCents: cost,
    costUsd: cost / 100,
  });

  return {
    output: res.output,
    state: res.state,
    tokensUsed: { total: tokens },
    costCents: cost,
  };
}
