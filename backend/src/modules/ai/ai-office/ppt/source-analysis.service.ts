/**
 * Source Analysis Service
 *
 * 素材分析服务
 *
 * 职责：
 * 1. 分析用户上传的原始文档/报告
 * 2. 提取结构化信息（章节、数据点、洞察、引用等）
 * 3. 生成AI摘要和关键洞察
 * 4. 为PPT生成提供高质量的素材支撑
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../core";
import { randomUUID } from "crypto";

// ============================================
// 接口定义
// ============================================

export interface SourceAnalysis {
  id: string;
  chapters: ChapterInfo[];
  keyInsights: Insight[];
  dataPoints: DataPoint[];
  quotes: Quote[];
  recommendations: string[];
}

export interface ChapterInfo {
  id: string;
  title: string;
  level: number; // 章节层级 (1 = #, 2 = ##, 3 = ### 等)
  content: string; // 原始内容
  summary: string; // AI 摘要
  keyPoints: string[]; // 关键要点
  dataPoints: DataPoint[]; // 本章数据点
}

export interface DataPoint {
  id: string;
  value: string; // "85%", "$150亿", "2025年"
  type: "percentage" | "currency" | "number" | "date" | "other";
  context: string; // 上下文描述
  chapterId?: string; // 所属章节
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  importance: "high" | "medium" | "low";
  relatedDataPoints: string[]; // 关联的数据点ID
}

export interface Quote {
  id: string;
  text: string;
  author?: string;
  source?: string;
  chapterId?: string;
}

export interface AnalysisOptions {
  language?: "zh" | "en" | "auto";
  extractChapters?: boolean;
  extractDataPoints?: boolean;
  generateInsights?: boolean;
  extractQuotes?: boolean;
}

// ============================================
// AI 提示词
// ============================================

const CHAPTER_SUMMARY_PROMPT = `You are an expert content analyst. Analyze this chapter and extract key information.

## Chapter Content
{content}

## Your Task
1. Generate a concise 2-3 sentence summary
2. Extract 3-5 key points (each 10-15 words)
3. Identify the main theme

## Output Format (JSON)
{
  "summary": "Concise summary of the chapter",
  "keyPoints": [
    "Key point 1 with specific detail",
    "Key point 2 with specific detail",
    "Key point 3 with specific detail"
  ],
  "theme": "Main theme or topic"
}

Language: {language}
Output valid JSON only.`;

const INSIGHTS_GENERATION_PROMPT = `You are a strategic analyst. Review the following document structure and generate high-level insights.

## Document Structure
{structure}

## Your Task
Generate 3-5 strategic insights that:
1. Connect multiple chapters or themes
2. Highlight critical patterns or trends
3. Provide actionable takeaways
4. Reference specific data points when available

## Output Format (JSON)
{
  "insights": [
    {
      "title": "Insight headline (8-12 words)",
      "description": "Detailed explanation with evidence (2-3 sentences)",
      "importance": "high|medium|low",
      "relatedDataPoints": ["dataPointId1", "dataPointId2"]
    }
  ]
}

Language: {language}
Output valid JSON only.`;

const RECOMMENDATIONS_PROMPT = `Based on the document analysis, generate strategic recommendations.

## Document Summary
{summary}

## Key Findings
{findings}

## Your Task
Generate 3-5 actionable recommendations that:
1. Build on the key insights
2. Are specific and measurable
3. Address identified gaps or opportunities
4. Are prioritized by impact

## Output Format (JSON)
{
  "recommendations": [
    "Specific, actionable recommendation 1",
    "Specific, actionable recommendation 2",
    "Specific, actionable recommendation 3"
  ]
}

Language: {language}
Output valid JSON only.`;

// ============================================
// 服务实现
// ============================================

@Injectable()
export class SourceAnalysisService {
  private readonly logger = new Logger(SourceAnalysisService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 分析源文档内容
   */
  async analyzeSource(
    content: string,
    options: AnalysisOptions = {},
  ): Promise<SourceAnalysis> {
    const startTime = Date.now();
    this.logger.log(
      `[analyzeSource] Starting analysis, content length: ${content.length}`,
    );

    const {
      language = "auto",
      extractChapters = true,
      extractDataPoints = true,
      generateInsights = true,
      extractQuotes = true,
    } = options;

    // 1. 提取章节结构
    let chapters: ChapterInfo[] = [];
    if (extractChapters) {
      chapters = await this.extractChapters(content, language);
      this.logger.log(`[analyzeSource] Extracted ${chapters.length} chapters`);
    }

    // 2. 提取数据点
    let dataPoints: DataPoint[] = [];
    if (extractDataPoints) {
      dataPoints = this.extractDataPoints(content);
      // 关联数据点到章节
      this.associateDataPointsToChapters(dataPoints, chapters);
      this.logger.log(
        `[analyzeSource] Extracted ${dataPoints.length} data points`,
      );
    }

    // 3. 提取引用
    let quotes: Quote[] = [];
    if (extractQuotes) {
      quotes = this.extractQuotes(content);
      this.logger.log(`[analyzeSource] Extracted ${quotes.length} quotes`);
    }

    // 4. 生成核心洞察
    let insights: Insight[] = [];
    if (generateInsights && chapters.length > 0) {
      insights = await this.generateInsights(chapters, dataPoints, language);
      this.logger.log(`[analyzeSource] Generated ${insights.length} insights`);
    }

    // 5. 生成建议
    const recommendations: string[] = [];
    if (generateInsights && insights.length > 0) {
      const recs = await this.generateRecommendations(
        chapters,
        insights,
        language,
      );
      recommendations.push(...recs);
      this.logger.log(
        `[analyzeSource] Generated ${recommendations.length} recommendations`,
      );
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`[analyzeSource] Analysis completed in ${elapsed}ms`);

    return {
      id: randomUUID(),
      chapters,
      keyInsights: insights,
      dataPoints,
      quotes,
      recommendations,
    };
  }

  /**
   * 提取章节结构（基于 Markdown 标题）
   */
  async extractChapters(
    content: string,
    language: string,
  ): Promise<ChapterInfo[]> {
    this.logger.log("[extractChapters] Extracting chapter structure");

    // 按行分割内容
    const lines = content.split("\n");
    const chapters: ChapterInfo[] = [];
    let currentChapter: Partial<ChapterInfo> | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      // 检测 Markdown 标题: # ## ### 等
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // 保存前一个章节
        if (currentChapter) {
          currentChapter.content = currentContent.join("\n").trim();
          if (currentChapter.content.length > 0) {
            // 调用 AI 生成摘要和要点
            const summary = await this.generateChapterSummary(
              currentChapter.title!,
              currentChapter.content,
              language,
            );
            currentChapter.summary = summary.summary;
            currentChapter.keyPoints = summary.keyPoints;
            chapters.push(currentChapter as ChapterInfo);
          }
        }

        // 开始新章节
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        currentChapter = {
          id: randomUUID(),
          title,
          level,
          content: "",
          summary: "",
          keyPoints: [],
          dataPoints: [],
        };
        currentContent = [];
      } else if (currentChapter) {
        // 累积当前章节的内容
        currentContent.push(line);
      }
    }

    // 保存最后一个章节
    if (currentChapter) {
      currentChapter.content = currentContent.join("\n").trim();
      if (currentChapter.content.length > 0) {
        const summary = await this.generateChapterSummary(
          currentChapter.title!,
          currentChapter.content,
          language,
        );
        currentChapter.summary = summary.summary;
        currentChapter.keyPoints = summary.keyPoints;
        chapters.push(currentChapter as ChapterInfo);
      }
    }

    // 如果没有检测到标题，将整个文档作为单个章节
    if (chapters.length === 0 && content.trim().length > 0) {
      const summary = await this.generateChapterSummary(
        "Content",
        content,
        language,
      );
      chapters.push({
        id: randomUUID(),
        title: "Document Content",
        level: 1,
        content: content.trim(),
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        dataPoints: [],
      });
    }

    return chapters;
  }

  /**
   * 生成章节摘要（调用 AI）
   */
  private async generateChapterSummary(
    title: string,
    content: string,
    language: string,
  ): Promise<{ summary: string; keyPoints: string[] }> {
    try {
      const textModel = await this.aiModelService.getDefaultTextModel();
      if (!textModel) {
        this.logger.warn("[generateChapterSummary] No text model available");
        return { summary: "", keyPoints: [] };
      }

      // 限制内容长度（避免超过 token 限制）
      const truncatedContent =
        content.length > 2000 ? content.substring(0, 2000) + "..." : content;

      const prompt = CHAPTER_SUMMARY_PROMPT.replace(
        "{content}",
        truncatedContent,
      )
        .replace("{title}", title)
        .replace("{language}", language === "zh" ? "Chinese" : "English");

      const response = await this.callTextModel(
        {
          apiEndpoint: textModel.apiEndpoint || "",
          apiKey: textModel.apiKey || "",
          modelId: textModel.modelId,
          provider: textModel.provider,
        },
        prompt,
      );

      const parsed = this.parseJsonResponse(response);
      return {
        summary: parsed.summary || "",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      };
    } catch (error) {
      this.logger.error(
        `[generateChapterSummary] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { summary: "", keyPoints: [] };
    }
  }

  /**
   * 提取数据点（数字、百分比、金额、日期等）
   */
  extractDataPoints(content: string): DataPoint[] {
    this.logger.log("[extractDataPoints] Extracting data points");

    const dataPoints: DataPoint[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // 提取百分比: 85%, 12.5%
      const percentages = line.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
      for (const match of percentages) {
        dataPoints.push({
          id: randomUUID(),
          value: `${match[1]}%`,
          type: "percentage",
          context: this.extractContext(line, match.index || 0),
        });
      }

      // 提取金额: $150亿, ¥1000万, €500 million
      const currencies = line.matchAll(
        /[$¥€£]\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?(亿|万|billion|million|thousand|k|K|M|B)?/gi,
      );
      for (const match of currencies) {
        // match[2] contains unit (亿/万/billion/million etc.) but not used directly
        dataPoints.push({
          id: randomUUID(),
          value: `${match[0]}`,
          type: "currency",
          context: this.extractContext(line, match.index || 0),
        });
      }

      // 提取大数字: 1,000, 50,000,000
      const numbers = line.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g);
      for (const match of numbers) {
        // 避免重复提取已识别为金额的数字
        const alreadyExtracted = dataPoints.some(
          (dp) => dp.type === "currency" && dp.value.includes(match[1]),
        );
        if (!alreadyExtracted) {
          dataPoints.push({
            id: randomUUID(),
            value: match[1],
            type: "number",
            context: this.extractContext(line, match.index || 0),
          });
        }
      }

      // 提取日期: 2025年3月, 2025-03-15, 03/15/2025
      const dates = line.matchAll(
        /(\d{4})[-/年]\s?(\d{1,2})[-/月]?\s?(\d{1,2})?[日]?/g,
      );
      for (const match of dates) {
        dataPoints.push({
          id: randomUUID(),
          value: match[0],
          type: "date",
          context: this.extractContext(line, match.index || 0),
        });
      }
    }

    this.logger.log(
      `[extractDataPoints] Found ${dataPoints.length} data points`,
    );
    return dataPoints;
  }

  /**
   * 提取上下文（数据点周围的文本）
   */
  private extractContext(line: string, position: number): string {
    const start = Math.max(0, position - 30);
    const end = Math.min(line.length, position + 50);
    let context = line.substring(start, end).trim();

    // 清理上下文
    if (start > 0) context = "..." + context;
    if (end < line.length) context = context + "...";

    return context;
  }

  /**
   * 将数据点关联到章节
   */
  private associateDataPointsToChapters(
    dataPoints: DataPoint[],
    chapters: ChapterInfo[],
  ): void {
    for (const dp of dataPoints) {
      // 在章节内容中查找数据点
      for (const chapter of chapters) {
        if (chapter.content.includes(dp.value)) {
          dp.chapterId = chapter.id;
          chapter.dataPoints.push(dp);
          break;
        }
      }
    }
  }

  /**
   * 提取引用
   */
  extractQuotes(content: string): Quote[] {
    this.logger.log("[extractQuotes] Extracting quotes");

    const quotes: Quote[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // 检测引用格式: "Quote text" - Author
      const quoteMatch = line.match(/["""](.+?)["""]\s*[-–—]\s*(.+)/);
      if (quoteMatch) {
        quotes.push({
          id: randomUUID(),
          text: quoteMatch[1].trim(),
          author: quoteMatch[2].trim(),
        });
      }

      // 检测 Markdown 引用: > Quote text
      if (line.trim().startsWith(">")) {
        const text = line.trim().substring(1).trim();
        if (text.length > 0) {
          quotes.push({
            id: randomUUID(),
            text,
          });
        }
      }
    }

    this.logger.log(`[extractQuotes] Found ${quotes.length} quotes`);
    return quotes;
  }

  /**
   * 生成核心洞察（调用 AI）
   * @param chapters 章节信息
   * @param dataPoints 数据点（可用于增强AI分析）
   * @param language 语言
   */
  async generateInsights(
    chapters: ChapterInfo[],
    dataPoints: DataPoint[],
    language: string,
  ): Promise<Insight[]> {
    // dataPoints reserved for future AI enhancement
    void dataPoints;
    try {
      const textModel = await this.aiModelService.getDefaultTextModel();
      if (!textModel) {
        this.logger.warn("[generateInsights] No text model available");
        return [];
      }

      // 构建文档结构摘要
      const structure = chapters
        .map(
          (ch, idx) =>
            `Chapter ${idx + 1}: ${ch.title}\nSummary: ${ch.summary}\nKey Points: ${ch.keyPoints.join("; ")}`,
        )
        .join("\n\n");

      const prompt = INSIGHTS_GENERATION_PROMPT.replace(
        "{structure}",
        structure,
      ).replace("{language}", language === "zh" ? "Chinese" : "English");

      const response = await this.callTextModel(
        {
          apiEndpoint: textModel.apiEndpoint || "",
          apiKey: textModel.apiKey || "",
          modelId: textModel.modelId,
          provider: textModel.provider,
        },
        prompt,
      );

      const parsed = this.parseJsonResponse(response);
      const insights: Insight[] = [];

      if (Array.isArray(parsed.insights)) {
        for (const insight of parsed.insights) {
          insights.push({
            id: randomUUID(),
            title: insight.title || "",
            description: insight.description || "",
            importance: this.validateImportance(insight.importance),
            relatedDataPoints: Array.isArray(insight.relatedDataPoints)
              ? insight.relatedDataPoints
              : [],
          });
        }
      }

      return insights;
    } catch (error) {
      this.logger.error(
        `[generateInsights] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 生成建议（调用 AI）
   */
  private async generateRecommendations(
    chapters: ChapterInfo[],
    insights: Insight[],
    language: string,
  ): Promise<string[]> {
    try {
      const textModel = await this.aiModelService.getDefaultTextModel();
      if (!textModel) {
        this.logger.warn("[generateRecommendations] No text model available");
        return [];
      }

      const summary = chapters
        .map((ch) => `${ch.title}: ${ch.summary}`)
        .join("\n");
      const findings = insights
        .map((ins) => `- ${ins.title}: ${ins.description}`)
        .join("\n");

      const prompt = RECOMMENDATIONS_PROMPT.replace("{summary}", summary)
        .replace("{findings}", findings)
        .replace("{language}", language === "zh" ? "Chinese" : "English");

      const response = await this.callTextModel(
        {
          apiEndpoint: textModel.apiEndpoint || "",
          apiKey: textModel.apiKey || "",
          modelId: textModel.modelId,
          provider: textModel.provider,
        },
        prompt,
      );

      const parsed = this.parseJsonResponse(response);
      return Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [];
    } catch (error) {
      this.logger.error(
        `[generateRecommendations] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  // ============================================
  // 私有辅助方法
  // ============================================

  /**
   * 调用文本模型
   */
  private async callTextModel(
    model: {
      apiEndpoint: string;
      apiKey: string;
      modelId: string;
      provider: string;
    },
    prompt: string,
  ): Promise<string> {
    const isGemini =
      model.provider?.toLowerCase().includes("google") ||
      model.modelId?.toLowerCase().includes("gemini");

    if (isGemini) {
      return await this.callGeminiAPI(model, prompt);
    } else {
      return await this.callOpenAICompatibleAPI(model, prompt);
    }
  }

  private async callGeminiAPI(
    model: { apiKey: string; modelId: string },
    prompt: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.modelId}:generateContent?key=${model.apiKey}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 3000,
            },
          },
          { headers: { "Content-Type": "application/json" }, timeout: 60000 },
        ),
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error: any) {
      this.logger.error(
        `[callGeminiAPI] Error: ${error.message}`,
        error.response?.data || error.stack,
      );
      throw new Error(
        `Gemini API error: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  private async callOpenAICompatibleAPI(
    model: { apiEndpoint: string; apiKey: string; modelId: string },
    prompt: string,
  ): Promise<string> {
    let url = model.apiEndpoint || "https://api.openai.com/v1/chat/completions";

    if (!url.endsWith("/chat/completions")) {
      url = url.replace(/\/$/, "") + "/chat/completions";
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model: model.modelId,
            messages: [
              {
                role: "system",
                content:
                  "You are a professional content analyst. Always respond with valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 3000,
          },
          {
            headers: {
              Authorization: `Bearer ${model.apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 60000,
          },
        ),
      );

      return response.data?.choices?.[0]?.message?.content || "";
    } catch (error: any) {
      this.logger.error(
        `[callOpenAICompatibleAPI] Error: ${error.message}`,
        error.response?.data || error.stack,
      );
      throw new Error(
        `OpenAI API error: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * 解析 JSON 响应（处理 Markdown 代码块）
   */
  private parseJsonResponse(response: string): any {
    try {
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
      }
      return JSON.parse(cleaned);
    } catch (error) {
      this.logger.warn(
        `[parseJsonResponse] Parse error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  /**
   * 验证重要性等级
   */
  private validateImportance(
    importance: string | undefined,
  ): "high" | "medium" | "low" {
    if (!importance) return "medium";
    const valid = ["high", "medium", "low"];
    return valid.includes(importance) ? (importance as any) : "medium";
  }
}
