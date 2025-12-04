import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  MissionStatus,
  AgentTaskStatus,
  TaskPriority,
  TaskType,
  MissionLogType,
  MessageContentType,
} from "@prisma/client";
import { CreateMissionDto } from "./dto/create-mission.dto";
import { AiChatService } from "../ai/ai-chat.service";
import { AiGroupGateway } from "./ai-group.gateway";

interface TaskBreakdownItem {
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  reason: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  taskType: string;
  dependsOn: number[]; // 依赖的任务索引
}

interface TaskBreakdown {
  understanding: string;
  tasks: TaskBreakdownItem[];
  executionPlan: string;
  risks: string;
}

@Injectable()
export class TeamMissionService {
  private readonly logger = new Logger(TeamMissionService.name);

  constructor(
    private prisma: PrismaService,
    private aiChatService: AiChatService,
    private aiGroupGateway: AiGroupGateway,
  ) {}

  /**
   * Get AI model config from database by model identifier
   */
  private async getModelConfig(aiModel: string) {
    const modelConfig = await this.prisma.aIModel.findFirst({
      where: {
        OR: [
          { modelId: { equals: aiModel, mode: "insensitive" } },
          { name: { equals: aiModel, mode: "insensitive" } },
        ],
        isEnabled: true,
      },
    });

    if (!modelConfig) {
      this.logger.warn(`Model config not found for: ${aiModel}`);
      return null;
    }

    return modelConfig;
  }

