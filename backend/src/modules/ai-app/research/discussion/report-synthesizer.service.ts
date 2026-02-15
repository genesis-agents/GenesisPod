import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AIEngineFacade } from "../../../ai-engine/facade";
import { sanitizeMarkdownContent } from "../../../../common/utils/sanitize-content.utils";
import {
  SearchRound,
  SearchSource,
  DeepResearchReport,
  ReportSection,
  ReportReference,
  PreviousReportContext,
} from "./types";

/**
 * 报告合成服务
 * 将搜索结果合成为结构化研究报告
 *
 * ✅ 已迁移：使用 AIEngineFacade 统一入口
 */
@Injectable()
export class ReportSynthesizerService {
  private readonly logger = new Logger(ReportSynthesizerService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 生成完整研究报告
   */
  async generateReport(
    query: string,
    searchRounds: SearchRound[],
    options?: {
      language?: string;
      style?: "academic" | "business" | "casual";
      isFollowUp?: boolean;
      previousContext?: PreviousReportContext;
    },
  ): Promise<DeepResearchReport> {
    const startTime = Date.now();
    this.logger.debug(
      `Generating report for query: ${query.slice(0, 50)}... (follow-up: ${options?.isFollowUp})`,
    );

    // 准备来源和引用
    const sources = this.prepareSources(searchRounds);

    // 对于追问模式，合并之前的引用
    let allReferences: ReportReference[];
    let previousRefsCount = 0;
    if (options?.isFollowUp && options?.previousContext?.references) {
      previousRefsCount = options.previousContext.references.length;
      // 之前的引用保持原编号
      const previousRefs = options.previousContext.references.map(
        (ref, index) => ({
          id: index + 1,
          title: ref.title,
          url: ref.url,
          snippet: "",
          accessedAt: new Date(),
        }),
      );
      // 新引用从之前的编号继续
      const newRefs = this.buildReferences(sources).map((ref, index) => ({
        ...ref,
        id: previousRefsCount + index + 1,
      }));
      allReferences = [...previousRefs, ...newRefs];
    } else {
      allReferences = this.buildReferences(sources);
    }

    // 生成报告内容
    const reportContent = await this.generateReportContent(
      query,
      sources,
      options?.language || "zh-CN",
      options?.style || "business",
      options?.isFollowUp,
      options?.previousContext,
      previousRefsCount,
    );

    const duration = (Date.now() - startTime) / 1000;

    // ★ 清理 AI 生成内容中的格式问题（如引用后的孤立下划线）
    return {
      executiveSummary: sanitizeMarkdownContent(reportContent.executiveSummary),
      sections: reportContent.sections.map((section) => ({
        ...section,
        content: sanitizeMarkdownContent(section.content),
      })),
      conclusion: sanitizeMarkdownContent(reportContent.conclusion),
      references: allReferences,
      metadata: {
        totalSources: sources.length + previousRefsCount,
        totalTokens: 0, // TODO: Track token usage
        duration,
        searchRounds: searchRounds.length,
      },
    };
  }

  /**
   * 流式生成报告（用于 SSE）
   */
  async *generateReportStream(
    query: string,
    searchRounds: SearchRound[],
    _options?: {
      language?: string;
      style?: "academic" | "business" | "casual";
    },
  ): AsyncGenerator<{ section: string; content: string }> {
    const sources = this.prepareSources(searchRounds);

    // 1. 生成执行摘要
    yield { section: "executive_summary", content: "" };
    const summary = await this.generateSection(
      "executive_summary",
      query,
      sources,
    );
    yield { section: "executive_summary", content: summary };

    // 2. 生成主要章节
    const sectionTopics = await this.identifySectionTopics(query, sources);
    for (const topic of sectionTopics) {
      yield { section: topic, content: "" };
      const sectionContent = await this.generateSection(topic, query, sources);
      yield { section: topic, content: sectionContent };
    }

    // 3. 生成结论
    yield { section: "conclusion", content: "" };
    const conclusion = await this.generateSection("conclusion", query, sources);
    yield { section: "conclusion", content: conclusion };
  }

  /**
   * 准备和去重来源
   */
  private prepareSources(searchRounds: SearchRound[]): SearchSource[] {
    const urlSet = new Set<string>();
    const sources: SearchSource[] = [];

    for (const round of searchRounds) {
      for (const source of round.sources) {
        if (!urlSet.has(source.url)) {
          urlSet.add(source.url);
          sources.push(source);
        }
      }
    }

    // 按相关性排序
    sources.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return sources.slice(0, 40); // 最多使用 40 个来源
  }

  /**
   * 构建引用列表
   */
  private buildReferences(sources: SearchSource[]): ReportReference[] {
    return sources.map((source, index) => ({
      id: index + 1,
      title: source.title,
      url: source.url,
      snippet: source.snippet.slice(0, 200),
      accessedAt: new Date(),
    }));
  }

  /**
   * 生成报告内容（多步生成：每个部分独立 API 调用，确保充足的 token 预算）
   *
   * 原单次调用仅 8000 tokens，无法生成完整报告。
   * 改为分步生成：执行摘要 + 各章节 + 结论，每部分独立调用。
   */
  private async generateReportContent(
    query: string,
    sources: SearchSource[],
    language: string,
    style: string,
    isFollowUp?: boolean,
    previousContext?: PreviousReportContext,
    previousRefsCount?: number,
  ): Promise<{
    executiveSummary: string;
    sections: ReportSection[];
    conclusion: string;
  }> {
    // Follow-up mode still uses single-call (shorter reports)
    if (isFollowUp && previousContext) {
      return this.generateFollowUpReport(
        query,
        sources,
        language,
        style,
        previousContext,
        previousRefsCount,
      );
    }

    try {
      // Step 1: Identify section topics
      const sectionTopics = await this.identifySectionTopics(query, sources);
      this.logger.debug(`Report sections: ${sectionTopics.join(", ")}`);

      // Step 2: Build source context (shared across all calls)
      const startIndex = 0;
      const sourceContext = sources
        .slice(0, 30)
        .map(
          (s, i) =>
            `[${startIndex + i + 1}] **${s.title}**\n来源: ${s.domain}${s.publishedDate ? ` (${s.publishedDate})` : ""}\n内容: ${s.snippet}`,
        )
        .join("\n\n---\n\n");

      const langInstruction =
        language === "zh-CN" ? "使用中文撰写" : "使用英文撰写";

      // Step 3: Generate executive summary
      this.logger.debug("Generating executive summary...");
      const executiveSummary = await this.generatePart(
        `你是一位资深行业研究分析师。${langInstruction}。

请为"${query}"研究报告撰写一个 500-800 字的执行摘要。

要求：
- 开门见山陈述最重要的发现，不要写空泛的引言
- 必须包含关键数据点（具体数字、比例、增长率、市场规模等）
- 概述报告将覆盖的核心主题：${sectionTopics.join("、")}
- 明确指出研究揭示的 2-3 个最重要洞察
- 简述主要建议方向
- 使用 [N] 标记引用来源

## 参考来源
${sourceContext}`,
        "long",
      );

      // Step 4: Generate each section independently
      const sections: ReportSection[] = [];
      for (const topic of sectionTopics) {
        this.logger.debug(`Generating section: ${topic}`);
        const sectionContent = await this.generatePart(
          `你是一位资深行业研究分析师。${langInstruction}。

请为"${query}"研究报告的「${topic}」章节撰写 1000-2000 字的深度分析。

## 写作要求
1. **数据驱动**：必须引用来源中的具体数据、数字、案例，用 [N] 标记
2. **深度分析**：不要简单罗列信息，要分析原因、影响、趋势
3. **交叉引用**：对比不同来源的观点，指出共识和分歧
4. **结构清晰**：使用小标题组织内容，逻辑递进
5. **洞察提炼**：在事实陈述基础上提炼出独特洞察
6. **具体案例**：引用具体公司、产品、政策、数据作为论据

## 章节结构建议
- 引言段（简述本章节核心问题）
- 2-3 个小标题下的深入分析（每段 300-500 字）
- 小结段（本章节核心洞察）

## 参考来源
${sourceContext}`,
          "long",
        );

        // Extract citation numbers from content
        const citationMatches = sectionContent.match(/\[(\d+)\]/g) || [];
        const citations = [
          ...new Set(
            citationMatches.map((m: string) =>
              parseInt(m.replace(/[\[\]]/g, "")),
            ),
          ),
        ];

        sections.push({
          title: topic,
          content: sectionContent,
          citations,
        });
      }

      // Step 5: Generate conclusion
      this.logger.debug("Generating conclusion...");
      const sectionSummaries = sections
        .map((s) => `- ${s.title}: ${s.content.substring(0, 200)}...`)
        .join("\n");

      const conclusion = await this.generatePart(
        `你是一位资深行业研究分析师。${langInstruction}。

请为"${query}"研究报告撰写 400-600 字的结论与建议。

## 已完成章节摘要
${sectionSummaries}

## 要求
1. 综合所有章节发现，提炼 3-5 个核心洞察（不是重复章节内容）
2. 提出 4-5 条具体、可操作的建议（每条 2-3 句话，说明具体做什么、为什么）
3. 指出研究局限和未来需关注的 2-3 个方向
4. 使用 [N] 标记引用来源

## 参考来源
${sourceContext}`,
        "long",
      );

      return { executiveSummary, sections, conclusion };
    } catch (error) {
      this.logger.error(`Failed to generate report content: ${error}`);
      return this.getDefaultReport(query, sources);
    }
  }

  /**
   * Generate a single report part via independent API call
   */
  private async generatePart(
    prompt: string,
    outputLength: "medium" | "long" = "long",
  ): Promise<string> {
    const result = await this.aiFacade.chat({
      messages: [{ role: "user", content: prompt }],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength,
      },
    });
    return result.content;
  }

