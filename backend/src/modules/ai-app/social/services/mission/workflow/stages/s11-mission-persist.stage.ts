/**
 * Stage S11 — Mission persist (final trajectory write)
 *
 *   reads  ctx: 全部 phase 产物
 *   writes ctx: trajectoryStored (row count written to DB)
 *
 *   PR-3c 简化版：emit mission:completed + 落 leader_journal 简要 trace。
 *   完整 trajectory + ReportArtifact 留 PR-4 dispatcher 装配 PrismaService 后扩展。
 */

import type {
  MissionInvariants,
  SignoffPhaseCtx,
  PublishPhaseCtx,
  VerifyPhaseCtx,
  PersistPhaseCtx,
} from "../mission-context";
import type { CommonDeps } from "../mission-deps";
import { narrate } from "../narrative.util";

export async function runMissionPersistStage(
  ctx: MissionInvariants &
    SignoffPhaseCtx &
    PublishPhaseCtx &
    VerifyPhaseCtx &
    PersistPhaseCtx,
  deps: CommonDeps,
): Promise<void> {
  const { missionId, userId, t0, leaderSignOff, published, verified } = ctx;

  const finishedAt = Date.now();
  const wallTimeMs = finishedAt - t0;

  const publishedCount = published
    ? Object.values(published).filter(
        (p) => (p as { status: string }).status === "PUBLISHED",
      ).length
    : 0;
  const verifiedCount = verified ? Object.keys(verified).length : 0;
  const signed = leaderSignOff?.signoff === "signed";

  (ctx as PersistPhaseCtx).trajectoryStored = 1;

  await deps
    .emit({
      type: "social.mission:completed",
      missionId,
      userId,
      payload: {
        wallTimeMs,
        publishedCount,
        verifiedCount,
        signed,
        overallScore: leaderSignOff?.overallScore ?? null,
      },
    })
    .catch(() => {});

  await narrate(deps.emit, missionId, userId, {
    stage: "s11-mission-persist",
    role: "mission",
    tag: signed ? "success" : "warning",
    text: `Mission ${signed ? "signed" : "concluded"} · ${publishedCount} 平台 PUBLISHED / ${verifiedCount} 验证 · wall ${(wallTimeMs / 1000).toFixed(1)}s`,
  });
}