  /**
   * Call AI with database API key
   */
  private async callAIWithConfig(
    aiModel: string,
    messages: { role: string; content: string }[],
    systemPrompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ) {
    const modelConfig = await this.getModelConfig(aiModel);

    if (modelConfig && modelConfig.apiKey) {
      // Use database API key
      return this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey,
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        systemPrompt,
        messages: messages as any,
        maxTokens: options?.maxTokens ?? 4000,
        temperature: options?.temperature ?? 0.7,
      });
    }

    // Fallback to environment variable based method
    return this.aiChatService.generateChatCompletion({
      model: aiModel,
      messages: messages as any,
      systemPrompt,
      maxTokens: options?.maxTokens ?? 4000,
      temperature: options?.temperature ?? 0.7,
    });
  }

  // ==================== 创建团队任务 ====================

  async createMission(topicId: string, userId: string, dto: CreateMissionDto) {
    this.logger.log(`Creating mission in topic ${topicId}: ${dto.title}`);

    // 验证 Leader 存在且是该 Topic 的成员
    const leader = await this.prisma.topicAIMember.findFirst({
      where: {
        id: dto.leaderId,
        topicId,
      },
    });

    if (!leader) {
      throw new NotFoundException("指定的 Leader 不存在于该讨论组");
    }

    // 创建任务
    const mission = await this.prisma.teamMission.create({
      data: {
        topicId,
        title: dto.title,
        description: dto.description,
        objectives: dto.objectives || [],
        constraints: dto.constraints || [],
        deliverables: dto.deliverables || [],
        leaderId: dto.leaderId,
        createdById: userId,
        status: MissionStatus.PENDING,
      },
      include: {
        leader: true,
        createdBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });

    // 记录日志
    await this.createLog(mission.id, {
      type: MissionLogType.MISSION_CREATED,
      agentId: leader.id,
      agentName: leader.agentName || leader.displayName,
      content: `任务「${dto.title}」已创建，指定 ${leader.agentName || leader.displayName} 为 Leader`,
    });

    // 发送系统消息到群聊
    const systemMessage = await this.sendMessageToTopic(
      topicId,
      null,
      `🚀 **团队任务已创建**\n\n**任务**：${dto.title}\n**Leader**：@${leader.agentName || leader.displayName}\n\n任务即将开始规划...`,
      MessageContentType.SYSTEM,
    );

    // 广播任务创建事件
    this.aiGroupGateway.emitToTopic(topicId, "mission:created", {
      mission,
      messageId: systemMessage?.id,
    });

    // 如果自动开始（默认），则启动任务
    if (dto.autoStart !== false) {
      // 异步启动，不阻塞返回
      this.startMission(mission.id, userId).catch((err) => {
        this.logger.error(`Failed to start mission ${mission.id}: ${err}`);
      });
    }

    return mission;
  }

  // ==================== 启动任务（Leader 规划） ====================

  async startMission(missionId: string, _userId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
      include: {
        leader: true,
        topic: {
          include: {
            aiMembers: true,
          },
        },
      },
    });

    if (!mission) {
      throw new NotFoundException("任务不存在");
    }

    if (mission.status !== MissionStatus.PENDING) {
      throw new BadRequestException("任务已经启动或已完成");
    }

    // 更新状态为规划中
    await this.prisma.teamMission.update({
      where: { id: missionId },
      data: {
        status: MissionStatus.PLANNING,
        startedAt: new Date(),
      },
    });

    await this.createLog(missionId, {
      type: MissionLogType.PLANNING_STARTED,
      agentId: mission.leader.id,
      agentName: mission.leader.agentName || mission.leader.displayName,
      content: "Leader 开始规划任务分解...",
    });

    // 广播状态变更
    this.aiGroupGateway.emitToTopic(mission.topicId, "mission:status_changed", {
      missionId,
      status: MissionStatus.PLANNING,
      previousStatus: MissionStatus.PENDING,
    });

    // 发送 Leader 正在思考的消息
    await this.sendMessageToTopic(
      mission.topicId,
      mission.leader.id,
      `[任务分解]\n\n收到任务！正在分析需求并进行任务分解...`,
      MessageContentType.TEXT,
    );

    // 执行 Leader 任务规划
    await this.executeLeaderPlanning(mission);
  }

  // ==================== Leader 规划任务 ====================

  private async executeLeaderPlanning(mission: any) {
    const { leader, topic } = mission;
    const teamMembers = topic.aiMembers;

    try {
      // 构建 Leader 规划提示词
      const planningPrompt = this.buildLeaderPlanningPrompt(
        mission,
        leader,
        teamMembers,
      );

      // 调用 AI 生成任务分解 (使用数据库 API Key)
      const aiResponse = await this.callAIWithConfig(
        leader.aiModel,
        [{ role: "user", content: planningPrompt }],
        this.getLeaderSystemPrompt(leader),
        { maxTokens: 4000, temperature: 0.7 },
      );

      // 解析任务分解结果
      const breakdown = this.parseTaskBreakdown(
        aiResponse.content,
        teamMembers,
      );

      // 保存任务分解方案
      await this.prisma.teamMission.update({
        where: { id: mission.id },
        data: {
          taskBreakdown: breakdown as any,
        },
      });

      // 发送任务分解消息到群聊
      const planningMessage = await this.sendMessageToTopic(
        mission.topicId,
        leader.id,
        aiResponse.content,
        MessageContentType.TEXT,
      );

      await this.createLog(mission.id, {
        type: MissionLogType.PLANNING_COMPLETED,
        agentId: leader.id,
        agentName: leader.agentName || leader.displayName,
        content: `任务分解完成，共 ${breakdown.tasks.length} 个子任务`,
        messageId: planningMessage?.id,
      });

      // 创建子任务
      await this.createTasksFromBreakdown(mission.id, breakdown, teamMembers);

      // 更新状态为执行中
      await this.prisma.teamMission.update({
        where: { id: mission.id },
        data: {
          status: MissionStatus.IN_PROGRESS,
          totalTasks: breakdown.tasks.length,
        },
      });

      // 广播状态变更
      this.aiGroupGateway.emitToTopic(
        mission.topicId,
        "mission:status_changed",
        {
          missionId: mission.id,
          status: MissionStatus.IN_PROGRESS,
          previousStatus: MissionStatus.PLANNING,
          totalTasks: breakdown.tasks.length,
        },
      );

      // 开始执行任务
      await this.executeNextTasks(mission.id);
    } catch (error) {
      this.logger.error(`Leader planning failed: ${error}`);

      await this.prisma.teamMission.update({
        where: { id: mission.id },
        data: { status: MissionStatus.FAILED },
      });

      await this.sendMessageToTopic(
        mission.topicId,
        leader.id,
        `❌ 任务规划失败：${error instanceof Error ? error.message : "未知错误"}`,
        MessageContentType.TEXT,
      );
    }
  }

  // ==================== 执行下一批任务 ====================

  private async executeNextTasks(missionId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
      include: {
        tasks: {
          include: {
            assignedTo: true,
          },
        },
        leader: true,
      },
    });

    if (!mission || mission.status !== MissionStatus.IN_PROGRESS) {
      return;
    }

    // 找出所有可以开始的任务（依赖已完成）
    const pendingTasks = mission.tasks.filter(
      (t) => t.status === AgentTaskStatus.PENDING,
    );

    const tasksToStart: typeof pendingTasks = [];

    for (const task of pendingTasks) {
      const dependsOnIds = task.dependsOnIds || [];

      // 检查所有依赖是否已完成
      const allDependenciesCompleted = dependsOnIds.every((depId) => {
        const depTask = mission.tasks.find((t) => t.id === depId);
        return depTask?.status === AgentTaskStatus.COMPLETED;
      });

      if (allDependenciesCompleted) {
        tasksToStart.push(task);
      }
    }

    if (tasksToStart.length === 0) {
      // 检查是否所有任务都已完成
      const allCompleted = mission.tasks.every(
        (t) => t.status === AgentTaskStatus.COMPLETED,
      );

      if (allCompleted) {
        await this.completeMission(missionId);
      }
      return;
    }

    // 发送任务分配消息
    for (const task of tasksToStart) {
      await this.sendMessageToTopic(
        mission.topicId,
        null,
        `📋 [任务分配] 任务「${task.title}」已分配给 @${task.assignedTo.agentName || task.assignedTo.displayName}`,
        MessageContentType.SYSTEM,
      );
    }

    // 并行执行所有可开始的任务
    await Promise.all(
      tasksToStart.map((task) => this.executeTask(mission, task)),
    );
  }

  // ==================== 执行单个任务 ====================

  private async executeTask(mission: any, task: any) {
    const { assignedTo } = task;

    try {
      // 更新任务状态
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      await this.createLog(mission.id, {
        type: MissionLogType.TASK_STARTED,
        agentId: assignedTo.id,
        agentName: assignedTo.agentName || assignedTo.displayName,
        taskId: task.id,
        taskTitle: task.title,
        content: `开始执行任务「${task.title}」`,
      });

      // 发送开始工作消息
      await this.sendMessageToTopic(
        mission.topicId,
        assignedTo.id,
        `[开始工作]\n\n收到任务「${task.title}」，开始执行...`,
        MessageContentType.TEXT,
      );

      // 广播 Agent 工作状态
      this.aiGroupGateway.emitToTopic(mission.topicId, "agent:working", {
        missionId: mission.id,
        taskId: task.id,
        agentId: assignedTo.id,
        agentName: assignedTo.agentName || assignedTo.displayName,
        status: "started",
      });

      // 构建任务执行提示词
      const taskPrompt = this.buildTaskExecutionPrompt(mission, task);

      // 调用 AI 执行任务 (使用数据库 API Key)
      const aiResponse = await this.callAIWithConfig(
        assignedTo.aiModel,
        [{ role: "user", content: taskPrompt }],
        this.getAgentSystemPrompt(assignedTo, task),
        { maxTokens: 4000, temperature: 0.7 },
      );

      // 发送工作汇报消息
      const leaderName = mission.leader.agentName || mission.leader.displayName;
      const resultMessage = await this.sendMessageToTopic(
        mission.topicId,
        assignedTo.id,
        `[工作汇报]\n\n@${leaderName} 任务「${task.title}」已完成！\n\n${aiResponse.content}`,
        MessageContentType.TEXT,
      );

      // 更新任务结果
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.AWAITING_REVIEW,
          result: aiResponse.content,
          resultMessageId: resultMessage?.id,
        },
      });

      await this.createLog(mission.id, {
        type: MissionLogType.TASK_COMPLETED,
        agentId: assignedTo.id,
        agentName: assignedTo.agentName || assignedTo.displayName,
        taskId: task.id,
        taskTitle: task.title,
        content: `任务「${task.title}」执行完成，等待 Leader 审核`,
        messageId: resultMessage?.id,
      });

      // 广播任务完成
      this.aiGroupGateway.emitToTopic(mission.topicId, "task:completed", {
        missionId: mission.id,
        taskId: task.id,
        agentId: assignedTo.id,
      });

      // Leader 审核
      await this.leaderReviewTask(mission, task, aiResponse.content);
    } catch (error) {
      this.logger.error(`Task execution failed: ${error}`);

      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { status: AgentTaskStatus.BLOCKED },
      });

      await this.sendMessageToTopic(
        mission.topicId,
        assignedTo.id,
        `❌ 任务执行出错：${error instanceof Error ? error.message : "未知错误"}`,
        MessageContentType.TEXT,
      );
    }
  }

  // ==================== Leader 审核任务 ====================

  private async leaderReviewTask(mission: any, task: any, taskResult: string) {
    const { leader } = mission;

    try {
      // 构建审核提示词
      const reviewPrompt = this.buildLeaderReviewPrompt(
        mission,
        task,
        taskResult,
      );

      // 调用 AI 进行审核 (使用数据库 API Key)
      const aiResponse = await this.callAIWithConfig(
        leader.aiModel,
        [{ role: "user", content: reviewPrompt }],
        this.getLeaderSystemPrompt(leader),
        { maxTokens: 1500, temperature: 0.5 },
      );

      // 解析审核结果
      const isApproved = this.parseReviewResult(aiResponse.content);

      // 发送 Leader 反馈消息
      const agentName =
        task.assignedTo.agentName || task.assignedTo.displayName;
      const feedbackMessage = await this.sendMessageToTopic(
        mission.topicId,
        leader.id,
        `[Leader反馈]\n\n@${agentName} ${aiResponse.content}`,
        MessageContentType.TEXT,
      );

      await this.createLog(mission.id, {
        type: MissionLogType.LEADER_FEEDBACK,
        agentId: leader.id,
        agentName: leader.agentName || leader.displayName,
        taskId: task.id,
        taskTitle: task.title,
        content: isApproved ? "任务审核通过" : "任务需要修改",
        messageId: feedbackMessage?.id,
      });

      if (isApproved) {
        // 审核通过
        await this.prisma.agentTask.update({
          where: { id: task.id },
          data: {
            status: AgentTaskStatus.COMPLETED,
            completedAt: new Date(),
            leaderFeedback: aiResponse.content,
            feedbackMessageId: feedbackMessage?.id,
          },
        });

        // 更新任务进度
        await this.updateMissionProgress(mission.id);

        // 执行下一批任务
        await this.executeNextTasks(mission.id);
      } else {
        // 需要修改
        const currentRevisions = task.revisionCount || 0;

        if (currentRevisions >= task.maxRevisions) {
          // 超过最大修改次数，强制通过
          await this.prisma.agentTask.update({
            where: { id: task.id },
            data: {
              status: AgentTaskStatus.COMPLETED,
              completedAt: new Date(),
              leaderFeedback:
                aiResponse.content + "\n\n（已达最大修改次数，强制通过）",
            },
          });

          await this.updateMissionProgress(mission.id);
          await this.executeNextTasks(mission.id);
        } else {
          // 要求修改
          await this.prisma.agentTask.update({
            where: { id: task.id },
            data: {
              status: AgentTaskStatus.REVISION_NEEDED,
              needsRevision: true,
              revisionCount: currentRevisions + 1,
              leaderFeedback: aiResponse.content,
              feedbackMessageId: feedbackMessage?.id,
            },
          });

          // 触发修改
          await this.executeTaskRevision(mission, task, aiResponse.content);
        }
      }
    } catch (error) {
      this.logger.error(`Leader review failed: ${error}`);

      // 审核失败时直接通过
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await this.updateMissionProgress(mission.id);
      await this.executeNextTasks(mission.id);
    }
  }

  // ==================== 执行任务修改 ====================

  private async executeTaskRevision(mission: any, task: any, feedback: string) {
    const { assignedTo } = task;

    // 重新获取最新任务数据
    const latestTask = await this.prisma.agentTask.findUnique({
      where: { id: task.id },
      include: { assignedTo: true },
    });

    if (!latestTask) return;

    try {
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { status: AgentTaskStatus.IN_PROGRESS },
      });

      // 发送修改开始消息
      await this.sendMessageToTopic(
        mission.topicId,
        assignedTo.id,
        `[任务修改]\n\n收到 Leader 的反馈，正在修改...`,
        MessageContentType.TEXT,
      );

      // 构建修改提示词
      const revisionPrompt = this.buildTaskRevisionPrompt(
        mission,
        latestTask,
        feedback,
      );

      // 调用 AI 执行修改 (使用数据库 API Key)
      const aiResponse = await this.callAIWithConfig(
        assignedTo.aiModel,
        [{ role: "user", content: revisionPrompt }],
        this.getAgentSystemPrompt(assignedTo, latestTask),
        { maxTokens: 4000, temperature: 0.7 },
      );

      // 发送修改后的汇报
      const leaderName = mission.leader.agentName || mission.leader.displayName;
      const resultMessage = await this.sendMessageToTopic(
        mission.topicId,
        assignedTo.id,
        `[工作汇报]\n\n@${leaderName} 已根据反馈修改完成！\n\n${aiResponse.content}`,
        MessageContentType.TEXT,
      );

      // 更新任务
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.AWAITING_REVIEW,
          result: aiResponse.content,
          resultMessageId: resultMessage?.id,
          needsRevision: false,
        },
      });

      await this.createLog(mission.id, {
        type: MissionLogType.TASK_REVISION,
        agentId: assignedTo.id,
        agentName: assignedTo.agentName || assignedTo.displayName,
        taskId: task.id,
        taskTitle: task.title,
        content: `任务修改完成（第 ${latestTask.revisionCount} 次修改）`,
        messageId: resultMessage?.id,
      });

      // 再次审核
      await this.leaderReviewTask(mission, latestTask, aiResponse.content);
    } catch (error) {
      this.logger.error(`Task revision failed: ${error}`);

      // 修改失败时强制通过
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await this.updateMissionProgress(mission.id);
      await this.executeNextTasks(mission.id);
    }
  }

  // ==================== 完成任务 ====================

  private async completeMission(missionId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
      include: {
        leader: true,
        tasks: {
          include: { assignedTo: true },
        },
      },
    });

    if (!mission) return;

    try {
      // 更新状态为审核中
      await this.prisma.teamMission.update({
        where: { id: missionId },
        data: { status: MissionStatus.REVIEW },
      });

      // 发送整合开始消息
      await this.sendMessageToTopic(
        mission.topicId,
        mission.leader.id,
        `[结果整合]\n\n所有子任务已完成，正在整合最终成果...`,
        MessageContentType.TEXT,
      );

      // 构建整合提示词
      const synthesisPrompt = this.buildLeaderSynthesisPrompt(mission);

      // 调用 AI 生成最终结果 (使用数据库 API Key)
      const aiResponse = await this.callAIWithConfig(
        mission.leader.aiModel,
        [{ role: "user", content: synthesisPrompt }],
        this.getLeaderSystemPrompt(mission.leader),
        { maxTokens: 6000, temperature: 0.7 },
      );

      // 发送最终交付消息
      const finalMessage = await this.sendMessageToTopic(
        mission.topicId,
        mission.leader.id,
        `[最终交付]\n\n🎉 任务完成！\n\n${aiResponse.content}`,
        MessageContentType.TEXT,
      );

      // 更新任务为已完成
      await this.prisma.teamMission.update({
        where: { id: missionId },
        data: {
          status: MissionStatus.COMPLETED,
          completedAt: new Date(),
          finalResult: aiResponse.content,
          progressPercent: 100,
        },
      });

      await this.createLog(missionId, {
        type: MissionLogType.MISSION_COMPLETED,
        agentId: mission.leader.id,
        agentName: mission.leader.agentName || mission.leader.displayName,
        content: "任务已完成，最终成果已交付",
        messageId: finalMessage?.id,
      });

      // 广播任务完成
      this.aiGroupGateway.emitToTopic(mission.topicId, "mission:completed", {
        missionId,
        finalResult: aiResponse.content,
      });
    } catch (error) {
      this.logger.error(`Mission completion failed: ${error}`);

      await this.prisma.teamMission.update({
        where: { id: missionId },
        data: { status: MissionStatus.FAILED },
      });
    }
  }

  // ==================== 辅助方法 ====================

  private async updateMissionProgress(missionId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
      include: { tasks: true },
    });

    if (!mission) return;

    const completedCount = mission.tasks.filter(
      (t) => t.status === AgentTaskStatus.COMPLETED,
    ).length;
    const totalCount = mission.tasks.length;
    const progressPercent =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    await this.prisma.teamMission.update({
      where: { id: missionId },
      data: {
        completedTasks: completedCount,
        progressPercent,
      },
    });

    // 广播进度更新
    this.aiGroupGateway.emitToTopic(
      mission.topicId,
      "mission:progress_updated",
      {
        missionId,
        completedTasks: completedCount,
        totalTasks: totalCount,
        progressPercent,
      },
    );
  }

  private async createLog(
    missionId: string,
    data: {
      type: MissionLogType;
      agentId?: string;
      agentName?: string;
      taskId?: string;
      taskTitle?: string;
      content: string;
      messageId?: string;
      metadata?: any;
    },
  ) {
    return this.prisma.missionLog.create({
      data: {
        missionId,
        ...data,
      },
    });
  }

  private async sendMessageToTopic(
    topicId: string,
    aiMemberId: string | null,
    content: string,
    contentType: MessageContentType,
  ) {
    try {
      const message = await this.prisma.topicMessage.create({
        data: {
          topicId,
          aiMemberId,
          content,
          contentType,
        },
        include: {
          aiMember: {
            select: {
              id: true,
              displayName: true,
              agentName: true,
              avatar: true,
              aiModel: true,
            },
          },
        },
      });

      // 广播新消息
      this.aiGroupGateway.emitToTopic(topicId, "message:new", message);

      return message;
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`);
      return null;
    }
  }

  private async createTasksFromBreakdown(
    missionId: string,
    breakdown: TaskBreakdown,
    teamMembers: any[],
  ) {
    const taskIdMap = new Map<number, string>(); // 任务索引 -> 任务ID

    for (let i = 0; i < breakdown.tasks.length; i++) {
      const taskItem = breakdown.tasks[i];

      // 找到分配的成员
      let assignee = teamMembers.find((m) => m.id === taskItem.assigneeId);
      if (!assignee) {
        // 如果找不到，使用第一个成员
        assignee = teamMembers[0];
      }

      // 将依赖的索引转换为任务ID
      const dependsOnIds = taskItem.dependsOn
        .map((idx) => taskIdMap.get(idx))
        .filter((id): id is string => !!id);

      const task = await this.prisma.agentTask.create({
        data: {
          missionId,
          title: taskItem.title,
          description: taskItem.description,
          priority: taskItem.priority as TaskPriority,
          taskType: this.mapTaskType(taskItem.taskType),
          assignedToId: assignee.id,
          assignedReason: taskItem.reason,
          dependsOnIds,
          status: AgentTaskStatus.PENDING,
        },
      });

      taskIdMap.set(i, task.id);
    }
  }

  private mapTaskType(type: string): TaskType {
    const mapping: Record<string, TaskType> = {
      research: TaskType.RESEARCH,
      design: TaskType.DESIGN,
      implementation: TaskType.IMPLEMENTATION,
      review: TaskType.REVIEW,
      documentation: TaskType.DOCUMENTATION,
      coordination: TaskType.COORDINATION,
      creative: TaskType.CREATIVE,
      synthesis: TaskType.SYNTHESIS,
    };
    return mapping[type.toLowerCase()] || TaskType.IMPLEMENTATION;
  }

  // ==================== 提示词构建 ====================

  private buildLeaderPlanningPrompt(
    mission: any,
    leader: any,
    teamMembers: any[],
  ): string {
    const membersInfo = teamMembers
      .map(
        (m) =>
          `- ${m.agentName || m.displayName}（${m.agentIdentity || m.roleDescription || "团队成员"}）
  擅长领域：${(m.expertiseAreas || []).join("、") || "通用"}
  工作风格：${m.workStyle || "自主型"}
  AI模型：${m.aiModel}`,
      )
      .join("\n");

    return `你是团队的 Leader「${leader.agentName || leader.displayName}」。

【你的团队成员】
${membersInfo}

【用户任务】
标题：${mission.title}
描述：${mission.description}
${mission.objectives?.length ? `目标：${mission.objectives.join("、")}` : ""}
${mission.constraints?.length ? `约束：${mission.constraints.join("、")}` : ""}
${mission.deliverables?.length ? `期望交付物：${mission.deliverables.join("、")}` : ""}

【你的职责】
请分析任务并进行分解，输出格式如下：

## 任务理解
[2-3句话描述你对任务的理解]

## 任务分解
| # | 任务名称 | 负责人 | 分配理由 | 优先级 | 依赖 |
|---|----------|--------|----------|--------|------|
| 1 | ... | @成员名 | ... | 高/中/低 | 无 |
| 2 | ... | @成员名 | ... | 高/中/低 | 任务1 |
（继续添加更多任务...）

## 执行计划
- 第一阶段：[并行执行的任务]
- 第二阶段：[依赖完成后执行的任务]
（根据实际情况添加更多阶段）

## 风险提示
[可能的风险和应对方案]

【注意事项】
- 根据每个成员的擅长领域进行最优分配
- 你自己也要承担适合的任务
- 确保任务依赖关系合理
- 优先利用并行执行提高效率`;
  }

  private buildTaskExecutionPrompt(mission: any, task: any): string {
    return `你正在执行团队任务中的一个子任务。

【总任务背景】
标题：${mission.title}
描述：${mission.description}

【你的子任务】
任务名称：${task.title}
任务描述：${task.description}
任务类型：${task.taskType}

【要求】
请认真完成这个任务，输出完整的工作成果。
- 确保输出内容完整、专业
- 如果需要其他成员协助，可以 @他们的名字
- 完成后会由 Leader 审核`;
  }

  private buildLeaderReviewPrompt(
    _mission: any,
    task: any,
    taskResult: string,
  ): string {
    return `你是团队 Leader，请审核以下任务产出。

【任务信息】
任务名称：${task.title}
任务描述：${task.description}
负责人：${task.assignedTo.agentName || task.assignedTo.displayName}

【任务产出】
${taskResult}

【审核要求】
1. 评估产出是否满足任务要求
2. 如果合格，明确表示"审核通过"，并给出简短肯定
3. 如果需要修改，明确指出需要改进的具体内容

请直接给出审核意见：`;
  }

  private buildTaskRevisionPrompt(
    _mission: any,
    task: any,
    feedback: string,
  ): string {
    return `你之前提交的任务需要修改。

【任务信息】
任务名称：${task.title}
任务描述：${task.description}

【你之前的产出】
${task.result || "（无记录）"}

【Leader 反馈】
${feedback}

【要求】
请根据 Leader 的反馈修改你的产出，输出修改后的完整内容。`;
  }

  private buildLeaderSynthesisPrompt(mission: any): string {
    const taskResults = mission.tasks
      .map(
        (t: any) =>
          `【${t.title}】by ${t.assignedTo.agentName || t.assignedTo.displayName}
${t.result || "（无产出）"}`,
      )
      .join("\n\n---\n\n");

    return `你是团队 Leader，所有子任务已完成，请整合最终成果。

【任务信息】
标题：${mission.title}
描述：${mission.description}
${mission.deliverables?.length ? `期望交付物：${mission.deliverables.join("、")}` : ""}

【各成员产出】
${taskResults}

【要求】
请整合所有产出，生成最终交付物：
1. 使用清晰的结构组织内容
2. 确保覆盖所有期望交付物
3. 在最后添加执行总结

输出格式：
# ${mission.title} - 最终成果

[整合后的完整内容]

## 执行总结
| 指标 | 数据 |
|------|------|
| 总任务数 | ${mission.tasks.length} |
| 参与成员 | ... |

[总结性评价]`;
  }

  private getLeaderSystemPrompt(leader: any): string {
    return `你是「${leader.agentName || leader.displayName}」，团队的 Leader。
身份：${leader.agentIdentity || leader.roleDescription || "团队领导"}
职责：负责任务分解、分配、协调和整合结果。
风格：专业、清晰、有建设性。`;
  }

  private getAgentSystemPrompt(agent: any, task: any): string {
    return `你是「${agent.agentName || agent.displayName}」，团队成员。
身份：${agent.agentIdentity || agent.roleDescription || "专业人员"}
擅长：${(agent.expertiseAreas || []).join("、") || "多个领域"}
当前任务：${task.title}`;
  }

  private parseTaskBreakdown(
    content: string,
    teamMembers: any[],
  ): TaskBreakdown {
    // 简单解析，提取任务信息
    const tasks: TaskBreakdownItem[] = [];

    // 尝试解析表格
    const tableMatch = content.match(
      /\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g,
    );

    if (tableMatch) {
      for (const row of tableMatch) {
        const cells = row.split("|").filter((c) => c.trim());
        if (
          cells.length >= 6 &&
          !cells[0].includes("#") &&
          !cells[0].includes("-")
        ) {
          const title = cells[1]?.trim() || "";
          const assigneeName = cells[2]?.trim().replace("@", "") || "";
          const reason = cells[3]?.trim() || "";
          const priorityStr = cells[4]?.trim().toLowerCase() || "medium";
          const dependsStr = cells[5]?.trim() || "";

          // 查找对应的成员
          const assignee = teamMembers.find(
            (m) =>
              (m.agentName || m.displayName).includes(assigneeName) ||
              assigneeName.includes(m.agentName || m.displayName),
          );

          // 解析依赖
          const dependsOn: number[] = [];
          const depMatches = dependsStr.match(/\d+/g);
          if (depMatches) {
            for (const dep of depMatches) {
              dependsOn.push(parseInt(dep, 10) - 1); // 转换为0索引
            }
          }

          // 解析优先级
          let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
          if (
            priorityStr.includes("关键") ||
            priorityStr.includes("critical")
          ) {
            priority = "CRITICAL";
          } else if (
            priorityStr.includes("高") ||
            priorityStr.includes("high")
          ) {
            priority = "HIGH";
          } else if (
            priorityStr.includes("低") ||
            priorityStr.includes("low")
          ) {
            priority = "LOW";
          }

          if (title && assignee) {
            tasks.push({
              title,
              description: title,
              assigneeId: assignee.id,
              assigneeName: assignee.agentName || assignee.displayName,
              reason,
              priority,
              taskType: "implementation",
              dependsOn,
            });
          }
        }
      }
    }

    // 如果解析失败，创建一个默认任务
    if (tasks.length === 0 && teamMembers.length > 0) {
      tasks.push({
        title: "执行任务",
        description: "完成用户请求的任务",
        assigneeId: teamMembers[0].id,
        assigneeName: teamMembers[0].agentName || teamMembers[0].displayName,
        reason: "作为团队成员执行任务",
        priority: "MEDIUM",
        taskType: "implementation",
        dependsOn: [],
      });
    }

    return {
      understanding: content.match(/## 任务理解\n([^#]+)/)?.[1]?.trim() || "",
      tasks,
      executionPlan: content.match(/## 执行计划\n([^#]+)/)?.[1]?.trim() || "",
      risks: content.match(/## 风险提示\n([^#]+)/)?.[1]?.trim() || "",
    };
  }

  private parseReviewResult(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return (
      lowerContent.includes("通过") ||
      lowerContent.includes("合格") ||
      lowerContent.includes("approved") ||
      lowerContent.includes("✅") ||
      (lowerContent.includes("完成") && !lowerContent.includes("修改"))
    );
  }

  // ==================== 查询方法 ====================

  async getMissions(topicId: string, options?: { status?: MissionStatus }) {
    return this.prisma.teamMission.findMany({
      where: {
        topicId,
        ...(options?.status && { status: options.status }),
      },
      include: {
        leader: {
          select: {
            id: true,
            displayName: true,
            agentName: true,
            avatar: true,
            aiModel: true,
          },
        },
        createdBy: {
          select: { id: true, username: true, fullName: true },
        },
        _count: {
          select: { tasks: true, logs: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMissionById(missionId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
      include: {
        leader: true,
        createdBy: {
          select: { id: true, username: true, fullName: true },
        },
        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                displayName: true,
                agentName: true,
                avatar: true,
                aiModel: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!mission) {
      throw new NotFoundException("任务不存在");
    }

    return mission;
  }

  async getMissionLogs(
    missionId: string,
    options?: { limit?: number; cursor?: string },
  ) {
    const limit = options?.limit || 50;

    return this.prisma.missionLog.findMany({
      where: { missionId },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(options?.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
    });
  }

  async cancelMission(missionId: string, _userId: string) {
    const mission = await this.prisma.teamMission.findUnique({
      where: { id: missionId },
    });

    if (!mission) {
      throw new NotFoundException("任务不存在");
    }

    if (
      mission.status === MissionStatus.COMPLETED ||
      mission.status === MissionStatus.CANCELLED
    ) {
      throw new BadRequestException("任务已完成或已取消");
    }

    await this.prisma.teamMission.update({
      where: { id: missionId },
      data: { status: MissionStatus.CANCELLED },
    });

    // 取消所有进行中的子任务
    await this.prisma.agentTask.updateMany({
      where: {
        missionId,
        status: { in: [AgentTaskStatus.PENDING, AgentTaskStatus.IN_PROGRESS] },
      },
      data: { status: AgentTaskStatus.CANCELLED },
    });

    await this.createLog(missionId, {
      type: MissionLogType.MISSION_FAILED,
      content: "任务已被用户取消",
    });

    this.aiGroupGateway.emitToTopic(mission.topicId, "mission:cancelled", {
      missionId,
    });

    return { success: true, message: "任务已取消" };
  }

  // ==================== 设置 Leader ====================

  async setLeader(topicId: string, aiMemberId: string) {
    // 先取消该 Topic 下其他 Leader
    await this.prisma.topicAIMember.updateMany({
      where: { topicId, isLeader: true },
      data: { isLeader: false },
    });

    // 设置新 Leader
    return this.prisma.topicAIMember.update({
      where: { id: aiMemberId },
      data: { isLeader: true },
    });
  }

  async getTeamMembers(topicId: string) {
    const members = await this.prisma.topicAIMember.findMany({
      where: { topicId },
      orderBy: [{ isLeader: "desc" }, { createdAt: "asc" }],
    });

    const leader = members.find((m) => m.isLeader);
    const otherMembers = members.filter((m) => !m.isLeader);

    return {
      leader,
      members: otherMembers,
      all: members,
    };
  }
}
