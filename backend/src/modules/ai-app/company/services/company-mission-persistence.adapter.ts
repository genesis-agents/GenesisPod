/**
 * CompanyMissionPersistenceAdapter — company 侧 MissionPersistencePort 实现（W4 消费侧）。
 *
 * 背景（capability-execution-architecture.md §2.2 / §4）：
 *   能力内核执行期零 app DB——中间态走 harness CrossStageState，仅 checkpoint/resume +
 *   终态仲裁经 MissionPersistencePort 由消费方落库。company 作为消费方，注入本适配器，
 *   把这些落到自己的 company_missions 表（result Json 列），**无 schema 变更**。
 *
 * 落库策略（全部走既有 company_missions 列，无新表/新列）：
 *   - checkpoint  → result.__checkpoint JSON 子对象（best-effort，company fire-and-forget 不强求 resume）。
 *   - markStageProgress / saveResearchResult / saveReportVersion → result.__checkpoint.* 轨迹（best-effort）。
 *   - applyTerminalIfRunning → 条件 updateMany（WHERE status running）首写赢，避免取消/失败/完成竞态互相覆盖。
 *
 * 边界：company 适配器属 app 层，可直连自己的库（PrismaService）——这是消费方职责，
 *       不违反"能力层零 DB"（零 DB 约束只针对 capabilities/** 执行内核）。
 *
 * 注：本适配器只承载 MissionPersistencePort 的 checkpoint/terminal 视图。company 的
 *     业务终态落库（report/references/usage/验收 review 等富结果）仍由 CompanyMissionService
 *     的 runViaCapability 在 run() 返回后写——本适配器不重复写业务结果，避免双写打架。
 *     terminal arbiter 的主要价值：取消（cancelled）与正常完成/失败之间的"首写赢"仲裁。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import type { Prisma } from "@prisma/client";
import type {
  MissionPersistencePort,
  MissionTerminalDetails,
} from "@/modules/ai-app/marketplace/capability";

/** company_missions.status 的"运行中"集合（仅这些状态允许被终态写覆盖）。 */
const RUNNING_STATUSES = ["queued", "running", "review"] as const;

/** outcome → company_missions.status 终态映射（company 用 "done" 表示完成）。 */
const OUTCOME_TO_STATUS: Record<
  "completed" | "failed" | "cancelled",
  "done" | "failed" | "cancelled"
> = {
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
};

