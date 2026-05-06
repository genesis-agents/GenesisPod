/**
 * Stage S2 — Leader plans the mission
 *
 * Boilerplate（emit started/completed/failed/lifecycle/narrate）由 harness
 * `runWithStageInstrumentation` 接管。stage 文件只剩业务核心。
 *
 *   reads  ctx: leader, missionId, userId
 *   writes ctx: plan = { themeSummary, dimensions, goals, initialRisks }
 *
 * Failure: leader.plan() 抛错 → wrapper 自动 emit lifecycle:failed + rethrow。
 */

import type { MissionInvariants, PlanPhaseCtx } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { narrate } from "../narrative.util";
import { runWithStageInstrumentation } from "@/modules/ai-harness/facade";

interface PlanResult {
  themeSummary: string;
  dimensions: ReadonlyArray<{ name: string }>;
  goals: ReadonlyArray<unknown>;
  initialRisks?: ReadonlyArray<unknown>;
}

export async function runLeaderPlanStage(
  ctx: MissionInvariants & PlanPhaseCtx,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, leader } = ctx;

  await runWithStageInstrumentation<PlanResult>(
    { missionId, userId, pool: ctx.pool },
    deps,
    {
      eventPrefix: "agent-playground",
      stageId: "s2-leader-plan",
      role: "leader",
      narrate,
      narrateThinking:
        "Leader 开始分析 topic，准备维度规划与声明 successCriteria",
      narrateSuccess: (out) =>
        `Leader 拆出 ${out.dimensions.length} 个研究维度：${out.dimensions
          .map((d) => d.name)
          .slice(0, 3)
          .join(" / ")}${out.dimensions.length > 3 ? " 等" : ""}`,
      emitExtras: async (out) => {
        await deps
          .emit({
            type: "agent-playground.leader:goals-set",
            missionId,
            userId,
            payload: {
              goals: out.goals,
              initialRisks: out.initialRisks ?? [],
            },
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit leader:goals-set failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      },
      customMetrics: (out) => ({
        dimensions: out.dimensions,
        themeSummary: out.themeSummary,
      }),
    },
    async (): Promise<PlanResult> => {
      // ★ P0#2 (2026-04-29): S12 → S2 闭环 —— 召回该用户最近 3 个 mission postmortem
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
      const planResult = await leader.plan({
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

      // ★ P1-D (2026-04-29): leader 返回空维度时必须 fail-fast
      if (!planResult.dimensions || planResult.dimensions.length === 0) {
        throw new Error(
          "Leader plan failed: dimensions[] is empty. Cannot proceed with researcher dispatch.",
        );
      }

      // 写 ctx（CrossStageState）
      ctx.plan = {
        themeSummary: planResult.themeSummary,
        dimensions: planResult.dimensions,
        goals: planResult.goals,
        initialRisks: planResult.initialRisks ?? [],
      };

      return ctx.plan as unknown as PlanResult;
    },
  );
}
