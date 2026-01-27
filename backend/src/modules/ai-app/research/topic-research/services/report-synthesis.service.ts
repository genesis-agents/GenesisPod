import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { sanitizeMarkdownContent } from "@/common/utils/sanitize-content.utils";
import { AIModelType, Prisma } from "@prisma/client";
import type {
  ResearchTopic,
  TopicDimension,
  TopicReport,
  DimensionAnalysis,
  TopicEvidence,
} from "@prisma/client";
import type {
  ComprehensiveReport,
  ReportSynthesisResult,
  ReportHighlight,
  AIReportSynthesisResponse,
  DimensionAnalysisInput,
  EvidenceInput,
  ReportChart,
} from "../types/report.types";
import {
  REPORT_SYNTHESIS_SYSTEM_PROMPT,
  formatDimensionOverview,
  formatDimensionDetails,
  formatEvidenceList,
  renderReportSynthesisPrompt,
} from "../prompts/report-synthesis.prompt";
import {
  CONSISTENCY_CHECK_SYSTEM_PROMPT,
  CONSISTENCY_CHECK_USER_PROMPT,
} from "../prompts/consistency-check.prompt";

/**
 * Report Synthesis Service
 *
 * 负责从多个维度分析结果合成最终报告：
 * 1. 收集所有维度的分析结果
 * 2. 使用 AI 生成综合研究报告
 * 3. 支持前言、目录、核心观点、子章节、附录、参考文献
 * 4. 提取核心亮点
 * 5. 管理报告版本
 */
@Injectable()
export class ReportSynthesisService {
  private readonly logger = new Logger(ReportSynthesisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
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

    return report;
  }

