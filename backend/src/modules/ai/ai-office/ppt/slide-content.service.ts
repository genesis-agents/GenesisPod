/**
 * Slide Content Generation Service
 *
 * 幻灯片内容生成服务
 *
 * 职责：
 * 1. 根据规格生成幻灯片详细内容
 * 2. 生成演讲者备注
 * 3. 提取和格式化数据
 * 4. 🆕 素材绑定约束和验证
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../core";
import {
  SlideSpec,
  GeneratedSlideContent,
  ContentValidation,
  SlideDataPoint,
} from "./ppt.types";

// ============================================
// 内容生成提示词
// ============================================

const CONTENT_GENERATION_PROMPT = `You are a WORLD-CLASS presentation content writer, like those who write for TED Talks, Apple Keynotes, and Fortune 500 companies. Your presentations are known for being ENGAGING, INSIGHTFUL, and MEMORABLE.

## Your Content Philosophy (Reference: Gamma.app, Genspark quality)
1. **Rich & Valuable**: Every slide provides REAL VALUE, not just headers
2. **Storytelling**: Content flows naturally, tells a story
3. **Specific & Concrete**: Use real data, examples, and details - NO generic filler
4. **Visually Structured**: Content is organized for visual impact
5. **Memorable**: Each slide has a takeaway worth remembering

## Slide Specification
- Title: {title}
- Purpose: {purpose}
- Layout: {layout}
- Content Outline: {outline}

## Source Material (for reference)
{sourceContent}

## CRITICAL CONTENT REQUIREMENTS (Like Gamma/Genspark)

### For Title Slides:
- Compelling headline that hooks the audience
- Subtitle that creates intrigue or states the value proposition

### For Content Slides:
1. **Bullet Points**: 4-6 substantive points, each 15-25 words
   - Each point should be a COMPLETE INSIGHT, not just a label
   - Include specific examples, numbers, or facts when relevant
   - Bad: "Benefits of AI"
   - Good: "AI automation reduces manual processing time by 60%, freeing teams to focus on strategic decisions"

2. **Body Text** (when appropriate): 2-3 sentences providing context
   - Should add value, not repeat bullets
   - Include relevant statistics or examples

3. **Highlight Text**: The ONE thing audience should remember from this slide

### For Statistics Slides:
- Include 3-4 statistics with:
  - Specific numbers (not ranges like "20-30%")
  - Context/comparison ("up 40% from last year")
  - Trend indicators

### For Quote Slides:
- Powerful, memorable quote
- Author with credentials
- Source for credibility

### For Comparison Slides:
- Clear structure: Left vs Right
- 4-5 comparison points for each side
- Each point should be substantive

## Language: {language}
If language is "auto", detect from outline and maintain consistency.
If Chinese (zh), use natural, professional Chinese - avoid awkward translations.

## Output Format (JSON)
{
  "title": "Compelling, action-oriented headline (8-12 words)",
  "subtitle": "Supporting context that adds value",
  "bodyText": "2-3 sentences of rich context with specific details (for text layouts)",
  "bulletPoints": [
    "Substantive point 1 with specific detail or example (15-25 words)",
    "Substantive point 2 with data or insight",
    "Substantive point 3 with concrete example",
    "Substantive point 4 with actionable insight",
    "Substantive point 5 (optional, if needed)"
  ],
  "highlightText": "The ONE key number or insight to emphasize",
  "speakerNotes": "3-4 sentences for ~45 seconds of speaking. Include: transition from previous slide, key emphasis points, transition to next topic."
}

For specific purposes, include additional fields:
- statistics: Include "statistics" array with {label, value, comparison, trend}
- quote: Include "quote" object with {text, author, source}
- comparison: Include "comparisonData" with {left: {title, points[]}, right: {title, points[]}}

## QUALITY CHECK - Before outputting, verify:
✓ Each bullet is 15-25 words with real substance
✓ No generic filler content like "Key benefits" or "Important features"
✓ Specific data/examples included where relevant
✓ Content tells a story, not just lists facts
✓ Speaker notes are natural and helpful

Output valid JSON only.`;

const SPEAKER_NOTES_PROMPT = `Generate natural speaker notes for this slide.

## Slide Content
Title: {title}
Key Points: {keyPoints}

## Requirements
- 2-3 sentences
- Natural speaking rhythm
- About 30 seconds when spoken
- Include transition hint to next topic if applicable
- Language: {language}

Output plain text only, no JSON.`;

// ============================================
// 🆕 素材绑定内容生成提示词（P0 关键改进）
// ============================================

const SOURCE_BOUND_CONTENT_PROMPT = `You are a WORLD-CLASS presentation content writer with strict source fidelity requirements.

## 🚨 CRITICAL CONSTRAINT: SOURCE MATERIAL BINDING
You MUST generate content ONLY from the provided source material. This is NON-NEGOTIABLE.

### Rules:
1. **ALL content must come from the source material** - NO fabrication allowed
2. **Required data points MUST be included** - they are extracted from the source and must appear in your output
3. **If source is insufficient, use "[需补充]" markers** instead of making up content
4. **Every claim must be traceable to the source**

## Source Material (AUTHORITATIVE - use this as your ONLY source)
"""
{sourceExcerpt}
"""

## Required Data Points (MUST include all of these)
{requiredDataPoints}

## Slide Specification
- Title: {title}
- Purpose: {purpose}
- Layout: {layout}
- Content Outline: {outline}

## Output Requirements

### For Each Bullet Point:
1. Must be 15-25 words with REAL substance from the source
2. Include specific numbers/data from the required data points
3. If information is not in source, write: "[需补充: 具体信息缺失]"

### Quality Standards:
✓ Each bullet references specific source content
✓ All required data points are incorporated naturally
✓ NO generic filler content
✓ NO fabricated statistics or examples
✓ Content tells a coherent story from the source

## Language: {language}

## Output Format (JSON)
{
  "title": "Compelling headline derived from source (8-12 words)",
  "subtitle": "Supporting context from source",
  "bodyText": "2-3 sentences directly from/paraphrasing source",
  "bulletPoints": [
    "Point 1 with specific data from source (include required data point)",
    "Point 2 citing source material directly",
    "Point 3 with concrete example from source",
    "Point 4 with actionable insight from source"
  ],
  "highlightText": "Key statistic or insight from required data points",
  "speakerNotes": "Natural notes referencing source content",
  "sourceReferences": ["Brief note on which part of source each bullet comes from"]
}

For statistics slides, include:
- "statistics": [{label, value (from required data points), comparison, trend}]

Output valid JSON only.`;

@Injectable()
export class SlideContentService {
  private readonly logger = new Logger(SlideContentService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 生成幻灯片内容
   *
   * 🆕 支持素材绑定模式：
   * - 如果 spec 包含 sourceExcerpt 和 requiredDataPoints，使用素材绑定 prompt
   * - 生成后自动进行内容验证
   */
  async generateContent(
    spec: SlideSpec,
    sourceContent: string,
    options: {
      language?: string;
      includeSpeakerNotes?: boolean;
    } = {},
  ): Promise<GeneratedSlideContent> {
    this.logger.log(
      `[generateContent] Generating content for slide ${spec.index}: ${spec.title}`,
    );

    const textModel = await this.aiModelService.getDefaultTextModel();
    if (!textModel) {
      throw new Error("No text model available for content generation");
    }

    // 对于简单的标题页和结束页，使用快速生成
    if (
      spec.purpose === "title" ||
      spec.purpose === "closing" ||
      spec.purpose === "qna"
    ) {
      return this.generateSimpleSlideContent(spec, options.language);
    }

    // 🆕 判断是否使用素材绑定模式
    const useSourceBinding =
      spec.mustNotFabricate &&
      spec.sourceExcerpt &&
      spec.sourceExcerpt.length > 0;

    let prompt: string;

    if (useSourceBinding) {
      // 使用素材绑定 prompt（强约束模式）
      this.logger.log(
        `[generateContent] Using SOURCE_BOUND mode for slide ${spec.index}`,
      );

      const dataPointsStr =
        spec.requiredDataPoints && spec.requiredDataPoints.length > 0
          ? spec.requiredDataPoints
              .map(
                (dp, i) =>
                  `${i + 1}. ${dp.value} - ${dp.context}${dp.required ? " [必须包含]" : ""}`,
              )
              .join("\n")
          : "无特定数据点要求，但内容必须来源于上述素材";

      prompt = SOURCE_BOUND_CONTENT_PROMPT.replace("{title}", spec.title)
        .replace("{purpose}", spec.purpose)
        .replace("{layout}", spec.layoutType)
        .replace("{outline}", JSON.stringify(spec.contentOutline))
        .replace(
          "{sourceExcerpt}",
          this.truncateContent(spec.sourceExcerpt!, 4000),
        )
        .replace("{requiredDataPoints}", dataPointsStr)
        .replace("{language}", options.language || "auto");
    } else {
      // 使用标准 prompt（自由生成模式）
      prompt = CONTENT_GENERATION_PROMPT.replace("{title}", spec.title)
        .replace("{purpose}", spec.purpose)
        .replace("{layout}", spec.layoutType)
        .replace("{outline}", JSON.stringify(spec.contentOutline))
        .replace("{sourceContent}", this.truncateContent(sourceContent, 3000))
        .replace("{language}", options.language || "auto");
    }

    // 调用文本模型
    const response = await this.callTextModel(
      {
        apiEndpoint: textModel.apiEndpoint || "",
        apiKey: textModel.apiKey || "",
        modelId: textModel.modelId,
        provider: textModel.provider,
      },
      prompt,
    );

    // 解析响应
    const content = this.parseContentResponse(response, spec);

    // 如果需要且没有生成演讲稿，单独生成
    if (options.includeSpeakerNotes && !content.speakerNotes) {
      content.speakerNotes = await this.generateSpeakerNotes(
        spec,
        content,
        options.language,
        {
          apiEndpoint: textModel.apiEndpoint || "",
          apiKey: textModel.apiKey || "",
          modelId: textModel.modelId,
          provider: textModel.provider,
        },
      );
    }

    return content;
  }

  /**
   * 🆕 验证生成的内容是否符合素材绑定要求
   */
  validateContent(
    content: GeneratedSlideContent,
    spec: SlideSpec,
  ): ContentValidation {
    const requiredDataPoints = spec.requiredDataPoints || [];
    const contentText = this.extractContentText(content);

    // 检查数据点覆盖
    const coveredDataPoints: SlideDataPoint[] = [];
    const missingDataPoints: SlideDataPoint[] = [];

    for (const dp of requiredDataPoints) {
      // 检查数据点值是否出现在内容中
      const valuePattern = new RegExp(
        dp.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      if (valuePattern.test(contentText)) {
        coveredDataPoints.push(dp);
      } else if (dp.required) {
        missingDataPoints.push(dp);
      }
    }

    // 检查可能臆造的内容（检测常见的填充词）
    const fabricatedContent: string[] = [];
    const fabricationPatterns = [
      /显著提升|大幅增长|明显改善/g,
      /leading|significant|substantial/gi,
      /approximately|around|about \d+/gi,
    ];

    // 如果有素材绑定且内容中有这些模糊词，可能是臆造
    if (spec.mustNotFabricate && spec.sourceExcerpt) {
      for (const pattern of fabricationPatterns) {
        const matches = contentText.match(pattern);
        if (matches) {
          // 检查这些词是否在原始素材中
          for (const match of matches) {
            if (!spec.sourceExcerpt.includes(match)) {
              fabricatedContent.push(match);
            }
          }
        }
      }
    }

    // 计算与素材的相关性
    const sourceRelevance = spec.sourceExcerpt
      ? this.calculateRelevance(contentText, spec.sourceExcerpt)
      : 100;

    // 计算覆盖率
    const coverageRate =
      requiredDataPoints.length > 0
        ? (coveredDataPoints.length / requiredDataPoints.length) * 100
        : 100;

    // 判断是否通过
    const passed =
      coverageRate >= 80 &&
      sourceRelevance >= 60 &&
      fabricatedContent.length === 0;

    return {
      dataPointsCovered: coveredDataPoints.length,
      dataPointsTotal: requiredDataPoints.length,
      coverageRate,
      dataPointsMissing: missingDataPoints,
      fabricatedContent,
      sourceRelevance,
      passed,
      message: passed
        ? "内容验证通过"
        : `验证未通过: 覆盖率 ${coverageRate.toFixed(1)}%, 相关性 ${sourceRelevance.toFixed(1)}%, 可疑内容 ${fabricatedContent.length} 处`,
    };
  }

  /**
   * 提取内容文本用于验证
   */
  private extractContentText(content: GeneratedSlideContent): string {
    const parts: string[] = [];

    if (content.title) parts.push(content.title);
    if (content.subtitle) parts.push(content.subtitle);
    if (content.bodyText) parts.push(content.bodyText);
    if (content.bulletPoints) parts.push(content.bulletPoints.join(" "));
    if (content.highlightText) parts.push(content.highlightText);
    if (content.statistics) {
      parts.push(content.statistics.map((s) => `${s.label} ${s.value}`).join(" "));
    }

    return parts.join(" ");
  }

  /**
   * 计算内容与素材的相关性（简单的词汇重叠）
   */
  private calculateRelevance(content: string, source: string): number {
    const contentTokens = new Set(
      content
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );
    const sourceTokens = new Set(
      source
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );

    if (contentTokens.size === 0) return 0;

    let matchCount = 0;
    for (const token of contentTokens) {
      if (sourceTokens.has(token)) {
        matchCount++;
      }
    }

    return (matchCount / contentTokens.size) * 100;
  }

  /**
   * 生成简单幻灯片内容（标题页、结束页等）
   */
  private generateSimpleSlideContent(
    spec: SlideSpec,
    language?: string,
  ): GeneratedSlideContent {
    const content: GeneratedSlideContent = {
      title: spec.title,
    };

    switch (spec.purpose) {
      case "title":
        content.subtitle = spec.contentOutline[0] || undefined;
        content.speakerNotes =
          language === "zh"
            ? "欢迎大家，今天我将为大家介绍..."
            : "Welcome everyone, today I will present...";
        break;

      case "closing":
        content.subtitle =
          language === "zh" ? "感谢聆听" : "Thank you for listening";
        content.bulletPoints =
          spec.contentOutline.length > 0
            ? spec.contentOutline
            : [
                language === "zh" ? "问题与讨论" : "Questions & Discussion",
                language === "zh" ? "联系方式" : "Contact Information",
              ];
        content.speakerNotes =
          language === "zh"
            ? "感谢大家的时间，现在欢迎提问。"
            : "Thank you for your time. I'm happy to take any questions.";
        break;

      case "qna":
        content.subtitle =
          language === "zh" ? "欢迎提问" : "Open for Questions";
        content.speakerNotes =
          language === "zh"
            ? "我们现在进入问答环节，请随时提问。"
            : "We're now in the Q&A session. Please feel free to ask questions.";
        break;

      default:
        content.bulletPoints = spec.contentOutline;
    }

    return content;
  }

  /**
   * 单独生成演讲者备注
   */
  private async generateSpeakerNotes(
    spec: SlideSpec,
    content: GeneratedSlideContent,
    language: string | undefined,
    textModel: {
      apiEndpoint: string;
      apiKey: string;
      modelId: string;
      provider: string;
    },
  ): Promise<string> {
    const keyPoints = [
      content.title,
      ...(content.bulletPoints || []),
      content.highlightText,
    ]
      .filter(Boolean)
      .join(", ");

    const prompt = SPEAKER_NOTES_PROMPT.replace("{title}", spec.title)
      .replace("{keyPoints}", keyPoints)
      .replace("{language}", language || "auto");

    try {
      const notes = await this.callTextModel(textModel, prompt);
      return notes.trim();
    } catch (error) {
      this.logger.warn(
        "[generateSpeakerNotes] Failed to generate notes:",
        error,
      );
      return "";
    }
  }

  /**
   * 解析内容响应
   */
  private parseContentResponse(
    response: string,
    spec: SlideSpec,
  ): GeneratedSlideContent {
    try {
      // 清理 markdown 代码块
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(cleaned);

      const content: GeneratedSlideContent = {
        title: parsed.title || spec.title,
        subtitle: parsed.subtitle,
        bodyText: parsed.bodyText,
        bulletPoints: this.validateBulletPoints(parsed.bulletPoints),
        numberedItems: this.validateBulletPoints(parsed.numberedItems),
        speakerNotes: parsed.speakerNotes,
        highlightText: parsed.highlightText,
      };

      // 处理特殊目的的额外字段
      if (spec.purpose === "quote" && parsed.quote) {
        content.quote = {
          text: parsed.quote.text || parsed.quote,
          author: parsed.quote.author,
          source: parsed.quote.source,
        };
      }

      if (spec.purpose === "statistics" && parsed.statistics) {
        content.statistics = this.validateStatistics(parsed.statistics);
      }

      return content;
    } catch (error) {
      this.logger.error(
        "[parseContentResponse] Parse error, using fallback:",
        error,
      );

      // 回退：使用规格中的大纲
      return {
        title: spec.title,
        bulletPoints: spec.contentOutline,
      };
    }
  }

  /**
   * 验证和清理 bullet points
   */
  private validateBulletPoints(points: unknown): string[] | undefined {
    if (!Array.isArray(points)) {
      return undefined;
    }

    const cleaned = points
      .filter((p) => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim());

    return cleaned.length > 0 ? cleaned : undefined;
  }

  /**
   * 验证统计数据
   */
  private validateStatistics(
    stats: unknown,
  ): GeneratedSlideContent["statistics"] {
    if (!Array.isArray(stats)) {
      return undefined;
    }

    return stats
      .filter((s) => s && typeof s === "object" && s.label && s.value)
      .map((s) => ({
        label: String(s.label),
        value: String(s.value),
        comparison: s.comparison ? String(s.comparison) : undefined,
        trend: ["up", "down", "stable"].includes(s.trend) ? s.trend : undefined,
      }));
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    return content.substring(0, maxLength) + "\n...[truncated]";
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
        { headers: { "Content-Type": "application/json" }, timeout: 30000 },
      ),
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  private async callOpenAICompatibleAPI(
    model: { apiEndpoint: string; apiKey: string; modelId: string },
    prompt: string,
  ): Promise<string> {
    // apiEndpoint 可能已经包含完整路径 (如 https://api.openai.com/v1/chat/completions)
    // 或者只是基础URL (如 https://api.openai.com/v1)
    let url = model.apiEndpoint || "https://api.openai.com/v1/chat/completions";

    // 如果 endpoint 不以 /chat/completions 结尾，则追加
    if (!url.endsWith("/chat/completions")) {
      url = url.replace(/\/$/, "") + "/chat/completions";
    }

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: model.modelId,
          messages: [
            {
              role: "system",
              content:
                "You are a professional presentation writer. Output valid JSON when requested.",
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
          timeout: 30000,
        },
      ),
    );

    return response.data?.choices?.[0]?.message?.content || "";
  }
}
