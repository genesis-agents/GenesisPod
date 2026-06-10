/**
 * agent-view.projector.ts — Pure projector for canonical agents[]（B2-2）
 *
 * 落地依据：thinning plan §6.4.3 agent.phase
 *
 * first-cut 实现：仅从 events 中聚合 agent.{started,completed,failed,retry} 事件。
 * AgentPlaygroundMission 行内未持久化 agent 拓扑，第一轮投影输出为空时不视为错误——
 * frontend 端 ReAct 实时面板（§6.7.2 token-by-token / retry flicker）仍由 stream 驱动，
 * 不依赖此 projector 的初始空输出。
 *
 * agent.phase 4 值（§6.4.3）：pending / running / completed / failed。
 * retryCount 是 auxiliary metadata，不影响 phase。
 */

import type {
  AgentPhase,
  MissionViewBaseAgent,
} from "../../api/contracts/view-state.contract";

interface AgentRelevantEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  agentId?: string;
}

interface AgentDigest {
  id: string;
  role: string;
  modelId?: string;
  retryCount: number;
  failureMessage?: string;
  observed: Set<AgentPhase>;
  // ★ 2026-05-27 (Screenshot_19) ComputeUsagePanel 必填字段
  attempt?: number;
  dimension?: string;
  iterations?: number;
  wallTimeMs?: number;
  startedAt?: number;
  endedAt?: number;
  // ★ 2026-05-29 per-agent 用量（从终态事件 payload 读取）
  tokensUsed?: number;
  costUsd?: number;
  toolCallCount?: number;
}

