import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
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
} from "@prisma/client";
import {
  TopicTeamOrchestratorService,
  ReportSynthesisService,
  TopicRefreshScheduler,
  EvidenceManagementService,
  RefreshProgressEvent,
} from "./services";

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
    searchSources: ["web", "local_policy", "news"],
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
    searchSources: ["web", "local_report", "news"],
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
    searchSources: ["web", "local_report", "news"],
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
    searchSources: ["arxiv", "scholar", "github", "web", "hackernews"],
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
    searchSources: ["web", "news", "local_report"],
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
    searchSources: ["web", "arxiv", "github"],
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
    searchSources: ["web", "news", "local_policy"],
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
    searchSources: ["web", "news", "hackernews", "github"],
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
    searchSources: ["arxiv", "scholar", "web"],
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
    searchSources: ["arxiv", "scholar", "github", "web"],
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
    searchSources: ["arxiv", "scholar", "github", "web", "news"],
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
    searchSources: ["web", "arxiv"],
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
    searchSources: ["web", "github", "hackernews", "news"],
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
    searchSources: ["web", "github", "news"],
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
    searchSources: ["arxiv", "web", "hackernews"],
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
    searchSources: ["arxiv", "web", "news"],
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
    searchSources: ["web", "news"],
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
    searchSources: ["web", "hackernews", "github", "news"],
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
    searchSources: ["web", "local_report", "news"],
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
    searchSources: ["web", "news", "local_report"],
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
    searchSources: ["github", "arxiv", "scholar", "web", "news"],
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
    searchSources: ["web", "local_report", "news"],
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
    searchSources: ["news", "web", "hackernews"],
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
    searchSources: ["web", "local_report", "news"],
    minSources: 5,
  },
];

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
  ) {}

  // ==================== Topics CRUD ====================

  /**
   * 创建专题
   */
  async createTopic(userId: string, dto: CreateTopicDto) {
    this.logger.log(`Creating topic for user ${userId}: ${dto.name}`);

    // 获取默认维度模板
    const defaultDimensions = this.getDefaultDimensionsByType(dto.type);

    // 如果用户提供了自定义维度，使用自定义的；否则使用默认的
    const dimensionsToCreate =
      dto.dimensions && dto.dimensions.length > 0
        ? dto.dimensions
        : defaultDimensions;

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
          status: ResearchTopicStatus.DRAFT,
        },
      });

      // 创建维度
      const dimensions = await Promise.all(
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
        `Created topic ${topic.id} with ${dimensions.length} dimensions`,
      );

      return {
        ...topic,
        dimensions,
      };
    });
  }

  /**
   * 获取专题列表
   */
  async listTopics(userId: string, query: ListTopicsDto) {
    const { type, status, search, skip = 0, take = 20 } = query;

    // 构建查询条件
    const where: any = {
      userId,
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // 并行执行查询和计数
    const [topics, total] = await Promise.all([
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

    return {
      topics,
      total,
      skip,
      take,
    };
  }

  /**
   * 获取专题详情
   */
  async getTopic(userId: string, topicId: string) {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: topicId },
      include: {
        dimensions: {
          orderBy: { sortOrder: "asc" },
        },
        reports: {
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

    // 验证用户所有权
    if (topic.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to access this topic",
      );
    }

    return topic;
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
   * 获取刷新状态
   */
  async getRefreshStatus(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    return this.reportService.listReports(topicId, {
      skip: 0, // cursor-based pagination not implemented yet
      take: query.limit || 10,
    });
  }

  /**
   * 获取最新报告
   */
  async getLatestReport(userId: string, topicId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getLatestReport(topicId);

    if (!report) {
      throw new NotFoundException("No reports found for this topic");
    }

    return report;
  }

  /**
   * 获取指定版本报告
   */
  async getReport(userId: string, topicId: string, reportId: string) {
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    const report = await this.reportService.getReport(reportId);

    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
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

    // TODO: 实际的导出逻辑需要集成导出服务
    return {
      success: true,
      format: dto.format,
      message: "导出功能开发中",
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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

    // 验证报告属于该专题
    const report = await this.reportService.getReport(reportId);
    if (!report || report.topicId !== topicId) {
      throw new NotFoundException("Report not found");
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    return this.evidenceService.listEvidence(reportId, {
      skip: (page - 1) * pageSize,
      take: pageSize,
      sourceType: query.sourceType as string | undefined,
      minCredibility: query.minCredibility,
    });
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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
   * 验证专题所有权
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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
    // 验证专题所有权
    await this.verifyTopicOwnership(userId, topicId);

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
}
