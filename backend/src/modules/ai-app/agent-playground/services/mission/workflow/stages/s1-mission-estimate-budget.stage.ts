/**
 * Stage S1 — Budget estimate
 *
 * 第一站：mission 启动前的预算闸门，按 budgetMultiplier 估出本次 mission 大概会
 * 烧多少 token，对照用户余额做 affordable 校验。
 *
 *   reads  ctx: input, t0, billing, budgetMultiplier
 *   writes ctx: (none —— 仅 emit mission:started 事件 + 视情况 throw)
 *   deps:       emit, log, billing.estimateAffordable
 *
 * Failure modes:
 *   - estimate.affordable === false + suggestion="abort"  → throw (mission 终止)
 *   - estimate.affordable === false + suggestion="warn"   → emit budget-warning-soft (继续)
 *   - estimateAffordable 自身抛错                         → log warn + 继续（不阻塞）
 */

import type { MissionInvariants } from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runBudgetEstimateStage(
  ctx: MissionInvariants,
  deps: CommonDeps,
  workspaceId?: string,
): Promise<void> {
  const { missionId, userId, input, t0, billing, budgetMultiplier } = ctx;

  await deps.emit({
    type: "agent-playground.mission:started",
    missionId,
    userId,
    payload: { input, workspaceId, startedAt: t0 },
  });
  // ★ 2026-05-06 (P0-A): S1 显式 stage:started，让前端 s1-budget 任务卡按事件翻牌（之前
  //   依赖 mission:started + stage:started leader 间接 transition，路径脆弱）
  await deps
    .emit({
      type: "agent-playground.stage:metrics",
      missionId,
      userId,
      payload: { stage: "s1-budget", startedAtMs: t0 },
    })
    .catch(() => {});
  await narrate(deps.emit, missionId, userId, {
    stage: "s1-budget",
    role: "mission",
    tag: "info",
    text: `Mission 已启动 · 主题「${input.topic}」 · 深度 ${input.depth} · 预算档位 ${input.budgetProfile}`,
  });

  const baseEstimate = 400_000; // deep+medium 基线
  const estimateBudget = Math.round(
    baseEstimate * Math.max(0.1, budgetMultiplier),
  );
  let estimate: Awaited<ReturnType<typeof billing.estimateAffordable>>;
  try {
    estimate = await billing.estimateAffordable({
      maxTokens: estimateBudget,
    });
  } catch (err) {
    deps.log.warn(
      `[${missionId}] budget estimate failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (!estimate.affordable) {
    const warningType =
      estimate.suggestion === "abort"
        ? "agent-playground.mission:budget-warning-hard"
        : "agent-playground.mission:budget-warning-soft";
    await deps.emit({
      type: warningType,
      missionId,
      userId,
      payload: {
        shortfall: estimate.shortfall,
        suggestion: estimate.suggestion,
        estimatedCredits: estimate.estimatedCredits,
        currentBalance: estimate.currentBalance,
      },
    });
    if (estimate.suggestion === "abort") {
      await narrate(deps.emit, missionId, userId, {
        stage: "s1-budget",
        role: "mission",
        tag: "warning",
        text: `余额不足以启动（短缺 ${estimate.shortfall} credits），mission 终止`,
      });
      await deps
        .emit({
          type: "agent-playground.stage:metrics",
          missionId,
          userId,
          payload: {
            stage: "s1-budget",
            status: "failed",
            reason: "insufficient_balance",
            shortfall: estimate.shortfall,
          },
        })
        .catch(() => {});
      throw new Error(
        `余额不足以启动 mission（短缺 ${estimate.shortfall} credits），请充值后重试`,
      );
    }
    await narrate(deps.emit, missionId, userId, {
      stage: "s1-budget",
      role: "mission",
      tag: "warning",
      text: `预算软告警：估算 ${estimate.estimatedCredits} credits，余额 ${estimate.currentBalance}（建议 ${estimate.suggestion}），mission 继续`,
    });
  } else {
    await narrate(deps.emit, missionId, userId, {
      stage: "s1-budget",
      role: "mission",
      tag: "success",
      text: `预算校验通过 · 估算 ${estimate.estimatedCredits} credits 内可完成`,
    });
  }

  // ★ 2026-05-06 (P0-A): S1 正常路径 stage:completed
  await deps
    .emit({
      type: "agent-playground.stage:metrics",
      missionId,
      userId,
      payload: {
        stage: "s1-budget",
        status: "completed",
        estimatedCredits: estimate.estimatedCredits,
        currentBalance: estimate.currentBalance,
      },
    })
    .catch(() => {});
}
