/**
 * Stage S2 — Leader plans the mission
 *
 * Leader 拆维度 + 声明 goals / qualityBar / hardConstraints / initialRisks。
 * 是后续所有 stage 的前提：dimensions[] 决定 researcher 派几个 worker，goals 决定
 * Leader 末段签字时引用什么 successCriteria 做问责。
 *
 *   reads  ctx: leader, missionId, userId
 *   writes ctx: plan = { themeSummary, dimensions, goals, initialRisks }
 *   deps:       emit, lifecycle
 *
 * Leader 内部已 emit lifecycle/journal 写入（SupervisedMission.plan() 自闭包）。
 * 本 stage 在前后补一层 stage:started/completed + leader:goals-set 事件给前端 trace。
 *
 * Failure modes: leader.plan() 抛错 → emit lifecycle:failed + rethrow（mission 终止）。
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
