/**
 * AgentPlaygroundEvents — 事件类型注册清单
 *
 * DomainEventBus 校验：未注册的 type 一律 drop+warn，不会广播。
 * 所有 demo 事件必须在此声明。
 */

import type { DomainEventTypeSpec } from "../../ai-harness/facade";

const T = (suffix: string): DomainEventTypeSpec => ({
  type: `agent-playground.${suffix}`,
});

export const AGENT_PLAYGROUND_EVENTS: readonly DomainEventTypeSpec[] = [
  T("mission:started"),
  T("mission:completed"),
  T("mission:failed"),
  T("mission:rejected"),
  T("mission:cancelled"), // controller.ts manual cancel — 之前未注册被 bus drop（同类 bug 与 P1 修复）
  T("mission:manual-rerun-from-todo"), // controller.ts 手动 rerun — 同上
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
  // ── Phase Lead-1+: Leader-Replanner-Lite ──
  T("leader:goals-set"), // M0 Leader 声明 successCriteria/qualityBar/deliverables
  T("leader:decision"), // M1/M4 Leader 决策（accept/patch/abort 等）
  T("leader:foreword"), // M6 Leader 写完 meta-level Foreword
  T("leader:signed"), // M7 Leader 签字（含 score/verdict/signed/refusalReason）
  T("dimension:retrying"), // researcher self-heal 重试触发
  // ── 人话叙事事件（agent-narrative.md）──
  // 每个 stage 在关键节点 emit 一条 short 自然语言句子，前端任务详情主时间线
  // 直接渲染（不再事后翻译 raw JSON）。
  T("agent:narrative"),
  // ── S12 self-evolution（mission 复盘）──
  T("mission:evolved"), // mission 完成后异步：postmortem 统计 + 系统建议
  // ── Phase P1 fix (2026-04-29 mission 8c7b4358) — ReAct 死循环防护 ──
  T("iteration:progress"), // 每轮 ReAct 进度（iter / maxIter / approachingLimit），UI 死循环可视化
  T("dimension:retry-phase:started"), // Leader patch retry 阶段启动里程碑（前 case 卡 44min 中间 0 milestone）
  T("dimension:retry-phase:completed"), // Leader patch retry 阶段完成里程碑（含 wallTimeMs / 各 dim 成败）
  // ── 第二轮深度排查补漏（2026-04-29 round 2）：P0-NEW-1 ──
  T("reconciliation:skipped"), // S5 单维度短路（无需跨维对账）
  T("reconciliation:warnings-orphaned"), // S8 reportAssembler 失败但 reconciler warning 仍要 emit
  T("mission:persist-failed"), // S11 DB 写入失败 —— 关键，不能被 drop 否则前端永远卡 running
];
