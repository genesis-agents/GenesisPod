/**
 * AI Coding 任务编排服务
 *
 * 负责：
 * 1. 创建和管理 Mission（任务单元）
 * 2. 任务分解和依赖管理
 * 3. 任务状态追踪
 * 4. 任务执行调度
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  CodingMission,
  CodingMissionStatus,
  CodingAgentTask,
  CodingTaskStatus,
  CodingTaskType,
  CodingAgentRole,
  Prisma,
} from "@prisma/client";
import { TASK_PROMPTS, TASK_BREAKDOWN_PROMPT } from "../constants/task-prompts";

/**
 * 任务分解结果
 */
export interface TaskBreakdownResult {
  understanding: string;
  tasks: Array<{
    title: string;
    description: string;
    taskType: CodingTaskType;
    assigneeRole: CodingAgentRole;
    priority: number;
    dependsOn: string[];
  }>;
  executionPlan: string;
  risks: string[];
}

/**
 * 创建 Mission 参数
 */
export interface CreateMissionParams {
  projectId: string;
  leaderId: string;
  title: string;
  description: string;
  requirement?: string;
}

/**
 * 创建任务参数
 */
export interface CreateTaskParams {
  missionId: string;
  title: string;
  description: string;
  taskType: CodingTaskType;
  assignedToId?: string; // 可选：分配给的成员ID（稍后可通过assignTask分配）
  assigneeRole?: CodingAgentRole; // 可选：分配者角色
  priority?: number;
  dependsOn?: string[];
  input?: Record<string, unknown>;
}

