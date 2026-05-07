/**
 * CtxHydratorService —— 从 DB 重建 MissionContext 给单 stage 局部重跑用
 *
 * 上游：docs/architecture/ai-harness/runner/per-task-rerun-with-cascade.md v1.2 §3.2
 *
 * v1.2 修订（vs v1.0）：
 *   - 类别 A：单一信源 — researcherResults / reportArtifact / outlinePlan / analystOutput 全
 *     从 mission 行字段 + 子表读，不再读 event payload（v1.0 BLOCKER 修）
 *   - 类别 D1+D2：retry_label 取 latest（DISTINCT ON dimension ORDER BY created_at DESC）+ dim
 *     字符串作 chapter ↔ research join key（不用数组 index 漂移）
 *   - 类别 D3：补全 5 字段 ctx 重建（researcherResults / reportArtifact / outlinePlan /
 *     analystOutput / verifierVerdicts）
 *   - 类别 E1：reportArtifact 必须 zod parse；失败 throw BadRequest
 *   - 类别 E5：mission.report_full payload 大小硬上限（与 zod 一致 2MB）
 *   - 类别 B2：hydrate guard 改 heartbeat 时间窗（< 60s 拒，>= 60s 允许）
 *
 * 限制：
 *   - 装配阶段的 leader / billing / pool / abortRegistry / budgetMultiplier 不能从 DB 重建
 *   - 调用方需要自己 supply 这些 ctx 字段（通常是 minimal stub 或 mission 子集）
 *   - userProfile 必须存在（mission create 时就写了），用于重建 input
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { MissionContext } from "../workflow/mission-context";
import { MissionStore } from "../lifecycle/mission-store.service";
import { PrismaService } from "../../../../../../common/prisma/prisma.service";
import type {
  RunMissionInput,
  ResearchReport,
} from "../../../dto/run-mission.dto";
import {
  parseReportArtifact,
  type ReportArtifact,
} from "@/modules/ai-harness/facade";

/** v1.2 类别 B2：60s heartbeat 窗口 — < 60s 拒（mission 真在跑），≥ 60s 允许（reopen 等待 cascade） */
const HEARTBEAT_INFLIGHT_THRESHOLD_MS = 60_000;

/** v1.2 类别 E5：mission.report_full 反序列化后大小硬上限（与 zod schema 一致） */
const MAX_REPORT_FULL_BYTES = 2_000_000;

/**
 * Hydrated ctx 提供给 stage 函数 —— 缺装配期纯 runtime 字段（leader/billing/pool 等），
 * 那些由调用方按需补 stub。stage 函数若实际访问这些字段会运行时 throw（提示设计错误）。
 */
export type HydratedMissionContext = Omit<
  MissionContext,
  "billing" | "pool" | "leader" | "budgetMultiplier" | "t0"
> & {
  /** 重跑场景下 t0 重置为 rerun 启动时间 */
  readonly t0: number;
  /** 标识此 ctx 来自 hydrate 而非装配 —— 调用方决策时可读 */
  readonly __hydrated: true;
};

@Injectable()
export class CtxHydratorService {
  private readonly log = new Logger(CtxHydratorService.name);

  constructor(
    private readonly store: MissionStore,
    private readonly prisma: PrismaService,
  ) {}