export function projectAgents(
  events: ReadonlyArray<AgentRelevantEvent>,
): MissionViewBaseAgent[] {
  const byAgent = new Map<string, AgentDigest>();

  for (const ev of events) {
    const rawId = extractAgentId(ev);
    if (!rawId) continue;

    // ★ Fix 3(b) (2026-06-09)：dimension 分桶——当 payload.dimension 存在且 agentId 不含 '#' 时，
    //   按 `${agentId}#${dimension}` 建行（兜底 researcher#<dim> 前端对齐）。
    //   发射端已改为直接发 researcher#<dim> 时 rawId 本身含 '#'，直接用，不二次拼接。
    const payloadForBucket = ev.payload as Record<string, unknown> | null;
    const dimForBucket =
      typeof payloadForBucket?.dimension === "string"
        ? payloadForBucket.dimension
        : undefined;
    const id =
      !rawId.includes("#") && dimForBucket ? `${rawId}#${dimForBucket}` : rawId;

    const rawRole = extractRole(ev);
    const role =
      (rawRole ? normalizeRole(rawRole) : null) ??
      deriveRoleFromAgentId(id) ??
      "unknown";
    const modelId = extractModelId(ev);

    const digest =
      byAgent.get(id) ??
      ({
        id,
        role,
        modelId,
        retryCount: 0,
        observed: new Set<AgentPhase>(),
      } as AgentDigest);

    if (modelId && !digest.modelId) digest.modelId = modelId;
    if (role !== "unknown" && digest.role === "unknown") digest.role = role;

    // ★ 2026-05-29：per-agent 用量从终态事件 payload 读取（chapter:*:completed /
    //   agent:lifecycle 由 agentUsageDetail 注入）。
    // ★ Fix 3(a) (2026-06-09)：tokensUsed 改为累加（同 agentId 多次 lifecycle 事件各带部分量）。
    //   costUsd / toolCallCount 保持末值覆盖（终态事件携带完整合计，不重复累加）。
    {
      const up = ev.payload as Record<string, unknown> | null;
      if (up) {
        if (typeof up.tokensUsed === "number")
          digest.tokensUsed = (digest.tokensUsed ?? 0) + up.tokensUsed;
        if (typeof up.costUsd === "number") digest.costUsd = up.costUsd;
        if (typeof up.toolCallCount === "number")
          digest.toolCallCount = up.toolCallCount;
      }
    }

    // ★ 2026-05-27 修复 (Screenshot_5)：playground 没有专用 agent.started/completed
    //   事件——agent 生命周期是从 stage / chapter / dim 事件 derive 出来的。
    //   规则：
    //     - 任何带 agentId 的 lifecycle event → agent 进入 running
    //     - chapter:writing:completed / chapter:done / chapter:review:completed /
    //       dimension:research:completed / dimension:graded / leader:signed →
    //       agent 进入 completed
    //     - chapter:writing:failed / dimension:retry-failed → agent failed
    //     - chapter:revision / dimension:retrying → retry++
    //   保留旧 agent.<verb> 路径兼容 fixture / 未来 explicit emit。
    // ★ 2026-05-27 (Screenshot_19/20)：ComputeUsagePanel 需要 attempt / dimension /
    //   iterations / wallTimeMs。两类来源：
    //   1. 主 agent (researcher / leader / analyst / reconciler / writer / reviewer)
    //      走 agent:lifecycle 单事件，payload 自带这些字段
    //   2. sub-agent (chapter-writer#X.Y.Z / chapter-reviewer#X.Y.Z) **不发**
    //      agent:lifecycle —— 只发 chapter:writing:started/completed /
    //      chapter:review:started/completed。我们用第一个 start 类事件 ts → startedAt，
    //      最后一个 complete 类事件 ts → endedAt，wallTimeMs = endedAt - startedAt。
    const payload = ev.payload as Record<string, unknown> | null;
    const isLifecycle =
      ev.type.endsWith("agent:lifecycle") || ev.type === "agent:lifecycle";
    if (isLifecycle && payload) {
      if (typeof payload.attempt === "number") digest.attempt = payload.attempt;
      if (typeof payload.dimension === "string")
        digest.dimension = payload.dimension;
      if (typeof payload.iterations === "number")
        digest.iterations = payload.iterations;
      if (typeof payload.wallTimeMs === "number")
        digest.wallTimeMs = payload.wallTimeMs;
      if (typeof ev.timestamp === "number") {
        if (payload.phase === "started" && digest.startedAt == null) {
          digest.startedAt = ev.timestamp;
        } else if (
          payload.phase === "completed" ||
          payload.phase === "failed"
        ) {
          digest.endedAt = ev.timestamp;
          if (digest.wallTimeMs == null && digest.startedAt != null) {
            digest.wallTimeMs = ev.timestamp - digest.startedAt;
          }
        }
      }
    }
    // verb 解析三级链：显式 agent.<verb>（DOT 旧格式）→ 事件类型 derive →
    // agent:lifecycle 的 payload.phase。第三级是能力轨主 agent（leader/analyst/
    // writer/critic/reconciler 等）的唯一状态来源——缺它则全部落 default 恒 running，
    // Mission Pulse 完成计数恒 0（审计 #12/#22）。
    const verb =
      extractAgentVerb(ev.type) ??
      deriveVerbFromEventType(ev.type) ??
      (isLifecycle ? lifecycleVerbFromPhase(payload) : null);

    // 通用 timing 兜底：任何带 agentId 的事件——startedAt 取首事件 ts，
    // endedAt 取末事件 ts（在 chapter:writing:completed / chapter:review:completed /
    // chapter:done 等终态信号处覆盖），wallTimeMs 末态时计算。
    if (typeof ev.timestamp === "number") {
      if (digest.startedAt == null) digest.startedAt = ev.timestamp;
      if (payload) {
        // 从 chapter event 接 dimension / attempt（sub-agent fallback）
        if (typeof payload.dimension === "string" && digest.dimension == null) {
          digest.dimension = payload.dimension;
        }
        if (typeof payload.attempt === "number" && digest.attempt == null) {
          digest.attempt = payload.attempt;
        }
      }
      // 终态事件 → 锁 endedAt + 计算 wallTimeMs
      if (verb === "completed" || verb === "failed") {
        digest.endedAt = ev.timestamp;
        if (digest.wallTimeMs == null && digest.startedAt != null) {
          digest.wallTimeMs = ev.timestamp - digest.startedAt;
        }
      }
    }

    switch (verb) {
      case "started":
        digest.observed.add("running");
        break;
      case "completed":
        digest.observed.add("completed");
        break;
      case "failed":
        digest.observed.add("failed");
        digest.failureMessage =
          extractFailureMessage(ev) ?? digest.failureMessage;
        break;
      case "retry":
        digest.retryCount += 1;
        break;
      default:
        if (
          !digest.observed.has("completed") &&
          !digest.observed.has("failed")
        ) {
          digest.observed.add("running");
        }
        break;
    }

    byAgent.set(id, digest);
  }

  return [...byAgent.values()].map((d) => ({
    id: d.id,
    role: d.role,
    phase: resolveAgentPhase(d),
    modelId: d.modelId,
    retryCount: d.retryCount > 0 ? d.retryCount : undefined,
    failureMessage: d.failureMessage,
    attempt: d.attempt,
    dimension: d.dimension,
    iterations: d.iterations,
    wallTimeMs: d.wallTimeMs,
    startedAt: d.startedAt,
    endedAt: d.endedAt,
    tokensUsed: d.tokensUsed,
    costUsd: d.costUsd,
    toolCallCount: d.toolCallCount,
  }));
}

/**
 * 从 agentId 推断 role（fallback，当事件 payload 没显式 role 时用）。
 * agentId 命名约定 (per-dim-pipeline.util.ts 等):
 *   - chapter-writer#N.M.A → writer
 *   - chapter-reviewer#N.M.A → reviewer
 *   - quality-judge#N → reviewer (dim grader)
 *   - researcher#N → researcher
 *   - reconciler / analyst / leader / critic / steward / verifier → 同名
 */