@Injectable()
export class CodingMissionService {
  private readonly logger = new Logger(CodingMissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新的 Mission
   */
  async createMission(params: CreateMissionParams): Promise<CodingMission> {
    const mission = await this.prisma.codingMission.create({
      data: {
        projectId: params.projectId,
        leaderId: params.leaderId,
        title: params.title,
        description: params.description,
        requirement: params.requirement,
        status: CodingMissionStatus.PENDING,
      },
    });

    this.logger.log(`[${params.projectId}] Created mission: ${mission.id}`);

    // 记录日志
    await this.logMissionEvent(mission.id, "MISSION_CREATED", {
      title: params.title,
    });

    return mission;
  }

  /**
   * 获取 Mission 详情
   */
  async getMission(missionId: string): Promise<CodingMission | null> {
    return this.prisma.codingMission.findUnique({
      where: { id: missionId },
      include: {
        tasks: {
          orderBy: { priority: "desc" },
        },
      },
    });
  }

  /**
   * 获取项目的所有 Mission
   */
  async getProjectMissions(projectId: string): Promise<CodingMission[]> {
    return this.prisma.codingMission.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        tasks: true,
      },
    });
  }

  /**
   * 更新 Mission 状态
   */
  async updateMissionStatus(
    missionId: string,
    status: CodingMissionStatus,
  ): Promise<CodingMission> {
    const updateData: Prisma.CodingMissionUpdateInput = { status };

    if (status === CodingMissionStatus.IN_PROGRESS) {
      updateData.startedAt = new Date();
    } else if (
      status === CodingMissionStatus.COMPLETED ||
      status === CodingMissionStatus.FAILED
    ) {
      updateData.completedAt = new Date();
    }

    const mission = await this.prisma.codingMission.update({
      where: { id: missionId },
      data: updateData,
    });

    await this.logMissionEvent(missionId, "STATUS_CHANGED", {
      newStatus: status,
    });

    return mission;
  }

  /**
   * 创建任务
   */
  async createTask(params: CreateTaskParams): Promise<CodingAgentTask> {
    const mission = await this.prisma.codingMission.findUnique({
      where: { id: params.missionId },
    });

    if (!mission) {
      throw new Error(`Mission ${params.missionId} not found`);
    }

    // 如果没有提供 assignedToId，根据 assigneeRole 查找团队成员
    let assignedToId = params.assignedToId;
    if (!assignedToId && params.assigneeRole) {
      const member = await this.prisma.codingTeamMember.findFirst({
        where: {
          projectId: mission.projectId,
          agentRole: params.assigneeRole,
        },
      });
      if (member) {
        assignedToId = member.id;
      }
    }

    // 如果仍然没有 assignedToId，使用 mission 的 leader
    if (!assignedToId) {
      assignedToId = mission.leaderId;
    }

    const task = await this.prisma.codingAgentTask.create({
      data: {
        missionId: params.missionId,
        projectId: mission.projectId,
        title: params.title,
        description: params.description,
        taskType: params.taskType,
        assignedToId,
        assigneeRole: params.assigneeRole,
        priority: params.priority ?? 1,
        dependsOn: params.dependsOn ?? [],
        input: (params.input ?? {}) as Prisma.InputJsonValue,
        status: CodingTaskStatus.PENDING,
      },
    });

    this.logger.debug(
      `[${mission.projectId}] Created task: ${task.id} - ${params.title}`,
    );

    return task;
  }

  /**
   * 批量创建任务
   */
  async createTasks(
    missionId: string,
    tasks: Omit<CreateTaskParams, "missionId">[],
  ): Promise<CodingAgentTask[]> {
    const createdTasks: CodingAgentTask[] = [];

    for (const taskParams of tasks) {
      const task = await this.createTask({
        missionId,
        ...taskParams,
      });
      createdTasks.push(task);
    }

    this.logger.log(
      `[${missionId}] Created ${createdTasks.length} tasks in batch`,
    );

    return createdTasks;
  }

  /**
   * 获取 Mission 的所有任务
   */
  async getMissionTasks(missionId: string): Promise<CodingAgentTask[]> {
    return this.prisma.codingAgentTask.findMany({
      where: { missionId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  /**
   * 获取下一个可执行的任务
   * 考虑依赖关系和优先级
   */
  async getNextExecutableTask(
    missionId: string,
  ): Promise<CodingAgentTask | null> {
    const allTasks = await this.getMissionTasks(missionId);

    // 获取所有已完成的任务ID
    const completedTaskIds = new Set(
      allTasks
        .filter((t) => t.status === CodingTaskStatus.COMPLETED)
        .map((t) => t.id),
    );

    // 找到所有待执行且依赖已满足的任务
    const executableTasks = allTasks.filter((task) => {
      if (task.status !== CodingTaskStatus.PENDING) {
        return false;
      }

      const dependencies = task.dependsOn as string[];
      return dependencies.every((depId) => completedTaskIds.has(depId));
    });

    if (executableTasks.length === 0) {
      return null;
    }

    // 按优先级排序，返回最高优先级的任务
    executableTasks.sort((a, b) => b.priority - a.priority);
    return executableTasks[0];
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: CodingTaskStatus,
    metadata?: {
      output?: Record<string, unknown>;
      errorMessage?: string;
      assignedToId?: string;
    },
  ): Promise<CodingAgentTask> {
    const updateData: Prisma.CodingAgentTaskUpdateInput = { status };

    if (status === CodingTaskStatus.IN_PROGRESS) {
      updateData.startedAt = new Date();
    } else if (
      status === CodingTaskStatus.COMPLETED ||
      status === CodingTaskStatus.FAILED
    ) {
      updateData.completedAt = new Date();
    }

    if (metadata?.output) {
      updateData.output = metadata.output as Prisma.InputJsonValue;
    }

    if (metadata?.errorMessage) {
      updateData.errorMessage = metadata.errorMessage;
    }

    if (metadata?.assignedToId) {
      updateData.assignedTo = { connect: { id: metadata.assignedToId } };
    }

    const task = await this.prisma.codingAgentTask.update({
      where: { id: taskId },
      data: updateData,
    });

    this.logger.log(`[${task.missionId}] Task ${taskId} status: ${status}`);

    return task;
  }

  /**
   * 分配任务给 Agent
   */
  async assignTask(
    taskId: string,
    assignedToId: string,
  ): Promise<CodingAgentTask> {
    return this.updateTaskStatus(taskId, CodingTaskStatus.ASSIGNED, {
      assignedToId,
    });
  }

  /**
   * 开始执行任务
   */
  async startTask(taskId: string): Promise<CodingAgentTask> {
    return this.updateTaskStatus(taskId, CodingTaskStatus.IN_PROGRESS);
  }

  /**
   * 完成任务
   */
  async completeTask(
    taskId: string,
    output: Record<string, unknown>,
  ): Promise<CodingAgentTask> {
    const task = await this.updateTaskStatus(
      taskId,
      CodingTaskStatus.COMPLETED,
      {
        output,
      },
    );

    // 检查 Mission 是否全部完成
    await this.checkMissionCompletion(task.missionId);

    return task;
  }

  /**
   * 任务失败
   */
  async failTask(
    taskId: string,
    errorMessage: string,
  ): Promise<CodingAgentTask> {
    return this.updateTaskStatus(taskId, CodingTaskStatus.FAILED, {
      errorMessage,
    });
  }

  /**
   * 提交任务进行 Review
   */
  async submitTaskForReview(
    taskId: string,
    output: Record<string, unknown>,
  ): Promise<CodingAgentTask> {
    return this.prisma.codingAgentTask.update({
      where: { id: taskId },
      data: {
        status: CodingTaskStatus.REVIEW,
        output: output as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 检查 Mission 是否全部完成
   */
  private async checkMissionCompletion(missionId: string): Promise<void> {
    const tasks = await this.getMissionTasks(missionId);

    const allCompleted = tasks.every(
      (t) => t.status === CodingTaskStatus.COMPLETED,
    );

    const anyFailed = tasks.some((t) => t.status === CodingTaskStatus.FAILED);

    if (anyFailed) {
      await this.updateMissionStatus(missionId, CodingMissionStatus.FAILED);
    } else if (allCompleted) {
      await this.updateMissionStatus(missionId, CodingMissionStatus.COMPLETED);
    }
  }

  /**
   * 获取任务提示词配置
   */
  getTaskPromptConfig(taskType: CodingTaskType) {
    return TASK_PROMPTS[taskType];
  }

  /**
   * 获取任务分解提示词
   */
  getTaskBreakdownPrompt(): string {
    return TASK_BREAKDOWN_PROMPT;
  }

  /**
   * 根据任务分解结果创建任务
   */
  async createTasksFromBreakdown(
    missionId: string,
    breakdown: TaskBreakdownResult,
  ): Promise<CodingAgentTask[]> {
    // 创建临时ID到实际ID的映射
    const tempIdToRealId = new Map<string, string>();

    const createdTasks: CodingAgentTask[] = [];

    for (let i = 0; i < breakdown.tasks.length; i++) {
      const taskDef = breakdown.tasks[i];
      const tempId = `task_${i}`;

      // 解析依赖，将临时ID转换为实际ID
      const resolvedDependsOn = taskDef.dependsOn
        .map((depTempId) => tempIdToRealId.get(depTempId))
        .filter((id): id is string => id !== undefined);

      const task = await this.createTask({
        missionId,
        title: taskDef.title,
        description: taskDef.description,
        taskType: taskDef.taskType,
        assigneeRole: taskDef.assigneeRole,
        priority: taskDef.priority,
        dependsOn: resolvedDependsOn,
      });

      tempIdToRealId.set(tempId, task.id);
      createdTasks.push(task);
    }

    // 记录任务分解结果
    await this.logMissionEvent(missionId, "TASKS_CREATED", {
      taskCount: createdTasks.length,
      understanding: breakdown.understanding,
      executionPlan: breakdown.executionPlan,
      risks: breakdown.risks,
    });

    return createdTasks;
  }

  /**
   * 获取 Mission 进度
   */
  async getMissionProgress(missionId: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    progress: number;
  }> {
    const tasks = await this.getMissionTasks(missionId);

    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status === CodingTaskStatus.COMPLETED,
    ).length;
    const inProgress = tasks.filter(
      (t) =>
        t.status === CodingTaskStatus.IN_PROGRESS ||
        t.status === CodingTaskStatus.ASSIGNED,
    ).length;
    const pending = tasks.filter(
      (t) => t.status === CodingTaskStatus.PENDING,
    ).length;
    const failed = tasks.filter(
      (t) => t.status === CodingTaskStatus.FAILED,
    ).length;

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, pending, failed, progress };
  }

  /**
   * 记录 Mission 事件日志
   */
  private async logMissionEvent(
    missionId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const mission = await this.prisma.codingMission.findUnique({
      where: { id: missionId },
    });

    if (!mission) return;

    await this.prisma.codingMissionLog.create({
      data: {
        missionId,
        phase: eventType, // Use phase as the main identifier
        eventType,
        action: eventType, // action is required
        data: data as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 获取 Mission 日志
   */
  async getMissionLogs(
    missionId: string,
    limit = 50,
  ): Promise<
    Array<{ eventType: string | null; data: unknown; createdAt: Date }>
  > {
    const logs = await this.prisma.codingMissionLog.findMany({
      where: { missionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return logs.map((log) => ({
      eventType: log.eventType,
      data: log.data,
      createdAt: log.createdAt,
    }));
  }

  /**
   * 重试失败的任务
   */
  async retryTask(taskId: string): Promise<CodingAgentTask> {
    const task = await this.prisma.codingAgentTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== CodingTaskStatus.FAILED) {
      throw new Error(`Task ${taskId} is not in FAILED status`);
    }

    // 增加重试次数
    const retryCount = task.retryCount + 1;

    return this.prisma.codingAgentTask.update({
      where: { id: taskId },
      data: {
        status: CodingTaskStatus.PENDING,
        retryCount,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    });
  }

  /**
   * 取消 Mission
   */
  async cancelMission(missionId: string): Promise<CodingMission> {
    // 取消所有未完成的任务
    await this.prisma.codingAgentTask.updateMany({
      where: {
        missionId,
        status: {
          in: [
            CodingTaskStatus.PENDING,
            CodingTaskStatus.ASSIGNED,
            CodingTaskStatus.IN_PROGRESS,
          ],
        },
      },
      data: {
        status: CodingTaskStatus.FAILED,
        errorMessage: "Mission cancelled",
      },
    });

    return this.updateMissionStatus(missionId, CodingMissionStatus.CANCELLED);
  }
}
