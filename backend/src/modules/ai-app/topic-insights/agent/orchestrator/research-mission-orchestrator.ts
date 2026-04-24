/**
 * ResearchMissionOrchestrator — topic-insights mission 级编排（L3 业务层）
 *
 * 归属：L3 ai-app/topic-insights/agent/orchestrator/
 *
 * 职责：
 *   - 把 missionId 映射到 L2 MissionOrchestrator 所需 scope + scopeMetadata + stores
 *   - 初始化 ProtocolRegistry / ConsensusResolver / LLMCaller / 业务 stores 注入
 *   - 在每个 task 完成后，构造 ReplanObservations（查 Prisma）并触发 ResearchDynamicReplanner
 *   - onFinalize：更新 ResearchMission.status + emit mission-completed 事件
 *
 * Phase 5 第一版：不处理动态 replan 执行（spawn_subtask 等需 TaskStore 扩展），
 * 仅 log 决策；Phase 6 起真正执行 ops。
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ResearchMissionStatus } from "@prisma/client";
import {
  MissionOrchestrator,
  createConsensusResolver,
  type AgentTask,
  type QueueStats,
  type ReplanObservations,
  type ReplanDecision,
  type ReplanOperation,
} from "@/modules/ai-engine/harness/runtime";
import { PrismaStepStore } from "../adapters/prisma-step-store";
import { PrismaCheckpointStore } from "../adapters/prisma-checkpoint-store";
import { PrismaVerificationStore } from "../adapters/prisma-verification-store";
import { ResearchTaskStore } from "../adapters/research-task-store";
import { ResearchTaskQueue } from "../adapters/research-task-queue";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";
import { ProtocolRegistry } from "../protocols/protocol-registry";
import { ChatFacadeLLMCaller } from "./chat-facade-llm-caller";
import { ResearchDynamicReplanner } from "./research-dynamic-replanner";

export interface RunMissionOptions {
  readonly missionId: string;
  readonly topicId: string;
  readonly initialTaskIds: readonly string[];
  readonly maxIterations?: number;
}

@Injectable()
export class ResearchMissionOrchestrator {
  private readonly logger = new Logger(ResearchMissionOrchestrator.name);

  private readonly consensus = createConsensusResolver({
    passThreshold: 70,
    agreementStddevMax: 10,
    escalateStddevMax: 25,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: MissionOrchestrator,
    private readonly llm: ChatFacadeLLMCaller,
    private readonly protocols: ProtocolRegistry,
    private readonly replanner: ResearchDynamicReplanner,
    private readonly stepStore: PrismaStepStore,
    private readonly checkpointStore: PrismaCheckpointStore,
    private readonly verificationStore: PrismaVerificationStore,
    private readonly taskStore: ResearchTaskStore,
    private readonly taskQueue: ResearchTaskQueue,
  ) {}

  async run(options: RunMissionOptions): Promise<QueueStats> {
    const scopeMetadata: ResearchTaskMetadata = {
      missionId: options.missionId,
      topicId: options.topicId,
    };

    this.logger.log(
      `[run] mission=${options.missionId} topic=${options.topicId} initialTasks=${options.initialTaskIds.length}`,
    );

    return this.runner.orchestrate<ResearchTaskMetadata>(
      {
        scope: options.missionId,
        scopeMetadata,
        maxIterations: options.maxIterations ?? 500,
        idleWaitMs: 2_000,
        onTaskCompleted: (task, scope) => this.handleTaskCompleted(task, scope),
        onFinalize: (scope, stats) => this.handleFinalize(scope, stats),
      },
      options.initialTaskIds,
      {
        stepStore: this.stepStore,
        checkpointStore: this.checkpointStore,
        verificationStore: this.verificationStore,
        taskStore: this.taskStore,
      },
      this.taskQueue,
      this.protocols,
      this.llm,
      this.consensus,
    );
  }

  private async handleTaskCompleted(
    task: AgentTask<ResearchTaskMetadata>,
    scope: string,
  ): Promise<void> {
    const observations = await this.buildObservations(scope);
    const decision: ReplanDecision<ResearchTaskMetadata> =
      await this.replanner.onTaskCompleted(task, observations);

    if (decision.operations.length === 0) return;

    for (const op of decision.operations) {
      await this.executeReplanOp(op, scope);
    }

    this.logger.log(
      `[replan] mission=${scope} after task=${task.id}: ${decision.rationale}`,
    );
  }

  private async executeReplanOp(
    op: ReplanOperation<ResearchTaskMetadata>,
    scope: string,
  ): Promise<void> {
    switch (op.kind) {
      case "no_op":
        return;
      case "cancel_task":
        await this.taskQueue.cancel(op.taskId, op.reason);
        this.logger.log(`[replan] cancel task=${op.taskId} ${op.reason ?? ""}`);
        return;
      case "extend_budget":
        // Phase 5 scaffolding: budget extension would mutate ResearchTask.budgetCap.
        // Real impl requires task-store.extendBudget(); log for now.
        this.logger.log(
          `[replan] extend_budget task=${op.taskId} +${op.extraTokens} (not yet applied)`,
        );
        return;
      case "add_judge":
        this.logger.log(
          `[replan] add_judge task=${op.taskId} judge=${op.judgeId} (not yet applied)`,
        );
        return;
      case "merge_tasks":
      case "spawn_subtask":
        // TODO Phase 6: dynamic subtask creation + merging once leader UI lands.
        this.logger.log(
          `[replan] ${op.kind} in scope=${scope} (Phase 6 - not yet executed)`,
        );
        return;
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
        return;
      }
    }
  }

  private async buildObservations(
    scope: string,
  ): Promise<ReplanObservations<ResearchTaskMetadata>> {
    const rows = await this.prisma.researchTask.findMany({
      where: { missionId: scope },
      include: { mission: { select: { topicId: true } } },
    });

    const completed: AgentTask<ResearchTaskMetadata>[] = [];
    const failed: AgentTask<ResearchTaskMetadata>[] = [];
    const running: AgentTask<ResearchTaskMetadata>[] = [];

    for (const r of rows) {
      const t: AgentTask<ResearchTaskMetadata> = {
        id: r.id,
        type: r.taskType,
        title: r.title,
        description: r.description,
        input: {
          skills: r.skills,
          tools: r.tools,
          modelId: r.modelId,
        },
        currentIteration: r.currentIteration,
        maxIterations: r.maxIterations,
        retryCount: r.retryCount,
        maxRetries: r.maxRetries,
        metadata: {
          missionId: r.missionId,
          topicId: r.mission.topicId,
          dimensionId: r.dimensionId ?? undefined,
          dimensionName: r.dimensionName ?? undefined,
          parentTaskId: r.parentTaskId ?? undefined,
          assignedAgent: r.assignedAgent,
          assignedAgentType: r.assignedAgentType ?? undefined,
          modelId: r.modelId ?? undefined,
          skills: r.skills,
          tools: r.tools,
          priority: r.priority,
          dependencies: r.dependencies,
        },
      };
      if (r.status === "COMPLETED") completed.push(t);
      else if (r.status === "FAILED") failed.push(t);
      else if (
        r.status === "RUNNING" ||
        r.status === "EXECUTING" ||
        r.status === "VERIFYING" ||
        r.status === "SCHEDULED" ||
        r.status === "QUEUED"
      )
        running.push(t);
    }

    return {
      completedTasks: completed,
      failedTasks: failed,
      runningTasks: running,
      missionContext: {},
    };
  }

  private async handleFinalize(
    scope: string,
    stats: QueueStats,
  ): Promise<void> {
    const newStatus: ResearchMissionStatus =
      stats.failed === stats.total && stats.total > 0
        ? "FAILED"
        : stats.awaitingHuman > 0
          ? "REVIEWING"
          : "COMPLETED";

    const progressPercent =
      stats.total > 0
        ? Math.min(100, Math.round((stats.completed / stats.total) * 100))
        : 0;

    await this.prisma.researchMission.update({
      where: { id: scope },
      data: {
        status: newStatus,
        completedAt: new Date(),
        completedTasks: stats.completed,
        totalTasks: stats.total,
        progressPercent,
      },
    });

    this.logger.log(
      `[finalize] mission=${scope} status=${newStatus} completed=${stats.completed}/${stats.total} failed=${stats.failed}`,
    );
  }
}
