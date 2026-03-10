/**
 * Section Writer Service
 *
 * Agent 服务：负责撰写单个章节内容
 * 每次调用只生成 300-800 字，确保不超 token 限制
 *
 * ★ 增强：内容质量检查和自动重试
 * - 检查 API 错误状态，自动抛出异常触发重试
 * - 检查内容长度，极短内容视为失败
 */

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import type { SectionPlan } from "../core/research-leader.service";
import {
  SECTION_WRITING_SYSTEM_PROMPT,
  SECTION_WRITING_USER_PROMPT_TEMPLATE,
  SECTION_REVISION_USER_PROMPT_TEMPLATE,
  formatEvidenceForPrompt,
  renderPromptTemplate,
  getLanguageInstruction,
} from "../../prompts/dimension-research.prompt";
import { getWritingStandards } from "@/modules/ai-app/shared/report-template";
import type {
  EvidenceData,
  GeneratedChart,
  FigureReference,
  ExtractedFigure,
} from "../../types/research.types";

/**
 * 内容质量检查阈值
 */
const MIN_CONTENT_LENGTH = 200; // 最小内容长度（字符）
const MIN_CONTENT_LENGTH_RATIO = 0.1; // 最小内容长度比例（相对于目标字数）

/**
 * 时间上下文配置
 * 用于向 LLM 传递当前时间和时效性要求
 */
export interface TemporalContext {
  /** 当前日期字符串，如 "2025年1月19日" */
  currentDate: string;
  /** 时效性要求描述 */
  freshnessRequirement: string;
}

/**
 * 章节写作结果
 */
export interface SectionWriteResult {
  sectionId: string;
  title: string;
  content: string;
  wordCount: number;
  referencesUsed: string[];
  generatedCharts?: GeneratedChart[];
  figureReferences?: FigureReference[];
  actualModelId?: string; // ★ 实际使用的模型（可能与分配的不同）
}

/**
 * 章节写作输入
 */
export interface SectionWriteInput {
  section: SectionPlan;
  evidenceData: EvidenceData[];
  previousSections?: Array<{ title: string; content: string }>;
  /** ★ 指定使用的模型ID（用于实现 Agent 多元化） */
  modelId?: string;
  /** ★ 时间上下文（当前日期和时效性要求） */
  temporalContext?: TemporalContext;
  /** ★ Leader 预分配的图表（避免写手重复选图） */
  allocatedFigures?: import("../core/research-leader.service").AllocatedFigure[];
  /** V5: 验证结果上下文（注入到写作 prompt 中） */
  validationContext?: string;
  /** 研究语言设置 (zh/en) */
  topicLanguage?: string | null;
  /** ★ Leader 分配的任务级技能（与 section.agentConfig.skills 合并后注入 chatWithSkills） */
  assignedSkills?: string[];
}

/**
 * 章节修订输入
 */
export interface SectionRevisionInput {
  section: SectionPlan;
  originalContent: string;
  reviewFeedback: string;
  revisionInstructions: string;
  evidenceData: EvidenceData[];
  /** ★ 指定使用的模型ID（用于实现 Agent 多元化） */
  modelId?: string;
  /** 研究语言设置 (zh/en) */
  topicLanguage?: string | null;
  /** ★ Leader 分配的任务级技能（与 section.agentConfig.skills 合并后注入 chatWithSkills） */
  assignedSkills?: string[];
}

