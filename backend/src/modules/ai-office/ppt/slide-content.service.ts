/**
 * Slide Content Generation Service
 *
 * 幻灯片内容生成服务
 *
 * 职责：
 * 1. 根据规格生成幻灯片详细内容
 * 2. 生成演讲者备注
 * 3. 提取和格式化数据
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../ai-model.service";
import { SlideSpec, GeneratedSlideContent } from "./ppt.types";

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

@Injectable()
export class SlideContentService {
  private readonly logger = new Logger(SlideContentService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 生成幻灯片内容
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

    // 构建提示词
    const prompt = CONTENT_GENERATION_PROMPT.replace("{title}", spec.title)
      .replace("{purpose}", spec.purpose)
      .replace("{layout}", spec.layoutType)
      .replace("{outline}", JSON.stringify(spec.contentOutline))
      .replace("{sourceContent}", this.truncateContent(sourceContent, 3000))
      .replace("{language}", options.language || "auto");

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
