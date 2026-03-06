import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ChatFacade,
  TeamFacade,
  OutputReviewerService,
  ContextEvolutionService,
  TokenBudgetService,
  type EstablishedFact,
} from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import {
  sanitizeAllStrings,
  stripLeadingHeading,
} from "@/common/utils/sanitize-content.utils";
import {
  sanitizeHeadingLevels,
  numberSubHeadings,
  hierarchicalNumberBoldListItems,
  deduplicateParagraphs,
  deduplicateHeadings,
  getMinDataPoints,
  simplifyLatexNotation,
  stripLLMMetaNotes,
  filterJunkReferences,
  deduplicateReferencesByUrl,
  upgradeHttpToHttps,
  decodeUrlEntities,
  remapCitationIndices,
  repairOrderedListContinuity,
} from "../../utils/report-formatting.utils";
import { AIModelType } from "@prisma/client";
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
} from "../../types/report.types";
import type {
  FigureReference,
  GeneratedChart,
} from "../../types/research.types";
import {
  REPORT_SYNTHESIS_SYSTEM_PROMPT,
  formatDimensionOverview,
  formatDimensionDetails,
  formatEvidenceList,
  renderReportSynthesisPrompt,
} from "../../prompts/report-synthesis.prompt";
import { getLanguageInstruction } from "../../prompts";
import {
  CONSISTENCY_CHECK_SYSTEM_PROMPT,
  CONSISTENCY_CHECK_USER_PROMPT,
} from "../../prompts/consistency-check.prompt";
import { ReportEditorService } from "./report-editor.service";
import { ReportQualityGateService } from "../quality/report-quality-gate.service";
import {
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../../utils/strip-chart-json.utils";

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
    private readonly chatFacade: ChatFacade,
    private readonly teamFacade: TeamFacade,
    private readonly reportEditor: ReportEditorService,
    // ★ v4: 报告级质量门控
    private readonly qualityGate: ReportQualityGateService,
    // ★ Phase 4: 报告质量关卡
    @Optional() private readonly outputReviewer?: OutputReviewerService,
    // ★ Batch 2: 跨维度事实一致性
    @Optional() private readonly contextEvolution?: ContextEvolutionService,
    // ★ Batch 3: Token 预算智能截断
    @Optional() private readonly tokenBudgetService?: TokenBudgetService,
  ) {}

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
      } catch (error: unknown) {
        // 检查是否是唯一约束冲突（并发创建导致）
        const e = error as { code?: string; message?: string };
        const isUniqueConstraintError =
          e.code === "P2002" || e.message?.includes("Unique constraint");

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

    // ★ 修复：分批事务更新 citation index（避免大事务超时）
    const BATCH_SIZE = 20;
    for (let i = 0; i < evidences.length; i += BATCH_SIZE) {
      const batch = evidences.slice(i, i + BATCH_SIZE);
      await this.prisma.$transaction(
        batch.map((evidence, batchIndex) =>
          this.prisma.topicEvidence.update({
            where: { id: evidence.id },
            data: { citationIndex: i + batchIndex + 1 },
          }),
        ),
      );
    }

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
    userFeedback?: string,
    crossDimensionFacts?: EstablishedFact[],
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

    // 5. ★ 收集所有维度的图表（引用图表 + 生成图表）
    // ★ 检查 enableFigures 配置（默认 true）
    const topicConfig = topic.topicConfig as Record<string, unknown> | null;
    const enableFigures = topicConfig?.enableFigures !== false;

    const collectedCharts = enableFigures
      ? this.collectAllCharts(dimensionInputs)
      : []; // 禁用图表时返回空数组

    // ★ 诊断日志：检查收集到的图表
    this.logger.log(
      `[Charts] enableFigures=${enableFigures}, collected=${collectedCharts.length} charts from ${dimensionInputs.length} dimensions`,
    );
    if (collectedCharts.length === 0 && enableFigures) {
      // 详细检查为什么没有图表
      const figRefCounts = dimensionInputs.map(
        (d) =>
          `${d.dimensionName}:figRefs=${d.figureReferences?.length || 0},gen=${d.generatedCharts?.length || 0}`,
      );
      this.logger.warn(
        `[Charts] No charts collected! Dimension details: ${figRefCounts.join(", ")}`,
      );
    }

    if (!enableFigures) {
      this.logger.log(
        `[synthesizeReport] Figures disabled for topic ${topic.name}`,
      );
    }

    // ★ Batch 2: 注入跨维度事实上下文
    let factsContext = "";
    if (crossDimensionFacts?.length && this.contextEvolution) {
      factsContext =
        this.contextEvolution.buildFactsPromptSection(crossDimensionFacts);
    } else if (crossDimensionFacts?.length && !this.contextEvolution) {
      this.logger.debug(
        "[Degraded] ContextEvolutionService unavailable, skipping cross-dimension facts injection",
      );
    }

    // ★ Batch 3: TokenBudgetService — 截断过长的维度分析，防止超出模型上下文
    const truncatedDimensionInputs = dimensionInputs.map((d) => {
      const maxLen = 8000;
      if (d.detailedContent && d.detailedContent.length > maxLen) {
        let truncated: string;
        if (this.tokenBudgetService) {
          truncated = this.tokenBudgetService.smartTruncate(
            d.detailedContent,
            6000,
          );
        } else {
          this.logger.debug(
            "[Degraded] TokenBudgetService unavailable, using simple slice for truncation",
          );
          truncated = d.detailedContent.slice(0, maxLen);
        }
        this.logger.debug(
          `[synthesizeReport] Truncated dimension "${d.dimensionName}" content: ${d.detailedContent.length} → ${truncated.length}`,
        );
        return { ...d, detailedContent: truncated };
      }
      return d;
    });

    // 6. 使用 AI 生成综合报告（传入一致性检查结果）
    const synthesisResult = await this.generateComprehensiveReport(
      topic,
      truncatedDimensionInputs,
      evidenceInputs,
      consistencyCheck, // ★ 传入冲突信息，让 AI 在报告中主动说明
      userFeedback,
      factsContext,
    );

    // 6.5 ★ 跨维度编辑层：去重 + 过渡
    const editResult = await this.reportEditor.editDimensionInputs(
      dimensionInputs,
      topic.name,
    );
    const editedDimensionInputs = editResult.dimensions;

    if (editResult.deduplicationStats.removedParagraphs > 0) {
      this.logger.log(
        `[synthesizeReport] Editor removed ${editResult.deduplicationStats.removedParagraphs} duplicate paragraphs ` +
          `across ${editResult.deduplicationStats.affectedDimensions.join(", ")}`,
      );
    } else if (
      dimensionInputs.length > 1 &&
      editResult.deduplicationStats.duplicateClaims === 0
    ) {
      this.logger.warn(
        `[synthesizeReport] Editor found no duplicates across ${dimensionInputs.length} dimensions (AI check may have failed). Report may contain cross-dimension repetition.`,
      );
    }

    // 7. ★ 构建完整报告：直接使用 detailedContent 而非 AI 重写
    // 从 synthesisResult 中提取补充内容（前言、执行摘要、跨维度分析、风险评估、战略建议、结语）
    const structuredReport = synthesisResult.structuredReport;
    const fullReportFromDimensions = this.buildFullReportFromDimensions(
      topic,
      editedDimensionInputs,
      {
        preface: structuredReport?.preface || "",
        executiveSummary: synthesisResult.executiveSummary || "",
        // ★ v3.0: 从 conclusion 中提取跨维度分析等内容（已在 normalizeReportResponse 中合并）
        crossDimensionAnalysis: this.extractSectionFromConclusion(
          structuredReport?.conclusion || "",
          topic.language === "en"
            ? "Cross-Dimension Analysis"
            : "跨维度关联分析",
        ),
        riskAssessment: this.extractSectionFromConclusion(
          structuredReport?.conclusion || "",
          topic.language === "en" ? "Risk Assessment" : "风险评估",
        ),
        strategicRecommendations: this.extractSectionFromConclusion(
          structuredReport?.conclusion || "",
          topic.language === "en" ? "Strategic Recommendations" : "战略建议",
        ),
        conclusion: this.extractFinalConclusion(
          structuredReport?.conclusion || "",
          topic.language || "zh",
        ),
      },
    );

    // 8. ★ 合并图表：收集的图表 + AI 生成的图表
    // 只过滤 AI synthesis 虚构的引用图表（外部 URL 始终 404）；
    // collectedCharts 来自真实 FigureExtractorService，始终保留
    const allCharts = [
      ...collectedCharts,
      ...(synthesisResult.charts || []),
    ].filter((chart) => {
      // Only filter reference charts from AI synthesis (not from figure extraction pipeline)
      // collectedCharts come from real FigureExtractorService — always keep them
      if (
        chart.chartType === "reference" &&
        chart.imageUrl &&
        !chart.data &&
        !collectedCharts.some((c) => c.id === chart.id)
      ) {
        this.logger.warn(
          `[synthesizeReport] Removing AI-synthesized reference chart with external URL: ${chart.id}`,
        );
        return false;
      }
      return true;
    });

    // 8.5 ★ 清理孤儿图表占位符（markdown 中引用但 charts 数组中不存在的）
    const chartIdSet = new Set(allCharts.map((c) => c.id));
    const cleanedReport = fullReportFromDimensions.replace(
      /<!-- chart:([^\s]+?) -->/g,
      (match, chartId) => {
        if (chartIdSet.has(chartId)) return match;
        this.logger.warn(
          `[synthesizeReport] Removing orphan chart placeholder: ${chartId}`,
        );
        return ""; // strip orphaned placeholder
      },
    );

    // 8.6 检测 charts 数组中未被报告引用的孤立图表
    const referencedChartIds = new Set(
      (cleanedReport.match(/<!-- chart:([^\s]+?) -->/g) || []).map(
        (m) => m.match(/<!-- chart:([^\s]+?) -->/)?.[1],
      ),
    );
    const orphanCharts = allCharts.filter((c) => !referencedChartIds.has(c.id));
    if (orphanCharts.length > 0) {
      this.logger.warn(
        `[synthesizeReport] ${orphanCharts.length} chart(s) in array but never referenced in report: ${orphanCharts.map((c) => c.id).join(", ")}`,
      );
    }

    // 9. 计算统计数据
    const totalSources = allEvidences.length;

    // 9.5 ★ 构建参考文献部分（从数据库证据构建，而非依赖 AI 返回）
    const isEn = topic.language === "en";
    const referencesLabel = isEn ? "References" : "参考文献";
    const accessDateLabel = isEn ? "Accessed" : "访问日期";
    let referencesSection = "";
    // ★ Citation index remap (populated by reference cleanup pipeline)
    let citationIndexMapping = new Map<number, number>();
    if (allEvidences.length > 0) {
      // ★ Reference cleanup pipeline: filter junk → decode entities → upgrade HTTP → dedup URLs
      let refEntries = allEvidences
        .filter((e) => e.citationIndex)
        .sort((a, b) => (a.citationIndex || 0) - (b.citationIndex || 0))
        .map((e) => ({
          index: e.citationIndex || 0,
          title: e.title,
          url: e.url,
          domain: e.domain,
          accessedAt: e.accessedAt,
        }));

      const beforeCount = refEntries.length;
      refEntries = filterJunkReferences(refEntries);
      refEntries = decodeUrlEntities(refEntries);
      refEntries = upgradeHttpToHttps(refEntries);

      const { deduplicated, indexMapping } =
        deduplicateReferencesByUrl(refEntries);
      refEntries = deduplicated;
      citationIndexMapping = indexMapping;

      if (refEntries.length < beforeCount) {
        this.logger.log(
          `[synthesizeReport] Reference cleanup: ${beforeCount} → ${refEntries.length} (removed ${beforeCount - refEntries.length} junk/duplicate references)`,
        );
      }

      const refLines = refEntries.map((e) => {
        const accessDate = e.accessedAt
          ? new Date(e.accessedAt).toLocaleDateString(isEn ? "en-US" : "zh-CN")
          : new Date().toLocaleDateString(isEn ? "en-US" : "zh-CN");
        return `[${e.index}] ${e.title}. ${e.domain || ""}. ${e.url}. ${accessDateLabel}: ${accessDate}`;
      });
      if (refLines.length > 0) {
        referencesSection = `\n\n---\n\n# ${referencesLabel}\n\n${refLines.join("\n\n")}`;
        this.logger.log(
          `[synthesizeReport] Built references section with ${refLines.length} citations`,
        );
      }
    }

    // 10. ★ Phase 4: OutputReviewer — 报告质量评审（非阻塞）
    let reportQualityScore: number | undefined;
    if (this.outputReviewer && cleanedReport.length > 0) {
      try {
        const reviewResult = await this.outputReviewer.reviewOutput({
          missionId: reportId,
          task: {
            id: reportId,
            title: `Research Report: ${topic.name}`,
            description: "Synthesized research report quality review",
          },
          content: cleanedReport.substring(0, 5000), // 截取前 5000 字符供审核
          leader: {
            id: "system-reviewer",
            agentName: "OutputReviewer",
            displayName: "Quality Reviewer",
            aiModel: "",
            isLeader: true,
          },
          criteria: {
            completenessWeight: 0.3,
            accuracyWeight: 0.3,
            logicWeight: 0.2,
            professionalismWeight: 0.2,
            passThreshold: 6.5,
            maxRevisions: 1,
          },
        });
        reportQualityScore = reviewResult.score;
        this.logger.log(
          `[synthesizeReport] Quality review: score=${reviewResult.score}, passed=${reviewResult.passed}`,
        );
      } catch (err) {
        this.logger.warn(
          `[synthesizeReport] Quality review failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (!this.outputReviewer) {
      this.logger.debug(
        "[Degraded] OutputReviewerService unavailable, skipping report quality review",
      );
    }

    // 11. 更新报告
    const generationTimeMs = Date.now() - startTime;

    // ★ 将参考文献追加到报告末尾
    // ★ Apply citation index remapping if references were deduplicated
    const remappedReport =
      citationIndexMapping.size > 0
        ? remapCitationIndices(cleanedReport, citationIndexMapping)
        : cleanedReport;
    const finalReport = remappedReport + referencesSection;

    const updatedReport = await this.prisma.topicReport.update({
      where: { id: reportId },
      data: {
        executiveSummary: synthesisResult.executiveSummary,
        // ★ 使用拼接版本的 fullReport（包含参考文献）
        fullReport: finalReport,
        highlights: toPrismaJson(synthesisResult.highlights),
        charts: toPrismaJson(allCharts),
        totalDimensions: dimensionAnalyses.length,
        totalSources,
        generationTimeMs,
        // ★ 更新生成时间，前端通过对比 generatedAt 检测再生成完成
        generatedAt: new Date(),
      },
    });

    this.logger.log(
      `Synthesized comprehensive report ${reportId} in ${generationTimeMs}ms with ${totalSources} sources` +
        (reportQualityScore !== undefined
          ? `, quality=${reportQualityScore}`
          : ""),
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
      const response = await this.chatFacade.chatWithSkills({
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
        additionalSkills: ["consistency-check"],
        modelType: AIModelType.CHAT,
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
   * ★ 包含 figureReferences 和 generatedCharts
   * ★ 对所有内容字段进行清理，移除下划线等格式问题
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
   * ★ 从维度分析直接构建完整报告（拼接而非重写）
   *
   * 核心策略：
   * 1. 直接使用各维度的 detailedContent（研究员生成的完整内容）
   * 2. 只由 AI 生成补充内容（执行摘要、前言、跨维度分析、风险评估、战略建议、结语）
   * 3. 保持报告的完整性和一致性
   */
  private buildFullReportFromDimensions(
    topic: ResearchTopic,
    dimensionInputs: DimensionAnalysisInput[],
    supplementaryContent: {
      preface?: string;
      executiveSummary?: string;
      crossDimensionAnalysis?: string;
      riskAssessment?: string;
      strategicRecommendations?: string;
      conclusion?: string;
    },
  ): string {
    // ★ Language-aware labels
    const isEn = topic.language === "en";
    const labels = {
      generatedAt: isEn ? "Generated" : "生成时间",
      preface: isEn ? "Preface" : "前言",
      executiveSummary: isEn ? "Executive Summary" : "执行摘要",
      toc: isEn ? "Table of Contents" : "目录",
      dimension: isEn ? "Dimension" : "维度",
      crossDimension: isEn ? "Cross-Dimension Analysis" : "跨维度关联分析",
      riskAssessment: isEn ? "Risk Assessment" : "风险评估",
      strategicRec: isEn ? "Strategic Recommendations" : "战略建议",
      conclusion: isEn ? "Conclusion" : "结语",
    };
    const locale = isEn ? "en-US" : "zh-CN";

    // ★ Safety net: sanitize all supplementary content
    const sc = Object.fromEntries(
      Object.entries(supplementaryContent).map(([k, v]) => [
        k,
        v ? extractMarkdownFromJsonString(v) : v,
      ]),
    ) as typeof supplementaryContent;

    // ★ 清理所有补充内容中的 LLM 元注释（字数统计等）
    for (const key of Object.keys(sc) as (keyof typeof sc)[]) {
      if (sc[key]) {
        (sc as Record<string, string>)[key] = stripLLMMetaNotes(sc[key]);
      }
    }

    const parts: string[] = [];

    // Sort dimensions by priority (lower number = higher priority = earlier in report)
    const sortedDimensions = [...dimensionInputs].sort((a, b) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      return pa - pb;
    });

    // 1. 报告标题
    parts.push(`# ${topic.name}`);
    parts.push(
      `\n> ${labels.generatedAt}：${new Date().toLocaleDateString(locale)}\n`,
    );

    // 2. 前言（AI 生成）
    if (sc.preface) {
      parts.push(`## ${labels.preface}\n`);
      parts.push(stripLeadingHeading(sc.preface));
      parts.push("\n");
    }

    // 3. 执行摘要（AI 生成）
    if (sc.executiveSummary) {
      parts.push(`## ${labels.executiveSummary}\n`);
      parts.push(stripLeadingHeading(sc.executiveSummary));
      parts.push("\n");
    }

    // 4. 目录
    parts.push(`## ${labels.toc}\n`);
    let tocIndex = 0;
    sortedDimensions.forEach((dim, idx) => {
      const dimName = dim.dimensionName || `${labels.dimension}${idx + 1}`;
      tocIndex = idx + 1;
      parts.push(
        `${tocIndex}. [${dimName}](#${tocIndex}--${dimName.toLowerCase().replace(/\s+/g, "-")})`,
      );
    });
    // ★ 只在对应 supplementaryContent 非空时添加目录项
    if (sc.crossDimensionAnalysis) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.crossDimension}](#${labels.crossDimension.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sc.riskAssessment) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.riskAssessment}](#${labels.riskAssessment.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sc.strategicRecommendations) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.strategicRec}](#${labels.strategicRec.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    parts.push("\n\n");

    // 5. 各维度章节（直接使用 detailedContent，但限制长度）
    const MAX_DIMENSION_CHARS = 24000; // 约 8000 中文字（每字约 3 chars）
    const globalSeenParagraphs = new Set<string>();

    // ★ 诊断日志：记录每个维度的内容长度
    const dimContentLengths = sortedDimensions.map(
      (d) =>
        `${d.dimensionName}:${(d.detailedContent || "").length}/${(d.summary || "").length}`,
    );
    this.logger.log(
      `[buildFullReport] Dimension content lengths (detailed/summary): ${dimContentLengths.join(", ")}`,
    );

    sortedDimensions.forEach((dim, idx) => {
      parts.push(`## ${idx + 1}. ${dim.dimensionName}\n`);

      // ★ 直接使用研究员生成的完整内容，但截断过长内容
      let content = stripLeadingHeading(
        dim.detailedContent || dim.summary || "暂无详细内容",
      );
      // ★ Safety net: 移除未被 parseChartOutput 正确分离的图表 JSON 残留
      content = stripChartJsonFromContent(content);
      // ★ 移除内联 markdown 图片（AI 生成的外部 URL 通常 404，图表已通过 <!-- chart --> 机制管理）
      content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
      // ★ 标题层级安全网：将 AI 异常输出的 #/## 降级为 ###，保留 ###/#### 不变
      content = sanitizeHeadingLevels(content);
      // ★ 去除重复的标题（AI 有时生成 "### N. Xxx" 后又生成 "### Xxx"）
      content = deduplicateHeadings(content);
      // ★ 统一子标题编号：### Title → ### N.M. Title, #### Title → #### N.M.K. Title
      content = numberSubHeadings(content, idx + 1);
      // ★ 结构化列表项层级编号：N. **粗体** → N.M.K. **粗体**（跟随父节编号）
      content = hierarchicalNumberBoldListItems(content);
      // ★ 跨维度段落去重：首 120 字相同的段落只保留首次出现
      content = deduplicateParagraphs(content, globalSeenParagraphs);
      if (content.length > MAX_DIMENSION_CHARS) {
        this.logger.warn(
          `[buildReport] Dimension "${dim.dimensionName}" content too long (${content.length} chars), truncating to ${MAX_DIMENSION_CHARS}`,
        );
        // 在最近的段落边界截断
        const truncated = content.substring(0, MAX_DIMENSION_CHARS);
        const lastParagraph = truncated.lastIndexOf("\n\n");
        content =
          lastParagraph > MAX_DIMENSION_CHARS * 0.7
            ? truncated.substring(0, lastParagraph)
            : truncated;
      }

      // ★ Resolve chart placeholders (figure→chart conversion, injection, dedup)
      content = this.resolveChartPlaceholders(
        content,
        idx,
        dim.figureReferences,
        dim.generatedCharts,
      );

      // ★ 清理 LLM 泄露的 meta-notes（字数统计、编辑指令等）
      content = stripLLMMetaNotes(content);

      parts.push(content);
      parts.push("\n\n");
    });

    // ★ 收集已有 H2 标题，用于后续去重守卫
    const existingH2Titles = new Set(
      parts
        .join("\n")
        .match(/^## .+$/gm)
        ?.map((h) => h.replace(/^## /, "").trim()) || [],
    );

    // ★ A4 Fallback: 如果三个 section 全为空，从维度数据自动拼接最简版
    if (
      !sc.crossDimensionAnalysis &&
      !sc.riskAssessment &&
      !sc.strategicRecommendations
    ) {
      this.logger.warn(
        "[buildFullReport] crossDimensionAnalysis, riskAssessment, strategicRecommendations are all empty. Generating fallback from dimension data.",
      );
      // 自动拼接跨维度关联分析
      const fallbackCross = sortedDimensions
        .filter((d) => d.keyFindings?.length > 0)
        .map(
          (d) =>
            `**${d.dimensionName}**：${d.keyFindings
              .slice(0, 2)
              .map((f) => f.finding)
              .join("；")}`,
        )
        .join("\n\n");
      if (fallbackCross) {
        parts.push(`## ${labels.crossDimension}\n`);
        parts.push(fallbackCross);
        parts.push("\n\n");
      }

      // 自动拼接风险提示
      const fallbackRisks = sortedDimensions
        .flatMap(
          (d) => d.challenges?.slice(0, 1).map((c) => `- ${c.challenge}`) || [],
        )
        .join("\n");
      if (fallbackRisks) {
        parts.push(`## ${labels.riskAssessment}\n`);
        parts.push(fallbackRisks);
        parts.push("\n\n");
      }

      // 自动拼接建议
      const fallbackRecs = sortedDimensions
        .flatMap(
          (d) =>
            d.opportunities?.slice(0, 1).map((o) => `- ${o.opportunity}`) || [],
        )
        .join("\n");
      if (fallbackRecs) {
        parts.push(`## ${labels.strategicRec}\n`);
        parts.push(fallbackRecs);
        parts.push("\n\n");
      }
    }

    // 6. 跨维度关联分析（AI 生成） — 去重守卫：跳过已存在的同名章节
    if (
      sc.crossDimensionAnalysis &&
      !existingH2Titles.has(labels.crossDimension)
    ) {
      parts.push(`## ${labels.crossDimension}\n`);
      parts.push(stripLeadingHeading(sc.crossDimensionAnalysis));
      parts.push("\n\n");
    }

    // 7. 风险评估（AI 生成）
    if (sc.riskAssessment && !existingH2Titles.has(labels.riskAssessment)) {
      parts.push(`## ${labels.riskAssessment}\n`);
      parts.push(stripLeadingHeading(sc.riskAssessment));
      parts.push("\n\n");
    }

    // 8. 战略建议（AI 生成）
    if (
      sc.strategicRecommendations &&
      !existingH2Titles.has(labels.strategicRec)
    ) {
      parts.push(`## ${labels.strategicRec}\n`);
      parts.push(stripLeadingHeading(sc.strategicRecommendations));
      parts.push("\n\n");
    }

    // 9. 结语（AI 生成）— 去重守卫：如果结语内容与跨维度分析高度重复则跳过
    if (sc.conclusion) {
      const conclusionText = stripLeadingHeading(sc.conclusion).trim();
      const crossText = (sc.crossDimensionAnalysis || "").trim();

      // Check 1: first 500 chars exact match
      const conclusionKey = conclusionText.substring(0, 500).replace(/\s/g, "");
      const crossKey = crossText.substring(0, 500).replace(/\s/g, "");
      const isExactDuplicate =
        conclusionKey.length > 50 &&
        crossKey.length > 50 &&
        conclusionKey === crossKey;

      // Check 2: h3 heading overlap (>50% match indicates structural duplication)
      const extractH3 = (t: string) =>
        (t.match(/^###\s+(.+)$/gm) || []).map((h) =>
          h
            .replace(/^###\s+/, "")
            .replace(/^[\d.]+\s*/, "")
            .trim(),
        );
      const conclusionH3 = extractH3(conclusionText);
      const crossH3 = extractH3(crossText);
      const h3Overlap =
        crossH3.length > 0 && conclusionH3.length > 0
          ? conclusionH3.filter((h) => crossH3.includes(h)).length /
            conclusionH3.length
          : 0;
      const isStructuralDuplicate = h3Overlap > 0.5;

      if (isExactDuplicate || isStructuralDuplicate) {
        this.logger.warn(
          `[buildFullReport] Conclusion is duplicate of crossDimensionAnalysis (exact=${isExactDuplicate}, h3Overlap=${(h3Overlap * 100).toFixed(0)}%), skipping`,
        );
      } else if (conclusionText.length > 0) {
        parts.push(`## ${labels.conclusion}\n`);
        parts.push(conclusionText);
        parts.push("\n");
      }
    }

    const rawReport = this.teamFacade.sanitizeReport(parts.join("\n"));
    const { content: processedReport } = this.postProcessReport(
      rawReport,
      topic.language || "zh",
    );
    return processedReport;
  }

  /**
   * ★ 收集所有维度的图表（引用图表 + 生成图表）
   */
  private collectAllCharts(
    dimensionInputs: DimensionAnalysisInput[],
  ): ReportChart[] {
    const charts: ReportChart[] = [];
    // ★ ID 级去重：确保每个 chart ID 全局唯一
    const seenIds = new Set<string>();
    // ★ 跨维度去重：同一张图片只保留首次出现
    const seenImageUrls = new Set<string>();
    // ★ 增强去重：生成图表按标题关键词去重（去除标点、空格后比较）
    // seenTitleKeys removed: generatedCharts disabled in v4, title dedup no longer needed

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
          // ★ 按 dimensionIndex+imageUrl 去重，防止同维度内同图重复
          // 但允许不同维度引用同一来源图片（它们在不同上下文中使用）
          const imageKey = fig.imageUrl ? `${dimIndex}:${fig.imageUrl}` : null;
          if (imageKey && seenImageUrls.has(imageKey)) {
            return;
          }
          if (imageKey) {
            seenImageUrls.add(imageKey);
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

      // ★ v4: 禁用 AI 生成图表（generatedCharts）— 仅保留真实参考图片
      // 原因：AI 编造的图表数据无法追溯到证据来源，降低报告可信度
      if (dim.generatedCharts && dim.generatedCharts.length > 0) {
        this.logger.log(
          `[Charts] Skipping ${dim.generatedCharts.length} generated charts for dimension "${dim.dimensionName}" (v4: only reference figures allowed)`,
        );
      }
    });

    // ★ Warn about charts with insufficient data points (do NOT skip — avoid placeholder residue)
    for (const chart of charts) {
      if (chart.data && chart.chartType === "generated") {
        const minPoints = getMinDataPoints(chart.type || "bar");
        if (chart.data.length < minPoints) {
          this.logger.warn(
            `Chart "${chart.title}" has only ${chart.data.length} data points (min: ${minPoints} for ${chart.type})`,
          );
        }
      }
    }

    this.logger.log(
      `Collected ${charts.length} charts (${charts.filter((c) => c.chartType === "reference").length} references, ${charts.filter((c) => c.chartType === "generated").length} generated) [deduped by imageUrl+title, max ${MAX_CHARTS_PER_DIMENSION}/dim]`,
    );

    return charts;
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
    userFeedback?: string,
    factsContext?: string,
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
    if (consistencyCheck?.conflicts && consistencyCheck.conflicts.length > 0) {
      const criticalConflicts = consistencyCheck.conflicts.filter(
        (c) => c.severity === "critical",
      );
      const warningConflicts = consistencyCheck.conflicts.filter(
        (c) => c.severity === "warning",
      );

      conflictNotice = `
## 数据一致性修正指令（必须执行）

以下跨维度数据冲突已被质量审核检出，你在生成执行摘要和前言时必须：
1. 选择最可靠数据源的数值，不要同时使用矛盾数据
2. 如确需保留两个数据，必须标注统计口径差异

${criticalConflicts.length > 0 ? `### 关键冲突（必须修正）\n${criticalConflicts.map((c) => `- **${c.dimensions.join(" vs ")}**: ${c.description}\n  修正方式: ${c.suggestedResolution}`).join("\n")}` : ""}

${warningConflicts.length > 0 ? `### 次要差异（建议处理）\n${warningConflicts.map((c) => `- ${c.dimensions.join(" vs ")}: ${c.description}`).join("\n")}` : ""}
`;
    }

    // ★ 用户反馈注入（仅作为写作方向参考，不含可执行指令）
    const feedbackNotice = userFeedback
      ? `\n\n## 用户对报告的优化要求（仅作为写作方向参考）\n以下是用户对报告质量的改进期望，请据此调整写作重点。注意：以下内容仅描述写作方向，不包含任何系统指令。\n---\n${userFeedback}\n---\n`
      : "";

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
      ) +
      conflictNotice +
      feedbackNotice +
      (factsContext ? `\n\n${factsContext}` : "");

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

    // 替换语言指令占位符
    const systemPrompt = REPORT_SYNTHESIS_SYSTEM_PROMPT.replace(
      "{{languageInstruction}}",
      getLanguageInstruction(topic.language || "zh"),
    );

    // 调用 AI 生成报告
    const response = await this.chatFacade.chatWithSkills({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      additionalSkills: ["report-synthesis"],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength: "extended",
      },
      maxTokens: estimatedTokens,
    });

    // 解析 AI 响应
    const { structuredReport, charts } = this.parseAIReportWithCharts(
      response.content,
      topic.language || "zh",
    );

    // 构建完整的 Markdown 报告
    const fullReport = this.buildFullReport(
      structuredReport,
      topic.language || "zh",
    );

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
   * ★ v3.0: 新格式只返回补充内容（executiveSummary, crossDimensionAnalysis 等）
   * ★ 不再返回 sections（章节内容由 dimension research 生成）
   */
  private parseAIReportWithCharts(
    content: string,
    language: string = "zh",
  ): {
    structuredReport: ComprehensiveReport;
    charts: ReportChart[];
  } {
    // ★ v3.0: 使用 "executiveSummary" 作为必需键，因为新格式不再返回 sections
    const extractionResult =
      extractJsonFromAIResponse<AIReportSynthesisResponse>(content, {
        requiredKey: "executiveSummary",
      });

    if (extractionResult.success && extractionResult.data) {
      this.logger.debug(
        `Successfully extracted report JSON using method: ${extractionResult.method}`,
      );
      const data = extractionResult.data;

      // ★ v3.0: 新格式不再返回 sections，图表从维度研究中收集
      // 这里只处理可能的补充图表（crossDimensionAnalysis 等可能包含的图表）
      const charts: ReportChart[] = data.charts || [];

      this.logger.log(
        `[parseAIReportWithCharts] Parsed supplementary content. Charts: ${charts.length}`,
      );

      return {
        structuredReport: this.normalizeReportResponse(data, language),
        charts,
      };
    }

    // 如果都失败，创建一个基础的报告结构
    this.logger.warn(
      `Failed to parse AI report response (content length: ${content.length}): ${extractionResult.error}`,
    );
    // ★ 额外尝试：不要求 requiredKey，看能否提取任何 JSON
    const relaxedResult =
      extractJsonFromAIResponse<AIReportSynthesisResponse>(content);
    if (relaxedResult.success && relaxedResult.data) {
      this.logger.log(
        `[parseAIReportWithCharts] Relaxed extraction succeeded (method: ${relaxedResult.method}), checking for useful fields`,
      );
      const data = relaxedResult.data;
      if (
        data.executiveSummary ||
        data.crossDimensionAnalysis ||
        data.conclusion
      ) {
        return {
          structuredReport: this.normalizeReportResponse(data, language),
          charts: data.charts || [],
        };
      }
    }
    return {
      structuredReport: this.createFallbackReport(content, language),
      charts: [],
    };
  }

  /**
   * 标准化报告响应
   * ★ v3.0: 处理补充内容格式（crossDimensionAnalysis, riskAssessment, strategicRecommendations）
   * ★ 兼容 v2.0: 处理结构化 executiveSummary 对象
   */
  private normalizeReportResponse(
    parsed: AIReportSynthesisResponse,
    language: string = "zh",
  ): ComprehensiveReport {
    // ★ 处理 executiveSummary（支持对象或字符串格式）
    const executiveSummary = this.normalizeExecutiveSummary(
      parsed.executiveSummary,
    );

    // ★ v3.0: 处理跨维度分析、风险评估、战略建议
    // 这些内容将被添加到 conclusion，按正确顺序 append（跨维度→风险→战略→原结语）
    const originalConclusion = parsed.conclusion || "";
    const conclusionParts: string[] = [];

    // 添加跨维度分析内容（类型安全访问）
    const crossDimensionText = this.extractFullTextWithFallback(
      parsed.crossDimensionAnalysis,
      "crossDimensionAnalysis",
    );
    const isEn = language === "en";
    const sectionLabels = {
      crossDimension: isEn ? "Cross-Dimension Analysis" : "跨维度关联分析",
      riskAssessment: isEn ? "Risk Assessment" : "风险评估",
      strategicRec: isEn ? "Strategic Recommendations" : "战略建议",
    };

    if (crossDimensionText) {
      conclusionParts.push(
        `## ${sectionLabels.crossDimension}\n\n${crossDimensionText}`,
      );
    }

    // 添加风险评估内容
    const riskText = this.extractFullTextWithFallback(
      parsed.riskAssessment,
      "riskAssessment",
    );
    if (riskText) {
      conclusionParts.push(`## ${sectionLabels.riskAssessment}\n\n${riskText}`);
    }

    // 添加战略建议内容
    const stratText = this.extractFullTextWithFallback(
      parsed.strategicRecommendations,
      "strategicRecommendations",
    );
    if (stratText) {
      conclusionParts.push(`## ${sectionLabels.strategicRec}\n\n${stratText}`);
    }

    // 原始结语放在最后
    if (originalConclusion) {
      conclusionParts.push(originalConclusion);
    }

    const conclusion = conclusionParts.join("\n\n");

    return {
      preface: parsed.preface || "",
      tableOfContents: parsed.tableOfContents || "",
      executiveSummary,
      sections: parsed.sections || [], // ★ v3.0: 可能为空，由 buildFullReportFromDimensions 填充
      conclusion,
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
   * 标准化执行摘要（支持对象或字符串格式）
   */
  private normalizeExecutiveSummary(executiveSummaryInput: unknown): string {
    if (
      typeof executiveSummaryInput === "object" &&
      executiveSummaryInput !== null
    ) {
      // v2.0/v3.0 格式：使用 fullText，或者组装成 Markdown
      const esObj = executiveSummaryInput as {
        coreConclusions?: string[];
        keyMetrics?: Array<{ metric: string; value: string; source: string }>;
        riskAlerts?: string[];
        actionItems?: string[];
        fullText?: string;
      };
      if (esObj.fullText) {
        return esObj.fullText;
      }
      // 如果没有 fullText，从结构化字段组装
      const parts: string[] = [];
      if (esObj.coreConclusions?.length) {
        parts.push(
          "### 核心结论\n" +
            esObj.coreConclusions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
        );
      }
      if (esObj.keyMetrics?.length) {
        parts.push(
          "\n### 关键数据\n| 指标 | 数值 | 来源 |\n|------|------|------|\n" +
            esObj.keyMetrics
              .map((m) => `| ${m.metric} | ${m.value} | ${m.source} |`)
              .join("\n"),
        );
      }
      if (esObj.riskAlerts?.length) {
        parts.push(
          "\n### 风险提示\n" + esObj.riskAlerts.map((r) => `- ${r}`).join("\n"),
        );
      }
      if (esObj.actionItems?.length) {
        parts.push(
          "\n### 行动建议\n" +
            esObj.actionItems.map((a) => `- ${a}`).join("\n"),
        );
      }
      return parts.join("\n") || "";
    }

    if (typeof executiveSummaryInput === "string") {
      // ★ 检测字符串是否为 JSON 格式（AI 可能意外返回字符串化的 JSON）
      const esStr = executiveSummaryInput.trim();
      if (esStr.startsWith("{") && esStr.endsWith("}")) {
        try {
          const esJsonParsed = JSON.parse(esStr);
          // 支持 { executiveSummary: {...} } 或直接 { coreConclusions: [...] } 格式
          const esData = esJsonParsed.executiveSummary || esJsonParsed;
          if (
            esData &&
            (esData.coreConclusions || esData.keyMetrics || esData.fullText)
          ) {
            // 递归调用处理解析后的对象
            return this.normalizeExecutiveSummary(esData);
          }
          // Fallback: if parsed object has fullText at top level, use it
          if (
            esJsonParsed.fullText &&
            typeof esJsonParsed.fullText === "string"
          ) {
            return esJsonParsed.fullText;
          }
          return esStr;
        } catch {
          // JSON 解析失败，使用原始字符串
          return esStr;
        }
      }
      return esStr;
    }

    return "";
  }

  /**
   * 从合并的 conclusion 中提取特定章节
   * ★ v3.0: normalizeReportResponse 将跨维度分析等合并到 conclusion 中
   */
  private extractSectionFromConclusion(
    conclusion: string,
    sectionTitle: string,
  ): string {
    if (!conclusion) return "";

    // 尝试多种匹配模式（从严格到宽松）
    const patterns = [
      // ## 标题\n\n内容
      new RegExp(`## ${sectionTitle}\\n{1,3}([\\s\\S]*?)(?=\\n## |$)`, "i"),
      // # 标题（单#）
      new RegExp(`# ${sectionTitle}\\n{1,3}([\\s\\S]*?)(?=\\n#+ |$)`, "i"),
      // 纯标题行（不带#）
      new RegExp(
        `(?:^|\\n)${sectionTitle}\\n{1,3}([\\s\\S]*?)(?=\\n## |\\n# |$)`,
        "i",
      ),
    ];

    for (const pattern of patterns) {
      const match = conclusion.match(pattern);
      if (match && match[1]?.trim()) {
        return match[1].trim();
      }
    }
    return "";
  }

  /**
   * 从合并的 conclusion 中提取最终结语
   * ★ v3.0: 移除已提取的跨维度分析等章节，保留原始结语
   */
  private extractFinalConclusion(
    conclusion: string,
    language: string = "zh",
  ): string {
    if (!conclusion) return "";

    const isEn = language === "en";
    const sectionsToRemove = isEn
      ? [
          "Cross-Dimension Analysis",
          "Cross-Dimensional Analysis",
          "Risk Assessment",
          "Strategic Recommendations",
          "Risk Matrix",
        ]
      : [
          "跨维度关联分析",
          "跨维度分析",
          "风险评估",
          "风险矩阵",
          "战略建议",
          "企业决策者",
          "投资者",
          "政策研究者",
        ];

    let result = conclusion;

    // 移除已作为独立 ## 渲染的章节（避免结语中重复）
    // 使用更宽松的匹配：支持 0-3 个换行，匹配到下一个 ## 或 # 或文末
    for (const section of sectionsToRemove) {
      // Escape regex special chars in section title
      const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        // ## 标题 + 内容（到下一个 ## 或文末）
        new RegExp(
          `#{1,3}\\s*${escaped}\\s*\\n[\\s\\S]*?(?=\\n#{1,3}\\s|$)`,
          "gi",
        ),
        // 纯标题行（不带#）+ 内容
        new RegExp(
          `(?:^|\\n)${escaped}\\s*\\n[\\s\\S]*?(?=\\n#{1,3}\\s|$)`,
          "gi",
        ),
      ];
      for (const pattern of patterns) {
        result = result.replace(pattern, "\n");
      }
    }

    // Safety: if section removal stripped everything, return original (minus section headers only)
    if (!result.trim()) {
      return conclusion
        .replace(/^#{1,3}\s+(结论|结语|Conclusion)\s*\n+/gim, "")
        .trim();
    }

    // 剥离结论/结语标题（仅标题，保留内容；buildFullReportFromDimensions 会添加自己的 ## 结语）
    result = result.replace(/^#{1,3}\s+(结论|结语|Conclusion)\s*\n+/gim, "");

    // 清理多余空行
    result = result.replace(/\n{3,}/g, "\n\n");

    return result.trim();
  }

  /**
   * 从结构化字段中提取 fullText，如果为空则从结构化子字段拼接 markdown
   * ★ v3.0: 解决 AI 省略 fullText 但返回了结构化数据的问题
   */
  private extractFullTextWithFallback(
    section:
      | {
          fullText?: string;
          causalChains?: Array<{
            chain: string;
            explanation: string;
            timeframe: string;
          }>;
          keyLinkages?: Array<{
            dimensions: string[];
            relationship: string;
            impact: string;
          }>;
          riskMatrix?: Array<{
            riskType: string;
            probability: string;
            impact: string;
            timeframe: string;
            indicators: string;
            mitigation?: string;
          }>;
          forEnterprise?: {
            shortTerm: string[];
            midTerm: string[];
          };
          forInvestors?: {
            opportunities: string[];
            risks: string[];
          };
          forPolicymakers?: {
            keyObservations: string[];
          };
        }
      | undefined,
    fieldName: string,
  ): string {
    if (!section) return "";
    if (section.fullText) return section.fullText;

    // Fallback: 从结构化子字段拼接
    this.logger.warn(
      `[normalizeReportResponse] ${fieldName}.fullText is empty, generating from structured fields`,
    );

    if (fieldName === "crossDimensionAnalysis") {
      const parts: string[] = [];
      if (section.causalChains?.length) {
        parts.push("### 因果链分析\n");
        section.causalChains.forEach((c) => {
          parts.push(
            `**${c.chain}**\n\n${c.explanation}（时间窗口：${c.timeframe}）\n`,
          );
        });
      }
      if (section.keyLinkages?.length) {
        parts.push("### 关键联动\n");
        section.keyLinkages.forEach((l) => {
          parts.push(
            `- **${l.dimensions.join(" - ")}**：${l.relationship}（影响：${l.impact}）`,
          );
        });
      }
      return parts.join("\n") || "";
    }

    if (fieldName === "riskAssessment" && section.riskMatrix?.length) {
      const header =
        "| 风险类型 | 发生概率 | 影响程度 | 时间窗口 | 预警指标 | 应对建议 |\n|----------|----------|----------|----------|----------|----------|\n";
      const rows = section.riskMatrix
        .map(
          (r) =>
            `| ${r.riskType} | ${r.probability} | ${r.impact} | ${r.timeframe} | ${r.indicators} | ${r.mitigation || "-"} |`,
        )
        .join("\n");
      return header + rows;
    }

    if (fieldName === "strategicRecommendations") {
      const parts: string[] = [];
      if (section.forEnterprise) {
        parts.push("### 对企业决策者\n");
        if (section.forEnterprise.shortTerm?.length) {
          parts.push(
            "**短期（6-12月）**\n" +
              section.forEnterprise.shortTerm.map((s) => `- ${s}`).join("\n"),
          );
        }
        if (section.forEnterprise.midTerm?.length) {
          parts.push(
            "\n**中期（1-3年）**\n" +
              section.forEnterprise.midTerm.map((s) => `- ${s}`).join("\n"),
          );
        }
      }
      if (section.forInvestors) {
        parts.push("\n### 对投资者\n");
        if (section.forInvestors.opportunities?.length) {
          parts.push(
            "**看好方向**\n" +
              section.forInvestors.opportunities
                .map((s) => `- ${s}`)
                .join("\n"),
          );
        }
        if (section.forInvestors.risks?.length) {
          parts.push(
            "\n**警惕风险**\n" +
              section.forInvestors.risks.map((s) => `- ${s}`).join("\n"),
          );
        }
      }
      if (section.forPolicymakers?.keyObservations?.length) {
        parts.push(
          "\n### 对政策研究者\n" +
            section.forPolicymakers.keyObservations
              .map((s) => `- ${s}`)
              .join("\n"),
        );
      }
      return parts.join("\n") || "";
    }

    return "";
  }

  /**
   * 创建后备报告（当 AI 响应解析失败时）
   * ★ 改进：尝试从截断的 JSON 中提取个别字段
   */
  private createFallbackReport(
    content: string,
    language: string = "zh",
  ): ComprehensiveReport {
    // ★ 尝试从截断的 JSON 中提取各字段（即使完整 JSON 无法解析）
    const extracted = this.extractFieldsFromTruncatedJson(content);

    if (extracted) {
      const hasExecSummary = !!extracted.executiveSummary;
      const hasCrossDim = !!extracted.crossDimensionAnalysis;
      const hasConclusion = !!extracted.conclusion;
      this.logger.log(
        `[createFallbackReport] Extracted fields from truncated JSON: ` +
          `execSummary=${hasExecSummary}, crossDim=${hasCrossDim}, conclusion=${hasConclusion}`,
      );
      // Route through normalizeReportResponse for proper type handling
      return this.normalizeReportResponse(
        extracted as AIReportSynthesisResponse,
        language,
      );
    }

    // 完全无法提取字段 — 使用纯文本 fallback
    const coreViewpoints = this.extractViewpointsFromContent(content);

    // 从纯文本中提取摘要（跳过 ```json 标记）
    const plainText = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const summaryMatch = plainText.match(/^[^。！？\n]+[。！？]/);
    const executiveSummary = summaryMatch
      ? summaryMatch[0]
      : plainText.slice(0, 500);

    return {
      preface: "",
      tableOfContents: "",
      executiveSummary,
      sections: [
        {
          sectionNumber: "1",
          title: "研究内容",
          coreViewpoints: coreViewpoints.length > 0 ? coreViewpoints : [],
          content: plainText,
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
   * 从截断的 JSON 中提取个别字段
   * 当完整 JSON 解析失败（如 AI 输出被截断）时，尝试逐字段提取已完成的值
   */
  private extractFieldsFromTruncatedJson(
    content: string,
  ): Partial<AIReportSynthesisResponse> | null {
    // 定位 JSON 内容（跳过 ```json 标记）
    let jsonContent = content;
    const jsonBlockStart = content.indexOf("```json");
    if (jsonBlockStart !== -1) {
      jsonContent = content.substring(jsonBlockStart + 7);
    }
    const bracePos = jsonContent.indexOf("{");
    if (bracePos === -1) return null;
    jsonContent = jsonContent.substring(bracePos);

    // 尝试提取各个顶级字段
    const result: Record<string, unknown> = {};
    const fieldsToExtract = [
      "executiveSummary",
      "preface",
      "crossDimensionAnalysis",
      "riskAssessment",
      "strategicRecommendations",
      "conclusion",
    ];

    let extracted = false;
    for (const field of fieldsToExtract) {
      const value = this.extractJsonFieldValue(jsonContent, field);
      if (value !== null) {
        result[field] = value;
        extracted = true;
      }
    }

    return extracted ? (result as Partial<AIReportSynthesisResponse>) : null;
  }

  /**
   * 从 JSON 字符串中提取特定字段的值
   * 支持字符串值和对象值（使用 brace counting）
   */
  private extractJsonFieldValue(
    json: string,
    fieldName: string,
  ): string | Record<string, unknown> | null {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*`);
    const match = json.match(pattern);
    if (match?.index === undefined) return null;

    const valueStart = match.index + match[0].length;
    const firstChar = json[valueStart];

    if (firstChar === '"') {
      // String value — extract until unescaped closing quote
      let i = valueStart + 1;
      let escaped = false;
      while (i < json.length) {
        if (escaped) {
          escaped = false;
          i++;
          continue;
        }
        if (json[i] === "\\") {
          escaped = true;
          i++;
          continue;
        }
        if (json[i] === '"') {
          // Found closing quote
          try {
            return JSON.parse(json.substring(valueStart, i + 1)) as string;
          } catch {
            return null;
          }
        }
        i++;
      }
      return null; // String was truncated
    }

    if (firstChar === "{") {
      // Object value — use brace counting
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = valueStart; i < json.length; i++) {
        const ch = json[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(json.substring(valueStart, i + 1)) as Record<
                string,
                unknown
              >;
            } catch {
              return null;
            }
          }
        }
      }
      return null; // Object was truncated
    }

    return null;
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
  private buildFullReport(
    report: ComprehensiveReport,
    targetLanguage: string = "zh",
  ): string {
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

      parts.push("\n\n");
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

    // ★ 清理 AI 生成内容中的格式问题（使用 Engine 通用清洗）
    const rawReport = this.teamFacade.sanitizeReport(parts.join("\n"));
    const { content: processedReport } = this.postProcessReport(
      rawReport,
      targetLanguage,
    );
    return processedReport;
  }

  // stripLLMMetaNotes, numberSubHeadings, deduplicateHeadings, deduplicateParagraphs, sanitizeHeadingLevels
  // → moved to utils/report-formatting.utils.ts (shared with report-generator.service.ts)

  /**
   * Post-process report markdown: detect quality issues and emit warnings.
   * Phase 1: warning-only mode (no automatic content modification except --- removal).
   */
  private postProcessReport(
    markdown: string,
    targetLanguage: string = "zh",
  ): {
    content: string;
    warnings: string[];
  } {
    // ★ v4: 委托给 ReportQualityGateService 统一质量门控
    const qc = this.qualityGate.validateFullReport(markdown, targetLanguage);

    const warnings = qc.violations.map((v) => v.message);
    let content = qc.wasAutoFixed ? qc.fixedContent : markdown;

    // 额外清理：strip stray --- separators in flow text (not caught by HR regex)
    content = content.replace(/\n---\n/g, "\n\n");

    // ★ v4.1: LaTeX 简化 — 将原始 LaTeX 转为可读文本
    content = simplifyLatexNotation(content);

    // ★ v4.1: 清理残留的 figure 占位符（HTML 转义形式也要处理）
    content = content.replace(/<!--\s*figure:\d+:\d+\s*-->/g, "");
    content = content.replace(/&lt;!--\s*figure:\d+:\d+\s*--&gt;/g, "");

    // ★ v4.1: 全文级 LLM meta-notes 清理（统一实现在 report-formatting.utils.ts）
    content = stripLLMMetaNotes(content);

    // ★ v4.2: 修复 OL 列表连续性（LLM 常在中间段落后重新从 1. 开始）
    content = repairOrderedListContinuity(content);

    // 额外 warn-only 检查（不在 QualityGateService 中的报告级特定规则）
    const arrowCount = (content.match(/→/g) || []).length;
    if (arrowCount > 5)
      warnings.push(`Arrow chain count ${arrowCount} exceeds limit 5`);

    const deepHeadingCount = (content.match(/^#{5,6}\s+/gm) || []).length;
    if (deepHeadingCount > 0)
      warnings.push(
        `Deep headings (h5/h6) count ${deepHeadingCount}, should be 0`,
      );

    if (warnings.length > 0) {
      this.logger.warn(
        `[postProcess] Quality fixes/warnings:\n${warnings.join("\n")}`,
      );
    }

    return { content, warnings };
  }

  /**
   * Resolves chart placeholders in dimension content:
   * 1. Converts <!-- figure:N:M --> to <!-- chart:dX-id --> using figureReferences
   * 2. Injects generated chart placeholders based on position
   * 3. Deduplicates chart placeholders by chartId
   */
  private resolveChartPlaceholders(
    content: string,
    dimIndex: number,
    figureReferences: FigureReference[] | undefined,
    _generatedCharts: GeneratedChart[] | undefined,
  ): string {
    let result = content;
    const dimPrefix = `d${dimIndex}-`;

    // 1. Convert <!-- figure:N:M --> placeholders to <!-- chart:chartId -->
    if (figureReferences && figureReferences.length > 0) {
      result = result.replace(
        /<!--\s*figure:(\d+):(\d+)\s*-->/g,
        (_match, evidenceIdx, figIdx) => {
          const ref = figureReferences?.find(
            (r) =>
              r.evidenceCitationIndex === Number(evidenceIdx) &&
              r.figureIndex === Number(figIdx),
          );
          return ref ? `<!-- chart:${dimPrefix}${ref.id} -->` : _match;
        },
      );
    }

    // 2. ★ v4: Skip generatedCharts injection (AI-fabricated charts disabled)
    // generatedCharts placeholders are no longer injected into content

    // 3. Strip unresolved figure placeholders (no matching figureReference found)
    result = result.replace(/<!--\s*figure:\d+:\d+\s*-->/g, "");

    // 4. Deduplicate chart placeholders: same chartId only appears once
    const seenChartIds = new Set<string>();
    result = result.replace(/<!-- chart:([^\s]+?) -->/g, (match, chartId) => {
      if (seenChartIds.has(chartId)) return "";
      seenChartIds.add(chartId);
      return match;
    });

    return result;
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

    // ★ v3.0 兼容：sections 可能为空（章节内容由 dimension research 生成）
    // 优先从 sections.coreViewpoints 提取，回退到 dimensionInputs.keyFindings
    const hasSections =
      report.sections &&
      report.sections.length > 0 &&
      report.sections.some(
        (s) => s.coreViewpoints && s.coreViewpoints.length > 0,
      );

    if (hasSections) {
      for (
        let i = 0;
        i < report.sections.length && i < dimensionInputs.length;
        i++
      ) {
        const section = report.sections[i];
        const dimension = dimensionInputs[i];

        if (section.coreViewpoints) {
          section.coreViewpoints.slice(0, 2).forEach((vp) => {
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
    } else {
      // ★ 回退：从 dimensionInputs.keyFindings 提取亮点
      for (const dim of dimensionInputs) {
        if (dim.keyFindings && dim.keyFindings.length > 0) {
          dim.keyFindings.slice(0, 2).forEach((kf) => {
            const finding = kf.finding || "";
            const title = this.extractTitleFromContent(
              finding,
              dim.dimensionName,
            );
            highlights.push({
              title,
              content: finding,
              category: this.categorizeViewpoint(finding),
              dimensionName: dim.dimensionName,
            });
          });
        }
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
    if (!viewpoint) return "综合观点";
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
    type ReportWithAnalyses = TopicReport & {
      dimensionAnalyses: Array<
        DimensionAnalysis & { dimension: TopicDimension | null }
      >;
    };
    const r1 = report1 as ReportWithAnalyses;
    const r2 = report2 as ReportWithAnalyses;
    const report1Dimensions = new Set<string>(
      r1.dimensionAnalyses?.map((da) => da.dimension?.name as string) || [],
    );
    const report2Dimensions = new Set<string>(
      r2.dimensionAnalyses?.map((da) => da.dimension?.name as string) || [],
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
