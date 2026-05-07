/**
 * Stage S7.5 — Sub-section planner (PR-13 v1.6 § 13.2)
 *
 * 正常 mission 路径：sub-section planner 已在 per-dim-pipeline 内联调用（见
 * invokeChapterViaSubSections helper），本 stage 在主管线内是 no-op 占位
 * （保留 stage emit / lifecycle 兼容 RerunIntent INTENT_STAGES["extend-length"] 路由）。
 *
 * Rerun 路径："extend-length" 意图触发本 stage（与 outline-planner 一起做章节大纲扩写）。
 *
 * 文件命名：s7-5（横线，PR-A2 v1.4）
 * 注册顺序：s7 → s7-5 → s8（按 PIPELINE_STAGES 数组）
 *
 * 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 13.2
 */

import type { MissionInvariants } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

const STAGE_ID = "s7-5-sub-section-planner";

export async function runSubSectionPlannerStage(
  ctx: MissionInvariants,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId } = ctx;

  await deps
    .emit({
      type: `agent-playground.${STAGE_ID}:started`,
      missionId,
      userId,
      payload: { mode: "main-pipeline" },
    })
    .catch((err: unknown) => {
      deps.log.warn(
        `[${missionId}] emit ${STAGE_ID}:started failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

  // 正常 mission 路径：sub-section 规划已在 per-dim-pipeline.invokeChapterViaSubSections 内联
  // 本 stage 为 no-op 占位（保 RerunIntent extend-length 路由能引用）

  await deps
    .emit({
      type: `agent-playground.${STAGE_ID}:completed`,
      missionId,
      userId,
      payload: { mode: "main-pipeline-noop" },
    })
    .catch((err: unknown) => {
      deps.log.warn(
        `[${missionId}] emit ${STAGE_ID}:completed failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}
