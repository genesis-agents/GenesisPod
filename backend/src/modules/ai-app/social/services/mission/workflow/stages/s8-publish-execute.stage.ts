/**
 * Stage S8 — Publish execute (real side-effect, parallel per platform)
 *
 *   reads  ctx: platformVersions, composed, covers, polished, contextIds, input
 *   writes ctx: published (Record<platform, PublishExecutorOutput>)
 *
 *   ★ 唯一产生平台副作用的 stage —— 失败时上报 FailureLearner 让 S8b retry
 *     按 ret code 决定策略。
 */

import { ConcurrencyLimiter } from "@/modules/ai-harness/facade";
import type {
  MissionInvariants,
  TransformPhaseCtx,
  ComposePhaseCtx,
  CraftPhaseCtx,
  PolishPhaseCtx,
  PublishPhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runPublishExecuteStage(
  ctx: MissionInvariants &
    TransformPhaseCtx &
    ComposePhaseCtx &
    CraftPhaseCtx &
    PolishPhaseCtx &
    PublishPhaseCtx,
  deps: CommonDeps,
): Promise<void> {
  const {
    missionId,
    userId,
    input,
    platformVersions,
    composed,
    covers,
    contextIds,
    pool,
    billing,
  } = ctx;
  if (!platformVersions || !composed || !covers) {
    throw new Error(`[s8] missing prior phase outputs for ${missionId}`);
  }

  const platforms = Object.keys(composed);
  await narrate(deps.emit, missionId, userId, {
    stage: "s8-publish-execute",
    role: "publish-executor",
    tag: "publishing",
    text: `开始真发 ${platforms.length} 个平台`,
  });

  const limiter = new ConcurrencyLimiter(Math.min(2, platforms.length));
  const published: Record<string, unknown> = {};

  await Promise.all(
    platforms.map((platform) =>
      limiter.run(async () => {
        const version = platformVersions[platform];
        const composedOut = composed[platform];
        const cover = covers[platform];
        if (!version || !composedOut || !cover) return;
        const r = await deps.publishExecutor.run({
          input: {
            platform,
            contextId:
              contextIds[platform] ?? `social-${platform}-${missionId}`,
            platformVersion: {
              title: version.title,
              digest: version.digest ?? null,
              bodyHtml: composedOut.bodyHtml,
              coverUrl: cover.coverUrl,
              thumbMediaId: cover.thumbMediaId ?? null,
              cropMultiList: cover.cropMultiList ?? [],
            },
            connectionId: input.connectionIds[platform] ?? "",
          },
          ctx: {
            missionId,
            userId,
            agentId: `publish-executor-${platform}-${missionId}`,
            role: "publish-executor",
            envAdapter: billing,
          },
          pool,
        });
        if (r.state !== "failed" && r.output) published[platform] = r.output;
      }),
    ),
  );

  (ctx as PublishPhaseCtx).published =
    published as PublishPhaseCtx["published"];

  const succeeded = Object.values(published).filter(
    (p) => (p as { status: string }).status === "PUBLISHED",
  ).length;
  await narrate(deps.emit, missionId, userId, {
    stage: "s8-publish-execute",
    role: "publish-executor",
    tag: "success",
    text: `真发完成：${succeeded}/${platforms.length} 个平台 PUBLISHED`,
  });
}
