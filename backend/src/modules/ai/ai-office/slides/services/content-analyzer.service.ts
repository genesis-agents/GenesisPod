/**
 * Content Analyzer Service
 *
 * Phase 1: 内容分析层服务
 *
 * 职责:
 * 1. 分析用户输入内容的特征
 * 2. 分析URL内容并提取特征
 * 3. 使用AI识别数据点、时间序列、对比结构等
 * 4. 为大纲规划提供结构化输入
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../../core";
import {
  SlideContentFeatures,
  ContentAnalysisOptions,
  ContentAnalysisResult,
} from "../types/content-features.types";
import { CONTENT_ANALYSIS_PROMPT } from "../prompts/content-analyzer.prompt";

@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 分析内容特征
   */
  async analyzeContent(
    content: string,
    options: ContentAnalysisOptions = {},
  ): Promise<ContentAnalysisResult> {
    const startTime = Date.now();
    this.logger.log(
      `[analyzeContent] Starting analysis, content length: ${content.length}`,
    );

    const { language = "auto", detailLevel = "standard" } = options;

    // 快速模式：使用规则引擎
    if (detailLevel === "quick") {
      return this.quickAnalysis(content);
    }

    // 标准/深度模式：使用AI分析
    const features = await this.aiAnalyzeFeatures(content, language);

    // 提取关键实体
    const keyEntities = this.extractKeyEntities(content);

    // 提取数据点
    const dataPoints = this.extractDataPoints(content);

    // 识别时间范围
    const timeRange = this.extractTimeRange(content);

    // 识别对比维度
    const comparisonDimensions = features.hasComparison
      ? this.extractComparisonDimensions(content)
      : undefined;

    const processingTime = Date.now() - startTime;

    this.logger.log(
      `[analyzeContent] Analysis complete in ${processingTime}ms, complexity: ${features.complexity}, recommended slides: ${features.recommendedSlideRange.optimal}`,
    );

    return {
      features,
      keyEntities,
      dataPoints,
      timeRange,
      comparisonDimensions,
      metadata: {
        analyzedAt: new Date().toISOString(),
        contentLength: content.length,
        processingTime,
        modelUsed: "ai-analysis",
      },
    };
  }

  /**
   * AI分析内容特征
   */
  private async aiAnalyzeFeatures(
    content: string,
    language: string,
  ): Promise<SlideContentFeatures> {
    try {
      const textModel = await this.aiModelService.getDefaultTextModel();
      if (!textModel) {
        this.logger.warn(
          "[aiAnalyzeFeatures] No text model available, using fallback",
        );
        return this.ruleBasedAnalysis(content);
      }

      // 限制内容长度以避免超过token限制
      const truncatedContent =
        content.length > 3000 ? content.substring(0, 3000) + "..." : content;

      const prompt = CONTENT_ANALYSIS_PROMPT.replace(
        "{content}",
        truncatedContent,
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

      // 验证和规范化
      return this.validateFeatures(parsed);
    } catch (error) {
      this.logger.error(
        `[aiAnalyzeFeatures] Error: ${error instanceof Error ? error.message : String(error)}, using rule-based fallback`,
      );
      return this.ruleBasedAnalysis(content);
    }
  }

  /**
   * 快速分析（规则引擎）
   */
  private quickAnalysis(content: string): ContentAnalysisResult {
    const features = this.ruleBasedAnalysis(content);
    const dataPoints = this.extractDataPoints(content);
    const keyEntities = this.extractKeyEntities(content);

    return {
      features,
      keyEntities,
      dataPoints,
      metadata: {
        analyzedAt: new Date().toISOString(),
        contentLength: content.length,
        processingTime: 0,
        modelUsed: "rule-based",
      },
    };
  }

  /**
   * 基于规则的内容分析（Fallback）
   */
  private ruleBasedAnalysis(content: string): SlideContentFeatures {
    const length = content.length;
    const lines = content.split("\n");
    const dataPoints = this.extractDataPoints(content);

    // 检测数据密度
    const dataDensity: SlideContentFeatures["dataDensity"] =
      dataPoints.length > 10
        ? "high"
        : dataPoints.length > 3
          ? "medium"
          : "low";

    // 检测数据类型
    const hasNumbers = dataPoints.length > 0;
    const hasDescriptiveText = content.length > 200;
    const dataType: SlideContentFeatures["dataType"] =
      hasNumbers && hasDescriptiveText
        ? "mixed"
        : hasNumbers
          ? "quantitative"
          : hasDescriptiveText
            ? "qualitative"
            : "none";

    // 检测时间序列
    const hasTimeSeries = /\d{4}年|\d{4}-\d{2}|Q[1-4]|季度|年度|月份/i.test(
      content,
    );

    // 检测对比
    const hasComparison =
      /(vs|versus|对比|相比|比较|传统.*创新|before.*after)/i.test(content);
    const comparisonDimensions = hasComparison ? 2 : 0;

    // 检测结构类型
    const hasNumberedSteps = /步骤[1-9]|Step [1-9]|第[一二三四五]步/i.test(
      content,
    );
    const hasHierarchy = /战略.*策略|一级.*二级|chapter.*section/i.test(
      content,
    );
    const hasSections = lines.filter((l) => l.match(/^#{1,3}\s/)).length;

    let structureType: SlideContentFeatures["structureType"];
    if (hasComparison) {
      structureType = "contrasting";
    } else if (hasNumberedSteps) {
      structureType = "sequential";
    } else if (hasHierarchy) {
      structureType = "hierarchical";
    } else if (hasSections > 3) {
      structureType = "parallel";
    } else {
      structureType = "narrative";
    }

    // 元素数量
    const elementCount = Math.max(
      hasSections,
      lines.filter((l) => l.match(/^[•\-*]\s/)).length / 3,
      3,
    );

    // 检测流程
    const hasProcessFlow =
      hasNumberedSteps || /(流程|process|workflow|步骤)/i.test(content);

    // 检测层级
    const hasLevelsOrStages =
      hasHierarchy || /(阶段|stage|phase|level)/i.test(content);

    // 内容目的
    let contentPurpose: SlideContentFeatures["contentPurpose"];
    if (/(介绍|introduce|overview|about)/i.test(content)) {
      contentPurpose = "introduce";
    } else if (/(分析|analysis|research|study)/i.test(content)) {
      contentPurpose = "analyze";
    } else if (hasComparison) {
      contentPurpose = "compare";
    } else if (/(建议|recommend|should|propose)/i.test(content)) {
      contentPurpose = "recommend";
    } else if (/(总结|conclusion|summary)/i.test(content)) {
      contentPurpose = "conclude";
    } else if (/(展示|showcase|achievement|success)/i.test(content)) {
      contentPurpose = "showcase";
    } else if (/(警告|risk|warning|caution)/i.test(content)) {
      contentPurpose = "warn";
    } else {
      contentPurpose = "introduce";
    }

    // 论证类型
    const argumentType: SlideContentFeatures["argumentType"] =
      /(建议|行动|action|next steps)/i.test(content)
        ? "action"
        : dataPoints.length > 5
          ? "evidence"
          : /(因此|所以|综合|therefore|synthesis)/i.test(content)
            ? "synthesis"
            : "thesis";

    // 情感基调
    const emotionalTone: SlideContentFeatures["emotionalTone"] =
      /(紧急|urgent|critical|immediate)/i.test(content)
        ? "urgent"
        : /(风险|risk|warning|caution)/i.test(content)
          ? "cautionary"
          : /(成功|success|achievement|growth)/i.test(content)
            ? "positive"
            : "neutral";

    // 可视化需求
    const needsVisualization =
      dataDensity !== "low" || hasTimeSeries || hasComparison;

    let visualizationType: SlideContentFeatures["visualizationType"];
    if (!needsVisualization) {
      visualizationType = "none";
    } else if (hasTimeSeries) {
      visualizationType = "timeline";
    } else if (hasComparison && comparisonDimensions === 2) {
      visualizationType = "matrix";
    } else if (hasProcessFlow) {
      visualizationType = "diagram";
    } else if (dataDensity === "high") {
      visualizationType = "chart";
    } else {
      visualizationType = "iconGrid";
    }

    // 空间优先级
    const spacePriority: SlideContentFeatures["spacePriority"] =
      dataDensity === "high" || needsVisualization
        ? "visual"
        : length < 500
          ? "text"
          : "balanced";

    // 复杂度
    const complexity = Math.min(
      10,
      Math.max(
        1,
        Math.round(
          (elementCount / 5) * 3 +
            (dataDensity === "high" ? 3 : dataDensity === "medium" ? 2 : 1) +
            (hasProcessFlow ? 1 : 0) +
            (hasLevelsOrStages ? 1 : 0),
        ),
      ),
    );

    // 推荐页数
    const baseSlideCount =
      length < 1000 ? 10 : length < 3000 ? 18 : length < 5000 ? 25 : 30;
    const adjustedCount = Math.round(
      baseSlideCount * (1 + (complexity - 5) * 0.1) * (1 + elementCount * 0.05),
    );

    const optimal = Math.max(8, Math.min(40, adjustedCount));
    const min = Math.max(5, optimal - 4);
    const max = Math.min(45, optimal + 5);

    return {
      dataType,
      dataDensity,
      hasTimeSeries,
      hasComparison,
      comparisonDimensions,
      structureType,
      elementCount: Math.round(elementCount),
      hasProcessFlow,
      hasLevelsOrStages,
      contentPurpose,
      argumentType,
      emotionalTone,
      needsVisualization,
      visualizationType,
      spacePriority,
      confidence: 70,
      complexity,
      recommendedSlideRange: { min, max, optimal },
      summary: `检测到${structureType}结构，包含${Math.round(elementCount)}个核心要点，${dataDensity}数据密度，建议生成${optimal}页幻灯片。`,
    };
  }

  /**
   * 验证特征对象
   */
  private validateFeatures(parsed: any): SlideContentFeatures {
    return {
      dataType: this.validateEnum(
        parsed.dataType,
        ["quantitative", "qualitative", "mixed", "none"],
        "mixed",
      ),
      dataDensity: this.validateEnum(
        parsed.dataDensity,
        ["high", "medium", "low"],
        "medium",
      ),
      hasTimeSeries: Boolean(parsed.hasTimeSeries),
      hasComparison: Boolean(parsed.hasComparison),
      comparisonDimensions: Math.max(
        0,
        Number(parsed.comparisonDimensions) || 0,
      ),
      structureType: this.validateEnum(
        parsed.structureType,
        ["hierarchical", "parallel", "sequential", "contrasting", "narrative"],
        "narrative",
      ),
      elementCount: Math.max(1, Number(parsed.elementCount) || 3),
      hasProcessFlow: Boolean(parsed.hasProcessFlow),
      hasLevelsOrStages: Boolean(parsed.hasLevelsOrStages),
      contentPurpose: this.validateEnum(
        parsed.contentPurpose,
        [
          "introduce",
          "analyze",
          "compare",
          "conclude",
          "recommend",
          "warn",
          "showcase",
        ],
        "introduce",
      ),
      argumentType: this.validateEnum(
        parsed.argumentType,
        ["thesis", "evidence", "synthesis", "action"],
        "thesis",
      ),
      emotionalTone: this.validateEnum(
        parsed.emotionalTone,
        ["neutral", "positive", "cautionary", "urgent"],
        "neutral",
      ),
      needsVisualization: Boolean(parsed.needsVisualization),
      visualizationType: this.validateEnum(
        parsed.visualizationType,
        ["chart", "diagram", "iconGrid", "timeline", "matrix", "none"],
        "none",
      ),
      spacePriority: this.validateEnum(
        parsed.spacePriority,
        ["text", "visual", "balanced"],
        "balanced",
      ),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 75)),
      complexity: Math.max(1, Math.min(10, Number(parsed.complexity) || 5)),
      recommendedSlideRange: {
        min: Math.max(5, Number(parsed.recommendedSlideRange?.min) || 8),
        max: Math.min(45, Number(parsed.recommendedSlideRange?.max) || 25),
        optimal: Math.max(
          8,
          Math.min(40, Number(parsed.recommendedSlideRange?.optimal) || 15),
        ),
      },
      summary: String(parsed.summary || "内容分析完成"),
    };
  }

  /**
   * 验证枚举值
   */
  private validateEnum<T extends string>(
    value: any,
    allowedValues: T[],
    defaultValue: T,
  ): T {
    if (allowedValues.includes(value as T)) {
      return value as T;
    }
    return defaultValue;
  }

  /**
   * 提取关键实体
   */
  private extractKeyEntities(
    content: string,
  ): ContentAnalysisResult["keyEntities"] {
    const entities: ContentAnalysisResult["keyEntities"] = [];

    // 提取组织名称
    const orgMatches = content.matchAll(
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:\s(?:Inc|Corp|Ltd|公司|集团)))/g,
    );
    for (const match of orgMatches) {
      entities.push({
        type: "organization",
        value: match[1],
        context: this.extractContext(content, match.index || 0),
      });
    }

    // 提取统计数据
    const statMatches = content.matchAll(/(\d+%|\d+亿|\d+万|\$\d+[MBK]?)/g);
    for (const match of statMatches) {
      entities.push({
        type: "statistic",
        value: match[1],
        context: this.extractContext(content, match.index || 0),
      });
    }

    return entities.slice(0, 20); // 限制数量
  }

  /**
   * 提取数据点
   */
  private extractDataPoints(
    content: string,
  ): ContentAnalysisResult["dataPoints"] {
    const dataPoints: ContentAnalysisResult["dataPoints"] = [];

    // 百分比
    const percentages = content.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
    for (const match of percentages) {
      dataPoints.push({
        value: `${match[1]}%`,
        type: "percentage",
        context: this.extractContext(content, match.index || 0),
      });
    }

    // 货币
    const currencies = content.matchAll(
      /[$¥€£]\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?(亿|万|billion|million|thousand|k|K|M|B)?/gi,
    );
    for (const match of currencies) {
      dataPoints.push({
        value: match[0],
        type: "currency",
        context: this.extractContext(content, match.index || 0),
      });
    }

    // 日期
    const dates = content.matchAll(
      /(\d{4})[-/年]\s?(\d{1,2})[-/月]?\s?(\d{1,2})?[日]?/g,
    );
    for (const match of dates) {
      dataPoints.push({
        value: match[0],
        type: "date",
        context: this.extractContext(content, match.index || 0),
      });
    }

    // 大数字
    const numbers = content.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g);
    for (const match of numbers) {
      dataPoints.push({
        value: match[1],
        type: "number",
        context: this.extractContext(content, match.index || 0),
      });
    }

    return dataPoints;
  }

  /**
   * 提取时间范围
   */
  private extractTimeRange(
    content: string,
  ): ContentAnalysisResult["timeRange"] {
    const dates: string[] = [];
    const dateMatches = content.matchAll(/\d{4}年?/g);
    for (const match of dateMatches) {
      dates.push(match[0]);
    }

    if (dates.length === 0) {
      return undefined;
    }

    const years = dates.map((d) => parseInt(d.replace("年", "")));
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    return {
      start: minYear ? `${minYear}年` : undefined,
      end: maxYear && maxYear !== minYear ? `${maxYear}年` : undefined,
      mentions: dates.slice(0, 10),
    };
  }

  /**
   * 提取对比维度
   */
  private extractComparisonDimensions(
    content: string,
  ): ContentAnalysisResult["comparisonDimensions"] {
    const dimensions: ContentAnalysisResult["comparisonDimensions"] = [];

    // 检测 "A vs B" 模式
    const vsMatches = content.matchAll(
      /([^,.\n]+?)\s+(vs\.?|versus|对比|相比)\s+([^,.\n]+)/gi,
    );
    for (const match of vsMatches) {
      dimensions.push({
        dimension: "comparison",
        items: [match[1].trim(), match[3].trim()],
      });
    }

    // 检测 "传统 vs 创新" 等模式
    const contrastMatches = content.matchAll(
      /(传统|旧|before|old)\s*[与和]\s*(创新|新|after|new)/gi,
    );
    for (const match of contrastMatches) {
      dimensions.push({
        dimension: "contrast",
        items: [match[1], match[2]],
      });
    }

    return dimensions.length > 0 ? dimensions : undefined;
  }

  /**
   * 提取上下文
   */
  private extractContext(text: string, position: number): string {
    const start = Math.max(0, position - 40);
    const end = Math.min(text.length, position + 60);
    let context = text.substring(start, end).trim();

    if (start > 0) context = "..." + context;
    if (end < text.length) context = context + "...";

    return context;
  }

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
              maxOutputTokens: 2000,
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
            max_tokens: 2000,
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
   * 解析JSON响应
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
}
