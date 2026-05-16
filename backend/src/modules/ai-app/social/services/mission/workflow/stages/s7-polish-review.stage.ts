/**
 * Stage S7 — Polish review (parallel per platform)
 *
 *   reads  ctx: platformVersions, composed
 *   writes ctx: polished (Record<platform, PolishReviewerOutput>)
 */

import { ConcurrencyLimiter } from "@/modules/ai-harness/facade";
import type {
  MissionInvariants,
  TransformPhaseCtx,
  ComposePhaseCtx,
  PolishPhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runPolishReviewStage(
  ctx: MissionInvariants & TransformPhaseCtx & ComposePhaseCtx & PolishPhaseCtx,
  deps: CommonDeps,
): Promise<void> {
  const { missionId, userId, platformVersions, composed, pool, billing } = ctx;
  if (!platformVersions || !composed) {
    throw new Error(
      `[s7] missing platformVersions or composed for ${missionId}`,
    );
  }

  const platforms = Object.keys(composed);
  await narrate(deps.emit, missionId, userId, {
    stage: "s7-polish-review",
    role: "polish-reviewer",
    tag: "reviewing",
    text: `润色 + 合规检查 ${platforms.length} 个平台`,
  });

  const limiter = new ConcurrencyLimiter(Math.min(4, platforms.length));
  const polished: Record<string, unknown> = {};

  await Promise.all(
    platforms.map((platform) =>
      limiter.run(async () => {
        const version = platformVersions[platform];
        const composedOut = composed[platform];
        if (!version || !composedOut) return;
        const r = await deps.polishReviewer.run({
          input: {
            platform,
            title: version.title,
            digest: version.digest ?? null,
            bodyHtml: composedOut.bodyHtml,
          },
          ctx: {
            missionId,
            userId,
            agentId: `polish-reviewer-${platform}-${missionId}`,
            role: "polish-reviewer",
            envAdapter: billing,
          },
          pool,
        });
        if (r.state !== "failed" && r.output) {
          polished[platform] = r.output;
        } else {
          await deps.markStageDegraded(
            missionId,
            userId,
            "s7-polish-review",
            `平台 ${platform} 润色审核失败`,
          );
        }
      }),
    ),
  );

  (ctx as PolishPhaseCtx).polished = polished as PolishPhaseCtx["polished"];

  await narrate(deps.emit, missionId, userId, {
    stage: "s7-polish-review",
    role: "polish-reviewer",
    tag: "success",
    text: `润色完成：${Object.keys(polished).length}/${platforms.length}`,
  });
}
