/**
 * Stage S4 — Leader M1 assess-transform verdict
 *
 *   reads  ctx: platformVersions, input.depth
 *   writes ctx: leaderAssess (per-platform verdict)
 */

import type {
  MissionInvariants,
  TransformPhaseCtx,
  AssessPhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runLeaderAssessTransformStage(
  ctx: MissionInvariants & TransformPhaseCtx & AssessPhaseCtx,
  deps: CommonDeps,
): Promise<void> {
  const { missionId, userId, input, platformVersions, pool, billing } = ctx;
  if (!platformVersions) {
    throw new Error(`[s4] missing platformVersions for mission ${missionId}`);
  }

  await narrate(deps.emit, missionId, userId, {
    stage: "s4-leader-assess-transform",
    role: "leader",
    tag: "reviewing",
    text: `Leader 评审 ${Object.keys(platformVersions).length} 个平台的内容版本`,
  });

  const versionsArr = Object.values(platformVersions).map((v) => ({
    platform: v.platform,
    title: v.title,
    digest: v.digest ?? undefined,
    body: v.body,
    lengthMetrics: {
      titleChars: v.lengthMetrics.titleChars,
      digestChars: v.lengthMetrics.digestChars,
      bodyChars: v.lengthMetrics.bodyChars,
    },
  }));

  const r = await deps.leader.run({
    input: {
      phase: "assess-transform",
      platformVersions: versionsArr,
      qualityBar: input.depth,
    },
    ctx: {
      missionId,
      userId,
      agentId: `leader-${missionId}`,
      role: "leader",
      envAdapter: billing,
    },
    pool,
  });

  if (
    r.state === "failed" ||
    !r.output ||
    r.output.phase !== "assess-transform"
  ) {
    throw new Error(`[s4] Leader assess-transform failed for ${missionId}`);
  }
  (ctx as AssessPhaseCtx).leaderAssess = r.output;

  const rejected = r.output.perPlatform.filter((p) => p.verdict === "reject");
  if (rejected.length === Object.keys(platformVersions).length) {
    throw new Error(
      `[s4] Leader rejected all platforms: ${rejected.map((p) => p.reason).join("; ")}`,
    );
  }
  if (rejected.length > 0) {
    await deps.markStageDegraded(
      missionId,
      userId,
      "s4-leader-assess-transform",
      `Leader rejected ${rejected.length} platforms: ${rejected.map((p) => p.platform).join(",")}`,
    );
  }

  await narrate(deps.emit, missionId, userId, {
    stage: "s4-leader-assess-transform",
    role: "leader",
    tag: "success",
    text: `Leader 评审完成：${r.output.perPlatform.length} 平台 (${rejected.length} reject)`,
  });
}
