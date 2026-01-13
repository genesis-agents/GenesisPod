/**
 * Research Mission Service
 *
 * 管理研究 Mission 和 Task 的生命周期
 * 复用 AI Teams Mission 框架的核心概念
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  LeaderDecisionType,
  Prisma,
} from "@prisma/client";
import type { ResearchMission, ResearchTask } from "@prisma/client";
import {
  ResearchLeaderService,
  type LeaderPlan,
} from "./research-leader.service";
import { DimensionMissionService } from "./dimension-mission.service";
import { ReportSynthesisService } from "./report-synthesis.service";
import { ResearchEventEmitterService } from "./research-event-emitter.service";

// ==================== Constants ====================

/**
 * 任务优先级常量
 * 数值越小优先级越高（先执行）
 */
export const TASK_PRIORITY = {
  /** 动态添加的维度研究任务 */
  DIMENSION_RESEARCH_DYNAMIC: 50,
  /** 质量审核任务 */
  QUALITY_REVIEW: 100,
  /** 报告撰写任务 */
  REPORT_SYNTHESIS: 200,
} as const;

// ==================== Types ====================

export interface CreateMissionInput {
  topicId: string;
  userPrompt?: string;
  userContext?: Record<string, any>;
}

export interface MissionStatus {
  id: string;
  status: ResearchMissionStatus;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  currentPhase: string;
  tasks: TaskStatus[];
  leaderPlan?: LeaderPlan;
}

export interface TaskStatus {
  id: string;
  title: string;
  taskType: string;
  dimensionName?: string;
  assignedAgent: string;
  status: ResearchTaskStatus;
  reviewStatus?: string;
  progress?: number;
}

export interface MissionProgressEvent {
  missionId: string;
  topicId: string;
  status: ResearchMissionStatus;
  progress: number;
  phase: string;
  message: string;
  currentTask?: string;
  completedTasks: number;
  totalTasks: number;
}

export interface TeamInfo {
  leaderId: string;
  leaderModel: string;
  agents: AgentInfo[];
}

export interface AgentInfo {
  id: string;
  type: string;
  role: string;
  status: "idle" | "working" | "completed" | "failed";
  currentTask?: string;
  assignedDimensions?: string[];
}

// ==================== Service ====================

@Injectable()
export class ResearchMissionService {
  private readonly logger = new Logger(ResearchMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly leaderService: ResearchLeaderService,
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly reportSynthesisService: ReportSynthesisService,
    private readonly researchEventEmitter: ResearchEventEmitterService,
  ) {}

  /**
   * 创建新的研究 Mission
   * 调用 Leader 进行规划，创建任务列表
   */
  async createMission(input: CreateMissionInput): Promise<ResearchMission> {
    const { topicId, userPrompt, userContext } = input;
    this.logger.log(`[createMission] Creating mission for topic ${topicId}`);

    // 1. 验证专题存在
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 2. 检查是否有正在进行的 Mission
    const existingMission = await this.prisma.researchMission.findFirst({
      where: {
        topicId,
        status: {
          in: [
            ResearchMissionStatus.PLANNING,
            ResearchMissionStatus.EXECUTING,
            ResearchMissionStatus.REVIEWING,
          ],
        },
      },
    });

    if (existingMission) {
      throw new Error(`A mission is already in progress for topic ${topicId}`);
    }

    // 3. 获取 Leader 模型信息
    const leaderModel = await this.leaderService.getReasoningModel();

    // 4. 创建 Mission 记录（状态为 PLANNING）
    const mission = await this.prisma.researchMission.create({
      data: {
        topicId,
        status: ResearchMissionStatus.PLANNING,
        leaderModelId: leaderModel?.modelId,
        leaderModelName: leaderModel?.modelName,
        userPrompt,
        userContext: userContext ?? undefined,
      },
    });

    // 5. 发送进度事件
    this.emitProgress({
      missionId: mission.id,
      topicId,
      status: ResearchMissionStatus.PLANNING,
      progress: 5,
      phase: "planning",
      message: "Leader 正在规划研究方案...",
      completedTasks: 0,
      totalTasks: 0,
    });

    // ★ 发送 Leader 思考事件：理解任务
    await this.researchEventEmitter.emitLeaderThinking(topicId, {
      missionId: mission.id,
      phase: "understanding",
      content: `正在理解研究主题「${topic.name}」的需求...`,
      progress: 10,
    });

    // 6. 调用 Leader 生成规划
    try {
      // ★ 发送 Leader 思考事件：分析
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId: mission.id,
        phase: "analyzing",
        content: "正在分析研究范围和关键维度...",
        progress: 20,
      });