@Injectable()
export class SectionWriterService {
  private readonly logger = new Logger(SectionWriterService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * 撰写单个章节
   *
   * @param input 章节写作输入
   * @returns 章节写作结果
   */
  async writeSection(input: SectionWriteInput): Promise<SectionWriteResult> {
    const {
      section,
      evidenceData,
      previousSections,
      modelId,
      temporalContext,
    } = input;

    this.logger.log(
      `[writeSection] Writing section: ${section.title} (${section.targetWords} words)${modelId ? `, model: ${modelId}` : ""}`,
    );

    // 格式化证据列表
    const evidenceFormatted = formatEvidenceForPrompt(evidenceData);

    // 格式化要点列表（★ 规范化：去除截断的序号前缀）
    const keyPointsFormatted = section.keyPoints
      .map((p) => {
        // Strip truncated ordinal prefixes: "第一类是..." → "...", "一是..." → "..."
        // Also strip bare fragments: "类是...", "层是...", "点是...", "是..."
        let normalized = p
          .replace(/^[第]?[一二三四五六七八九十]+[类层点条项]?[是：:]\s*/u, "")
          .replace(/^[类层点条项][是：:]\s*/u, "")
          .replace(/^[是][：:]\s*/u, "");
        // If normalization emptied the string, use original
        if (normalized.trim().length < 5) normalized = p;
        return normalized;
      })
      .map((p, i) => `${i + 1}. ${p}`)
      .join("\n");

    // 格式化前置章节：传入所有已写 section，但智能截断控制总量
    let previousContent = "无";
    if (previousSections && previousSections.length > 0) {
      const MAX_PREVIOUS_TOTAL = 6000; // 总量上限
      const parts: string[] = [];
      let totalLength = 0;

      // 从最近的开始，每个 section 摘要 800 字符
      const reversed = [...previousSections].reverse();
      for (const s of reversed) {
        if (totalLength >= MAX_PREVIOUS_TOTAL) {
          // 超出总量上限，停止添加更多章节
          break;
        }
        // 智能截断：在句子结尾处截断，而非粗暴的 substring
        let truncated = s.content.substring(0, 800);
        if (s.content.length > 800) {
          // 寻找最后一个句子结束符（中英文）
          const lastSentenceEnd = Math.max(
            truncated.lastIndexOf("。"),
            truncated.lastIndexOf("."),
            truncated.lastIndexOf("！"),
            truncated.lastIndexOf("？"),
            truncated.lastIndexOf("!"),
            truncated.lastIndexOf("?"),
          );
          // 仅当找到的位置不太靠前（至少保留 600 字符）时才截断
          if (lastSentenceEnd > 600) {
            truncated = truncated.substring(0, lastSentenceEnd + 1);
          }
          truncated += "...";
        }
        const entry = `### ${s.title}\n${truncated}`;
        parts.push(entry);
        totalLength += entry.length;
      }

      // 恢复原始顺序
      previousContent = parts.reverse().join("\n\n");
    }

    // 格式化 Agent 配置指导（拆分为 leader 指导 + skill IDs）
    // ★ 合并 section-level 和 mission-level assignedSkills
    const { leaderGuidance, skillIds } = this.formatAgentGuidance(
      section,
      input.assignedSkills,
    );

    // 准备提示词变量（包含时间上下文）
    const promptVariables = {
      sectionTitle: section.title,
      sectionDescription: section.description,
      targetWords: String(section.targetWords),
      minReferences: String(section.evidenceRequirements.minReferences),
      keyPoints: keyPointsFormatted,
      evidenceList: evidenceFormatted,
      previousContent,
      agentGuidance: leaderGuidance,
      // ★ 时间上下文
      currentDate: temporalContext?.currentDate || this.getCurrentDate(),
      freshnessRequirement:
        temporalContext?.freshnessRequirement ||
        "不限制时间范围，但建议优先使用最近的数据",
      // ★ 图片资源列表
      figuresList: this.formatFiguresForSection(
        evidenceData,
        input.allocatedFigures,
      ),
    };

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      SECTION_WRITING_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    // V5: Inject validation context if available
    const finalUserPrompt = input.validationContext
      ? `${userPrompt}\n\n${input.validationContext}`
      : userPrompt;

    // 调用 AI 写作
    // ★ 支持指定模型实现 Agent 多元化
    const languageInstruction = getLanguageInstruction(
      input.topicLanguage || "zh",
    );
    const systemPrompt = renderPromptTemplate(SECTION_WRITING_SYSTEM_PROMPT, {
      languageInstruction,
      writingStandards: getWritingStandards(input.topicLanguage || "zh"),
    });

    const startTime = Date.now();
    // ★ 使用 chatWithSkills 自动注入 skill 内容到 system message，并记录 analytics
    const response = await this.chatFacade.chatWithSkills({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalUserPrompt },
      ],
      // 不传 domain（避免加载全部 11 个 research skills）
      // 只传 additionalSkills：精确加载 Leader 分配的 skill
      additionalSkills: skillIds,
      modelType: AIModelType.CHAT,
      model: modelId, // ★ 使用指定模型（如果提供）
      taskProfile: {
        creativity: "medium",
        outputLength: "long", // 支持 800-1500 字的章节
      },
    });
    const latencyMs = Date.now() - startTime;

    // ★ 检查 API 错误状态
    if (response.isError) {
      this.logger.error(
        `[writeSection] API error for ${section.title}: ${response.content.slice(0, 100)}`,
      );
      throw new InternalServerErrorException(
        `API error while writing section "${section.title}": ${response.content}`,
      );
    }

    // 提取内容（移除可能的 markdown 代码块包装）
    const rawContent = this.extractContent(response.content);

    // 解析图表数据
    const { markdown, charts } = this.parseChartOutput(rawContent);
    const content = markdown;

    // ★ 检查内容质量（长度检查）
    const minLength = Math.max(
      MIN_CONTENT_LENGTH,
      section.targetWords * MIN_CONTENT_LENGTH_RATIO,
    );
    if (content.length < minLength) {
      this.logger.error(
        `[writeSection] Content too short for ${section.title}: ${content.length} chars < ${minLength} min`,
      );
      throw new InternalServerErrorException(
        `Content too short for section "${section.title}": got ${content.length} chars, expected at least ${minLength}`,
      );
    }

    // 统计字数和引用
    const wordCount = content.length;
    const referencesUsed = this.extractReferences(content);

