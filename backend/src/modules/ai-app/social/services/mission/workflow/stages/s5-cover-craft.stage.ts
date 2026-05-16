/**
 * Stage S5 — Cover craft (parallel per platform)
 *
 *   reads  ctx: platformVersions, leaderAssess（reject 平台跳过）, input
 *   writes ctx: covers (Record<platform, CoverArtistOutput>)
 */

import { ConcurrencyLimiter } from "@/modules/ai-harness/facade";
import type {
  MissionInvariants,
  TransformPhaseCtx,
  AssessPhaseCtx,
  CraftPhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

interface RawContentBag {
  title: string;
  body: string;
  digest: string | null;
  coverImageUrl: string | null;
}

export async function runCoverCraftStage(
  ctx: MissionInvariants &
    TransformPhaseCtx &
    AssessPhaseCtx &
    CraftPhaseCtx & { contentRaw?: RawContentBag },
  deps: CommonDeps,
): Promise<void> {
  const {
    missionId,
    userId,
    input,
    platformVersions,
    leaderAssess,
    contentRaw,
    pool,
    billing,
  } = ctx;
  if (!platformVersions || !contentRaw) {
    throw new Error(
      `[s5] missing platformVersions or contentRaw for ${missionId}`,
    );
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

  if (platformsToProcess.length === 0) {
    deps.log.warn(`[s5] no platforms to process for ${missionId}`);
    return;
  }

  await narrate(deps.emit, missionId, userId, {
    stage: "s5-cover-craft",
    role: "cover-artist",
    tag: "writing",
    text: `为 ${platformsToProcess.length} 个平台生成封面`,
  });

  const firstBodyImg =
    contentRaw.body.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  const limiter = new ConcurrencyLimiter(
    Math.min(4, platformsToProcess.length),
  );
  const covers: Record<string, unknown> = {};

  await Promise.all(
    platformsToProcess.map((platform) =>
      limiter.run(async () => {
        const r = await deps.coverArtist.run({
          input: {
            platform,
            title: platformVersions[platform].title,
            contentId: input.contentId,
            userProvidedCoverUrl: contentRaw.coverImageUrl,
            bodyFirstImgUrl: firstBodyImg,
            imageGenerationAllowed: input.budgetProfile === "rich",
          },
          ctx: {
            missionId,
            userId,
            agentId: `cover-artist-${platform}-${missionId}`,
            role: "cover-artist",
            envAdapter: billing,
          },
          pool,
        });
        if (r.state !== "failed" && r.output) covers[platform] = r.output;
      }),
    ),
  );

  (ctx as CraftPhaseCtx).covers = covers as CraftPhaseCtx["covers"];

  await narrate(deps.emit, missionId, userId, {
    stage: "s5-cover-craft",
    role: "cover-artist",
    tag: "success",
    text: `封面生成完成：${Object.keys(covers).length}/${platformsToProcess.length}`,
  });
}
