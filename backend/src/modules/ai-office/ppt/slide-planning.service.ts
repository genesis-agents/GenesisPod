/**
 * SlideBySlide Planning Service
 *
 * 逐页规划服务 - AI Office 3.0 核心
 *
 * 职责：
 * 1. 生成 PPT 大纲
 * 2. 为每一页独立规划布局、背景、图像需求
 * 3. 智能决策渲染模式
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../ai-model.service";
import {
  SlideSpec,
  SlideImageSpec,
  SlideChartSpec,
  PPTOutline,
  SlideOutlineItem,
  SlidePurpose,
  SlideLayoutType,
  PPTTheme,
  BackgroundDecision,
  BackgroundType,
} from "./ppt.types";
import { randomUUID } from "crypto";

// ============================================
// 大纲生成提示词
// ============================================

const OUTLINE_GENERATION_PROMPT = `You are an expert presentation designer. Based on the provided content, generate a PPT outline.

## Input Content
{content}

## Requirements
1. Analyze the core theme and key information
2. Plan a reasonable number of slides (usually 8-15 pages)
3. Determine the purpose and main content for each page
4. Ensure logical flow and clear structure

## Slide Purpose Types
- title: Title slide (always first)
- agenda: Agenda/Table of contents
- section_header: Section divider
- content: Regular content
- comparison: Comparison (exactly 2 items)
- timeline: Timeline/Process
- statistics: Data/Statistics heavy
- quote: Quote/Highlight
- image_focus: Image-centric slide
- chart: Chart/Graph focused
- closing: Closing slide
- qna: Q&A slide

## Output Format (JSON)
{
  "title": "Presentation Title",
  "subtitle": "Subtitle (optional)",
  "estimatedDuration": 15,
  "targetAudience": "Target audience description",
  "suggestedTheme": "professional|modern|minimal|creative|genspark",
  "slides": [
    {
      "index": 0,
      "purpose": "title",
      "title": "Slide title",
      "keyPoints": ["Key point 1", "Key point 2"],
      "needsImage": true,
      "needsChart": false
    }
  ]
}

IMPORTANT:
- First slide should always be "title" purpose
- Last slide should be "closing" or "qna"
- Use "section_header" to divide major sections
- "comparison" should only be used for exactly 2 items
- "statistics" for data-heavy content
- Provide 2-4 keyPoints per slide
- Output valid JSON only, no markdown code blocks`;

// ============================================
// 单页规划提示词
// ============================================

const SLIDE_PLANNING_PROMPT = `You are a presentation design expert. Plan the layout and visual style for this slide.

## Slide Information
- Index: {index}
- Purpose: {purpose}
- Title: {title}
- Key Points: {keyPoints}
- Theme Style: {themeStyle}
- Previous Slides Context: {context}

## Layout Options
- title_center: Centered title (for title/closing slides)
- title_subtitle: Title with subtitle
- text_only: Text-only content
- text_image_left: Image left, text right
- text_image_right: Text left, image right
- image_full: Full-screen image with text overlay
- image_top: Image top, text bottom
- two_columns: Two-column layout
- three_columns: Three-column layout
- cards_grid: Card grid layout
- bullet_points: Bullet point list
- numbered_list: Numbered list
- comparison_split: Split comparison (2 items)
- timeline_horizontal: Horizontal timeline
- timeline_vertical: Vertical timeline
- statistics_cards: Statistics cards layout
- chart_with_text: Chart with explanatory text
- quote_highlight: Quote highlight layout
- team_grid: Team member grid

## Background Types
- solid: Solid color (for text-heavy, formal slides)
- gradient: Gradient (for visual appeal without AI)
- ai_generated: AI-generated background (for visual impact slides)

## Decision Guidelines
1. Title/closing slides → ai_generated background for visual impact
2. Data/statistics heavy → solid/gradient for readability
3. Quote slides → ai_generated with subtle background
4. Content slides → gradient or ai_generated based on complexity
5. Comparison → solid for clarity

## Output Format (JSON)
{
  "layoutType": "selected_layout",
  "layoutReasoning": "Why this layout fits",
  "backgroundType": "solid|gradient|ai_generated",
  "backgroundReasoning": "Why this background type",
  "backgroundConfig": {
    "colors": {
      "primary": "#hex",
      "secondary": "#hex (for gradient)"
    },
    "aiPrompt": "Background image prompt (if ai_generated)"
  },
  "needsImage": true,
  "imageSpec": {
    "prompt": "Detailed image generation prompt in English",
    "position": "background|left|right|center",
    "style": "professional|creative|minimal|tech",
    "aspectRatio": "16:9"
  },
  "needsChart": false,
  "chartSpec": null
}

Output valid JSON only.`;

@Injectable()
export class SlidePlanningService {
  private readonly logger = new Logger(SlidePlanningService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 生成 PPT 大纲
   */
  async generateOutline(
    content: string,
    options: {
      slideCount?: number;
      language?: string;
      targetAudience?: string;
      presentationStyle?: string;
    } = {},
  ): Promise<PPTOutline> {
    this.logger.log("[generateOutline] Starting outline generation");

    const textModel = await this.aiModelService.getDefaultTextModel();
    if (!textModel) {
      throw new Error("No text model available for outline generation");
    }

    // 构建提示词
    let prompt = OUTLINE_GENERATION_PROMPT.replace("{content}", content);

    if (options.slideCount) {
      prompt += `\n\nTarget slide count: approximately ${options.slideCount} slides.`;
    }
    if (options.targetAudience) {
      prompt += `\nTarget audience: ${options.targetAudience}`;
    }
    if (options.presentationStyle) {
      prompt += `\nPresentation style: ${options.presentationStyle}`;
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
    const outline = this.parseOutlineResponse(response);

    this.logger.log(
      `[generateOutline] Generated outline with ${outline.slides.length} slides`,
    );

    return outline;
  }

  /**
   * 为单页生成规划
   */
  async planSlide(
    outlineItem: SlideOutlineItem,
    theme: PPTTheme,
    context: {
      totalSlides: number;
      previousSlides: Array<{
        purpose: SlidePurpose;
        layoutType: SlideLayoutType;
      }>;
    },
  ): Promise<SlideSpec> {
    this.logger.log(
      `[planSlide] Planning slide ${outlineItem.index}: ${outlineItem.title}`,
    );

    const textModel = await this.aiModelService.getDefaultTextModel();
    if (!textModel) {
      throw new Error("No text model available for slide planning");
    }

    // 构建上下文字符串
    const contextStr = context.previousSlides
      .slice(-3) // 只取最近3页
      .map((s, i) => `Slide ${i}: ${s.purpose} - ${s.layoutType}`)
      .join("; ");

    // 构建提示词
    const prompt = SLIDE_PLANNING_PROMPT.replace(
      "{index}",
      String(outlineItem.index),
    )
      .replace("{purpose}", outlineItem.purpose)
      .replace("{title}", outlineItem.title)
      .replace("{keyPoints}", JSON.stringify(outlineItem.keyPoints))
      .replace("{themeStyle}", theme.style)
      .replace("{context}", contextStr || "None");

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
    const planResult = this.parseSlidePlanResponse(
      response,
      outlineItem,
      theme,
    );

    return planResult;
  }

  /**
   * 批量规划所有幻灯片（并行优化）
   */
  async planAllSlides(
    outline: PPTOutline,
    theme: PPTTheme,
  ): Promise<SlideSpec[]> {
    this.logger.log(`[planAllSlides] Planning ${outline.slides.length} slides`);

    const slideSpecs: SlideSpec[] = [];

    // 顺序规划，以保持上下文连贯性
    for (const outlineItem of outline.slides) {
      const previousSlides = slideSpecs.map((s) => ({
        purpose: s.purpose,
        layoutType: s.layoutType,
      }));

      const spec = await this.planSlide(outlineItem, theme, {
        totalSlides: outline.slides.length,
        previousSlides,
      });

      slideSpecs.push(spec);
    }

    this.logger.log(
      `[planAllSlides] Completed planning for ${slideSpecs.length} slides`,
    );

    return slideSpecs;
  }

  /**
   * 快速规划（不调用 AI，使用规则引擎）
   */
  quickPlanSlide(
    outlineItem: SlideOutlineItem,
    theme: PPTTheme,
    index: number,
    _totalSlides: number,
  ): SlideSpec {
    // 根据目的自动决定布局
    const layoutType = this.determineLayoutByPurpose(
      outlineItem.purpose,
      outlineItem.keyPoints,
    );

    // 根据目的和布局决定背景类型
    const backgroundDecision = this.determineBackground(
      outlineItem.purpose,
      layoutType,
      theme,
    );

    // 决定是否需要图像
    const imageSpec = this.determineImageSpec(
      outlineItem,
      layoutType,
      backgroundDecision.type,
    );

    // 决定是否需要图表
    const chartSpec = outlineItem.needsChart
      ? this.determineChartSpec(outlineItem)
      : undefined;

    return {
      id: randomUUID(),
      index,
      purpose: outlineItem.purpose,
      title: outlineItem.title,
      contentOutline: outlineItem.keyPoints,
      layoutType,
      layoutReasoning: `Auto-determined based on purpose: ${outlineItem.purpose}`,
      backgroundDecision,
      imageSpec,
      chartSpec,
      estimatedGenerationTime: this.estimateGenerationTime(
        backgroundDecision,
        imageSpec,
      ),
    };
  }

  // ============================================
  // 私有方法
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
    try {
      const isGemini =
        model.provider?.toLowerCase().includes("google") ||
        model.modelId?.toLowerCase().includes("gemini");

      if (isGemini) {
        return await this.callGeminiAPI(model, prompt);
      } else {
        return await this.callOpenAICompatibleAPI(model, prompt);
      }
    } catch (error) {
      this.logger.error("[callTextModel] Error:", error);
      throw error;
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
            maxOutputTokens: 4000,
          },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 60000 },
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
                "You are a professional presentation designer. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
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
  }

  /**
   * 解析大纲响应
   */
  private parseOutlineResponse(response: string): PPTOutline {
    try {
      // 清理 markdown 代码块
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(cleaned);

      // 验证和规范化
      const outline: PPTOutline = {
        title: parsed.title || "Untitled Presentation",
        subtitle: parsed.subtitle,
        estimatedDuration: parsed.estimatedDuration || 15,
        targetAudience: parsed.targetAudience,
        suggestedTheme: parsed.suggestedTheme,
        slides: [],
      };

      if (Array.isArray(parsed.slides)) {
        outline.slides = parsed.slides.map((slide: any, index: number) => ({
          index: slide.index ?? index,
          purpose: this.validateSlidePurpose(slide.purpose),
          title: slide.title || `Slide ${index + 1}`,
          keyPoints: Array.isArray(slide.keyPoints) ? slide.keyPoints : [],
          needsImage: slide.needsImage ?? true,
          needsChart: slide.needsChart ?? false,
        }));
      }

      // 确保第一页是标题页
      if (outline.slides.length > 0 && outline.slides[0].purpose !== "title") {
        outline.slides.unshift({
          index: 0,
          purpose: "title",
          title: outline.title,
          keyPoints: [outline.subtitle || ""],
          needsImage: true,
          needsChart: false,
        });
        // 重新编号
        outline.slides.forEach((s, i) => (s.index = i));
      }

      return outline;
    } catch (error) {
      this.logger.error("[parseOutlineResponse] Parse error:", error);
      // 返回默认大纲
      return {
        title: "Presentation",
        estimatedDuration: 10,
        slides: [
          {
            index: 0,
            purpose: "title",
            title: "Presentation",
            keyPoints: [],
            needsImage: true,
            needsChart: false,
          },
          {
            index: 1,
            purpose: "content",
            title: "Main Content",
            keyPoints: ["Content will be generated"],
            needsImage: false,
            needsChart: false,
          },
          {
            index: 2,
            purpose: "closing",
            title: "Thank You",
            keyPoints: [],
            needsImage: true,
            needsChart: false,
          },
        ],
      };
    }
  }

  /**
   * 解析单页规划响应
   */
  private parseSlidePlanResponse(
    response: string,
    outlineItem: SlideOutlineItem,
    theme: PPTTheme,
  ): SlideSpec {
    try {
      // 清理 markdown 代码块
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(cleaned);

      // 构建 BackgroundDecision
      const backgroundType = this.validateBackgroundType(parsed.backgroundType);
      const backgroundDecision: BackgroundDecision = {
        type: backgroundType,
        reasoning: parsed.backgroundReasoning || "AI determined",
      };

      if (backgroundType === "solid" || backgroundType === "gradient") {
        backgroundDecision.colors = {
          primary:
            parsed.backgroundConfig?.colors?.primary || theme.colors.background,
          secondary: parsed.backgroundConfig?.colors?.secondary,
          direction: backgroundType === "gradient" ? "diagonal" : undefined,
        };
      }

      if (backgroundType === "ai_generated") {
        backgroundDecision.aiConfig = {
          prompt:
            parsed.backgroundConfig?.aiPrompt ||
            `Professional ${theme.style} background`,
          style: theme.style,
          colorTone: theme.colors.primary,
          complexity: "minimal",
        };
      }

      // 构建 ImageSpec
      let imageSpec: SlideImageSpec | undefined;
      if (parsed.needsImage && parsed.imageSpec) {
        imageSpec = {
          prompt:
            parsed.imageSpec.prompt ||
            `Professional image for ${outlineItem.title}`,
          position: parsed.imageSpec.position || "right",
          style: parsed.imageSpec.style || theme.style,
          aspectRatio: parsed.imageSpec.aspectRatio || "16:9",
        };
      }

      // 构建 ChartSpec
      let chartSpec: SlideChartSpec | undefined;
      if (parsed.needsChart && parsed.chartSpec) {
        chartSpec = {
          type: parsed.chartSpec.type || "bar",
          title: parsed.chartSpec.title || outlineItem.title,
          data: parsed.chartSpec.data || [],
        };
      }

      return {
        id: randomUUID(),
        index: outlineItem.index,
        purpose: outlineItem.purpose,
        title: outlineItem.title,
        contentOutline: outlineItem.keyPoints,
        layoutType: this.validateLayoutType(parsed.layoutType),
        layoutReasoning: parsed.layoutReasoning || "AI determined",
        backgroundDecision,
        imageSpec,
        chartSpec,
        estimatedGenerationTime: this.estimateGenerationTime(
          backgroundDecision,
          imageSpec,
        ),
      };
    } catch (error) {
      this.logger.error(
        "[parseSlidePlanResponse] Parse error, using quick plan:",
        error,
      );
      // 回退到快速规划
      return this.quickPlanSlide(outlineItem, theme, outlineItem.index, 10);
    }
  }

  /**
   * 根据目的确定布局
   */
  private determineLayoutByPurpose(
    purpose: SlidePurpose,
    keyPoints: string[],
  ): SlideLayoutType {
    const purposeLayoutMap: Record<SlidePurpose, SlideLayoutType> = {
      title: "title_center",
      agenda: "bullet_points",
      section_header: "title_subtitle",
      content: "text_image_right",
      comparison: "comparison_split",
      timeline: "timeline_horizontal",
      statistics: "statistics_cards",
      quote: "quote_highlight",
      team: "team_grid",
      image_focus: "image_full",
      chart: "chart_with_text",
      closing: "title_center",
      qna: "title_center",
    };

    let layout = purposeLayoutMap[purpose] || "bullet_points";

    // 根据内容量调整
    if (purpose === "content") {
      if (keyPoints.length <= 3) {
        layout = "text_image_right";
      } else if (keyPoints.length <= 6) {
        layout = "two_columns";
      } else {
        layout = "cards_grid";
      }
    }

    return layout;
  }

  /**
   * 确定背景决策
   */
  private determineBackground(
    purpose: SlidePurpose,
    layoutType: SlideLayoutType,
    theme: PPTTheme,
  ): BackgroundDecision {
    // 标题页和结束页使用 AI 生成背景
    if (
      purpose === "title" ||
      purpose === "closing" ||
      purpose === "section_header"
    ) {
      return {
        type: "ai_generated",
        reasoning: "Visual impact for key slides",
        aiConfig: {
          prompt: `Abstract professional ${theme.style} background, subtle patterns, corporate aesthetic`,
          style: theme.style,
          colorTone: theme.colors.primary,
          complexity: "minimal",
        },
      };
    }

    // 引用页使用 AI 背景
    if (purpose === "quote") {
      return {
        type: "ai_generated",
        reasoning: "Atmospheric background for quote",
        aiConfig: {
          prompt:
            "Elegant minimalist background with subtle texture, inspirational mood",
          style: theme.style,
          colorTone: theme.colors.accent,
          complexity: "minimal",
        },
      };
    }

    // 数据密集页使用渐变或纯色
    if (
      purpose === "statistics" ||
      purpose === "chart" ||
      layoutType === "statistics_cards"
    ) {
      return {
        type: "gradient",
        reasoning: "Clean background for data readability",
        colors: {
          primary: theme.colors.background,
          secondary: theme.colors.backgroundSecondary,
          direction: "vertical",
        },
      };
    }

    // 图片为主的页面使用纯色
    if (purpose === "image_focus" || layoutType === "image_full") {
      return {
        type: "solid",
        reasoning: "Solid background to let image stand out",
        colors: {
          primary: theme.colors.background,
        },
      };
    }

    // 默认使用渐变
    return {
      type: "gradient",
      reasoning: "Default gradient for visual appeal",
      colors: {
        primary: theme.colors.background,
        secondary: theme.colors.backgroundSecondary,
        direction: "diagonal",
      },
    };
  }

  /**
   * 确定图像规格
   */
  private determineImageSpec(
    outlineItem: SlideOutlineItem,
    layoutType: SlideLayoutType,
    _backgroundType: BackgroundType,
  ): SlideImageSpec | undefined {
    // 如果背景已经是 AI 生成，不需要额外图片（除非布局需要）
    const needsContentImage =
      layoutType === "text_image_left" ||
      layoutType === "text_image_right" ||
      layoutType === "image_full" ||
      layoutType === "image_top" ||
      layoutType === "image_bottom";

    if (!outlineItem.needsImage && !needsContentImage) {
      return undefined;
    }

    // 确定图片位置
    let position: SlideImageSpec["position"] = "right";
    if (layoutType === "text_image_left") position = "left";
    if (layoutType === "image_full") position = "background";
    if (layoutType === "image_top") position = "top";
    if (layoutType === "image_bottom") position = "bottom";

    // 生成提示词
    const keywords = outlineItem.keyPoints.slice(0, 3).join(", ");
    const prompt = `Professional illustration for: ${outlineItem.title}. Related concepts: ${keywords}. Style: modern, clean, professional.`;

    return {
      prompt,
      position,
      style: "professional",
      aspectRatio: "16:9",
    };
  }

  /**
   * 确定图表规格
   */
  private determineChartSpec(
    outlineItem: SlideOutlineItem,
  ): SlideChartSpec | undefined {
    // 简单启发式：如果关键点包含数字，可能需要图表
    const hasNumbers = outlineItem.keyPoints.some((kp) => /\d+/.test(kp));

    if (!hasNumbers) {
      return undefined;
    }

    return {
      type: "bar",
      title: outlineItem.title,
      data: [], // 实际数据在内容生成阶段填充
    };
  }

  /**
   * 估算生成时间
   */
  private estimateGenerationTime(
    backgroundDecision: BackgroundDecision,
    imageSpec?: SlideImageSpec,
  ): number {
    let time = 2000; // 基础内容生成时间

    if (backgroundDecision.type === "ai_generated") {
      time += 5000; // AI 背景生成
    }

    if (imageSpec) {
      time += 5000; // 内容图片生成
    }

    return time;
  }

  /**
   * 验证幻灯片目的
   */
  private validateSlidePurpose(purpose: string): SlidePurpose {
    const validPurposes: SlidePurpose[] = [
      "title",
      "agenda",
      "section_header",
      "content",
      "comparison",
      "timeline",
      "statistics",
      "quote",
      "team",
      "image_focus",
      "chart",
      "closing",
      "qna",
    ];

    if (validPurposes.includes(purpose as SlidePurpose)) {
      return purpose as SlidePurpose;
    }

    return "content";
  }

  /**
   * 验证布局类型
   */
  private validateLayoutType(layoutType: string): SlideLayoutType {
    const validLayouts: SlideLayoutType[] = [
      "title_center",
      "title_subtitle",
      "text_only",
      "text_image_left",
      "text_image_right",
      "image_full",
      "image_top",
      "image_bottom",
      "two_columns",
      "three_columns",
      "cards_grid",
      "bullet_points",
      "numbered_list",
      "comparison_split",
      "timeline_horizontal",
      "timeline_vertical",
      "statistics_cards",
      "chart_with_text",
      "quote_highlight",
      "team_grid",
    ];

    if (validLayouts.includes(layoutType as SlideLayoutType)) {
      return layoutType as SlideLayoutType;
    }

    return "bullet_points";
  }

  /**
   * 验证背景类型
   */
  private validateBackgroundType(bgType: string): BackgroundType {
    const validTypes: BackgroundType[] = ["solid", "gradient", "ai_generated"];

    if (validTypes.includes(bgType as BackgroundType)) {
      return bgType as BackgroundType;
    }

    return "gradient";
  }
}
