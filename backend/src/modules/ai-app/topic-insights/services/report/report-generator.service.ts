import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  sanitizeMarkdownContent,
  stripLeadingHeading,
} from "@/common/utils/sanitize-content.utils";
import { AIModelType } from "@prisma/client";
import type { ResearchTopic } from "@prisma/client";
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
  formatReducedDimensionSummaries,
  formatEvidenceList,
  renderReportSynthesisPrompt,
} from "../../prompts/report-synthesis.prompt";
import {
  CONSISTENCY_CHECK_SYSTEM_PROMPT,
  CONSISTENCY_CHECK_USER_PROMPT,
} from "../../prompts/consistency-check.prompt";
import { getLanguageInstruction } from "../../prompts";
import {
  stripChartJsonFromContent,
  extractMarkdownFromJsonString,
} from "../../utils/strip-chart-json.utils";

/**
 * Report Generator Service
 *
 * 负责使用 AI 生成综合研究报告：
 * 1. 调用 AI 生成执行摘要、前言、跨维度分析等
 * 2. 构建完整的 Markdown 报告
 * 3. 提取报告亮点
 * 4. 跨维度一致性检查
 */
@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * ★ 跨维度一致性检查 Skill
   *
   * 在报告整合前检查各维度之间的数据/逻辑冲突
   * 参考: skills/consistency-check.skill.md
   */
  async checkCrossDimensionConsistency(
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
   * 使用 AI 生成综合研究报告
   */
  async generateComprehensiveReport(
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
      feedbackNotice;

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

    // 调用 AI 生成报告（带 input-complexity-check 容错）
    let response;
    try {
      response = await this.chatFacade.chatWithSkills({
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
    } catch (primaryError: unknown) {
      const errMsg =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      if (
        errMsg.includes("input-complexity-check") ||
        errMsg.includes("context_length") ||
        errMsg.includes("max_tokens")
      ) {
        this.logger.warn(
          `[generateComprehensiveReport] Primary prompt too large (${errMsg}), retrying with reduced prompt`,
        );

        // ★ Fallback: 极简 prompt — 仅 summary + top 2 findings，无 evidence，无 detailedContent
        const reducedDimensionDetails =
          formatReducedDimensionSummaries(dimensionInputs);
        const reducedUserPrompt =
          renderReportSynthesisPrompt(
            topic.name,
            topic.type,
            topic.description,
            new Date().toISOString().split("T")[0],
            dimensionInputs.length,
            evidenceInputs.length,
            dimensionOverview,
            reducedDimensionDetails,
            "（证据列表已省略以减少输入量，请基于维度摘要中的信息生成报告）",
          ) + feedbackNotice;

        response = await this.chatFacade.chatWithSkills({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: reducedUserPrompt },
          ],
          additionalSkills: ["report-synthesis"],
          modelType: AIModelType.CHAT,
          taskProfile: {
            creativity: "medium",
            outputLength: "extended",
          },
          maxTokens: estimatedTokens,
        });
      } else {
        throw primaryError;
      }
    }

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
   * 生成执行摘要
   */
  async generateExecutiveSummary(
    topic: ResearchTopic,
    dimensionInputs: DimensionAnalysisInput[],
  ): Promise<string> {
    // 简化版的报告生成，只生成执行摘要
    const result = await this.generateComprehensiveReport(
      topic,
      dimensionInputs,
      [],
    );
    return result.executiveSummary;
  }

  /**
   * ★ 从维度分析直接构建完整报告（拼接而非重写）
   *
   * 核心策略：
   * 1. 直接使用各维度的 detailedContent（研究员生成的完整内容）
   * 2. 只由 AI 生成补充内容（执行摘要、前言、跨维度分析、风险评估、战略建议、结语）
   * 3. 保持报告的完整性和一致性
   */
  buildFullReportFromDimensions(
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

    // ★ Safety net: sanitize all supplementary content to ensure no raw JSON in report
    const sanitized = {
      preface: supplementaryContent.preface
        ? extractMarkdownFromJsonString(supplementaryContent.preface)
        : supplementaryContent.preface,
      executiveSummary: supplementaryContent.executiveSummary
        ? extractMarkdownFromJsonString(supplementaryContent.executiveSummary)
        : supplementaryContent.executiveSummary,
      crossDimensionAnalysis: supplementaryContent.crossDimensionAnalysis
        ? extractMarkdownFromJsonString(
            supplementaryContent.crossDimensionAnalysis,
          )
        : supplementaryContent.crossDimensionAnalysis,
      riskAssessment: supplementaryContent.riskAssessment
        ? extractMarkdownFromJsonString(supplementaryContent.riskAssessment)
        : supplementaryContent.riskAssessment,
      strategicRecommendations: supplementaryContent.strategicRecommendations
        ? extractMarkdownFromJsonString(
            supplementaryContent.strategicRecommendations,
          )
        : supplementaryContent.strategicRecommendations,
      conclusion: supplementaryContent.conclusion
        ? extractMarkdownFromJsonString(supplementaryContent.conclusion)
        : supplementaryContent.conclusion,
    };

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
    if (sanitized.preface) {
      parts.push(`## ${labels.preface}\n`);
      parts.push(stripLeadingHeading(sanitized.preface));
      parts.push("\n");
    }

    // 3. 执行摘要（AI 生成）
    if (sanitized.executiveSummary) {
      parts.push(`## ${labels.executiveSummary}\n`);
      parts.push(stripLeadingHeading(sanitized.executiveSummary));
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
    // ★ 只在对应 sanitized 非空时添加目录项
    if (sanitized.crossDimensionAnalysis) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.crossDimension}](#${labels.crossDimension.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sanitized.riskAssessment) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.riskAssessment}](#${labels.riskAssessment.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    if (sanitized.strategicRecommendations) {
      tocIndex++;
      parts.push(
        `${tocIndex}. [${labels.strategicRec}](#${labels.strategicRec.toLowerCase().replace(/\s+/g, "-")})`,
      );
    }
    parts.push("\n---\n");

    // 5. 各维度章节（直接使用 detailedContent，但限制长度）
    const MAX_DIMENSION_CHARS = 24000; // 约 8000 中文字（每字约 3 chars）
    const globalSeenParagraphs = new Set<string>();
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
      // ★ 降级维度内容中的标题层级：# → ###, ## → ###（维度章节本身是 ##）
      content = content.replace(/^(#{1,2})\s+/gm, (match, hashes) => {
        if (hashes === "#") return "### ";
        if (hashes === "##") return "### ";
        return match;
      });
      // ★ 去除重复的 ### 标题（AI 有时生成 "### N. Xxx" 后又生成 "### Xxx"）
      {
        const lines = content.split("\n");
        const seenH3 = new Set<string>();
        content = lines
          .filter((line) => {
            const m = line.match(/^###\s+(.+)/);
            if (!m) return true;
            const normalized = m[1].replace(/^\d+\.\s*/, "").trim();
            if (seenH3.has(normalized)) return false;
            seenH3.add(normalized);
            return true;
          })
          .join("\n");
      }
      // ★ 统一子标题编号：### Title → ### N.M. Title, #### Title → #### N.M.K. Title
      content = this.numberSubHeadings(content, idx + 1);
      // ★ 跨维度段落去重：首 DEDUP_KEY_LENGTH 字相同的段落只保留首次出现
      {
        const DEDUP_MIN_LENGTH = 60; // 短于此长度的段落不参与去重
        const DEDUP_KEY_LENGTH = 120; // 用前 N 字符作为去重 key
        const paragraphs = content.split("\n\n");
        content = paragraphs
          .filter((p) => {
            const trimmed = p.trim();
            if (trimmed.length < DEDUP_MIN_LENGTH) return true;
            // 豁免标题、注释、列表项、引用块
            if (/^(#|<!--|[-*>|])/.test(trimmed)) return true;
            const key = trimmed.substring(0, DEDUP_KEY_LENGTH);
            if (globalSeenParagraphs.has(key)) {
              this.logger.debug(
                `[buildReport] Removing duplicate paragraph: "${key.substring(0, 40)}..."`,
              );
              return false;
            }
            globalSeenParagraphs.add(key);
            return true;
          })
          .join("\n\n");
      }
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
      content = content
        .replace(/（精简字数[^）]*）/g, "")
        .replace(/（原\d+[^）]*）/g, "")
        .replace(/（[约共]\d+字）/g, "")
        .replace(/（\d+字）/g, "")
        .replace(/\n{3,}/g, "\n\n");

      parts.push(content);
      parts.push("\n---\n");
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
      !sanitized.crossDimensionAnalysis &&
      !sanitized.riskAssessment &&
      !sanitized.strategicRecommendations
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
        parts.push("\n---\n");
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
        parts.push("\n---\n");
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
        parts.push("\n---\n");
      }
    }

    // 6. 跨维度关联分析（AI 生成） — 去重守卫：跳过已存在的同名章节
    if (
      sanitized.crossDimensionAnalysis &&
      !existingH2Titles.has(labels.crossDimension)
    ) {
      parts.push(`## ${labels.crossDimension}\n`);
      parts.push(stripLeadingHeading(sanitized.crossDimensionAnalysis));
      parts.push("\n---\n");
    }

    // 7. 风险评估（AI 生成）
    if (
      sanitized.riskAssessment &&
      !existingH2Titles.has(labels.riskAssessment)
    ) {
      parts.push(`## ${labels.riskAssessment}\n`);
      parts.push(stripLeadingHeading(sanitized.riskAssessment));
      parts.push("\n---\n");
    }

    // 8. 战略建议（AI 生成）
    if (
      sanitized.strategicRecommendations &&
      !existingH2Titles.has(labels.strategicRec)
    ) {
      parts.push(`## ${labels.strategicRec}\n`);
      parts.push(stripLeadingHeading(sanitized.strategicRecommendations));
      parts.push("\n---\n");
    }

    // 9. 结语（AI 生成）
    if (sanitized.conclusion) {
      parts.push(`## ${labels.conclusion}\n`);
      parts.push(stripLeadingHeading(sanitized.conclusion));
      parts.push("\n");
    }

    return sanitizeMarkdownContent(parts.join("\n"));
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
      `Failed to parse AI report response: ${extractionResult.error}`,
    );
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
    // ★ Language-aware labels
    const isEn = language === "en";
    const labels = {
      crossDimension: isEn ? "Cross-Dimension Analysis" : "跨维度关联分析",
      riskAssessment: isEn ? "Risk Assessment" : "风险评估",
      strategicRec: isEn ? "Strategic Recommendations" : "战略建议",
    };

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
      language,
    );
    if (crossDimensionText) {
      conclusionParts.push(
        `## ${labels.crossDimension}\n\n${crossDimensionText}`,
      );
    }

    // 添加风险评估内容
    const riskText = this.extractFullTextWithFallback(
      parsed.riskAssessment,
      "riskAssessment",
      language,
    );
    if (riskText) {
      conclusionParts.push(`## ${labels.riskAssessment}\n\n${riskText}`);
    }

    // 添加战略建议内容
    const stratText = this.extractFullTextWithFallback(
      parsed.strategicRecommendations,
      "strategicRecommendations",
      language,
    );
    if (stratText) {
      conclusionParts.push(`## ${labels.strategicRec}\n\n${stratText}`);
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
          // fallback: 如果顶层有 fullText 字符串，直接返回
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
    language: string = "zh",
  ): string {
    if (!section) return "";
    if (section.fullText) return section.fullText;

    // Fallback: 从结构化子字段拼接
    this.logger.warn(
      `[normalizeReportResponse] ${fieldName}.fullText is empty, generating from structured fields`,
    );

    const isEn = language === "en";

    if (fieldName === "crossDimensionAnalysis") {
      const parts: string[] = [];
      if (section.causalChains?.length) {
        parts.push(`### ${isEn ? "Causal Chain Analysis" : "因果链分析"}\n`);
        section.causalChains.forEach((c) => {
          parts.push(
            `**${c.chain}**\n\n${c.explanation}${isEn ? ` (Timeframe: ${c.timeframe})` : `（时间窗口：${c.timeframe}）`}\n`,
          );
        });
      }
      if (section.keyLinkages?.length) {
        parts.push(`### ${isEn ? "Key Linkages" : "关键联动"}\n`);
        section.keyLinkages.forEach((l) => {
          parts.push(
            `- **${l.dimensions.join(" - ")}**${isEn ? `: ${l.relationship} (Impact: ${l.impact})` : `：${l.relationship}（影响：${l.impact}）`}`,
          );
        });
      }
      return parts.join("\n") || "";
    }

    if (fieldName === "riskAssessment" && section.riskMatrix?.length) {
      const header = isEn
        ? "| Risk Type | Probability | Impact | Timeframe | Indicators | Mitigation |\n|-----------|-------------|--------|-----------|------------|------------|\n"
        : "| 风险类型 | 发生概率 | 影响程度 | 时间窗口 | 预警指标 | 应对建议 |\n|----------|----------|----------|----------|----------|----------|\n";
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
        parts.push(
          `### ${isEn ? "For Enterprise Decision Makers" : "对企业决策者"}\n`,
        );
        if (section.forEnterprise.shortTerm?.length) {
          parts.push(
            `**${isEn ? "Short-term (6-12 months)" : "短期（6-12月）"}**\n` +
              section.forEnterprise.shortTerm.map((s) => `- ${s}`).join("\n"),
          );
        }
        if (section.forEnterprise.midTerm?.length) {
          parts.push(
            `\n**${isEn ? "Mid-term (1-3 years)" : "中期（1-3年）"}**\n` +
              section.forEnterprise.midTerm.map((s) => `- ${s}`).join("\n"),
          );
        }
      }
      if (section.forInvestors) {
        parts.push(`\n### ${isEn ? "For Investors" : "对投资者"}\n`);
        if (section.forInvestors.opportunities?.length) {
          parts.push(
            `**${isEn ? "Opportunities" : "看好方向"}**\n` +
              section.forInvestors.opportunities
                .map((s) => `- ${s}`)
                .join("\n"),
          );
        }
        if (section.forInvestors.risks?.length) {
          parts.push(
            `\n**${isEn ? "Risks to Watch" : "警惕风险"}**\n` +
              section.forInvestors.risks.map((s) => `- ${s}`).join("\n"),
          );
        }
      }
      if (section.forPolicymakers?.keyObservations?.length) {
        parts.push(
          `\n### ${isEn ? "For Policy Researchers" : "对政策研究者"}\n` +
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
   * ★ 改进：尝试从原始内容中提取有意义的观点
   */
  private createFallbackReport(
    content: string,
    language: string = "zh",
  ): ComprehensiveReport {
    const isEn = language === "en";

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
          title: isEn ? "Research Content" : "研究内容",
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
  private buildFullReport(
    report: ComprehensiveReport,
    language: string = "zh",
  ): string {
    const isEn = language === "en";
    const labels = {
      preface: isEn ? "Preface" : "前言",
      toc: isEn ? "Table of Contents" : "目录",
      coreViewpoints: isEn ? "Core Viewpoints" : "核心观点",
      keyData: isEn ? "Key Data" : "关键数据",
      source: isEn ? "Source" : "来源",
      conclusion: isEn ? "Conclusion" : "结束语",
      appendices: isEn ? "Appendices" : "附录",
      appendix: isEn ? "Appendix" : "附录",
      references: isEn ? "References" : "参考文献",
      accessDate: isEn ? "Access Date" : "访问日期",
    };

    const parts: string[] = [];

    // 1. 前言
    if (report.preface) {
      parts.push(`# ${labels.preface}\n\n` + report.preface);
    }

    // 2. 目录
    if (report.tableOfContents) {
      parts.push(`# ${labels.toc}\n\n` + report.tableOfContents);
    }

    // 3. 各章节
    for (const section of report.sections) {
      parts.push(`# ${section.sectionNumber}. ${section.title}`);

      // 核心观点
      if (section.coreViewpoints && section.coreViewpoints.length > 0) {
        parts.push(`\n🎯 **${labels.coreViewpoints}：**\n`);
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
        parts.push(`\n**${labels.keyData}：**\n`);
        section.keyData.forEach((kd) => {
          parts.push(`- ${kd.data} (${labels.source}: ${kd.source})`);
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
      parts.push(`# ${labels.conclusion}\n\n` + report.conclusion);
    }

    // 5. 附录
    if (report.appendices && report.appendices.length > 0) {
      parts.push(`\n# ${labels.appendices}\n`);
      report.appendices.forEach((appendix, i) => {
        parts.push(`\n## ${labels.appendix}${i + 1}：${appendix.title}\n`);
        parts.push(appendix.content);
      });
    }

    // 6. 参考文献
    if (report.references && report.references.length > 0) {
      parts.push(`\n# ${labels.references}\n`);
      report.references.forEach((ref) => {
        parts.push(
          `[${ref.index}] ${ref.title}. ${ref.domain || ""}. ${ref.url}. ${labels.accessDate}: ${ref.accessDate}`,
        );
      });
    }

    // ★ 清理 AI 生成内容中的格式问题（如引用后的孤立下划线 [1]___）
    return sanitizeMarkdownContent(parts.join("\n"));
  }

  /**
   * Give dimension sub-headings hierarchical numbering.
   * ### Title → ### N.M. Title
   * #### Title → #### N.M.K. Title
   * Existing numeric prefixes (e.g. "1. Title" or "1.2. Title") are stripped first.
   */
  private numberSubHeadings(content: string, dimIndex: number): string {
    let h3Count = 0;
    let h4Count = 0;

    return content.replace(
      /^(#{3,4})\s+(.+)$/gm,
      (_match, hashes: string, title: string) => {
        // Strip any existing numeric prefix (e.g. "1. ", "1.2. ", "1.2.3. ")
        const cleanTitle = title.replace(/^[\d.]+\s*/, "");

        if (hashes === "###") {
          h3Count++;
          h4Count = 0;
          return `### ${dimIndex}.${h3Count}. ${cleanTitle}`;
        }
        if (hashes === "####") {
          h4Count++;
          return `#### ${dimIndex}.${h3Count}.${h4Count}. ${cleanTitle}`;
        }
        return `${hashes} ${title}`;
      },
    );
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
    generatedCharts: GeneratedChart[] | undefined,
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

    // 2. Inject generatedCharts placeholders (based on position)
    if (generatedCharts && generatedCharts.length > 0) {
      result = this.injectChartPlaceholders(
        result,
        generatedCharts.map((c) => ({
          id: `${dimPrefix}${c.id}`,
          position: c.position,
        })),
      );
    }

    // 3. Deduplicate chart placeholders: same chartId only appears once
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
  extractHighlights(
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
   * 从合并的 conclusion 中提取特定章节
   * ★ v3.0: normalizeReportResponse 将跨维度分析等合并到 conclusion 中
   */
  extractSectionFromConclusion(
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
  extractFinalConclusion(conclusion: string, language: string = "zh"): string {
    if (!conclusion) return "";

    // ★ Language-aware section titles
    const isEn = language === "en";
    const sectionsToRemove = isEn
      ? [
          "Cross-Dimension Analysis",
          "Risk Assessment",
          "Strategic Recommendations",
        ]
      : ["跨维度关联分析", "风险评估", "战略建议"];

    // 移除跨维度分析、风险评估、战略建议章节
    let result = conclusion;

    for (const section of sectionsToRemove) {
      const pattern = new RegExp(
        `## ${section}\\n\\n[\\s\\S]*?(?=## |$)`,
        "gi",
      );
      result = result.replace(pattern, "");
    }

    return result.trim();
  }
}
