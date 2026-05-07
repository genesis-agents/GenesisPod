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

/**
 * 双信号判定补丁（2026-05-07，c195035f bug fix）：与 mission-liveness-guard 对齐。
 *
 * 单 heartbeat 信号会被 zombie heartbeat 误判：mission 在 7h+ 前 fail / postlude
 * 完成后 setInterval refreshHeartbeat 没停（pod 仍在跑 → setInterval 持续 fire），
 * heartbeat_at 持续刷到现在；但 stage event 7h+ 没新 → mission 实际死了。
 *
 * 改双信号 — heartbeat fresh AND event fresh 才认 in-flight，否则视为 stale 允许 rerun。
 * event 阈值放宽到 5min（stage 间最长正常空隙），heartbeat 阈值仍 60s（pod 级心跳更紧）。
 *
 * 修复对象：c195035f mission 重跑被 "in-flight (heartbeat 2s ago)" 误拒，但
 * 最近真 stage event 在 7h 前，是 zombie heartbeat。
 */
const EVENT_INFLIGHT_THRESHOLD_MS = 5 * 60_000;

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

    // v1.2 类别 B2 + 2026-05-07 bug fix：mission 在 reopen 后 status=running 合法；
    // 双信号判定（heartbeat AND 最近事件）—— 治 zombie heartbeat 误拒 rerun 问题。
    // 见 EVENT_INFLIGHT_THRESHOLD_MS 注释（c195035f mission 真因）。
    if (detail.status === "running") {
      const now = Date.now();
      const hbAt = detail.heartbeatAt;
      const hbAge = hbAt ? now - hbAt.getTime() : Number.POSITIVE_INFINITY;
      const heartbeatFresh = hbAge < HEARTBEAT_INFLIGHT_THRESHOLD_MS;
      // 取最近一条 mission 事件（不限类型 — 任何 lifecycle / stage / failure 都算"活迹"）
      const lastEventTs = await this.getLatestEventTs(missionId).catch(
        () => null,
      );
      const eventAge =
        lastEventTs != null ? now - lastEventTs : Number.POSITIVE_INFINITY;
      const eventFresh = eventAge < EVENT_INFLIGHT_THRESHOLD_MS;
      if (heartbeatFresh && eventFresh) {
        throw new BadRequestException(
          `mission ${missionId} is in-flight (heartbeat ${Math.round(hbAge / 1000)}s ago, ` +
            `event ${Math.round(eventAge / 1000)}s ago) — cannot rerun while live`,
        );
      }
      // 单信号 fresh（zombie 心跳 / 静默 worker）允许 hydrate；记 warn 供观测
      if (heartbeatFresh && !eventFresh) {
        this.log.warn(
          `[hydrate ${missionId}] zombie heartbeat detected — hb fresh (${Math.round(hbAge / 1000)}s) ` +
            `but no event for ${Math.round(eventAge / 1000)}s — allowing rerun`,
        );
      } else {
        this.log.warn(
          `[hydrate ${missionId}] status=running but stale (hb ${Math.round(hbAge / 1000)}s, ` +
            `event ${Math.round(eventAge / 1000)}s) — allowing hydrate (reopen pending)`,
        );
      }
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
   * 取 mission 最近一条事件的 ts（毫秒）。
   * 用于 hydrate 双信号 in-flight 判定 —— event freshness 配合 heartbeat。
   * 查不到（无事件 / DB 错）返 null，调用方按"无事件"处理（≥ 阈值）。
   */
  private async getLatestEventTs(missionId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRawUnsafe<{ ts: bigint }[]>(
      `SELECT ts FROM agent_playground_mission_events
       WHERE mission_id = $1
       ORDER BY ts DESC LIMIT 1`,
      missionId,
    );
    if (rows.length === 0) return null;
    const tsMs = Number(rows[0].ts);
    return Number.isFinite(tsMs) ? tsMs : null;
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