      // ★ 发送 Leader 规划中事件
      await this.researchEventEmitter.emitLeaderPlanning(
        topicId,
        mission.id,
        "Leader 正在制定研究计划，确定研究维度和任务分配...",
      );

      const leaderPlan = await this.leaderService.planResearch(
        topicId,
        userPrompt,
      );

      // ★ 发送 Leader 思考事件：规划完成
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId: mission.id,
        phase: "planning",
        content: `已规划 ${leaderPlan.dimensions.length} 个研究维度：${leaderPlan.dimensions.map((d) => d.name).join("、")}`,
        progress: 40,
      });

      // 7. 记录 Leader 决策
      await this.prisma.leaderDecision.create({
        data: {
          missionId: mission.id,
          type: LeaderDecisionType.PLAN,
          input: { topicId, userPrompt },
          decision: leaderPlan as unknown as Prisma.InputJsonValue,
          reasoning: `规划了 ${leaderPlan.dimensions.length} 个研究维度，分配了 ${leaderPlan.agentAssignments.length} 个 Agent`,
        },
      });

      // ★ 发送 Leader 思考事件：分配任务
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId: mission.id,
        phase: "assigning",
        content: `正在分配 ${leaderPlan.agentAssignments.length} 个研究员执行任务...`,
        progress: 50,
      });

      // 8. 将 Leader 规划的维度同步到数据库，并创建任务
      const tasks = await this.createTasksFromPlan(
        mission.id,
        topicId,
        leaderPlan,
      );

      // ★ 发送 Leader 规划完成事件
      await this.researchEventEmitter.emitLeaderPlanReady(
        topicId,
        mission.id,
        leaderPlan.dimensions.length,
        leaderPlan.agentAssignments.length,
      );

      // 9. 更新 Mission
      const updatedMission = await this.prisma.researchMission.update({
        where: { id: mission.id },
        data: {
          leaderPlan: leaderPlan as unknown as Prisma.InputJsonValue,
          totalTasks: tasks.length,
          status: ResearchMissionStatus.EXECUTING,
          startedAt: new Date(),
        },
      });

      // 10. 发送进度事件
      this.emitProgress({
        missionId: mission.id,
        topicId,
        status: ResearchMissionStatus.EXECUTING,
        progress: 10,
        phase: "executing",
        message: `规划完成，开始执行 ${tasks.length} 个任务`,
        completedTasks: 0,
        totalTasks: tasks.length,
      });

      this.logger.log(
        `[createMission] Mission ${mission.id} created with ${tasks.length} tasks`,
      );

      // ★ 启动异步任务执行（不阻塞返回）
      this.startExecution(mission.id, topicId).catch((err) => {
        this.logger.error(`[createMission] Execution failed: ${err}`);
      });

      return updatedMission;
    } catch (error) {
      // 规划失败，更新状态
      await this.prisma.researchMission.update({
        where: { id: mission.id },
        data: {
          status: ResearchMissionStatus.FAILED,
        },
      });

      this.logger.error(`[createMission] Planning failed: ${error}`);
      throw error;
    }
  }

  /**
   * 根据 Leader 规划创建任务
   * ★ 重要：会将 Leader 规划的维度同步到 TopicDimension 表
   */
  private async createTasksFromPlan(
    missionId: string,
    topicId: string,
    plan: LeaderPlan,
  ): Promise<ResearchTask[]> {
    const tasks: ResearchTask[] = [];

    // ★ 首先：将 Leader 规划的维度同步到数据库
    // 这确保执行时 topic.dimensions 能正确加载
    this.logger.log(
      `[createTasksFromPlan] Syncing ${plan.dimensions.length} planned dimensions to DB`,
    );

    // 获取当前最大 sortOrder
    const maxDimension = await this.prisma.topicDimension.findFirst({
      where: { topicId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let sortOrder = (maxDimension?.sortOrder || 0) + 1;

    // 创建维度记录并建立映射 (plannedDimensionId -> dbDimensionId)
    const dimensionIdMap = new Map<string, string>();

    for (const plannedDim of plan.dimensions) {
      // 检查是否已存在同名维度
      const existingDim = await this.prisma.topicDimension.findFirst({
        where: { topicId, name: plannedDim.name },
      });

      if (existingDim) {
        dimensionIdMap.set(plannedDim.id, existingDim.id);
        this.logger.log(
          `[createTasksFromPlan] Reusing existing dimension: ${plannedDim.name} (${existingDim.id})`,
        );
      } else {
        const newDim = await this.prisma.topicDimension.create({
          data: {
            topicId,
            name: plannedDim.name,
            description: plannedDim.description,
            sortOrder: sortOrder++,
            status: "PENDING",
            // ★ 保存 Leader 规划的搜索配置
            searchQueries: plannedDim.searchQueries || [],
            searchSources: plannedDim.dataSources || ["web"],
          },
        });
        dimensionIdMap.set(plannedDim.id, newDim.id);
        this.logger.log(
          `[createTasksFromPlan] Created dimension: ${plannedDim.name} (${newDim.id}) with sources: ${(plannedDim.dataSources || ["web"]).join(", ")}`,
        );
      }
    }

    // 1. 为每个维度创建研究任务
    for (const dimension of plan.dimensions) {
      const assignment = plan.agentAssignments.find(
        (a) =>
          a.agentType === "dimension_researcher" &&
          a.assignedDimensions?.includes(dimension.id),
      );

      const dbDimensionId = dimensionIdMap.get(dimension.id);

      const task = await this.prisma.researchTask.create({
        data: {
          missionId,
          title: `研究: ${dimension.name}`,
          description: dimension.description,
          taskType: "dimension_research",
          dimensionName: dimension.name,
          dimensionId: dbDimensionId, // ★ 关联真实的数据库维度 ID
          assignedAgent: assignment?.agentId || "researcher_default",
          assignedAgentType: "dimension_researcher",
          priority: dimension.priority,
          status: ResearchTaskStatus.PENDING,
        },
      });
      tasks.push(task);
    }

    // 2. 创建质量审核任务（依赖所有研究任务）
    const reviewerAssignment = plan.agentAssignments.find(
      (a) => a.agentType === "quality_reviewer",
    );
    const reviewTask = await this.prisma.researchTask.create({
      data: {
        missionId,
        title: "质量审核",
        description: "审核所有维度研究结果的质量",
        taskType: "quality_review",
        assignedAgent: reviewerAssignment?.agentId || "reviewer_default",
        assignedAgentType: "quality_reviewer",
        priority: TASK_PRIORITY.QUALITY_REVIEW,
        dependencies: tasks.map((t) => t.id),
        status: ResearchTaskStatus.PENDING,
      },
    });
    tasks.push(reviewTask);

    // 3. 创建报告撰写任务（依赖审核任务）
    const writerAssignment = plan.agentAssignments.find(
      (a) => a.agentType === "report_writer",
    );
    const writeTask = await this.prisma.researchTask.create({
      data: {
        missionId,
        title: "报告撰写",
        description: "整合研究结果，生成最终报告",
        taskType: "report_synthesis",
        assignedAgent: writerAssignment?.agentId || "writer_default",
        assignedAgentType: "report_writer",
        priority: TASK_PRIORITY.REPORT_SYNTHESIS,
        dependencies: [reviewTask.id],
        status: ResearchTaskStatus.PENDING,
      },
    });
    tasks.push(writeTask);

    return tasks;
  }

  /**
   * 获取 Mission 状态
   */
  async getMissionStatus(missionId: string): Promise<MissionStatus> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { tasks: { orderBy: { priority: "asc" } } },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    const tasks: TaskStatus[] = mission.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      taskType: task.taskType,
      dimensionName: task.dimensionName ?? undefined,
      assignedAgent: task.assignedAgent,
      status: task.status,
      reviewStatus: task.reviewStatus ?? undefined,
    }));

    return {
      id: mission.id,
      status: mission.status,
      progress: mission.progressPercent,
      totalTasks: mission.totalTasks,
      completedTasks: mission.completedTasks,
      currentPhase: this.getPhaseFromStatus(mission.status),
      tasks,
      leaderPlan: mission.leaderPlan as unknown as LeaderPlan | undefined,
    };
  }

  /**
   * 获取专题当前 Mission 状态
   */
  async getMissionByTopicId(topicId: string): Promise<MissionStatus | null> {
    const mission = await this.prisma.researchMission.findFirst({
      where: { topicId },
      orderBy: { createdAt: "desc" },
      include: { tasks: { orderBy: { priority: "asc" } } },
    });

    if (!mission) {
      return null;
    }

    const tasks: TaskStatus[] = mission.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      taskType: task.taskType,
      dimensionName: task.dimensionName ?? undefined,
      assignedAgent: task.assignedAgent,
      status: task.status,
      reviewStatus: task.reviewStatus ?? undefined,
    }));

    return {
      id: mission.id,
      status: mission.status,
      progress: mission.progressPercent,
      totalTasks: mission.totalTasks,
      completedTasks: mission.completedTasks,
      currentPhase: this.getPhaseFromStatus(mission.status),
      tasks,
      leaderPlan: mission.leaderPlan as unknown as LeaderPlan | undefined,
    };
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: ResearchTaskStatus,
    result?: any,
    resultSummary?: string,
  ): Promise<ResearchTask> {
    const now = new Date();
    const updateData: any = { status };

    if (status === ResearchTaskStatus.EXECUTING) {
      updateData.startedAt = now;
    } else if (
      status === ResearchTaskStatus.COMPLETED ||
      status === ResearchTaskStatus.FAILED
    ) {
      updateData.completedAt = now;
    }

    if (result !== undefined) {
      updateData.result = result;
    }

    if (resultSummary !== undefined) {
      updateData.resultSummary = resultSummary;
    }

    const task = await this.prisma.researchTask.update({
      where: { id: taskId },
      data: updateData,
      include: { mission: true },
    });

    // 更新 Mission 进度
    await this.updateMissionProgress(task.missionId);

    return task;
  }

  /**
   * 更新 Mission 进度
   */
  private async updateMissionProgress(missionId: string): Promise<void> {
    const tasks = await this.prisma.researchTask.findMany({
      where: { missionId },
    });

    const completedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    ).length;
    const totalTasks = tasks.length;
    const progressPercent =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 检查是否全部完成
    const allCompleted = completedTasks === totalTasks;
    const anyFailed = tasks.some((t) => t.status === ResearchTaskStatus.FAILED);

    let status: ResearchMissionStatus | undefined;
    if (allCompleted) {
      status = ResearchMissionStatus.COMPLETED;
    } else if (anyFailed) {
      status = ResearchMissionStatus.FAILED;
    }

    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        completedTasks,
        progressPercent,
        ...(status && { status }),
        ...(status === ResearchMissionStatus.COMPLETED && {
          completedAt: new Date(),
        }),
      },
    });
  }

  /**
   * 重试失败的任务
   */
  async retryTask(taskId: string): Promise<ResearchTask> {
    const task = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (
      task.status !== ResearchTaskStatus.FAILED &&
      task.status !== ResearchTaskStatus.NEEDS_REVISION
    ) {
      throw new Error(`Task ${taskId} is not in a retryable state`);
    }

    return this.prisma.researchTask.update({
      where: { id: taskId },
      data: {
        status: ResearchTaskStatus.PENDING,
        revisionCount: { increment: 1 },
        startedAt: null,
        completedAt: null,
        result: undefined,
        resultSummary: null,
      },
    });
  }

  /**
   * 重试整个 Mission
   */
  async retryMission(missionId: string): Promise<ResearchMission> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    if (mission.status !== ResearchMissionStatus.FAILED) {
      throw new Error(`Mission ${missionId} is not failed`);
    }

    // 重置所有失败的任务
    await this.prisma.researchTask.updateMany({
      where: {
        missionId,
        status: {
          in: [ResearchTaskStatus.FAILED, ResearchTaskStatus.NEEDS_REVISION],
        },
      },
      data: {
        status: ResearchTaskStatus.PENDING,
        startedAt: null,
        completedAt: null,
      },
    });

    // 更新 Mission 状态
    return this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        status: ResearchMissionStatus.EXECUTING,
        completedAt: null,
      },
    });
  }

  /**
   * 获取当前团队组成
   */
  async getTeamInfo(missionId: string): Promise<TeamInfo> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { tasks: true },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // 从任务中提取 Agent 信息
    const agentMap = new Map<string, AgentInfo>();

    for (const task of mission.tasks) {
      if (!agentMap.has(task.assignedAgent)) {
        agentMap.set(task.assignedAgent, {
          id: task.assignedAgent,
          type: task.assignedAgentType || "unknown",
          role: this.getAgentRole(task.assignedAgentType),
          status: "idle",
          assignedDimensions: [],
        });
      }

      const agent = agentMap.get(task.assignedAgent)!;

      // 更新 Agent 状态
      if (task.status === ResearchTaskStatus.EXECUTING) {
        agent.status = "working";
        agent.currentTask = task.title;
      } else if (task.status === ResearchTaskStatus.COMPLETED) {
        if (agent.status !== "working") {
          agent.status = "completed";
        }
      } else if (task.status === ResearchTaskStatus.FAILED) {
        agent.status = "failed";
      }

      // 收集分配的维度
      if (task.dimensionName) {
        agent.assignedDimensions?.push(task.dimensionName);
      }
    }

    return {
      leaderId: "leader",
      leaderModel: mission.leaderModelName || "unknown",
      agents: Array.from(agentMap.values()),
    };
  }

  /**
   * 调整 Mission 执行策略
   */
  async adjustMission(
    userId: string,
    missionId: string,
    adjustment: {
      addDimensions?: Array<{ name: string; description: string }>;
      removeDimensions?: string[];
      focusAreas?: string[];
    },
  ): Promise<ResearchMission> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { tasks: true, topic: { select: { userId: true } } },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // 验证用户权限
    if (mission.topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to adjust this mission",
      );
    }

    // 只允许在执行中的 Mission 进行调整
    if (mission.status !== ResearchMissionStatus.EXECUTING) {
      throw new Error(
        `Cannot adjust mission in ${mission.status} status. Only EXECUTING missions can be adjusted.`,
      );
    }

    const changes: string[] = [];

    // 1. 添加新维度
    if (adjustment.addDimensions?.length) {
      for (const dim of adjustment.addDimensions) {
        await this.prisma.researchTask.create({
          data: {
            missionId,
            title: `研究: ${dim.name}`,
            description: dim.description,
            taskType: "dimension_research",
            dimensionName: dim.name,
            assignedAgent: "researcher_dynamic",
            assignedAgentType: "dimension_researcher",
            priority: TASK_PRIORITY.DIMENSION_RESEARCH_DYNAMIC,
            status: ResearchTaskStatus.PENDING,
          },
        });
        changes.push(`新增维度: ${dim.name}`);
      }

      // 更新总任务数
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          totalTasks: { increment: adjustment.addDimensions.length },
        },
      });
    }

    // 2. 移除维度（删除待处理的任务）
    if (adjustment.removeDimensions?.length) {
      for (const dimName of adjustment.removeDimensions) {
        const task = await this.prisma.researchTask.findFirst({
          where: {
            missionId,
            dimensionName: dimName,
            status: ResearchTaskStatus.PENDING,
          },
        });

        if (task) {
          // 删除待处理的任务
          await this.prisma.researchTask.delete({
            where: { id: task.id },
          });
          changes.push(`移除维度: ${dimName}`);
        }
      }
    }

    // 3. 调整聚焦领域（通知 Leader）
    if (adjustment.focusAreas?.length) {
      // 请求 Leader 重新评估任务优先级
      await this.leaderService.handleUserMessage(
        mission.topicId,
        missionId,
        `请调整研究重点，优先关注以下领域：${adjustment.focusAreas.join("、")}`,
      );
      changes.push(`调整聚焦: ${adjustment.focusAreas.join("、")}`);
    }

    // 4. 记录 Leader 决策
    await this.prisma.leaderDecision.create({
      data: {
        missionId,
        type: LeaderDecisionType.ADJUST,
        input: adjustment,
        decision: { changes },
        reasoning: `用户请求调整：${changes.join("；")}`,
      },
    });

    // 5. 发送进度事件
    this.emitProgress({
      missionId,
      topicId: mission.topicId,
      status: mission.status,
      progress: mission.progressPercent,
      phase: "adjusting",
      message: `已调整：${changes.join("、")}`,
      completedTasks: mission.completedTasks,
      totalTasks: mission.totalTasks + (adjustment.addDimensions?.length || 0),
    });

    // 返回更新后的 Mission
    return this.prisma.researchMission.findUniqueOrThrow({
      where: { id: missionId },
    });
  }

  /**
   * 取消 Mission
   */
  async cancelMission(
    userId: string,
    missionId: string,
  ): Promise<ResearchMission> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { topic: { select: { userId: true } } },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // 验证用户权限
    if (mission.topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to cancel this mission",
      );
    }

    // 幂等处理：如果已经取消，直接返回当前状态
    if (mission.status === ResearchMissionStatus.CANCELLED) {
      this.logger.log(
        `[cancelMission] Mission ${missionId} already cancelled, returning current state`,
      );
      return mission;
    }

    // 已完成的任务不能取消
    if (mission.status === ResearchMissionStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot cancel mission that is already completed`,
      );
    }

    return this.prisma.researchMission.update({
      where: { id: missionId },
      data: { status: ResearchMissionStatus.CANCELLED },
    });
  }

  /**
   * 获取 Agent 角色名称
   */
  private getAgentRole(agentType?: string | null): string {
    switch (agentType) {
      case "dimension_researcher":
        return "维度研究员";
      case "quality_reviewer":
        return "质量审核员";
      case "report_writer":
        return "报告撰写员";
      default:
        return "研究员";
    }
  }

  /**
   * 根据任务类型获取 Agent 角色（用于事件发送）
   */
  private getAgentRoleFromTaskType(
    taskType: string,
  ): "leader" | "researcher" | "reviewer" | "synthesizer" {
    switch (taskType) {
      case "dimension_research":
        return "researcher";
      case "quality_review":
        return "reviewer";
      case "report_synthesis":
        return "synthesizer";
      default:
        return "researcher";
    }
  }

  /**
   * 根据任务类型获取 Agent 名称（用于事件发送）
   */
  private getAgentNameFromTaskType(taskType: string): string {
    switch (taskType) {
      case "dimension_research":
        return "研究员";
      case "quality_review":
        return "质量审核员";
      case "report_synthesis":
        return "报告撰写员";
      default:
        return "研究员";
    }
  }

  /**
   * 获取阶段名称
   */
  private getPhaseFromStatus(status: ResearchMissionStatus): string {
    switch (status) {
      case ResearchMissionStatus.PLANNING:
        return "planning";
      case ResearchMissionStatus.EXECUTING:
        return "researching";
      case ResearchMissionStatus.REVIEWING:
        return "reviewing";
      case ResearchMissionStatus.COMPLETED:
        return "completed";
      case ResearchMissionStatus.FAILED:
        return "failed";
      default:
        return "unknown";
    }
  }

  /**
   * 发送进度事件
   * 同时通过 EventEmitter2（内部）和 WebSocket（前端）发送
   */
  private emitProgress(event: MissionProgressEvent): void {
    // 内部事件（用于服务间通信）
    this.eventEmitter.emit("research-mission.progress", event);

    // WebSocket 事件（推送给前端）
    this.researchEventEmitter.emitMissionProgress(event.topicId, {
      missionId: event.missionId,
      progress: event.progress,
      phase: event.phase,
      message: event.message,
      currentTask: event.currentTask,
      completedTasks: event.completedTasks,
      totalTasks: event.totalTasks,
    });
  }

  /**
   * 获取可执行的任务（依赖已完成）
   */
  async getExecutableTasks(missionId: string): Promise<ResearchTask[]> {
    const allTasks = await this.prisma.researchTask.findMany({
      where: { missionId },
    });

    const completedTaskIds = new Set(
      allTasks
        .filter((t) => t.status === ResearchTaskStatus.COMPLETED)
        .map((t) => t.id),
    );

    return allTasks.filter((task) => {
      // 必须是 PENDING 状态
      if (task.status !== ResearchTaskStatus.PENDING) {
        return false;
      }

      // 所有依赖必须已完成
      const dependencies = task.dependencies || [];
      return dependencies.every((depId) => completedTaskIds.has(depId));
    });
  }

  /**
   * 启动任务执行循环
   * 异步执行所有可执行的任务
   */
  private async startExecution(
    missionId: string,
    topicId: string,
  ): Promise<void> {
    this.logger.log(
      `[startExecution] Starting execution for mission ${missionId}`,
    );

    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: { dimensions: true },
    });

    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    // ★ 先创建草稿报告，以便关联证据
    const draftReport =
      await this.reportSynthesisService.createDraftReport(topicId);
    this.logger.log(
      `[startExecution] Created draft report: ${draftReport.id} for evidence association`,
    );

    // 执行循环
    let iteration = 0;
    const maxIterations = 100; // 防止无限循环

    while (iteration < maxIterations) {
      iteration++;

      // 获取可执行的任务
      const executableTasks = await this.getExecutableTasks(missionId);

      if (executableTasks.length === 0) {
        // 检查是否所有任务都完成了
        const allTasks = await this.prisma.researchTask.findMany({
          where: { missionId },
        });
        const pendingTasks = allTasks.filter(
          (t) =>
            t.status === ResearchTaskStatus.PENDING ||
            t.status === ResearchTaskStatus.EXECUTING,
        );

        if (pendingTasks.length === 0) {
          this.logger.log(
            `[startExecution] All tasks completed for mission ${missionId}`,
          );
          break;
        }

        // 有任务在等待依赖，短暂等待后继续
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // 并行执行可执行的任务
      this.logger.log(
        `[startExecution] Executing ${executableTasks.length} tasks in parallel`,
      );

      await Promise.all(
        executableTasks.map((task) =>
          this.executeTask(task, topic, missionId, draftReport.id),
        ),
      );
    }

    // 更新最终状态
    await this.finalizeMission(missionId, topicId);
  }

  /**
   * 执行单个任务
   */
  private async executeTask(
    task: ResearchTask,
    topic: any,
    missionId: string,
    reportId: string,
  ): Promise<void> {
    this.logger.log(`[executeTask] Executing task: ${task.title} (${task.id})`);

    // 确定 Agent 角色
    const agentRole = this.getAgentRoleFromTaskType(task.taskType);
    const agentName = this.getAgentNameFromTaskType(task.taskType);

    try {
      // 更新任务状态为执行中
      await this.updateTaskStatus(task.id, ResearchTaskStatus.EXECUTING);

      // ★ 发送任务开始事件
      await this.researchEventEmitter.emitTaskStarted(topic.id, {
        taskId: task.id,
        taskType: task.taskType,
        title: task.title,
        dimensionName: task.dimensionName ?? undefined,
        status: "executing",
        progress: 0,
        message: `开始执行: ${task.title}`,
      });

      // ★ 发送 Agent 工作状态事件
      await this.researchEventEmitter.emitAgentWorking(topic.id, {
        agentId: task.assignedAgent,
        agentName,
        agentRole,
        status: "working",
        taskDescription: task.title,
        dimensionName: task.dimensionName ?? undefined,
        progress: 0,
      });

      let result: any;

      switch (task.taskType) {
        case "dimension_research": {
          // ★ 发送维度研究开始事件
          const dimensionName = task.dimensionName || task.title;
          await this.researchEventEmitter.emitDimensionResearchStarted(
            topic.id,
            dimensionName,
            agentName,
          );

          // ★ 优先使用 dimensionId 查找（更可靠）
          let dimension = task.dimensionId
            ? topic.dimensions?.find((d: any) => d.id === task.dimensionId)
            : null;

          // 回退：按名称查找
          if (!dimension && task.dimensionName) {
            dimension = topic.dimensions?.find(
              (d: any) => d.name === task.dimensionName,
            );
          }

          if (dimension) {
            this.logger.log(
              `[executeTask] Found dimension: ${dimension.name} (${dimension.id})`,
            );

            // ★ 发送进度事件：正在采集数据
            await this.researchEventEmitter.emitDimensionResearchProgress(
              topic.id,
              dimensionName,
              30,
              "正在采集相关数据...",
            );

            // 使用新的 Leader-Agent 协作机制
            const missionResult =
              await this.dimensionMissionService.executeDimensionMission(
                topic,
                dimension,
                reportId, // ★ 传入 reportId 以便关联证据
              );

            if (!missionResult.success) {
              throw new Error(
                missionResult.error || "Dimension mission failed",
              );
            }
            result = missionResult.analysisResult;

            // ★ 发送维度研究完成事件
            await this.researchEventEmitter.emitDimensionResearchCompleted(
              topic.id,
              dimensionName,
              result.keyFindings?.length || 0,
              result.detailedContent?.length || 0,
            );
          } else {
            // 如果没有找到维度，创建新维度进行研究
            this.logger.warn(
              `[executeTask] Dimension not found for task ${task.id}, creating new one`,
            );
            result = await this.executeGenericDimensionResearch(
              task,
              topic,
              reportId,
            );

            // ★ 发送维度研究完成事件
            await this.researchEventEmitter.emitDimensionResearchCompleted(
              topic.id,
              dimensionName,
              result.keyFindings?.length || 0,
              result.detailedContent?.length || 0,
            );
          }
          break;
        }

        case "quality_review": {
          // ★ 发送审核开始提示
          await this.researchEventEmitter.emitAgentWorking(topic.id, {
            agentId: task.assignedAgent,
            agentName: "质量审核员",
            agentRole: "reviewer",
            status: "working",
            taskDescription: "正在审核所有维度研究结果的质量...",
            progress: 50,
          });

          // 获取所有已完成的维度研究结果
          const completedTasks = await this.prisma.researchTask.findMany({
            where: {
              missionId,
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
          });

          result = {
            reviewedTasks: completedTasks.length,
            status: "approved",
            feedback: `已审核 ${completedTasks.length} 个维度研究结果，质量合格`,
          };
          break;
        }

        case "report_synthesis": {
          // ★ 发送报告撰写开始事件
          await this.researchEventEmitter.emitReportSynthesisStarted(topic.id);

          // ★ 复用 startExecution 中创建的草稿报告，避免重复创建
          // reportId 已在 startExecution 中创建并传递到此处
          this.logger.log(
            `[report_synthesis] Using existing draft report: ${reportId}`,
          );

          // ★ 收集所有维度研究结果并保存到 DimensionAnalysis 表
          const dimensionTasks = await this.prisma.researchTask.findMany({
            where: {
              missionId,
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
          });

          for (const dimTask of dimensionTasks) {
            if (dimTask.result && dimTask.dimensionId) {
              const taskResult = dimTask.result as any;
              try {
                await this.reportSynthesisService.saveDimensionAnalysis(
                  reportId, // ★ 使用已有的 reportId
                  dimTask.dimensionId,
                  {
                    summary: taskResult.summary || "无摘要",
                    keyFindings: taskResult.keyFindings || [],
                    trends: taskResult.trends || [],
                    challenges: taskResult.challenges || [],
                    opportunities: taskResult.opportunities || [],
                    evidenceUsed: taskResult.evidenceUsed || 0,
                    confidenceLevel: taskResult.confidenceLevel || "medium",
                    detailedContent: taskResult.detailedContent || "",
                  },
                );
                this.logger.log(
                  `[report_synthesis] Saved dimension analysis for ${dimTask.dimensionName}`,
                );
              } catch (err) {
                this.logger.warn(
                  `[report_synthesis] Failed to save dimension analysis for ${dimTask.dimensionName}: ${err}`,
                );
              }
            }
          }

          // 合成最终报告
          result = await this.reportSynthesisService.synthesizeReport(
            topic,
            reportId, // ★ 使用已有的 reportId
          );

          // ★ 发送报告撰写完成事件
          await this.researchEventEmitter.emitReportSynthesisCompleted(
            topic.id,
            result?.chapters?.length || 0,
            JSON.stringify(result).length,
          );
          break;
        }

        default:
          result = {
            status: "completed",
            message: `任务类型 ${task.taskType} 已处理`,
          };
      }

      // ★ 发送 Agent 完成事件
      await this.researchEventEmitter.emitAgentCompleted(
        topic.id,
        task.assignedAgent,
        agentName,
        `${task.title} 完成`,
      );

      // ★ 发送任务完成事件
      await this.researchEventEmitter.emitTaskCompleted(topic.id, {
        taskId: task.id,
        taskType: task.taskType,
        title: task.title,
        dimensionName: task.dimensionName ?? undefined,
        status: "completed",
        progress: 100,
        message: `完成: ${task.title}`,
      });

      // 更新任务状态为完成
      await this.updateTaskStatus(
        task.id,
        ResearchTaskStatus.COMPLETED,
        result,
        typeof result === "string"
          ? result.substring(0, 500)
          : JSON.stringify(result).substring(0, 500),
      );

      this.logger.log(`[executeTask] Task completed: ${task.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[executeTask] Task failed: ${task.title} - ${errorMsg}`,
      );

      // 更新任务状态为失败
      await this.updateTaskStatus(
        task.id,
        ResearchTaskStatus.FAILED,
        { error: errorMsg },
        `执行失败: ${errorMsg}`,
      );
    }
  }

  /**
   * 执行通用维度研究（当没有预定义维度时）
   * 会在数据库中创建真实的维度记录
   */
  private async executeGenericDimensionResearch(
    task: ResearchTask,
    topic: any,
    reportId: string,
  ): Promise<any> {
    const dimensionName = task.dimensionName || task.title;

    this.logger.log(
      `[executeGenericDimensionResearch] Creating dimension in DB: ${dimensionName}`,
    );

    // 计算 sortOrder（获取当前最大值 + 1）
    const maxDimension = await this.prisma.topicDimension.findFirst({
      where: { topicId: topic.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxDimension?.sortOrder || 0) + 1;

    // 在数据库中创建真实的维度记录
    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId: topic.id,
        name: dimensionName,
        description: task.description || `研究维度: ${dimensionName}`,
        sortOrder,
        status: "PENDING",
        // ★ 设置默认搜索配置
        searchQueries: [dimensionName],
        searchSources: ["web"],
      },
    });

    this.logger.log(
      `[executeGenericDimensionResearch] Created dimension: ${dimension.id}`,
    );

    // 使用新的 Leader-Agent 协作机制
    const missionResult =
      await this.dimensionMissionService.executeDimensionMission(
        topic,
        dimension,
        reportId, // ★ 传入 reportId 以便关联证据
      );

    if (!missionResult.success || !missionResult.analysisResult) {
      throw new Error(missionResult.error || "Dimension mission failed");
    }

    return missionResult.analysisResult;
  }

  /**
   * 完成 Mission，更新最终状态
   */
  private async finalizeMission(
    missionId: string,
    topicId: string,
  ): Promise<void> {
    const tasks = await this.prisma.researchTask.findMany({
      where: { missionId },
    });

    const completedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    );
    const failedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.FAILED,
    );

    const finalStatus =
      failedTasks.length > 0
        ? ResearchMissionStatus.FAILED
        : ResearchMissionStatus.COMPLETED;

    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        status: finalStatus,
        completedTasks: completedTasks.length,
        progressPercent: 100,
        completedAt: new Date(),
      },
    });

    // 发送完成事件
    this.emitProgress({
      missionId,
      topicId,
      status: finalStatus,
      progress: 100,
      phase:
        finalStatus === ResearchMissionStatus.COMPLETED
          ? "completed"
          : "failed",
      message:
        finalStatus === ResearchMissionStatus.COMPLETED
          ? `研究完成，共完成 ${completedTasks.length} 个任务`
          : `研究失败，${failedTasks.length} 个任务失败`,
      completedTasks: completedTasks.length,
      totalTasks: tasks.length,
    });

    this.logger.log(
      `[finalizeMission] Mission ${missionId} finalized with status: ${finalStatus}`,
    );
  }
}
