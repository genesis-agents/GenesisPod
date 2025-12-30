/**
 * Slides Engine v3.0 - Writer Service
 *
 * 作者角色：负责内容填充、文案润色
 * 使用 CHAT_FAST 模型 + COST_OPTIMIZED 策略
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ContentCompressionSkill,
  ContentCompressionInput,
} from "../skills/content-compression.skill";
import {
  PageOutline,
  PageContent,
  TaskDecomposition,
} from "../checkpoint/checkpoint.types";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";

/**
 * 内容填充输入
 */
export interface ContentFillInput {
  pageOutline: PageOutline;
  sourceText: string;
  taskDecomposition?: TaskDecomposition;
  sessionId?: string;
}

/**
 * 批量内容填充输入
 */
export interface BatchContentFillInput {
  pageOutlines: PageOutline[];
  sourceTexts: Map<number, string>;
  taskDecomposition?: TaskDecomposition;
  sessionId?: string;
}

/**
 * 内容润色输入
 */
export interface ContentPolishInput {
  pageContent: PageContent;
  style?: "formal" | "casual" | "technical";
  sessionId?: string;
}

/**
 * 内容润色系统提示词
 */
const CONTENT_POLISH_SYSTEM_PROMPT = `你是一位专业的文案润色专家，擅长优化 PPT 内容的表达。

## 润色原则

1. **简洁有力**：删除冗余词汇，保留核心信息
2. **专业准确**：使用准确的专业术语
3. **易于理解**：复杂概念简单化表达
4. **行动导向**：使用主动语态

## 输出要求

保持原有 JSON 结构，只优化文字内容，不改变结构。`;

@Injectable()
export class WriterService {
  private readonly logger = new Logger(WriterService.name);

  constructor(
    private readonly multiModel: MultiModelService,
    private readonly contentCompressionSkill: ContentCompressionSkill,
  ) {}

  /**
   * 填充单页内容
   */
  async fillContent(input: ContentFillInput): Promise<PageContent> {
    this.logger.log(
      `[fillContent] Filling content for page ${input.pageOutline.pageNumber}`,
    );

    const compressionInput: ContentCompressionInput = {
      pageOutline: input.pageOutline,
      sourceText: input.sourceText,
      maxCharacters: this.calculateMaxCharacters(input.pageOutline),
      sessionId: input.sessionId,
    };

    const result = await this.contentCompressionSkill.execute(compressionInput);
    return result.pageContent;
  }

  /**
   * 批量填充内容
   */
  async fillContentBatch(
    input: BatchContentFillInput,
  ): Promise<Map<number, PageContent>> {
    this.logger.log(
      `[fillContentBatch] Filling content for ${input.pageOutlines.length} pages`,
    );

    const compressionInputs: ContentCompressionInput[] = input.pageOutlines.map(
      (outline) => ({
        pageOutline: outline,
        sourceText: input.sourceTexts.get(outline.pageNumber) || "",
        maxCharacters: this.calculateMaxCharacters(outline),
        sessionId: input.sessionId,
      }),
    );

    const results =
      await this.contentCompressionSkill.executeBatch(compressionInputs);

    const contentMap = new Map<number, PageContent>();
    for (const [pageNumber, result] of results) {
      contentMap.set(pageNumber, result.pageContent);
    }

    return contentMap;
  }