  /**
   * Follow-up report generation (single-call, shorter)
   */
  private async generateFollowUpReport(
    query: string,
    sources: SearchSource[],
    language: string,
    style: string,
    previousContext: PreviousReportContext,
    previousRefsCount?: number,
  ): Promise<{
    executiveSummary: string;
    sections: ReportSection[];
    conclusion: string;
  }> {
    const systemPrompt = this.buildReportSystemPrompt(
      language,
      style,
      true,
      previousContext,
    );
    const userPrompt = this.buildReportUserPrompt(
      query,
      sources,
      true,
      previousContext,
      previousRefsCount,
    );

    try {
      const result = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "medium",
          outputLength: "long",
        },
      });

      return this.parseReportResponse(result.content);
    } catch (error) {
      this.logger.error(`Failed to generate follow-up report: ${error}`);
      return this.getDefaultReport(query, sources);
    }
  }

  /**
   * 生成单个章节
   *
   * ★ P3 迁移：使用 AIEngineFacade 替代 AiChatService
   */
  private async generateSection(
    sectionType: string,
    query: string,
    sources: SearchSource[],
  ): Promise<string> {
    const prompt = this.buildSectionPrompt(sectionType, query, sources);

    try {
      // ★ 使用 AIEngineFacade 统一入口
      const result = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "medium",
          outputLength: "medium", // 章节需要充足篇幅进行深度分析
        },
      });

      return result.content;
    } catch (error) {
      this.logger.error(`Failed to generate section ${sectionType}: ${error}`);
      return `无法生成章节内容: ${sectionType}`;
    }
  }

  /**
   * 动态识别报告章节主题（基于查询和来源内容）
   */
  private async identifySectionTopics(
    query: string,
    sources: SearchSource[],
  ): Promise<string[]> {
    // Extract key themes from source titles and snippets
    const sourceContext = sources
      .slice(0, 15)
      .map((s) => `- ${s.title}: ${s.snippet.slice(0, 100)}`)
      .join("\n");

    try {
      const result = await this.aiFacade.chat({
        messages: [
          {
            role: "system",
            content: `你是一位研究报告架构师。根据研究主题和来源材料，设计 4-6 个最佳报告章节标题。
要求：
- 章节标题应该具体、有针对性，反映实际研究内容
- 不要使用通用标题如"背景与概述"、"关键发现"等
- 每个章节应覆盖研究主题的不同维度
- 章节间应有逻辑递进关系
- 只输出 JSON 数组，不要其他内容

示例输出：["全球电池技术发展现状", "固态电池核心技术突破", "主要企业研发布局对比", "商业化挑战与解决方案", "未来五年市场预测"]`,
          },
          {
            role: "user",
            content: `研究主题：${query}\n\n来源材料摘要：\n${sourceContext}`,
          },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "minimal",
        },
      });

      const topics = JSON.parse(
        result.content.replace(/```json\s*|\s*```/g, "").trim(),
      );
      if (Array.isArray(topics) && topics.length >= 3) {
        return topics.slice(0, 6);
      }
    } catch (error) {
      this.logger.warn(`Failed to identify dynamic topics: ${error}`);
    }

    // Fallback: derive topics from query
    return [
      `${query}的背景与现状`,
      `核心发现与关键数据`,
      `深度分析与多维评估`,
      `趋势展望与建议`,
    ];
  }

  /**
   * 构建报告系统提示词
   */
  private buildReportSystemPrompt(
    language: string,
    style: string,
    isFollowUp?: boolean,
    previousContext?: PreviousReportContext,
  ): string {
    const styleGuide = {
      academic: "使用学术论文的正式语言，注重数据和证据",
      business: "使用专业商务语言，注重洞察和可行性",
      casual: "使用易懂的语言，适合一般读者",
    };

    // 追问模式的特殊提示
    if (isFollowUp && previousContext) {
      return `你是一个专业的研究报告撰写助手。这是一个追问研究，你需要在已有研究报告的基础上进行扩展和深化。

## 已有研究报告

### 执行摘要
${previousContext.executiveSummary}

### 主要章节
${previousContext.sections.map((s) => `**${s.title}**\n${s.content}`).join("\n\n")}

### 结论
${previousContext.conclusion}

## 语言要求
${language === "zh-CN" ? "使用中文撰写" : "使用英文撰写"}

## 风格要求
${styleGuide[style as keyof typeof styleGuide] || styleGuide.business}

## 追问模式要求
1. **执行摘要**：更新摘要以包含新发现，保持300-400字
2. **新增章节**：针对追问内容添加新的分析章节
3. **结论**：更新结论以整合新旧发现

## 重要原则
- 不要重复已有研究中的信息，而是进行扩展和深化
- 明确标注新发现与原有结论的关系（支持、补充、或修正）
- 新引用从 [N+1] 开始编号（N 为已有引用数量）

## 引用格式
- 在文中使用 [1]、[2] 等数字标记引用来源
- 引用必须基于提供的来源内容

## 输出格式
请以 JSON 格式输出：
\`\`\`json
{
  "executiveSummary": "更新后的执行摘要（整合原有和新发现）",
  "sections": [
    {
      "title": "新章节标题（如：追问分析：XXX）",
      "content": "新增的分析内容，包含引用标记",
      "citations": [N+1, N+2]
    }
  ],
  "conclusion": "更新后的结论（整合所有发现）"
}
\`\`\``;
    }

    // 常规模式
    return `你是一位资深行业研究分析师，擅长撰写深度、专业、数据驱动的研究报告。你的报告以洞察深刻、论证严密、数据翔实著称。

## 语言要求
${language === "zh-CN" ? "使用中文撰写" : "使用英文撰写"}

## 风格要求
${styleGuide[style as keyof typeof styleGuide] || styleGuide.business}

## 报告质量标准

### 执行摘要（400-600字）
- 开门见山陈述核心发现，不要写空泛的引言
- 包含关键数据点和量化结论
- 明确指出研究揭示的最重要洞察
- 简述主要建议方向

### 主体章节（每章节 800-1500字）
- 每个章节必须包含：事实陈述 + 数据支撑 + 深度分析 + 洞察结论
- 引用具体数据、案例、趋势来支撑观点
- 对比不同来源的观点，指出共识和分歧
- 识别隐含模式、因果关系和潜在影响
- 避免笼统概述，要有具体的、可操作的分析

### 结论（300-500字）
- 综合所有章节发现，提炼核心洞察
- 提出具体、可操作的建议（3-5条）
- 指出研究局限和未来需关注的方向

## 写作原则
1. **数据优先**：每个论点必须有来源支撑，用 [N] 标记引用
2. **批判性思维**：不盲从来源，要交叉验证和批判分析
3. **深度优于广度**：宁可深入分析少数主题，也不要浮光掠影
4. **具体优于抽象**：用具体案例、数据、趋势替代空泛描述
5. **逻辑递进**：章节间有清晰的逻辑链条，不是松散的信息堆砌

## 引用格式
- 在文中使用 [1]、[2] 等数字标记引用来源
- 每个关键论断至少有一个引用支撑
- 引用必须基于提供的来源内容

## 输出格式
请以 JSON 格式输出：
\`\`\`json
{
  "executiveSummary": "执行摘要（400-600字，包含核心数据和关键洞察）",
  "sections": [
    {
      "title": "章节标题",
      "content": "章节内容（800-1500字），包含数据分析、案例对比、洞察结论，使用 [1][2] 引用标记",
      "citations": [1, 2, 3]
    }
  ],
  "conclusion": "结论与建议（300-500字，包含可操作建议）"
}
\`\`\``;
  }

  /**
   * 构建报告用户提示词
   */
  private buildReportUserPrompt(
    query: string,
    sources: SearchSource[],
    isFollowUp?: boolean,
    previousContext?: PreviousReportContext,
    previousRefsCount?: number,
  ): string {
    // 追问模式：引用编号从之前的数量继续
    const startIndex = isFollowUp && previousRefsCount ? previousRefsCount : 0;

    // Provide full snippet content for richer analysis
    const sourcesList = sources
      .slice(0, 25)
      .map(
        (s, i) =>
          `[${startIndex + i + 1}] **${s.title}**\n来源: ${s.domain} (相关度: ${(s.relevanceScore * 100).toFixed(0)}%)${s.publishedDate ? `\n日期: ${s.publishedDate}` : ""}\n内容: ${s.snippet}`,
      )
      .join("\n\n---\n\n");

    if (isFollowUp && previousContext) {
      return `## 追问内容
${query}

## 新搜索结果来源
（引用编号从 [${startIndex + 1}] 开始，共 ${Math.min(sources.length, 25)} 个来源）

${sourcesList}

请基于以上新来源，在原有研究报告的基础上进行扩展和深化分析。注意：
1. 执行摘要应该更新以反映新发现
2. 添加新的分析章节针对追问内容
3. 结论应该整合所有发现（原有 + 新增）`;
    }

    return `## 研究主题
${query}

## 搜索结果来源（共 ${Math.min(sources.length, 25)} 个高相关度来源）

${sourcesList}

## 写作要求
请基于以上来源撰写一份深度研究报告。要求：
1. 充分利用每个来源的信息，交叉引用和对比分析
2. 不要简单罗列信息，要提炼洞察、识别趋势、分析因果
3. 每个章节 800-1500 字，确保分析深度
4. 执行摘要 400-600 字，结论 300-500 字
5. 对来源中的数据、案例要具体引用，不要泛泛而谈`;
  }

  /**
   * 构建章节提示词
   */
  private buildSectionPrompt(
    sectionType: string,
    query: string,
    sources: SearchSource[],
  ): string {
    const sectionGuides: Record<string, string> = {
      executive_summary: `请为"${query}"主题撰写一个 400-600 字的执行摘要。
要求：
- 开门见山陈述最重要的发现，不要写空泛的引言
- 包含关键数据点（数字、比例、趋势）
- 概述各章节的核心洞察
- 使用 [N] 标记引用来源`,
      conclusion: `请为"${query}"主题撰写 300-500 字的结论与建议。
要求：
- 综合所有研究发现，提炼 3-5 个核心洞察
- 提出具体可操作的建议（不少于 3 条）
- 指出研究局限和未来需关注的方向
- 使用 [N] 标记引用来源`,
    };

    const defaultGuide = `请为"${query}"研究报告的「${sectionType}」章节撰写 800-1500 字的深度分析。
要求：
- 基于来源数据进行深入分析，不要简单罗列信息
- 包含具体数据、案例、对比分析
- 交叉引用多个来源，识别共识和分歧
- 提炼出该领域的关键洞察和隐含趋势
- 使用 [N] 标记引用来源`;

    const guide = sectionGuides[sectionType] || defaultGuide;
    const topSources = sources
      .slice(0, 15)
      .map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}`)
      .join("\n\n");

    return `${guide}\n\n## 参考来源\n\n${topSources}`;
  }

  /**
   * 解析报告响应
   */
  private parseReportResponse(response: string): {
    executiveSummary: string;
    sections: ReportSection[];
    conclusion: string;
  } {
    try {
      const jsonMatch =
        response.match(/```json\s*([\s\S]*?)\s*```/) ||
        response.match(/\{[\s\S]*"executiveSummary"[\s\S]*\}/);

      if (!jsonMatch) {
        // 如果没有 JSON，尝试直接解析为文本报告
        return {
          executiveSummary: response.slice(0, 500),
          sections: [
            {
              title: "研究发现",
              content: response,
              citations: [],
            },
          ],
          conclusion: "",
        };
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        executiveSummary: parsed.executiveSummary || "",
        sections: (parsed.sections || []).map((s: any) => ({
          title: s.title || "未命名章节",
          content: s.content || "",
          citations: s.citations || [],
        })),
        conclusion: parsed.conclusion || "",
      };
    } catch (error) {
      this.logger.error(`Failed to parse report response: ${error}`);
      return {
        executiveSummary: response.slice(0, 500),
        sections: [],
        conclusion: "",
      };
    }
  }

  /**
   * 获取默认报告
   */
  private getDefaultReport(
    query: string,
    sources: SearchSource[],
  ): {
    executiveSummary: string;
    sections: ReportSection[];
    conclusion: string;
  } {
    const topSnippets = sources
      .slice(0, 5)
      .map((s, i) => `[${i + 1}] ${s.snippet}`)
      .join("\n\n");

    return {
      executiveSummary: `关于"${query}"的研究已完成，共收集了 ${sources.length} 个信息来源。`,
      sections: [
        {
          title: "主要发现",
          content: topSnippets,
          citations: [1, 2, 3, 4, 5].slice(0, sources.length),
        },
      ],
      conclusion: "基于收集的信息，需要进一步分析以得出明确结论。",
    };
  }
}
