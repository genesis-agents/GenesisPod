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
import { AIModelService } from "../../core";
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
  ContentBlockImageSpec,
} from "../types/slides.types";
import { SourceAnalysis } from "../generation/source-analysis.service";
import { randomUUID } from "crypto";

// ============================================
// 大纲生成提示词 - 专业PPT设计师视角
// ============================================

const OUTLINE_GENERATION_PROMPT = `You are a world-class presentation designer with 20+ years of experience creating keynotes for Fortune 500 companies, TED talks, and product launches. Your presentations have won multiple design awards.

## Your Design Philosophy
1. **Visual Storytelling**: Every slide should tell a story, not just display information
2. **One Idea Per Slide**: Avoid cognitive overload - each slide has ONE clear message
3. **Visual Hierarchy**: Guide the eye with deliberate layout and emphasis
4. **Breathing Room**: Embrace white space - it's not empty, it's powerful
5. **Emotional Connection**: Design for impact, not just information transfer

## 🆕 MECE Principle (Mutually Exclusive, Collectively Exhaustive)
When structuring the presentation:
- **Mutually Exclusive**: Each slide/section covers distinct topics with NO overlap
- **Collectively Exhaustive**: Together, all slides cover the COMPLETE story
- Example: If analyzing "Market Strategy", split into MECE buckets: Product | Pricing | Promotion | Place (4Ps)
- Avoid: Vague overlap like "Strategy Overview" + "Key Strategies" (not MECE)

## 🆕 Problem-Driven Design
Structure the narrative around a central question or problem:
1. **Hook**: What's the burning question or problem? (Slide 1-2)
2. **Context**: Why does this matter now? What's changed? (Slide 3-4)
3. **Analysis**: What did we find? Break down the problem MECE-style (Slide 5-N)
4. **Solution**: How do we solve it? Clear, actionable recommendations (Slide N+1 to N+3)
5. **Impact**: What happens if we act? Paint the future state (Final slides)

## Input Content
{content}

## Your Task
Analyze this content as a master storyteller and create a presentation outline that will CAPTIVATE the audience.

## Design Thinking Process
1. **Hook**: Start with something that grabs attention (surprising stat, provocative question, powerful image)
2. **Flow**: Create a narrative arc - setup, conflict/challenge, resolution, call-to-action
3. **Rhythm**: Vary slide types to maintain engagement (text → image → data → quote → image)
4. **Emphasis**: Identify 2-3 "hero" slides that deserve extra visual impact

## Slide Purpose Types (Choose Strategically)
- title: Opening slide - make it memorable! Consider bold imagery or provocative statement
- agenda: Roadmap - keep it simple, 3-5 items max
- section_header: Visual break - opportunity for impactful image/quote
- content: Core information - but think visually! Icons, diagrams, illustrations
- comparison: Side-by-side (EXACTLY 2 items) - great for before/after, us/them
- timeline: Process/journey - horizontal feels like progress, vertical feels like depth
- statistics: Data that matters - highlight ONE key number, support with 2-3 others
- quote: Powerful words - needs dramatic visual treatment
- image_focus: Let the image speak - minimal text overlay
- chart: Data visualization - choose chart type wisely (bar for comparison, line for trends, pie for parts)
- team: People/credits - humanize with photos
- closing: End strong! - clear call-to-action or memorable takeaway
- qna: Q&A invitation - make it inviting, not just "Questions?"

## Visual Strategy for Each Slide
For EACH slide, consider:
- **Layout Intent**: Why this arrangement? (e.g., image-left creates reading flow)
- **Image Needs**: Does this slide need a photo, illustration, icon, or nothing?
- **Data Visualization**: Numbers → consider chart/infographic
- **Color Emphasis**: Which element should pop?

## Output Format (JSON)
{
  "title": "Compelling Presentation Title",
  "subtitle": "Subtitle that adds context or intrigue (optional)",
  "estimatedDuration": 15,
  "targetAudience": "Specific audience description",
  "suggestedTheme": "professional|modern|minimal|creative|genspark",
  "narrativeArc": "Brief description of the story flow",
  "slides": [
    {
      "index": 0,
      "purpose": "title",
      "title": "Slide headline (action-oriented, benefit-focused)",
      "keyPoints": ["Supporting point 1", "Supporting point 2"],
      "visualIntent": "Brief description of visual approach for this slide",
      "needsImage": true,
      "imageHint": "Type of image that would work (e.g., 'abstract tech pattern', 'team collaboration photo')",
      "needsChart": false,
      "emphasis": "high|medium|low"
    }
  ]
}

## Professional Guidelines
1. **Title slide**: Set the tone. Bold statement + striking visual OR clean minimal + powerful title
2. **Content density**: Max 6 bullets per slide, max 8 words per bullet
3. **Section breaks**: Use section_header every 3-4 content slides for visual breathing room
4. **Data slides**: Lead with the insight, not the data. "Sales grew 40%" not "Sales Data"
5. **Closing**: Never end with "Thank You" alone - add a call-to-action or memorable quote
6. **Slide count**: Quality over quantity. 8-12 slides for 15 min, 15-20 for 30 min

## CRITICAL RULES
- First slide MUST be "title" purpose
- Last slide MUST be "closing" or "qna"
- "comparison" ONLY for exactly 2 items being compared
- Each keyPoint should be actionable or insightful, not generic
- Output valid JSON only, no markdown code blocks`;

// ============================================
// 单页规划提示词 - 专业视觉设计师视角
// ============================================

