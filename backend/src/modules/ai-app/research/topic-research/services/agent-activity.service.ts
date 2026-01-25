/**
 * Agent Activity Service
 *
 * 增强的 Agent 活动持久化服务 (Phase 1.2)
 *
 * 核心职责：
 * 1. 记录完整的 Agent 思考链
 * 2. 追踪各阶段的详细信息（搜索结果、写作进度等）
 * 3. 支持时间追踪（阶段开始/结束时间、持续时间）
 * 4. 提供按维度分组的活动查询
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AgentActivityType } from "@prisma/client";

/**
 * 思考阶段类型
 */
export type ThinkingPhase =
  | "understanding" // 理解需求
  | "searching" // 搜索资料
  | "writing" // 撰写内容
  | "reviewing" // 审核内容
  | "integrating"; // 整合结果

/**
 * 搜索结果记录
 */
export interface SearchResultsRecord {
  total: number; // 搜索到的总数
  filtered: number; // 过滤后的数量
  searchTool?: string; // 使用的搜索工具 (tavily, serper, google, bing, etc.)
  query?: string; // 搜索查询
  searchedAt?: string; // 搜索时间 (ISO string)
  freshnessInfo?: {
    newestDate?: string; // 最新结果的日期
    oldestDate?: string; // 最旧结果的日期
    avgAgeInDays?: number; // 平均结果年龄（天）
  };
  // ★ 知识库搜索记录（用于溯源）
  knowledgeBaseInfo?: {
    enabled: boolean; // 是否启用了知识库
    knowledgeBaseIds?: string[]; // 使用的知识库ID列表
    matchedCount: number; // 匹配到的结果数
    avgSimilarity?: number; // 平均相似度
  };
  sources: Array<{
    title: string;
    url: string;
    domain?: string;
    sourceType: string;
    credibilityScore?: number;
    publishedDate?: string; // 发布日期
    // ★ 知识库来源标记
    isKnowledgeBase?: boolean; // 是否来自知识库
    similarity?: number; // 相似度（知识库结果）
    documentId?: string; // 文档ID（知识库结果）
  }>;
}

/**
 * 写作进度记录
 */
export interface WritingProgressRecord {
  sections: Array<{
    id: string;
    title: string;
    status: "pending" | "writing" | "reviewing" | "completed";
    revisionCount?: number;
    wordCount?: number;
  }>;
  current?: string; // 当前正在写的章节ID
  totalWordCount: number;
  completedSections: number;
  totalSections: number;
}

/**
 * 创建 Agent 活动的输入参数
 */
export interface CreateAgentActivityInput {
  topicId: string;
  missionId: string;
  dimensionId?: string;
  dimensionName?: string;
  agentId: string;
  agentName: string;
  agentRole: "leader" | "researcher" | "reviewer" | "synthesizer";
  activityType: AgentActivityType;
  phase?: string;
  content: string;
  progress?: number;

  // 思考链增强字段
  thinkingPhase?: ThinkingPhase;
  thinkingContent?: string;
  searchResults?: SearchResultsRecord;
  writingProgress?: WritingProgressRecord;
  actionTaken?: string;
  actionResult?: Record<string, unknown>;
}

/**
 * 按维度分组的活动
 */
export interface DimensionActivities {
  dimensionId: string;
  dimensionName: string;
  activities: AgentActivityWithTiming[];
  totalDuration: number; // 总耗时（毫秒）
}

/**
 * 带时间信息的活动记录
 */
export interface AgentActivityWithTiming {
  id: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  activityType: string;
  phase?: string;
  content: string;
  progress: number;
  thinkingPhase?: string;
  thinkingContent?: string;
  searchResults?: SearchResultsRecord;
  writingProgress?: WritingProgressRecord;
  actionTaken?: string;
  actionResult?: Record<string, unknown>;
  phaseStartedAt?: Date;
  phaseEndedAt?: Date;
  durationMs?: number;
  createdAt: Date;
}

@Injectable()
export class AgentActivityService {
  private readonly logger = new Logger(AgentActivityService.name);