    // ★ 用 allocatedFigures + evidenceData 补全 figureReferences 中缺失的 imageUrl
    let figureRefsToBackfill = charts.figureReferences;

    // ★ Auto-inject: if LLM didn't return figureReferences but Leader allocated figures,
    // construct figureReferences from allocatedFigures WITH relevance filtering.
    // Previously all allocated figures were injected blindly, causing irrelevant images
    // (e.g. "robot industry" image in a "transformer architecture" section).
    if (
      figureRefsToBackfill.length === 0 &&
      input.allocatedFigures &&
      input.allocatedFigures.length > 0
    ) {
      // Build keywords from section title + keyPoints for relevance matching
      const sectionKeywords = [
        section.title,
        ...section.keyPoints,
        section.description || "",
      ]
        .join(" ")
        .toLowerCase();

      figureRefsToBackfill = input.allocatedFigures
        .filter((fig) => {
          if (!fig.imageUrl) return false;
          // Relevance check: caption or relevanceReason must share keywords with section
          const figText =
            `${fig.caption || ""} ${fig.relevanceReason || ""}`.toLowerCase();
          // ★ Require at least 2 meaningful keyword overlaps (was 1, too permissive)
          const figWords = figText
            .split(/[\s,，。、：:；;（）()]+/)
            .filter((w) => w.length >= 2);
          const matchCount = figWords.filter((word) =>
            sectionKeywords.includes(word),
          ).length;
          return matchCount >= 2;
        })
        .map((fig, idx) => {
          // ★ Build descriptive Source text from evidence metadata
          const evidenceItem = evidenceData.find(
            (_e, i) => i + 1 === fig.evidenceIndex,
          );
          const sourceText = evidenceItem
            ? `${evidenceItem.title || evidenceItem.domain || ""}`.trim() ||
              `[${fig.evidenceIndex}]`
            : `[${fig.evidenceIndex}]`;
          return {
            id: `auto-fig-${idx}`,
            evidenceCitationIndex: fig.evidenceIndex,
            figureIndex: fig.figureIndex,
            imageUrl: fig.imageUrl,
            caption: fig.caption || "",
            position: "end_of_section",
            source: sourceText,
            relevance: fig.relevanceReason || "",
          };
        });
      if (figureRefsToBackfill.length > 0) {
        this.logger.log(
          `[writeSection] Auto-injected ${figureRefsToBackfill.length} figures from allocatedFigures after relevance filter (LLM did not output figureReferences)`,
        );
      }
    }

    const backfilledRefs = this.backfillFigureUrls(
      figureRefsToBackfill,
      input.allocatedFigures,
      evidenceData,
    );

    // ★ 最终相关性校验：无论 figureReferences 来自 LLM 还是 auto-inject，
    //   都必须通过 caption-section 关键词匹配。防止 LLM 输出无关图片引用。
    const sectionCtx = [
      section.title,
      ...section.keyPoints,
      section.description || "",
    ]
      .join(" ")
      .toLowerCase();
    const finalFigureRefs = backfilledRefs.filter((ref) => {
      const refText =
        `${ref.caption || ""} ${ref.relevance || ""}`.toLowerCase();
      // Extract CJK bigrams + latin words for matching
      const cjkChars = refText.replace(/[^\u4e00-\u9fff]/g, "");
      const latinWords = refText
        .replace(/[\u4e00-\u9fff]+/g, " ")
        .split(/[\s\W]+/)
        .filter((w) => w.length >= 3);
      const bigrams: string[] = [];
      for (let bi = 0; bi < cjkChars.length - 1; bi++) {
        bigrams.push(cjkChars.substring(bi, bi + 2));
      }
      const keywords = [...bigrams, ...latinWords];
      // No keywords → reject (empty/generic caption)
      if (keywords.length === 0) return false;
      // ★ Require at least 2 keyword overlaps to prevent false positives
      const matchCount = keywords.filter((kw) =>
        sectionCtx.includes(kw),
      ).length;
      const relevant = matchCount >= 2;
      if (!relevant) {
        this.logger.warn(
          `[writeSection] Removing irrelevant figure "${ref.caption}" from section "${section.title}" — no keyword overlap`,
        );
      }
      return relevant;
    });

    this.logger.log(
      `[writeSection] Completed ${section.title}: ${wordCount} chars, ${referencesUsed.length} refs, ${finalFigureRefs.length} figRefs (${backfilledRefs.length - finalFigureRefs.length} filtered), ${charts.generatedCharts.length} charts, ${latencyMs}ms`,
    );