@Injectable()
export class CompanyMissionPersistenceAdapter implements MissionPersistencePort {
  private readonly log = new Logger(CompanyMissionPersistenceAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 内部工具：result JSON 合并落库（保留既有键，仅并入 __checkpoint 轨迹）──

  private toJson(v: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
  }

  /**
   * 读现有 result（取 __checkpoint 子对象），merge 后写回——不动 result 上的业务键。
   * best-effort：任何 DB 异常吞为 warn（checkpoint 丢失不阻断 fire-and-forget 主流程）。
   */
  private async patchCheckpoint(
    missionId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = await this.prisma.companyMission.findUnique({
        where: { id: missionId },
        select: { result: true },
      });
      const result =
        row?.result &&
        typeof row.result === "object" &&
        !Array.isArray(row.result)
          ? (row.result as Record<string, unknown>)
          : {};
      const prevCp =
        result.__checkpoint &&
        typeof result.__checkpoint === "object" &&
        !Array.isArray(result.__checkpoint)
          ? (result.__checkpoint as Record<string, unknown>)
          : {};
      const merged: Record<string, unknown> = {
        ...result,
        __checkpoint: {
          ...prevCp,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
      await this.prisma.companyMission.update({
        where: { id: missionId },
        data: { result: this.toJson(merged) },
      });
    } catch (err: unknown) {
      this.log.warn(
        `patchCheckpoint ${missionId} failed (best-effort): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── 核心：crash-resume（MUST）──

  /** 阶段进度锚点：落 __checkpoint.lastStepId（resume 定位用，best-effort）。 */
  async markStageProgress(missionId: string, stepId: string): Promise<void> {
    await this.patchCheckpoint(missionId, { lastStepId: stepId });
  }

  /**
   * 保存 checkpoint：落 company_missions.result.__checkpoint。
   * 返回值表示"mission 是否仍 running"——非 running 时不写（避免给已终态 mission 写脏 checkpoint）。
   */
  async saveCheckpoint(
    missionId: string,
    snapshot: {
      lastStepId: string;
      topic: string;
      crossState: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean> {
    try {
      const row = await this.prisma.companyMission.findUnique({
        where: { id: missionId },
        select: { status: true },
      });
      if (!row || !this.isRunning(row.status)) return false;
      await this.patchCheckpoint(missionId, {
        lastStepId: snapshot.lastStepId,
        topic: snapshot.topic,
        crossState: snapshot.crossState,
      });
      return true;
    } catch (err: unknown) {
      this.log.warn(
        `saveCheckpoint ${missionId} failed (best-effort): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** 读 checkpoint：从 result.__checkpoint 还原（company 当前不强求 resume，留接口完整）。 */
  async loadCheckpoint(missionId: string): Promise<{
    lastStepId: string;
    topic: string;
    crossState: Readonly<Record<string, unknown>>;
  } | null> {
    try {
      const row = await this.prisma.companyMission.findUnique({
        where: { id: missionId },
        select: { result: true },
      });
      const result =
        row?.result &&
        typeof row.result === "object" &&
        !Array.isArray(row.result)
          ? (row.result as Record<string, unknown>)
          : null;
      const cp =
        result?.__checkpoint &&
        typeof result.__checkpoint === "object" &&
        !Array.isArray(result.__checkpoint)
          ? (result.__checkpoint as Record<string, unknown>)
          : null;
      if (
        !cp ||
        typeof cp.lastStepId !== "string" ||
        typeof cp.topic !== "string"
      ) {
        return null;
      }
      const crossState =
        cp.crossState &&
        typeof cp.crossState === "object" &&
        !Array.isArray(cp.crossState)
          ? (cp.crossState as Record<string, unknown>)
          : {};
      return { lastStepId: cp.lastStepId, topic: cp.topic, crossState };
    } catch (err: unknown) {
      this.log.warn(
        `loadCheckpoint ${missionId} failed (best-effort): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** 清 checkpoint：从 result 删 __checkpoint 键（终态后清理，不动业务结果）。 */
  async clearCheckpoint(missionId: string): Promise<void> {
    try {
      const row = await this.prisma.companyMission.findUnique({
        where: { id: missionId },
        select: { result: true },
      });
      if (
        !row?.result ||
        typeof row.result !== "object" ||
        Array.isArray(row.result)
      ) {
        return;
      }
      const result = { ...(row.result as Record<string, unknown>) };
      if (!("__checkpoint" in result)) return;
      delete result.__checkpoint;
      await this.prisma.companyMission.update({
        where: { id: missionId },
        data: { result: this.toJson(result) },
      });
    } catch (err: unknown) {
      this.log.warn(
        `clearCheckpoint ${missionId} failed (best-effort): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── 终态：条件写仲裁（MUST；WHERE status running 首写赢）──

  /**
   * 终态条件写仲裁：仅当 mission 仍 running 时写终态，用 updateMany 的 count 判定"是否首写赢"。
   * details 的富产物（report/score 等）并入 result.__terminal（业务富结果仍由
   * CompanyMissionService 主写，本处只兜底落终态细节 + 抢仲裁权）。
   *
   * @returns true = 本次抢到终态写；false = mission 已非 running（被取消/已终态），未覆盖。
   */
  async applyTerminalIfRunning(
    missionId: string,
    outcome: "completed" | "failed" | "cancelled",
    details: MissionTerminalDetails,
  ): Promise<boolean> {
    try {
      const status = OUTCOME_TO_STATUS[outcome];
      // 读现有 result 以并入 __terminal（不覆盖业务键）。
      const row = await this.prisma.companyMission.findUnique({
        where: { id: missionId },
        select: { result: true },
      });
      const result =
        row?.result &&
        typeof row.result === "object" &&
        !Array.isArray(row.result)
          ? { ...(row.result as Record<string, unknown>) }
          : {};
      result.__terminal = {
        outcome,
        ...(details.errorMessage ? { errorMessage: details.errorMessage } : {}),
        ...(details.failureCode ? { failureCode: details.failureCode } : {}),
        ...(typeof details.finalScore === "number"
          ? { finalScore: details.finalScore }
          : {}),
        ...(typeof details.tokensUsed === "number"
          ? { tokensUsed: details.tokensUsed }
          : {}),
        ...(typeof details.costCents === "number"
          ? { costCents: details.costCents }
          : {}),
        ...(typeof details.elapsedWallTimeMs === "number"
          ? { elapsedWallTimeMs: details.elapsedWallTimeMs }
          : {}),
        appliedAt: new Date().toISOString(),
      };

      // 首写赢：updateMany WHERE status ∈ running 集合；count===0 表示已被抢/已终态。
      const res = await this.prisma.companyMission.updateMany({
        where: { id: missionId, status: { in: [...RUNNING_STATUSES] } },
        data: {
          status,
          ...(outcome === "completed" ? { progress: 100 } : {}),
          result: this.toJson(result),
        },
      });
      return res.count > 0;
    } catch (err: unknown) {
      this.log.warn(
        `applyTerminalIfRunning ${missionId} (${outcome}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  // ── 可选：trajectory（company fire-and-forget 不强求逐维落库，落 __checkpoint 轨迹 best-effort）──

  /** 单维度研究产出轨迹：落 __checkpoint.research[dimension]（展示/重跑复用，能力内核不依赖）。 */
  async saveResearchResult(args: {
    missionId: string;
    dimension: string;
    findings: ReadonlyArray<unknown>;
    summary: string;
    state: "completed" | "failed";
  }): Promise<boolean> {
    await this.patchCheckpoint(args.missionId, {
      [`research:${args.dimension}`]: {
        dimension: args.dimension,
        summary: args.summary,
        state: args.state,
        findingsCount: args.findings.length,
      },
    });
    return true;
  }

  /** 报告版本轨迹：落 __checkpoint.reportVersion（company 不做多版本，返回单调递增序号占位）。 */
  async saveReportVersion(args: {
    missionId: string;
    triggerType: "initial" | "rerun-fresh";
    reportFull?: unknown;
    reportTitle?: string;
    reportSummary?: string;
    finalScore?: number;
    leaderSigned?: boolean;
  }): Promise<number> {
    await this.patchCheckpoint(args.missionId, {
      reportVersion: {
        triggerType: args.triggerType,
        ...(args.reportTitle ? { reportTitle: args.reportTitle } : {}),
        ...(args.reportSummary ? { reportSummary: args.reportSummary } : {}),
        ...(typeof args.finalScore === "number"
          ? { finalScore: args.finalScore }
          : {}),
        ...(typeof args.leaderSigned === "boolean"
          ? { leaderSigned: args.leaderSigned }
          : {}),
      },
    });
    return 1;
  }

  // ── 内部 ──

  private isRunning(status: string): boolean {
    return (RUNNING_STATUSES as readonly string[]).includes(status);
  }
}