  // 用于追踪正在进行的阶段（topicId:agentId:thinkingPhase -> activityId）
  private readonly activePhases = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录 Agent 活动
   */
  async recordActivity(input: CreateAgentActivityInput): Promise<string> {
    try {
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId: input.topicId,
          missionId: input.missionId,
          dimensionId: input.dimensionId,
          dimensionName: input.dimensionName,
          agentId: input.agentId,
          agentName: input.agentName,
          agentRole: input.agentRole,
          activityType: input.activityType,
          phase: input.phase,
          content: input.content,
          progress: input.progress || 0,
          thinkingPhase: input.thinkingPhase,
          thinkingContent: input.thinkingContent,
          searchResults: input.searchResults
            ? JSON.parse(JSON.stringify(input.searchResults))
            : undefined,
          writingProgress: input.writingProgress
            ? JSON.parse(JSON.stringify(input.writingProgress))
            : undefined,
          actionTaken: input.actionTaken,
          actionResult: input.actionResult
            ? JSON.parse(JSON.stringify(input.actionResult))
            : undefined,
        },
      });

      return activity.id;
    } catch (error) {
      this.logger.error(`Failed to record agent activity: ${error}`);
      throw error;
    }
  }

  /**
   * 开始一个思考阶段（记录开始时间）
   */
  async startThinkingPhase(
    input: CreateAgentActivityInput & { thinkingPhase: ThinkingPhase },
  ): Promise<string> {
    const phaseKey = `${input.topicId}:${input.agentId}:${input.thinkingPhase}`;

    try {
      const activity = await this.prisma.researchAgentActivity.create({
        data: {
          topicId: input.topicId,
          missionId: input.missionId,
          dimensionId: input.dimensionId,
          dimensionName: input.dimensionName,
          agentId: input.agentId,
          agentName: input.agentName,
          agentRole: input.agentRole,
          activityType: input.activityType,
          phase: input.phase,
          content: input.content,
          progress: input.progress || 0,
          thinkingPhase: input.thinkingPhase,
          thinkingContent: input.thinkingContent,
          phaseStartedAt: new Date(),
        },
      });

      // 记录活动ID以便后续更新
      this.activePhases.set(phaseKey, activity.id);

      return activity.id;
    } catch (error) {
      this.logger.error(`Failed to start thinking phase: ${error}`);
      throw error;
    }
  }

  /**
   * 结束一个思考阶段（记录结束时间和结果）
   */
  async endThinkingPhase(
    topicId: string,
    agentId: string,
    thinkingPhase: ThinkingPhase,
    result?: {
      searchResults?: SearchResultsRecord;
      writingProgress?: WritingProgressRecord;
      actionResult?: Record<string, unknown>;
      finalContent?: string;
    },
  ): Promise<void> {
    const phaseKey = `${topicId}:${agentId}:${thinkingPhase}`;
    const activityId = this.activePhases.get(phaseKey);

    if (!activityId) {
      this.logger.warn(`No active phase found for key: ${phaseKey}`);
      return;
    }

    try {
      const activity = await this.prisma.researchAgentActivity.findUnique({
        where: { id: activityId },
        select: { phaseStartedAt: true },
      });

      const now = new Date();
      const durationMs = activity?.phaseStartedAt
        ? now.getTime() - activity.phaseStartedAt.getTime()
        : undefined;

      await this.prisma.researchAgentActivity.update({
        where: { id: activityId },
        data: {
          phaseEndedAt: now,
          durationMs,
          searchResults: result?.searchResults
            ? JSON.parse(JSON.stringify(result.searchResults))
            : undefined,
          writingProgress: result?.writingProgress
            ? JSON.parse(JSON.stringify(result.writingProgress))
            : undefined,
          actionResult: result?.actionResult
            ? JSON.parse(JSON.stringify(result.actionResult))
            : undefined,
          thinkingContent: result?.finalContent,
          progress: 100,
        },
      });

      this.activePhases.delete(phaseKey);
    } catch (error) {
      this.logger.error(`Failed to end thinking phase: ${error}`);
    }
  }

  /**
   * 更新思考阶段的进度
   */
  async updateThinkingProgress(
    topicId: string,
    agentId: string,
    thinkingPhase: ThinkingPhase,
    progress: number,
    update?: {
      searchResults?: SearchResultsRecord;
      writingProgress?: WritingProgressRecord;
      thinkingContent?: string;
    },
  ): Promise<void> {
    const phaseKey = `${topicId}:${agentId}:${thinkingPhase}`;
    const activityId = this.activePhases.get(phaseKey);

    if (!activityId) {
      this.logger.warn(`No active phase found for update: ${phaseKey}`);
      return;
    }

    try {
      const updateData: Record<string, unknown> = { progress };

      if (update?.searchResults) {
        updateData.searchResults = JSON.parse(
          JSON.stringify(update.searchResults),
        );
      }
      if (update?.writingProgress) {
        updateData.writingProgress = JSON.parse(
          JSON.stringify(update.writingProgress),
        );
      }
      if (update?.thinkingContent) {
        updateData.thinkingContent = update.thinkingContent;
      }

      await this.prisma.researchAgentActivity.update({
        where: { id: activityId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Failed to update thinking progress: ${error}`);
    }
  }

  /**
   * 获取专题的所有活动（按维度分组）
   */
  async getActivitiesByDimension(
    topicId: string,
    missionId?: string,
  ): Promise<DimensionActivities[]> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        ...(missionId ? { missionId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // 按维度分组
    const dimensionMap = new Map<string, AgentActivityWithTiming[]>();

    for (const activity of activities) {
      const key = activity.dimensionId || "general";
      if (!dimensionMap.has(key)) {
        dimensionMap.set(key, []);
      }

      dimensionMap.get(key)!.push({
        id: activity.id,
        agentId: activity.agentId,
        agentName: activity.agentName,
        agentRole: activity.agentRole,
        activityType: activity.activityType,
        phase: activity.phase || undefined,
        content: activity.content,
        progress: activity.progress,
        thinkingPhase: activity.thinkingPhase || undefined,
        thinkingContent: activity.thinkingContent || undefined,
        searchResults: activity.searchResults as unknown as
          | SearchResultsRecord
          | undefined,
        writingProgress: activity.writingProgress as unknown as
          | WritingProgressRecord
          | undefined,
        actionTaken: activity.actionTaken || undefined,
        actionResult: activity.actionResult as unknown as
          | Record<string, unknown>
          | undefined,
        phaseStartedAt: activity.phaseStartedAt || undefined,
        phaseEndedAt: activity.phaseEndedAt || undefined,
        durationMs: activity.durationMs || undefined,
        createdAt: activity.createdAt,
      });
    }

    // 转换为数组格式
    const result: DimensionActivities[] = [];
    for (const [dimensionId, dimensionActivities] of dimensionMap) {
      // 获取维度名称
      const dimensionName =
        activities.find((a) => a.dimensionId === dimensionId)?.dimensionName ||
        (dimensionId === "general" ? "通用活动" : "未知维度");

      // 计算总耗时
      const totalDuration = dimensionActivities.reduce(
        (sum, a) => sum + (a.durationMs || 0),
        0,
      );

      result.push({
        dimensionId,
        dimensionName,
        activities: dimensionActivities,
        totalDuration,
      });
    }

    return result;
  }

  /**
   * 获取特定维度的活动时间线
   */
  async getDimensionTimeline(
    topicId: string,
    dimensionId: string,
  ): Promise<AgentActivityWithTiming[]> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        dimensionId,
      },
      orderBy: { createdAt: "asc" },
    });

    return activities.map((activity) => ({
      id: activity.id,
      agentId: activity.agentId,
      agentName: activity.agentName,
      agentRole: activity.agentRole,
      activityType: activity.activityType,
      phase: activity.phase || undefined,
      content: activity.content,
      progress: activity.progress,
      thinkingPhase: activity.thinkingPhase || undefined,
      thinkingContent: activity.thinkingContent || undefined,
      searchResults: activity.searchResults as unknown as
        | SearchResultsRecord
        | undefined,
      writingProgress: activity.writingProgress as unknown as
        | WritingProgressRecord
        | undefined,
      actionTaken: activity.actionTaken || undefined,
      actionResult: activity.actionResult as unknown as
        | Record<string, unknown>
        | undefined,
      phaseStartedAt: activity.phaseStartedAt || undefined,
      phaseEndedAt: activity.phaseEndedAt || undefined,
      durationMs: activity.durationMs || undefined,
      createdAt: activity.createdAt,
    }));
  }

  /**
   * 获取 Leader 的思考过程记录
   */
  async getLeaderThinkingHistory(
    topicId: string,
    missionId?: string,
  ): Promise<AgentActivityWithTiming[]> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        agentRole: "leader",
        ...(missionId ? { missionId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return activities.map((activity) => ({
      id: activity.id,
      agentId: activity.agentId,
      agentName: activity.agentName,
      agentRole: activity.agentRole,
      activityType: activity.activityType,
      phase: activity.phase || undefined,
      content: activity.content,
      progress: activity.progress,
      thinkingPhase: activity.thinkingPhase || undefined,
      thinkingContent: activity.thinkingContent || undefined,
      searchResults: activity.searchResults as unknown as
        | SearchResultsRecord
        | undefined,
      writingProgress: activity.writingProgress as unknown as
        | WritingProgressRecord
        | undefined,
      actionTaken: activity.actionTaken || undefined,
      actionResult: activity.actionResult as unknown as
        | Record<string, unknown>
        | undefined,
      phaseStartedAt: activity.phaseStartedAt || undefined,
      phaseEndedAt: activity.phaseEndedAt || undefined,
      durationMs: activity.durationMs || undefined,
      createdAt: activity.createdAt,
    }));
  }

  /**
   * 获取活动统计信息
   */
  async getActivityStats(
    topicId: string,
    missionId?: string,
  ): Promise<{
    totalActivities: number;
    byAgentRole: Record<string, number>;
    byThinkingPhase: Record<string, number>;
    totalDuration: number;
    averageDuration: number;
  }> {
    const activities = await this.prisma.researchAgentActivity.findMany({
      where: {
        topicId,
        ...(missionId ? { missionId } : {}),
      },
      select: {
        agentRole: true,
        thinkingPhase: true,
        durationMs: true,
      },
    });

    const byAgentRole: Record<string, number> = {};
    const byThinkingPhase: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const activity of activities) {
      // 按 Agent 角色统计
      byAgentRole[activity.agentRole] =
        (byAgentRole[activity.agentRole] || 0) + 1;

      // 按思考阶段统计
      if (activity.thinkingPhase) {
        byThinkingPhase[activity.thinkingPhase] =
          (byThinkingPhase[activity.thinkingPhase] || 0) + 1;
      }

      // 统计时间
      if (activity.durationMs) {
        totalDuration += activity.durationMs;
        durationCount++;
      }
    }

    return {
      totalActivities: activities.length,
      byAgentRole,
      byThinkingPhase,
      totalDuration,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }

  /**
   * ★ 记录 Leader 审核结果到 Activity
   *
   * @param topicId 研究专题 ID
   * @param missionId 任务 ID
   * @param dimensionId 维度 ID
   * @param dimensionName 维度名称
   * @param content 审核内容描述
   * @param approved 是否通过
   */
  async recordReviewActivity(
    topicId: string,
    missionId: string,
    dimensionId: string,
    dimensionName: string,
    content: string,
    approved: boolean,
  ): Promise<void> {
    try {
      await this.prisma.researchAgentActivity.create({
        data: {
          topicId,
          missionId,
          dimensionId,
          dimensionName,
          agentId: "leader",
          agentName: "研究组长",
          agentRole: "leader",
          activityType: AgentActivityType.REVIEWING,
          phase: "reviewing",
          content,
          progress: approved ? 100 : 50,
          thinkingPhase: "reviewing",
          thinkingContent: approved ? "审核通过" : "需要修订",
        },
      });
    } catch (error) {
      // 忽略外键约束错误（topic 可能已被删除）
      const errorStr = String(error);
      if (!errorStr.includes("Foreign key constraint")) {
        this.logger.error(`Failed to record review activity: ${error}`);
      }
    }
  }
}
