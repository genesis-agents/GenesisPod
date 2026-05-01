/**
 * Stage S11 — Persist (final)
 *
 * Mission 成功路径的终态写库：把 reportArtifact + leaderSignOff + verdicts +
 * userProfile + reconciliationReport 等一次性落到 agent_playground_missions 行，
 * 并按签字结果分流到 markCompleted / markFailed。
 *
 *   reads  ctx: missionId, t0, pool, runMissionBody 全部 result 字段
 *   writes ctx: (none — 终态)
 *   deps:       store.markCompleted / store.markFailed
 *
 * 分流逻辑：
 *   leaderSignOff.signed === false  → markFailed（Lead 拒签 → "quality-failed"）
 *   leaderSignOff.signed === true   → markCompleted + 写 leaderVerdict/Score
 *   未跑到 M7（reportArtifact 为空等）→ markCompleted（leaderSigned=undefined）
 *   chapter content guard 未过      → markFailed（"chapter_content_below_threshold"）
 *
 * 注：异常路径（catch handler 里的 markFailed）不在本 stage —— 它需要 errorMessage /
 *     failureCode 等异常元数据，归 runMission 入口的 try/catch 处理。
 */

import type { MissionDeps } from "../mission-deps";

// ★ 假完成防御：chapter content guard 阈值常量
const MIN_CHAPTER_CHARS = 500; // 单章最小内容长度（字符数）
const MIN_COVERAGE = 0.5; // 至少 50% chapter 有内容才算完成

interface PersistInput {
  missionId: string;
  /** ★ P1-NEW-H (round 2): userId 必传 —— persist-failed 事件不能空 userId 路由 */
  userId: string;
  t0: number;
  result: {
    report?: unknown;
    reportArtifact?: {
      metadata: { topic?: string; modelTrail?: string[] };
      quickView?: { executiveSummary?: { markdown?: string } };
      /** 章节偏移索引，用于 chapter content guard */
      sections?: Array<{ startOffset: number; endOffset: number }>;
      /** 报告全文 markdown，sections 通过 startOffset/endOffset slice 取章节内容 */
      content?: { fullMarkdown: string };
    };
    reviewScore?: number;
    trajectoryStored?: number;
    themeSummary?: string;
    dimensions?: unknown[];
    verdicts?: unknown;
    userProfile?: unknown;
    reconciliationReport?: unknown;
    leaderSignOff?: {
      leaderOverallScore: number;
      leaderVerdict: "excellent" | "good" | "acceptable" | "failed";
      signed: boolean;
      refusalReason?: string;
    };
  };
  pool: { snapshot(): { poolTokensUsed: number; poolCostUsd: number } };
}

