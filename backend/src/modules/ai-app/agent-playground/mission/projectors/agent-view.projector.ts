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
}

export function projectAgents(
  events: ReadonlyArray<AgentRelevantEvent>,
): MissionViewBaseAgent[] {
  const byAgent = new Map<string, AgentDigest>();

  for (const ev of events) {
    const id = extractAgentId(ev);
    if (!id) continue;
    const role = extractRole(ev) ?? "unknown";
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

    const verb = extractAgentVerb(ev.type);
    switch (verb) {
      case "started":
        digest.observed.add("running");
        break;
      case "completed":
        digest.observed.add("completed");
        break;
      case "failed":
        digest.observed.add("failed");
        digest.failureMessage = extractFailureMessage(ev) ?? digest.failureMessage;
        break;
      case "retry":
        digest.retryCount += 1;
        break;
      default:
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
  }));
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
