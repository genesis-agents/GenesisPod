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
import { normalizeTargetWords } from "../helpers/word-count-normalizer.util";

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
      // ★ P1-F (2026-04-29): outline 节数边界 [1, 20] —— 0 节走无 outline 路径，>20 节截断为前 20 章
      // ★ P1-NEW-D (round 2): sectionId 去重 + targetWords/factAllocation 修剪到合法集合
      const MAX_OUTLINE_CHAPTERS = 20;
      const rawChapters = outlinePlan.chapterOutlines ?? [];
      // 1) sectionId 去重：保留首个出现的（防御 LLM 重复 id）
      const seenIds = new Set<string>();
      const chapters = rawChapters.filter((c) => {
        if (seenIds.has(c.sectionId)) return false;
        seenIds.add(c.sectionId);
        return true;
      });
      if (chapters.length !== rawChapters.length) {
        deps.log.warn(
          `[${missionId}] outline-planner returned ${rawChapters.length - chapters.length} duplicate sectionId, deduplicated`,
        );
      }
      // 2) 截断到上限
      const finalChapters = chapters.slice(0, MAX_OUTLINE_CHAPTERS);
      if (chapters.length > MAX_OUTLINE_CHAPTERS) {
        deps.log.warn(
          `[${missionId}] outline-planner returned ${chapters.length} chapters > ${MAX_OUTLINE_CHAPTERS} cap, truncating`,
        );
      }
      // 3) 修剪 targetWords / factAllocation 只保留有效 sectionId 的 key
      const validIds = new Set(finalChapters.map((c) => c.sectionId));
      const trimRecord = <T>(
        rec: Record<string, T> | undefined,
      ): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(rec ?? {})) {
          if (validIds.has(k)) out[k] = v;
        }
        return out;
      };
      if (finalChapters.length > 0) {
        const trimmedTargetWords = trimRecord(
          outlinePlan.targetWordsPerChapter,
        );
        // ★ Phase 1 移植 (TI leader-planning.service.ts:859-880): 中位数归一化
        // 防止 LLM 返回极度不均的字数分配（500/500/500/7000）—— 极小章节凑空话、
        // 极大章节超 ChapterWriter budget 触发死循环。
        const normalized = normalizeTargetWords(trimmedTargetWords);
        if (normalized.normalized) {
          deps.log.log(
            `[${missionId}] outline targetWords normalized: median=${normalized.stats.median}, ` +
              `allowed=[${normalized.stats.minAllowed}, ${normalized.stats.maxAllowed}], ` +
              `clamped down=${normalized.stats.countClampedDown} up=${normalized.stats.countClampedUp}`,
          );
        }
        ctx.outlinePlan = {
          chapterOutlines: finalChapters.map((c) => ({
            sectionId: c.sectionId,
            heading: c.heading,
            subheadings: c.subheadings ?? [],
            thesis: c.thesis,
            keyPointsToCover: c.keyPointsToCover,
          })),
          targetWordsPerChapter: normalized.targetWords,
          factAllocation: trimRecord(outlinePlan.factAllocation),
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
