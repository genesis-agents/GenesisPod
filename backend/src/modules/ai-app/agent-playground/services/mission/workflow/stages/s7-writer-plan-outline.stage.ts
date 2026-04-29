/**
 * Stage S7 — Writer outline: Mission-level chapter planner
 *
 * thorough+ 档位下跑 MissionOutlinePlannerAgent，先列出 mission 级 chapter 大纲
 * （sectionId/heading/thesis + targetWordsPerChapter + factAllocation），让下游
 * Writer 起草时按 outline 走，不必边写边规划。
 *
 *   reads  ctx: plan, reconciliationReport, input.auditLayers
 *   writes ctx: outlinePlan (★ P1-E 2026-04-29: 真消费 — S8 SingleShotWriter 按此 outline 起草)
 *   deps:       writer.planMissionOutline, invoker (tickCost), emit, log
 *
 * Skip 条件: auditLayers ∉ {thorough, paranoid} → 直接 return
 * Failure modes: 任何抛错 → log warn + 继续（不阻塞，Writer 走无 outline 路径）
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import { extractTokenSpend } from "../helpers/token-spend.util";
import { narrate } from "../helpers/narrative.util";

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
    await narrate(deps.emit, missionId, userId, {
      stage: "s7-writer-outline",
      role: "writer",
      tag: "planning",
      text: "Writer 开始规划报告 mission-level 章节大纲",
      agentId: "outline-planner",
    });
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
        chapterOutlines?: {
          sectionId: string;
          heading: string;
          subheadings?: string[];
          thesis: string;
          keyPointsToCover: string[];
        }[];
        targetWordsPerChapter?: Record<string, number>;
        factAllocation?: Record<string, string[]>;
      };
      // ★ P1-E (2026-04-29): 真消费 — 写入 ctx.outlinePlan，S8 SingleShotWriter 严格按此 outline 起草
      if (
        outlinePlan.chapterOutlines &&
        outlinePlan.chapterOutlines.length > 0
      ) {
        ctx.outlinePlan = {
          chapterOutlines: outlinePlan.chapterOutlines.map((c) => ({
            sectionId: c.sectionId,
            heading: c.heading,
            subheadings: c.subheadings ?? [],
            thesis: c.thesis,
            keyPointsToCover: c.keyPointsToCover,
          })),
          targetWordsPerChapter: outlinePlan.targetWordsPerChapter ?? {},
          factAllocation: outlinePlan.factAllocation ?? {},
        };
      }
      await deps.emit({
        type: "agent-playground.dimension:outline:planned",
        missionId,
        userId,
        payload: {
          chapterCount: outlinePlan.chapterOutlines?.length ?? 0,
        },
      });
      await narrate(deps.emit, missionId, userId, {
        stage: "s7-writer-outline",
        role: "writer",
        tag: "success",
        text: `章节大纲规划完成 · ${outlinePlan.chapterOutlines?.length ?? 0} 章`,
        agentId: "outline-planner",
      });
    }
  } catch (err) {
    deps.log.warn(
      `[${missionId}] outline-planner failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
