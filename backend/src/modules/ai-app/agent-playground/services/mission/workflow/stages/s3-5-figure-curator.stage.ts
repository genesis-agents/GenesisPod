/**
 * Stage S3.5 — Figure-curator (PR-5 v1.6 D6 figure-curator stage)
 *
 * 正常 mission 路径：figure-curator 已在 per-dim-pipeline 内联调用（见
 * per-dim-pipeline.util.ts L1100-1140 PR-5 wire），本 stage 在主管线内是 no-op
 * 占位（保留 stage emit / lifecycle 兼容 RerunIntent INTENT_STAGES["add-figures"] 路由）。
 *
 * Rerun 路径："add-figures" 意图触发本 stage：
 *   - load published chapters
 *   - 对每章节调 figureCuratorService.curate
 *   - 写 chapter_figures 表（user_id WHERE 隔离）
 *   - emit business 事件（被 LivenessGuard 当活迹）
 *
 * 文件命名：s3-5（横线）— v1.4 PR-A2: 横线避免文件系统小数点问题
 * 注册顺序：s3 → s3-5 → s4（按 PIPELINE_STAGES 数组顺序，runner 不解析小数语义）
 *
 * 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 13.2
 */

import type { MissionInvariants } from "../mission-context";
import type { MissionDeps } from "../mission-deps";

const STAGE_ID = "s3-5-figure-curator";

export async function runFigureCuratorStage(
  ctx: MissionInvariants,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId } = ctx;

  // emit started 让 LivenessGuard 看见活迹
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

  // 正常 mission 路径：figure-curator 已在 per-dim-pipeline 内联完成
  // 本 stage 为 no-op 占位（保 RerunIntent add-figures 路由能引用）
  // 真实 rerun add-figures 逻辑由 RerunIntent handler 直调 figureCuratorService

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
