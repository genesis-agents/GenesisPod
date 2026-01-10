import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelType } from "@prisma/client";
import { TaskProfile } from "../../../ai-engine/llm/types";
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
 */
@Injectable()
export class ReportSynthesizerService {
  private readonly logger = new Logger(ReportSynthesizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

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

    // 获取 AI 模型
    const model = await this.getDefaultModel();

    // 生成报告内容
    const reportContent = await this.generateReportContent(
      query,
      sources,
      model,
      options?.language || "zh-CN",
      options?.style || "business",
      options?.isFollowUp,
      options?.previousContext,
      previousRefsCount,
    );

    const duration = (Date.now() - startTime) / 1000;

    return {
      executiveSummary: reportContent.executiveSummary,
      sections: reportContent.sections,
      conclusion: reportContent.conclusion,
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
    const model = await this.getDefaultModel();

    // 1. 生成执行摘要
    yield { section: "executive_summary", content: "" };
    const summary = await this.generateSection(
      "executive_summary",
      query,
      sources,
      model,
    );
    yield { section: "executive_summary", content: summary };

    // 2. 生成主要章节
    const sectionTopics = this.identifySectionTopics(query, sources);
    for (const topic of sectionTopics) {
      yield { section: topic, content: "" };
      const sectionContent = await this.generateSection(
        topic,
        query,
        sources,
        model,
      );
      yield { section: topic, content: sectionContent };
    }

    // 3. 生成结论
    yield { section: "conclusion", content: "" };
    const conclusion = await this.generateSection(
      "conclusion",
      query,
      sources,
      model,
    );
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

    return sources.slice(0, 30); // 最多使用 30 个来源
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
   * 获取默认 AI 模型
   */
  private async getDefaultModel() {
    let model = await this.prisma.aIModel.findFirst({
      where: {
        modelType: AIModelType.CHAT,
        isDefault: true,
        isEnabled: true,
      },
    });

    if (!model) {
      model = await this.prisma.aIModel.findFirst({
        where: {
          modelType: AIModelType.CHAT,
          isEnabled: true,
        },
      });
    }

    if (!model) {
      throw new Error("No AI model available for report generation");
    }

    return model;
  }

  /**
   * 生成报告内容
   */
  private async generateReportContent(
    query: string,
    sources: SearchSource[],
    model: any,
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
    const systemPrompt = this.buildReportSystemPrompt(
      language,
      style,
      isFollowUp,
      previousContext,
    );
    const userPrompt = this.buildReportUserPrompt(
      query,
      sources,
      isFollowUp,
      previousContext,
      previousRefsCount,
    );

    try {
      const result = await this.aiChatService.chat({
        provider: model.provider,
        model: model.modelId,
        apiKey: model.apiKey ?? "",
        apiEndpoint: model.apiEndpoint ?? undefined,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        taskProfile: {
          creativity: "medium",
          outputLength: "standard",
        } as TaskProfile,
        maxTokens: 4000, // Kept for backward compatibility
        temperature: 0.7, // Kept for backward compatibility
      });

      return this.parseReportResponse(result.content);
    } catch (error) {
      this.logger.error(`Failed to generate report content: ${error}`);
      return this.getDefaultReport(query, sources);
    }
  }

  /**
   * 生成单个章节
   */
  private async generateSection(
    sectionType: string,
    query: string,
    sources: SearchSource[],
    model: any,
  ): Promise<string> {
    const prompt = this.buildSectionPrompt(sectionType, query, sources);

    try {
      const result = await this.aiChatService.chat({
        provider: model.provider,
        model: model.modelId,
        apiKey: model.apiKey ?? "",
        apiEndpoint: model.apiEndpoint ?? undefined,
        messages: [{ role: "user", content: prompt }],
        taskProfile: {
          creativity: "medium",
          outputLength: "short",
        } as TaskProfile,
        maxTokens: 1500, // Kept for backward compatibility
        temperature: 0.7, // Kept for backward compatibility
      });

      return result.content;
    } catch (error) {
      this.logger.error(`Failed to generate section ${sectionType}: ${error}`);
      return `无法生成章节内容: ${sectionType}`;
    }
  }

  /**
   * 识别报告章节主题
   */
  private identifySectionTopics(
    _query: string,
    _sources: SearchSource[],
  ): string[] {
    // 基于查询和来源内容识别关键主题
    // 简化实现：使用固定结构
    // TODO: 可以基于 query 和 sources 动态识别主题
    return ["背景与概述", "关键发现", "深入分析", "比较与评估"];
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
    return `你是一个专业的研究报告撰写助手。请根据提供的搜索结果，撰写一份结构化的研究报告。

## 语言要求
${language === "zh-CN" ? "使用中文撰写" : "使用英文撰写"}

## 风格要求
${styleGuide[style as keyof typeof styleGuide] || styleGuide.business}

## 报告结构
1. 执行摘要：200-300字，概述主要发现和结论
2. 主体章节：每个章节包含标题、内容和引用
3. 结论：总结研究发现，提出建议

## 引用格式
- 在文中使用 [1]、[2] 等数字标记引用来源
- 引用必须基于提供的来源内容

## 输出格式
请以 JSON 格式输出：
\`\`\`json
{
  "executiveSummary": "执行摘要内容",
  "sections": [
    {
      "title": "章节标题",
      "content": "章节内容，包含[1][2]等引用标记",
      "citations": [1, 2]
    }
  ],
  "conclusion": "结论内容"
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

    const sourcesList = sources
      .slice(0, 20)
      .map(
        (s, i) =>
          `[${startIndex + i + 1}] ${s.title}\n来源: ${s.domain}\n内容: ${s.snippet}`,
      )
      .join("\n\n");

    if (isFollowUp && previousContext) {
      return `## 追问内容
${query}

## 新搜索结果来源
（引用编号从 [${startIndex + 1}] 开始）

${sourcesList}

请基于以上新来源，在原有研究报告的基础上进行扩展和深化分析。注意：
1. 执行摘要应该更新以反映新发现
2. 添加新的分析章节针对追问内容
3. 结论应该整合所有发现（原有 + 新增）`;
    }

    return `## 研究主题
${query}

## 搜索结果来源
${sourcesList}

请基于以上来源，撰写一份专业的研究报告。`;
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
      executive_summary: `请为"${query}"主题撰写一个200-300字的执行摘要，概述主要发现和关键结论。`,
      conclusion: `请为"${query}"主题撰写结论，总结研究发现并提出建议。`,
    };

    const defaultGuide = `请为"${query}"主题的"${sectionType}"章节撰写内容，包含[1][2]等引用标记。`;

    const guide = sectionGuides[sectionType] || defaultGuide;
    const topSources = sources
      .slice(0, 10)
      .map((s, i) => `[${i + 1}] ${s.snippet.slice(0, 150)}`)
      .join("\n");

    return `${guide}\n\n参考来源:\n${topSources}`;
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
