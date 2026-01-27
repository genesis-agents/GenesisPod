import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../../ai-engine/llm/services/ai-chat.service";
import {
  ResearchFeedbackSource,
  ResearchFeedbackCategory,
  ResearchFeedbackItemStatus,
  FeedbackPriority,
  AIModelType,
} from "@prisma/client";
import {
  CreateFeedbackItemDto,
  CreateFromAnnotationDto,
  UpdateFeedbackItemDto,
  FeedbackQueryDto,
  AIAnalysisResult,
  FeedbackCluster,
} from "../dto";
import {
  FEEDBACK_ANALYSIS_SYSTEM_PROMPT,
  FEEDBACK_ANALYSIS_USER_PROMPT,
  FEEDBACK_CLUSTERING_SYSTEM_PROMPT,
  FEEDBACK_CLUSTERING_USER_PROMPT,
} from "../prompts/feedback-analysis.prompt";

/**
 * 反馈处理服务
 * 负责反馈的 CRUD、AI 分析和聚类
 */
@Injectable()
export class FeedbackProcessingService {
  private readonly logger = new Logger(FeedbackProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 创建反馈
   */
  async createFeedbackItem(userId: string, dto: CreateFeedbackItemDto) {
    const feedback = await this.prisma.researchFeedbackItem.create({
      data: {
        sourceType: dto.sourceType || ResearchFeedbackSource.MANUAL,
        sourceId: dto.sourceId,
        content: dto.content,
        selectedText: dto.selectedText,
        category: dto.category,
        topicId: dto.topicId,
        reportId: dto.reportId,
        sectionId: dto.sectionId,
        userId,
        status: ResearchFeedbackItemStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        topic: {
          select: { id: true, name: true },
        },
        report: {
          select: { id: true, version: true },
        },
      },
    });

    this.logger.log(`Feedback item ${feedback.id} created by user ${userId}`);
    return feedback;
  }

  /**
   * 从批注创建反馈
   */
  async createFromAnnotation(userId: string, dto: CreateFromAnnotationDto) {
    // 获取批注信息
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: dto.annotationId },
      include: {
        report: {
          include: {
            topic: true,
          },
        },
      },
    });

    if (!annotation) {
      throw new NotFoundException(`Annotation ${dto.annotationId} not found`);
    }

    // 构建反馈内容
    let content = annotation.content;
    if (dto.additionalNotes) {
      content = `${content}\n\n补充说明: ${dto.additionalNotes}`;
    }

    // 创建反馈
    const feedback = await this.prisma.researchFeedbackItem.create({
      data: {
        sourceType: ResearchFeedbackSource.REPORT_ANNOTATION,
        sourceId: dto.annotationId,
        content,
        selectedText: annotation.selectedText,
        topicId: annotation.report.topicId,
        reportId: annotation.reportId,
        userId,
        status: ResearchFeedbackItemStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        topic: {
          select: { id: true, name: true },
        },
        report: {
          select: { id: true, version: true },
        },
      },
    });

    this.logger.log(
      `Feedback item ${feedback.id} created from annotation ${dto.annotationId}`,
    );
    return feedback;
  }

  /**
   * 获取反馈列表
   */
  async getFeedbackItems(query: FeedbackQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.priority) where.priority = filters.priority;
    if (filters.topicId) where.topicId = filters.topicId;
    if (filters.reportId) where.reportId = filters.reportId;
    if (filters.assignedTo) where.assignedTo = filters.assignedTo;

    const [items, total] = await Promise.all([
      this.prisma.researchFeedbackItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          topic: {
            select: { id: true, name: true },
          },
          report: {
            select: { id: true, version: true },
          },
          assignee: {
            select: { id: true, username: true, fullName: true },
          },
        },
      }),
      this.prisma.researchFeedbackItem.count({ where }),
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
   * 获取反馈详情
   */
  async getFeedbackItem(id: string) {
    const feedback = await this.prisma.researchFeedbackItem.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        topic: {
          select: { id: true, name: true, description: true },
        },
        report: {
          select: { id: true, version: true, executiveSummary: true },
        },
        assignee: {
          select: { id: true, username: true, fullName: true },
        },
        knowledgeItem: true,
      },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback item ${id} not found`);
    }

    return feedback;
  }

  /**
   * 更新反馈
   */
  async updateFeedbackItem(id: string, dto: UpdateFeedbackItemDto) {
    const existing = await this.prisma.researchFeedbackItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Feedback item ${id} not found`);
    }

    const updateData: Record<string, unknown> = {};

    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.subcategory !== undefined) updateData.subcategory = dto.subcategory;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.assignedTo !== undefined) updateData.assignedTo = dto.assignedTo;
    if (dto.actionTaken !== undefined) updateData.actionTaken = dto.actionTaken;

    // 如果状态变为已解决相关状态，更新 resolvedAt
    const resolvedStatuses: ResearchFeedbackItemStatus[] = [
      ResearchFeedbackItemStatus.APPROVED,
      ResearchFeedbackItemStatus.APPLIED,
      ResearchFeedbackItemStatus.CLOSED,
    ];
    if (dto.status && resolvedStatuses.includes(dto.status)) {
      updateData.resolvedAt = new Date();
    }

    const updated = await this.prisma.researchFeedbackItem.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        topic: {
          select: { id: true, name: true },
        },
        assignee: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });

    this.logger.log(`Feedback item ${id} updated`);
    return updated;
  }

  /**
   * 删除反馈
   */
  async deleteFeedbackItem(id: string) {
    const existing = await this.prisma.researchFeedbackItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Feedback item ${id} not found`);
    }

    await this.prisma.researchFeedbackItem.delete({
      where: { id },
    });

    this.logger.log(`Feedback item ${id} deleted`);
    return { success: true };
  }

  /**
   * AI 自动分类和分析
   */
  async analyzeAndClassify(feedbackId: string): Promise<AIAnalysisResult> {
    const feedback = await this.prisma.researchFeedbackItem.findUnique({
      where: { id: feedbackId },
      include: {
        report: {
          select: { executiveSummary: true },
        },
      },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback item ${feedbackId} not found`);
    }

    // 更新状态为分析中
    await this.prisma.researchFeedbackItem.update({
      where: { id: feedbackId },
      data: { status: ResearchFeedbackItemStatus.ANALYZING },
    });

    try {
      // 调用 AI 进行分析
      const result = await this.aiChatService.chat({
        messages: [
          { role: "system", content: FEEDBACK_ANALYSIS_SYSTEM_PROMPT },
          {
            role: "user",
            content: FEEDBACK_ANALYSIS_USER_PROMPT({
              content: feedback.content,
              selectedText: feedback.selectedText || undefined,
              reportContext: feedback.report?.executiveSummary?.slice(0, 500),
            }),
          },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "short",
        },
      });

      // 解析 AI 响应
      let analysis: AIAnalysisResult;
      let parseError: Error | null = null;

      try {
        // 提取 JSON 内容
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found in AI response");
        }
      } catch (err) {
        parseError = err as Error;
        // 记录详细错误信息便于调试
        this.logger.error(
          `Failed to parse AI analysis for feedback ${feedbackId}`,
          {
            error: parseError.message,
            rawResponse: result.content.slice(0, 500),
            feedbackContent: feedback.content.slice(0, 200),
          },
        );

        // 创建一个表示解析失败的分析结果
        analysis = {
          summary: "AI 分析响应解析失败，请稍后重试或进行人工审核",
          rootCause: "AI 返回格式异常",
          suggestedAction: "建议人工审核此反馈",
          confidence: 0,
          improvementSuggestions: ["检查 AI 服务状态", "尝试重新分析"],
        };
      }

      // 映射分类和优先级
      const categoryMap: Record<string, ResearchFeedbackCategory> = {
        QUALITY_ISSUE: ResearchFeedbackCategory.QUALITY_ISSUE,
        CONTENT_ERROR: ResearchFeedbackCategory.CONTENT_ERROR,
        FEATURE_REQUEST: ResearchFeedbackCategory.FEATURE_REQUEST,
        IMPROVEMENT: ResearchFeedbackCategory.IMPROVEMENT,
        POSITIVE: ResearchFeedbackCategory.POSITIVE,
      };

      const priorityMap: Record<string, FeedbackPriority> = {
        CRITICAL: FeedbackPriority.CRITICAL,
        HIGH: FeedbackPriority.HIGH,
        NORMAL: FeedbackPriority.NORMAL,
        LOW: FeedbackPriority.LOW,
      };

      // 将 analysis 转为可索引的类型来读取动态字段
      const analysisData = analysis as unknown as {
        category?: string;
        subcategory?: string;
        priority?: string;
      };

      // 如果解析失败，状态设为待审核而非审核中，标记需要人工处理
      const nextStatus = parseError
        ? ResearchFeedbackItemStatus.REVIEWING // 解析失败时仍进入审核，但有错误标记
        : ResearchFeedbackItemStatus.REVIEWING;

      // 更新反馈记录
      await this.prisma.researchFeedbackItem.update({
        where: { id: feedbackId },
        data: {
          status: nextStatus,
          category:
            categoryMap[analysisData.category || ""] ||
            ResearchFeedbackCategory.IMPROVEMENT,
          subcategory: analysisData.subcategory,
          priority:
            priorityMap[analysisData.priority || ""] || FeedbackPriority.NORMAL,
          aiAnalysis: {
            ...analysis,
            parseError: parseError ? parseError.message : undefined,
            analyzedAt: new Date().toISOString(),
          } as object,
        },
      });

      this.logger.log(
        `Feedback item ${feedbackId} analyzed ${parseError ? "with parse error" : "successfully"}`,
      );
      return analysis;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.logger.error(`AI analysis failed for feedback ${feedbackId}`, {
        error: errorMessage,
        feedbackContent: feedback.content.slice(0, 200),
      });

      // 分析失败，恢复状态并记录错误信息
      await this.prisma.researchFeedbackItem.update({
        where: { id: feedbackId },
        data: {
          status: ResearchFeedbackItemStatus.PENDING,
          aiAnalysis: {
            error: `分析失败: ${errorMessage}`,
            failedAt: new Date().toISOString(),
            retryable: true,
          } as object,
        },
      });
      throw error;
    }
  }

  /**
   * 批量处理待分析反馈
   */
  async processPendingFeedback(limit = 10): Promise<number> {
    const pendingFeedback = await this.prisma.researchFeedbackItem.findMany({
      where: { status: ResearchFeedbackItemStatus.PENDING },
      take: limit,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    let processed = 0;
    for (const feedback of pendingFeedback) {
      try {
        await this.analyzeAndClassify(feedback.id);
        processed++;
      } catch (error) {
        this.logger.error(
          `Failed to process feedback ${feedback.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Processed ${processed}/${pendingFeedback.length} pending feedback items`,
    );
    return processed;
  }

  /**
   * 聚类相似反馈
   */
  async clusterSimilarFeedback(
    options: {
      topicId?: string;
      minItems?: number;
    } = {},
  ): Promise<FeedbackCluster[]> {
    const { topicId, minItems = 3 } = options;

    // 获取未聚类的反馈
    const where: Record<string, unknown> = {
      status: {
        in: [
          ResearchFeedbackItemStatus.PENDING,
          ResearchFeedbackItemStatus.REVIEWING,
        ],
      },
    };
    if (topicId) where.topicId = topicId;

    const feedbacks = await this.prisma.researchFeedbackItem.findMany({
      where,
      take: 50, // 限制数量避免 token 过多
      orderBy: { createdAt: "desc" },
    });

    if (feedbacks.length < minItems) {
      return [];
    }

    // 调用 AI 进行聚类
    const result = await this.aiChatService.chat({
      messages: [
        { role: "system", content: FEEDBACK_CLUSTERING_SYSTEM_PROMPT },
        {
          role: "user",
          content: FEEDBACK_CLUSTERING_USER_PROMPT(
            feedbacks.map((f) => ({
              id: f.id,
              content: f.content,
              selectedText: f.selectedText || undefined,
            })),
          ),
        },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "low",
        outputLength: "medium",
      },
    });

    // 解析聚类结果
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return (parsed.clusters || []).map(
          (c: Record<string, unknown>, i: number) => ({
            clusterId: `cluster-${i + 1}`,
            theme: c.theme,
            feedbackIds: c.feedbackIds,
            count: (c.feedbackIds as string[]).length,
            priority: c.priority,
            suggestedCategory: c.suggestedCategory,
          }),
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to parse clustering result: ${error}`);
    }

    return [];
  }

  /**
   * 获取反馈统计
   */
  async getStats(topicId?: string) {
    const where = topicId ? { topicId } : {};

    const [total, byCategory, byStatus, byPriority, recentTrend] =
      await Promise.all([
        this.prisma.researchFeedbackItem.count({ where }),
        this.prisma.researchFeedbackItem.groupBy({
          by: ["category"],
          where,
          _count: true,
        }),
        this.prisma.researchFeedbackItem.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        this.prisma.researchFeedbackItem.groupBy({
          by: ["priority"],
          where,
          _count: true,
        }),
        this.getRecentTrend(topicId),
      ]);

    return {
      total,
      byCategory: Object.fromEntries(
        byCategory.map((b) => [b.category, b._count]),
      ),
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
      byPriority: Object.fromEntries(
        byPriority.map((b) => [b.priority, b._count]),
      ),
      recentTrend,
    };
  }

  /**
   * 获取最近7天趋势
   */
  private async getRecentTrend(topicId?: string) {
    const days = 7;
    const result: { date: string; count: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const where: Record<string, unknown> = {
        createdAt: {
          gte: date,
          lt: nextDate,
        },
      };
      if (topicId) where.topicId = topicId;

      const count = await this.prisma.researchFeedbackItem.count({ where });
      result.push({
        date: date.toISOString().split("T")[0],
        count,
      });
    }

    return result;
  }
}
