/**
 * chapter-batch-executor.helper.ts
 *
 * Concurrent chapter execution with error boundary per chapter.
 * Extracted from per-dim-pipeline.util.ts (L1257-1312) as part of PR-D-1 god-class split.
 *
 * Each chapter is run inside a pLimit slot; any thrown error is caught and converted
 * into a null result (failed chapter) so other chapters continue unaffected.
 */

import pLimit from "p-limit";
import type { MissionBudgetPool } from "@/modules/ai-harness/facade";
import type { MissionDeps } from "./mission-deps";

/**
 * Minimal shape required for a chapter outline entry consumed by this executor.
 */
export interface BatchChapterSpec {
  index: number;
  heading: string;
}

/**
 * Execute all chapters concurrently (up to `concurrency` at a time).
 *
 * @param outline           - Ordered list of chapter specs from the outline LLM.
 * @param concurrency       - Maximum number of parallel chapter pipelines.
 * @param headingsSnapshot  - Immutable list of prior chapter headings passed to each pipeline.
 * @param runOne            - Single-chapter pipeline function; returns null on chapter failure.
 * @param onChapterThrow    - Called when runOne throws (for emitting terminal events before returning null).
 * @param deps              - Mission-level dependencies (used for error logging).
 * @param ctx               - Context values needed for error logging/events.
 * @param pool              - Shared mission budget pool; if exhausted before a chapter slot fires,
 *                            the chapter is skipped (no LLM call) and a terminal event is emitted.
 */
export async function executeChapterBatch<
  TChapter extends BatchChapterSpec,
  TWritten,
>(
  outline: TChapter[],
  concurrency: number,
  headingsSnapshot: readonly string[],
  runOne: (
    chapter: TChapter,
    snapshot: readonly string[],
  ) => Promise<TWritten | null>,
  onChapterThrow: (chapter: TChapter, err: unknown) => Promise<void>,
  deps: Pick<MissionDeps, "log">,
  ctx: { missionId: string; dimensionName: string },
  pool?: MissionBudgetPool,
): Promise<PromiseSettledResult<TWritten | null>[]> {
  const limit = pLimit(concurrency);
  return Promise.allSettled(
    outline.map((chapter) =>
      limit(async () => {
        // ★ R2-#45 pre-dispatch budget gate: if the pool is exhausted before this
        //   slot fires, skip the chapter entirely — no new LLM call starts after the
        //   cap trips. Emit the same terminal chapter:done(failed-finalized) so the
        //   frontend state machine closes cleanly.
        if (pool?.isExhausted?.()) {
          deps.log.warn(
            `[${ctx.missionId}] budget pool exhausted; skipping chapter §${chapter.index} (${ctx.dimensionName})`,
          );
          await onChapterThrow(
            chapter,
            new Error("budget-pool-exhausted: skipped before LLM call"),
          );
          return null;
        }
        // ★ 2026-05-12: runChapterPipeline internal LLM/network throws are caught here.
        //   allSettled would otherwise silently filter the rejection so the frontend
        //   never receives a terminal event → chapter stuck in 'reviewing'.
        //   Emit chapter:done(failed-finalized) to close the state machine.
        try {
          return await runOne(chapter, headingsSnapshot);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          deps.log.error(
            `[${ctx.missionId}] chapter pipeline §${chapter.index} (${ctx.dimensionName}) threw: ${msg}`,
          );
          await onChapterThrow(chapter, err);
          return null;
        }
      }),
    ),
  );
}
