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
  // ── TI-style per-dimension 子流程事件 ──
  T("dimension:outline:planned"), // outline agent 产出 N 章节规划
  T("chapter:writing:started"), // chapter writer 开始写第 i 章
  T("chapter:writing:completed"), // chapter writer 出 draft
  T("chapter:review:started"), // chapter reviewer 开始评
  T("chapter:review:completed"), // chapter reviewer 出 decision
  T("chapter:revision"), // 触发重写（critique 反馈）
  T("dimension:integrating:started"),
  T("dimension:integrating:completed"),
  T("dimension:graded"), // 5-axis 评分结果
  // ── Leader chat 触发的动态追加 ──
  T("dimensions:appended"), // CREATE_TODO 决策 → 追加 dim 到 mission.dimensions
  // ── 全链路诊断 / 跨 mission 失败模式记忆 ──
  T("dimension:degraded"), // researcher 失败 → 维度降级，含 innerFailureCode
  T("failure-pattern:pre-applied"), // 启动 researcher 前命中历史失败模式 → 预禁用 model
  // ── Phase P0-4: Reconciler [3.5] 节点（mission-pipeline-reconciler.md）──
  T("reconciliation:completed"), // 对账完成，含 fact/conflict/overlap/gap/figure 计数
  // ── Phase P0-9: Writer 局部回写 (D11) ──
  T("chapter:rewritten"), // Reviewer 触发某章重写并完成
  // ── Phase P0-2 / P3-1: Tool Recall trace ──
  T("tools:recalled"),
  T("agent:validation-rejected"),
  // ── Phase P21-2: Critic L4 verdict 事件 ──
  T("critic:verdict"),
  // ── Phase P0-10: 预算两档闸 ──
  T("mission:budget-warning-soft"),
  T("mission:budget-warning-hard"),
];