  /**
   * 保存维度分析结果到报告
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
    },
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
          detailedContent: result.detailedContent || "",
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

    // 1. 获取所有维度分析（包含维度和证据信息）
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

    // 2. 获取报告关联的所有证据
    const allEvidences = await this.prisma.topicEvidence.findMany({
      where: { reportId },
      orderBy: { citationIndex: "asc" },
    });

    // 3. 准备维度分析输入
    const dimensionInputs = this.prepareDimensionInputs(dimensionAnalyses);

    // 4. 准备证据输入
    const evidenceInputs = this.prepareEvidenceInputs(allEvidences);

    // 4.5 ★ 跨维度一致性检查
    const consistencyCheck = await this.checkCrossDimensionConsistency(
      topic,
      dimensionInputs,
    );

    if (consistencyCheck.overallConsistency === "low") {
      this.logger.warn(
        `[synthesizeReport] Low consistency detected: ${consistencyCheck.conflicts.length} conflicts found`,
      );
      // 记录冲突信息，但继续生成报告（在报告中标注）
    }

    // 5. 使用 AI 生成综合报告（传入一致性检查结果）
    const synthesisResult = await this.generateComprehensiveReport(
      topic,
      dimensionInputs,
      evidenceInputs,
      consistencyCheck, // ★ 传入冲突信息，让 AI 在报告中主动说明
    );

    // 6. 计算统计数据
    const totalSources = allEvidences.length;

    // 7. 更新报告
    const generationTimeMs = Date.now() - startTime;

    const updatedReport = await this.prisma.topicReport.update({
      where: { id: reportId },
      data: {
        executiveSummary: synthesisResult.executiveSummary,
        fullReport: synthesisResult.fullReport,
        highlights:
          synthesisResult.highlights as unknown as Prisma.InputJsonValue,
        charts: synthesisResult.charts as unknown as Prisma.InputJsonValue,
        totalDimensions: dimensionAnalyses.length,
        totalSources,
        generationTimeMs,
      },
    });

    this.logger.log(
      `Synthesized comprehensive report ${reportId} in ${generationTimeMs}ms with ${totalSources} sources`,
    );

    return updatedReport;
  }

  /**
   * ★ 跨维度一致性检查 Skill
   *
   * 在报告整合前检查各维度之间的数据/逻辑冲突
   * 参考: skills/consistency-check.skill.md
   */
  private async checkCrossDimensionConsistency(
    topic: ResearchTopic,
    dimensionInputs: DimensionAnalysisInput[],
  ): Promise<{
    overallConsistency: "high" | "medium" | "low";
    conflicts: Array<{
      type: "data_conflict" | "logic_conflict" | "source_conflict";
      severity: "critical" | "warning" | "info";
      dimensions: string[];
      description: string;
      suggestedResolution: string;
    }>;
    recommendations: string[];
    summary: string;
  }> {
    this.logger.log(
      `[checkCrossDimensionConsistency] Checking ${dimensionInputs.length} dimensions`,
    );

    // 如果只有一个维度，无需检查
    if (dimensionInputs.length <= 1) {
      return {
        overallConsistency: "high",
        conflicts: [],
        recommendations: [],
        summary: "单维度研究，无需跨维度一致性检查",
      };
    }

    // 准备维度摘要用于检查
    const dimensionSummaries = dimensionInputs
      .map(
        (d) => `
### ${d.dimensionName}
**核心发现**: ${
          d.keyFindings
            ?.slice(0, 3)
            .map((f) => f.finding)
            .join("; ") || "无"
        }
**趋势**: ${
          d.trends
            ?.slice(0, 2)
            .map((t) => t.trend)
            .join("; ") || "无"
        }
**摘要**: ${(d.summary || "").slice(0, 800)}
`,
      )
      .join("\n---\n");

    try {
      const response = await this.aiFacade.chat({
        messages: [
          { role: "system", content: CONSISTENCY_CHECK_SYSTEM_PROMPT },
          {
            role: "user",
            content: CONSISTENCY_CHECK_USER_PROMPT.replace(
              "{topicName}",
              topic.name,
            ).replace("{dimensionSummaries}", dimensionSummaries),
          },
        ],
        modelType: AIModelType.CHAT, // 使用标准聊天模型
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
      });

      const extractionResult = extractJsonFromAIResponse<{
        overallConsistency: "high" | "medium" | "low";
        conflicts: Array<{
          type: "data_conflict" | "logic_conflict" | "source_conflict";
          severity: "critical" | "warning" | "info";
          dimensions: string[];
          description: string;
          suggestedResolution: string;
        }>;
        recommendations: string[];
        summary: string;
      }>(response.content);

      if (extractionResult.success && extractionResult.data) {
        const result = extractionResult.data;
        const criticalCount = result.conflicts.filter(
          (c) => c.severity === "critical",
        ).length;
        this.logger.log(
          `[checkCrossDimensionConsistency] Found ${result.conflicts.length} conflicts (${criticalCount} critical), consistency: ${result.overallConsistency}`,
        );
        return result;
      }
    } catch (error) {
      this.logger.warn(
        `[checkCrossDimensionConsistency] Check failed, proceeding anyway: ${error}`,
      );
    }

    // 默认返回高一致性（检查失败时不阻止流程）
    return {
      overallConsistency: "high",
      conflicts: [],
      recommendations: [],
      summary: "一致性检查跳过",
    };
  }

  /**
   * 准备维度分析输入
   */
  private prepareDimensionInputs(
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
      } | null;

      const keyFindings =
        (da.keyFindings as Array<{
          finding: string;
          significance: string;
          evidenceIds: string[];
        }>) || [];

