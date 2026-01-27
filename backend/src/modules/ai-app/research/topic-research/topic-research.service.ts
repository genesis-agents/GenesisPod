import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Observable, Subject, filter, map } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import {
  CreateTopicDto,
  UpdateTopicDto,
  ListTopicsDto,
  TriggerRefreshDto,
  CancelRefreshDto,
  RefreshDimensionDto,
  AddDimensionDto,
  UpdateDimensionDto,
  ReorderDimensionsDto,
  ListReportsDto,
  ExportReportDto,
  CompareReportsDto,
  ListEvidenceDto,
  GetTemplatesDto,
  CreateFromTemplateDto,
  UpdateScheduleDto,
  ListLogsDto,
} from "./dto";
import {
  ResearchTopicType,
  ResearchTopicStatus,
  RefreshFrequency,
  DimensionStatus,
  AIModelType,
} from "@prisma/client";
import {
  TopicTeamOrchestratorService,
  ReportSynthesisService,
  TopicRefreshScheduler,
  EvidenceManagementService,
  RefreshProgressEvent,
  ReportChangeService,
  ReportAnnotationService,
  ResearchStrategyService,
  AgentActivityService,
  CredibilityReportService,
} from "./services";
import { AIEngineFacade } from "../../../ai-engine/facade";
import {
  REPORT_EDITING_SYSTEM_PROMPT,
  buildEditPrompt,
  buildEnhancedEditPrompt,
} from "./prompts";
import { ExportOrchestratorService } from "../../../../common/export/services/export-orchestrator.service";
import { CreditsService } from "../../../credits/credits.service";
import { ExportFormat } from "@prisma/client";

