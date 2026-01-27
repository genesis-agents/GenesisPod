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
  forwardRef,
  Inject,
} from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTodoStatus,
  LeaderDecisionType,
  Prisma,
  AIModelType,
  AgentActivityType,
} from "@prisma/client";
import type { ResearchMission, ResearchTask } from "@prisma/client";
import {
  ResearchLeaderService,
  type LeaderPlan,
} from "./research-leader.service";
import type { ResearchMode } from "../dto/leader.dto";
import { DimensionMissionService } from "./dimension-mission.service";
import { ReportSynthesisService } from "./report-synthesis.service";
import { ResearchEventEmitterService } from "./research-event-emitter.service";
import { TopicCollaboratorService } from "./topic-collaborator.service";
import { AgentActivityService } from "./agent-activity.service";
import { CollaboratorRole } from "../dto/collaborator.dto";
import { AIEngineFacade } from "@/modules/ai-engine/facade/ai-engine.facade";
import { ResearchReviewerService } from "./research-reviewer.service";
import type { DimensionAnalysisResult } from "../types/research.types";

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
  /** ★ 研究模式：fresh=全新开始，incremental=增量更新（保留已完成任务） */
  mode?: ResearchMode;
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
  description?: string;
  taskType: string;
  dimensionName?: string;
  assignedAgent: string;
  /** ★ Agent 使用的 AI 模型 ID */
  modelId?: string;
  status: ResearchTaskStatus;
  reviewStatus?: string;
  progress?: number;
  /** 任务结果（包含成功数据或错误信息） */
  result?: any;
  /** 结果摘要 */
  resultSummary?: string;
  /** 开始时间 */
  startedAt?: Date;
  /** 完成时间 */
  completedAt?: Date;
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

/**
 * 已完成的任务数据（用于增量模式复制）
 */
