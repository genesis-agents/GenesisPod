/**
 * ResearchHITLService — Human-In-The-Loop primitives for paused agent tasks
 *
 * 归属：L3 ai-app/topic-insights/agent/hitl/
 *
 * 职责：
 *   - resumeTask：task 从 AWAITING_HUMAN → QUEUED，orchestrator 下一轮会 pick up
 *   - injectObservation：写 HUMAN_INPUT step，作为 ReAct loop 下一次 observe 的数据
 *   - listPausedTasks：枚举 mission 内所有 AWAITING_HUMAN 任务（UI 用）
 *
 * Phase 6 起所有 HITL 路径走这个 service。UI 先只暴露 resume/inject，
 * 批注（edit task）在 Phase 7 补充。
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AgentStepType } from "@prisma/client";
import { ResearchTaskStore } from "../adapters/research-task-store";
import { ResearchTaskQueue } from "../adapters/research-task-queue";

export interface PausedTaskSummary {
  readonly taskId: string;
  readonly title: string;
  readonly type: string;
  readonly dimensionName?: string;
  readonly pausedAt?: Date | null;
  readonly resultSummary?: string | null;
}

@Injectable()
export class ResearchHITLService {
  private readonly logger = new Logger(ResearchHITLService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskStore: ResearchTaskStore,
    private readonly taskQueue: ResearchTaskQueue,
  ) {}

  async listPausedTasks(missionId: string): Promise<PausedTaskSummary[]> {
    const rows = await this.prisma.researchTask.findMany({
      where: { missionId, status: "AWAITING_HUMAN" },
      orderBy: [{ pausedAt: "desc" }],
      select: {
        id: true,
        title: true,
        taskType: true,
        dimensionName: true,
        pausedAt: true,
        resultSummary: true,
      },
    });
    return rows.map((r) => ({
      taskId: r.id,
      title: r.title,
      type: r.taskType,
      dimensionName: r.dimensionName ?? undefined,
      pausedAt: r.pausedAt,
      resultSummary: r.resultSummary,
    }));
  }

  /**
   * 继续一个 AWAITING_HUMAN 任务。
   *   - 如给了 humanInput，先写一条 HUMAN_INPUT step 供下一次 observe 读
   *   - 把 task status → QUEUED，orchestrator 下次 dequeueNext 会 pick up
   */
  async resumeTask(
    taskId: string,
    options: { humanInput?: string; resumedBy?: string } = {},
  ): Promise<void> {
    const task = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        missionId: true,
        currentIteration: true,
        mission: { select: { topicId: true } },
      },
    });
    if (!task) throw new NotFoundException(`task=${taskId} not found`);
    if (task.status !== "AWAITING_HUMAN" && task.status !== "PAUSED") {
      throw new Error(
        `task=${taskId} not paused (status=${task.status}), cannot resume`,
      );
    }

    if (options.humanInput && options.humanInput.trim().length > 0) {
      await this.injectObservation(taskId, options.humanInput.trim());
    }

    await this.taskStore.updateStatus(taskId, "QUEUED", {
      resumedAt: new Date(),
    });
    // Put back to front of queue so orchestrator picks it up next
    await this.taskQueue.enqueue(taskId, { priority: 100 });

    this.logger.log(
      `[resume] task=${taskId} by=${options.resumedBy ?? "system"} hasInput=${!!options.humanInput}`,
    );
  }

  /**
   * 注入一条 HUMAN_INPUT step 到 agent_steps；下一次 observe 会把它作为最新 observation。
   */
  async injectObservation(taskId: string, content: string): Promise<void> {
    const task = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
      select: {
        missionId: true,
        currentIteration: true,
        mission: { select: { topicId: true } },
      },
    });
    if (!task) throw new NotFoundException(`task=${taskId} not found`);

    const nextStep = await this.prisma.agentStep.aggregate({
      where: { taskId, iteration: task.currentIteration },
      _max: { stepIndex: true },
    });

    await this.prisma.agentStep.create({
      data: {
        taskId,
        missionId: task.missionId,
        topicId: task.mission.topicId,
        iteration: task.currentIteration,
        stepIndex: (nextStep._max.stepIndex ?? -1) + 1,
        stepType: AgentStepType.HUMAN_INPUT,
        content: content.slice(0, 8000),
      },
    });

    this.logger.log(
      `[inject] task=${taskId} wrote HUMAN_INPUT step (${content.length} chars)`,
    );
  }
}
