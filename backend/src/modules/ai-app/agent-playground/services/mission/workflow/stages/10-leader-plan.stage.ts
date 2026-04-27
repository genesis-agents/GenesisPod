/**
 * 10-leader-plan.stage.ts —— M0: Leader 拆维度 + 声明 goals / qualityBar / risks
 *
 * 上游：mission 启动（topic/depth/language/userProfile）
 * 下游：ctx.plan = { themeSummary, dimensions, goals, initialRisks }
 *
 * 失败时直接 throw —— M0 plan 是后续所有 stage 的前提，没法降级。
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

export async function runLeaderPlanStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, leader } = ctx;

  await deps.emit({
    type: "agent-playground.stage:started",
    missionId,
    userId,
    payload: { stage: "leader" },
  });
  await deps.lifecycle(missionId, userId, "leader", "leader", "started");

  // M0: leader.plan() 内部自动 emit lifecycle / appendLeaderJournal
  let planResult;
  try {
    planResult = await leader.plan();
  } catch (err) {
    await deps.lifecycle(missionId, userId, "leader", "leader", "failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  await deps.lifecycle(missionId, userId, "leader", "leader", "completed", {});

  ctx.plan = {
    themeSummary: planResult.themeSummary,
    dimensions: planResult.dimensions,
    goals: planResult.goals,
    initialRisks: planResult.initialRisks ?? [],
  };
  await deps
    .emit({
      type: "agent-playground.leader:goals-set",
      missionId,
      userId,
      payload: {
        goals: ctx.plan.goals,
        initialRisks: ctx.plan.initialRisks ?? [],
      },
    })
    .catch(() => {});
  await deps.emit({
    type: "agent-playground.stage:completed",
    missionId,
    userId,
    payload: {
      stage: "leader",
      dimensions: ctx.plan.dimensions,
      themeSummary: ctx.plan.themeSummary,
    },
  });
}
