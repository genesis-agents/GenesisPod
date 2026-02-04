import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { sanitizeAllStrings } from "@/common/utils/sanitize-content.utils";
import type {
  TopicReport,
  DimensionAnalysis,
  TopicEvidence,
  TopicDimension,
  ResearchTopic,
} from "@prisma/client";
import type {
  DimensionAnalysisInput,
  EvidenceInput,
  ReportChart,
} from "../../types/report.types";
import type {
  FigureReference,
  GeneratedChart,
} from "../../types/research.types";

/**
 * Report Data Service
 *
 * 负责报告数据的准备、保存和管理：
 * 1. 创建和管理报告草稿
 * 2. 保存维度分析结果
 * 3. 关联证据到报告
 * 4. 准备维度和证据输入数据
 * 5. 收集和管理图表
 * 6. 报告查询和版本管理
 */
@Injectable()
export class ReportDataService {
  private readonly logger = new Logger(ReportDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新报告（草稿状态）
   * ★ 使用重试机制处理并发版本冲突
   */
  async createDraftReport(
    topicId: string,
    maxRetries = 3,
  ): Promise<TopicReport> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 获取下一个版本号
        const latestReport = await this.prisma.topicReport.findFirst({
          where: { topicId },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        const nextVersion = (latestReport?.version || 0) + 1;
        const versionLabel = this.generateVersionLabel(nextVersion);

        const report = await this.prisma.topicReport.create({
          data: {
            topicId,
            version: nextVersion,
            versionLabel,
            executiveSummary: "",
            fullReport: "",
            highlights: [],
            totalDimensions: 0,
            totalSources: 0,
            totalTokens: 0,
            isIncremental: false,
          },
        });

        return report;
      } catch (error: any) {
        // 检查是否是唯一约束冲突（并发创建导致）
        const isUniqueConstraintError =
          error?.code === "P2002" ||
          error?.message?.includes("Unique constraint");

        if (isUniqueConstraintError && attempt < maxRetries) {
          this.logger.warn(
            `[createDraftReport] Version conflict for topic ${topicId}, retry ${attempt}/${maxRetries}`,
          );
          // 短暂延迟后重试
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to create draft report after ${maxRetries} retries`,
    );
  }

  /**
   * 保存维度分析结果到报告
   * ★ 支持保存 figureReferences 和 generatedCharts
   */
  async saveDimensionAnalysis(
    reportId: string,
    dimensionId: string,
    result: {
      summary: string;
      keyFindings: Array<{
        finding: string;
        significance: string;
        evidenceIds: string[];
      }>;
      trends: Array<{
        trend: string;
        direction: string;
        timeframe: string;
        evidenceIds: string[];
      }>;
      challenges: Array<{
        challenge: string;
        impact: string;
        evidenceIds: string[];
      }>;
      opportunities: Array<{
        opportunity: string;
        potential: string;
        evidenceIds: string[];
      }>;
      evidenceUsed: number;
      confidenceLevel: string;
      detailedContent?: string;
      figureReferences?: FigureReference[];
      generatedCharts?: GeneratedChart[];
    },
  ): Promise<DimensionAnalysis> {
    const analysis = await this.prisma.dimensionAnalysis.create({
      data: {
        reportId,
        dimensionId,
        summary: result.summary,
        keyFindings: toPrismaJson(result.keyFindings),
        dataPoints: toPrismaJson({
          trends: result.trends,
          challenges: result.challenges,
          opportunities: result.opportunities,
          confidenceLevel: result.confidenceLevel,
          detailedContent: result.detailedContent || "",
          // ★ 新增：保存图表引用和生成图表
          figureReferences: result.figureReferences || [],
          generatedCharts: result.generatedCharts || [],
        }),
        sourcesUsed: result.evidenceUsed,
      },
    });

    this.logger.log(`Saved dimension analysis for dimension ${dimensionId}`);
    return analysis;
  }

  /**
   * 关联证据到报告和分析
   */
  async linkEvidenceToReport(
    reportId: string,
    analysisId: string,
    evidenceIds: string[],
  ): Promise<void> {
    // 更新证据的报告和分析关联
    await this.prisma.topicEvidence.updateMany({
      where: { id: { in: evidenceIds } },
      data: {
        reportId,
        analysisId,
      },
    });

    // 分配 citation index
    const evidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: { accessedAt: "asc" },
    });

    // 重新分配 citation index
    await this.prisma.$transaction(
      evidences.map((evidence, index) =>
        this.prisma.topicEvidence.update({
          where: { id: evidence.id },
          data: { citationIndex: index + 1 },
        }),
      ),
    );

    this.logger.log(
      `Linked ${evidenceIds.length} evidences to report ${reportId}`,
    );
  }

  /**
   * 准备维度分析输入
   * ★ 包含 figureReferences 和 generatedCharts
   * ★ 对所有内容字段进行清理，移除下划线等格式问题
   */
  prepareDimensionInputs(
    dimensionAnalyses: Array<
      DimensionAnalysis & {
        dimension: TopicDimension;
        evidences: TopicEvidence[];
      }
    >,
  ): DimensionAnalysisInput[] {
    return dimensionAnalyses.map((da) => {
      const dataPoints = da.dataPoints as {
        trends?: Array<{
          trend: string;
          direction: string;
          timeframe: string;
          evidenceIds: string[];
        }>;
        challenges?: Array<{
          challenge: string;
          impact: string;
          evidenceIds: string[];
        }>;
        opportunities?: Array<{
          opportunity: string;
          potential: string;
          evidenceIds: string[];
        }>;
        detailedContent?: string;
        figureReferences?: FigureReference[];
        generatedCharts?: GeneratedChart[];
      } | null;

      const keyFindings =
        (da.keyFindings as Array<{
          finding: string;
          significance: string;
          evidenceIds: string[];
        }>) || [];

      // ★ 构建原始输入
      const rawInput: DimensionAnalysisInput = {
        dimensionId: da.dimensionId,
        dimensionName: da.dimension.name,
        dimensionDescription: da.dimension.description,
        summary: da.summary,
        keyFindings,
        trends: dataPoints?.trends || [],
        challenges: dataPoints?.challenges || [],
        opportunities: dataPoints?.opportunities || [],
        detailedContent: dataPoints?.detailedContent || "",
        sourcesUsed: da.sourcesUsed || 0,
        // ★ 新增：图表引用和生成图表
        figureReferences: dataPoints?.figureReferences || [],
        generatedCharts: dataPoints?.generatedCharts || [],
      };

      // ★ 清理所有文本内容，移除下划线等格式问题
      return sanitizeAllStrings(rawInput);
    });
  }

  /**
   * 准备证据输入
   */
  prepareEvidenceInputs(evidences: TopicEvidence[]): EvidenceInput[] {
    return evidences.map((e) => ({
      citationIndex: e.citationIndex || 0,
      title: e.title,
      url: e.url,
      domain: e.domain,
      sourceType: e.sourceType,
      publishedAt: e.publishedAt,
      credibilityScore: e.credibilityScore,
    }));
  }

  /**
   * ★ 收集所有维度的图表（引用图表 + 生成图表）
   */
  collectAllCharts(dimensionInputs: DimensionAnalysisInput[]): ReportChart[] {
    const charts: ReportChart[] = [];
    // ★ ID 级去重：确保每个 chart ID 全局唯一
    const seenIds = new Set<string>();
    // ★ 跨维度去重：同一张图片只保留首次出现
    const seenImageUrls = new Set<string>();
    // ★ 增强去重：生成图表按标题关键词去重（去除标点、空格后比较）
    const seenTitleKeys = new Set<string>();

    // ★ 限制每个维度最多收集的图表数量
    const MAX_CHARTS_PER_DIMENSION = 5;

    dimensionInputs.forEach((dim, dimIndex) => {
      // ★ sectionId 对应章节编号（从1开始），用于章节视图匹配
      const sectionId = String(dimIndex + 1);
      // ★ 维度前缀确保全局唯一 ID（与 buildFullReportFromDimensions 一致）
      const dimPrefix = `d${dimIndex}-`;
      let dimChartCount = 0;

      // 收集引用图表（去重）
      if (dim.figureReferences && dim.figureReferences.length > 0) {
        dim.figureReferences.forEach((fig) => {
          if (dimChartCount >= MAX_CHARTS_PER_DIMENSION) return;
          const chartId = `${dimPrefix}${fig.id}`;
          // ★ 按 ID 去重，防止同维度内重复 ID
          if (seenIds.has(chartId)) return;
          // ★ 按 imageUrl 去重，防止同一张图在不同维度重复出现
          if (fig.imageUrl && seenImageUrls.has(fig.imageUrl)) {
            return;
          }
          if (fig.imageUrl) {
            seenImageUrls.add(fig.imageUrl);
          }
          seenIds.add(chartId);
          charts.push({
            id: chartId,
            chartType: "reference",
            title: fig.caption,
            position: fig.position,
            sectionId,
            dimensionId: dim.dimensionId,
            dimensionName: dim.dimensionName,
            imageUrl: fig.imageUrl,
            evidenceCitationIndex: fig.evidenceCitationIndex,
            source: fig.source || `来源：证据 [${fig.evidenceCitationIndex}]`,
          });
          dimChartCount++;
        });
      }

      // 收集生成图表
      if (dim.generatedCharts && dim.generatedCharts.length > 0) {
        dim.generatedCharts.forEach((chart) => {
          if (dimChartCount >= MAX_CHARTS_PER_DIMENSION) return;
          const genChartId = `${dimPrefix}${chart.id}`;
          // ★ 按 ID 去重
          if (seenIds.has(genChartId)) return;
          // ★ 增强去重：规范化标题后比较（去除标点、空格、大小写）
          const titleKey = chart.title
            ?.trim()
            .toLowerCase()
            .replace(/[\s\-_:：，。、（）()【】\[\]]/g, "");
          if (titleKey && seenTitleKeys.has(titleKey)) {
            return;
          }
          if (titleKey) {
            seenTitleKeys.add(titleKey);
          }
          seenIds.add(genChartId);
          charts.push({
            id: genChartId,
            chartType: "generated",
            type: chart.type,
            title: chart.title,
            position: chart.position,
            sectionId,
            data: chart.data,
            source: chart.source,
            dimensionId: dim.dimensionId,
            dimensionName: dim.dimensionName,
          });
          dimChartCount++;
        });
      }
    });

    this.logger.log(
      `Collected ${charts.length} charts (${charts.filter((c) => c.chartType === "reference").length} references, ${charts.filter((c) => c.chartType === "generated").length} generated) [deduped by imageUrl+title, max ${MAX_CHARTS_PER_DIMENSION}/dim]`,
    );

    return charts;
  }

  /**
   * 获取报告列表
   * ★ 只返回有内容的报告（至少有一个 dimensionAnalysis）
   */
  async listReports(
    topicId: string,
    options: { skip?: number; take?: number } = {},
  ) {
    const { skip = 0, take = 10 } = options;

    // ★ 只查询有 dimensionAnalyses 的报告（非空草稿）
    const whereClause = {
      topicId,
      dimensionAnalyses: { some: {} }, // 至少有一个维度分析
    };

    const [reports, total] = await Promise.all([
      this.prisma.topicReport.findMany({
        where: whereClause,
        orderBy: { generatedAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          version: true,
          versionLabel: true,
          executiveSummary: true,
          totalDimensions: true,
          totalSources: true,
          generatedAt: true,
          isIncremental: true,
        },
      }),
      this.prisma.topicReport.count({ where: whereClause }),
    ]);

    return { reports, total, skip, take };
  }

  /**
   * 获取最新报告
   * ★ 只返回有内容的报告（至少有一个 dimensionAnalysis）
   */
  async getLatestReport(topicId: string): Promise<TopicReport | null> {
    const report = await this.prisma.topicReport.findFirst({
      where: {
        topicId,
        dimensionAnalyses: { some: {} }, // ★ 只返回非空报告
      },
      orderBy: { generatedAt: "desc" },
      include: {
        dimensionAnalyses: {
          include: { dimension: true },
          orderBy: { dimension: { sortOrder: "asc" } },
        },
        evidences: {
          orderBy: { citationIndex: "asc" },
        },
      },
    });

    return report;
  }

  /**
   * 获取指定报告
   */
  async getReport(reportId: string): Promise<TopicReport | null> {
    return this.prisma.topicReport.findUnique({
      where: { id: reportId },
      include: {
        dimensionAnalyses: {
          include: { dimension: true },
          orderBy: { dimension: { sortOrder: "asc" } },
        },
        evidences: {
          orderBy: { citationIndex: "asc" },
        },
      },
    });
  }

  /**
   * 比较两个报告版本
   */
  async compareReports(
    topicId: string,
    reportId1: string,
    reportId2: string,
  ): Promise<{
    report1: TopicReport;
    report2: TopicReport;
    changes: {
      newFindings: string[];
      removedFindings: string[];
      changedDimensions: string[];
      sourcesDelta: number;
    };
  }> {
    const [report1, report2] = await Promise.all([
      this.prisma.topicReport.findUnique({
        where: { id: reportId1 },
        include: {
          dimensionAnalyses: { include: { dimension: true } },
        },
      }),
      this.prisma.topicReport.findUnique({
        where: { id: reportId2 },
        include: {
          dimensionAnalyses: { include: { dimension: true } },
        },
      }),
    ]);

    if (!report1 || !report2) {
      throw new Error("One or both reports not found");
    }

    if (report1.topicId !== topicId || report2.topicId !== topicId) {
      throw new Error("Reports do not belong to the specified topic");
    }

    // 简单的变化检测
    type ReportWithAnalyses = TopicReport & {
      dimensionAnalyses: Array<
        DimensionAnalysis & { dimension: TopicDimension | null }
      >;
    };
    const r1 = report1 as ReportWithAnalyses;
    const r2 = report2 as ReportWithAnalyses;
    const report1Dimensions = new Set<string>(
      (r1.dimensionAnalyses?.map((da) => da.dimension?.name as string) ||
        []) as string[],
    );
    const report2Dimensions = new Set<string>(
      (r2.dimensionAnalyses?.map((da) => da.dimension?.name as string) ||
        []) as string[],
    );

    const changedDimensions: string[] = [];
    for (const dim of report1Dimensions) {
      if (!report2Dimensions.has(dim)) {
        changedDimensions.push(dim);
      }
    }
    for (const dim of report2Dimensions) {
      if (!report1Dimensions.has(dim)) {
        changedDimensions.push(dim);
      }
    }

    return {
      report1,
      report2,
      changes: {
        newFindings: [], // TODO: 实现详细的发现比较
        removedFindings: [],
        changedDimensions,
        sourcesDelta: (report2.totalSources || 0) - (report1.totalSources || 0),
      },
    };
  }

  /**
   * 标记增量更新的变化
   */
  async markIncrementalChanges(
    reportId: string,
    previousReportId: string,
    refreshedDimensions: string[],
    newSourcesCount: number,
  ): Promise<void> {
    const changesFromPrev = {
      previousReportId,
      dimensionsRefreshed: refreshedDimensions,
      newSourcesCount,
      refreshedAt: new Date().toISOString(),
    };

    await this.prisma.topicReport.update({
      where: { id: reportId },
      data: {
        isIncremental: true,
        changesFromPrev,
      },
    });
  }

  /**
   * 更新报告内容
   */
  async updateReport(
    reportId: string,
    data: {
      executiveSummary?: string;
      fullReport?: string;
      highlights?: unknown[];
      charts?: ReportChart[];
      totalDimensions?: number;
      totalSources?: number;
      generationTimeMs?: number;
    },
  ): Promise<TopicReport> {
    const updateData: Record<string, unknown> = {
      ...data,
      generatedAt: new Date(),
    };

    // Convert arrays to Prisma JSON format
    if (data.highlights !== undefined) {
      updateData.highlights = toPrismaJson(data.highlights);
    }
    if (data.charts !== undefined) {
      updateData.charts = toPrismaJson(data.charts);
    }

    return this.prisma.topicReport.update({
      where: { id: reportId },
      data: updateData,
    });
  }

  /**
   * 获取主题的所有维度分析
   */
  async getDimensionAnalysesByTopic(
    topicId: string,
    reportId?: string,
  ): Promise<
    Array<
      DimensionAnalysis & {
        dimension: TopicDimension;
        evidences: TopicEvidence[];
      }
    >
  > {
    const where: { topicId?: string; reportId?: string } = {};

    if (reportId) {
      where.reportId = reportId;
    }

    const report = reportId
      ? await this.prisma.topicReport.findUnique({
          where: { id: reportId },
          select: { topicId: true },
        })
      : null;

    if (reportId && report) {
      where.topicId = report.topicId;
    } else if (topicId) {
      where.topicId = topicId;
    }

    return this.prisma.dimensionAnalysis.findMany({
      where,
      include: {
        dimension: true,
        evidences: {
          orderBy: { citationIndex: "asc" },
        },
      },
      orderBy: {
        dimension: { sortOrder: "asc" },
      },
    });
  }

  /**
   * 获取报告的所有证据
   */
  async getReportEvidences(reportId: string): Promise<TopicEvidence[]> {
    return this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: { citationIndex: "asc" },
    });
  }

  /**
   * 生成版本标签
   */
  private generateVersionLabel(version: number): string {
    const now = new Date();
    const month = now.toLocaleString("zh-CN", { month: "short" });
    const year = now.getFullYear();
    return `${year}年${month} v${version}`;
  }

  /**
   * 检查主题是否启用图表功能
   */
  async isChartsEnabled(topic: ResearchTopic): Promise<boolean> {
    const topicConfig = topic.topicConfig as Record<string, unknown> | null;
    return topicConfig?.enableFigures !== false;
  }
}
