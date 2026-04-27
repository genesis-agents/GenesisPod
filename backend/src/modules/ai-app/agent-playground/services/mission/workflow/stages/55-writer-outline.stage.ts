/**
 * 55-writer-outline.stage.ts —— Phase P4-1: thorough+ 档位下跑 OutlinePlanner W1
 *
 * 上游：ctx.plan + ctx.reconciliationReport
 * 下游：ctx.outlinePlan（暂未被 Writer 消费，留给 W2 接入）+ emit
 *      dimension:outline:planned 给前端 trace
 *
 * 启用条件：auditLayers ∈ {thorough, paranoid}
 * 失败不阻塞 mission（emit warning）
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";

export async function runWriterOutlineStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const {
    missionId,
    userId,
    input,
    billing,
    pool,
    budgetMultiplier,
    plan,
    reconciliationReport,
  } = ctx;
  if (!plan) return;
  if (input.auditLayers !== "thorough" && input.auditLayers !== "paranoid") {
    return;
  }
  try {
    const outlineRes = await deps.writer.planMissionOutline(
      {
        topic: input.topic,
        language: input.language,
        audienceProfile: input.audienceProfile,
        styleProfile: input.styleProfile,
        lengthProfile: input.lengthProfile,
        withFigures: input.withFigures,
        plan: {
          themeSummary: plan.themeSummary,
          dimensions: plan.dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            rationale: d.rationale,
          })),
        },
        factTable:
          (
            reconciliationReport as unknown as {
              factTable?: {
                id: string;
                entity: string;
                attribute: string;
                value: string;
              }[];
            } | null
          )?.factTable ?? [],
        figureCandidates: [],
      },
      {
        missionId,
        userId,
        agentId: "outline-planner",
        role: "outline-planner",
        envAdapter: billing,
        budgetMultiplier,
      },
    );
    await deps.invoker.tickCost(
      missionId,
      userId,
      "writer",
      pool,
      extractTokenSpend(outlineRes.events),
    );
    if (outlineRes.state === "completed" && outlineRes.output) {
      const outlinePlan = outlineRes.output as {
        chapterOutlines?: unknown[];
      };
      await deps.emit({
        type: "agent-playground.dimension:outline:planned",
        missionId,
        userId,
        payload: {
          chapterCount: outlinePlan.chapterOutlines?.length ?? 0,
        },
      });
    }
  } catch (err) {
    deps.log.warn(
      `[${missionId}] outline-planner failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