    return {
      sectionId: section.id,
      title: section.title,
      content,
      wordCount,
      referencesUsed,
      generatedCharts: charts.generatedCharts,
      figureReferences: finalFigureRefs,
      actualModelId: response.model, // ★ 记录实际使用的模型
    };
  }

  /**
   * 修订章节
   *
   * @param input 修订输入
   * @returns 修订后的章节
   */
  async reviseSection(
    input: SectionRevisionInput,
  ): Promise<SectionWriteResult> {
    const {
      section,
      originalContent,
      reviewFeedback,
      revisionInstructions,
      evidenceData,
      modelId,
    } = input;

    this.logger.log(
      `[reviseSection] Revising section: ${section.title}${modelId ? `, model: ${modelId}` : ""}`,
    );

    // 格式化证据列表
    const evidenceFormatted = formatEvidenceForPrompt(evidenceData);

    // 准备提示词变量
    const promptVariables = {
      sectionTitle: section.title,
      targetWords: String(section.targetWords),
      minReferences: String(section.evidenceRequirements.minReferences),
      originalContent,
      reviewFeedback,
      revisionInstructions: revisionInstructions || "请根据反馈改进内容",
      evidenceList: evidenceFormatted,
    };

    // 渲染用户提示词
    const userPrompt = renderPromptTemplate(
      SECTION_REVISION_USER_PROMPT_TEMPLATE,
      promptVariables,
    );

    // 调用 AI 修订
    // ★ 支持指定模型实现 Agent 多元化
    const revisionLanguageInstruction = getLanguageInstruction(
      input.topicLanguage || "zh",
    );
    const revisionSystemPrompt = renderPromptTemplate(
      SECTION_WRITING_SYSTEM_PROMPT,
      { languageInstruction: revisionLanguageInstruction },
    );

    // ★ 提取 Leader 分配的 skill（与 writeSection 保持一致）
    // ★ 合并 section-level 和 mission-level assignedSkills
    const { skillIds } = this.formatAgentGuidance(
      section,
      input.assignedSkills,
    );

    const startTime = Date.now();
    const response = await this.chatFacade.chatWithSkills({
      messages: [
        { role: "system", content: revisionSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      additionalSkills: skillIds,
      modelType: AIModelType.CHAT,
      model: modelId, // ★ 使用指定模型（如果提供）
      taskProfile: {
        creativity: "low", // 修订时降低创造性，保持一致性
        outputLength: "long", // 支持 800-1500 字的章节
      },
    });
    const latencyMs = Date.now() - startTime;

    // ★ 检查 API 错误状态
    if (response.isError) {
      this.logger.error(
        `[reviseSection] API error for ${section.title}: ${response.content.slice(0, 100)}`,
      );
      throw new InternalServerErrorException(
        `API error while revising section "${section.title}": ${response.content}`,
      );
    }

    // 提取内容
    const rawContent = this.extractContent(response.content);
    const { markdown, charts } = this.parseChartOutput(rawContent);
    const content = markdown;

    // ★ 检查内容质量（长度检查）
    const minLength = Math.max(
      MIN_CONTENT_LENGTH,
      section.targetWords * MIN_CONTENT_LENGTH_RATIO,
    );
    if (content.length < minLength) {
      this.logger.error(
        `[reviseSection] Content too short for ${section.title}: ${content.length} chars < ${minLength} min`,
      );
      throw new InternalServerErrorException(
        `Revised content too short for section "${section.title}": got ${content.length} chars, expected at least ${minLength}`,
      );
    }

    // 统计字数和引用
    const wordCount = content.length;
    const referencesUsed = this.extractReferences(content);

    this.logger.log(
      `[reviseSection] Revised ${section.title}: ${wordCount} chars, ${referencesUsed.length} refs, ${latencyMs}ms`,
    );

    return {
      sectionId: section.id,
      title: section.title,
      content,
      wordCount,
      referencesUsed,
      generatedCharts: charts.generatedCharts,
      figureReferences: charts.figureReferences,
      actualModelId: response.model, // ★ 记录实际使用的模型
    };
  }

  /**
   * 批量并行写作多个章节
   *
   * ★ 增强：支持单个章节失败时的容错和自动重试
   * - 使用 Promise.allSettled 避免单个失败影响整体
   * - 对失败的章节自动使用备用模型重试
   * - 保持结果顺序与输入顺序一致
   *
   * @param inputs 多个章节写作输入
   * @returns 所有章节的写作结果（顺序与输入一致）
   */
  async writeSectionsParallel(
    inputs: SectionWriteInput[],
  ): Promise<SectionWriteResult[]> {
    this.logger.log(
      `[writeSectionsParallel] Writing ${inputs.length} sections in parallel`,
    );

    // 初始化结果数组，保持与输入相同的长度和顺序
    const results: (SectionWriteResult | null)[] = new Array(
      inputs.length,
    ).fill(null);
    const failedIndices: {
      index: number;
      input: SectionWriteInput;
      error: string;
    }[] = [];

    // 第一轮：并行执行所有章节
    const firstRoundResults = await Promise.allSettled(
      inputs.map((input) => this.writeSection(input)),
    );

    // 收集成功和失败的结果，保持索引位置
    for (let i = 0; i < firstRoundResults.length; i++) {
      const result = firstRoundResults[i];
      if (result.status === "fulfilled") {
        results[i] = result.value;
      } else {
        failedIndices.push({
          index: i,
          input: inputs[i],
          error: result.reason?.message || String(result.reason),
        });
        this.logger.warn(
          `[writeSectionsParallel] Section "${inputs[i].section.title}" failed: ${result.reason?.message}`,
        );
      }
    }

    // 如果有失败的章节，尝试用备用模型重试
    if (failedIndices.length > 0) {
      // 获取备用模型（使用 AI Engine 的智能选择，一次性获取）
      const fallbackModel = await this.chatFacade.selectModel({
        modelType: AIModelType.CHAT,
      });

      if (fallbackModel) {
        // 过滤掉原模型就是 fallbackModel 的情况，避免无意义重试
        const retryableItems = failedIndices.filter(
          ({ input }) => input.modelId !== fallbackModel.id,
        );
        const skipItems = failedIndices.filter(
          ({ input }) => input.modelId === fallbackModel.id,
        );

        // 记录跳过的项
        for (const { index, input, error } of skipItems) {
          this.logger.warn(
            `[writeSectionsParallel] Skipping retry for "${input.section.title}" - fallback model same as original`,
          );
          results[index] = this.createFailedResult(input, error);
        }

        if (retryableItems.length > 0) {
          this.logger.log(
            `[writeSectionsParallel] Retrying ${retryableItems.length} failed sections with ${fallbackModel.id}`,
          );

          const retryResults = await Promise.allSettled(
            retryableItems.map(({ input }) =>
              this.writeSection({
                ...input,
                modelId: fallbackModel.id,
              }),
            ),
          );

          // 处理重试结果，放回正确的索引位置
          for (let i = 0; i < retryResults.length; i++) {
            const result = retryResults[i];
            const { index, input, error: originalError } = retryableItems[i];

            if (result.status === "fulfilled") {
              this.logger.log(
                `[writeSectionsParallel] Section "${input.section.title}" succeeded on retry with ${fallbackModel.id}`,
              );
              results[index] = result.value;
            } else {
              this.logger.error(
                `[writeSectionsParallel] Section "${input.section.title}" failed even after retry: ${result.reason?.message}`,
              );
              results[index] = this.createFailedResult(input, originalError);
            }
          }
        }
      } else {
        // 没有可用的备用模型，记录所有失败
        this.logger.error(
          `[writeSectionsParallel] No fallback model available, ${failedIndices.length} sections failed`,
        );
        for (const { index, input, error } of failedIndices) {
          results[index] = this.createFailedResult(input, error);
        }
      }
    }

    // 确保所有位置都有结果（防御性编程）
    const finalResults = results.map(
      (r, i) => r ?? this.createFailedResult(inputs[i], "Unknown error"),
    );

    const successCount = finalResults.filter((r) => r.wordCount > 0).length;
    this.logger.log(
      `[writeSectionsParallel] Completed: ${successCount}/${inputs.length} sections successful`,
    );

    return finalResults;
  }

  /**
   * 创建失败结果占位对象
   */
  private createFailedResult(
    input: SectionWriteInput,
    error: string,
  ): SectionWriteResult {
    return {
      sectionId: input.section.id,
      title: input.section.title,
      content: `[内容生成失败] 原因: ${error}`,
      wordCount: 0,
      referencesUsed: [],
    };
  }

  /**
   * 提取内容（移除可能的 markdown 代码块包装）
   */
  private extractContent(response: string): string {
    // 移除 markdown 代码块包装
    let content = response.trim();

    // 移除 ```markdown 包装
    if (content.startsWith("```markdown")) {
      content = content.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
    }
    // 移除 ``` 包装
    else if (content.startsWith("```")) {
      content = content.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    return content.trim();
  }

  /**
   * 提取内容中的证据引用
   * ★ 更新为匹配数字格式 [1], [2], [3]
   */
  private extractReferences(content: string): string[] {
    const matches = content.match(/\[\d+\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }

  /**
   * 格式化 Agent 配置为指导文本
   * 将 Leader 的 agentConfig 拆分为：
   * - skillIds: 需要加载的 skill ID 列表（kebab-case，给 chatWithSkills 的 additionalSkills 用）
   * - leaderGuidance: Leader 指导文本（analysisGuidance + outputStyle + preferredDataSources）
   */
  private formatAgentGuidance(
    section: SectionPlan,
    assignedSkills?: string[],
  ): {
    leaderGuidance: string;
    skillIds: string[];
  } {
    const config = section.agentConfig;

    const parts: string[] = [];
    let skillIds: string[] = [];

    // 技能 ID 到文件 ID 的映射（下划线转换为连字符）
    const skillIdMapping: Record<string, string> = {
      trend_analysis: "trend-analysis",
      swot_analysis: "swot-analysis",
      competitive_analysis: "competitive-analysis",
      deep_dive: "deep-dive",
      data_interpretation: "data-interpretation",
      synthesis: "synthesis",
      critical_thinking: "critical-thinking",
      future_projection: "future-projection",
      cause_effect: "cause-effect",
      comparison: "comparison",
      dimension_research: "dimension-research",
      entity_extraction: "entity-extraction",
      fact_check: "fact-check",
      hypothesis_verification: "hypothesis-verification",
      report_editing: "report-editing",
      claim_extraction: "claim-extraction",
      fact_verification: "fact-verification",
      multi_path_reasoning: "multi-path-reasoning",
      multi_view_synthesizer: "multi-view-synthesizer",
      specialized_role_analysis: "specialized-role-analysis",
      content_critique: "content-critique",
      consistency_check: "consistency-check",
    };

    // 将 section-level skill IDs 映射为 kebab-case
    if (config?.skills && config.skills.length > 0) {
      skillIds = config.skills.map(
        (id: string) => skillIdMapping[id] || id.replace(/_/g, "-"),
      );
    }

    // ★ 合并 mission-level assignedSkills（Leader 分配的任务级技能）
    if (assignedSkills && assignedSkills.length > 0) {
      const mappedAssigned = assignedSkills.map(
        (id) => skillIdMapping[id] || id.replace(/_/g, "-"),
      );
      skillIds = [...new Set([...skillIds, ...mappedAssigned])];
    }

    if (!config) {
      return {
        leaderGuidance: assignedSkills?.length
          ? "请参考系统提示中的分析技能指导"
          : "无特殊指导",
        skillIds,
      };
    }

    // 分析指导
    if (config.analysisGuidance) {
      parts.push(`**Leader 指导**: ${config.analysisGuidance}`);
    }

    // 输出风格
    if (config.outputStyle) {
      const styleDescriptions: Record<string, string> = {
        analytical: "逻辑严谨、数据支撑、论证充分",
        narrative: "故事性强、易于理解、引人入胜",
        concise: "精炼要点、去除冗余、直击核心",
        detailed: "面面俱到、深入展开、不遗漏细节",
      };
      parts.push(
        `**输出风格**: ${styleDescriptions[config.outputStyle] || config.outputStyle}`,
      );
    }

    // 数据源偏好
    if (config.preferredDataSources && config.preferredDataSources.length > 0) {
      parts.push(`**优先数据源**: ${config.preferredDataSources.join("、")}`);
    }

    const leaderGuidance =
      parts.length > 0 ? parts.join("\n\n") : "请参考系统提示中的分析技能指导";

    return { leaderGuidance, skillIds };
  }

  /**
   * 解析混合输出（markdown + 图表 JSON）
   */
  private parseChartOutput(raw: string): {
    markdown: string;
    charts: {
      generatedCharts: GeneratedChart[];
      figureReferences: FigureReference[];
    };
  } {
    // ★ 支持多种 AI 输出变体：---CHARTS---、CHARTS---、---CHARTS 等
    // ★ 要求至少一侧有 dash（防止误匹配）
    const separatorPattern = /\n*(?:-+\s*CHARTS\s*-*|CHARTS\s*-+)\n*/i;
    const separatorMatch = raw.match(separatorPattern);

    // ★ 优先检测 ```json\n{"generatedCharts": ...}``` 格式（AI 有时用代码块包裹 JSON）
    // 必须在 inlineJsonPattern 之前检测，否则 inlineMatch.index 会指向 \n{ 而非 ``` 起点，
    // 导致 markdown 末尾残留未关闭的 ```json，使后续内容全部被渲染为代码块。
    const codeFenceJsonPattern =
      /\n(\s*```json\s*\n\s*\{[\s\S]*?"(?:generatedCharts|figureReferences)")/;
    const codeFenceMatch = !separatorMatch
      ? raw.match(codeFenceJsonPattern)
      : null;

    // 也检测直接嵌入的 {"generatedCharts": 或 { "generatedCharts": 模式
    const inlineJsonPattern =
      /\n\s*\{[\s\n]*"(?:generatedCharts|figureReferences)"/;
    const inlineMatch =
      !separatorMatch && !codeFenceMatch ? raw.match(inlineJsonPattern) : null;

    if (!separatorMatch && !codeFenceMatch && !inlineMatch) {
      return {
        markdown: raw,
        charts: { generatedCharts: [], figureReferences: [] },
      };
    }

    // splitIdx：分割点前的是正文 markdown，后的是 JSON 图表数据
    const splitIdx = separatorMatch
      ? separatorMatch.index!
      : codeFenceMatch
        ? codeFenceMatch.index! // 指向 \n```json 前的 \n，不含代码块
        : inlineMatch!.index!;
    const markdown = raw.substring(0, splitIdx).trim();
    const jsonPart = separatorMatch
      ? raw.substring(splitIdx + separatorMatch[0].length).trim()
      : raw.substring(splitIdx).trim(); // 保留 ```json 或 { 开头的部分，由 extractJsonBlock 处理
    try {
      const parsed = JSON.parse(this.extractJsonBlock(jsonPart));
      if (typeof parsed !== "object" || parsed === null) {
        this.logger.warn(
          "[parseChartOutput] Parsed chart data is not an object",
        );
        return {
          markdown,
          charts: { generatedCharts: [], figureReferences: [] },
        };
      }
      return {
        markdown,
        charts: {
          generatedCharts: this.normalizeGeneratedCharts(
            parsed.generatedCharts,
          ),
          figureReferences: this.normalizeFigureReferences(
            parsed.figureReferences,
          ),
        },
      };
    } catch {
      this.logger.warn("[parseChartOutput] Failed to parse chart JSON");
      return {
        markdown,
        charts: { generatedCharts: [], figureReferences: [] },
      };
    }
  }

  /**
   * 提取 JSON 块（移除可能的 ```json 包装）
   */
  private extractJsonBlock(text: string): string {
    let content = text.trim();
    if (content.startsWith("```json")) {
      content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (content.startsWith("```")) {
      content = content.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    return content.trim();
  }

  /**
   * 标准化图表引用列表
   */
  private normalizeFigureReferences(
    refs: FigureReference[] | undefined,
  ): FigureReference[] {
    if (!refs || !Array.isArray(refs)) {
      return [];
    }
    return refs.map((ref, idx) => ({
      id: ref.id || `fig-${idx}`,
      evidenceCitationIndex: ref.evidenceCitationIndex ?? 0,
      figureIndex: ref.figureIndex ?? 0,
      imageUrl: ref.imageUrl,
      caption: ref.caption || "",
      position: ref.position || `after_paragraph_${idx + 1}`,
      source: ref.source,
      relevance: ref.relevance,
    }));
  }

  /**
   * 标准化生成图表列表
   */
  private normalizeGeneratedCharts(
    charts: GeneratedChart[] | undefined,
  ): GeneratedChart[] {
    if (!charts || !Array.isArray(charts)) {
      return [];
    }
    return charts.map((chart, idx) => ({
      id: chart.id || `chart-${idx}`,
      type: this.validateChartType(chart.type),
      title: chart.title || `图表 ${idx + 1}`,
      position: chart.position || `after_paragraph_${idx + 1}`,
      data: Array.isArray(chart.data) ? chart.data : [],
      source: chart.source || "基于证据数据生成",
      reason: chart.reason,
    }));
  }

  /**
   * 验证图表类型是否在支持列表内
   */
  private validateChartType(type: string | undefined): GeneratedChart["type"] {
    const validTypes: GeneratedChart["type"][] = [
      "line",
      "bar",
      "pie",
      "area",
      "radar",
    ];
    if (type && validTypes.includes(type as GeneratedChart["type"])) {
      return type as GeneratedChart["type"];
    }
    return "bar";
  }

  /**
   * 格式化证据中的图片列表（用于图表生成提示）
   * ★ 如果有 Leader 预分配的图表，只展示分配的图表
   */
  private formatFiguresForSection(
    evidenceData: EvidenceData[],
    allocatedFigures?: import("../core/research-leader.service").AllocatedFigure[],
  ): string {
    // ★ 优先使用 Leader 预分配的图表
    if (allocatedFigures && allocatedFigures.length > 0) {
      const entries = allocatedFigures.map(
        (fig) =>
          `- 【已分配】证据[${fig.evidenceIndex}] 图${fig.figureIndex}: "${fig.caption}" (URL: ${fig.imageUrl})\n  分配原因: ${fig.relevanceReason}`,
      );
      return `Leader 已为本章节分配以下图表（请优先使用）：\n${entries.join("\n")}`;
    }

    // 退回到全量展示（兼容旧流程）
    const figureEntries: string[] = [];
    for (let i = 0; i < evidenceData.length; i++) {
      const evidence = evidenceData[i] as EvidenceData & {
        extractedFigures?: ExtractedFigure[];
      };
      if (evidence.extractedFigures && evidence.extractedFigures.length > 0) {
        for (let j = 0; j < evidence.extractedFigures.length; j++) {
          const fig = evidence.extractedFigures[j];
          figureEntries.push(
            `- 证据[${i + 1}] 图${j}: ${fig.type} - "${fig.caption || fig.alt || "无标题"}" (URL: ${fig.imageUrl})`,
          );
        }
      }
    }
    if (figureEntries.length === 0) {
      return "无可用图片资源";
    }
    return figureEntries.join("\n");
  }

  /**
   * 用 Leader 预分配的 allocatedFigures + evidenceData 补全 Writer 输出的 figureReferences
   *
   * LLM 输出 figureReferences 时经常省略 imageUrl，需要多级回填：
   * 1. 精确匹配 allocatedFigures (evidenceIndex:figureIndex)
   * 2. 从 evidenceData.extractedFigures 直接查找原始 URL
   * 3. 仍无 URL 的引用被过滤（无法渲染）
   */
  private backfillFigureUrls(
    figureRefs: FigureReference[],
    allocatedFigures?: import("../core/research-leader.service").AllocatedFigure[],
    evidenceData?: EvidenceData[],
  ): FigureReference[] {
    if (figureRefs.length === 0) {
      return figureRefs;
    }

    // Level 1: 构建 "evidenceIndex:figureIndex" -> allocatedFigure 映射
    const allocatedMap = new Map<
      string,
      import("../core/research-leader.service").AllocatedFigure
    >();
    if (allocatedFigures) {
      for (const fig of allocatedFigures) {
        allocatedMap.set(`${fig.evidenceIndex}:${fig.figureIndex}`, fig);
      }
    }

    // Level 2: 构建 "evidenceIndex:figureIndex" -> extractedFigure 映射（从原始证据）
    const evidenceFigureMap = new Map<string, ExtractedFigure>();
    if (evidenceData) {
      for (let i = 0; i < evidenceData.length; i++) {
        const ev = evidenceData[i] as EvidenceData & {
          extractedFigures?: ExtractedFigure[];
        };
        if (ev.extractedFigures) {
          for (let j = 0; j < ev.extractedFigures.length; j++) {
            evidenceFigureMap.set(`${i + 1}:${j}`, ev.extractedFigures[j]);
          }
        }
      }
    }

    let backfilled = 0;

    // 补全缺失的 imageUrl
    for (const ref of figureRefs) {
      const key = `${ref.evidenceCitationIndex}:${ref.figureIndex}`;

      // Level 1: 从 allocatedFigures 回填
      const allocated = allocatedMap.get(key);
      if (allocated) {
        if (!ref.imageUrl) {
          ref.imageUrl = allocated.imageUrl;
          backfilled++;
        }
        if (!ref.caption) {
          ref.caption = allocated.caption;
        }
      }

      // Level 2: 从原始 evidenceData.extractedFigures 回填（当 allocated 没匹配到时）
      if (!ref.imageUrl) {
        const extracted = evidenceFigureMap.get(key);
        if (extracted?.imageUrl) {
          ref.imageUrl = extracted.imageUrl;
          if (!ref.caption) {
            ref.caption = extracted.caption || extracted.alt || "";
          }
          backfilled++;
        }
      }

      // ★ Backfill generic Source text (e.g. "Source [N]") with descriptive evidence metadata
      if (
        evidenceData &&
        ref.evidenceCitationIndex &&
        (!ref.source ||
          /^Source\s*\[?\d+\]?$/i.test(ref.source) ||
          /^\[\d+\]$/.test(ref.source))
      ) {
        const evItem = evidenceData[ref.evidenceCitationIndex - 1];
        if (evItem) {
          const descriptive = `${evItem.title || evItem.domain || ""}`.trim();
          if (descriptive) {
            ref.source = descriptive;
          }
        }
      }

      // 清理 caption：去除原始网页标题格式（如 "Title | by Author | Platform"）
      if (ref.caption) {
        ref.caption = this.cleanFigureCaption(ref.caption);
      }
    }

    if (backfilled > 0) {
      this.logger.log(
        `[backfillFigureUrls] Backfilled ${backfilled}/${figureRefs.length} figure URLs`,
      );
    }

    // 过滤掉仍然没有 imageUrl 的引用（无法渲染）
    const result = figureRefs.filter((ref) => ref.imageUrl);
    if (result.length < figureRefs.length) {
      this.logger.warn(
        `[backfillFigureUrls] Dropped ${figureRefs.length - result.length} figure refs without imageUrl`,
      );
    }
    return result;
  }

  /**
   * 清理 figure caption：去除原始网页标题中的平台/作者信息
   *
   * 例如: "Understanding LLM Inference | by Saiii | Medium" → "Understanding LLM Inference"
   */
  private cleanFigureCaption(caption: string): string {
    // Remove "| by Author | Platform" suffixes (Medium, Substack, etc.)
    let cleaned = caption.replace(/\s*\|\s*by\s+[^|]+\|\s*\w+\s*$/i, "");
    // Remove trailing "| Platform" (e.g., "Title | Medium")
    cleaned = cleaned.replace(
      /\s*\|\s*(?:Medium|Substack|Dev\.to|Towards Data Science|HackerNoon|Analytics Vidhya)\s*$/i,
      "",
    );
    // Remove trailing "- Platform" (e.g., "Title - arXiv")
    cleaned = cleaned.replace(
      /\s*[-–—]\s*(?:arXiv|Medium|Substack|Wikipedia|YouTube|GitHub)\s*$/i,
      "",
    );
    return cleaned.trim();
  }

  /**
   * 获取当前日期字符串
   */
  private getCurrentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  }
}