const SLIDE_PLANNING_PROMPT = `You are a senior visual designer at a top design agency (like Pentagram or IDEO). You're designing a slide that will be part of a high-stakes presentation.

## Your Design Expertise
- 15+ years creating presentations for Apple, Google, Nike-level brands
- Expert in visual hierarchy, color theory, and typography
- Known for creating slides that are both beautiful AND effective
- Motto: "Every pixel has a purpose"

## Current Slide Brief
- Slide Number: {index}
- Slide Purpose: {purpose}
- Headline: {title}
- Content Points: {keyPoints}
- Brand Style: {themeStyle}
- Context (Previous Slides): {context}

## Your Design Task
Create a detailed visual specification for this slide that balances aesthetics with communication effectiveness.

## Layout Selection Guide (Choose ONE)
| Layout | Best For | Visual Impact |
|--------|----------|---------------|
| title_center | Opening/closing, bold statements | High - commands attention |
| title_subtitle | Section headers, branded intros | Medium - professional |
| text_only | Quotes, simple messages | Low-Medium - content focused |
| text_image_left | Reading flow (eye goes left→right) | High - balanced |
| text_image_right | Emphasis on text first | High - text priority |
| image_full | Hero moments, emotional impact | Very High - immersive |
| image_top | Data/text needs bottom space | Medium - structured |
| two_columns | Comparisons, dual concepts | Medium - organized |
| three_columns | Features, team members, steps | Medium - grid feel |
| cards_grid | Multiple items, features | Medium - scannable |
| bullet_points | Lists, agendas | Low - functional |
| numbered_list | Steps, rankings, processes | Low - sequential |
| comparison_split | Before/after, A vs B | High - contrast |
| timeline_horizontal | Progress, history, roadmap | Medium - narrative |
| timeline_vertical | Depth, detailed process | Medium - detailed |
| statistics_cards | Key metrics, KPIs | High - data viz |
| chart_with_text | Data stories, insights | Medium-High - analytical |
| quote_highlight | Testimonials, key quotes | High - emotional |
| team_grid | People, credits | Medium - personal |

## Background Strategy
**SOLID** - When to use:
- Data-heavy slides (charts, statistics)
- Text-heavy content
- When images are the focus
- Clean, corporate feel

**GRADIENT** - When to use:
- Modern, tech aesthetic
- Subtle visual interest without distraction
- Transitional slides
- When solid feels too flat

**AI_GENERATED** - When to use:
- Title/closing slides (hero moments)
- Section headers (visual breaks)
- Quote slides (atmospheric)
- Image-focus slides
- When you want WOW factor

## Color Psychology (for backgrounds)
- Blues: Trust, professionalism, calm
- Greens: Growth, health, sustainability
- Purples: Innovation, luxury, creativity
- Oranges: Energy, enthusiasm, warmth
- Dark/Black: Sophistication, drama, premium
- Light/White: Clean, modern, spacious

## Image Prompt Engineering
When specifying images, be SPECIFIC:
- Subject: What exactly should be in the image?
- Style: Photo? Illustration? 3D render? Abstract?
- Mood: Energetic? Calm? Professional? Playful?
- Color tone: Should it match brand colors?
- Composition: Close-up? Wide shot? Centered? Rule of thirds?

Bad: "business image"
Good: "Professional photo of diverse team collaborating around modern whiteboard, bright natural lighting, slight depth of field blur, warm color tones, shot from slight angle"

## Output Specification (JSON)
{
  "layoutType": "selected_layout_from_table",
  "layoutReasoning": "Why this layout serves the content and audience best",

  "backgroundType": "solid|gradient|ai_generated",
  "backgroundReasoning": "Design rationale for this background choice",
  "backgroundConfig": {
    "colors": {
      "primary": "#hexcolor",
      "secondary": "#hexcolor (for gradients)",
      "direction": "horizontal|vertical|diagonal|radial"
    },
    "aiPrompt": "Detailed background generation prompt (only if ai_generated)"
  },

  "needsImage": true,
  "imageSpec": {
    "prompt": "Detailed, specific image generation prompt in English - include subject, style, mood, colors, composition",
    "position": "background|left|right|top|bottom|center",
    "style": "photo|illustration|3d|abstract|icon",
    "aspectRatio": "16:9|4:3|1:1|custom",
    "colorTone": "warm|cool|neutral|brand-matched",
    "importance": "hero|supporting|decorative"
  },

  "needsChart": false,
  "chartSpec": {
    "type": "bar|line|pie|donut|area|scatter",
    "title": "Chart title",
    "dataDescription": "What data this chart should visualize",
    "colorScheme": "brand|sequential|diverging",
    "emphasis": "Which data point to highlight"
  },

  "typography": {
    "headlineStyle": "bold|light|italic",
    "textAlignment": "left|center|right",
    "emphasis": "Which words should be highlighted"
  },

  "designNotes": "Any additional design considerations or warnings"
}

## Professional Standards
1. **Contrast**: Ensure text is readable against background (WCAG AA minimum)
2. **Consistency**: Layout should feel cohesive with presentation style
3. **Hierarchy**: One element should dominate, others support
4. **Balance**: Visual weight should feel stable
5. **Purpose**: Every element must serve communication goal

Output valid JSON only, no markdown code blocks.`;

@Injectable()
export class SlidePlanningService {
  private readonly logger = new Logger(SlidePlanningService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
  ) {}

  /**
   * 生成 PPT 大纲
   *
   * 🆕 Phase 2 重构：
   * 1. 智能页数计算（基于内容特征）
   * 2. 重试机制（如果大纲验证失败）
   * 3. 金字塔结构强制约束
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
    const startTime = Date.now();
    this.logger.log(
      `[generateOutline] Starting outline generation, content length: ${content.length}`,
    );

    const textModel = await this.aiModelService.getDefaultTextModel();
    if (!textModel) {
      this.logger.error("[generateOutline] No text model available!");
      throw new Error(
        "No text model available for outline generation. Please configure an AI model in System Management > AI Models.",
      );
    }

    this.logger.log(
      `[generateOutline] Using model: ${textModel.displayName} (${textModel.modelId}), provider: ${textModel.provider}, apiKey: ${textModel.apiKey ? "***" + textModel.apiKey.slice(-4) : "NONE"}`,
    );

    // 🆕 智能计算页数：根据内容长度和复杂度
    let targetSlideCount = options.slideCount;
    if (!targetSlideCount || targetSlideCount <= 0) {
      targetSlideCount = this.calculateOptimalSlideCount(content, options);
      this.logger.log(
        `[generateOutline] Auto-calculated slide count: ${targetSlideCount} (content: ${content.length} chars)`,
      );
    }

    // 🆕 重试机制：最多尝试3次
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`[generateOutline] Attempt ${attempt}/${maxRetries}`);

        // 构建提示词
        const prompt = this.buildOutlinePrompt(
          content,
          targetSlideCount,
          options,
          attempt,
        );

        this.logger.log(`[generateOutline] Prompt length: ${prompt.length}`);

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

        const elapsed = Date.now() - startTime;
        this.logger.log(
          `[generateOutline] Got response in ${elapsed}ms, length: ${response.length}`,
        );

        // 解析响应（如果失败会抛出错误）
        const outline = this.parseOutlineResponse(response);

        // 验证大纲质量
        const validation = this.validateOutlineQuality(
          outline,
          targetSlideCount,
        );
        if (!validation.passed) {
          throw new Error(
            `Outline validation failed: ${validation.issues.join(", ")}`,
          );
        }

        this.logger.log(
          `[generateOutline] Generated outline with ${outline.slides.length} slides in ${elapsed}ms`,
        );

        return outline;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `[generateOutline] Attempt ${attempt} failed: ${error.message}`,
        );

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 等待一小段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    // 所有重试失败，抛出错误
    const elapsed = Date.now() - startTime;
    this.logger.error(
      `[generateOutline] All ${maxRetries} attempts failed after ${elapsed}ms`,
    );
    throw new Error(
      `Failed to generate valid outline after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}. Please try again or adjust your input.`,
    );
  }

  /**
   * 🆕 智能计算最佳页数
   *
   * 基于内容长度、语言、风格等因素
   */
  private calculateOptimalSlideCount(
    content: string,
    options: {
      presentationStyle?: string;
    },
  ): number {
    const length = content.length;
    const style = options.presentationStyle?.toLowerCase() || "standard";

    // 基础页数计算
    let baseCount: number;
    if (length < 1000) {
      baseCount = 10; // 快速模式：8-12页
    } else if (length < 3000) {
      baseCount = 18; // 标准模式：15-25页
    } else if (length < 5000) {
      baseCount = 25; // 深度模式：25-40页
    } else {
      baseCount = 30; // 超长内容：30-40页
    }

    // 风格调整
    if (style === "formal" || style === "educational") {
      baseCount = Math.round(baseCount * 1.2); // 正式/教育风格：内容更详细
    } else if (style === "casual" || style === "persuasive") {
      baseCount = Math.round(baseCount * 0.9); // 轻松/说服风格：更简洁
    }

    // 确保在合理范围内
    return Math.max(8, Math.min(40, baseCount));
  }