function deriveRoleFromAgentId(agentId: string): string | null {
  const prefix = agentId.split(/[#.]/)[0]?.toLowerCase();
  if (!prefix) return null;
  // 收口到 5 个 canonical role（与 frontend AgentRole 枚举一致）：
  //   leader / researcher / analyst / writer / reviewer
  // 别名映射：
  //   steward → leader（管理类辅助）
  //   critic / verifier / quality-judge → reviewer（质量审查类）
  //   reconciler → analyst（聚合/对账类）
  if (prefix.includes("writer")) return "writer";
  if (
    prefix.includes("reviewer") ||
    prefix === "quality-judge" ||
    prefix === "critic" ||
    prefix.includes("critic") ||
    prefix === "verifier"
  )
    return "reviewer";
  if (prefix === "researcher") return "researcher";
  if (prefix === "leader" || prefix === "steward") return "leader";
  if (prefix === "reconciler" || prefix === "analyst") return "analyst";
  return null;
}

/**
 * 从事件 type 推 agent verb（无显式 agent.X 事件时的兜底）。
 * 规则与上方 projectAgents 注释一致。
 */
function deriveVerbFromEventType(
  eventType: string,
): "started" | "completed" | "failed" | "retry" | null {
  // 终态信号
  if (
    eventType.endsWith("chapter:writing:completed") ||
    eventType.endsWith("chapter:done") ||
    eventType.endsWith("chapter:review:completed") ||
    eventType.endsWith("dimension:research:completed") ||
    eventType.endsWith("dimension:graded") ||
    eventType.endsWith("dimension:integrating:completed") ||
    eventType.endsWith("leader:signed") ||
    eventType.endsWith("leader:decision") ||
    eventType.endsWith("critic:verdict")
  ) {
    return "completed";
  }
  // 失败信号
  if (
    eventType.endsWith("chapter:writing:failed") ||
    eventType.endsWith("dimension:retry-failed") ||
    eventType.endsWith("dimension:integrating:failed")
  ) {
    return "failed";
  }
  // 重试信号
  if (
    eventType.endsWith("chapter:revision") ||
    eventType.endsWith("chapter:rewritten") ||
    eventType.endsWith("dimension:retrying")
  ) {
    return "retry";
  }
  // 启动 / 进行中信号
  if (
    eventType.endsWith("chapter:writing:started") ||
    eventType.endsWith("chapter:review:started") ||
    eventType.endsWith("dimension:research:started") ||
    eventType.endsWith("dimension:integrating:started") ||
    eventType.endsWith("dimension:outline:planned")
  ) {
    return "started";
  }
  return null;
}

/**
 * agent:lifecycle 事件的 payload.phase → verb。
 * 能力轨 invokeAgent 在每次 agent 调用后 emit agent:lifecycle{phase}，
 * type 本身（"playground.agent:lifecycle"）推不出 verb，必须读 payload。
 * degraded 在发射端已折叠进 phase='completed'（degraded:true 旁标），此处不再分流。
 */
function lifecycleVerbFromPhase(
  payload: Record<string, unknown> | null,
): "started" | "completed" | "failed" | null {
  const phase = payload?.phase;
  if (phase === "started") return "started";
  if (phase === "completed") return "completed";
  if (phase === "failed") return "failed";
  return null;
}

/**
 * payload.role 原词归一到 5 个 canonical role（词表与 deriveRoleFromAgentId 一致）。
 * 能力轨 agent:lifecycle 直接携带内部 role（critic / reconciler / verifier 等），
 * 前端按 canonical 5 词（leader/researcher/analyst/writer/reviewer）分行——
 * 不归一则 s5 reconciler / s9 critic 的行被整体过滤掉。
 */
function normalizeRole(role: string): string {
  const r = role.toLowerCase();
  if (r === "critic" || r === "verifier" || r === "quality-judge")
    return "reviewer";
  if (r === "reconciler") return "analyst";
  if (r === "steward") return "leader";
  return role;
}

function resolveAgentPhase(d: AgentDigest): AgentPhase {
  if (d.observed.has("failed") && !d.observed.has("completed")) return "failed";
  if (d.observed.has("completed")) return "completed";
  if (d.observed.has("running")) return "running";
  return "pending";
}

function extractAgentId(ev: AgentRelevantEvent): string | null {
  if (ev.agentId) return ev.agentId;
  const payload = ev.payload as Record<string, unknown> | null;
  if (payload && typeof payload.agentId === "string") return payload.agentId;
  return null;
}

function extractRole(ev: AgentRelevantEvent): string | null {
  const payload = ev.payload as Record<string, unknown> | null;
  if (payload && typeof payload.role === "string") return payload.role;
  return null;
}

function extractModelId(ev: AgentRelevantEvent): string | undefined {
  const payload = ev.payload as Record<string, unknown> | null;
  if (payload && typeof payload.modelId === "string") return payload.modelId;
  return undefined;
}

function extractAgentVerb(
  eventType: string,
): "started" | "completed" | "failed" | "retry" | null {
  if (eventType.endsWith("agent.started") || eventType === "agent.started")
    return "started";
  if (eventType.endsWith("agent.completed") || eventType === "agent.completed")
    return "completed";
  if (eventType.endsWith("agent.failed") || eventType === "agent.failed")
    return "failed";
  if (eventType.endsWith("agent.retry") || eventType === "agent.retry")
    return "retry";
  return null;
}

function extractFailureMessage(ev: AgentRelevantEvent): string | null {
  const payload = ev.payload as Record<string, unknown> | null;
  if (!payload) return null;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.detail === "string") return payload.detail;
  return null;
}
