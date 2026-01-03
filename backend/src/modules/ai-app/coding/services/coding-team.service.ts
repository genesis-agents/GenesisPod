/**
 * AI Coding 团队管理服务
 *
 * 负责：
 * 1. 初始化项目团队成员（5个 AI Agent）
 * 2. 管理团队成员状态
 * 3. 团队消息传递
 * 4. 获取系统配置的默认 AI 模型
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  CodingAgentRole,
  CodingAgentMemberStatus,
  CodingMessageType,
  AIModelType,
  CodingTeamMember,
  CodingTeamMessage,
} from "@prisma/client";
import { AGENT_CONFIGS, AgentConfig } from "../constants/agent-configs";

/**
 * 团队成员创建参数
 */
export interface CreateTeamMemberParams {
  projectId: string;
  role: CodingAgentRole;
  aiModelId?: string; // 可选，不提供则使用系统默认
}

/**
 * 团队消息创建参数
 */
export interface SendMessageParams {
  projectId: string;
  senderId?: string; // Agent member ID, null for system
  senderRole?: CodingAgentRole;
  content: string;
  messageType: CodingMessageType;
  metadata?: Record<string, unknown>;
}

/**
 * 默认 AI 模型信息
 */
export interface DefaultAIModel {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  modelId: string;
  apiKey: string | null;
  apiEndpoint: string | null;
}