  /**
   * 🆕 构建大纲生成提示词
   */
  private buildOutlinePrompt(
    content: string,
    targetSlideCount: number,
    options: {
      language?: string;
      targetAudience?: string;
      presentationStyle?: string;
    },
    attempt: number,
  ): string {
    let prompt = OUTLINE_GENERATION_PROMPT.replace("{content}", content);

    // 强制页数约束
    prompt += `\n\n## 🎯 CRITICAL SLIDE COUNT REQUIREMENT
You MUST generate EXACTLY ${targetSlideCount} slides (±2 slides allowed for optimal content flow).
- Minimum: ${Math.max(5, targetSlideCount - 2)} slides
- Maximum: ${targetSlideCount + 2} slides
- Do NOT generate fewer slides to save effort
- Do NOT generate more slides than needed
- Ensure comprehensive coverage of the content`;

    // 🆕 金字塔结构要求
    prompt += `\n\n## 📐 PYRAMID STRUCTURE REQUIREMENT (MANDATORY)
Your outline MUST follow this professional structure:
1. **Title Slide** (purpose: "title") - First slide MUST be the title
2. **Agenda/Table of Contents** (purpose: "agenda") - If > 5 content slides
3. **Content Slides** (purpose: "content", "statistics", "comparison", etc.) - Main body
4. **Closing Slide** (purpose: "closing" or "qna") - Last slide MUST be closing/Q&A

MECE Check: Ensure each slide covers DISTINCT content with NO overlap.`;

    // 语言要求
    if (options.language === "zh") {
      prompt += `\n\nIMPORTANT: Generate all titles and content in Chinese (简体中文).`;
    }

    // 受众和风格
    if (options.targetAudience) {
      prompt += `\nTarget audience: ${options.targetAudience}`;
    }
    if (options.presentationStyle) {
      prompt += `\nPresentation style: ${options.presentationStyle}`;
    }

    // 重试提示
    if (attempt > 1) {
      prompt += `\n\n⚠️ RETRY ATTEMPT ${attempt}: Previous attempt failed validation. Please ensure:
- Correct JSON format with no syntax errors
- Slide count within target range (${Math.max(5, targetSlideCount - 2)}-${targetSlideCount + 2})
- First slide is "title" purpose
- Last slide is "closing" or "qna" purpose
- MECE principle: No overlapping content between slides`;
    }

    return prompt;
  }