export interface CompletedTaskData {
  dimensionName: string;
  dimensionId: string | null;
  title: string;
  description: string;
  assignedAgent: string;
  assignedAgentType: string | null;
  priority: number;
  result: Prisma.JsonValue | null;
  resultSummary: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface TeamInfo {
  leaderId: string | null;
  leaderModel: string | null;
  agents: AgentInfo[];
}

export interface AgentInfo {
  id: string;
  type: string;
  role: string;
  status: "idle" | "working" | "completed" | "failed";
  currentTask?: string;
  assignedDimensions?: string[];
  /** ★ Agent 使用的 AI 模型名称 */
  model?: string;
  /** ★ v8.0: Leader 分配给此 Agent 的技能 */
  skills?: string[];
  /** ★ v8.0: Leader 分配给此 Agent 的工具 */
  tools?: string[];
}

// ==================== Service ====================

@Injectable()
export class ResearchMissionService {
  private readonly logger = new Logger(ResearchMissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => ResearchLeaderService))
    private readonly leaderService: ResearchLeaderService,
    @Inject(forwardRef(() => DimensionMissionService))
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly reportSynthesisService: ReportSynthesisService,
    private readonly researchEventEmitter: ResearchEventEmitterService,
    private readonly collaboratorService: TopicCollaboratorService,
    private readonly agentActivity: AgentActivityService,
    private readonly aiFacade: AIEngineFacade,
    private readonly reviewerService: ResearchReviewerService,
  ) {}

  /**
   * 创建新的研究 Mission
   * 调用 Leader 进行规划，创建任务列表
   */
  async createMission(input: CreateMissionInput): Promise<ResearchMission> {
    const { topicId, userPrompt, userContext, mode = "fresh" } = input;
    const isIncremental = mode === "incremental";
    this.logger.log(
      `[createMission] Creating mission for topic ${topicId}, mode: ${mode}`,
    );

    // 1. 验证专题存在
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // ★ 增量模式：查找已完成的维度任务（用于继承）
    // 需要收集完整的任务数据，以便复制到新 Mission
    let completedTasks: CompletedTaskData[] = [];
    let completedDimensionNames: string[] = [];

    if (isIncremental) {
      // 查找此 Topic 最近的 Mission，获取已完成的维度任务（完整数据）
      const latestMission = await this.prisma.researchMission.findFirst({
        where: { topicId },
        orderBy: { createdAt: "desc" },
        include: {
          tasks: {
            where: {
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
          },
        },
      });

      if (latestMission?.tasks) {
        completedTasks = latestMission.tasks
          .filter((t) => t.dimensionName)
          .map((t) => ({
            dimensionName: t.dimensionName!,
            dimensionId: t.dimensionId,
            title: t.title,
            description: t.description,
            assignedAgent: t.assignedAgent,
            assignedAgentType: t.assignedAgentType,
            priority: t.priority,
            result: t.result,
            resultSummary: t.resultSummary,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
          }));
        completedDimensionNames = completedTasks.map((t) => t.dimensionName);
        this.logger.log(
          `[createMission] Incremental mode: found ${completedTasks.length} completed tasks: ${completedDimensionNames.join(", ")}`,
        );
      }
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
      include: {
        tasks: {
          where: {
            taskType: "dimension_research",
          },
        },
      },
    });

    if (existingMission) {
      // ★ 根据模式决定如何处理旧 Mission
      if (isIncremental) {
        // 增量模式：收集已完成的任务（完整数据）
        const existingCompletedTasks = existingMission.tasks
          .filter(
            (t) => t.status === ResearchTaskStatus.COMPLETED && t.dimensionName,
          )
          .map((t) => ({
            dimensionName: t.dimensionName!,
            dimensionId: t.dimensionId,
            title: t.title,
            description: t.description,
            assignedAgent: t.assignedAgent,
            assignedAgentType: t.assignedAgentType,
            priority: t.priority,
            result: t.result,
            resultSummary: t.resultSummary,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
          }));

        // 合并已完成的任务（去重：以 dimensionName 为键）
        const existingNames = new Set(
          completedTasks.map((t) => t.dimensionName),
        );
        for (const task of existingCompletedTasks) {
          if (!existingNames.has(task.dimensionName)) {
            completedTasks.push(task);
            existingNames.add(task.dimensionName);
          }
        }
        completedDimensionNames = completedTasks.map((t) => t.dimensionName);
        this.logger.log(
          `[createMission] Incremental: merged ${existingCompletedTasks.length} completed from active mission, total: ${completedTasks.length}`,
        );
      }

      this.logger.warn(
        `[createMission] Found existing mission ${existingMission.id} (status: ${existingMission.status}), ` +
          `cancelling to start ${isIncremental ? "incremental update" : "fresh"}...`,
      );

      // 取消旧 Mission
      await this.prisma.researchMission.update({
        where: { id: existingMission.id },
        data: { status: ResearchMissionStatus.CANCELLED },
      });

      // 取消旧 Mission 的所有未完成 Task
      await this.prisma.researchTask.updateMany({
        where: {
          missionId: existingMission.id,
          status: {
            notIn: [ResearchTaskStatus.COMPLETED, ResearchTaskStatus.FAILED],
          },
        },
        data: { status: ResearchTaskStatus.FAILED },
      });

      // 取消旧 Mission 的所有待处理 Todo
      await this.prisma.researchTodo.updateMany({
        where: {
          missionId: existingMission.id,
          status: {
            notIn: [ResearchTodoStatus.COMPLETED, ResearchTodoStatus.CANCELLED],
          },
        },
        data: {
          status: ResearchTodoStatus.CANCELLED,
          statusMessage: isIncremental
            ? "用户启动了增量更新"
            : "用户启动了新研究",
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `[createMission] Cancelled old mission ${existingMission.id}`,
      );
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

    // ★ 关键修复：立即返回 mission，异步执行规划
    // 原因：AI 推理可能需要 2-5 分钟，而 Next.js rewrite 代理默认 30 秒超时
    // 前端会通过轮询 getMission 和 WebSocket 获取规划进度
    this.executePlanningAsync(
      mission.id,
      topicId,
      topic.name,
      userPrompt,
      completedTasks, // ★ 增量模式：传递已完成的任务（完整数据）
    ).catch((err) => {
      this.logger.error(
        `[createMission] Async planning failed: ${err instanceof Error ? err.message : err}`,
      );
    });

    this.logger.log(
      `[createMission] Mission ${mission.id} created, planning started asynchronously`,
    );

    return mission;
  }

  /**
   * 异步执行 Leader 规划
   * ★ 关键：从 createMission 中分离出来，避免阻塞 HTTP 响应
   */
  private async executePlanningAsync(
    missionId: string,
    topicId: string,
    topicName: string,
    userPrompt?: string,
    completedTasks: CompletedTaskData[] = [], // ★ 增量模式：已完成的任务（完整数据）
  ): Promise<void> {
    this.logger.log(
      `[executePlanningAsync] Starting planning for mission ${missionId}` +
        (completedTasks.length > 0
          ? `, incremental mode with ${completedTasks.length} completed tasks`
          : ""),
    );

    // ★ 发送 Leader 思考事件：理解任务
    await this.researchEventEmitter.emitLeaderThinking(topicId, {
      missionId,
      phase: "understanding",
      content: `正在理解研究主题「${topicName}」的需求...`,
      progress: 10,
    });

    try {
      // ★ 发送 Leader 思考事件：分析
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId,
        phase: "analyzing",
        content: "正在分析研究范围和关键维度...",
        progress: 20,
      });

      // ★ 发送 Leader 规划中事件
      await this.researchEventEmitter.emitLeaderPlanning(
        topicId,
        missionId,
        "Leader 正在制定研究计划，确定研究维度和任务分配...",
      );

      const leaderPlan = await this.leaderService.planResearch(
        topicId,
        userPrompt,
      );

      // ★ 发送 Leader 思考事件：规划完成
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId,
        phase: "planning",
        content: `已规划 ${leaderPlan.dimensions.length} 个研究维度：${leaderPlan.dimensions.map((d) => d.name).join("、")}`,
        progress: 40,
      });

      // 记录 Leader 决策
      await this.prisma.leaderDecision.create({
        data: {
          missionId,
          type: LeaderDecisionType.PLAN,
          input: { topicId, userPrompt },
          decision: leaderPlan as unknown as Prisma.InputJsonValue,
          reasoning: `规划了 ${leaderPlan.dimensions.length} 个研究维度，分配了 ${leaderPlan.agentAssignments.length} 个 Agent`,
        },
      });

      // ★ 记录 Leader 团队组建活动到 Activity（持久化）
      await this.agentActivity.recordActivity({
        topicId,
        missionId,
        agentId: "leader",
        agentName: "研究组长",
        agentRole: "leader",
        activityType: AgentActivityType.PLANNING,
        phase: "team_building",
        content: `组建研究团队：规划了 ${leaderPlan.dimensions.length} 个研究维度，分配了 ${leaderPlan.agentAssignments.length} 个研究员`,
        progress: 50,
        thinkingPhase: "understanding",
        thinkingContent: `研究维度：${leaderPlan.dimensions.map((d) => d.name).join("、")}\n研究员分配：${leaderPlan.agentAssignments.map((a) => `${a.agentName || a.agentId}${a.modelId ? ` [${a.modelId}]` : ""}`).join("、")}`,
      });

      // ★ 发送 Leader 思考事件：分配任务（结构化显示模型分配）
      const researcherAssignments = leaderPlan.agentAssignments.filter(
        (a) => a.agentType === "dimension_researcher",
      );
      // 按模型分组统计
      const modelGroups = new Map<string, string[]>();
      for (const a of researcherAssignments) {
        const modelId = a.modelId || "默认模型";
        if (!modelGroups.has(modelId)) {
          modelGroups.set(modelId, []);
        }
        modelGroups.get(modelId)!.push(a.agentName || a.agentId);
      }
      // 格式化输出：按模型分组
      const groupedAssignments = Array.from(modelGroups.entries())
        .map(([model, agents]) => `【${model}】${agents.join("、")}`)
        .join("\n");
      await this.researchEventEmitter.emitLeaderThinking(topicId, {
        missionId,
        phase: "assigning",
        content: `团队组建完成（${researcherAssignments.length}人）：\n${groupedAssignments}`,
        progress: 50,
      });

      // 将 Leader 规划的维度同步到数据库，并创建任务
      // ★ 增量模式：先复制已完成的任务，再创建新任务
      const tasks = await this.createTasksFromPlan(
        missionId,
        topicId,
        leaderPlan,
        completedTasks,
      );

      // ★ 发送 Leader 规划完成事件
      await this.researchEventEmitter.emitLeaderPlanReady(
        topicId,
        missionId,
        leaderPlan.dimensions.length,
        leaderPlan.agentAssignments.length,
      );

      // 更新 Mission
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: {
          leaderPlan: leaderPlan as unknown as Prisma.InputJsonValue,
          totalTasks: tasks.length,
          status: ResearchMissionStatus.EXECUTING,
          startedAt: new Date(),
        },
      });

      // 发送进度事件
      this.emitProgress({
        missionId,
        topicId,
        status: ResearchMissionStatus.EXECUTING,
        progress: 10,
        phase: "executing",
        message: `规划完成，开始执行 ${tasks.length} 个任务`,
        completedTasks: 0,
        totalTasks: tasks.length,
      });

      this.logger.log(
        `[executePlanningAsync] Mission ${missionId} planning completed with ${tasks.length} tasks`,
      );

      // ★ 启动异步任务执行
      this.startExecution(missionId, topicId).catch((err) => {
        this.logger.error(`[executePlanningAsync] Execution failed: ${err}`);
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "规划失败：未知错误";

      // 规划失败，更新状态
      // ★ 使用 try-catch 包裹更新操作，避免 mission 已被删除时报错
      try {
        // ★ 先检查 mission 是否仍存在
        const missionExists = await this.prisma.researchMission.findUnique({
          where: { id: missionId },
          select: { id: true },
        });

        if (missionExists) {
          await this.prisma.researchMission.update({
            where: { id: missionId },
            data: {
              status: ResearchMissionStatus.FAILED,
            },
          });
        } else {
          this.logger.debug(
            `[executePlanningAsync] Mission ${missionId} no longer exists, skipping status update`,
          );
        }
      } catch (updateError) {
        this.logger.debug(
          `[executePlanningAsync] Could not update mission status: ${updateError}`,
        );
      }

      // ★ 发送失败事件，让前端知道规划失败
      // 使用 emitMissionFailed 发送正确的 mission:failed 事件
      await this.researchEventEmitter.emitMissionFailed(
        topicId,
        missionId,
        errorMsg,
      );

      this.logger.error(`[executePlanningAsync] Planning failed: ${errorMsg}`);
    }
  }

  /**
   * 根据 Leader 规划创建任务
   * ★ 重要：会将 Leader 规划的维度同步到 TopicDimension 表
   * @param completedTasks 增量模式下已完成的任务（完整数据），会复制到新 Mission
   */
  private async createTasksFromPlan(
    missionId: string,
    topicId: string,
    plan: LeaderPlan,
    completedTasks: CompletedTaskData[] = [],
  ): Promise<ResearchTask[]> {
    const tasks: ResearchTask[] = [];
    const completedSet = new Set(completedTasks.map((t) => t.dimensionName));

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

    // ★ 修复 N+1 查询：批量查询已存在的维度
    const plannedDimensionNames = plan.dimensions.map((d) => d.name);
    const existingDimensions = await this.prisma.topicDimension.findMany({
      where: {
        topicId,
        name: { in: plannedDimensionNames },
      },
    });
    const existingDimMap = new Map(existingDimensions.map((d) => [d.name, d]));

    for (const plannedDim of plan.dimensions) {
      // 检查是否已存在同名维度
      const existingDim = existingDimMap.get(plannedDim.name);

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

    // ★ 增量模式：首先复制已完成的任务到新 Mission
    if (completedTasks.length > 0) {
      this.logger.log(
        `[createTasksFromPlan] Incremental mode: copying ${completedTasks.length} completed tasks: ${[...completedSet].join(", ")}`,
      );

      // ★ 修复 N+1 查询：批量查询所有需要的维度
      const completedDimensionNames = completedTasks.map(
        (t) => t.dimensionName,
      );
      const dimensionsForCompleted = await this.prisma.topicDimension.findMany({
        where: {
          topicId,
          name: { in: completedDimensionNames },
        },
      });
      const dimensionNameToIdMap = new Map(
        dimensionsForCompleted.map((d) => [d.name, d.id]),
      );

      // ★ 使用 createMany 批量创建任务（性能优化）
      const tasksToCreate = completedTasks.map((completedTask) => ({
        missionId,
        title: completedTask.title,
        description: completedTask.description,
        taskType: "dimension_research",
        dimensionName: completedTask.dimensionName,
        dimensionId:
          dimensionNameToIdMap.get(completedTask.dimensionName) ||
          completedTask.dimensionId,
        assignedAgent: completedTask.assignedAgent,
        assignedAgentType: completedTask.assignedAgentType,
        priority: completedTask.priority,
        status: ResearchTaskStatus.COMPLETED, // ★ 标记为已完成
        result: completedTask.result ?? undefined,
        resultSummary: completedTask.resultSummary,
        startedAt: completedTask.startedAt,
        completedAt: completedTask.completedAt,
      }));

      // ★ 批量创建任务
      await this.prisma.researchTask.createMany({
        data: tasksToCreate,
      });

      // ★ 查询刚创建的任务以返回完整数据
      const copiedTasks = await this.prisma.researchTask.findMany({
        where: {
          missionId,
          status: ResearchTaskStatus.COMPLETED,
          dimensionName: { in: completedDimensionNames },
        },
      });
      tasks.push(...copiedTasks);

      this.logger.log(
        `[createTasksFromPlan] Copied ${copiedTasks.length} completed tasks in batch`,
      );
    }

    // 1. 为每个维度创建研究任务（跳过已完成的）
    for (const dimension of plan.dimensions) {
      // ★ 增量模式：跳过已完成的维度（已在上面复制）
      if (completedSet.has(dimension.name)) {
        this.logger.log(
          `[createTasksFromPlan] Skipping dimension (already copied): ${dimension.name}`,
        );
        continue;
      }

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
          modelId: assignment?.modelId, // ★ 保存 Agent 使用的模型 ID
          skills: assignment?.skills || [], // ★ 保存 Leader 分配的技能
          tools: assignment?.tools || [], // ★ 保存 Leader 分配的工具
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
        modelId: reviewerAssignment?.modelId, // ★ 保存审核员使用的模型 ID
        skills: reviewerAssignment?.skills || [], // ★ 保存 Leader 分配的技能
        tools: reviewerAssignment?.tools || [], // ★ 保存 Leader 分配的工具
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
        modelId: writerAssignment?.modelId, // ★ 保存撰写员使用的模型 ID
        skills: writerAssignment?.skills || [], // ★ 保存 Leader 分配的技能
        tools: writerAssignment?.tools || [], // ★ 保存 Leader 分配的工具
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
      description: task.description,
      taskType: task.taskType,
      dimensionName: task.dimensionName ?? undefined,
      assignedAgent: task.assignedAgent,
      modelId: task.modelId ?? undefined, // ★ 返回 Agent 使用的模型 ID
      status: task.status,
      progress: task.progress ?? 0, // ★ 返回任务进度
      reviewStatus: task.reviewStatus ?? undefined,
      // ★ 修复：返回完整的任务结果，包含成功数据或错误信息
      result: task.result ?? undefined,
      resultSummary: task.resultSummary ?? undefined,
      startedAt: task.startedAt ?? undefined,
      completedAt: task.completedAt ?? undefined,
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
      description: task.description,
      taskType: task.taskType,
      dimensionName: task.dimensionName ?? undefined,
      assignedAgent: task.assignedAgent,
      modelId: task.modelId ?? undefined, // ★ 返回 Agent 使用的模型 ID
      status: task.status,
      progress: task.progress ?? 0, // ★ 返回任务进度
      reviewStatus: task.reviewStatus ?? undefined,
      // ★ 修复：返回完整的任务结果
      result: task.result ?? undefined,
      resultSummary: task.resultSummary ?? undefined,
      startedAt: task.startedAt ?? undefined,
      completedAt: task.completedAt ?? undefined,
      // ★ 返回依赖关系用于可视化
      dependencies: (task.dependencies as string[]) ?? [],
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
   * ★ 获取任务相关的 Agent 活动记录
   * 通过 ResearchTask.id 查找关联的 ResearchAgentActivity
   */
  async getTaskActivities(taskId: string): Promise<{
    task: ResearchTask;
    activities: any[];
  }> {
    // 1. 获取任务信息
    const task = await this.prisma.researchTask.findUnique({
      where: { id: taskId },
      include: { mission: true },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // 2. 构建查询条件
    // ★ 修复：根据任务类型精确过滤活动
    //   - 维度研究任务：只显示该维度的活动（不包含 Leader 的规划活动）
    //   - Leader 规划任务：显示 Leader 的规划活动
    //   - 报告撰写/质量审核任务：显示对应阶段的活动
    let whereCondition: Prisma.ResearchAgentActivityWhereInput;

    // ★ 获取 topicId 用于跨 Mission 查询
    const topicId = task.mission?.topicId;

    if (task.dimensionId) {
      // ★ 修复：维度研究任务使用 topicId + dimensionId 查询
      // 这样即使 Mission 更新（新 missionId），也能找到旧 Mission 下的活动记录
      whereCondition = {
        topicId: topicId,
        dimensionId: task.dimensionId,
      };
    } else if (task.taskType === "leader_planning") {
      // Leader 规划任务：只获取 Leader 的活动
      whereCondition = {
        missionId: task.missionId,
        agentRole: "leader",
      };
    } else if (task.taskType === "report_synthesis") {
      // 报告撰写任务：获取 synthesizer 的活动
      whereCondition = {
        missionId: task.missionId,
        agentRole: "synthesizer",
      };
    } else if (task.taskType === "quality_review") {
      // 质量审核任务：获取 reviewer 的活动
      whereCondition = {
        missionId: task.missionId,
        agentRole: "reviewer",
      };
    } else {
      // 其他任务：按 missionId 和 agentId 查询
      whereCondition = {
        missionId: task.missionId,
        ...(task.assignedAgent && { agentId: task.assignedAgent }),
      };
    }

    // 3. 查询活动记录
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: whereCondition,
      orderBy: { createdAt: "asc" },
    });

    return { task, activities };
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

    // 检查任务状态
    const failedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.FAILED,
    ).length;
    const allCompleted = completedTasks === totalTasks;

    // ★ 修复：只有当所有任务都是终态时才判断最终状态
    // 终态 = COMPLETED 或 FAILED
    const terminalTaskCount = completedTasks + failedTasks;
    const allTerminal = terminalTaskCount === totalTasks;

    let status: ResearchMissionStatus | undefined;
    if (allCompleted) {
      // 所有任务都成功完成
      status = ResearchMissionStatus.COMPLETED;
    } else if (allTerminal && failedTasks > 0) {
      // 所有任务都已结束，且有失败的任务
      status = ResearchMissionStatus.FAILED;
    }
    // 否则保持当前状态（IN_PROGRESS）

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
   * ★ 查询数据库获取各 Agent 使用的模型名称
   * ★ v8.0: 从 leaderPlan 提取 Agent 的 skills/tools
   */
  async getTeamInfo(missionId: string): Promise<TeamInfo> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { tasks: true },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // ★ 查询各类型的默认模型（用于显示 Agent 使用的模型）
    const modelTypeMap = await this.getDefaultModelNames();

    // ★ 获取 Leader 模型：优先使用存储的，否则动态获取当前推理模型
    let leaderModel = mission.leaderModelId || mission.leaderModelName;
    if (!leaderModel) {
      // 旧数据没有存储模型ID，动态获取当前使用的推理模型
      const currentModel = await this.leaderService.getReasoningModel();
      leaderModel = currentModel?.modelId || currentModel?.modelName || null;
      this.logger.log(
        `[getTeamInfo] Mission ${missionId} has no stored model, using current: ${leaderModel}`,
      );
    }

    // ★ v8.0: 从 leaderPlan 提取 agentAssignments（包含 skills/tools）
    //
    // 运行时类型验证说明：
    // - v8.0 之前的 leaderPlan 没有 skills/tools 字段
    // - 必须验证数组元素是非空字符串，防止类型污染
    // - 空数组 [] 转为 undefined，保持前端显示逻辑一致
    const agentAssignmentsMap = new Map<
      string,
      { skills?: string[]; tools?: string[]; modelId?: string }
    >();

    // ★ 辅助函数：验证是否为非空字符串数组
    const isNonEmptyStringArray = (value: unknown): value is string[] => {
      if (!Array.isArray(value) || value.length === 0) return false;
      return value.every(
        (item) => typeof item === "string" && item.trim().length > 0,
      );
    };

    try {
      const rawPlan = mission.leaderPlan;
      if (
        rawPlan &&
        typeof rawPlan === "object" &&
        "agentAssignments" in rawPlan &&
        Array.isArray((rawPlan as Record<string, unknown>).agentAssignments)
      ) {
        const assignments = (rawPlan as Record<string, unknown>)
          .agentAssignments as unknown[];
        for (const item of assignments) {
          // 验证每个 assignment 的基本结构
          if (
            item &&
            typeof item === "object" &&
            "agentId" in item &&
            typeof (item as Record<string, unknown>).agentId === "string"
          ) {
            const assignment = item as Record<string, unknown>;
            const agentId = assignment.agentId as string;

            // ★ 严格验证 skills/tools 是非空字符串数组
            // 空数组 [] 或无效数据都转为 undefined
            agentAssignmentsMap.set(agentId, {
              skills: isNonEmptyStringArray(assignment.skills)
                ? (assignment.skills as string[])
                : undefined,
              tools: isNonEmptyStringArray(assignment.tools)
                ? (assignment.tools as string[])
                : undefined,
              modelId:
                typeof assignment.modelId === "string" &&
                assignment.modelId.trim()
                  ? assignment.modelId
                  : undefined,
            });
          }
        }
        // ★ skills/tools 分配情况（debug 级别，避免轮询时刷屏）
        this.logger.debug(
          `[getTeamInfo] Found ${agentAssignmentsMap.size} agents with capabilities`,
        );
      }
    } catch (parseError) {
      // 旧数据解析失败是预期行为，使用 debug 级别
      this.logger.debug(
        `[getTeamInfo] Failed to parse leaderPlan (may be legacy data): ${parseError instanceof Error ? parseError.message : parseError}`,
      );
    }

    // 从任务中提取 Agent 信息
    const agentMap = new Map<string, AgentInfo>();

    for (const task of mission.tasks) {
      if (!agentMap.has(task.assignedAgent)) {
        const agentType = task.assignedAgentType || "unknown";
        // ★ v8.0: 从 leaderPlan 获取 skills/tools
        const assignment = agentAssignmentsMap.get(task.assignedAgent);
        // ★ 模型优先使用任务级别存储的，其次是 leaderPlan 中的，最后是默认
        const model =
          task.modelId ||
          assignment?.modelId ||
          this.getModelForAgentType(agentType, modelTypeMap);

        agentMap.set(task.assignedAgent, {
          id: task.assignedAgent,
          type: agentType,
          role: this.getAgentRole(task.assignedAgentType),
          status: "idle",
          assignedDimensions: [],
          model,
          skills: assignment?.skills,
          tools: assignment?.tools,
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
      leaderModel, // ★ 使用上面获取的模型（存储的或动态获取的）
      agents: Array.from(agentMap.values()),
    };
  }

  /**
   * ★ 查询各模型类型的默认模型名称
   * 使用 AIEngineFacade 获取模型配置
   */
  private async getDefaultModelNames(): Promise<Map<AIModelType, string>> {
    const map = new Map<AIModelType, string>();

    // 获取 CHAT 类型的默认模型
    const chatModel = await this.aiFacade.getDefaultModelByType(
      AIModelType.CHAT,
    );
    if (chatModel) {
      map.set(AIModelType.CHAT, chatModel.displayName || chatModel.modelId);
    }

    return map;
  }

  /**
   * ★ 根据 Agent 类型获取对应的模型名称
   * 所有 worker agent 使用 CHAT 类型模型
   * Leader 的模型名称存储在 mission.leaderModelName 中
   */
  private getModelForAgentType(
    _agentType: string,
    modelMap: Map<AIModelType, string>,
  ): string | undefined {
    // 所有 worker agent 都使用 CHAT 模型
    // Leader 的模型在 TeamInfo.leaderModel 中单独返回
    return modelMap.get(AIModelType.CHAT);
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
      include: { topic: { select: { userId: true, id: true } } },
    });

    if (!mission) {
      throw new NotFoundException(`Mission ${missionId} not found`);
    }

    // 验证用户权限（使用统一的权限检查）
    // PUBLIC 专题：任何登录用户都可以取消
    // SHARED 专题：协作者可以取消
    // PRIVATE 专题：仅所有者可以取消
    const hasAccess = await this.collaboratorService.hasAccess(
      mission.topic.id,
      userId,
      CollaboratorRole.EDITOR, // 取消任务需要 EDITOR 权限
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to cancel this mission",
      );
    }

    // 幂等处理：如果已经取消，仍需确保 ResearchTask 和 ResearchTodo 状态一致
    if (mission.status === ResearchMissionStatus.CANCELLED) {
      this.logger.log(
        `[cancelMission] Mission ${missionId} already cancelled, ensuring task & todo status consistency`,
      );
      // ★ 确保 ResearchTask 也被更新（修复旧代码遗留的数据）
      const fixedTasksResult = await this.prisma.researchTask.updateMany({
        where: {
          missionId,
          status: {
            in: [
              ResearchTaskStatus.PENDING,
              ResearchTaskStatus.ASSIGNED,
              ResearchTaskStatus.EXECUTING,
            ],
          },
        },
        data: {
          status: ResearchTaskStatus.FAILED,
          resultSummary: "任务已被用户取消",
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `[cancelMission] Fixed ${fixedTasksResult.count} stale tasks in idempotent cancel`,
      );

      // ★ 确保 ResearchTodo 也被更新（修复旧代码遗留的数据）
      const fixedTodosResult = await this.prisma.researchTodo.updateMany({
        where: {
          missionId,
          status: {
            in: [
              ResearchTodoStatus.PENDING,
              ResearchTodoStatus.QUEUED,
              ResearchTodoStatus.IN_PROGRESS,
            ],
          },
        },
        data: {
          status: ResearchTodoStatus.CANCELLED,
          statusMessage: "任务已被用户取消",
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `[cancelMission] Fixed ${fixedTodosResult.count} stale todos in idempotent cancel`,
      );

      return mission;
    }

    // 已完成的任务不能取消
    if (mission.status === ResearchMissionStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot cancel mission that is already completed`,
      );
    }

    // ★ 取消所有未完成的任务（PENDING、ASSIGNED 或 EXECUTING 状态）
    const cancelledTasksResult = await this.prisma.researchTask.updateMany({
      where: {
        missionId,
        status: {
          in: [
            ResearchTaskStatus.PENDING,
            ResearchTaskStatus.ASSIGNED,
            ResearchTaskStatus.EXECUTING,
          ],
        },
      },
      data: {
        status: ResearchTaskStatus.FAILED,
        resultSummary: "任务已被用户取消",
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `[cancelMission] Cancelled ${cancelledTasksResult.count} pending/executing tasks`,
    );

    // ★ 同步更新 ResearchTodo 表（前端显示的任务列表来自这里）
    const cancelledTodosResult = await this.prisma.researchTodo.updateMany({
      where: {
        missionId,
        status: {
          in: [
            ResearchTodoStatus.PENDING,
            ResearchTodoStatus.QUEUED,
            ResearchTodoStatus.IN_PROGRESS,
          ],
        },
      },
      data: {
        status: ResearchTodoStatus.CANCELLED,
        statusMessage: "任务已被用户取消",
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `[cancelMission] Cancelled ${cancelledTodosResult.count} pending/queued/in_progress todos`,
    );

    // ★ 清理该任务创建的空草稿报告（没有 dimensionAnalyses 的报告）
    const topicId = mission.topicId;
    const emptyDraftReports = await this.prisma.topicReport.findMany({
      where: {
        topicId,
        dimensionAnalyses: { none: {} }, // 没有任何维度分析
      },
      select: { id: true },
    });

    if (emptyDraftReports.length > 0) {
      const deleteIds = emptyDraftReports.map((r) => r.id);
      await this.prisma.topicReport.deleteMany({
        where: { id: { in: deleteIds } },
      });
      this.logger.log(
        `[cancelMission] Cleaned up ${deleteIds.length} empty draft reports`,
      );
    }

    // ★ 发送取消事件通知前端
    this.emitProgress({
      missionId,
      topicId,
      status: ResearchMissionStatus.CANCELLED,
      progress: 0,
      phase: "cancelled",
      message: "研究任务已取消",
      completedTasks: 0,
      totalTasks: mission.totalTasks,
    });

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
   * ★ v7.3: 按 priority 升序排序（数字越小越先执行）
   */
  async getExecutableTasks(missionId: string): Promise<ResearchTask[]> {
    // ★ v7.3: 查询时按 priority 排序
    const allTasks = await this.prisma.researchTask.findMany({
      where: { missionId },
      orderBy: { priority: "asc" },
    });

    const completedTaskIds = new Set(
      allTasks
        .filter((t) => t.status === ResearchTaskStatus.COMPLETED)
        .map((t) => t.id),
    );

    const executableTasks = allTasks.filter((task) => {
      // 必须是 PENDING 状态
      if (task.status !== ResearchTaskStatus.PENDING) {
        return false;
      }

      // 所有依赖必须已完成
      const dependencies = task.dependencies || [];
      return dependencies.every((depId) => completedTaskIds.has(depId));
    });

    // ★ v7.3: 确保返回的任务按 priority 排序（虽然查询已排序，但 filter 不保证顺序）
    return executableTasks.sort(
      (a, b) => (a.priority || 0) - (b.priority || 0),
    );
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

    // ★ 检查是否有继承的已完成任务（增量模式）
    // 如果有，需要将之前报告的证据复制到新报告
    const completedTasks = await this.prisma.researchTask.findMany({
      where: {
        missionId,
        taskType: "dimension_research",
        status: ResearchTaskStatus.COMPLETED,
      },
    });

    if (completedTasks.length > 0) {
      // ★ 找到最近的有证据的报告，复制证据到新报告
      const previousReport = await this.prisma.topicReport.findFirst({
        where: {
          topicId,
          id: { not: draftReport.id }, // 排除刚创建的草稿
          evidences: { some: {} }, // 必须有证据
        },
        orderBy: { generatedAt: "desc" },
        include: { evidences: true },
      });

      if (previousReport && previousReport.evidences.length > 0) {
        // 复制证据到新报告（保持 citationIndex）
        const evidencesCopyData = previousReport.evidences.map((e) => ({
          reportId: draftReport.id, // ★ 关联到新报告
          title: e.title,
          url: e.url,
          domain: e.domain,
          snippet: e.snippet,
          sourceType: e.sourceType,
          publishedAt: e.publishedAt,
          credibilityScore: e.credibilityScore,
          citationIndex: e.citationIndex,
          analysisId: e.analysisId, // 保持分析关联
        }));

        await this.prisma.topicEvidence.createMany({
          data: evidencesCopyData,
        });

        this.logger.log(
          `[startExecution] ★ Copied ${previousReport.evidences.length} evidences from report ${previousReport.id.slice(0, 8)} to new report ${draftReport.id.slice(0, 8)}`,
        );
      }
    }

    // ★ v7.5: 使用动态调度器替代批量执行
    // 动态调度器会在每个任务完成后立即检查是否有新的可执行任务
    // 不再等待当前批次全部完成，实现真正的动态调度
    const maxConcurrentTasks = await this.calculateDynamicConcurrency();
    this.logger.log(
      `[startExecution] Starting dynamic scheduler with max concurrency ${maxConcurrentTasks}`,
    );

    await this.executeDynamicScheduler(missionId, maxConcurrentTasks, (task) =>
      this.executeTask(task, topic, missionId, draftReport.id),
    );

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

    // ★ 前置检查：任务开始前检查是否已被取消（防止竞态条件覆盖 FAILED 状态）
    // ★ 同时获取 leaderPlan 以查找 Agent 分配的模型
    const [currentTask, currentMission] = await Promise.all([
      this.prisma.researchTask.findUnique({
        where: { id: task.id },
        select: { status: true, modelId: true, skills: true, tools: true },
      }),
      this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { status: true, leaderPlan: true },
      }),
    ]);

    // 如果任务已被取消（状态为 FAILED）或任务不存在，直接返回
    if (!currentTask || currentTask.status === ResearchTaskStatus.FAILED) {
      this.logger.log(
        `[executeTask] Task ${task.id} was cancelled or not found, skipping execution`,
      );
      return;
    }

    // 如果 Mission 已被取消，直接返回
    if (
      !currentMission ||
      currentMission.status === ResearchMissionStatus.CANCELLED
    ) {
      this.logger.log(
        `[executeTask] Mission ${missionId} was cancelled, skipping task ${task.id}`,
      );
      return;
    }

    // 确定 Agent 角色
    const agentRole = this.getAgentRoleFromTaskType(task.taskType);
    const agentName = this.getAgentNameFromTaskType(task.taskType);

    // ★ 优先使用任务记录中的 modelId，fallback 到 leaderPlan 查找
    // 任务创建时已保存 modelId，直接使用更可靠
    const leaderPlan = currentMission?.leaderPlan as LeaderPlan | null;
    const agentAssignment = leaderPlan?.agentAssignments?.find(
      (a) => a.agentId === task.assignedAgent,
    );
    const assignedModelId =
      currentTask.modelId || task.modelId || agentAssignment?.modelId;

    // ★ 提取 Leader 分配的 skills 和 tools（优先从任务记录，fallback 到 agentAssignment）
    const assignedSkills =
      currentTask.skills?.length > 0
        ? currentTask.skills
        : agentAssignment?.skills || [];
    const assignedTools =
      currentTask.tools?.length > 0
        ? currentTask.tools
        : agentAssignment?.tools || [];

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

      // ★ 发送 Agent 工作状态事件（传递 missionId 以便持久化）
      await this.researchEventEmitter.emitAgentWorking(
        topic.id,
        {
          agentId: task.assignedAgent,
          agentName,
          agentRole,
          status: "working",
          taskDescription: task.title,
          dimensionId: task.dimensionId ?? undefined,
          dimensionName: task.dimensionName ?? undefined,
          progress: 0,
          modelId: assignedModelId, // ★ 传递模型 ID 用于显示
        },
        missionId,
      );

      let result: any;

      switch (task.taskType) {
        case "dimension_research": {
          // ★ 发送维度研究开始事件
          const dimensionName = task.dimensionName || task.title;
          await this.researchEventEmitter.emitDimensionResearchStarted(
            topic.id,
            dimensionName,
            agentName,
            missionId,
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

          // ★ v8.2: 如果在缓存的 topic.dimensions 中没找到，从数据库重新查询
          // 这处理 Leader 在 Mission 执行过程中创建新维度的情况
          if (!dimension && task.dimensionId) {
            this.logger.log(
              `[executeTask] Dimension not in cached topic, querying DB for ${task.dimensionId}`,
            );
            dimension = await this.prisma.topicDimension.findUnique({
              where: { id: task.dimensionId },
            });
          }

          if (dimension) {
            this.logger.log(
              `[executeTask] Found dimension: ${dimension.name} (${dimension.id})${assignedModelId ? `, model: ${assignedModelId}` : ""}`,
            );

            // ★ 发送进度事件：正在采集数据
            await this.researchEventEmitter.emitDimensionResearchProgress(
              topic.id,
              dimensionName,
              30,
              "正在采集相关数据...",
              missionId,
              task.id, // ★ 传递 taskId 用于前端精确匹配
            );

            // 使用新的 Leader-Agent 协作机制
            const missionResult =
              await this.dimensionMissionService.executeDimensionMission(
                topic,
                dimension,
                reportId, // ★ 传入 reportId 以便关联证据
                missionId, // ★ 传入 missionId 以便持久化团队消息
                assignedModelId, // ★ 传入 Leader 分配的模型
                task.id, // ★ 传入任务ID用于前端精确匹配进度
                assignedTools, // ★ 传入 Leader 分配的工具
                assignedSkills, // ★ 传入 Leader 分配的技能
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
              missionId,
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
              missionId,
            );
          }
          break;
        }

        case "quality_review": {
          // ★ 发送审核开始提示（传递 missionId 以便持久化）
          await this.researchEventEmitter.emitAgentWorking(
            topic.id,
            {
              agentId: task.assignedAgent,
              agentName: "质量审核员",
              agentRole: "reviewer",
              status: "working",
              taskDescription: "正在审核所有维度研究结果的质量...",
              progress: 10,
              modelId: assignedModelId, // ★ 传递模型 ID
            },
            missionId,
          );

          // ★ 获取所有已完成的维度研究结果及其维度信息
          const completedTasks = await this.prisma.researchTask.findMany({
            where: {
              missionId,
              taskType: "dimension_research",
              status: ResearchTaskStatus.COMPLETED,
            },
            include: {
              mission: {
                include: {
                  topic: {
                    include: {
                      dimensions: true,
                    },
                  },
                },
              },
            },
          });

          if (completedTasks.length === 0) {
            result = {
              reviewedTasks: 0,
              status: "skipped",
              feedback: "没有已完成的维度研究任务需要审核",
            };
            break;
          }

          // ★ 执行真正的 AI 质量审核
          const dimensionReviews = [];
          const dimensions = topic.dimensions || [];

          for (let i = 0; i < completedTasks.length; i++) {
            const completedTask = completedTasks[i];
            const dimension = dimensions.find(
              (d: { id: string }) => d.id === completedTask.dimensionId,
            );

            if (!dimension) continue;

            // 更新进度
            const reviewProgress = Math.round(
              10 + ((i + 1) / completedTasks.length) * 70,
            );
            await this.researchEventEmitter.emitAgentWorking(
              topic.id,
              {
                agentId: task.assignedAgent,
                agentName: "质量审核员",
                agentRole: "reviewer",
                status: "working",
                taskDescription: `正在审核维度「${dimension.name}」...`,
                progress: reviewProgress,
                modelId: assignedModelId,
              },
              missionId,
            );

            // 从任务结果中提取分析数据
            // DimensionMissionResult 包含 analysisResult?: DimensionAnalysisResult
            const missionResult = completedTask.result as {
              analysisResult?: DimensionAnalysisResult;
              evidenceIds?: string[];
            } | null;

            const analysisResult = missionResult?.analysisResult;

            // 如果没有分析结果，跳过审核
            if (!analysisResult) {
              this.logger.warn(
                `No analysis result found for dimension ${dimension.name}, skipping review`,
              );
              continue;
            }

            // 调用审核服务
            try {
              const review = await this.reviewerService.reviewDimension(
                topic,
                dimension,
                analysisResult,
                analysisResult.evidenceUsed || 0,
              );
              dimensionReviews.push(review);

              // ★ 记录维度审核结果到活动记录（供前端展示详细审核数据）
              await this.agentActivity.recordDimensionReview(
                topic.id,
                missionId,
                dimension.id,
                dimension.name,
                review,
              );
            } catch (error) {
              this.logger.warn(
                `Failed to review dimension ${dimension.name}: ${error}`,
              );
            }
          }

          // ★ 执行全局审核
          let overallReview = null;
          if (dimensionReviews.length > 0) {
            try {
              overallReview = await this.reviewerService.reviewOverall(
                topic,
                dimensions,
                dimensionReviews,
              );

              // ★ 记录整体审核结果到活动记录
              if (overallReview) {
                await this.agentActivity.recordOverallReview(
                  topic.id,
                  missionId,
                  overallReview,
                );
              }
            } catch (error) {
              this.logger.warn(`Failed to perform overall review: ${error}`);
            }
          }

          // 更新最终进度
          await this.researchEventEmitter.emitAgentWorking(
            topic.id,
            {
              agentId: task.assignedAgent,
              agentName: "质量审核员",
              agentRole: "reviewer",
              status: "working",
              taskDescription: "质量审核完成",
              progress: 100,
              modelId: assignedModelId,
            },
            missionId,
          );

          result = {
            reviewedTasks: completedTasks.length,
            dimensionReviews: dimensionReviews.map((r) => ({
              dimensionName: r.dimensionName,
              qualityLevel: r.qualityLevel,
              score: r.overallScore,
              issues: r.issues.length,
              suggestions: r.suggestions.slice(0, 3),
            })),
            overallReview: overallReview
              ? {
                  qualityLevel: overallReview.qualityLevel,
                  score: overallReview.overallScore,
                  recommendations: overallReview.recommendations.slice(0, 5),
                  needsReresearch: overallReview.needsReresearch,
                }
              : null,
            status: overallReview?.qualityLevel || "approved",
            feedback:
              overallReview?.recommendations?.join("; ") ||
              `已审核 ${completedTasks.length} 个维度研究结果`,
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
                    // ★ 新增：保存图表引用和生成图表
                    figureReferences: taskResult.figureReferences || [],
                    generatedCharts: taskResult.generatedCharts || [],
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

      // ★ 发送 Agent 完成事件（传递 missionId 以便持久化）
      await this.researchEventEmitter.emitAgentCompleted(
        topic.id,
        task.assignedAgent,
        agentName,
        `${task.title} 完成`,
        missionId,
        {
          dimensionId: task.dimensionId ?? undefined,
          dimensionName: task.dimensionName ?? undefined,
        }, // ★ 传入维度信息
      );

      // ★ 在更新状态前检查任务和 Mission 是否已被取消
      const [currentTaskStatus, currentMissionStatus] = await Promise.all([
        this.prisma.researchTask.findUnique({
          where: { id: task.id },
          select: { status: true },
        }),
        this.prisma.researchMission.findUnique({
          where: { id: missionId },
          select: { status: true },
        }),
      ]);

      // 如果任务已被取消（状态被设置为 FAILED），跳过更新
      if (
        currentTaskStatus?.status === ResearchTaskStatus.FAILED ||
        currentTaskStatus?.status === ResearchTaskStatus.COMPLETED
      ) {
        this.logger.log(
          `[executeTask] Task ${task.id} status already changed to ${currentTaskStatus.status}, skipping update`,
        );
        return;
      }

      // 如果 Mission 已被取消，跳过更新
      if (currentMissionStatus?.status === ResearchMissionStatus.CANCELLED) {
        this.logger.log(
          `[executeTask] Mission ${missionId} was cancelled during execution, skipping task ${task.id} completion`,
        );
        return;
      }

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
      // ★ 修复：从 result 中提取人类可读的摘要，而不是 JSON.stringify
      let summary: string;
      if (typeof result === "string") {
        summary = result.substring(0, 500);
      } else if (result?.summary) {
        // 优先使用 result.summary 字段
        summary = result.summary.substring(0, 500);
      } else if (result?.content) {
        // 其次使用 result.content 字段
        summary = result.content.substring(0, 500);
      } else {
        // 最后才使用简单描述
        summary = `研究完成`;
      }

      await this.updateTaskStatus(
        task.id,
        ResearchTaskStatus.COMPLETED,
        result,
        summary,
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
        undefined, // missionId
        task.modelId ?? undefined, // ★ 传入任务分配的模型 ID
      );

    if (!missionResult.success || !missionResult.analysisResult) {
      throw new Error(missionResult.error || "Dimension mission failed");
    }

    return missionResult.analysisResult;
  }

  /**
   * ★ 动态计算并发度
   * 根据可用 Provider 数量调整，每个 Provider 有独立的限流配额
   *
   * 逻辑：
   * - 单 Provider: 5 并发
   * - 2 Providers: 7 并发
   * - 3+ Providers: 9 并发
   * - 最大 10 并发（避免过度占用资源）
   */
  private async calculateDynamicConcurrency(): Promise<number> {
    const MIN_CONCURRENCY = 5;
    const MAX_CONCURRENCY = 10;

    try {
      // 获取所有启用的 CHAT 模型
      const models = await this.aiFacade.getAvailableModels(AIModelType.CHAT);

      // 统计唯一 Provider 数量
      const uniqueProviders = new Set(models.map((m) => m.provider));
      const providerCount = uniqueProviders.size;

      // 根据 Provider 数量计算并发度
      // 公式：基础 5 + 每多一个 Provider 增加 2，上限 10
      const concurrency = Math.min(
        MAX_CONCURRENCY,
        Math.max(MIN_CONCURRENCY, MIN_CONCURRENCY + (providerCount - 1) * 2),
      );

      this.logger.log(
        `[calculateDynamicConcurrency] ${providerCount} providers (${Array.from(uniqueProviders).join(", ")}) → concurrency=${concurrency}`,
      );

      return concurrency;
    } catch (error) {
      this.logger.warn(
        `[calculateDynamicConcurrency] Failed to get models, using default: ${error}`,
      );
      return MIN_CONCURRENCY;
    }
  }

  /**
   * 完成 Mission，更新最终状态
   */
  private async finalizeMission(
    missionId: string,
    topicId: string,
  ): Promise<void> {
    // ★ 先检查 Mission 当前状态，如果已被取消则不覆盖
    const currentMission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { status: true },
    });

    if (currentMission?.status === ResearchMissionStatus.CANCELLED) {
      this.logger.log(
        `[finalizeMission] Mission ${missionId} was cancelled, skipping finalization`,
      );
      return;
    }

    const tasks = await this.prisma.researchTask.findMany({
      where: { missionId },
    });

    const completedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    );
    const failedTasks = tasks.filter(
      (t) => t.status === ResearchTaskStatus.FAILED,
    );

    // ★ 改进的状态判断逻辑：
    // - 如果有任何成功的任务，标记为 COMPLETED（部分成功也算成功）
    // - 只有全部失败才标记为 FAILED
    // 这样用户可以看到部分成功的研究结果
    const hasAnySuccess = completedTasks.length > 0;
    const hasAnyFailure = failedTasks.length > 0;
    const finalStatus = hasAnySuccess
      ? ResearchMissionStatus.COMPLETED
      : ResearchMissionStatus.FAILED;

    await this.prisma.researchMission.update({
      where: { id: missionId },
      data: {
        status: finalStatus,
        completedTasks: completedTasks.length,
        progressPercent: 100,
        completedAt: new Date(),
      },
    });

    // ★ 只清理完全空的草稿报告（没有任何维度分析的）
    // 部分成功的报告应该保留，让用户看到已完成的研究
    if (!hasAnySuccess) {
      const emptyDraftReports = await this.prisma.topicReport.findMany({
        where: {
          topicId,
          dimensionAnalyses: { none: {} },
        },
        select: { id: true },
      });

      if (emptyDraftReports.length > 0) {
        const deleteIds = emptyDraftReports.map((r) => r.id);
        await this.prisma.topicReport.deleteMany({
          where: { id: { in: deleteIds } },
        });
        this.logger.log(
          `[finalizeMission] Cleaned up ${deleteIds.length} empty draft reports after complete failure`,
        );
      }
    }

    // ★ 构建更详细的状态消息
    let statusMessage: string;
    let phase: string;

    if (hasAnySuccess && !hasAnyFailure) {
      // 完全成功
      phase = "completed";
      statusMessage = `研究完成，共完成 ${completedTasks.length} 个任务`;
    } else if (hasAnySuccess && hasAnyFailure) {
      // 部分成功
      phase = "completed";
      statusMessage = `研究部分完成：${completedTasks.length} 个任务成功，${failedTasks.length} 个任务失败`;
    } else {
      // 完全失败
      phase = "failed";
      statusMessage = `研究失败，${failedTasks.length} 个任务全部失败`;
    }

    // 发送完成事件
    this.emitProgress({
      missionId,
      topicId,
      status: finalStatus,
      progress: 100,
      phase,
      message: statusMessage,
      completedTasks: completedTasks.length,
      totalTasks: tasks.length,
    });

    this.logger.log(
      `[finalizeMission] Mission ${missionId} finalized: ${statusMessage}`,
    );
  }

  /**
   * ★ v7.5: 动态任务调度器
   *
   * 核心改进：每完成一个任务就立即检查是否有新的可执行任务
   * 不再等待当前批次全部完成，实现真正的动态调度
   *
   * @param missionId Mission ID
   * @param maxConcurrent 最大并发数
   * @param executor 任务执行函数
   */
  private async executeDynamicScheduler(
    missionId: string,
    maxConcurrent: number,
    executor: (task: ResearchTask) => Promise<void>,
  ): Promise<void> {
    const executingTasks = new Map<string, Promise<void>>();
    const completedTaskIds = new Set<string>();

    // ★ 主调度循环
    while (true) {
      // 0. 检查 Mission 是否被取消
      const mission = await this.prisma.researchMission.findUnique({
        where: { id: missionId },
        select: { status: true },
      });
      if (
        !mission ||
        mission.status === ResearchMissionStatus.CANCELLED ||
        mission.status === ResearchMissionStatus.FAILED
      ) {
        this.logger.log(
          `[dynamicScheduler] Mission ${missionId} cancelled/failed, stopping`,
        );
        break;
      }

      // 1. 获取当前可执行的任务（依赖已满足的 PENDING 任务）
      const executableTasks = await this.getExecutableTasks(missionId);

      // 过滤掉已完成或正在执行的任务
      const newTasks = executableTasks.filter(
        (t) => !completedTaskIds.has(t.id) && !executingTasks.has(t.id),
      );

      // 2. 如果有空闲槽位，启动新任务
      const availableSlots = maxConcurrent - executingTasks.size;
      const tasksToStart = newTasks.slice(0, availableSlots);

      for (const task of tasksToStart) {
        this.logger.log(
          `[dynamicScheduler] Starting task: ${task.title} (${task.id}), ` +
            `active: ${executingTasks.size + 1}/${maxConcurrent}`,
        );

        // 创建任务执行 Promise
        const taskPromise = executor(task)
          .then(() => {
            this.logger.log(
              `[dynamicScheduler] Task completed: ${task.title} (${task.id})`,
            );
          })
          .catch((error) => {
            this.logger.error(
              `[dynamicScheduler] Task failed: ${task.title} (${task.id}): ${error.message}`,
            );
          })
          .finally(() => {
            // 任务完成后从执行列表移除
            executingTasks.delete(task.id);
            completedTaskIds.add(task.id);
          });

        executingTasks.set(task.id, taskPromise);
      }

      // 3. 检查是否需要退出循环
      if (executingTasks.size === 0) {
        // 没有正在执行的任务，检查是否还有待处理的
        const remainingPending = await this.prisma.researchTask.count({
          where: {
            missionId,
            status: ResearchTaskStatus.PENDING,
          },
        });

        if (remainingPending === 0) {
          this.logger.log(
            `[dynamicScheduler] No more tasks to execute, exiting scheduler`,
          );
          break;
        }

        // 还有待处理任务但依赖未满足，等待一下再检查
        this.logger.log(
          `[dynamicScheduler] Waiting for dependencies, ${remainingPending} tasks pending`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // 4. 等待任意一个任务完成，然后立即检查是否有新的可执行任务
      await Promise.race(executingTasks.values());

      // 短暂延迟，让数据库状态稳定
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 5. 等待所有剩余任务完成
    if (executingTasks.size > 0) {
      this.logger.log(
        `[dynamicScheduler] Waiting for ${executingTasks.size} remaining tasks`,
      );
      await Promise.all(executingTasks.values());
    }
  }

  /**
   * ★ v7.3: 恢复执行新添加的任务
   *
   * 当用户在 Mission 完成后添加新任务时调用此方法
   * 会重新激活 Mission 并执行待处理的任务
   *
   * @param missionId Mission ID
   * @param topicId Topic ID
   * @returns 是否成功触发执行
   */
  async resumeExecutionForNewTask(
    missionId: string,
    topicId: string,
  ): Promise<boolean> {
    this.logger.log(
      `[resumeExecutionForNewTask] Checking mission ${missionId} for new task execution`,
    );

    // 1. 检查 Mission 状态
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      select: { status: true },
    });

    if (!mission) {
      this.logger.warn(
        `[resumeExecutionForNewTask] Mission ${missionId} not found`,
      );
      return false;
    }

    // 2. 如果 Mission 正在执行中，循环会自动拾取新任务，无需处理
    if (mission.status === ResearchMissionStatus.EXECUTING) {
      this.logger.log(
        `[resumeExecutionForNewTask] Mission ${missionId} is still executing, loop will pick up new task`,
      );
      return true;
    }

    // 3. 如果 Mission 已完成或失败，检查是否有待执行的任务
    if (
      mission.status === ResearchMissionStatus.COMPLETED ||
      mission.status === ResearchMissionStatus.FAILED
    ) {
      const pendingTasks = await this.prisma.researchTask.findMany({
        where: {
          missionId,
          status: ResearchTaskStatus.PENDING,
        },
        orderBy: { priority: "asc" },
      });

      if (pendingTasks.length === 0) {
        this.logger.log(
          `[resumeExecutionForNewTask] No pending tasks for mission ${missionId}`,
        );
        return false;
      }

      this.logger.log(
        `[resumeExecutionForNewTask] Found ${pendingTasks.length} pending tasks, restarting execution`,
      );

      // 4. 更新 Mission 状态为 EXECUTING
      await this.prisma.researchMission.update({
        where: { id: missionId },
        data: { status: ResearchMissionStatus.EXECUTING },
      });

      // 5. 发送状态更新事件
      await this.researchEventEmitter.emitMissionProgress(topicId, {
        missionId,
        progress: 0,
        phase: "resuming",
        message: `恢复执行 ${pendingTasks.length} 个新任务`,
        completedTasks: 0,
        totalTasks: pendingTasks.length,
      });

      // 6. 异步启动执行循环
      this.startExecution(missionId, topicId).catch((err) => {
        this.logger.error(
          `[resumeExecutionForNewTask] Execution failed: ${err}`,
        );
      });

      return true;
    }

    // 其他状态（CANCELLED）不处理
    this.logger.log(
      `[resumeExecutionForNewTask] Mission ${missionId} status is ${mission.status}, not resuming`,
    );
    return false;
  }

  // ==================== Phase 5: Recovery Methods ====================

  /**
   * ★ Phase 5: 事件监听器 - 处理恢复事件
   * 当 HealthService 检测到需要恢复的任务时，会发出此事件
   */
  @OnEvent("research.mission.recovery_needed")
  async handleRecoveryNeeded(payload: {
    missionId: string;
    topicId: string;
    resetTaskCount: number;
  }): Promise<void> {
    const { missionId, resetTaskCount } = payload;
    this.logger.log(
      `[handleRecoveryNeeded] Received recovery event for mission ${missionId}, ` +
        `${resetTaskCount} tasks were reset`,
    );

    try {
      await this.continueExecution(missionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[handleRecoveryNeeded] Failed to continue execution: ${errorMessage}`,
      );
    }
  }

  /**
   * ★ Phase 5: 继续执行被中断的 Mission
   *
   * 用于服务重启后自动恢复被中断的任务：
   * 1. 验证 Mission 存在且状态为 EXECUTING
   * 2. 将 EXECUTING 状态的任务重置为 PENDING（它们可能在执行中被中断）
   * 3. 调用 startExecution 继续执行
   *
   * @param missionId 要恢复的 Mission ID
   * @returns Promise<void>
   * @throws Error 如果 Mission 不存在或状态不正确
   */
  async continueExecution(missionId: string): Promise<void> {
    this.logger.log(
      `[continueExecution] Attempting to continue mission ${missionId}`,
    );

    // 1. 查询 Mission 及其相关信息
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        topic: true,
        tasks: {
          where: { status: ResearchTaskStatus.EXECUTING },
        },
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    if (mission.status !== ResearchMissionStatus.EXECUTING) {
      throw new Error(
        `Mission ${missionId} is not in EXECUTING status (current: ${mission.status})`,
      );
    }

    // 2. 将 EXECUTING 状态的任务重置为 PENDING
    // 这些任务在服务重启前可能正在执行，需要重新执行
    if (mission.tasks.length > 0) {
      const taskIds = mission.tasks.map((t) => t.id);
      await this.prisma.researchTask.updateMany({
        where: { id: { in: taskIds } },
        data: {
          status: ResearchTaskStatus.PENDING,
          startedAt: null, // 重置开始时间
        },
      });
      this.logger.log(
        `[continueExecution] Reset ${taskIds.length} EXECUTING tasks to PENDING`,
      );
    }

    // 3. 发送恢复进度事件
    const completedCount = await this.prisma.researchTask.count({
      where: { missionId, status: ResearchTaskStatus.COMPLETED },
    });
    const totalCount = await this.prisma.researchTask.count({
      where: { missionId },
    });
    const progress =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    await this.researchEventEmitter.emitMissionProgress(mission.topicId, {
      missionId,
      progress,
      phase: "executing",
      message: `任务已恢复，继续执行... (${completedCount}/${totalCount})`,
      completedTasks: completedCount,
      totalTasks: totalCount,
    });

    this.logger.log(
      `[continueExecution] Resuming mission ${missionId} for topic ${mission.topicId}, ` +
        `progress: ${completedCount}/${totalCount} (${progress}%)`,
    );

    // 4. 异步启动执行（不阻塞）
    this.startExecution(missionId, mission.topicId).catch((err) => {
      this.logger.error(
        `[continueExecution] Failed to continue execution: ${err.message}`,
      );
      // 更新状态为失败
      this.prisma.researchMission
        .update({
          where: { id: missionId },
          data: { status: ResearchMissionStatus.FAILED },
        })
        .catch((updateErr) => {
          this.logger.error(
            `[continueExecution] Failed to mark mission as FAILED: ${updateErr.message}`,
          );
        });
    });
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
          leaderPlan: leaderPlan as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `[addAgentToLeaderPlan] Failed to update leaderPlan: ${error}`,
      );
      // 不抛出异常，避免影响主流程
    }
  }
}