export async function runPersistStage(
  args: PersistInput,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, t0, result, pool } = args;
  const snap = pool.snapshot();
  // P0-5: 优先存 ReportArtifact v2，fallback 旧 ResearchReport v1
  const v2Title = result.reportArtifact?.metadata?.topic;
  const v2Summary =
    result.reportArtifact?.quickView?.executiveSummary?.markdown;
  const reportPayload = result.reportArtifact
    ? {
        ...(result.reportArtifact as Record<string, unknown>),
        title: v2Title,
        summary: v2Summary,
      }
    : (result.report as {
        title?: string;
        summary?: string;
      });

  // ★ P1-H (2026-04-29): persist DB 写入失败时，必须发事件让前端知道（否则前端永远 polling running）
  try {
    // ★ 假完成防御 (2026-04-30): 在 markCompleted/markFailed 之前先校验 chapter content 覆盖率
    //   reportArtifact.sections + content.fullMarkdown 是章节内容的权威来源；
    //   leader signoff 只看打分不看字数，所以需要在 S11 独立守门。
    if (
      result.reportArtifact?.sections &&
      result.reportArtifact.sections.length > 0
    ) {
      const fullMarkdown = result.reportArtifact.content?.fullMarkdown ?? "";
      const sections = result.reportArtifact.sections;

      const sectionLengths = sections.map((s) =>
        Math.max(0, s.endOffset - s.startOffset),
      );
      const sectionsWithContent = sectionLengths.filter(
        (len) => len >= MIN_CHAPTER_CHARS,
      );
      const coverage = sectionsWithContent.length / sections.length;
      const totalChars = fullMarkdown.length;

      if (coverage < MIN_COVERAGE) {
        deps.log.warn(
          `[s11 ${missionId}] chapter content guard failed: coverage=${(coverage * 100).toFixed(1)}% (${sectionsWithContent.length}/${sections.length}) totalChars=${totalChars} → markFailed instead of markCompleted`,
        );
        await deps.store.markFailed(missionId, {
          errorMessage: `chapter_content_below_threshold: coverage=${(coverage * 100).toFixed(1)}% (${sectionsWithContent.length}/${sections.length} sections >= ${MIN_CHAPTER_CHARS} chars), totalChars=${totalChars}`,
          tokensUsed: snap.poolTokensUsed,
          costUsd: snap.poolCostUsd,
          wallTimeMs: Date.now() - t0,
        });
        await deps
          .emit({
            type: "agent-playground.mission:failed",
            missionId,
            userId,
            payload: {
              reason: "chapter_content_below_threshold",
              chapterCoverage: coverage,
              totalChars,
            },
          })
          .catch(() => {});
        return;
      }
    }

    if (result.leaderSignOff && !result.leaderSignOff.signed) {
      await deps.store.markFailed(missionId, {
        wallTimeMs: Date.now() - t0,
        errorMessage: `Lead 拒绝签字: ${result.leaderSignOff.refusalReason ?? "未达 qualityBar / successCriteria 不全回答"}`,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
        trajectoryStored: result.trajectoryStored,
        themeSummary: result.themeSummary,
        dimensions: result.dimensions as never,
        report: reportPayload as unknown as {
          title?: string;
          summary?: string;
        },
        reportArtifactVersion: result.reportArtifact ? 2 : 1,
        userProfile: (result.userProfile ?? null) as never,
        reconciliationReport: (result.reconciliationReport ?? null) as never,
        verdicts: result.verdicts as never,
        leaderJournal: undefined,
        leaderOverallScore: result.leaderSignOff.leaderOverallScore,
        leaderSigned: false,
        leaderVerdict: result.leaderSignOff.leaderVerdict,
      });
    } else {
      await deps.store.markCompleted(missionId, {
        finalScore: result.reviewScore,
        tokensUsed: snap.poolTokensUsed,
        costUsd: snap.poolCostUsd,
        trajectoryStored: result.trajectoryStored,
        wallTimeMs: Date.now() - t0,
        themeSummary: result.themeSummary,
        dimensions: result.dimensions as never,
        report: reportPayload as unknown as {
          title?: string;
          summary?: string;
        },
        reportArtifactVersion: result.reportArtifact ? 2 : 1,
        userProfile: (result.userProfile ?? null) as never,
        reconciliationReport: (result.reconciliationReport ?? null) as never,
        verdicts: result.verdicts as never,
        leaderOverallScore: result.leaderSignOff?.leaderOverallScore,
        leaderSigned: result.leaderSignOff?.signed,
        leaderVerdict: result.leaderSignOff?.leaderVerdict,
      });
      // ★ 2026-04-30: 真正的 mission:completed —— 在 markCompleted 写库成功后 emit。
      //   之前 S8 提前 emit 导致前端"假成功"且 DB 行还是 running。
      await deps
        .emit({
          type: "agent-playground.mission:completed",
          missionId,
          userId,
          payload: {
            reviewScore: result.reviewScore,
            costUsd: snap.poolCostUsd,
            tokensUsed: snap.poolTokensUsed,
            trajectoryStored: result.trajectoryStored,
            wallTimeMs: Date.now() - t0,
            verifierVerdicts: result.verdicts,
            leaderSigned: result.leaderSignOff?.signed,
            leaderOverallScore: result.leaderSignOff?.leaderOverallScore,
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log.error(`[s11 ${missionId}] persist failed: ${message}`);
    await deps
      .emit({
        type: "agent-playground.mission:persist-failed",
        missionId,
        userId,
        payload: { message, wallTimeMs: Date.now() - t0 },
      })
      .catch(() => {});
    throw err;
  }
}
