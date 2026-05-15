/**
 * MissionReportHelper — 报告版本化与 trajectory 持久化
 * （saveReportVersion / listReportVersions / getReportVersion /
 *  saveResearchResult / loadBaselineResearchResults /
 *  saveChapterDraft / loadQualifiedChapterDrafts）。
 *
 * 普通 class（非 @Injectable），由 MissionStore 在 constructor 内 new。
 */

import { Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";

export class MissionReportHelper {
  private readonly log = new Logger(MissionReportHelper.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly isMissionRowMissing: (err: unknown) => boolean,
    private readonly emergencyAbortOnMissingRow: (
      missionId: string,
      reason: string,
    ) => void,
  ) {}

  async saveReportVersion(args: {
    missionId: string;
    triggerType: string;
    report?: { title?: string; summary?: string; [k: string]: unknown };
    finalScore?: number;
    leaderSigned?: boolean;
    versionLabel?: string;
  }): Promise<number> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const agg = await tx.missionReportVersion.aggregate({
            where: { missionId: args.missionId },
            _max: { version: true },
          });
          const nextVersion = (agg._max.version ?? 0) + 1;

          const reportTitle = args.report?.title?.slice(0, 500) ?? null;
          const reportSummary = args.report?.summary ?? null;

          await tx.missionReportVersion.create({
            data: {
              missionId: args.missionId,
              version: nextVersion,
              versionLabel:
                args.versionLabel ??
                `${args.triggerType}-${new Date().toISOString().slice(0, 10)}`,
              reportFull: (args.report ?? null) as Prisma.InputJsonValue,
              reportTitle,
              reportSummary,
              finalScore: args.finalScore ?? null,
              leaderSigned: args.leaderSigned ?? null,
              triggerType: args.triggerType.slice(0, 40),
            },
          });
          return nextVersion;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      this.log.warn(
        `[saveReportVersion ${args.missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  async listReportVersions(missionId: string): Promise<
    Array<{
      id: string;
      version: number;
      versionLabel: string | null;
      reportTitle: string | null;
      reportSummary: string | null;
      finalScore: number | null;
      leaderSigned: boolean | null;
      triggerType: string;
      generatedAt: Date;
    }>
  > {
    const rows = await this.prisma.missionReportVersion
      .findMany({
        where: { missionId },
        orderBy: { generatedAt: "desc" },
        select: {
          id: true,
          version: true,
          versionLabel: true,
          reportTitle: true,
          reportSummary: true,
          finalScore: true,
          leaderSigned: true,
          triggerType: true,
          generatedAt: true,
        },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[listReportVersions ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      });
    return rows;
  }

  async getReportVersion(
    missionId: string,
    version: number,
  ): Promise<{
    id: string;
    version: number;
    versionLabel: string | null;
    reportFull: unknown;
    reportTitle: string | null;
    reportSummary: string | null;
    finalScore: number | null;
    leaderSigned: boolean | null;
    triggerType: string;
    changesFromPrev: unknown;
    generatedAt: Date;
  } | null> {
    const row = await this.prisma.missionReportVersion
      .findUnique({
        where: { missionId_version: { missionId, version } },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[getReportVersion ${missionId} v${version}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
    if (!row) return null;
    return {
      id: row.id,
      version: row.version,
      versionLabel: row.versionLabel,
      reportFull: row.reportFull,
      reportTitle: row.reportTitle,
      reportSummary: row.reportSummary,
      finalScore: row.finalScore,
      leaderSigned: row.leaderSigned,
      triggerType: row.triggerType,
      changesFromPrev: row.changesFromPrev,
      generatedAt: row.generatedAt,
    };
  }

  async saveResearchResult(args: {
    missionId: string;
    dimension: string;
    retryLabel?: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
    state: "completed" | "degraded" | "failed";
    iterations?: number;
    wallTimeMs?: number;
  }): Promise<void> {
    await this.prisma.agentPlaygroundResearchResult
      .upsert({
        where: {
          missionId_dimension_retryLabel: {
            missionId: args.missionId,
            dimension: args.dimension.slice(0, 200),
            retryLabel: args.retryLabel ?? "",
          },
        },
        create: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          retryLabel: args.retryLabel ?? "",
          findings: args.findings as unknown as object,
          summary: args.summary.slice(0, 50_000),
          state: args.state,
          iterations: args.iterations,
          wallTimeMs: args.wallTimeMs,
        },
        update: {
          findings: args.findings as unknown as object,
          summary: args.summary.slice(0, 50_000),
          state: args.state,
          iterations: args.iterations,
          wallTimeMs: args.wallTimeMs,
        },
      })
      .catch((err: unknown) => {
        if (this.isMissionRowMissing(err)) {
          this.emergencyAbortOnMissingRow(
            args.missionId,
            `saveResearchResult FK violation dim=${args.dimension}`,
          );
          return;
        }
        this.log.warn(
          `[saveResearchResult] mission=${args.missionId} dim=${args.dimension} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async loadBaselineResearchResults(missionId: string): Promise<
    Array<{
      dimension: string;
      findings: { claim: string; evidence: string; source: string }[];
      summary: string;
    }>
  > {
    const rows = await this.prisma.agentPlaygroundResearchResult
      .findMany({
        where: { missionId, retryLabel: "" },
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[mission-report] loadResearchResults for ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      });
    return rows
      .filter((r) => r.state === "completed" || r.state === "degraded")
      .map((r) => ({
        dimension: r.dimension,
        findings: r.findings as unknown as {
          claim: string;
          evidence: string;
          source: string;
        }[],
        summary: r.summary,
      }));
  }

  async saveChapterDraft(args: {
    missionId: string;
    dimension: string;
    chapterIndex: number;
    heading: string;
    thesis?: string;
    content: string;
    status:
      | "writing"
      | "reviewing"
      | "passed"
      | "done"
      | "failed-finalized"
      | "failed";
    score?: number;
    critique?: string;
    attempts?: number;
    wordCount?: number;
  }): Promise<void> {
    await this.prisma.agentPlaygroundChapterDraft
      .upsert({
        where: {
          missionId_dimension_chapterIndex: {
            missionId: args.missionId,
            dimension: args.dimension.slice(0, 200),
            chapterIndex: args.chapterIndex,
          },
        },
        create: {
          missionId: args.missionId,
          dimension: args.dimension.slice(0, 200),
          chapterIndex: args.chapterIndex,
          heading: args.heading.slice(0, 500),
          thesis: args.thesis,
          content: args.content,
          status: args.status,
          score: args.score,
          critique: args.critique,
          attempts: args.attempts ?? 1,
          wordCount: args.wordCount,
        },
        update: {
          heading: args.heading.slice(0, 500),
          thesis: args.thesis,
          content: args.content,
          status: args.status,
          score: args.score,
          critique: args.critique,
          attempts: args.attempts ?? 1,
          wordCount: args.wordCount,
        },
      })
      .catch((err: unknown) => {
        if (this.isMissionRowMissing(err)) {
          this.emergencyAbortOnMissingRow(
            args.missionId,
            `saveChapterDraft FK violation dim=${args.dimension} ch=${args.chapterIndex}`,
          );
          return;
        }
        this.log.warn(
          `[saveChapterDraft] mission=${args.missionId} dim=${args.dimension} ch=${args.chapterIndex} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async loadQualifiedChapterDrafts(missionId: string): Promise<
    Array<{
      dimension: string;
      chapterIndex: number;
      heading: string;
      thesis?: string;
      content: string;
      score?: number;
      attempts: number;
      wordCount?: number;
    }>
  > {
    const rows = await this.prisma.agentPlaygroundChapterDraft
      .findMany({
        where: {
          missionId,
          status: { in: ["passed", "done"] },
        },
        orderBy: [{ dimension: "asc" }, { chapterIndex: "asc" }],
      })
      .catch((err: unknown) => {
        this.log.warn(
          `[mission-report] loadQualifiedChapterDrafts for ${missionId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      });
    return rows.map((r) => ({
      dimension: r.dimension,
      chapterIndex: r.chapterIndex,
      heading: r.heading,
      thesis: r.thesis ?? undefined,
      content: r.content,
      score: r.score ?? undefined,
      attempts: r.attempts,
      wordCount: r.wordCount ?? undefined,
    }));
  }
}
