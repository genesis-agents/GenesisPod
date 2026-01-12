import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
import { AIModelType, Prisma } from "@prisma/client";
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
  DimensionAnalysis,
} from "@prisma/client";
import type { DimensionAnalysisResult } from "../types/research.types";

/**
 * Report Highlight
 */
interface ReportHighlight {
  title: string;
  content: string;
  category: string;
  dimensionName: string;
}

/**
 * Report Synthesis Result
 */
interface ReportSynthesisResult {
  executiveSummary: string;
  fullReport: string;
  highlights: ReportHighlight[];
}

/**
 * AI Report Synthesis Response
 */
interface AIReportSynthesisResponse {
  executiveSummary: string;
  highlights: Array<{
    title: string;
    content: string;
    category: string;
    dimensionName: string;
  }>;
  fullReport: string;
}

/**
 * Report Synthesis Service
 *
 * 负责从多个维度分析结果合成最终报告：
 * 1. 收集所有维度的分析结果
 * 2. 生成执行摘要
 * 3. 整合为完整报告
 * 4. 提取核心亮点
 * 5. 管理报告版本
 */
@Injectable()
export class ReportSynthesisService {
  private readonly logger = new Logger(ReportSynthesisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 创建新报告（草稿状态）
   */
  async createDraftReport(topicId: string): Promise<TopicReport> {
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

    this.logger.log(
      `Created draft report v${nextVersion} for topic ${topicId}`,
    );
    return report;
  }

  /**
   * 保存维度分析结果到报告
   */
  async saveDimensionAnalysis(
    reportId: string,
    dimensionId: string,
    result: DimensionAnalysisResult,
  ): Promise<DimensionAnalysis> {
    const analysis = await this.prisma.dimensionAnalysis.create({
      data: {
        reportId,
        dimensionId,
        summary: result.summary,
        keyFindings: result.keyFindings as unknown as Prisma.InputJsonValue,
        dataPoints: {
          trends: result.trends,
          challenges: result.challenges,
          opportunities: result.opportunities,
          confidenceLevel: result.confidenceLevel,
        } as unknown as Prisma.InputJsonValue,
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
   * 合成最终报告
   */
  async synthesizeReport(
    topic: ResearchTopic,
    reportId: string,
  ): Promise<TopicReport> {
    this.logger.log(`Synthesizing report ${reportId} for topic ${topic.name}`);

    const startTime = Date.now();

    // 1. 获取所有维度分析
    const dimensionAnalyses = await this.prisma.dimensionAnalysis.findMany({
      where: { reportId },
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

    if (dimensionAnalyses.length === 0) {
      throw new Error("No dimension analyses found for report synthesis");
    }

    // 2. 使用 AI 生成报告
    const synthesisResult = await this.generateReportWithAI(
      topic,
      dimensionAnalyses,
    );

    // 3. 计算统计数据
    const totalSources = dimensionAnalyses.reduce(
      (sum, da) => sum + (da.sourcesUsed || 0),
      0,
    );

    // 4. 更新报告
    const generationTimeMs = Date.now() - startTime;

    const updatedReport = await this.prisma.topicReport.update({
      where: { id: reportId },
      data: {
        executiveSummary: synthesisResult.executiveSummary,
        fullReport: synthesisResult.fullReport,
        highlights:
          synthesisResult.highlights as unknown as Prisma.InputJsonValue,
        totalDimensions: dimensionAnalyses.length,
        totalSources,
        generationTimeMs,
      },
    });

    this.logger.log(
      `Synthesized report ${reportId} in ${generationTimeMs}ms with ${totalSources} sources`,
    );

    return updatedReport;
  }

  /**
   * 使用 AI 生成报告内容
   */
  private async generateReportWithAI(
    topic: ResearchTopic,
    dimensionAnalyses: Array<DimensionAnalysis & { dimension: TopicDimension }>,
  ): Promise<ReportSynthesisResult> {
    // 准备维度分析摘要
    const dimensionSummaries = dimensionAnalyses.map((da) => ({
      name: da.dimension.name,
      summary: da.summary,
      keyFindings: da.keyFindings,
      dataPoints: da.dataPoints,
      sourcesUsed: da.sourcesUsed,
    }));

    const systemPrompt = this.getReportSynthesisSystemPrompt();
    const userPrompt = this.getReportSynthesisUserPrompt(
      topic,
      dimensionSummaries,
    );

    const response = await this.aiChatService.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength: "extended", // 长报告需要更多 tokens
      },
    });

    // 解析响应
    const parsed = this.parseAIReportResponse(response.content);

    return {
      executiveSummary: parsed.executiveSummary,
      fullReport: parsed.fullReport,
      highlights: parsed.highlights,
    };
  }

  /**
   * 报告合成系统提示词
   */
  private getReportSynthesisSystemPrompt(): string {
    return `你是一位专业的研究报告撰写专家，负责将多个维度的研究分析整合为一份完整的研究报告。

## 你的职责
1. 综合各维度的分析结果
2. 提炼跨维度的核心洞察
3. 生成执行摘要
4. 提取核心亮点
5. 撰写完整的研究报告

## 输出格式（JSON）
{
  "executiveSummary": "执行摘要（3-5段，概述研究的核心发现和建议）",
  "highlights": [
    {
      "title": "亮点标题",
      "content": "亮点内容描述",
      "category": "发现类别（如：市场机会、技术趋势、风险警示）",
      "dimensionName": "来源维度名称"
    }
  ],
  "fullReport": "完整报告内容（Markdown格式，包含所有维度的详细分析）"
}

## 报告结构要求
1. 执行摘要：高管级别的快速阅读版本
2. 核心亮点：3-5个最重要的发现
3. 完整报告：按维度组织的详细分析

## 写作风格
- 专业、客观、有洞察力
- 用数据和事实说话
- 明确标注信息来源维度
- 提供可行的建议`;
  }

  /**
   * 报告合成用户提示词
   */
  private getReportSynthesisUserPrompt(
    topic: ResearchTopic,
    dimensionSummaries: Array<{
      name: string;
      summary: string;
      keyFindings: any;
      dataPoints: any;
      sourcesUsed: number | null;
    }>,
  ): string {
    const dimensionsContent = dimensionSummaries
      .map(
        (d) => `
## ${d.name}

### 核心摘要
${d.summary}

### 关键发现
${JSON.stringify(d.keyFindings, null, 2)}

### 数据点
${JSON.stringify(d.dataPoints, null, 2)}

### 使用来源数: ${d.sourcesUsed || 0}
`,
      )
      .join("\n---\n");

    return `请为以下研究专题生成完整的研究报告：

## 专题信息
- 名称: ${topic.name}
- 类型: ${topic.type}
- 描述: ${topic.description || "无"}

## 各维度分析结果

${dimensionsContent}

---

请综合以上各维度的分析，生成一份完整的研究报告。`;
  }

  /**
   * 解析 AI 报告响应
   */
  private parseAIReportResponse(content: string): AIReportSynthesisResponse {
    try {
      // 尝试直接解析 JSON
      const parsed = JSON.parse(content);
      return parsed as AIReportSynthesisResponse;
    } catch {
      // 如果不是纯 JSON，尝试提取 JSON 代码块
      const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as AIReportSynthesisResponse;
      }

      // 如果都失败，返回默认结构
      this.logger.warn("Failed to parse AI report response, using fallback");
      return {
        executiveSummary: content.slice(0, 1000),
        highlights: [],
        fullReport: content,
      };
    }
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
    const report1Dimensions = new Set<string>(
      ((report1 as any).dimensionAnalyses?.map(
        (da: any) => da.dimension?.name as string,
      ) || []) as string[],
    );
    const report2Dimensions = new Set<string>(
      ((report2 as any).dimensionAnalyses?.map(
        (da: any) => da.dimension?.name as string,
      ) || []) as string[],
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
   * 获取报告列表
   */
  async listReports(
    topicId: string,
    options: { skip?: number; take?: number } = {},
  ) {
    const { skip = 0, take = 10 } = options;

    const [reports, total] = await Promise.all([
      this.prisma.topicReport.findMany({
        where: { topicId },
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
      this.prisma.topicReport.count({ where: { topicId } }),
    ]);

    return { reports, total, skip, take };
  }

  /**
   * 获取最新报告
   */
  async getLatestReport(topicId: string): Promise<TopicReport | null> {
    return this.prisma.topicReport.findFirst({
      where: { topicId },
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
}
