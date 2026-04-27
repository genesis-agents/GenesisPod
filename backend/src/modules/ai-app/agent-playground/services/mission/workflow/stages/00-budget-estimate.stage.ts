/**
 * 00-budget-estimate.stage.ts —— 启动前预算预估（mission:started + 余额校验）
 *
 * Phase P3-8 / P4-7：按 budgetMultiplier 等比缩放预估，余额不足时 emit
 * budget-warning-soft / budget-warning-hard，suggestion=abort 直接 throw。
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

export async function runBudgetEstimateStage(
  ctx: MissionContext,
  deps: MissionDeps,
  workspaceId?: string,
): Promise<void> {
  const { missionId, userId, input, t0, billing, budgetMultiplier } = ctx;

  await deps.emit({
    type: "agent-playground.mission:started",
    missionId,
    userId,
    payload: { input, workspaceId, startedAt: t0 },
  });

  const baseEstimate = 400_000; // deep+medium 基线
  const estimateBudget = Math.round(
    baseEstimate * Math.max(0.1, budgetMultiplier),
  );
  try {
    const estimate = await billing.estimateAffordable({
      maxTokens: estimateBudget,
    });
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
        throw new Error(
          `余额不足以启动 mission（短缺 ${estimate.shortfall} credits），请充值后重试`,
        );
      }
    }
  } catch (err) {
    deps.log.warn(
      `[${missionId}] budget estimate failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
