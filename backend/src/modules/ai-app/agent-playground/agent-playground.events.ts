/**
 * AgentPlaygroundEvents — 事件类型注册清单
 *
 * DomainEventBus 校验：未注册的 type 一律 drop+warn，不会广播。
 * 所有 demo 事件必须在此声明。
 */

import type { DomainEventTypeSpec } from "../../ai-engine/facade";

const T = (suffix: string): DomainEventTypeSpec => ({
  type: `agent-playground.${suffix}`,
});

export const AGENT_PLAYGROUND_EVENTS: readonly DomainEventTypeSpec[] = [
  T("mission:started"),
  T("mission:completed"),
  T("mission:failed"),
  T("mission:rejected"),
  T("stage:started"),
  T("stage:completed"),
  T("agent:lifecycle"),
  T("agent:thought"),
  T("agent:action"),
  T("agent:observation"),
  T("agent:reflection"),
  T("agent:error"),
  T("researcher:completed"),
  T("verifier:verdict"),
  T("cost:tick"),
  T("budget:exhausted"),
  T("report:draft"),
  T("memory:indexed"),
];
