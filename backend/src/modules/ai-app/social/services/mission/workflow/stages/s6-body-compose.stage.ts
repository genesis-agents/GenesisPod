/**
 * Stage S6 — Body HTML schema compose (parallel per platform)
 *
 *   reads  ctx: platformVersions, contextIds, leaderAssess
 *   writes ctx: composed (Record<platform, ComposerOutput>)
 */

import { ConcurrencyLimiter } from "@/modules/ai-harness/facade";
import type {
  MissionInvariants,
  TransformPhaseCtx,
  AssessPhaseCtx,
  ComposePhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runBodyComposeStage(
  ctx: MissionInvariants & TransformPhaseCtx & AssessPhaseCtx & ComposePhaseCtx,
  deps: CommonDeps,
): Promise<void> {
  const {
    missionId,
    userId,
    platformVersions,
    contextIds,
    leaderAssess,
    pool,
    billing,
  } = ctx;
  if (!platformVersions) {
    throw new Error(`[s6] missing platformVersions for ${missionId}`);
  }

  const acceptedPlatforms = new Set(
    (leaderAssess?.perPlatform ?? [])
      .filter((p) => p.verdict !== "reject")
      .map((p) => p.platform),
  );
  const platformsToProcess =
    leaderAssess == null
      ? Object.keys(platformVersions)
      : Object.keys(platformVersions).filter((p) => acceptedPlatforms.has(p));

  await narrate(deps.emit, missionId, userId, {
    stage: "s6-body-compose",
    role: "composer",
    tag: "writing",
    text: `为 ${platformsToProcess.length} 个平台编排正文 HTML schema`,
  });

  const limiter = new ConcurrencyLimiter(
    Math.min(4, platformsToProcess.length),
  );
  const composed: Record<string, unknown> = {};

  await Promise.all(
    platformsToProcess.map((platform) =>
      limiter.run(async () => {
        const r = await deps.composer.run({
          input: {
            platform,
            body: platformVersions[platform].body,
            contextId:
              contextIds[platform] ?? `social-${platform}-${missionId}`,
          },
          ctx: {
            missionId,
            userId,
            agentId: `composer-${platform}-${missionId}`,
            role: "composer",
            envAdapter: billing,
          },
          pool,
        });
        if (r.state !== "failed" && r.output) composed[platform] = r.output;
      }),
    ),
  );

  (ctx as ComposePhaseCtx).composed = composed as ComposePhaseCtx["composed"];

  await narrate(deps.emit, missionId, userId, {
    stage: "s6-body-compose",
    role: "composer",
    tag: "success",
    text: `正文 HTML 注入完成：${Object.keys(composed).length}/${platformsToProcess.length}`,
  });
}