@Injectable()
export class CodingTeamService {
  private readonly logger = new Logger(CodingTeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取系统配置的默认 CHAT 模型（标准文本模型）
   *
   * 优先级：
   * 1. 默认且启用的 CHAT 类型模型
   * 2. 任意启用的 CHAT 类型模型
   * 3. 抛出错误（无可用模型）
   */
  async getDefaultChatModel(): Promise<DefaultAIModel> {
    // 1. 查找默认的 CHAT 模型
    let model = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.CHAT,
      },
    });

    // 2. Fallback: 查找任意可用的 CHAT 模型
    if (!model) {
      model = await this.prisma.aIModel.findFirst({
        where: {
          isEnabled: true,
          modelType: AIModelType.CHAT,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!model) {
      throw new Error(
        "No AI CHAT model available. Please configure at least one CHAT model in system settings.",
      );
    }

    this.logger.log(
      `[CodingTeam] Using default CHAT model: ${model.displayName} (${model.modelId})`,
    );

    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey,
      apiEndpoint: model.apiEndpoint,
    };
  }

  /**
   * 初始化项目团队
   * 为项目创建 5 个 AI Agent 成员
   */
  async initializeTeam(projectId: string): Promise<CodingTeamMember[]> {
    this.logger.log(`[${projectId}] Initializing team...`);

    // 检查团队是否已存在
    const existingMembers = await this.prisma.codingTeamMember.findMany({
      where: { projectId },
    });

    if (existingMembers.length > 0) {
      this.logger.log(
        `[${projectId}] Team already exists with ${existingMembers.length} members`,
      );
      return existingMembers;
    }

    // 获取默认 AI 模型
    const defaultModel = await this.getDefaultChatModel();

    // 创建所有角色的团队成员
    const roles: CodingAgentRole[] = [
      CodingAgentRole.PM,
      CodingAgentRole.ARCHITECT,
      CodingAgentRole.PM_LEAD,
      CodingAgentRole.ENGINEER,
      CodingAgentRole.QA,
    ];

    const members: CodingTeamMember[] = [];

    for (const role of roles) {
      const config = AGENT_CONFIGS[role];
      const member = await this.createTeamMember({
        projectId,
        role,
        config,
        defaultModel,
      });
      members.push(member);
    }

    // 更新项目状态
    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: { teamInitialized: true },
    });

    // 发送系统消息：团队已初始化
    await this.broadcastSystemMessage(
      projectId,
      `团队已初始化完成，共 ${members.length} 名成员`,
      { memberCount: members.length, roles: roles.map((r) => r.toString()) },
    );

    this.logger.log(
      `[${projectId}] Team initialized with ${members.length} members`,
    );

    return members;
  }

  /**
   * 创建单个团队成员
   */
  private async createTeamMember(params: {
    projectId: string;
    role: CodingAgentRole;
    config: AgentConfig;
    defaultModel: DefaultAIModel;
  }): Promise<CodingTeamMember> {
    const { projectId, role, config, defaultModel } = params;

    const member = await this.prisma.codingTeamMember.create({
      data: {
        projectId,
        agentRole: role,
        displayName: config.displayName,
        avatar: config.avatar,
        aiModel: defaultModel.displayName,
        aiModelId: defaultModel.id,
        systemPrompt: config.systemPrompt,
        status: CodingAgentMemberStatus.IDLE,
        isLeader: config.canBeLeader && role === CodingAgentRole.PM, // PM 是默认 Leader
      },
    });

    this.logger.debug(
      `[${projectId}] Created team member: ${config.displayName} (${role}) with model ${defaultModel.displayName}`,
    );

    return member;
  }

  /**
   * 获取项目团队成员列表
   */
  async getTeamMembers(projectId: string): Promise<CodingTeamMember[]> {
    return this.prisma.codingTeamMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * 获取团队 Leader
   */
  async getLeader(projectId: string): Promise<CodingTeamMember | null> {
    return this.prisma.codingTeamMember.findFirst({
      where: { projectId, isLeader: true },
    });
  }

  /**
   * 根据角色获取团队成员
   */
  async getMemberByRole(
    projectId: string,
    role: CodingAgentRole,
  ): Promise<CodingTeamMember | null> {
    return this.prisma.codingTeamMember.findFirst({
      where: { projectId, agentRole: role },
    });
  }

  /**
   * 更新团队成员状态
   */
  async updateMemberStatus(
    memberId: string,
    status: CodingAgentMemberStatus,
    metadata?: {
      currentTask?: string;
      lastError?: string;
    },
  ): Promise<CodingTeamMember> {
    const updateData: Record<string, unknown> = { status };

    if (metadata?.currentTask !== undefined) {
      updateData.currentTask = metadata.currentTask;
    }

    if (metadata?.lastError !== undefined) {
      updateData.lastError = metadata.lastError;
    }

    if (status === CodingAgentMemberStatus.WORKING) {
      updateData.lastActiveAt = new Date();
    }

    return this.prisma.codingTeamMember.update({
      where: { id: memberId },
      data: updateData,
    });
  }

  /**
   * 增加成员任务完成数
   */
  async incrementTasksCompleted(memberId: string): Promise<void> {
    await this.prisma.codingTeamMember.update({
      where: { id: memberId },
      data: {
        tasksCompleted: { increment: 1 },
        lastActiveAt: new Date(),
      },
    });
  }

  /**
   * 发送团队消息
   */
  async sendMessage(params: SendMessageParams): Promise<CodingTeamMessage> {
    const message = await this.prisma.codingTeamMessage.create({
      data: {
        projectId: params.projectId,
        senderId: params.senderId,
        senderRole: params.senderRole,
        content: params.content,
        messageType: params.messageType,
        metadata: params.metadata
          ? JSON.parse(JSON.stringify(params.metadata))
          : undefined,
      },
    });

    this.logger.debug(
      `[${params.projectId}] Message sent: ${params.messageType} from ${params.senderRole || "SYSTEM"}`,
    );

    return message;
  }

  /**
   * 广播系统消息
   */
  async broadcastSystemMessage(
    projectId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<CodingTeamMessage> {
    return this.sendMessage({
      projectId,
      content,
      messageType: CodingMessageType.SYSTEM,
      metadata,
    });
  }

  /**
   * 获取项目团队消息历史
   */
  async getTeamMessages(
    projectId: string,
    options?: {
      limit?: number;
      offset?: number;
      messageType?: CodingMessageType;
    },
  ): Promise<CodingTeamMessage[]> {
    const { limit = 50, offset = 0, messageType } = options || {};

    return this.prisma.codingTeamMessage.findMany({
      where: {
        projectId,
        ...(messageType && { messageType }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * 获取成员的 AI 模型配置
   */
  async getMemberAIModel(memberId: string): Promise<DefaultAIModel | null> {
    const member = await this.prisma.codingTeamMember.findUnique({
      where: { id: memberId },
    });

    if (!member?.aiModelId) {
      return this.getDefaultChatModel();
    }

    const model = await this.prisma.aIModel.findUnique({
      where: { id: member.aiModelId },
    });

    if (!model || !model.isEnabled) {
      this.logger.warn(
        `[getMemberAIModel] Model ${member.aiModelId} not found or disabled, using default`,
      );
      return this.getDefaultChatModel();
    }

    return {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey,
      apiEndpoint: model.apiEndpoint,
    };
  }

  /**
   * 更新成员的 AI 模型
   */
  async updateMemberAIModel(
    memberId: string,
    aiModelId: string,
  ): Promise<CodingTeamMember> {
    const model = await this.prisma.aIModel.findUnique({
      where: { id: aiModelId },
    });

    if (!model) {
      throw new Error(`AI Model ${aiModelId} not found`);
    }

    return this.prisma.codingTeamMember.update({
      where: { id: memberId },
      data: {
        aiModelId: model.id,
        aiModel: model.displayName,
      },
    });
  }

  /**
   * 重置团队（删除所有成员并重新初始化）
   */
  async resetTeam(projectId: string): Promise<CodingTeamMember[]> {
    this.logger.log(`[${projectId}] Resetting team...`);

    // 删除现有成员
    await this.prisma.codingTeamMember.deleteMany({
      where: { projectId },
    });

    // 删除团队消息
    await this.prisma.codingTeamMessage.deleteMany({
      where: { projectId },
    });

    // 更新项目状态
    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: { teamInitialized: false },
    });

    // 重新初始化
    return this.initializeTeam(projectId);
  }

  /**
   * 获取团队统计信息
   */
  async getTeamStats(projectId: string): Promise<{
    totalMembers: number;
    activeMembers: number;
    totalTasksCompleted: number;
    memberStats: Array<{
      role: CodingAgentRole;
      displayName: string;
      status: CodingAgentMemberStatus;
      tasksCompleted: number;
    }>;
  }> {
    const members = await this.getTeamMembers(projectId);

    const activeMembers = members.filter(
      (m) => m.status === CodingAgentMemberStatus.WORKING,
    ).length;

    const totalTasksCompleted = members.reduce(
      (sum, m) => sum + m.tasksCompleted,
      0,
    );

    return {
      totalMembers: members.length,
      activeMembers,
      totalTasksCompleted,
      memberStats: members.map((m) => ({
        role: m.agentRole,
        displayName: m.displayName,
        status: m.status,
        tasksCompleted: m.tasksCompleted,
      })),
    };
  }
}