      return {
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
      };
    });
  }

  /**
   * 准备证据输入
   */
  private prepareEvidenceInputs(evidences: TopicEvidence[]): EvidenceInput[] {
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
   * 使用 AI 生成综合研究报告
   */
  private async generateComprehensiveReport(
    topic: ResearchTopic,
    dimensionInputs: DimensionAnalysisInput[],
    evidenceInputs: EvidenceInput[],
    consistencyCheck?: {
      overallConsistency: "high" | "medium" | "low";
      conflicts: Array<{
        type: string;
        severity: string;
        dimensions: string[];
        description: string;
        suggestedResolution: string;
      }>;
      recommendations: string[];
    },
  ): Promise<ReportSynthesisResult> {
    // 准备维度概览
    const dimensionOverview = formatDimensionOverview(
      dimensionInputs.map((d) => ({
        name: d.dimensionName,
        description: d.dimensionDescription,
        keyFindingsCount: d.keyFindings.length,
        sourcesUsed: d.sourcesUsed,
      })),
    );

    // 准备维度详细分析
    const dimensionDetails = formatDimensionDetails(dimensionInputs);

    // 准备证据列表
    const evidenceList = formatEvidenceList(evidenceInputs);

    // ★ 准备数据冲突提示（如果有）
    let conflictNotice = "";
    if (
      consistencyCheck &&
      consistencyCheck.conflicts &&
      consistencyCheck.conflicts.length > 0
    ) {
      const criticalConflicts = consistencyCheck.conflicts.filter(
        (c) => c.severity === "critical",
      );
      const warningConflicts = consistencyCheck.conflicts.filter(
        (c) => c.severity === "warning",
      );

      conflictNotice = `
## ⚠️ 数据一致性提醒

在整合报告时，请注意以下跨维度数据差异，并在报告中主动说明：

${criticalConflicts.length > 0 ? `### 关键差异（必须说明）\n${criticalConflicts.map((c) => `- **${c.dimensions.join(" vs ")}**: ${c.description}\n  建议处理: ${c.suggestedResolution}`).join("\n")}` : ""}

${warningConflicts.length > 0 ? `### 次要差异（建议说明）\n${warningConflicts.map((c) => `- ${c.dimensions.join(" vs ")}: ${c.description}`).join("\n")}` : ""}

**处理原则**：
1. 对于数值差异 > 20% 的数据，使用区间表述或说明统计口径差异
2. 对于逻辑矛盾，分析原因并给出合理解释
3. 在"前言"或相关章节中主动披露数据来源的差异
`;
    }

    // 渲染用户提示词
    const userPrompt =
      renderReportSynthesisPrompt(
        topic.name,
        topic.type,
        topic.description,
        new Date().toISOString().split("T")[0],
        dimensionInputs.length,
        evidenceInputs.length,
        dimensionOverview,
        dimensionDetails,
        evidenceList,
      ) + conflictNotice;

    this.logger.debug("Calling AI for comprehensive report synthesis");

    // ★ 根据维度数量动态计算所需 tokens
    // 每个维度大约需要 2000-3000 tokens 的输出空间
    const dimensionCount = dimensionInputs.length;
    const baseTokens = 16000; // extended 的基础值
    const tokensPerDimension = 2500;
    const estimatedTokens = Math.min(
      baseTokens + dimensionCount * tokensPerDimension,
      64000, // 大多数模型的上限
    );

    this.logger.log(
      `[generateStructuredReport] Requesting ${estimatedTokens} tokens for ${dimensionCount} dimensions`,
    );

    // 调用 AI 生成报告
    const response = await this.aiFacade.chat({
      messages: [
        { role: "system", content: REPORT_SYNTHESIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      modelType: AIModelType.CHAT, // 使用标准聊天模型进行深度分析
      taskProfile: {
        creativity: "medium",
        outputLength: "extended", // 基础配置
      },
      // ★ 直接指定 maxTokens 覆盖 taskProfile 的值（用于大型报告）
      maxTokens: estimatedTokens,
    });

    // 解析 AI 响应
    const { structuredReport, charts } = this.parseAIReportWithCharts(
      response.content,
    );

    // 构建完整的 Markdown 报告
    const fullReport = this.buildFullReport(structuredReport);

    // 提取亮点
    const highlights = this.extractHighlights(
      structuredReport,
      dimensionInputs,
    );

    return {
      executiveSummary: structuredReport.executiveSummary,
      fullReport,
      highlights,
      structuredReport,
      charts,
    };
  }

  /**
   * 解析 AI 响应并提取图表
   * ★ v3.0: 从各章节的 inlineCharts 提取图表（新格式）
   * ★ 兼容: 仍支持旧的顶层 charts 数组
   */
  private parseAIReportWithCharts(content: string): {
    structuredReport: ComprehensiveReport;
    charts: ReportChart[];
  } {
    // ★ 使用 "sections" 作为必需键，因为这是报告的核心内容
    // 之前用 "preface" 导致解析失败（AI 可能不返回 preface 字段）
    const extractionResult =
      extractJsonFromAIResponse<AIReportSynthesisResponse>(content, {
        requiredKey: "sections",
      });

    if (extractionResult.success && extractionResult.data) {
      this.logger.debug(
        `Successfully extracted report JSON using method: ${extractionResult.method}`,
      );
      const data = extractionResult.data;

      // ★ v3.0: 优先从各章节的 inlineCharts 提取图表（新格式）
      const inlineCharts: ReportChart[] = [];
      if (data.sections && Array.isArray(data.sections)) {
        for (const section of data.sections) {
          if (
            section.inlineCharts &&
            Array.isArray(section.inlineCharts) &&
            section.inlineCharts.length > 0
          ) {
            for (const chart of section.inlineCharts) {
              inlineCharts.push({
                ...chart,
                sectionId: section.sectionNumber, // 关联章节
              });
            }
          }
        }
      }

      // ★ 兼容旧格式：如果没有 inlineCharts，回退到顶层 charts
      const charts: ReportChart[] =
        inlineCharts.length > 0 ? inlineCharts : data.charts || [];

      this.logger.log(
        `[parseAIReportWithCharts] Charts extracted: ${charts.length} items. ` +
          `Inline charts: ${inlineCharts.length}, Legacy charts: ${data.charts?.length || 0}`,
      );

      return {
        structuredReport: this.normalizeReportResponse(data),
        charts,
      };
    }

    // 如果都失败，创建一个基础的报告结构
    this.logger.warn(
      `Failed to parse AI report response: ${extractionResult.error}`,
    );
    return {
      structuredReport: this.createFallbackReport(content),
      charts: [],
    };
  }

  /**
   * 标准化报告响应
   * ★ v2.0: 处理结构化 executiveSummary 对象
   */
  private normalizeReportResponse(
    parsed: AIReportSynthesisResponse,
  ): ComprehensiveReport {
    // ★ v2.0: executiveSummary 可能是对象或字符串
    // 如果是对象（v2.0 格式），提取 fullText 作为字符串存储
    let executiveSummary = "";
    if (
      typeof parsed.executiveSummary === "object" &&
      parsed.executiveSummary !== null
    ) {
      // v2.0 格式：使用 fullText，或者组装成 Markdown
      const esObj = parsed.executiveSummary as {
        coreConclusions?: string[];
        keyMetrics?: Array<{ metric: string; value: string; source: string }>;
        riskAlerts?: string[];
        actionItems?: string[];
        fullText?: string;
      };
      if (esObj.fullText) {
        executiveSummary = esObj.fullText;
      } else {
        // 如果没有 fullText，从结构化字段组装
        const parts: string[] = [];
        if (esObj.coreConclusions?.length) {
          parts.push(
            "## 核心结论\n" +
              esObj.coreConclusions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
          );
        }
        if (esObj.keyMetrics?.length) {
          parts.push(
            "\n## 关键数据\n| 指标 | 数值 | 来源 |\n|------|------|------|\n" +
              esObj.keyMetrics
                .map((m) => `| ${m.metric} | ${m.value} | ${m.source} |`)
                .join("\n"),
          );
        }
        if (esObj.riskAlerts?.length) {
          parts.push(
            "\n## 风险提示\n" +
              esObj.riskAlerts.map((r) => `- ⚠️ ${r}`).join("\n"),
          );
        }
        if (esObj.actionItems?.length) {
          parts.push(
            "\n## 行动建议\n" +
              esObj.actionItems.map((a) => `- ✅ ${a}`).join("\n"),
          );
        }
        executiveSummary = parts.join("\n") || "";
      }
    } else {
      executiveSummary = (parsed.executiveSummary as string) || "";
    }

    return {
      preface: parsed.preface || "",
      tableOfContents: parsed.tableOfContents || "",
      executiveSummary,
      sections: parsed.sections || [],
      conclusion: parsed.conclusion || "",
      appendices: parsed.appendices || [],
      references: parsed.references || [],
      metadata: {
        totalWords: parsed.metadata?.totalWords || 0,
        totalSources: parsed.metadata?.totalSources || 0,
        researchPeriod: parsed.metadata?.researchPeriod || "",
        generatedAt: parsed.metadata?.generatedAt || new Date().toISOString(),
      },
    };
  }

  /**
   * 创建后备报告（当 AI 响应解析失败时）
   * ★ 改进：尝试从原始内容中提取有意义的观点
   */
  private createFallbackReport(content: string): ComprehensiveReport {
    // 尝试从内容中提取关键观点
    const coreViewpoints = this.extractViewpointsFromContent(content);

    // 尝试提取第一段作为摘要
    const summaryMatch = content.match(/^[^。！？\n]+[。！？]/);
    const executiveSummary = summaryMatch
      ? summaryMatch[0]
      : content.slice(0, 500);

    return {
      preface: "",
      tableOfContents: "",
      executiveSummary,
      sections: [
        {
          sectionNumber: "1",
          title: "研究内容",
          coreViewpoints: coreViewpoints.length > 0 ? coreViewpoints : [], // 不再使用占位符
          content: content,
          keyData: [],
          figureReferences: [],
        },
      ],
      conclusion: "",
      appendices: [],
      references: [],
      metadata: {
        totalWords: content.length,
        totalSources: 0,
        researchPeriod: "",
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 从内容中提取关键观点
   */
  private extractViewpointsFromContent(content: string): string[] {
    const viewpoints: string[] = [];

    // 尝试提取以数字开头的要点
    const numberedPoints = content.match(
      /(?:^|\n)\d+[.、）]\s*([^。\n]+[。])/g,
    );
    if (numberedPoints) {
      numberedPoints.slice(0, 5).forEach((point) => {
        const cleaned = point.replace(/^[\n\d.、）\s]+/, "").trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          viewpoints.push(cleaned);
        }
      });
    }

    // 如果没有找到，尝试提取以"关键"、"核心"、"重点"等开头的句子
    if (viewpoints.length === 0) {
      const keyPhrases = content.match(
        /(?:关键|核心|重点|发现|结论)[：:][^。\n]+[。]/g,
      );
      if (keyPhrases) {
        keyPhrases.slice(0, 5).forEach((phrase) => {
          viewpoints.push(phrase.trim());
        });
      }
    }

    return viewpoints;
  }

  /**
   * 构建完整的 Markdown 报告
   * ★ v3.0: 支持根据 inlineCharts 的 position 插入图表占位符
   */
  private buildFullReport(report: ComprehensiveReport): string {
    const parts: string[] = [];

    // 1. 前言
    if (report.preface) {
      parts.push("# 前言\n\n" + report.preface);
    }

    // 2. 目录
    if (report.tableOfContents) {
      parts.push("# 目录\n\n" + report.tableOfContents);
    }

    // 3. 各章节
    for (const section of report.sections) {
      parts.push(`# ${section.sectionNumber}. ${section.title}`);

      // 核心观点
      if (section.coreViewpoints && section.coreViewpoints.length > 0) {
        parts.push("\n🎯 **核心观点：**\n");
        section.coreViewpoints.forEach((vp) => {
          parts.push(`- ${vp}`);
        });
        parts.push("");
      }

      // ★ v3.0: 处理章节内容，根据 inlineCharts 的 position 插入图表占位符
      if (section.content) {
        const contentWithCharts = this.injectChartPlaceholders(
          section.content,
          section.inlineCharts || [],
        );
        parts.push(contentWithCharts);
      }

      // 关键数据
      if (section.keyData && section.keyData.length > 0) {
        parts.push("\n**关键数据：**\n");
        section.keyData.forEach((kd) => {
          parts.push(`- ${kd.data} (来源: ${kd.source})`);
        });
        parts.push("");
      }

      // 图表引用（旧格式，保持兼容）
      if (section.figureReferences && section.figureReferences.length > 0) {
        section.figureReferences.forEach((fig) => {
          parts.push(
            `\n[${fig.id}: ${fig.description}] (${fig.suggestedType})\n`,
          );
        });
      }

      // ★ v3.0: 处理 end_of_section 位置的图表
      if (section.inlineCharts && section.inlineCharts.length > 0) {
        const endCharts = section.inlineCharts.filter(
          (c) => c.position === "end_of_section",
        );
        for (const chart of endCharts) {
          parts.push(`\n<!-- chart:${chart.id} -->\n`);
        }
      }

      parts.push("\n---\n");
    }

    // 4. 结束语
    if (report.conclusion) {
      parts.push("# 结束语\n\n" + report.conclusion);
    }

    // 5. 附录
    if (report.appendices && report.appendices.length > 0) {
      parts.push("\n# 附录\n");
      report.appendices.forEach((appendix, i) => {
        parts.push(`\n## 附录${i + 1}：${appendix.title}\n`);
        parts.push(appendix.content);
      });
    }

    // 6. 参考文献
    if (report.references && report.references.length > 0) {
      parts.push("\n# 参考文献\n");
      report.references.forEach((ref) => {
        parts.push(
          `[${ref.index}] ${ref.title}. ${ref.domain || ""}. ${ref.url}. 访问日期: ${ref.accessDate}`,
        );
      });
    }

    // ★ 清理 AI 生成内容中的格式问题（如引用后的孤立下划线 [1]___）
    return sanitizeMarkdownContent(parts.join("\n"));
  }

  /**
   * 根据 inlineCharts 的 position 在内容中插入图表占位符
   * ★ v3.0 新增
   *
   * position 格式:
   * - "after_paragraph_N": 在第 N 段落之后
   * - "after_heading_N": 在第 N 个小标题之后
   * - "end_of_section": 在章节末尾（由 buildFullReport 处理）
   */
  private injectChartPlaceholders(
    content: string,
    inlineCharts: Array<{
      id: string;
      position: string;
      [key: string]: unknown;
    }>,
  ): string {
    if (!inlineCharts || inlineCharts.length === 0) {
      return content;
    }

    // 过滤出需要在内容中插入的图表（排除 end_of_section）
    const chartsToInject = inlineCharts.filter(
      (c) => c.position && c.position !== "end_of_section",
    );

    if (chartsToInject.length === 0) {
      return content;
    }

    // 按段落分割内容
    const paragraphs = content.split(/\n\n+/);
    const result: string[] = [];

    // 收集各位置需要插入的图表
    const afterParagraph: Map<number, string[]> = new Map();
    const afterHeading: Map<number, string[]> = new Map();

    for (const chart of chartsToInject) {
      const pos = chart.position;

      // 解析 after_paragraph_N
      const paragraphMatch = pos.match(/^after_paragraph_(\d+)$/);
      if (paragraphMatch) {
        const idx = parseInt(paragraphMatch[1], 10);
        if (!afterParagraph.has(idx)) {
          afterParagraph.set(idx, []);
        }
        afterParagraph.get(idx)!.push(chart.id);
        continue;
      }

      // 解析 after_heading_N
      const headingMatch = pos.match(/^after_heading_(\d+)$/);
      if (headingMatch) {
        const idx = parseInt(headingMatch[1], 10);
        if (!afterHeading.has(idx)) {
          afterHeading.set(idx, []);
        }
        afterHeading.get(idx)!.push(chart.id);
        continue;
      }
    }

    // 构建带占位符的内容
    let paragraphCount = 0;
    let headingCount = 0;

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) {
        result.push(para);
        continue;
      }

      // 检查是否为标题（以 # 开头或全粗体）
      const isHeading =
        trimmedPara.startsWith("#") ||
        (trimmedPara.startsWith("**") && trimmedPara.endsWith("**"));

      if (isHeading) {
        headingCount++;
        result.push(para);

        // 在标题后插入图表
        if (afterHeading.has(headingCount)) {
          for (const chartId of afterHeading.get(headingCount)!) {
            result.push(`\n<!-- chart:${chartId} -->\n`);
          }
        }
      } else {
        paragraphCount++;
        result.push(para);

        // 在段落后插入图表
        if (afterParagraph.has(paragraphCount)) {
          for (const chartId of afterParagraph.get(paragraphCount)!) {
            result.push(`\n<!-- chart:${chartId} -->\n`);
          }
        }
      }
    }

    return result.join("\n\n");
  }

  /**
   * 从结构化报告中提取亮点
   * ★ 优化：从内容中智能提取标题，避免机械化的"核心观点 N"
   */
  private extractHighlights(
    report: ComprehensiveReport,
    dimensionInputs: DimensionAnalysisInput[],
  ): ReportHighlight[] {
    const highlights: ReportHighlight[] = [];

    // 从各章节的核心观点中提取亮点
    for (
      let i = 0;
      i < report.sections.length && i < dimensionInputs.length;
      i++
    ) {
      const section = report.sections[i];
      const dimension = dimensionInputs[i];

      if (section.coreViewpoints) {
        section.coreViewpoints.slice(0, 2).forEach((vp) => {
          // ★ 智能提取标题：从内容中提取关键信息
          const title = this.extractTitleFromContent(vp, section.title);
          highlights.push({
            title,
            content: vp,
            category: this.categorizeViewpoint(vp),
            dimensionName: dimension.dimensionName,
          });
        });
      }
    }

    // 限制亮点数量
    return highlights.slice(0, 10);
  }

  /**
   * 从内容中智能提取标题
   * ★ 优化策略：
   * 1. 提取冒号前的关键短语（如 "市场规模：2025年..."）
   * 2. 提取开头的关键词组（如 "2025年AI投资..."）
   * 3. 回退到截取开头字符
   */
  private extractTitleFromContent(
    content: string,
    sectionTitle: string,
  ): string {
    // 清理内容
    const cleanContent = content.trim();

    // 策略1：提取冒号/顿号前的关键短语
    const colonMatch = cleanContent.match(/^([^：:、]+)[：:、]/);
    if (colonMatch && colonMatch[1].length >= 4 && colonMatch[1].length <= 20) {
      return colonMatch[1].trim();
    }

    // 策略2：提取开头到第一个逗号/句号的部分（作为核心论点）
    const firstPart = cleanContent.match(/^([^，。,\.]+)/);
    if (firstPart && firstPart[1].length >= 8 && firstPart[1].length <= 30) {
      return firstPart[1].trim();
    }

    // 策略3：截取开头15-25个字符作为标题
    if (cleanContent.length > 20) {
      // 尝试在20-30字符范围内找到合适的断点
      const cutPoint = cleanContent.substring(15, 35).search(/[，。、：:,\.]/);
      if (cutPoint > 0) {
        return cleanContent.substring(0, 15 + cutPoint).trim();
      }
      // 直接截取
      return cleanContent.substring(0, 25).trim() + "...";
    }

    // 回退：使用章节标题
    return sectionTitle;
  }

  /**
   * 分类观点
   */
  private categorizeViewpoint(viewpoint: string): string {
    const lowerVp = viewpoint.toLowerCase();
    if (
      lowerVp.includes("机会") ||
      lowerVp.includes("潜力") ||
      lowerVp.includes("增长")
    ) {
      return "市场机会";
    }
    if (
      lowerVp.includes("趋势") ||
      lowerVp.includes("发展") ||
      lowerVp.includes("演进")
    ) {
      return "技术趋势";
    }
    if (
      lowerVp.includes("风险") ||
      lowerVp.includes("挑战") ||
      lowerVp.includes("威胁")
    ) {
      return "风险警示";
    }
    if (
      lowerVp.includes("战略") ||
      lowerVp.includes("策略") ||
      lowerVp.includes("建议")
    ) {
      return "战略建议";
    }
    return "核心发现";
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
