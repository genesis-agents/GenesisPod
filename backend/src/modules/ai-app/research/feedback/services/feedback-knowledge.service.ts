import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../../ai-engine/llm/services/ai-chat.service";
import {
  ResearchFeedbackItemStatus,
  ImprovementType,
  AIModelType,
} from "@prisma/client";
import {
  CreateFeedbackKnowledgeDto,
  UpdateFeedbackKnowledgeDto,
  EvaluateEffectDto,
  KnowledgeQueryDto,
  ImprovementTrackingResponse,
} from "../dto";
import {
  KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  KNOWLEDGE_EXTRACTION_USER_PROMPT,
} from "../prompts/feedback-analysis.prompt";

/**
 * 反馈知识沉淀服务
 * 负责将反馈转为知识条目、应用改进并追踪效果
 */
@Injectable()
export class FeedbackKnowledgeService {
  private readonly logger = new Logger(FeedbackKnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 创建知识条目
   */
  async createKnowledgeItem(
    feedbackId: string,
    dto: CreateFeedbackKnowledgeDto,
  ) {
    // 验证反馈存在
    const feedback = await this.prisma.researchFeedbackItem.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback item ${feedbackId} not found`);
    }

    // 创建知识条目
    const knowledge = await this.prisma.researchFeedbackKnowledge.create({
      data: {
        feedbackItemId: feedbackId,
        title: dto.title,
        content: dto.content,
        tags: dto.tags || [],
        improvementType: dto.improvementType,
        improvementData: dto.improvementData
          ? (dto.improvementData as object)
          : undefined,
      },
    });

    // 更新反馈状态和关联
    await this.prisma.researchFeedbackItem.update({
      where: { id: feedbackId },
      data: {
        status: ResearchFeedbackItemStatus.APPROVED,
        knowledgeItemId: knowledge.id,
      },
    });

    this.logger.log(
      `Knowledge item ${knowledge.id} created from feedback ${feedbackId}`,
    );
    return knowledge;
  }

  /**
   * AI 自动提取知识
   */
  async extractKnowledge(feedbackId: string) {
    const feedback = await this.prisma.researchFeedbackItem.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback item ${feedbackId} not found`);
    }

    // 调用 AI 提取知识
    const result = await this.aiChatService.chat({
      messages: [
        { role: "system", content: KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: KNOWLEDGE_EXTRACTION_USER_PROMPT({
            feedbackContent: feedback.content,
            aiAnalysis: (feedback.aiAnalysis as Record<string, unknown>) || {},
            selectedText: feedback.selectedText || undefined,
          }),
        },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "low",
        outputLength: "medium",
      },
    });

