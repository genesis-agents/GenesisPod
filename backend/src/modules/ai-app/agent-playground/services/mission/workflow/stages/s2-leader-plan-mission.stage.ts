/**
 * Stage S2 — Leader plans the mission
 *
 * Leader 维度规划 + 声明 goals / qualityBar / hardConstraints / initialRisks。
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
import { narrate } from "../narrative.util";
import { startStageTimer } from "@/modules/ai-harness/facade";

export async function runLeaderPlanStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, leader } = ctx;
  // ★ OBSERVABILITY (2026-04-30): 用 startStageTimer 统一 stage:completed 事件
  //   shape，注入 durationMs / status / tokensUsed 等公共度量，让 UI 能在
  //   一个地方拿到所有 stage 性能数据。stage 业务字段进 custom。
  const stageTimer = startStageTimer();
  const tokensBefore = ctx.pool?.snapshot?.()?.poolTokensUsed ?? 0;

  await deps.emit({
    type: "agent-playground.stage:started",
    missionId,
    userId,
    payload: { stage: "leader", startedAtMs: stageTimer.startedAtMs },
  });
  await deps.lifecycle(missionId, userId, "leader", "leader", "started");
  await narrate(deps.emit, missionId, userId, {
    stage: "s2-leader-plan",
    role: "leader",
    tag: "thinking",
    text: "Leader 开始分析 topic，准备维度规划与声明 successCriteria",
    agentId: "leader",
  });

  // ★ P0#2 (2026-04-29): S12 → S2 闭环 —— 召回该用户最近 3 个 mission postmortem
  // 让 Leader 显式参考"过去同 user 的失败教训 / 拒签原因 / 改进建议"
  // store.listRecentPostmortems 失败时 fallback 空数组（不阻塞 mission）
  const priorPostmortems = await deps.store
    .listRecentPostmortems(userId, 3)
    .catch((err) => {
      deps.log.warn(
        `[s2 ${missionId}] listRecentPostmortems failed (non-fatal): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    });
  if (priorPostmortems.length > 0) {
    deps.log.log(
      `[s2 ${missionId}] injected ${priorPostmortems.length} prior postmortems to Leader plan`,
    );
  }

  // M0: leader.plan() 内部自动 emit lifecycle / appendLeaderJournal
  let planResult;
  try {
    planResult = await leader.plan({
      priorPostmortems: priorPostmortems.map((p) => ({
        missionId: p.missionId,
        topic: p.topic,
        summary: p.summary,
        recommendations: p.recommendations,
        leaderSigned: p.leaderSigned,
        qualityScore: p.qualityScore,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    await deps.lifecycle(missionId, userId, "leader", "leader", "failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  await deps.lifecycle(missionId, userId, "leader", "leader", "completed", {});

  // ★ P1-D (2026-04-29): leader 返回空维度时必须 fail-fast —— 否则下游所有 stage 空跑
  if (!planResult.dimensions || planResult.dimensions.length === 0) {
    await deps.lifecycle(missionId, userId, "leader", "leader", "failed", {
      error: "leader_plan_empty_dimensions",
    });
    throw new Error(
      "Leader plan failed: dimensions[] is empty. Cannot proceed with researcher dispatch.",
    );
  }

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
  const tokensAfter = ctx.pool?.snapshot?.()?.poolTokensUsed ?? 0;
  await stageTimer.emitCompleted(deps.emit, missionId, userId, {
    eventType: "agent-playground.stage:completed",
    stage: "leader",
    tokensUsed: tokensAfter - tokensBefore,
    agentInvocations: 1,
    custom: {
      dimensions: ctx.plan.dimensions,
      themeSummary: ctx.plan.themeSummary,
    },
  });
  await narrate(deps.emit, missionId, userId, {
    stage: "s2-leader-plan",
    role: "leader",
    tag: "success",
    text: `Leader 拆出 ${ctx.plan.dimensions.length} 个研究维度：${ctx.plan.dimensions
      .map((d) => d.name)
      .slice(0, 3)
      .join(" / ")}${ctx.plan.dimensions.length > 3 ? " 等" : ""}`,
    agentId: "leader",
  });
}