// 导入维度模板
const MACRO_INSIGHT_DIMENSIONS = [
  {
    id: "policy",
    name: "政策法规",
    description: "政府政策、法规和激励措施",
    sortOrder: 1,
    searchQueries: [
      "{topic} government policy",
      "{topic} regulation 2024 2025",
      "{topic} legislative updates",
      "{topic} policy framework",
    ],
    // ★ 启用政策专业工具
    searchSources: [
      "web",
      "federal-register",
      "congress-gov",
      "whitehouse-news",
    ],
    minSources: 5,
  },
  {
    id: "market",
    name: "市场概览",
    description: "市场规模、增长趋势和细分",
    sortOrder: 2,
    searchQueries: [
      "{topic} market size",
      "{topic} market growth forecast",
      "{topic} industry analysis",
      "{topic} market segmentation",
    ],
    searchSources: ["web", "local"],
    minSources: 6,
  },
  {
    id: "competition",
    name: "竞争格局",
    description: "主要玩家、市场份额、定位",
    sortOrder: 3,
    searchQueries: [
      "{topic} market leaders",
      "{topic} competitive landscape",
      "{topic} key players analysis",
      "{topic} market share",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
  {
    id: "technology",
    name: "技术趋势",
    description: "新兴技术、研发方向",
    sortOrder: 4,
    searchQueries: [
      "{topic} emerging technology",
      "{topic} technology trends",
      "{topic} innovation breakthroughs",
      "{topic} R&D direction",
    ],
    // ★ academic 映射到 ArXiv 搜索
    searchSources: ["academic", "github", "web", "hackernews"],
    minSources: 6,
  },
  {
    id: "investment",
    name: "投资动态",
    description: "融资轮次、并购、IPO",
    sortOrder: 5,
    searchQueries: [
      "{topic} funding rounds",
      "{topic} M&A activity",
      "{topic} investment trends",
      "{topic} venture capital",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
  {
    id: "talent",
    name: "人才生态",
    description: "人才、教育、研究机构",
    sortOrder: 6,
    searchQueries: [
      "{topic} talent landscape",
      "{topic} research institutions",
      "{topic} workforce analysis",
      "{topic} education programs",
    ],
    searchSources: ["web", "academic", "github"],
    minSources: 5,
  },
  {
    id: "international",
    name: "国际动态",
    description: "跨境活动、地缘政治",
    sortOrder: 7,
    searchQueries: [
      "{topic} international cooperation",
      "{topic} global competition",
      "{topic} cross-border trends",
      "{topic} geopolitics",
    ],
    // ★ 启用政策专业工具
    searchSources: [
      "web",
      "federal-register",
      "congress-gov",
      "whitehouse-news",
    ],
    minSources: 5,
  },
  {
    id: "application",
    name: "行业应用",
    description: "行业特定采用情况",
    sortOrder: 8,
    searchQueries: [
      "{topic} industry adoption",
      "{topic} use cases",
      "{topic} application areas",
      "{topic} deployment scenarios",
    ],
    searchSources: ["web", "hackernews", "github"],
    minSources: 5,
  },
];

const TECH_INSIGHT_DIMENSIONS = [
  {
    id: "principle",
    name: "技术原理",
    description: "核心原理、物理机制、理论基础",
    sortOrder: 1,
    searchQueries: [
      "{topic} technical principle",
      "{topic} how it works",
      "{topic} underlying mechanism",
      "{topic} theoretical foundation",
    ],
    // ★ academic 映射到 ArXiv 搜索
    searchSources: ["academic", "web"],
    minSources: 6,
  },
  {
    id: "frontier",
    name: "前沿水平",
    description: "当前能力、性能指标、技术基准",
    sortOrder: 2,
    searchQueries: [
      "{topic} state of the art",
      "{topic} performance benchmarks",
      "{topic} latest capabilities",
      "{topic} technical specifications",
    ],
    searchSources: ["academic", "github", "web"],
    minSources: 6,
  },
  {
    id: "players",
    name: "主要玩家",
    description: "企业、实验室、关键研究者",
    sortOrder: 3,
    searchQueries: [
      "{topic} key players",
      "{topic} leading researchers",
      "{topic} research labs",
      "{topic} companies developing",
    ],
    searchSources: ["academic", "github", "web"],
    minSources: 5,
  },
  {
    id: "patents",
    name: "专利分析",
    description: "IP 活动、核心专利、专利趋势",
    sortOrder: 4,
    searchQueries: [
      "{topic} patents",
      "{topic} intellectual property",
      "{topic} patent landscape",
      "{topic} IP trends",
    ],
    searchSources: ["web", "academic"],
    minSources: 5,
  },
  {
    id: "applications",
    name: "应用场景",
    description: "当前和潜在应用",
    sortOrder: 5,
    searchQueries: [
      "{topic} applications",
      "{topic} use cases",
      "{topic} real world deployment",
      "{topic} industry applications",
    ],
    searchSources: ["web", "github", "hackernews"],
    minSources: 5,
  },
  {
    id: "commercialization",
    name: "商业化状态",
    description: "产品、市场成熟度、TRL",
    sortOrder: 6,
    searchQueries: [
      "{topic} commercialization",
      "{topic} market readiness",
      "{topic} products available",
      "{topic} technology readiness level",
    ],
    searchSources: ["web", "github"],
    minSources: 5,
  },
  {
    id: "challenges",
    name: "挑战限制",
    description: "技术障碍、工程挑战、成本问题",
    sortOrder: 7,
    searchQueries: [
      "{topic} challenges",
      "{topic} limitations",
      "{topic} technical barriers",
      "{topic} engineering difficulties",
    ],
    searchSources: ["academic", "web", "hackernews"],
    minSources: 5,
  },
  {
    id: "roadmap",
    name: "未来路线",
    description: "预测、发展方向、研究热点",
    sortOrder: 8,
    searchQueries: [
      "{topic} future roadmap",
      "{topic} research directions",
      "{topic} next generation",
      "{topic} future outlook",
    ],
    searchSources: ["academic", "web"],
    minSources: 5,
  },
];

const COMPANY_INSIGHT_DIMENSIONS = [
  {
    id: "overview",
    name: "公司概况",
    description: "背景、使命、历史、领导层",
    sortOrder: 1,
    searchQueries: [
      "{company} company overview",
      "{company} about",
      "{company} history",
      "{company} mission vision",
      "{company} leadership team",
    ],
    searchSources: ["web"],
    minSources: 5,
  },
  {
    id: "products",
    name: "产品服务",
    description: "产品组合、功能、定价",
    sortOrder: 2,
    searchQueries: [
      "{company} products",
      "{company} services",
      "{company} product portfolio",
      "{company} pricing",
    ],
    searchSources: ["web", "hackernews", "github"],
    minSources: 5,
  },
  {
    id: "business-model",
    name: "商业模式",
    description: "收入来源、变现方式",
    sortOrder: 3,
    searchQueries: [
      "{company} business model",
      "{company} revenue model",
      "{company} monetization",
      "{company} how they make money",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
  {
    id: "financials",
    name: "财务表现",
    description: "营收、融资、估值",
    sortOrder: 4,
    searchQueries: [
      "{company} revenue",
      "{company} funding",
      "{company} valuation",
      "{company} financial performance",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
  {
    id: "technology",
    name: "技术研发",
    description: "核心技术、创新、专利、人才",
    sortOrder: 5,
    searchQueries: [
      "{company} technology",
      "{company} research",
      "{company} innovation",
      "{company} patents",
    ],
    searchSources: ["github", "academic", "web"],
    minSources: 6,
  },
  {
    id: "market-position",
    name: "市场地位",
    description: "竞争定位、市场份额、差异化",
    sortOrder: 6,
    searchQueries: [
      "{company} market position",
      "{company} market share",
      "{company} competitive advantage",
      "{company} vs competitors",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
  {
    id: "strategy",
    name: "战略动态",
    description: "合作、并购、扩张、近期新闻",
    sortOrder: 7,
    searchQueries: [
      "{company} strategy",
      "{company} partnerships",
      "{company} acquisitions",
      "{company} expansion",
      "{company} news 2024 2025",
    ],
    searchSources: ["web", "hackernews"],
    minSources: 6,
  },
  {
    id: "swot",
    name: "SWOT 分析",
    description: "优势、劣势、机会、威胁",
    sortOrder: 8,
    searchQueries: [
      "{company} strengths weaknesses",
      "{company} opportunities threats",
      "{company} SWOT analysis",
      "{company} challenges",
    ],
    searchSources: ["web", "local"],
    minSources: 5,
  },
];

/**
 * 清理AI生成内容中的HTML标签
 * 主要处理 <br> 标签转换为换行，其他标签移除
 * @param content 原始内容
 * @returns 清理后的内容
 */
function cleanHtmlTagsFromContent(
  content: string | null | undefined,
): string | null {
  if (!content) return content as null;

  let cleaned = content;

  // 1. 将 <br>, <br/>, <br /> 转换为换行符
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");

  // 2. 将 </p><p> 转换为双换行（段落分隔）
  cleaned = cleaned.replace(/<\/p>\s*<p>/gi, "\n\n");

  // 3. 将 <p> 和 </p> 单独出现时转换为换行
  cleaned = cleaned.replace(/<\/?p>/gi, "\n");

  // 4. 移除其他常见HTML标签但保留内容
  cleaned = cleaned.replace(
    /<\/?(?:div|span|strong|em|b|i|u|a|ul|ol|li|h[1-6])[^>]*>/gi,
    "",
  );

  // 5. 清理多余的连续换行（超过2个变成2个）
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 6. 清理行首行尾的空白
  cleaned = cleaned.trim();

  return cleaned;
}

@Injectable()
export class TopicResearchService {
  private readonly logger = new Logger(TopicResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly orchestrator: TopicTeamOrchestratorService,
    private readonly reportService: ReportSynthesisService,
    private readonly scheduler: TopicRefreshScheduler,
    private readonly evidenceService: EvidenceManagementService,
    private readonly aiFacade: AIEngineFacade,
    private readonly reportChangeService: ReportChangeService,
    private readonly reportAnnotationService: ReportAnnotationService,
    private readonly exportOrchestrator: ExportOrchestratorService,
    private readonly researchStrategyService: ResearchStrategyService,
    private readonly agentActivityService: AgentActivityService,
    private readonly credibilityReportService: CredibilityReportService,
    private readonly creditsService: CreditsService,
  ) {}

  // ==================== Topics CRUD ====================

  /**
   * 创建专题
   *
   * ★ v8.0: 不再使用固定模板创建维度
   * - 如果用户提供了自定义维度，使用用户的
   * - 否则不创建任何维度，等到开始研究时由 Leader AI 自主规划
   * - 这确保了维度与主题名称的语义匹配，而不是使用通用模板
   */
  async createTopic(userId: string, dto: CreateTopicDto) {
    this.logger.log(`Creating topic for user ${userId}: ${dto.name}`);
    // ★ Debug: 详细记录接收到的 topicConfig
    this.logger.log(
      `★ [createTopic] Received topicConfig: ${JSON.stringify(dto.topicConfig)}`,
    );
    this.logger.log(
      `★ [createTopic] Full DTO keys: ${Object.keys(dto).join(", ")}`,
    );

    // ★ v8.0: 只有用户明确提供维度时才创建
    // 否则维度将在研究开始时由 Leader AI 根据主题名称动态规划
    const dimensionsToCreate =
      dto.dimensions && dto.dimensions.length > 0 ? dto.dimensions : [];

    // 使用事务创建专题和维度
    return this.prisma.$transaction(async (tx) => {
      // 创建专题
      const topic = await tx.researchTopic.create({
        data: {
          userId,
          name: dto.name,
          description: dto.description,
          type: dto.type,
          topicConfig: dto.topicConfig || {},
          icon: dto.icon,
          color: dto.color,
          refreshFrequency: dto.refreshFrequency || RefreshFrequency.MANUAL,
          visibility: dto.visibility || "PRIVATE", // ★ 默认私有
          status: ResearchTopicStatus.DRAFT,
        },
      });

      // 只有用户提供了自定义维度时才创建
      let dimensions: any[] = [];
      if (dimensionsToCreate.length > 0) {
        dimensions = await Promise.all(
          dimensionsToCreate.map((dim, index) =>
            tx.topicDimension.create({
              data: {
                topicId: topic.id,
                name: dim.name,
                description: dim.description,
                sortOrder: dim.sortOrder ?? index + 1,
                searchQueries: dim.searchQueries || [],
                searchSources: dim.searchSources || [],
                minSources: dim.minSources ?? 5,
                isEnabled: "isEnabled" in dim ? (dim.isEnabled ?? true) : true,
                status: DimensionStatus.PENDING,
              },
            }),
          ),
        );
        this.logger.log(
          `Created topic ${topic.id} with ${dimensions.length} user-defined dimensions`,
        );
      } else {
        this.logger.log(
          `Created topic ${topic.id} without dimensions (will be planned by Leader AI)`,
        );
      }

      return {
        ...topic,
        dimensions,
      };
    });
  }

  /**
   * 获取专题列表
   *
   * 权限规则：
   * - 私有(PRIVATE)：只有创建者可见
   * - 团队(SHARED)：创建者 + 协作者可见
   * - 公开(PUBLIC)：所有登录用户可见
   */
  async listTopics(userId: string, query: ListTopicsDto) {
    const { type, status, search, skip = 0, take = 20 } = query;

    // 获取用户作为协作者的专题ID列表
    const collaboratorTopicIds = await this.prisma.topicCollaborator
      .findMany({
        where: { userId, isActive: true },
        select: { topicId: true },
      })
      .then((results) => results.map((r) => r.topicId));

    // 使用原始SQL获取可见的专题ID
    // 权限规则：
    // 1. 自己创建的（任何visibility）
    // 2. visibility为PUBLIC的
    // 3. 自己是协作者的（visibility为SHARED）
    const visibleTopicIds = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM research_topics
      WHERE "user_id" = ${userId}
         OR visibility = 'PUBLIC'
         OR (visibility = 'SHARED' AND id = ANY(${collaboratorTopicIds}::text[]))
    `;

    const topicIds = visibleTopicIds.map((t) => t.id);

    // 构建最终查询条件
    const where: any = {
      id: { in: topicIds },
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    // 并行执行查询和计数
    const [rawTopics, total] = await Promise.all([
      this.prisma.researchTopic.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          dimensions: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              sortOrder: true,
            },
          },
          // ★ 包含最新【有内容的】报告以获取 totalSources 和 lastRefreshAt
          // 跳过空草稿报告（需有维度分析记录）
          reports: {
            where: {
              dimensionAnalyses: { some: {} },
            },
            orderBy: { generatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              totalSources: true,
              generatedAt: true,
            },
          },
          // ★ 包含最新 Mission 以获取任务进度（Card 显示用）
          missions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              totalTasks: true,
              completedTasks: true,
              progressPercent: true,
            },
          },
          _count: {
            select: {
              reports: true,
              dimensions: true,
            },
          },
        },
      }),
      this.prisma.researchTopic.count({ where }),
    ]);

    // ★ 映射数据，确保 totalReports/totalSources/lastRefreshAt 从实际数据计算
    const topics = rawTopics.map((topic) => {
      const latestReport = topic.reports?.[0];
      const latestMission = topic.missions?.[0];
      return {
        ...topic,
        totalReports: topic._count?.reports || 0,
        totalSources: latestReport?.totalSources || topic.totalSources || 0,
        lastRefreshAt: latestReport?.generatedAt || topic.lastRefreshAt,
        // ★ 任务进度数据（优先使用 Mission 数据，Card 显示用）
        missionTotalTasks: latestMission?.totalTasks ?? 0,
        missionCompletedTasks: latestMission?.completedTasks ?? 0,
        missionProgress: latestMission?.progressPercent ?? 0,
        missionStatus: latestMission?.status ?? null,
        // 移除 reports 和 missions 数组，避免返回多余数据
        reports: undefined,
        missions: undefined,
      };
    });

    return {
      topics,
      total,
      skip,
      take,
    };
  }

  /**
   * 获取专题详情
   *
   * 权限规则：
   * - 私有(PRIVATE)：只有创建者可见
   * - 团队(SHARED)：创建者 + 协作者可见
   * - 公开(PUBLIC)：所有登录用户可见
   */
  async getTopic(userId: string, topicId: string) {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: {
        dimensions: {
          orderBy: { sortOrder: "asc" },
        },
        // ★ 只获取有内容的报告，跳过空草稿（需有维度分析记录）
        reports: {
          where: {
            dimensionAnalyses: { some: {} },
          },
          orderBy: { generatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            generatedAt: true,
            executiveSummary: true,
            totalSources: true,
          },
        },
        _count: {
          select: {
            reports: true,
            refreshLogs: true,
          },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 检查访问权限
    const hasAccess = await this.checkTopicAccess(
      userId,
      topicId,
      topic.userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }

    return topic;
  }

  /**
   * 检查用户是否有权访问专题
   *
   * @returns true 如果用户有权访问
   */
  private async checkTopicAccess(
    userId: string,
    topicId: string,
    ownerId: string,
  ): Promise<boolean> {
    // 1. 创建者始终有权限
    if (userId === ownerId) {
      return true;
    }

    // 2. 检查visibility和协作者状态
    const result = await this.prisma.$queryRaw<
      { visibility: string; is_collaborator: boolean }[]
    >`
      SELECT
        rt.visibility,
        EXISTS(
          SELECT 1 FROM research_topic_collaborators tc
          WHERE tc."topic_id" = rt.id
            AND tc."user_id" = ${userId}
            AND tc."is_active" = true
        ) as is_collaborator
      FROM research_topics rt
      WHERE rt.id = ${topicId}
    `;

    if (!result.length) {
      return false;
    }

    const { visibility, is_collaborator } = result[0];

    // PUBLIC: 所有登录用户可见
    if (visibility === "PUBLIC") {
      return true;
    }

    // SHARED: 协作者可见
    if (visibility === "SHARED" && is_collaborator) {
      return true;
    }

    // PRIVATE: 只有创建者可见（已在上面检查过）
    return false;
  }

  /**
   * 更新专题
   */
  async updateTopic(userId: string, topicId: string, dto: UpdateTopicDto) {
    // 先验证所有权
    const existing = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to update this topic",
      );
    }

    // 更新专题
    const updated = await this.prisma.researchTopic.update({
      where: { id: topicId },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        topicConfig: dto.topicConfig,
        icon: dto.icon,
        color: dto.color,
        refreshFrequency: dto.refreshFrequency,
      },
      include: {
        dimensions: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    this.logger.log(`Updated topic ${topicId}`);
    return updated;
  }

  /**
   * 删除专题
   */
  async deleteTopic(userId: string, topicId: string) {
    // 验证所有权
    const existing = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!existing) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to delete this topic",
      );
    }

    // 级联删除（Prisma schema 中已配置 onDelete: Cascade）
    await this.prisma.researchTopic.delete({
      where: { id: topicId },
    });

    this.logger.log(`Deleted topic ${topicId}`);
    return { success: true };
  }

  // ==================== Refresh Operations ====================

  /**
   * 触发刷新
   */
  async triggerRefresh(
    userId: string,
    topicId: string,
    dto: TriggerRefreshDto,
  ) {
    // 验证专题所有权
    const topic = await this.getTopic(userId, topicId);

    // 扣除积分（专题研究消耗大量 AI tokens）
    try {
      await this.creditsService.consumeCredits({
        userId,
        moduleType: "topic-research",
        operationType: "refresh",
        referenceId: topicId,
        description: `专题研究刷新: ${topic.name}`,
      });
      this.logger.log(`Deducted credits for topic research: ${topicId}`);
    } catch (error) {
      this.logger.error(`Failed to deduct credits: ${error}`);
      throw error; // 积分不足则阻止执行
    }

    // 根据刷新类型决定是否增量刷新
    const isIncremental = dto.type === "INCREMENTAL";

    // 执行刷新
    const report = await this.orchestrator.executeRefresh(topic, {
      forceRefresh: dto.type === "FULL",
      dimensionIds: dto.dimensionIds,
      incremental: isIncremental,
    });

    return {
      success: true,
      reportId: report.id,
      message: "刷新完成",
    };
  }

  /**
   * 获取研究策略建议
   *
   * 智能分析主题状态并推荐研究策略
   */
  async getResearchStrategy(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.researchStrategyService.analyzeAndRecommend(topicId);
  }

  /**
   * 快速检查研究状态（用于前端按钮显示）
   */
  async quickCheckResearchStatus(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.researchStrategyService.quickCheck(topicId);
  }

  /**
   * 智能开始研究
   *
   * 根据主题状态自动决定研究策略：
   * - 从未研究过 → 全新研究
   * - 有部分过期 → 增量更新
   * - 全部过期 → 全量刷新
   */
  async smartStartResearch(userId: string, topicId: string) {
    // 验证专题所有权
    const topic = await this.getTopic(userId, topicId);

    // 获取智能策略
    const smartOptions =
      await this.researchStrategyService.getSmartRefreshOptions(topicId);

    this.logger.log(
      `Smart research for topic ${topicId}: ${smartOptions.strategy} - ${smartOptions.message}`,
    );

    // 执行研究
    const report = await this.orchestrator.executeRefresh(topic, {
      forceRefresh: smartOptions.forceRefresh,
      dimensionIds: smartOptions.dimensionIds,
      incremental: smartOptions.incremental,
    });

    return {
      success: true,
      reportId: report.id,
      strategy: smartOptions.strategy,
      message: smartOptions.message,
    };
  }

  /**
   * 获取 Agent 活动记录（按维度分组）
   */
  async getAgentActivities(
    userId: string,
    topicId: string,
    missionId?: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.agentActivityService.getActivitiesByDimension(
      topicId,
      missionId,
    );
  }

  /**
   * 获取 Agent 活动统计
   */
  async getAgentActivityStats(
    userId: string,
    topicId: string,
    missionId?: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.agentActivityService.getActivityStats(topicId, missionId);
  }

  /**
   * 获取报告的可信度评估
   */
  async getCredibilityReport(userId: string, reportId: string) {
    // 获取报告及其专题信息
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: { select: { id: true, userId: true } } },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, report.topic.id);

    return this.credibilityReportService.getOrGenerateCredibilityReport(
      reportId,
    );
  }

  /**
   * 重新生成可信度报告
   */
  async regenerateCredibilityReport(userId: string, reportId: string) {
    // 验证报告所有权
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: { select: { userId: true } } },
    });

    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    return this.credibilityReportService.generateCredibilityReport(reportId);
  }

  /**
   * ★ 重新合成报告内容
   * 用于修复已保存报告中的格式问题（如下划线等）
   */
  async regenerateReportContent(userId: string, reportId: string) {
    // 验证报告所有权
    const report = await this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: { topic: true },
    });

    if (!report || report.topic.userId !== userId) {
      throw new NotFoundException("Report not found");
    }

    // 调用报告合成服务重新生成内容
    const updatedReport = await this.reportService.synthesizeReport(
      report.topic,
      reportId,
    );

    this.logger.log(
      `[regenerateReportContent] Report ${reportId} regenerated successfully`,
    );

    return {
      success: true,
      report: updatedReport,
    };
  }

  /**
   * ★ 重新计算证据可信度评分
   */
  async recalculateEvidenceCredibility(reportId: string) {
    return this.evidenceService.recalculateCredibilityScores(reportId);
  }

  /**
   * ★ 重新计算专题统计数据
   * 用于修复历史数据中 totalReports/totalSources/lastRefreshAt 不正确的问题
   */
  async recalculateTopicStats(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 获取报告统计
    const reportStats = await this.prisma.topicReport.aggregate({
      where: { topicId },
      _count: { id: true },
      _max: { generatedAt: true },
    });

    // 获取最新报告的 totalSources
    const latestReport = await this.prisma.topicReport.findFirst({
      where: { topicId },
      orderBy: { generatedAt: "desc" },
      select: { totalSources: true },
    });

    // 更新专题统计
    const updatedTopic = await this.prisma.researchTopic.update({
      where: { id: topicId },
      data: {
        totalReports: reportStats._count.id || 0,
        totalSources: latestReport?.totalSources || 0,
        lastRefreshAt: reportStats._max.generatedAt,
      },
    });

    this.logger.log(
      `Recalculated stats for topic ${topicId}: ` +
        `reports=${updatedTopic.totalReports}, sources=${updatedTopic.totalSources}`,
    );

    return updatedTopic;
  }

  /**
   * 获取研究历史时间线 (Phase 2.3)
   */
  async getResearchHistory(userId: string, topicId: string, limit?: number) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 获取所有研究任务（Mission）
    const missions = await this.prisma.researchMission.findMany({
      where: { topicId },
      orderBy: { createdAt: "desc" },
      take: limit || 20,
      include: {
        tasks: {
          select: {
            id: true,
            dimensionId: true,
            dimensionName: true, // ★ 包含维度名称
            status: true,
            createdAt: true,
            completedAt: true,
            result: true, // ★ 包含研究结果（关键发现、摘要等）
            resultSummary: true, // ★ 包含结果摘要
          },
        },
      },
    });

    // 获取所有报告
    const reports = await this.prisma.topicReport.findMany({
      where: { topicId },
      orderBy: { generatedAt: "desc" },
      take: limit || 20,
      select: {
        id: true,
        version: true,
        generatedAt: true,
        totalSources: true,
      },
    });

    // 转换为时间线格式
    const timeline: Array<{
      id: string;
      type: "mission" | "report";
      timestamp: Date;
      title: string;
      description: string;
      status?: string;
      metadata?: Record<string, unknown>;
    }> = [];

    // 添加 Mission 记录（使用索引避免 indexOf 的 O(n²) 性能问题）
    for (let i = 0; i < missions.length; i++) {
      const mission = missions[i];
      const completedTasks = mission.tasks.filter(
        (t) => t.status === "COMPLETED",
      );
      const totalTasks = mission.tasks.length;

      // ★ 提取已完成任务的维度名称
      const dimensionsUpdated = completedTasks
        .filter((t) => t.dimensionName)
        .map((t) => t.dimensionName!);

      // ★ 提取每个维度的研究结果（关键发现、摘要等）
      // 只包含有实际内容的结果（有 summary、keyFindings 或 resultSummary）
      const dimensionResults = completedTasks
        .filter((t) => {
          if (!t.dimensionName) return false;
          // 检查是否有实际内容
          const result = t.result as Record<string, unknown> | null;
          const hasResultContent =
            result &&
            (result.summary ||
              result.keyFindings ||
              result.sourcesFound ||
              result.wordCount);
          return hasResultContent || t.resultSummary;
        })
        .map((t) => ({
          dimensionName: t.dimensionName!,
          result: t.result,
          resultSummary: t.resultSummary,
        }));

      timeline.push({
        id: mission.id,
        type: "mission",
        timestamp: mission.createdAt,
        title: `研究任务 #${i + 1}`,
        description: `完成 ${completedTasks.length}/${totalTasks} 个维度研究`,
        status: mission.status,
        metadata: {
          completedTasks: completedTasks.length,
          totalTasks,
          completedAt: mission.completedAt,
          dimensionsUpdated, // ★ 已更新的维度名称列表
          dimensionResults, // ★ 每个维度的研究结果
        },
      });
    }

    // 添加报告记录
    for (const report of reports) {
      timeline.push({
        id: report.id,
        type: "report",
        timestamp: report.generatedAt,
        title: `研究报告 v${report.version}`,
        description: `${report.totalSources || 0} 条来源`,
        metadata: {
          version: report.version,
          totalSources: report.totalSources,
        },
      });
    }

    // 按时间排序
    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      timeline,
      totalMissions: missions.length,
      totalReports: reports.length,
    };
  }

  /**
   * 获取刷新状态
   */
  async getRefreshStatus(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const status = this.orchestrator.getRefreshStatus(topicId);

    // 获取最近的刷新日志
    const latestLog = await this.prisma.topicRefreshLog.findFirst({
      where: { topicId },
      orderBy: { startedAt: "desc" },
    });

    return {
      isRunning: status.isRunning,
      startedAt: status.startedAt,
      latestLog,
    };
  }

  /**
   * 监听刷新进度 (SSE)
   */
  streamRefreshProgress(
    _userId: string,
    topicId: string,
  ): Observable<MessageEvent> {
    // 创建一个 Subject 来发送事件
    const subject = new Subject<RefreshProgressEvent>();

    // 监听事件
    const listener = (event: RefreshProgressEvent) => {
      if (event.topicId === topicId) {
        subject.next(event);
      }
    };

    this.eventEmitter.on("topic-research.progress", listener);

    // 当客户端断开连接时清理
    subject.subscribe({
      complete: () => {
        this.eventEmitter.off("topic-research.progress", listener);
      },
    });

    // 转换为 MessageEvent
    return subject.pipe(
      filter(
        (event): event is RefreshProgressEvent => event.topicId === topicId,
      ),
      map(
        (event) =>
          ({
            data: JSON.stringify(event),
          }) as MessageEvent,
      ),
    );
  }

  /**
   * 取消刷新
   */
  async cancelRefresh(userId: string, topicId: string, _dto: CancelRefreshDto) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const cancelled = await this.orchestrator.cancelRefresh(topicId);

    return {
      success: cancelled,
      message: cancelled ? "刷新已取消" : "没有正在进行的刷新",
    };
  }

  // ==================== Dimensions ====================

  /**
   * 获取维度列表
   */
  async listDimensions(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const dimensions = await this.prisma.topicDimension.findMany({
      where: { topicId },
      orderBy: { sortOrder: "asc" },
    });

    return dimensions;
  }

  /**
   * 添加维度
   */
  async addDimension(userId: string, topicId: string, dto: AddDimensionDto) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 如果没有指定 sortOrder，设置为最大值 + 1
    let sortOrder = dto.sortOrder;
    if (!sortOrder) {
      const maxDimension = await this.prisma.topicDimension.findFirst({
        where: { topicId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (maxDimension?.sortOrder || 0) + 1;
    }

    const dimension = await this.prisma.topicDimension.create({
      data: {
        topicId,
        name: dto.name,
        description: dto.description,
        sortOrder,
        searchQueries: dto.searchQueries || [],
        searchSources: dto.searchSources || [],
        minSources: dto.minSources ?? 5,
        isEnabled: true,
        status: DimensionStatus.PENDING,
      },
    });

    this.logger.log(`Added dimension ${dimension.id} to topic ${topicId}`);
    return dimension;
  }

  /**
   * 更新维度
   */
  async updateDimension(
    userId: string,
    topicId: string,
    dimensionId: string,
    dto: UpdateDimensionDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证维度属于该专题
    const existing = await this.prisma.topicDimension.findFirst({
      where: { id: dimensionId, topicId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Dimension ${dimensionId} not found in topic ${topicId}`,
      );
    }

    const updated = await this.prisma.topicDimension.update({
      where: { id: dimensionId },
      data: {
        name: dto.name,
        description: dto.description,
        isEnabled: dto.isEnabled,
        searchQueries: dto.searchQueries,
        searchSources: dto.searchSources,
        sortOrder: dto.sortOrder,
        minSources: dto.minSources,
      },
    });

    this.logger.log(`Updated dimension ${dimensionId}`);
    return updated;
  }

  /**
   * 删除维度
   */
  async deleteDimension(userId: string, topicId: string, dimensionId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证维度属于该专题
    const existing = await this.prisma.topicDimension.findFirst({
      where: { id: dimensionId, topicId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Dimension ${dimensionId} not found in topic ${topicId}`,
      );
    }

    await this.prisma.topicDimension.delete({
      where: { id: dimensionId },
    });

    this.logger.log(`Deleted dimension ${dimensionId}`);
    return { success: true };
  }

  /**
   * 刷新单个维度
   */
  async refreshDimension(
    _userId: string,
    _topicId: string,
    _dimensionId: string,
    _dto: RefreshDimensionDto,
  ) {
    // TODO: Implement refreshDimension (高级功能，暂不实现)
    throw new Error("Not implemented");
  }

  /**
   * 调整维度顺序
   */
  async reorderDimensions(
    userId: string,
    topicId: string,
    dto: ReorderDimensionsDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证所有维度都属于该专题
    const dimensions = await this.prisma.topicDimension.findMany({
      where: {
        id: { in: dto.dimensionIds },
        topicId,
      },
    });

    if (dimensions.length !== dto.dimensionIds.length) {
      throw new NotFoundException("Some dimensions not found in this topic");
    }

    // 使用事务更新所有维度的 sortOrder
    await this.prisma.$transaction(
      dto.dimensionIds.map((dimensionId, index) =>
        this.prisma.topicDimension.update({
          where: { id: dimensionId },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    this.logger.log(
      `Reordered ${dto.dimensionIds.length} dimensions in topic ${topicId}`,
    );
    return { success: true };
  }

  // ==================== Reports ====================

  /**
   * 获取报告列表
   */
  async listReports(userId: string, topicId: string, query: ListReportsDto) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    return this.reportService.listReports(topicId, {
      skip: 0, // cursor-based pagination not implemented yet
      take: query.limit || 10,
    });
  }

  /**
   * 获取最新报告
   */
  async getLatestReport(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getLatestReport(topicId);

    if (!report) {
      throw new NotFoundException("No reports found for this topic");
    }

    // 转换报告数据，提取 dataPoints 中的字段到顶层
    return this.transformReportForFrontend(report);
  }

  /**
   * 获取指定版本报告
   */
  async getReport(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 转换报告数据，提取 dataPoints 中的字段到顶层
    return this.transformReportForFrontend(report);
  }

  /**
   * 删除报告（仅管理员/所有者）
   */
  async deleteReport(userId: string, topicId: string, reportId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 使用事务删除报告及其关联数据
    await this.prisma.$transaction(async (tx) => {
      // 1. 删除维度分析
      await tx.dimensionAnalysis.deleteMany({
        where: { reportId },
      });

      // 2. 删除报告修订历史
      await tx.topicReportRevision.deleteMany({
        where: { reportId },
      });

      // 3. 删除报告批注
      await tx.reportAnnotation.deleteMany({
        where: { reportId },
      });

      // 4. 删除报告变更记录
      await tx.reportChange.deleteMany({
        where: { reportId },
      });

      // 5. 删除报告本身
      await tx.topicReport.delete({
        where: { id: reportId },
      });
    });

    this.logger.log(
      `[deleteReport] Report ${reportId} deleted by user ${userId}`,
    );

    return { success: true, message: "Report deleted successfully" };
  }

  /**
   * 转换报告数据以适配前端接口
   * 主要将 dataPoints JSON 字段中的内容提取到顶层
   * ★ 同时清理AI生成内容中的HTML标签（如<br>）
   */
  private transformReportForFrontend(report: any) {
    if (!report) return report;

    // ★ 清理报告级别的内容字段
    if (report.executiveSummary) {
      report.executiveSummary = cleanHtmlTagsFromContent(
        report.executiveSummary,
      );
    }
    if (report.fullReport) {
      report.fullReport = cleanHtmlTagsFromContent(report.fullReport);
    }

    // 转换维度分析数据
    if (report.dimensionAnalyses) {
      report.dimensionAnalyses = report.dimensionAnalyses.map(
        (analysis: any) => {
          const dataPoints = analysis.dataPoints as {
            trends?: any[];
            challenges?: any[];
            opportunities?: any[];
            confidenceLevel?: string;
            detailedContent?: string;
          } | null;

          // ★ 清理维度分析中的文本内容
          const cleanedAnalysis = cleanHtmlTagsFromContent(analysis.analysis);
          const cleanedSummary = cleanHtmlTagsFromContent(analysis.summary);
          const cleanedDetailedContent = cleanHtmlTagsFromContent(
            dataPoints?.detailedContent,
          );

          // ★ 清理 keyFindings 中的文本
          const cleanedKeyFindings =
            analysis.keyFindings?.map((kf: any) => ({
              ...kf,
              finding: cleanHtmlTagsFromContent(kf.finding),
              implication: cleanHtmlTagsFromContent(kf.implication),
            })) || [];

          // ★ 清理趋势、挑战、机会中的文本
          const cleanedTrends = (dataPoints?.trends || []).map((t: any) => ({
            ...t,
            trend: cleanHtmlTagsFromContent(t.trend),
            drivers: cleanHtmlTagsFromContent(t.drivers),
            prediction: cleanHtmlTagsFromContent(t.prediction),
          }));

          const cleanedChallenges = (dataPoints?.challenges || []).map(
            (c: any) => ({
              ...c,
              challenge: cleanHtmlTagsFromContent(c.challenge),
              rootCause: cleanHtmlTagsFromContent(c.rootCause),
              impact: cleanHtmlTagsFromContent(c.impact),
              potentialSolutions: cleanHtmlTagsFromContent(
                c.potentialSolutions,
              ),
            }),
          );

          const cleanedOpportunities = (dataPoints?.opportunities || []).map(
            (o: any) => ({
              ...o,
              opportunity: cleanHtmlTagsFromContent(o.opportunity),
              potential: cleanHtmlTagsFromContent(o.potential),
              requirements: cleanHtmlTagsFromContent(o.requirements),
            }),
          );

          return {
            ...analysis,
            analysis: cleanedAnalysis,
            summary: cleanedSummary,
            keyFindings: cleanedKeyFindings,
            // 从 dataPoints 提取到顶层（已清理）
            trends: cleanedTrends,
            challenges: cleanedChallenges,
            opportunities: cleanedOpportunities,
            confidenceLevel: dataPoints?.confidenceLevel || null,
            detailedContent: cleanedDetailedContent,
          };
        },
      );
    }

    return report;
  }

  /**
   * 导出报告
   */
  async exportReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: ExportReportDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 映射格式
    const format = dto.format === "pdf" ? ExportFormat.PDF : ExportFormat.DOCX;

    // 创建导出任务
    const jobResponse = await this.exportOrchestrator.createExportJob(userId, {
      source: {
        type: "REPORT",
        reportId,
      },
      format,
      options: {
        includeCover: true,
        includeTableOfContents: true,
        includeReferences: true,
        fileName: `research-report-v${report.version}`,
      },
    });

    // 如果任务已完成，直接返回下载链接
    if (jobResponse.status === "COMPLETED" && jobResponse.downloadUrl) {
      return {
        downloadUrl: jobResponse.downloadUrl,
        fileName: jobResponse.fileName,
        fileSize: jobResponse.fileSize,
      };
    }

    // 否则返回任务 ID 让前端轮询
    return {
      jobId: jobResponse.jobId,
      status: jobResponse.status,
      downloadUrl: jobResponse.downloadUrl,
    };
  }

  /**
   * 比较报告版本
   */
  async compareReports(
    userId: string,
    topicId: string,
    dto: CompareReportsDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 通过版本号获取报告 ID
    const [fromReport, toReport] = await Promise.all([
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.from },
        select: { id: true },
      }),
      this.prisma.topicReport.findFirst({
        where: { topicId, version: dto.to },
        select: { id: true },
      }),
    ]);

    if (!fromReport || !toReport) {
      throw new NotFoundException("One or both report versions not found");
    }

    return this.reportService.compareReports(
      topicId,
      fromReport.id,
      toReport.id,
    );
  }

  /**
   * 更新报告内容
   */
  async updateReportContent(
    userId: string,
    topicId: string,
    reportId: string,
    dto: {
      executiveSummary?: string;
      fullReport?: string;
      changeDescription?: string;
    },
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 使用事务确保修订历史和报告更新的原子性
    return this.prisma.$transaction(async (tx) => {
      // 创建修订历史记录
      const latestRevision = await tx.topicReportRevision.findFirst({
        where: { reportId },
        orderBy: { revisionNumber: "desc" },
      });

      const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

      // 保存当前版本到修订历史
      await tx.topicReportRevision.create({
        data: {
          reportId,
          revisionNumber: newRevisionNumber,
          content: report.fullReport,
          changeDescription: dto.changeDescription || "用户手动编辑",
          editedBy: "user",
          editOperation: "manual_edit",
        },
      });

      // 更新报告
      const updatedReport = await tx.topicReport.update({
        where: { id: reportId },
        data: {
          ...(dto.executiveSummary && {
            executiveSummary: dto.executiveSummary,
          }),
          ...(dto.fullReport && { fullReport: dto.fullReport }),
        },
      });

      return updatedReport;
    });
  }

  /**
   * AI 编辑报告
   *
   * 支持两种模式:
   * 1. 新模式: 使用 selectedText + context + fullContent（前端 AIEditInputModal）
   * 2. 旧模式: 使用 selection + customInstruction（兼容旧 API）
   */
  async aiEditReport(
    userId: string,
    topicId: string,
    reportId: string,
    dto: {
      operation: "rewrite" | "polish" | "expand" | "compress" | "style";
      // 新模式字段
      selectedText?: string;
      context?: string;
      fullContent?: string;
      styleGuide?: string;
      // 上下文定位字段（用于精确替换）
      selectorPrefix?: string;
      selectorSuffix?: string;
      // 旧模式字段（兼容）
      selection?: string;
      customInstruction?: string;
      targetStyle?: "academic" | "business" | "casual" | "technical";
    },
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 确定使用新模式还是旧模式
    const useNewMode = Boolean(dto.selectedText);

    // 获取待编辑的文本（兼容两种模式）
    const textToEdit = dto.selectedText || dto.selection || report.fullReport;

    // 构建 AI 编辑 prompt
    let prompt: string;
    if (useNewMode) {
      // 新模式：使用增强提示词
      prompt = buildEnhancedEditPrompt(dto.operation, textToEdit, {
        userInstruction: dto.context,
        fullContent: dto.fullContent,
        styleGuide: dto.styleGuide,
        targetStyle: dto.targetStyle,
      });
    } else {
      // 旧模式：使用简单提示词（向后兼容）
      prompt = buildEditPrompt(dto.operation, textToEdit, {
        targetStyle: dto.targetStyle,
        customInstruction: dto.customInstruction,
      });
    }

    // 调用 AI 服务进行编辑
    const aiResponse = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content: REPORT_EDITING_SYSTEM_PROMPT,
        },
        { role: "user", content: prompt },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: dto.operation === "rewrite" ? "high" : "medium",
        outputLength: dto.operation === "compress" ? "short" : "medium",
      },
    });

    const editedContent = aiResponse.content || "";

    // 计算新报告内容
    const selectionToReplace = dto.selectedText || dto.selection;
    let newFullReport = report.fullReport;

    if (selectionToReplace) {
      // 使用上下文定位进行精确替换
      let selectionIndex = -1;

      // 方法1：使用 selectorPrefix 和 selectorSuffix 进行上下文匹配
      if (dto.selectorPrefix || dto.selectorSuffix) {
        const prefix = dto.selectorPrefix || "";
        const suffix = dto.selectorSuffix || "";
        const contextPattern = prefix + selectionToReplace + suffix;
        const contextIndex = report.fullReport.indexOf(contextPattern);

        if (contextIndex !== -1) {
          // 找到上下文匹配，计算实际选中文本的位置
          selectionIndex = contextIndex + prefix.length;
          this.logger.debug(
            `Context-based match found at index ${selectionIndex} (context at ${contextIndex})`,
          );
        } else {
          // 上下文匹配失败，记录警告并尝试退回到简单匹配
          this.logger.warn(
            `Context pattern not found, falling back to simple match. ` +
              `Prefix: "${prefix.slice(-20)}", Suffix: "${suffix.slice(0, 20)}"`,
          );
        }
      }

      // 方法2：退回到简单的 indexOf 匹配（当没有上下文或上下文匹配失败时）
      if (selectionIndex === -1) {
        selectionIndex = report.fullReport.indexOf(selectionToReplace);
      }

      if (selectionIndex !== -1) {
        newFullReport =
          report.fullReport.substring(0, selectionIndex) +
          editedContent +
          report.fullReport.substring(
            selectionIndex + selectionToReplace.length,
          );
      } else {
        // 选中内容未找到，可能已被修改，使用原报告
        this.logger.warn(
          `Selection not found in report ${reportId}, keeping original content`,
        );
      }
    } else {
      // 替换整个报告
      newFullReport = editedContent;
    }

    // 使用事务确保修订历史和报告更新的原子性
    const updatedReport = await this.prisma.$transaction(async (tx) => {
      // 保存修订历史
      const latestRevision = await tx.topicReportRevision.findFirst({
        where: { reportId },
        orderBy: { revisionNumber: "desc" },
      });

      const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

      await tx.topicReportRevision.create({
        data: {
          reportId,
          revisionNumber: newRevisionNumber,
          content: report.fullReport,
          changeDescription: dto.context
            ? `AI ${dto.operation}: ${dto.context.slice(0, 50)}`
            : `AI ${dto.operation} 操作`,
          editedBy: "ai",
          editOperation: dto.operation,
        },
      });

      // 更新报告
      return tx.topicReport.update({
        where: { id: reportId },
        data: { fullReport: newFullReport },
      });
    });

    return {
      report: updatedReport,
      editedContent,
      operation: dto.operation,
    };
  }

  /**
   * 获取报告修订历史
   */
  async getReportRevisions(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const revisions = await this.prisma.topicReportRevision.findMany({
      where: { reportId },
      orderBy: { revisionNumber: "desc" },
      select: {
        id: true,
        revisionNumber: true,
        changeDescription: true,
        editedBy: true,
        editOperation: true,
        createdAt: true,
      },
    });

    return revisions;
  }

  /**
   * 回滚报告到指定版本
   */
  async rollbackReport(
    userId: string,
    topicId: string,
    reportId: string,
    revisionNumber: number,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 获取目标修订版本
    const targetRevision = await this.prisma.topicReportRevision.findFirst({
      where: { reportId, revisionNumber },
    });

    if (!targetRevision) {
      throw new NotFoundException(
        `Revision ${revisionNumber} not found for this report`,
      );
    }

    // 保存当前版本到修订历史
    const latestRevision = await this.prisma.topicReportRevision.findFirst({
      where: { reportId },
      orderBy: { revisionNumber: "desc" },
    });

    const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

    await this.prisma.topicReportRevision.create({
      data: {
        reportId,
        revisionNumber: newRevisionNumber,
        content: report.fullReport,
        changeDescription: `回滚前的版本（从版本 ${revisionNumber} 回滚）`,
        editedBy: "user",
        editOperation: "rollback",
      },
    });

    // 恢复到目标版本
    const updatedReport = await this.prisma.topicReport.update({
      where: { id: reportId },
      data: { fullReport: targetRevision.content },
    });

    return {
      report: updatedReport,
      rolledBackFrom: newRevisionNumber - 1,
      rolledBackTo: revisionNumber,
    };
  }

  // ==================== Evidence ====================

  /**
   * 获取证据列表
   */
  async listEvidence(
    userId: string,
    topicId: string,
    reportId: string,
    query: ListEvidenceDto,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const result = await this.evidenceService.listEvidence(reportId, {
      skip: (page - 1) * pageSize,
      take: pageSize,
      sourceType: query.sourceType as string | undefined,
      minCredibility: query.minCredibility,
    });

    // 转换为前端期望的格式
    return {
      evidence: result.evidences,
      total: result.total,
      hasMore: (page - 1) * pageSize + result.evidences.length < result.total,
    };
  }

  /**
   * 获取证据详情
   */
  async getEvidence(
    userId: string,
    topicId: string,
    reportId: string,
    evidenceId: string,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const evidence = await this.evidenceService.getEvidence(evidenceId);

    if (!evidence || evidence.reportId !== reportId) {
      throw new NotFoundException("Evidence not found");
    }

    return evidence;
  }

  // ==================== Templates ====================

  /**
   * 获取模板列表
   */
  async getTemplates(query: GetTemplatesDto) {
    const dimensions = this.getDefaultDimensionsByType(query.type);

    return {
      type: query.type,
      dimensions: dimensions.map((dim) => ({
        id: dim.id,
        name: dim.name,
        description: dim.description,
        searchQueries: dim.searchQueries,
        searchSources: dim.searchSources,
        minSources: dim.minSources,
        sortOrder: dim.sortOrder,
      })),
    };
  }

  /**
   * 从模板创建专题
   */
  async createFromTemplate(_userId: string, _dto: CreateFromTemplateDto) {
    // TODO: Implement createFromTemplate (高级功能，暂不实现)
    throw new Error("Not implemented");
  }

  // ==================== Helper Methods ====================

  /**
   * 验证专题所有权（仅创建者可访问，用于写入操作）
   */
  private async verifyTopicOwnership(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    if (topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  /**
   * 验证专题读取权限（支持公开专题访问，用于只读操作）
   *
   * 权限规则：
   * - 创建者始终有权限
   * - PUBLIC 专题：所有登录用户可访问
   * - SHARED 专题：协作者可访问
   * - PRIVATE 专题：仅创建者可访问
   */
  private async verifyTopicReadAccess(
    userId: string,
    topicId: string,
  ): Promise<void> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${topicId} not found`);
    }

    // 创建者始终有权限
    if (topic.userId === userId) {
      return;
    }

    // 检查 visibility 和协作者状态
    const hasAccess = await this.checkTopicAccess(
      userId,
      topicId,
      topic.userId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }
  }

  /**
   * 根据专题类型获取默认维度模板
   */
  private getDefaultDimensionsByType(topicType: ResearchTopicType) {
    switch (topicType) {
      case ResearchTopicType.MACRO:
        return MACRO_INSIGHT_DIMENSIONS;
      case ResearchTopicType.TECHNOLOGY:
        return TECH_INSIGHT_DIMENSIONS;
      case ResearchTopicType.COMPANY:
        return COMPANY_INSIGHT_DIMENSIONS;
      default:
        throw new Error(`Unknown topic type: ${topicType}`);
    }
  }

  // ==================== Schedule ====================

  /**
   * 获取刷新计划
   */
  async getSchedule(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    return this.scheduler.getSchedule(topicId);
  }

  /**
   * 更新刷新计划
   */
  async updateSchedule(
    userId: string,
    topicId: string,
    dto: UpdateScheduleDto,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.scheduler.updateSchedule(topicId, dto.frequency, {
      dayOfWeek: dto.dayOfWeek,
      dayOfMonth: dto.dayOfMonth,
      hourOfDay: dto.hourOfDay,
    });
  }

  // ==================== Logs ====================

  /**
   * 获取刷新日志
   */
  async getLogs(userId: string, topicId: string, query: ListLogsDto) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    const where: any = { topicId };

    if (query.status) {
      where.status = query.status;
    }

    const [logs, total] = await Promise.all([
      this.prisma.topicRefreshLog.findMany({
        where,
        take: query.limit || 20,
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.topicRefreshLog.count({ where }),
    ]);

    return { logs, total };
  }

  // ==================== Stats ====================

  /**
   * 获取专题统计
   */
  async getStats(userId: string, topicId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 获取专题基本信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: {
        _count: {
          select: {
            dimensions: true,
            reports: true,
            refreshLogs: true,
          },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    // 获取最新报告的证据统计
    const latestReport = await this.reportService.getLatestReport(topicId);
    let evidenceStats = null;

    if (latestReport) {
      evidenceStats = await this.evidenceService.getEvidenceStats(
        latestReport.id,
      );
    }

    // 获取刷新统计
    const refreshStats = await this.prisma.topicRefreshLog.aggregate({
      where: { topicId },
      _count: true,
      _avg: {
        dimensionsRefreshed: true,
        sourcesFound: true,
      },
    });

    return {
      topic: {
        id: topic.id,
        name: topic.name,
        type: topic.type,
        status: topic.status,
        createdAt: topic.createdAt,
        lastRefreshAt: topic.lastRefreshAt,
      },
      counts: topic._count,
      evidenceStats,
      refreshStats: {
        totalRefreshes: refreshStats._count,
        avgDimensionsRefreshed: refreshStats._avg.dimensionsRefreshed,
        avgSourcesFound: refreshStats._avg.sourcesFound,
      },
    };
  }

  // ==================== Visibility & Sharing ====================

  /**
   * 更新专题可见性
   * ★ 修复：使用 Prisma update 替代 raw SQL，确保更新成功
   */
  async updateVisibility(
    userId: string,
    topicId: string,
    visibility: string,
  ): Promise<{ success: boolean; visibility: string }> {
    this.logger.log(
      `[updateVisibility] 更新专题 ${topicId} 可见性为 ${visibility}`,
    );

    // 验证所有者权限
    const topic = await this.prisma.researchTopic.findFirst({
      where: { id: topicId, userId },
    });

    if (!topic) {
      this.logger.warn(
        `[updateVisibility] 专题 ${topicId} 不存在或用户 ${userId} 无权修改`,
      );
      throw new NotFoundException("专题不存在或无权修改");
    }

    // 使用 Prisma update 替代 raw SQL，确保类型安全
    const updatedTopic = await this.prisma.researchTopic.update({
      where: { id: topicId },
      data: {
        visibility: visibility as "PRIVATE" | "SHARED" | "PUBLIC",
      },
      select: { id: true, name: true, visibility: true },
    });

    this.logger.log(
      `[updateVisibility] 专题 "${updatedTopic.name}" (${topicId}) 可见性已更新为 ${updatedTopic.visibility}`,
    );

    return { success: true, visibility: updatedTopic.visibility };
  }

  /**
   * 获取专题共享设置
   * 注意：需要运行数据库迁移后此功能才能正常工作
   */
  async getSharingSettings(
    userId: string,
    topicId: string,
  ): Promise<{
    topicId: string;
    visibility: string;
    collaboratorCount: number;
    publicLink?: string;
  }> {
    // 先验证访问权限
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        OR: [
          { userId },
          { collaborators: { some: { userId, isActive: true } } },
        ],
      },
    });

    if (!topic) {
      throw new NotFoundException("专题不存在或无权访问");
    }

    // 获取协作者数量
    const collaboratorCount = await this.prisma.topicCollaborator.count({
      where: { topicId, isActive: true },
    });

    // 使用原始查询获取 visibility 字段
    const result = await this.prisma.$queryRaw<{ visibility: string }[]>`
      SELECT visibility FROM research_topics WHERE id = ${topicId}
    `;
    const visibility = result[0]?.visibility || "PRIVATE";

    return {
      topicId: topic.id,
      visibility,
      collaboratorCount,
      publicLink:
        visibility === "PUBLIC" ? `/shared/topics/${topic.id}` : undefined,
    };
  }

  // ==================== Public Shared Access ====================

  /**
   * 获取公开的专题详情（无需认证）
   * ★ 优化：使用 Prisma 直接查询，确保返回完整数据
   */
  async getSharedTopic(topicId: string) {
    this.logger.log(`[getSharedTopic] 获取公开专题 ${topicId}`);

    // 直接查询专题（包含 visibility 检查）
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: {
        dimensions: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!topic) {
      this.logger.warn(`[getSharedTopic] 专题 ${topicId} 不存在`);
      throw new NotFoundException("Topic not found");
    }

    this.logger.debug(
      `[getSharedTopic] 专题 "${topic.name}" 可见性: ${topic.visibility}`,
    );

    if (topic.visibility !== "PUBLIC") {
      this.logger.warn(
        `[getSharedTopic] 专题 "${topic.name}" (${topicId}) 不是公开的，拒绝访问`,
      );
      throw new NotFoundException("Topic not found or not publicly accessible");
    }

    // ★ 获取【有内容的】报告统计，跳过空草稿
    // 判断条件：有维度分析记录（与 authenticated getLatestReport 一致）
    const [completedReportCount, latestCompletedReport] = await Promise.all([
      this.prisma.topicReport.count({
        where: {
          topicId,
          dimensionAnalyses: { some: {} },
        },
      }),
      this.prisma.topicReport.findFirst({
        where: {
          topicId,
          dimensionAnalyses: { some: {} },
        },
        orderBy: { generatedAt: "desc" },
        select: {
          id: true,
          version: true,
          totalSources: true,
          generatedAt: true,
        },
      }),
    ]);

    const result = {
      ...topic,
      totalReports: completedReportCount,
      totalSources:
        latestCompletedReport?.totalSources || topic.totalSources || 0,
      lastRefreshAt: latestCompletedReport?.generatedAt || topic.lastRefreshAt,
    };

    this.logger.log(
      `[getSharedTopic] 返回专题 "${topic.name}", ${completedReportCount} 份已完成报告, ${result.totalSources} 个来源`,
    );

    return result;
  }

  /**
   * 获取公开专题的最新报告（无需认证）
   * ★ 优化：增强日志和错误处理
   */
  async getSharedTopicLatestReport(topicId: string) {
    this.logger.log(
      `[getSharedTopicLatestReport] 获取专题 ${topicId} 的最新报告`,
    );

    // 检查专题是否存在且为公开
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { id: true, name: true, visibility: true },
    });

    if (!topic) {
      this.logger.warn(`[getSharedTopicLatestReport] 专题 ${topicId} 不存在`);
      throw new NotFoundException("Topic not found");
    }

    if (topic.visibility !== "PUBLIC") {
      this.logger.warn(
        `[getSharedTopicLatestReport] 专题 "${topic.name}" 不是公开的`,
      );
      throw new NotFoundException("Topic not found or not publicly accessible");
    }

    // ★ 获取最新的【有内容的】报告
    // 跳过空报告（草稿状态，尚未填充内容）
    // 判断条件：有维度分析记录（与 authenticated getLatestReport 一致）
    const report = await this.prisma.topicReport.findFirst({
      where: {
        topicId,
        dimensionAnalyses: { some: {} },
      },
      orderBy: { generatedAt: "desc" },
      include: {
        topic: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
        // ★ 包含维度分析，用于生成分享页面内容
        dimensionAnalyses: {
          include: {
            dimension: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
          orderBy: {
            dimension: {
              sortOrder: "asc",
            },
          },
        },
      },
    });

    if (!report) {
      this.logger.warn(
        `[getSharedTopicLatestReport] 专题 "${topic.name}" 没有已完成的报告`,
      );
      throw new NotFoundException("No completed reports found for this topic");
    }

    this.logger.log(
      `[getSharedTopicLatestReport] 返回报告 v${report.version}, ` +
        `${report.dimensionAnalyses?.length || 0} 个维度分析, ` +
        `executiveSummary: ${report.executiveSummary?.length || 0} 字符`,
    );

    // 转换报告数据，提取 dataPoints 中的字段到顶层
    return this.transformReportForFrontend(report);
  }

  // ==================== Report Editing ====================

  async getReportChanges(userId: string, topicId: string, reportId: string) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportChangeService.getChanges(reportId);
  }

  async checkinChange(
    userId: string,
    topicId: string,
    reportId: string,
    changeId: string,
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    await this.reportChangeService.checkinChange(changeId, userId);
    return { success: true };
  }

  async checkinAllChanges(
    userId: string,
    topicId: string,
    reportId: string,
    changeIds?: string[],
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const count = await this.reportChangeService.checkinAllChanges(
      reportId,
      userId,
      changeIds,
    );
    return { count };
  }

  async getReportAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    status?: string,
  ) {
    // 验证专题读取权限（支持公开专题访问）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportAnnotationService.getAnnotations(reportId, status as any);
  }

  async createAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    dto: any,
  ) {
    // 验证专题读取权限（公开专题的所有登录用户都可以创建批注）
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    return this.reportAnnotationService.createAnnotation(reportId, userId, dto);
  }

  async updateAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
    dto: any,
  ) {
    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证批注所有权（只有批注创建者可以更新自己的批注）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    if (annotation.createdById !== userId) {
      throw new ForbiddenException("You can only update your own annotations");
    }

    return this.reportAnnotationService.updateAnnotation(annotationId, dto);
  }

  async deleteAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });
    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证删除权限（批注创建者或专题创建者可删除）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    const isAnnotationOwner = annotation.createdById === userId;
    const isTopicOwner = topic.userId === userId;
    if (!isAnnotationOwner && !isTopicOwner) {
      throw new ForbiddenException(
        "Only the annotation creator or topic owner can delete this annotation",
      );
    }

    return this.reportAnnotationService.deleteAnnotation(annotationId);
  }

  async resolveAnnotation(
    userId: string,
    topicId: string,
    reportId: string,
    annotationId: string,
  ) {
    // 获取专题信息
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      select: { userId: true },
    });
    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    // 验证专题读取权限
    await this.verifyTopicReadAccess(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    // 验证解决权限（批注创建者或专题创建者可解决）
    const annotation = await this.prisma.reportAnnotation.findUnique({
      where: { id: annotationId },
      select: { createdById: true },
    });
    if (!annotation) {
      throw new NotFoundException("Annotation not found");
    }
    const isAnnotationOwner = annotation.createdById === userId;
    const isTopicOwner = topic.userId === userId;
    if (!isAnnotationOwner && !isTopicOwner) {
      throw new ForbiddenException(
        "Only the annotation creator or topic owner can resolve this annotation",
      );
    }

    return this.reportAnnotationService.resolveAnnotation(annotationId, userId);
  }

  async resolveAllAnnotations(
    userId: string,
    topicId: string,
    reportId: string,
    annotationIds?: string[],
  ) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const count = await this.reportAnnotationService.resolveAllAnnotations(
      reportId,
      userId,
      annotationIds,
    );
    return { count };
  }
}
