/**
 * Mission Execution Service
 *
 * 负责 Mission 的任务执行和调度
 */

import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchMissionStatus } from "@prisma/client";
import {
  ResearchEventEmitterService,
  RESEARCH_INTERNAL_EVENTS,
} from "@/modules/ai-app/topic-insights/memory/events/event-emitter.service";
import { ReportSynthesisService } from "@/modules/ai-app/topic-insights/artifacts/report/core/synthesis.service";
import { MissionMetricsService } from "@/modules/ai-app/topic-insights/shared/telemetry";
import {
  PipelineOrchestratorService,
  buildIdentityContext,
  type ResearchDepth as HarnessResearchDepth,
} from "@/modules/ai-app/topic-insights/mission/pipeline";
import { TopicInsightsCapabilityReconciler } from "@/modules/ai-app/topic-insights/agents/capability";
import type { LeaderPlan } from "@/modules/ai-app/topic-insights/shared/types/leader.types";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { MissionCancellationService } from "./cancellation.service";
import { PipelineCheckpointService } from "../pipeline/pipeline-checkpoint.service";
import { BillingContext } from "@/modules/ai-infra/facade";

@Injectable()
export class MissionExecutionService {
  private readonly logger = new Logger(MissionExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly researchEventEmitter: ResearchEventEmitterService,
    private readonly reportSynthesisService: ReportSynthesisService,
    @Optional()
    private readonly harnessOrchestrator?: PipelineOrchestratorService,
    @Optional()
    private readonly harnessRollout?: MissionMetricsService,
    @Optional()
    private readonly capabilityReconciler?: TopicInsightsCapabilityReconciler,
    @Optional()
    private readonly cancellation?: MissionCancellationService,
    @Optional()
    private readonly checkpoint?: PipelineCheckpointService,
  ) {}

  /**
   * 启动任务执行循环 — harness pipeline is the single path.
   * H6: legacy scheduler fallback removed. PipelineModule is mandatory in
   * topic-insights.module, so harnessOrchestrator is always injected.
   */
  async startExecution(
    missionId: string,
    topicId: string,
    options?: { readonly dimensionScope?: readonly string[] },
  ): Promise<void> {
    const scope = options?.dimensionScope;
    const scopeNote =
      scope && scope.length > 0 ? ` scope=[${scope.join(",")}]` : "";
    this.logger.log(
      `[startExecution] Starting execution for mission ${missionId}${scopeNote}`,
    );
    return this.runWithHarness(missionId, topicId, scope);
  }