  async hydrate(
    missionId: string,
    userId: string,
  ): Promise<HydratedMissionContext> {
    const detail = await this.store.getById(missionId, userId);
    if (!detail) {
      throw new NotFoundException(
        `mission ${missionId} not found or not owned by ${userId}`,
      );
    }

    // v1.2 类别 B2：mission 在 reopen 后 status=running 是合法的；
    // 用 heartbeat 时间窗判断 — < 60s 拒（其它 pod 真在跑），≥ 60s 允许
    if (detail.status === "running") {
      const hbAt = detail.heartbeatAt;
      const hbAge = hbAt
        ? Date.now() - hbAt.getTime()
        : Number.POSITIVE_INFINITY;
      if (hbAge < HEARTBEAT_INFLIGHT_THRESHOLD_MS) {
        throw new BadRequestException(
          `mission ${missionId} is in-flight (heartbeat ${Math.round(hbAge / 1000)}s ago) — cannot rerun while live`,
        );
      }
      this.log.warn(
        `[hydrate ${missionId}] status=running but heartbeat stale (${Math.round(hbAge / 1000)}s ago) — allowing hydrate (reopen pending)`,
      );
    }

    const userProfile =
      (detail.userProfile as Partial<RunMissionInput> | null) ?? {};

    const input: RunMissionInput = {
      topic: detail.topic,
      depth: (userProfile.depth ??
        (["quick", "standard", "deep"].includes(detail.depth)
          ? detail.depth
          : "deep")) as RunMissionInput["depth"],
      language: (userProfile.language ??
        (detail.language === "en-US"
          ? "en-US"
          : "zh-CN")) as RunMissionInput["language"],
      budgetProfile: userProfile.budgetProfile ?? "medium",
      styleProfile: userProfile.styleProfile ?? "executive",
      lengthProfile: userProfile.lengthProfile ?? "standard",
      audienceProfile: userProfile.audienceProfile ?? "domain-expert",
      withFigures: userProfile.withFigures ?? true,
      auditLayers: userProfile.auditLayers ?? "default",
      concurrency: userProfile.concurrency ?? 3,
      viewMode: userProfile.viewMode ?? "continuous",
      maxCredits: detail.maxCredits,
      budgetMultiplierOverride: userProfile.budgetMultiplierOverride ?? 1.0,
    };

    // v1.2 类别 A1+E1+E5：reportArtifact 必从 mission.report_full 读 + zod 校验
    let reportArtifact: ReportArtifact | undefined;
    let report: ResearchReport | undefined;
    if (detail.reportFull) {
      // size guard（防 OOM）
      const serialized = JSON.stringify(detail.reportFull);
      if (serialized.length > MAX_REPORT_FULL_BYTES) {
        throw new BadRequestException(
          `mission ${missionId} report_full size ${serialized.length} > ${MAX_REPORT_FULL_BYTES} (DoS 防护)`,
        );
      }
      if (detail.reportArtifactVersion === 2) {
        const parsed = parseReportArtifact(detail.reportFull);
        if (!parsed.ok) {
          throw new BadRequestException(
            `mission ${missionId} report_full validation failed: ${parsed.errorMessage}`,
          );
        }
        reportArtifact = parsed.data as unknown as ReportArtifact;
      } else {
        report = detail.reportFull as unknown as ResearchReport;
      }
    }

    const dimensions =
      (detail.dimensions as
        | NonNullable<MissionContext["plan"]>["dimensions"]
        | null) ?? [];
    const themeSummary = detail.themeSummary ?? "";

    type LeaderVerdict = "excellent" | "good" | "acceptable" | "failed";
    const leaderVerdict =
      (detail.leaderVerdict as LeaderVerdict | null) ?? null;

    // v1.2 类别 D1+D2：从子表重建 researcherResults
    const researcherResults = await this.hydrateResearcherResults(missionId);

    const ctx: HydratedMissionContext = {
      __hydrated: true,
      missionId,
      userId,
      input,
      t0: Date.now(),
      plan: {
        themeSummary,
        dimensions,
        // 局部重跑不需要重新规划 goals/risks —— cast undefined（plan 仅给 stage 看 dim/themeSummary）
        goals: undefined as unknown as NonNullable<
          MissionContext["plan"]
        >["goals"],
        initialRisks: undefined as unknown as NonNullable<
          MissionContext["plan"]
        >["initialRisks"],
      },
      researcherResults,
      reconciliationReport:
        detail.reconciliationReport as MissionContext["reconciliationReport"],
      // v1.2 类别 D3：从 mission 行字段读（PR-R0 加的列）
      outlinePlan: detail.outlinePlan as MissionContext["outlinePlan"],
      analystOutput: detail.analystOutput,
      report,
      reportArtifact,
      reviewScore:
        typeof detail.finalScore === "number" ? detail.finalScore : undefined,
      verifierVerdicts: (detail.verdicts as unknown[] | null) ?? undefined,
      leaderSignOff:
        detail.leaderSigned !== null && leaderVerdict !== null
          ? {
              phase: "signoff",
              signed: detail.leaderSigned ?? false,
              leaderOverallScore: detail.leaderOverallScore ?? 0,
              leaderVerdict,
              accountabilityNote: "",
            }
          : undefined,
      trajectoryStored: detail.trajectoryStored ?? undefined,
    };

    this.log.log(
      `[hydrate ${missionId}] artifactVersion=${detail.reportArtifactVersion} sections=${reportArtifact?.sections.length ?? 0} dimensions=${dimensions.length} researchResults=${researcherResults?.length ?? 0} verdicts=${(detail.verdicts as unknown[] | null)?.length ?? 0} outlinePlan=${detail.outlinePlan ? "yes" : "no"} analystOutput=${detail.analystOutput ? "yes" : "no"}`,
    );
    return ctx;
  }

  /**
   * v1.2 类别 D1+D2：从子表重建 researcherResults
   *
   * - DISTINCT ON (dimension) ORDER BY dimension, created_at DESC：取每个 dim 的 latest
   *   retry_label（leader-assess-retry 产生多行时只用最后一轮）
   * - cdByDim Map<string, ...>：用 dim 字符串作 join key（不依赖数组 index 漂移）
   */
  private async hydrateResearcherResults(
    missionId: string,
  ): Promise<MissionContext["researcherResults"]> {
    interface ResearchRow {
      dimension: string;
      findings: unknown;
      summary: string | null;
    }
    const rrRows = await this.prisma.$queryRawUnsafe<ResearchRow[]>(
      `SELECT DISTINCT ON (dimension) dimension, findings, summary
       FROM agent_playground_research_results
       WHERE mission_id = $1
       ORDER BY dimension, created_at DESC`,
      missionId,
    );
    if (rrRows.length === 0) return undefined;

    const cdRows = await this.prisma.agentPlaygroundChapterDraft.findMany({
      where: { missionId },
      orderBy: [{ dimension: "asc" }, { chapterIndex: "asc" }],
    });
    const cdByDim = new Map<string, typeof cdRows>();
    for (const cd of cdRows) {
      if (!cdByDim.has(cd.dimension)) cdByDim.set(cd.dimension, []);
      cdByDim.get(cd.dimension)!.push(cd);
    }

    return rrRows.map((rr) => {
      const findings = (rr.findings ?? []) as Array<{
        claim: string;
        evidence: string;
        source: string;
      }>;
      const chapters = cdByDim.get(rr.dimension) ?? [];
      const fullMarkdown =
        chapters.length > 0
          ? chapters.map((c) => `### ${c.heading}\n\n${c.content}`).join("\n\n")
          : undefined;
      return {
        dimension: rr.dimension,
        findings,
        summary: rr.summary ?? "",
        // 扩展字段（per-dim chapter pipeline 产物）
        ...(fullMarkdown ? { fullMarkdown } : {}),
        ...(chapters.length > 0
          ? {
              chapters: chapters.map((c) => ({
                index: c.chapterIndex,
                heading: c.heading,
                body: c.content,
                wordCount: c.wordCount ?? 0,
              })),
            }
          : {}),
      };
    }) as MissionContext["researcherResults"];
  }
}