  /**
   * 🆕 验证大纲质量
   */
  private validateOutlineQuality(
    outline: PPTOutline,
    targetSlideCount: number,
  ): { passed: boolean; issues: string[] } {
    const issues: string[] = [];

    // 1. 检查页数是否在合理范围
    const minSlides = Math.max(5, targetSlideCount - 3);
    const maxSlides = targetSlideCount + 3;
    if (outline.slides.length < minSlides) {
      issues.push(`Too few slides: ${outline.slides.length} < ${minSlides}`);
    }
    if (outline.slides.length > maxSlides) {
      issues.push(`Too many slides: ${outline.slides.length} > ${maxSlides}`);
    }

    // 2. 检查是否有标题页
    const hasTitle = outline.slides.some((s) => s.purpose === "title");
    if (!hasTitle) {
      issues.push("Missing title slide");
    }

    // 3. 检查是否有结束页
    const hasClosing = outline.slides.some(
      (s) => s.purpose === "closing" || s.purpose === "qna",
    );
    if (!hasClosing) {
      issues.push("Missing closing slide");
    }

    // 4. 检查重复标题（MECE违反）
    const titles = outline.slides.map((s) => s.title.toLowerCase());
    const uniqueTitles = new Set(titles);
    if (uniqueTitles.size < titles.length * 0.9) {
      // 允许10%重复（如章节标题）
      issues.push("Too many duplicate titles (violates MECE principle)");
    }

    return {
      passed: issues.length === 0,
      issues,
    };
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
   * 批量规划所有幻灯片（使用快速规则引擎，不调用 AI）
   *
   * 注意：之前使用 AI 逐页规划导致 7+ 页时需要 10+ 分钟
   * 现在改用快速规则引擎，秒级完成
   */
  async planAllSlides(
    outline: PPTOutline,
    theme: PPTTheme,
  ): Promise<SlideSpec[]> {
    this.logger.log(
      `[planAllSlides] Quick planning ${outline.slides.length} slides (rule-based)`,
    );

    const totalSlides = outline.slides.length;

    // 使用快速规则引擎，不调用 AI
    const slideSpecs = outline.slides.map((outlineItem, index) =>
      this.quickPlanSlide(outlineItem, theme, index, totalSlides),
    );

    this.logger.log(
      `[planAllSlides] Completed quick planning for ${slideSpecs.length} slides`,
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

    // 🆕 生成语义块图片规格（图文并茂支持）
    const contentBlockImages = this.generateContentBlockImages(
      outlineItem,
      layoutType,
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
      contentBlockImages,
      chartSpec,
      estimatedGenerationTime: this.estimateGenerationTime(
        backgroundDecision,
        imageSpec,
        contentBlockImages,
      ),
    };
  }

  /**
   * 🆕 生成语义块图片规格
   * 根据布局类型和内容要点，为每个语义块生成对应的图片 prompt
   */
  private generateContentBlockImages(
    outlineItem: SlideOutlineItem,
    layoutType: SlideLayoutType,
  ): ContentBlockImageSpec[] | undefined {
    const images: ContentBlockImageSpec[] = [];

    // 根据布局类型决定是否需要语义块图片
    const needsBlockImages = [
      "two_columns",
      "three_columns",
      "cards_grid",
      "timeline_horizontal",
      "timeline_vertical",
      "comparison_split",
    ].includes(layoutType);

    if (!needsBlockImages || outlineItem.keyPoints.length === 0) {
      return undefined;
    }

    // 为每个关键点生成图片规格
    outlineItem.keyPoints.forEach((keyPoint, idx) => {
      // 只为前4个关键点生成图片，避免过多
      if (idx >= 4) return;

      const blockId = this.getBlockIdForLayout(layoutType, idx);
      const blockType = this.getBlockTypeForLayout(layoutType);

      images.push({
        blockId,
        blockType,
        prompt: this.generateSemanticImagePrompt(
          keyPoint,
          outlineItem.title,
          outlineItem.purpose,
        ),
        promptZh: this.generateSemanticImagePromptZh(keyPoint),
        semanticContent: keyPoint,
        style: this.determineImageStyleForBlock(outlineItem.purpose),
        aspectRatio: layoutType.includes("column") ? "1:1" : "4:3",
        importance: idx === 0 ? "hero" : "supporting",
      });
    });

    return images.length > 0 ? images : undefined;
  }

  /**
   * 根据布局类型获取块ID
   */
  private getBlockIdForLayout(
    layoutType: SlideLayoutType,
    index: number,
  ): string {
    if (layoutType.includes("column")) {
      return `column-${index}`;
    } else if (layoutType.includes("timeline")) {
      return `stage-${index}`;
    } else if (layoutType === "comparison_split") {
      return index === 0 ? "left" : "right";
    } else if (layoutType === "cards_grid") {
      return `card-${index}`;
    }
    return `block-${index}`;
  }

  /**
   * 根据布局类型获取块类型
   */
  private getBlockTypeForLayout(
    layoutType: SlideLayoutType,
  ): ContentBlockImageSpec["blockType"] {
    if (layoutType.includes("column")) return "column";
    if (layoutType.includes("timeline")) return "stage";
    if (layoutType === "comparison_split") return "section";
    if (layoutType === "cards_grid") return "item";
    return "other";
  }

  /**
   * 🆕 生成语义匹配的图片提示词
   * 确保图片与文字内容完全对应
   */
  private generateSemanticImagePrompt(
    keyPoint: string,
    slideTitle: string,
    purpose: SlidePurpose,
  ): string {
    // 提取关键词
    const keywords = this.extractKeywords(keyPoint);

    // 根据内容语义生成精确的图片提示词
    const styleGuide = this.getStyleGuideForPurpose(purpose);

    return `Professional ${styleGuide.style} image that visually represents: "${keyPoint}".
Key concepts to illustrate: ${keywords.join(", ")}.
Context: Part of a slide about "${slideTitle}".
Style: ${styleGuide.description}
Mood: ${styleGuide.mood}
DO NOT include any text, words, letters, or numbers in the image.
High quality, 4K resolution, professional business presentation aesthetic.`;
  }

  /**
   * 生成中文图片提示词（用于显示）
   */
  private generateSemanticImagePromptZh(keyPoint: string): string {
    return `与"${keyPoint}"语义匹配的专业配图`;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 移除常见停用词，提取核心概念
    const stopWords = [
      "的",
      "是",
      "在",
      "和",
      "与",
      "或",
      "了",
      "the",
      "a",
      "an",
      "is",
      "are",
      "of",
      "to",
      "and",
      "for",
    ];
    const words = text
      .split(/[\s,，、]+/)
      .filter((w) => w.length > 1 && !stopWords.includes(w.toLowerCase()));
    return words.slice(0, 5); // 最多5个关键词
  }

  /**
   * 根据目的获取风格指南
   */
  private getStyleGuideForPurpose(purpose: SlidePurpose): {
    style: string;
    description: string;
    mood: string;
  } {
    const guides: Record<
      SlidePurpose,
      { style: string; description: string; mood: string }
    > = {
      title: {
        style: "hero",
        description: "Cinematic, dramatic visual",
        mood: "Inspiring, bold",
      },
      agenda: {
        style: "minimal",
        description: "Clean icons or abstract shapes",
        mood: "Organized, clear",
      },
      section_header: {
        style: "bold",
        description: "Strong visual statement",
        mood: "Impactful, transitional",
      },
      content: {
        style: "illustrative",
        description: "Clear conceptual illustration",
        mood: "Informative, engaging",
      },
      comparison: {
        style: "contrasting",
        description: "Visual that shows difference",
        mood: "Analytical, balanced",
      },
      timeline: {
        style: "progressive",
        description: "Visual showing flow or progress",
        mood: "Dynamic, sequential",
      },
      statistics: {
        style: "data-driven",
        description: "Abstract data visualization feel",
        mood: "Analytical, modern",
      },
      quote: {
        style: "atmospheric",
        description: "Subtle, emotional backdrop",
        mood: "Thoughtful, inspiring",
      },
      team: {
        style: "warm",
        description: "Human connection imagery",
        mood: "Collaborative, approachable",
      },
      image_focus: {
        style: "hero",
        description: "Stunning main visual",
        mood: "High impact, memorable",
      },
      chart: {
        style: "analytical",
        description: "Supporting data visual",
        mood: "Clear, professional",
      },
      closing: {
        style: "inspiring",
        description: "Forward-looking imagery",
        mood: "Hopeful, conclusive",
      },
      qna: {
        style: "inviting",
        description: "Open, welcoming visual",
        mood: "Conversational, engaging",
      },
    };
    return guides[purpose] || guides.content;
  }

  /**
   * 确定语义块的图片风格
   */
  private determineImageStyleForBlock(
    purpose: SlidePurpose,
  ): ContentBlockImageSpec["style"] {
    const styleMap: Record<SlidePurpose, ContentBlockImageSpec["style"]> = {
      title: "photo",
      agenda: "icon",
      section_header: "abstract",
      content: "illustration",
      comparison: "illustration",
      timeline: "illustration",
      statistics: "abstract",
      quote: "photo",
      team: "photo",
      image_focus: "photo",
      chart: "diagram",
      closing: "photo",
      qna: "illustration",
    };
    return styleMap[purpose] || "illustration";
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

    this.logger.log(
      `[callGeminiAPI] Calling model: ${model.modelId}, prompt length: ${prompt.length}`,
    );

    try {
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
          { headers: { "Content-Type": "application/json" }, timeout: 180000 },
        ),
      );

      const text =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      this.logger.log(
        `[callGeminiAPI] Response length: ${text.length}, first 200 chars: ${text.slice(0, 200)}`,
      );
      return text;
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
    // apiEndpoint 可能已经包含完整路径 (如 https://api.openai.com/v1/chat/completions)
    // 或者只是基础URL (如 https://api.openai.com/v1)
    let url = model.apiEndpoint || "https://api.openai.com/v1/chat/completions";

    // 如果 endpoint 不以 /chat/completions 结尾，则追加
    if (!url.endsWith("/chat/completions")) {
      url = url.replace(/\/$/, "") + "/chat/completions";
    }

    this.logger.log(
      `[callOpenAICompatibleAPI] Calling ${url}, model: ${model.modelId}, prompt length: ${prompt.length}`,
    );

    try {
      // 检测是否为新版模型（需要 max_completion_tokens 而非 max_tokens）
      // 包括: o1/o3 系列, gpt-4.5, gpt-5 系列
      const modelIdLower = model.modelId.toLowerCase();
      const requiresCompletionTokens =
        modelIdLower.includes("o1") ||
        modelIdLower.includes("o3") ||
        modelIdLower.includes("gpt-4.5") ||
        modelIdLower.includes("gpt-5");

      this.logger.debug(
        `[callOpenAICompatibleAPI] Model: ${model.modelId}, requiresCompletionTokens: ${requiresCompletionTokens}`,
      );

      const requestBody: Record<string, unknown> = {
        model: model.modelId,
        messages: [
          {
            role: "system",
            content:
              "You are a professional presentation designer. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
      };

      // 新版模型使用 max_completion_tokens，旧版使用 max_tokens
      if (requiresCompletionTokens) {
        requestBody.max_completion_tokens = 4000;
      } else {
        requestBody.temperature = 0.7;
        requestBody.max_tokens = 4000;
      }

      const response = await firstValueFrom(
        this.httpService.post(url, requestBody, {
          headers: {
            Authorization: `Bearer ${model.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 180000,
        }),
      );

      const text = response.data?.choices?.[0]?.message?.content || "";
      this.logger.log(
        `[callOpenAICompatibleAPI] Response length: ${text.length}`,
      );
      return text;
    } catch (error: any) {
      // 详细的错误日志
      const errorDetails = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        isTimeout:
          error.code === "ECONNABORTED" || error.message?.includes("timeout"),
      };
      this.logger.error(
        `[callOpenAICompatibleAPI] Error calling ${url}: ${JSON.stringify(errorDetails)}`,
      );

      // 根据错误类型提供有用的错误消息
      if (errorDetails.isTimeout) {
        throw new Error(
          `AI API request timed out after 180 seconds. The model may be slow or overloaded. Try again later or use a faster model.`,
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          `AI API authentication failed. Please check your API key in System Management > AI Models.`,
        );
      }
      if (error.response?.status === 429) {
        throw new Error(
          `AI API rate limit exceeded. Please wait and try again, or switch to a different model.`,
        );
      }
      throw new Error(
        `AI API error (${error.response?.status || "unknown"}): ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * 解析大纲响应
   *
   * 🆕 Phase 2 重构：
   * 1. 移除固定3页fallback（改为抛出错误重试）
   * 2. 强制金字塔结构验证
   * 3. 智能补全缺失的结构性页面
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
          // 新增：专业设计师视角的字段
          visualIntent: slide.visualIntent,
          imageHint: slide.imageHint,
          emphasis: this.validateEmphasis(slide.emphasis),
        }));
      }

      // 🆕 强制金字塔结构验证和修复
      const validatedOutline = this.enforceOutlineStructure(outline);

      return validatedOutline;
    } catch (error) {
      this.logger.error("[parseOutlineResponse] Parse error:", error);
      // 🆕 不再返回默认3页大纲，抛出错误触发重试
      throw new Error(
        `Failed to parse outline response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 🆕 强制金字塔结构：封面→目录→摘要→正文章节→结语
   *
   * 确保大纲符合专业PPT的标准结构
   */
  private enforceOutlineStructure(outline: PPTOutline): PPTOutline {
    const slides = [...outline.slides];
    const fixedSlides: typeof slides = [];

    // 1. 确保第一页是标题页
    const titleSlide = slides.find((s) => s.purpose === "title");
    if (titleSlide) {
      fixedSlides.push({ ...titleSlide, index: 0 });
    } else {
      fixedSlides.push({
        index: 0,
        purpose: "title",
        title: outline.title,
        keyPoints: [outline.subtitle || ""],
        needsImage: true,
        needsChart: false,
        emphasis: "high",
      });
    }

    // 2. 检查是否需要目录页（如果内容页 > 5页）
    const contentSlides = slides.filter(
      (s) =>
        s.purpose !== "title" &&
        s.purpose !== "closing" &&
        s.purpose !== "qna" &&
        s.purpose !== "agenda",
    );

    if (contentSlides.length > 5) {
      // 查找现有目录页
      const agendaSlide = slides.find((s) => s.purpose === "agenda");
      if (agendaSlide) {
        fixedSlides.push({ ...agendaSlide, index: fixedSlides.length });
      } else {
        // 自动生成目录页
        const sections = this.extractSections(slides);
        fixedSlides.push({
          index: fixedSlides.length,
          purpose: "agenda",
          title: "目录",
          keyPoints: sections.map((s) => s.title),
          needsImage: false,
          needsChart: false,
          emphasis: "medium",
        });
      }
    }

    // 3. 添加正文内容（按原始顺序）
    for (const slide of contentSlides) {
      fixedSlides.push({ ...slide, index: fixedSlides.length });
    }

    // 4. 确保最后一页是结束页或Q&A
    const closingSlide = slides.find(
      (s) => s.purpose === "closing" || s.purpose === "qna",
    );
    if (closingSlide) {
      fixedSlides.push({ ...closingSlide, index: fixedSlides.length });
    } else {
      fixedSlides.push({
        index: fixedSlides.length,
        purpose: "closing",
        title: "谢谢",
        keyPoints: ["感谢聆听", "欢迎交流"],
        needsImage: true,
        needsChart: false,
        emphasis: "high",
      });
    }

    // 5. 重新编号所有幻灯片
    fixedSlides.forEach((s, i) => (s.index = i));

    this.logger.log(
      `[enforceOutlineStructure] Validated structure: ${fixedSlides.length} slides (${slides.length} original)`,
    );

    return {
      ...outline,
      slides: fixedSlides,
    };
  }

  /**
   * 提取章节结构（用于生成目录）
   */
  private extractSections(
    slides: SlideOutlineItem[],
  ): Array<{ title: string; slideIndex: number }> {
    const sections: Array<{ title: string; slideIndex: number }> = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      // 章节标题页作为章节分隔
      if (slide.purpose === "section_header") {
        sections.push({
          title: slide.title,
          slideIndex: i,
        });
      }
    }

    // 如果没有明确的章节标题，根据内容页自动划分
    if (sections.length === 0) {
      const contentSlides = slides.filter(
        (s) =>
          s.purpose === "content" ||
          s.purpose === "statistics" ||
          s.purpose === "comparison" ||
          s.purpose === "timeline",
      );

      // 每3-4页内容作为一个章节
      for (let i = 0; i < contentSlides.length; i += 4) {
        const slide = contentSlides[i];
        sections.push({
          title: slide.title,
          slideIndex: slides.indexOf(slide),
        });
      }
    }

    return sections;
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
   * 确定图像规格 - 生成高质量的图片提示词（参考 Gamma/Genspark 标准）
   */
  private determineImageSpec(
    outlineItem: SlideOutlineItem,
    layoutType: SlideLayoutType,
    _backgroundType: BackgroundType,
  ): SlideImageSpec | undefined {
    // 大多数布局都需要图片以提升视觉效果
    const needsContentImage =
      layoutType === "text_image_left" ||
      layoutType === "text_image_right" ||
      layoutType === "image_full" ||
      layoutType === "image_top" ||
      layoutType === "image_bottom" ||
      layoutType === "title_center" ||
      layoutType === "title_subtitle" ||
      layoutType === "cards_grid" ||
      layoutType === "two_columns" ||
      layoutType === "statistics_cards";

    this.logger.debug(
      `[determineImageSpec] Slide "${outlineItem.title}": layoutType=${layoutType}, needsImage=${outlineItem.needsImage}, needsContentImage=${needsContentImage}`,
    );

    // 如果明确不需要图片且布局不需要，则跳过
    if (
      !outlineItem.needsImage &&
      !needsContentImage &&
      layoutType !== "bullet_points"
    ) {
      this.logger.debug(
        `[determineImageSpec] Skipping: needsImage=false and layout doesn't need image`,
      );
      return undefined;
    }

    // 对于内容密集型布局（统计、图表），也添加装饰性图片
    const shouldAddImage = outlineItem.needsImage || needsContentImage;
    if (!shouldAddImage) {
      this.logger.debug(`[determineImageSpec] Skipping: shouldAddImage=false`);
      return undefined;
    }

    // 确定图片位置
    let position: SlideImageSpec["position"] = "right";
    if (layoutType === "text_image_left") position = "left";
    if (layoutType === "image_full") position = "background";
    if (layoutType === "image_top") position = "top";
    if (layoutType === "image_bottom") position = "bottom";
    if (layoutType === "title_center" || layoutType === "title_subtitle")
      position = "background";

    // 生成高质量提示词 - 使用专业的 prompt engineering
    let prompt: string;

    if (outlineItem.imageHint) {
      // 使用 AI 提供的更专业的图像提示，但增强它
      prompt = this.enhanceImagePrompt(
        outlineItem.imageHint,
        outlineItem.title,
        outlineItem.purpose,
      );
    } else {
      // 根据幻灯片目的生成专业的图片提示词
      prompt = this.generateImagePromptByPurpose(
        outlineItem.purpose,
        outlineItem.title,
        outlineItem.keyPoints,
      );
    }

    // 根据 emphasis 和 purpose 调整风格
    let style: string;
    if (outlineItem.purpose === "title" || outlineItem.purpose === "closing") {
      style = "hero";
    } else if (outlineItem.emphasis === "high") {
      style = "hero";
    } else if (outlineItem.emphasis === "low") {
      style = "minimal";
    } else {
      style = "professional";
    }

    return {
      prompt,
      position,
      style,
      aspectRatio: position === "background" ? "16:9" : "4:3",
    };
  }

  /**
   * 增强图片提示词
   */
  private enhanceImagePrompt(
    hint: string,
    title: string,
    purpose: SlidePurpose,
  ): string {
    const styleModifiers = this.getStyleModifiersByPurpose(purpose);
    return `${hint}.

Technical specs: High resolution, professional quality, ${styleModifiers.style} aesthetic.
Composition: ${styleModifiers.composition}
Color palette: ${styleModifiers.colors}
Context: ${title}
DO NOT include any text or words in the image.`;
  }

  /**
   * 根据幻灯片目的生成专业的图片提示词
   */
  private generateImagePromptByPurpose(
    purpose: SlidePurpose,
    title: string,
    keyPoints: string[],
  ): string {
    const keywords = keyPoints.slice(0, 3).join(", ");
    const modifiers = this.getStyleModifiersByPurpose(purpose);

    const purposePrompts: Record<SlidePurpose, string> = {
      title: `Stunning hero image representing "${title}". ${modifiers.style} style, cinematic quality, dramatic lighting. Abstract or symbolic visual that evokes the theme. NO text. Ultra high quality, 8K resolution feel.`,

      closing: `Inspiring closing visual for "${title}". ${modifiers.style} aesthetic, hopeful and forward-looking mood. Could be: abstract light rays, open horizon, connected network, or symbolic growth imagery. NO text.`,

      section_header: `Bold section header visual for "${title}". Eye-catching, modern design. Abstract geometric patterns or symbolic imagery. Strong visual impact. ${modifiers.colors}. NO text.`,

      content: `Professional illustration for "${title}" covering: ${keywords}. Clean, modern business style. Could be: isometric illustration, flat design icons, or subtle photography. Professional and engaging. NO text.`,

      comparison: `Split comparison visual for "${title}". Two contrasting but balanced elements. Clear visual distinction between left and right. Modern, clean aesthetic. NO text.`,

      timeline: `Timeline or process visualization for "${title}". Shows progression, evolution, or journey. Could be: path, road, growing plant, or connected nodes. ${modifiers.style} style. NO text.`,

      statistics: `Data visualization theme for "${title}": ${keywords}. Abstract representation of growth, metrics, or success. Could be: rising graphs, connected data points, or achievement imagery. Modern, tech-forward aesthetic. NO text.`,

      quote: `Atmospheric background for quote about "${title}". Elegant, minimal, thoughtful mood. Soft lighting, subtle textures. Could be: nature scene, abstract light play, or serene landscape. ${modifiers.colors}. NO text.`,

      team: `Professional team/people themed image for "${title}". Diverse, collaborative, modern workplace feel. Could be: silhouettes collaborating, hands joining, or abstract human connections. Warm and professional. NO text.`,

      image_focus: `Hero image showcasing "${title}": ${keywords}. This is the main visual - make it stunning. High impact, professional photography style or detailed illustration. ${modifiers.style}. NO text.`,

      chart: `Supporting visual for data/chart about "${title}". Abstract representation of analytics, insights, or data patterns. Modern, clean, tech aesthetic. Blue tones work well. NO text.`,

      agenda: `Clean agenda/roadmap visual for "${title}". Could be: path, stepping stones, connected circles, or subtle geometric pattern. Organized, professional feel. ${modifiers.colors}. NO text.`,

      qna: `Inviting Q&A visual. Open, welcoming imagery. Could be: speech bubbles, raised hands, dialogue symbols, or open door metaphor. Friendly and approachable. NO text.`,
    };

    return (
      purposePrompts[purpose] ||
      `Professional illustration for ${title}. Modern, clean design. Related to: ${keywords}. NO text.`
    );
  }

  /**
   * 获取不同目的的样式修饰符
   */
  private getStyleModifiersByPurpose(purpose: SlidePurpose): {
    style: string;
    composition: string;
    colors: string;
  } {
    const modifiers: Record<
      SlidePurpose,
      { style: string; composition: string; colors: string }
    > = {
      title: {
        style: "cinematic, dramatic",
        composition: "centered focus with depth",
        colors: "rich, vibrant, high contrast",
      },
      closing: {
        style: "hopeful, inspiring",
        composition: "open, expansive",
        colors: "warm, optimistic tones",
      },
      section_header: {
        style: "bold, modern",
        composition: "strong focal point",
        colors: "brand-aligned, impactful",
      },
      content: {
        style: "clean, professional",
        composition: "balanced, organized",
        colors: "muted, professional palette",
      },
      comparison: {
        style: "clear, contrasting",
        composition: "symmetrical split",
        colors: "two distinct but harmonious palettes",
      },
      timeline: {
        style: "flowing, progressive",
        composition: "left-to-right or bottom-to-top flow",
        colors: "gradient progression",
      },
      statistics: {
        style: "modern, data-driven",
        composition: "clean with focal metrics",
        colors: "cool blues, greens for growth",
      },
      quote: {
        style: "elegant, atmospheric",
        composition: "minimal, spacious",
        colors: "soft, muted, sophisticated",
      },
      team: {
        style: "warm, collaborative",
        composition: "inclusive, connected",
        colors: "warm, approachable tones",
      },
      image_focus: {
        style: "stunning, hero-quality",
        composition: "strong subject, rule of thirds",
        colors: "vivid, attention-grabbing",
      },
      chart: {
        style: "analytical, clean",
        composition: "data-focused",
        colors: "analytical blues, clear contrast",
      },
      agenda: {
        style: "organized, structured",
        composition: "sequential, clear hierarchy",
        colors: "professional, subtle",
      },
      qna: {
        style: "open, welcoming",
        composition: "inviting, conversational",
        colors: "friendly, approachable",
      },
    };

    return (
      modifiers[purpose] || {
        style: "professional, modern",
        composition: "balanced",
        colors: "professional palette",
      }
    );
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
    contentBlockImages?: ContentBlockImageSpec[],
  ): number {
    let time = 2000; // 基础内容生成时间

    if (backgroundDecision.type === "ai_generated") {
      time += 5000; // AI 背景生成
    }

    if (imageSpec) {
      time += 5000; // 内容图片生成
    }

    // 语义块图片生成时间
    if (contentBlockImages && contentBlockImages.length > 0) {
      time += contentBlockImages.length * 3000; // 每个语义块图片约3秒
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

  /**
   * 验证强调程度
   */
  private validateEmphasis(
    emphasis: string | undefined,
  ): "high" | "medium" | "low" | undefined {
    if (!emphasis) return undefined;

    const validEmphasis = ["high", "medium", "low"];
    if (validEmphasis.includes(emphasis)) {
      return emphasis as "high" | "medium" | "low";
    }

    return "medium";
  }

  // ============================================
  // 🆕 素材分析集成方法
  // ============================================

  /**
   * 🆕 使用素材分析结果增强大纲
   * 将章节、数据点、洞见融入大纲规划
   */
  enhanceOutlineWithSourceAnalysis(
    outline: PPTOutline,
    sourceAnalysis: SourceAnalysis,
  ): PPTOutline {
    this.logger.log(
      `[enhanceOutlineWithSourceAnalysis] Enhancing outline with ${sourceAnalysis.chapters.length} chapters, ${sourceAnalysis.dataPoints.length} data points`,
    );

    const enhancedSlides: SlideOutlineItem[] = [];
    const { chapters, dataPoints, keyInsights, quotes } = sourceAnalysis;

    // 保留标题页
    const titleSlide = outline.slides.find((s) => s.purpose === "title");
    if (titleSlide) {
      enhancedSlides.push(titleSlide);
    }

    // 如果有足够的章节，基于章节重新组织内容页
    if (chapters.length >= 2) {
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];

        // 添加章节标题页（如果不是第一章）
        if (i > 0) {
          enhancedSlides.push({
            index: enhancedSlides.length,
            purpose: "section_header",
            title: chapter.title,
            keyPoints: [chapter.summary],
            needsImage: true,
            needsChart: false,
            emphasis: "medium",
          });
        }

        // 添加章节内容页
        const chapterDataPoints = dataPoints.filter(
          (dp) => dp.chapterId === chapter.id,
        );

        enhancedSlides.push({
          index: enhancedSlides.length,
          purpose: chapterDataPoints.length > 2 ? "statistics" : "content",
          title: chapter.title,
          keyPoints: chapter.keyPoints.slice(0, 5),
          needsImage: true,
          needsChart: chapterDataPoints.length > 2,
          emphasis: "medium",
          // 🆕 附加素材信息
          visualIntent: chapter.summary,
          imageHint: this.generateImageHintFromChapter(chapter),
        });
      }
    } else {
      // 保留原有的内容页
      const contentSlides = outline.slides.filter(
        (s) =>
          s.purpose !== "title" &&
          s.purpose !== "closing" &&
          s.purpose !== "qna",
      );
      for (const slide of contentSlides) {
        slide.index = enhancedSlides.length;
        enhancedSlides.push(slide);
      }
    }

    // 如果有洞见，添加洞见页
    if (keyInsights.length > 0) {
      const topInsights = keyInsights.slice(0, 3);
      enhancedSlides.push({
        index: enhancedSlides.length,
        purpose: "content",
        title: "关键洞见",
        keyPoints: topInsights.map((insight) => insight.description),
        needsImage: true,
        needsChart: false,
        emphasis: "high",
      });
    }

    // 如果有引用，添加引用页
    if (quotes.length > 0) {
      const topQuote = quotes[0];
      enhancedSlides.push({
        index: enhancedSlides.length,
        purpose: "quote",
        title: topQuote.text.slice(0, 100),
        keyPoints: [topQuote.author ? `— ${topQuote.author}` : ""],
        needsImage: true,
        needsChart: false,
        emphasis: "high",
      });
    }

    // 添加结尾页
    const closingSlide = outline.slides.find(
      (s) => s.purpose === "closing" || s.purpose === "qna",
    );
    if (closingSlide) {
      closingSlide.index = enhancedSlides.length;
      enhancedSlides.push(closingSlide);
    } else {
      enhancedSlides.push({
        index: enhancedSlides.length,
        purpose: "closing",
        title: "谢谢",
        keyPoints: ["联系我们了解更多"],
        needsImage: true,
        needsChart: false,
      });
    }

    this.logger.log(
      `[enhanceOutlineWithSourceAnalysis] Enhanced outline: ${outline.slides.length} -> ${enhancedSlides.length} slides`,
    );

    return {
      ...outline,
      slides: enhancedSlides,
    };
  }

  /**
   * 🆕 从章节生成图像提示
   */
  private generateImageHintFromChapter(
    chapter: SourceAnalysis["chapters"][0],
  ): string {
    const keywords = chapter.keyPoints.slice(0, 3).join(", ");
    return `Professional illustration related to: ${chapter.title}. Key concepts: ${keywords}. Modern, clean business style.`;
  }

  /**
   * 🆕 生成带有素材绑定信息的大纲
   * 在大纲阶段就建立素材关联
   */
  async generateOutlineWithSourceBinding(
    content: string,
    sourceAnalysis: SourceAnalysis,
    options: {
      slideCount?: number;
      language?: string;
      targetAudience?: string;
      presentationStyle?: string;
    } = {},
  ): Promise<PPTOutline> {
    // 先生成基础大纲
    const baseOutline = await this.generateOutline(content, options);

    // 使用素材分析增强大纲
    const enhancedOutline = this.enhanceOutlineWithSourceAnalysis(
      baseOutline,
      sourceAnalysis,
    );

    // 在大纲项中标记素材绑定
    for (const slide of enhancedOutline.slides) {
      // 查找匹配的章节
      const matchingChapter = this.findMatchingChapterForSlide(
        slide,
        sourceAnalysis.chapters,
      );

      if (matchingChapter) {
        // 将章节ID存储在扩展字段中（用于后续绑定）
        (slide as any).sourceChapterId = matchingChapter.id;
        (slide as any).sourceExcerpt = matchingChapter.content.slice(0, 500);
      }

      // 查找相关的数据点
      const relevantDataPoints = sourceAnalysis.dataPoints.filter((dp) => {
        const slideText =
          `${slide.title} ${slide.keyPoints.join(" ")}`.toLowerCase();
        return (
          slideText.includes(dp.value.toLowerCase()) ||
          slideText.includes(dp.context.toLowerCase().slice(0, 20))
        );
      });

      if (relevantDataPoints.length > 0) {
        (slide as any).dataPoints = relevantDataPoints.map((dp) => ({
          id: dp.id,
          value: dp.value,
          type: dp.type,
          context: dp.context,
        }));
      }
    }

    return enhancedOutline;
  }

  /**
   * 🆕 查找与幻灯片匹配的章节
   */
  private findMatchingChapterForSlide(
    slide: SlideOutlineItem,
    chapters: SourceAnalysis["chapters"],
  ): SourceAnalysis["chapters"][0] | null {
    if (chapters.length === 0) return null;

    const slideText =
      `${slide.title} ${slide.keyPoints.join(" ")}`.toLowerCase();

    let bestMatch: SourceAnalysis["chapters"][0] | null = null;
    let bestScore = 0;

    for (const chapter of chapters) {
      const chapterText =
        `${chapter.title} ${chapter.keyPoints.join(" ")}`.toLowerCase();

      // 计算词汇重叠
      const slideWords = new Set(
        slideText.split(/\s+/).filter((w) => w.length > 2),
      );
      const chapterWords = new Set(
        chapterText.split(/\s+/).filter((w) => w.length > 2),
      );

      let overlap = 0;
      for (const word of slideWords) {
        if (chapterWords.has(word)) overlap++;
      }

      const score = overlap / Math.max(slideWords.size, 1);

      if (score > bestScore && score > 0.2) {
        bestScore = score;
        bestMatch = chapter;
      }
    }

    return bestMatch;
  }
}