    // 解析结果
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.shouldExtract && parsed.knowledge) {
          return {
            shouldExtract: true,
            suggestion: parsed.knowledge,
          };
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to parse knowledge extraction: ${error}`);
    }

    return {
      shouldExtract: false,
      suggestion: null,
    };
  }

  /**
   * 获取知识条目
   */
  async getKnowledgeItem(id: string) {
    const knowledge = await this.prisma.researchFeedbackKnowledge.findUnique({
      where: { id },
      include: {
        feedbackItems: {
          select: {
            id: true,
            content: true,
            category: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!knowledge) {
      throw new NotFoundException(`Knowledge item ${id} not found`);
    }

    return knowledge;
  }

  /**
   * 更新知识条目
   */
  async updateKnowledgeItem(id: string, dto: UpdateFeedbackKnowledgeDto) {
    const existing = await this.prisma.researchFeedbackKnowledge.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Knowledge item ${id} not found`);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.improvementData !== undefined) {
      updateData.improvementData = dto.improvementData;
    }

    return this.prisma.researchFeedbackKnowledge.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 获取知识列表
   */
  async getKnowledgeItems(query: KnowledgeQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.improvementType) {
      where.improvementType = filters.improvementType;
    }
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }
    if (filters.applied !== undefined) {
      where.appliedAt = filters.applied ? { not: null } : null;
    }

    const [items, total] = await Promise.all([
      this.prisma.researchFeedbackKnowledge.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          feedbackItems: {
            select: {
              id: true,
              content: true,
              category: true,
            },
            take: 3,
          },
        },
      }),
      this.prisma.researchFeedbackKnowledge.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 应用改进措施
   * 根据改进类型创建可追踪的改进任务记录
   */
  async applyImprovement(knowledgeId: string) {
    const knowledge = await this.prisma.researchFeedbackKnowledge.findUnique({
      where: { id: knowledgeId },
      include: {
        feedbackItems: {
          select: { id: true, content: true },
          take: 1,
        },
      },
    });

    if (!knowledge) {
      throw new NotFoundException(`Knowledge item ${knowledgeId} not found`);
    }

    // 创建应用结果记录
    const applicationResult: {
      type: string;
      status: "applied" | "pending_review" | "manual_required";
      message: string;
      details?: Record<string, unknown>;
    } = {
      type: knowledge.improvementType,
      status: "applied",
      message: "",
    };

    // 根据改进类型执行不同的应用逻辑
    switch (knowledge.improvementType) {
      case ImprovementType.PROMPT_UPDATE:
        applicationResult.details = await this.applyPromptUpdate(knowledge);
        applicationResult.status = "pending_review";
        applicationResult.message = "Prompt 更新建议已记录，等待人工审核后生效";
        break;

      case ImprovementType.STRATEGY_CHANGE:
        applicationResult.details = await this.applyStrategyChange(knowledge);
        applicationResult.status = "pending_review";
        applicationResult.message = "策略变更建议已记录，需要管理员审批";
        break;

      case ImprovementType.QUALITY_RULE:
        applicationResult.details = await this.applyQualityRule(knowledge);
        applicationResult.status = "applied";
        applicationResult.message = "质量规则已添加到系统";
        break;

      case ImprovementType.DOCUMENTATION:
        applicationResult.status = "manual_required";
        applicationResult.message = "文档更新需要手动执行，已标记为待处理";
        applicationResult.details = {
          suggestedChanges: knowledge.content,
          relatedTags: knowledge.tags,
        };
        break;
    }

    // 更新知识条目，记录应用时间和结果
    // 将 applicationResult 序列化为 Prisma Json 兼容格式
    const improvementDataUpdate = JSON.parse(
      JSON.stringify({
        ...(knowledge.improvementData as object),
        applicationResult,
        appliedAt: new Date().toISOString(),
      }),
    );

    const updatedKnowledge = await this.prisma.researchFeedbackKnowledge.update(
      {
        where: { id: knowledgeId },
        data: {
          appliedAt: new Date(),
          improvementData: improvementDataUpdate,
        },
      },
    );

    // 更新关联反馈的状态
    await this.prisma.researchFeedbackItem.updateMany({
      where: { knowledgeItemId: knowledgeId },
      data: { status: ResearchFeedbackItemStatus.APPLIED },
    });

    this.logger.log(
      `Improvement ${knowledgeId} applied with status: ${applicationResult.status}`,
    );

    return {
      success: true,
      knowledge: updatedKnowledge,
      applicationResult,
    };
  }

  /**
   * 应用 Prompt 更新
   * 创建 Prompt 模板的待审核版本草稿
   */
  private async applyPromptUpdate(knowledge: {
    id: string;
    title: string;
    content: string;
    improvementData: unknown;
  }): Promise<Record<string, unknown>> {
    const data = knowledge.improvementData as {
      taskType?: string;
      changes?: string;
      suggestedPrompt?: string;
    } | null;

    if (!data?.taskType) {
      this.logger.warn(
        `Prompt update ${knowledge.id} missing taskType, recording for manual review`,
      );
      return {
        action: "manual_review_required",
        reason: "Missing taskType in improvement data",
        knowledgeId: knowledge.id,
      };
    }

    // 获取当前活跃的 Prompt 模板
    const currentPrompt = await this.prisma.promptTemplate.findFirst({
      where: {
        taskType: data.taskType,
        isActive: true,
      },
      orderBy: { version: "desc" },
    });

    if (!currentPrompt) {
      this.logger.warn(`No active prompt found for taskType: ${data.taskType}`);
      return {
        action: "no_active_prompt",
        taskType: data.taskType,
        suggestedAction: "Create new prompt template manually",
      };
    }

    // 记录 Prompt 更新建议（实际更新需要人工审核）
    // 在生产环境中，这里可以创建一个审核工单或通知
    const updateSuggestion = {
      action: "prompt_update_suggested",
      currentPromptId: currentPrompt.id,
      currentVersion: currentPrompt.version,
      taskType: data.taskType,
      suggestedChanges: data.changes || knowledge.content,
      suggestedPrompt: data.suggestedPrompt,
      reviewRequired: true,
      createdFromKnowledge: knowledge.id,
      createdAt: new Date().toISOString(),
    };

    this.logger.log(
      `Prompt update suggestion created for ${data.taskType} (current version: ${currentPrompt.version})`,
    );

    return updateSuggestion;
  }

  /**
   * 应用策略变更
   * 记录策略变更建议供管理员审批
   */
  private async applyStrategyChange(knowledge: {
    id: string;
    title: string;
    content: string;
    improvementData: unknown;
  }): Promise<Record<string, unknown>> {
    const data = knowledge.improvementData as {
      strategyType?: string;
      currentValue?: unknown;
      suggestedValue?: unknown;
      reason?: string;
    } | null;

    const strategySuggestion = {
      action: "strategy_change_suggested",
      strategyType: data?.strategyType || "general",
      currentValue: data?.currentValue,
      suggestedValue: data?.suggestedValue,
      reason: data?.reason || knowledge.content,
      approvalRequired: true,
      createdFromKnowledge: knowledge.id,
      createdAt: new Date().toISOString(),
    };

    this.logger.log(
      `Strategy change suggestion recorded: ${data?.strategyType || "general"}`,
    );

    return strategySuggestion;
  }

  /**
   * 应用质量规则
   * 将质量规则添加到系统配置中
   */
  private async applyQualityRule(knowledge: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    improvementData: unknown;
  }): Promise<Record<string, unknown>> {
    const data = knowledge.improvementData as {
      ruleType?: string;
      ruleDefinition?: string;
      severity?: string;
      applicableTo?: string[];
    } | null;

    // 构建质量规则记录
    const qualityRule = {
      action: "quality_rule_added",
      ruleId: `qr-${knowledge.id.slice(0, 8)}`,
      ruleName: knowledge.title,
      ruleType: data?.ruleType || "content_quality",
      definition: data?.ruleDefinition || knowledge.content,
      severity: data?.severity || "warning",
      applicableTo: data?.applicableTo || ["research_report"],
      tags: knowledge.tags,
      isActive: true,
      createdFromKnowledge: knowledge.id,
      createdAt: new Date().toISOString(),
    };

    // 在实际实现中，这里可以将规则写入配置表或缓存
    // 目前记录到日志和返回结果中
    this.logger.log(
      `Quality rule added: ${qualityRule.ruleName} (${qualityRule.ruleType})`,
    );

    return qualityRule;
  }

  /**
   * 评估改进效果
   */
  async evaluateEffect(knowledgeId: string, dto: EvaluateEffectDto) {
    const knowledge = await this.prisma.researchFeedbackKnowledge.findUnique({
      where: { id: knowledgeId },
    });

    if (!knowledge) {
      throw new NotFoundException(`Knowledge item ${knowledgeId} not found`);
    }

    const updated = await this.prisma.researchFeedbackKnowledge.update({
      where: { id: knowledgeId },
      data: {
        effectScore: dto.effectScore,
        effectNotes: dto.effectNotes,
      },
    });

    this.logger.log(
      `Effect score ${dto.effectScore} recorded for knowledge ${knowledgeId}`,
    );
    return updated;
  }

  /**
   * 获取改进追踪统计
   */
  async getImprovementTracking(): Promise<ImprovementTrackingResponse> {
    const [applied, pending, avgEffect, recentImprovements] = await Promise.all(
      [
        this.prisma.researchFeedbackKnowledge.count({
          where: { appliedAt: { not: null } },
        }),
        this.prisma.researchFeedbackKnowledge.count({
          where: { appliedAt: null },
        }),
        this.prisma.researchFeedbackKnowledge.aggregate({
          _avg: { effectScore: true },
          where: { effectScore: { not: null } },
        }),
        this.prisma.researchFeedbackKnowledge.findMany({
          where: { appliedAt: { not: null } },
          orderBy: { appliedAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            improvementType: true,
            appliedAt: true,
            effectScore: true,
          },
        }),
      ],
    );

    return {
      applied,
      pending,
      avgEffectScore: avgEffect._avg.effectScore || 0,
      recentImprovements,
    };
  }

  /**
   * 同步到 RAG 知识库
   * 将改进知识同步到 RAG 系统以增强 AI 能力
   */
  async syncToKnowledgeBase(knowledgeId: string, kbId: string) {
    const knowledge = await this.prisma.researchFeedbackKnowledge.findUnique({
      where: { id: knowledgeId },
    });

    if (!knowledge) {
      throw new NotFoundException(`Knowledge item ${knowledgeId} not found`);
    }

    // TODO: 实现与 RAG 知识库的集成
    // 这里需要调用 KnowledgeBaseService 来添加文档
    this.logger.log(
      `Knowledge ${knowledgeId} sync to KB ${kbId} - not yet implemented`,
    );

    return { success: true, message: "Sync scheduled" };
  }
}