  /**
   * 事件监听器 - 处理 Mission 恢复执行请求
   * 由 Leader/Todo 通过 ResearchEventEmitterService 发出（避免循环依赖）
   */
  @OnEvent(RESEARCH_INTERNAL_EVENTS.RESUME_MISSION_EXECUTION)
  async handleResumeMissionExecution(payload: {
    missionId: string;
    topicId: string;
  }): Promise<void> {
    // ★ Event handlers have no HTTP context — construct BillingContext from topic owner.
    // H5: route through harness resume. resumeWithHarness loads the last checkpoint
    // (if any) and otherwise starts fresh.
    const startFn = () =>
      this.resumeWithHarness(payload.missionId, payload.topicId);

    const existingCtx = BillingContext.get();
    if (existingCtx) {
      void BillingContext.run(existingCtx, startFn).catch((err) => {
        this.logger.error(
          `[handleResumeMissionExecution] Failed to resume mission: ${err}`,
        );
      });
      return;
    }

    // No context — look up userId from topic
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: payload.topicId },
      select: { userId: true },
    });
    if (topic?.userId) {
      const billingCtx = {
        userId: topic.userId,
        moduleType: "topic-insights" as const,
        operationType: "research" as const,
        referenceId: payload.missionId,
      };
      void BillingContext.run(billingCtx, startFn).catch((err) => {
        this.logger.error(
          `[handleResumeMissionExecution] Failed to resume mission: ${err}`,
        );
      });
    } else {
      void startFn().catch((err) => {
        this.logger.error(
          `[handleResumeMissionExecution] Failed to resume mission: ${err}`,
        );
      });
    }
  }

  // ==================== Phase 5: Recovery Methods ====================

  /**
   * H5: RECOVERY_NEEDED handler is now a no-op.
   *
   * In the harness model, a mission either completes atomically or its
   * checkpoint remains for an explicit user-initiated resume. The legacy
   * auto-recovery flow (health service -> continueExecution, now deleted)
   * tried to restart missions behind the user's back, which conflicts with the
   * stage contract and the explicit resumeWithHarness primitive. Keeping the
   * @OnEvent binding so the event doesn't get dropped silently during
   * migration; we log and move on. Health service will be simplified (read-only)
   * as part of the legacy sweep.
   */
  @OnEvent(RESEARCH_INTERNAL_EVENTS.RECOVERY_NEEDED)
  async handleRecoveryNeeded(payload: {
    missionId: string;
    topicId: string;
    resetTaskCount: number;
  }): Promise<void> {
    this.logger.log(
      `[handleRecoveryNeeded] harness mode: auto-recovery disabled for mission=${payload.missionId} (${payload.resetTaskCount} tasks were reset). User must trigger resume.`,
    );
  }

  /**
   * ★ v8.1: 添加新 Agent 到 leaderPlan.agentAssignments
   *
   * 当通过 Leader 对话创建任务时，需要将新 Agent 的配置
   * （包括 skills、tools、modelId）添加到 leaderPlan 中，
   * 以便前端能够正确显示 Agent 的能力配置。
   *
   * @param missionId Mission ID
   * @param agentAssignment 新的 Agent 分配信息
   */
  async addAgentToLeaderPlan(
    missionId: string,
    agentAssignment: {
      agentId: string;
      agentName?: string;
      agentType: string;
      role?: string;
      modelId?: string;
      skills?: string[];
      tools?: string[];
    },
  ): Promise<void> {
    try {
      // 1. 获取当前 Mission 的 leaderPlan
      const mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { leaderPlan: true },
      });

      if (!mission) {
        this.logger.warn(
          `[addAgentToLeaderPlan] Mission ${missionId} not found`,
        );
        return;
      }

      // 2. 解析现有的 leaderPlan
      const leaderPlan = (mission.leaderPlan as unknown as LeaderPlan) || {
        taskUnderstanding: { topic: "", scope: "", objectives: [] },
        dimensions: [],
        executionStrategy: { parallelism: 5, priorityOrder: [] },
        agentAssignments: [],
      };

      // 3. 检查是否已存在该 Agent
      const existingIndex = leaderPlan.agentAssignments?.findIndex(
        (a) => a.agentId === agentAssignment.agentId,
      );

      if (existingIndex !== undefined && existingIndex >= 0) {
        // 更新现有 Agent 的配置（保留原有的 agentType）
        const existingAgent = leaderPlan.agentAssignments[existingIndex];
        leaderPlan.agentAssignments[existingIndex] = {
          ...existingAgent,
          agentName: agentAssignment.agentName ?? existingAgent.agentName,
          role: agentAssignment.role ?? existingAgent.role,
          modelId: agentAssignment.modelId ?? existingAgent.modelId,
          skills: agentAssignment.skills ?? existingAgent.skills,
          tools: agentAssignment.tools ?? existingAgent.tools,
        };
        this.logger.log(
          `[addAgentToLeaderPlan] Updated existing agent ${agentAssignment.agentId} in leaderPlan`,
        );
      } else {
        // 添加新 Agent
        if (!leaderPlan.agentAssignments) {
          leaderPlan.agentAssignments = [];
        }
        leaderPlan.agentAssignments.push({
          agentId: agentAssignment.agentId,
          agentName: agentAssignment.agentName,
          agentType: agentAssignment.agentType as
            | "dimension_researcher"
            | "quality_reviewer"
            | "report_writer",
          role: agentAssignment.role || "用户请求研究员",
          modelId: agentAssignment.modelId,
          skills: agentAssignment.skills,
          tools: agentAssignment.tools,
        });
        this.logger.log(
          `[addAgentToLeaderPlan] Added new agent ${agentAssignment.agentId} to leaderPlan with skills: [${agentAssignment.skills?.join(", ")}], tools: [${agentAssignment.tools?.join(", ")}]`,
        );
      }

      // 4. 更新数据库
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          leaderPlan: toPrismaJson(leaderPlan),
        },
      });
    } catch (error) {
      this.logger.error(
        `[addAgentToLeaderPlan] Failed to update leaderPlan: ${error}`,
      );
      // 不抛出异常，避免影响主流程
    }
  }

  // ========================================================================
  // ★ Enhancement Tier Group F-1 · Harness dispatch
  // ========================================================================

  /**
   * 通过 harness pipeline 执行 mission（flag=1 路径）。
   * 与 legacy 路径互斥：此函数内部不调用任何 legacy research service，
   * 整个 mission 由 PipelineOrchestratorService 管理。
   */
  private async runWithHarness(
    missionId: string,
    topicId: string,
    dimensionScope?: readonly string[],
  ): Promise<void> {
    if (!this.harnessOrchestrator) {
      throw new Error(
        "[runWithHarness] PipelineOrchestratorService not available; " +
          "check HarnessModule is imported",
      );
    }

    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    const missionRow = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { researchDepth: true },
    });
    const requestedDepth = (missionRow?.researchDepth ??
      "standard") as HarnessResearchDepth;

    // ★ 目标架构 v2：调 reconciler 产出能力快照，致命 degradation 直接 fail mission
    const capabilities = this.capabilityReconciler
      ? await this.capabilityReconciler.reconcile({
          userId: topic.userId,
          requestedDepth,
        })
      : undefined;

    const fatalDegrade = capabilities?.degradations.find(
      (d) => d.severity === "error",
    );
    if (fatalDegrade) {
      const msg = `Capability check failed: ${capabilities!.degradations
        .filter((d) => d.severity === "error")
        .map((d) => d.detail)
        .join("; ")}`;
      this.logger.error(`[runWithHarness] ${msg}`);
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          status: ResearchMissionStatus.FAILED,
          completedAt: new Date(),
        },
      });
      await this.researchEventEmitter.emitMissionFailed(
        topicId,
        missionId,
        msg,
      );
      this.harnessRollout?.recordRun({
        missionId,
        userId: topic.userId,
        success: false,
        durationMs: 0,
        tokensUsed: 0,
        costUsd: 0,
        errorMessage: msg,
        recordedAt: new Date(),
      });
      return;
    }

    // 实际执行 depth = 能力推荐的（可能 < 用户 requested）
    const depth = capabilities?.recommendedDepth ?? requestedDepth;

    // 创建 draft report（harness 的 ST-XX 会向它关联 evidence / 写入 content）
    const draftReport =
      await this.reportSynthesisService.createDraftReport(topicId);

    // 标记 mission 为 EXECUTING
    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: { status: ResearchMissionStatus.EXECUTING, startedAt: new Date() },
    });

    // 启动 mission:started 事件（保持与 legacy 相同的 UI 入口）
    await this.researchEventEmitter.emitMissionStarted(
      topicId,
      missionId,
      undefined,
      depth === "quick",
    );

    const identity = buildIdentityContext({
      missionId,
      topicId,
      reportId: draftReport.id,
      userId: topic.userId,
      depth,
      mode:
        dimensionScope && dimensionScope.length > 0 ? "incremental" : "fresh",
      capabilities,
      dimensionScope,
    });

    this.cancellation?.register(missionId, identity.abortController);

    try {
      let qualityScore: number | undefined;
      const result = await this.harnessOrchestrator.run(identity, {
        onStageComplete: (stageId, output) => {
          if (stageId === "ST-08-QGATE") {
            const qg = output as { score?: number };
            if (typeof qg.score === "number") qualityScore = qg.score;
          }
        },
      });
      this.logger.log(
        `[runWithHarness] mission=${missionId} completed stages=${result.completedStages.length} ` +
          `tokens=${result.budgetSnapshot.tokensUsed} cost=$${result.budgetSnapshot.costUsd.toFixed(4)} ` +
          `duration=${result.durationMs}ms`,
      );

      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          status: ResearchMissionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      await this.researchEventEmitter.emitMissionCompleted(
        topicId,
        missionId,
        result.completedStages.length,
        result.completedStages.length,
      );

      // ★ Group M-2: 记录 harness run 指标（auto-rollback 输入）
      this.harnessRollout?.recordRun({
        missionId,
        userId: topic.userId,
        success: true,
        durationMs: result.durationMs,
        qualityScore,
        tokensUsed: result.budgetSnapshot.tokensUsed,
        costUsd: result.budgetSnapshot.costUsd,
        recordedAt: new Date(),
      });

      // H2: mission completed — drop the checkpoint.
      await this.checkpoint?.clear(missionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const wasCancelled = identity.abortController.signal.aborted;
      const terminalStatus = wasCancelled
        ? ResearchMissionStatus.CANCELLED
        : ResearchMissionStatus.FAILED;
      this.logger.error(
        `[runWithHarness] mission=${missionId} ${wasCancelled ? "cancelled" : "failed"}: ${msg}`,
      );
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          status: terminalStatus,
          completedAt: new Date(),
        },
      });
      if (wasCancelled) {
        await this.researchEventEmitter.emitMissionCancelled(
          topicId,
          missionId,
          msg,
        );
      } else {
        await this.researchEventEmitter.emitMissionFailed(
          topicId,
          missionId,
          msg,
        );
      }
      this.harnessRollout?.recordRun({
        missionId,
        userId: topic.userId,
        success: false,
        durationMs: 0,
        tokensUsed: 0,
        costUsd: 0,
        errorMessage: msg,
        recordedAt: new Date(),
      });
      // H2: keep checkpoint on cancel (so resume works); drop it on hard fail
      // so a later retry starts clean.
      if (!wasCancelled) await this.checkpoint?.clear(missionId);
      if (!wasCancelled) throw err;
    } finally {
      this.cancellation?.unregister(missionId);
    }
  }

  /**
   * H2 Resume primitive — re-enter a paused/cancelled mission from its last
   * completed stage. Called by the /missions/:missionId/resume endpoint and by
   * `RESUME_MISSION_EXECUTION` event handlers (leader chat, todo resume, etc).
   *
   * Safe to call when no checkpoint exists: falls back to a fresh run.
   */
  async resumeWithHarness(missionId: string, topicId: string): Promise<void> {
    if (!this.harnessOrchestrator) {
      throw new Error(
        "[resumeWithHarness] PipelineOrchestratorService not available",
      );
    }

    const cp = await this.checkpoint?.load(missionId);
    if (!cp) {
      this.logger.warn(
        `[resumeWithHarness] no checkpoint for mission=${missionId} — falling back to fresh start`,
      );
      await this.runWithHarness(missionId, topicId);
      return;
    }

    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException(`Topic ${topicId} not found`);

    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: { status: ResearchMissionStatus.EXECUTING },
    });

    // Rebuild identity from the persisted snapshot. AbortController + Budget
    // are fresh runtime objects (budget snapshot is re-seeded so usage counters
    // don't reset below the water line).
    const identity = buildIdentityContext({
      missionId,
      topicId,
      reportId: cp.identitySnapshot.reportId,
      userId: cp.identitySnapshot.userId,
      depth: cp.identitySnapshot.depth,
      mode: cp.identitySnapshot.mode,
      capabilities: cp.identitySnapshot.capabilities,
    });
    identity.degradationMode = cp.identitySnapshot.degradationMode;

    this.cancellation?.register(missionId, identity.abortController);

    try {
      const result = await this.harnessOrchestrator.run(identity, {
        resumeFromCheckpoint: {
          completedStages: cp.completedStages,
          stageResults: cp.stageResults,
        },
      });
      this.logger.log(
        `[resumeWithHarness] mission=${missionId} completed stages=${result.completedStages.length} duration=${result.durationMs}ms`,
      );
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          status: ResearchMissionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      await this.researchEventEmitter.emitMissionCompleted(
        topicId,
        missionId,
        result.completedStages.length,
        result.completedStages.length,
      );
      await this.checkpoint?.clear(missionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const wasCancelled = identity.abortController.signal.aborted;
      this.logger.error(
        `[resumeWithHarness] mission=${missionId} ${wasCancelled ? "cancelled" : "failed"}: ${msg}`,
      );
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          status: wasCancelled
            ? ResearchMissionStatus.CANCELLED
            : ResearchMissionStatus.FAILED,
          completedAt: new Date(),
        },
      });
      if (wasCancelled) {
        await this.researchEventEmitter.emitMissionCancelled(
          topicId,
          missionId,
          msg,
        );
      } else {
        await this.researchEventEmitter.emitMissionFailed(
          topicId,
          missionId,
          msg,
        );
        await this.checkpoint?.clear(missionId);
      }
      if (!wasCancelled) throw err;
    } finally {
      this.cancellation?.unregister(missionId);
    }
  }
}