  /**
   * 润色内容
   */
  async polishContent(input: ContentPolishInput): Promise<PageContent> {
    this.logger.log("[polishContent] Polishing content");

    const roleCall: RoleCallInput = {
      role: "writer",
      messages: [
        { role: "system", content: CONTENT_POLISH_SYSTEM_PROMPT },
        {
          role: "user",
          content: `## 原始内容

${JSON.stringify(input.pageContent, null, 2)}

## 风格要求

${input.style || "formal"}

## 请求

请润色以上内容，保持 JSON 结构不变，只优化文字表达。`,
        },
      ],
      maxTokens: 2048,
      temperature: 0.5,
      metadata: {
        sessionId: input.sessionId,
        phase: "content_polish",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.warn(
        "[polishContent] AI call failed, returning original content",
      );
      return input.pageContent;
    }

    return this.parsePolishedContent(result.content, input.pageContent);
  }

  /**
   * 提取页面相关的源文本
   */
  extractSourceTextForPage(
    pageOutline: PageOutline,
    fullSourceText: string,
    taskDecomposition?: TaskDecomposition,
  ): string {
    // 如果有 sourceRef，尝试提取对应章节
    if (pageOutline.sourceRef) {
      const chapter = taskDecomposition?.chapters.find(
        (ch) =>
          ch.id === pageOutline.sourceRef || ch.title === pageOutline.sourceRef,
      );

      if (chapter) {
        // 基于章节关键点提取相关内容
        const keywords = chapter.keyPoints.join("|");
        const regex = new RegExp(`[^。]*(?:${keywords})[^。]*。`, "g");
        const matches = fullSourceText.match(regex);

        if (matches && matches.length > 0) {
          return matches.join("\n\n");
        }
      }
    }

    // 基于页面标题和关键元素提取
    const searchTerms = [pageOutline.title, ...pageOutline.keyElements].filter(
      Boolean,
    );

    if (searchTerms.length > 0) {
      const keywordPattern = searchTerms.join("|");
      const regex = new RegExp(`[^。]*(?:${keywordPattern})[^。]*。`, "gi");
      const matches = fullSourceText.match(regex);

      if (matches && matches.length > 0) {
        return matches.slice(0, 10).join("\n\n"); // 最多取 10 段
      }
    }

    // 降级：返回源文本的一部分
    const pageRatio = 1 / 18; // 假设 18 页
    const startPos = Math.floor(
      (pageOutline.pageNumber - 1) * fullSourceText.length * pageRatio,
    );
    const endPos = Math.floor(
      pageOutline.pageNumber * fullSourceText.length * pageRatio,
    );

    return fullSourceText.slice(startPos, endPos);
  }

  /**
   * 计算最大字符数
   * v3.1: 大幅增加字符限制，确保每页内容充实
   */
  private calculateMaxCharacters(pageOutline: PageOutline): number {
    // 根据模板类型调整最大字符数
    // 封面页只需要标题+副标题，保持极简
    // 其他页面需要足够的内容填充 3-4 个卡片
    const templateLimits: Record<string, number> = {
      cover: 150, // 封面只需要标题+副标题，极简设计
      toc: 400, // 目录需要列出章节
      questions: 500, // 问题页需要多个问题和说明
      pillars: 600, // 支柱页需要多个要点和说明
      framework: 600, // 框架页需要详细说明
      timeline: 700, // 时间线需要多个时间节点+详情
      evolutionRoadmap: 700, // 演进路线图需要详细阶段说明
      dashboard: 700, // 数据仪表板需要多个数据点+说明
      comparison: 800, // 对比页需要两侧各多个要点
      splitLayout: 700, // 分栏布局需要两侧内容
      caseStudy: 800, // 案例研究需要详细背景和分析
      multiColumn: 700, // 多列布局需要多个独立内容块
      recommendations: 600, // 建议页需要多个可执行建议
      maturityModel: 700, // 成熟度模型需要多个级别说明
      riskOpportunity: 800, // 风险机会需要详细的双向分析
      bullet_points: 600, // 要点列表需要 4-6 个详细要点
      content: 600, // 内容页需要充实内容
    };

    return templateLimits[pageOutline.templateType] || 600;
  }

  /**
   * 解析润色后的内容
   */
  private parsePolishedContent(
    content: string,
    originalContent: PageContent,
  ): PageContent {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        title: String(parsed.title || originalContent.title),
        subtitle: parsed.subtitle
          ? String(parsed.subtitle)
          : originalContent.subtitle,
        sections: Array.isArray(parsed.sections)
          ? parsed.sections
          : originalContent.sections,
        footer: parsed.footer ? String(parsed.footer) : originalContent.footer,
        citations: Array.isArray(parsed.citations)
          ? parsed.citations.map(String)
          : originalContent.citations,
      };
    } catch {
      return originalContent;
    }
  }
}
