import {
  Injectable,
  Logger,
  BadRequestException,
  MessageEvent,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom, Observable, Subject } from "rxjs";
import { ContentExtractorService } from "./content-extractor.service";
import { AIModelType, Prisma } from "@prisma/client";

// 处理步骤类型
export interface ProcessingStep {
  step: string;
  status: "pending" | "processing" | "completed" | "error";
  title: string;
  content?: string;
  timestamp?: string;
}

interface PromptDesignJournalEntry {
  title: string;
  narrative: string;
}

interface PromptMetric {
  label: string;
  value: string;
  comparison?: string;
}

interface PromptVisualCue {
  type?: string;
  description?: string;
}

interface PromptSection {
  title?: string;
  summary?: string;
  bullets: string[];
  metrics: PromptMetric[];
  visual?: PromptVisualCue;
  iconType?: string;
  sectionType?: "main" | "summary"; // AI-determined section classification
}

interface PromptInformationArchitecture {
  title?: string;
  subtitle?: string;
  heroStatement?: string;
  centerVisualTitle?: string; // 中心视觉模板的核心标题
  centerVisualItems?: string[]; // 中心视觉模板周围的要点
  sections: PromptSection[];
  callToAction?: string;
}

interface PromptVisualLanguage {
  colorPalette: string[];
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  typography?: string;
  iconography?: string;
  templateLayout?: string; // 模板布局类型
  chartStyle?: string;
  background?: string;
  gridSystem?: string;
  // 新增风格相关字段
  designStyle?: string; // consulting, tech, minimal, creative, dark, academic
  fontStyle?: string; // sans, serif, mono, rounded
  borderRadius?: string; // none, small, medium, large
  shadowStyle?: string; // none, subtle, medium, strong
}

// 渲染模式类型
type RenderingMode = "html_render" | "hybrid" | "ai_image";

// 内容分析结果
interface ContentAnalysis {
  type: "data_heavy" | "balanced" | "visual_concept";
  language: "zh" | "en" | "mixed";
  complexity: "high" | "medium" | "low";
  reasoning: string;
}

// 模板布局类型
type TemplateLayoutType =
  | "cards"
  | "center_visual"
  | "timeline"
  | "comparison"
  | "pyramid"
  | "radial";

interface PromptEngineeringInsights {
  imagePrompt: string;
  fallbackPrompt?: string;
  backgroundPrompt?: string; // 用于 hybrid 模式的背景生成
  renderingMode: RenderingMode;
  templateLayout: TemplateLayoutType; // 模板布局类型
  contentAnalysis?: ContentAnalysis;
  designJournal: PromptDesignJournalEntry[];
  informationArchitecture: PromptInformationArchitecture;
  visualLanguage: PromptVisualLanguage;
  layoutPlan: string[];
  qualityChecks: string[];
  negativeKeywords: string[];
  styleShiftReasoning: string[];
  inspiration: string[];
}

export interface GeneratedImageResult {
  id: string;
  imageUrl: string;
  prompt: string;
  enhancedPrompt?: string;
  promptInsights?: PromptEngineeringInsights;
  negativePrompt?: string;
  width: number;
  height: number;
  createdAt: string;
  // 处理步骤详情
  processingSteps?: ProcessingStep[];
  extractedContent?: string;
  textModelUsed?: string;
  imageModelUsed?: string;
  // 错误信息
  error?: string;
}

export interface GenerateImageOptions {
  prompt?: string;
  urls?: string[]; // 支持多个URL
  content?: string;
  imageBase64?: string; // 图片 Base64
  files?: Array<{ buffer: Buffer; mimeType: string; filename: string }>; // 上传的文件
  textModelId?: string;
  imageModelId?: string;
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  negativePrompt?: string;
  skipEnhancement?: boolean;
  templateLayout?:
    | "cards"
    | "center_visual"
    | "timeline"
    | "comparison"
    | "pyramid"
    | "radial"; // User-specified template layout (overrides AI selection)
  userId?: string;
}

// Prompt enhancement system for consulting-style infographics
// Optimized for Imagen 4 (Nano Banana Pro) with smart layout detection
// Supports 3 rendering modes: html_render, hybrid, ai_image
const PROMPT_ENHANCEMENT_SYSTEM = `You are an expert infographic designer. Analyze the provided material and respond with a single JSON object.

## STEP 1: CONTENT ANALYSIS & TEMPLATE SELECTION

First, analyze the content type and select the optimal rendering mode AND template layout:

**rendering_mode: "html_render"** - Use when:
- Content has many structured data points, statistics, or metrics
- Accuracy of text/numbers is critical
- Content is a report, analysis, comparison, or data summary
- Chinese text with complex characters needs precise rendering
- Examples: Financial reports, research papers, product specs, tutorials

**rendering_mode: "hybrid"** - Use when:
- Content needs both accurate text AND visual appeal
- Conceptual topics that benefit from illustrative backgrounds
- Marketing/presentation materials with key data
- Examples: Strategy presentations, market overviews, tech summaries

**rendering_mode: "ai_image"** - Use when:
- Content is conceptual, abstract, or artistic
- Visual metaphors are more important than text accuracy
- Simple posters, mood boards, or creative visuals
- Few text elements needed (< 10 words visible)
- Examples: Concept art, mood boards, simple tagline posters

**template_layout** - Choose the best layout based on DEEP CONTENT STRUCTURE ANALYSIS:
- "cards": Grid of equal cards - Best for PARALLEL topics (e.g., 3 stories, 5 features, multiple categories with equal importance)
- "center_visual": Central concept with surrounding points - Best for ONE main idea with supporting details
- "timeline": Sequential flow - Best for processes, steps, chronological events, development stages
- "comparison": Side-by-side - Best for contrasting two options, before/after, pros/cons
- "pyramid": Hierarchical levels - Best for priorities, organizational structure, importance levels
- "radial": Hub and spokes - Best for ecosystems, relationships radiating from a center

## STEP 1.5: DEEP CONTENT STRUCTURE ANALYSIS (CRITICAL!)

Before selecting a template, you MUST deeply analyze the content's logical structure:

1. **Identify the narrative structure**:
   - Is it a speech/presentation with multiple parallel stories? → "cards" (each story = 1 card)
   - Is it explaining a core concept with features around it? → "center_visual"
   - Is it a step-by-step guide or chronological history? → "timeline"
   - Is it comparing two things? → "comparison"

2. **Identify content groupings**:
   - **Main content**: The primary parallel points (should be 2-4 items of EQUAL importance)
   - **Summary/Conclusion**: Final takeaway, call-to-action, or wrap-up point
   - **Supporting details**: Bullets, metrics, examples under each main point

3. **For cards template - CRITICAL**:
   - Main cards should be PARALLEL content of EQUAL logical weight
   - If there's a concluding point that wraps up the others, mark it as "section_type": "summary"
   - Example: Steve Jobs' Stanford speech has 3 PARALLEL stories + 1 conclusion ("Stay Hungry, Stay Foolish")
     → 3 main cards + 1 summary section (NOT 4 equal cards!)

## STEP 2: OUTPUT FORMAT

The JSON must be STRICTLY valid (no markdown fences):
{
  "rendering_mode": "html_render|hybrid|ai_image",
  "template_layout": "cards|center_visual|timeline|comparison|pyramid|radial",
  "content_analysis": {
    "type": "data_heavy|balanced|visual_concept",
    "language": "zh|en|mixed",
    "complexity": "high|medium|low",
    "structure_type": "parallel_stories|sequential_process|central_concept|comparison|hierarchy",
    "main_points_count": 3,
    "has_summary_conclusion": true,
    "reasoning": "string explaining the content structure and why this template was chosen"
  },
  "design_journal": [
    {"title": "string", "narrative": "string"}
  ],
  "information_architecture": {
    "title": "string",
    "subtitle": "string",
    "hero_statement": "string",
    "center_visual_title": "string (for center_visual template - the main concept shown in center)",
    "center_visual_items": ["string (for center_visual template - 4-8 items around the center)"],
    "sections": [
      {
        "title": "string",
        "summary": "string",
        "bullets": ["string"],
        "metrics": [{"label": "string", "value": "string", "comparison": "string"}],
        "visual": {"type": "icon|chart|timeline|process", "description": "string"},
        "icon_type": "target|chart|briefcase|shield|lightbulb|gear|users|globe|clock|trending|star|check",
        "section_type": "main|summary"
      }
    ],
    "call_to_action": "string"
  },
  "layout_plan": ["string"],
  "visual_language": {
    "color_palette": ["#1e3a5f", "#0891b2", "#f8fafc", "#334155"],
    "primary_color": "#1e3a5f",
    "accent_color": "#0891b2",
    "background_color": "#f7f9fc",
    "text_color": "#1a202c",
    "typography": "string",
    "iconography": "string",
    "chart_style": "string",
    "background": "string",
    "grid_system": "string",
    "design_style": "consulting|tech|minimal|creative|dark|academic|business",
    "font_style": "sans|serif|mono|rounded",
    "border_radius": "none|small|medium|large",
    "shadow_style": "none|subtle|medium|strong"
  },
  "quality_checks": ["string"],
  "negative_keywords": ["string"],
  "final_prompt": "string",
  "fallback_prompt": "string",
  "background_prompt": "string (only for hybrid mode - describes decorative background)"
}

## CRITICAL GUIDELINES:

1. **DEEP CONTENT STRUCTURE ANALYSIS IS MANDATORY**:
   - ALWAYS analyze the logical structure of content before selecting a template
   - Identify: parallel points vs sequential vs hierarchical vs comparative
   - Mark sections with "section_type": "main" or "summary"
   - Set "main_points_count" and "has_summary_conclusion" in content_analysis

2. **TEMPLATE SELECTION - THINK BEFORE CHOOSING**:
   - DON'T just count sections and pick a template
   - DO analyze the semantic relationship between sections
   - "cards": Only for truly PARALLEL content of EQUAL importance
     - If one section is a conclusion/summary of others → mark it as "section_type": "summary"
   - "center_visual": ONE central concept with 4-8 supporting FEATURES/CAPABILITIES
     - MUST provide center_visual_title and center_visual_items
   - "timeline": SEQUENTIAL content with clear temporal/logical order
   - "comparison": TWO distinct things being CONTRASTED

3. **SECTION CLASSIFICATION** (for cards template):
   - "section_type": "main" → Equal-weight parallel content (displayed as uniform cards)
   - "section_type": "summary" → Conclusion, call-to-action, or wrap-up (displayed differently)
   - Example analysis:
     - Input: Steve Jobs Stanford speech
     - Structure: 3 parallel stories + 1 concluding message
     - Output: sections[0-2] with section_type="main", sections[3] with section_type="summary"

4. **LANGUAGE - EXTREMELY IMPORTANT**:
   - Detect the language of the user's prompt/request (NOT the source content)
   - If user writes in Chinese, output ALL text in Chinese
   - If user writes in English, output ALL text in English
   - This includes: title, subtitle, hero_statement, section titles, bullets, metrics labels, call_to_action, center_visual_title, center_visual_items

4. **DESIGN JOURNAL**: 3-5 entries documenting your design reasoning process.

5. **INFORMATION ARCHITECTURE**: Extract 4-6 key sections from the content. Each section needs:
   - Clear title (short, impactful) - DO NOT truncate, use complete text
   - 2-4 bullet points with specific data/facts - DO NOT truncate, use complete sentences
   - Relevant metrics with numbers
   - icon_type: one of [target, chart, briefcase, shield, lightbulb, gear, users, globe, clock, trending, star, check]

6. **VISUAL LANGUAGE & STYLE DETECTION**:
   Detect user's style preferences from the prompt and set design_style accordingly:
   - "consulting" (default): McKinsey/BCG style, navy blue (#1e3a5f), professional
   - "tech": Modern tech feel, purple/cyan (#6366f1, #22d3ee), gradients
   - "minimal": Black/white (#18181b), lots of whitespace, subtle
   - "creative": Vibrant colors (#ec4899, #f59e0b), playful, rounded
   - "dark": Dark background (#0f172a), light text, modern
   - "academic": Formal, serif fonts, traditional colors (#1e40af)
   - "business": Business minimal, gray/blue (#374151, #3b82f6), clean professional

   Keywords to detect:
   - "科技/tech/modern/futuristic" → tech style
   - "简约/minimal/clean/simple" → minimal style
   - "创意/creative/colorful/fun" → creative style
   - "暗黑/dark/night" → dark style
   - "学术/academic/formal/traditional" → academic style
   - "商务/business/corporate/professional" → business style

7. **FINAL PROMPT**: For ai_image/hybrid modes, must include:
   - "professional consulting infographic"
   - "2D flat design illustration"
   - "clean geometric shapes"
   - "NO 3D rendering, NO photorealistic"

8. **BACKGROUND PROMPT**: For hybrid mode only - describe a decorative background that complements but doesn't overpower the text.

9. **NEGATIVE KEYWORDS**: Always include: 3D render, photorealistic, neon glow, gradient mesh, painterly, artistic, abstract, futuristic sci-fi, dark moody, cinematic lighting, depth of field, bokeh, text, typography, letters, words, numbers

10. Respond ONLY with the JSON object.`;

// Note: Interface definitions are at the top of the file (lines 22-97)
// Do not duplicate them here

import {
  InfographicTemplateService,
  InfographicContent,
  InfographicSection,
} from "./infographic-template.service";

@Injectable()
export class AiImageService {
  private readonly logger = new Logger(AiImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly infographicTemplate: InfographicTemplateService,
  ) {}

  private createDefaultInsights(basePrompt: string): PromptEngineeringInsights {
    return {
      imagePrompt: (basePrompt || "").trim(),
      fallbackPrompt: undefined,
      backgroundPrompt: undefined,
      renderingMode: "html_render", // 默认使用 HTML 渲染模式以确保文字精确
      templateLayout: "cards", // 默认卡片网格布局
      contentAnalysis: undefined,
      designJournal: [],
      informationArchitecture: {
        title: undefined,
        subtitle: undefined,
        heroStatement: undefined,
        centerVisualTitle: undefined,
        centerVisualItems: undefined,
        sections: [],
        callToAction: undefined,
      },
      visualLanguage: {
        colorPalette: [],
        primaryColor: "#1e3a5f", // 深蓝灰 - 专业稳重
        accentColor: "#0891b2", // 冷青色 - 现代科技感
        backgroundColor: "#f8fafc", // 浅灰白 - 干净背景
        textColor: "#334155", // 深灰 - 易读文字
        templateLayout: "cards",
        typography: undefined,
        iconography: undefined,
        chartStyle: undefined,
        background: undefined,
        gridSystem: undefined,
      },
      layoutPlan: [],
      qualityChecks: [],
      negativeKeywords: [],
      styleShiftReasoning: [],
      inspiration: [],
    };
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return undefined;
  }

  private parsePromptEnhancementResponse(
    raw: string,
    fallbackPrompt: string,
  ): PromptEngineeringInsights {
    if (!raw || !raw.trim()) {
      return this.createDefaultInsights(fallbackPrompt);
    }

    let payload = raw.trim();
    const fencedMatch = payload.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      payload = fencedMatch[1].trim();
    }

    const toArray = (value: unknown): string[] => {
      if (value === undefined || value === null) {
        return [];
      }
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            if (typeof item === "string") {
              return item.trim();
            }
            if (typeof item === "number" || typeof item === "boolean") {
              return String(item);
            }
            return "";
          })
          .filter((item) => item.length > 0);
      }
      if (typeof value === "string") {
        return value
          .split(/[\r\n;,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return [String(value)];
      }
      return [];
    };

    try {
      const parsed = JSON.parse(payload);
      this.logger.debug(
        `[PromptEnhancement] Successfully parsed JSON. Keys: ${Object.keys(parsed).join(", ")}`,
      );
      const insights = this.createDefaultInsights(fallbackPrompt);

      insights.imagePrompt =
        this.normalizeString(
          parsed.final_prompt ?? parsed.image_prompt ?? parsed.imagePrompt,
        ) || fallbackPrompt;
      insights.fallbackPrompt = this.normalizeString(
        parsed.fallback_prompt ??
          parsed.backup_prompt ??
          parsed.alternate_prompt,
      );
      insights.backgroundPrompt = this.normalizeString(
        parsed.background_prompt ?? parsed.backgroundPrompt,
      );

      // 解析渲染模式
      const renderingModeRaw = this.normalizeString(
        parsed.rendering_mode ?? parsed.renderingMode,
      );
      if (
        renderingModeRaw === "html_render" ||
        renderingModeRaw === "hybrid" ||
        renderingModeRaw === "ai_image"
      ) {
        insights.renderingMode = renderingModeRaw;
      } else {
        // 默认根据内容类型推断
        insights.renderingMode = "html_render";
      }

      // 解析模板布局类型
      const templateLayoutRaw = this.normalizeString(
        parsed.template_layout ?? parsed.templateLayout,
      );
      const validTemplateLayouts: TemplateLayoutType[] = [
        "cards",
        "center_visual",
        "timeline",
        "comparison",
        "pyramid",
        "radial",
      ];
      if (
        templateLayoutRaw &&
        validTemplateLayouts.includes(templateLayoutRaw as TemplateLayoutType)
      ) {
        insights.templateLayout = templateLayoutRaw as TemplateLayoutType;
        this.logger.log(
          `[parsePromptEngineeringResponse] AI selected template: ${templateLayoutRaw}`,
        );
      } else {
        insights.templateLayout = "cards";
        this.logger.warn(
          `[parsePromptEngineeringResponse] Invalid or missing template_layout: "${templateLayoutRaw}", using default "cards"`,
        );
      }

      // 解析内容分析
      const contentAnalysisRaw =
        parsed.content_analysis ?? parsed.contentAnalysis;
      if (contentAnalysisRaw && typeof contentAnalysisRaw === "object") {
        insights.contentAnalysis = {
          type: contentAnalysisRaw.type || "balanced",
          language: contentAnalysisRaw.language || "zh",
          complexity: contentAnalysisRaw.complexity || "medium",
          reasoning:
            this.normalizeString(contentAnalysisRaw.reasoning) ||
            "Auto-detected content type",
        };
      }

      const designJournalRaw = parsed.design_journal ?? parsed.designJournal;
      if (Array.isArray(designJournalRaw)) {
        insights.designJournal = designJournalRaw
          .map((entry: any, index: number): PromptDesignJournalEntry | null => {
            if (entry && typeof entry === "object") {
              const title =
                this.normalizeString(entry.title) || `Step ${index + 1}`;
              const narrative =
                this.normalizeString(entry.narrative) ??
                this.normalizeString(entry.description) ??
                this.normalizeString(entry.text);
              if (narrative) {
                return { title, narrative };
              }
              return null;
            }
            if (typeof entry === "string") {
              return { title: `Step ${index + 1}`, narrative: entry.trim() };
            }
            return null;
          })
          .filter((entry): entry is PromptDesignJournalEntry => entry !== null);
      }

      const infoRaw =
        parsed.information_architecture ?? parsed.informationArchitecture ?? {};
      const sectionsRaw = Array.isArray(infoRaw.sections)
        ? infoRaw.sections
        : [];
      const sections: PromptSection[] = sectionsRaw.map((section: any) => ({
        title: this.normalizeString(section.title),
        summary: this.normalizeString(section.summary ?? section.description),
        bullets: toArray(section.bullets ?? section.points),
        metrics: Array.isArray(section.metrics)
          ? section.metrics
              .map((metric: any) => ({
                label: this.normalizeString(metric.label) || undefined,
                value: this.normalizeString(metric.value) || undefined,
                comparison:
                  this.normalizeString(metric.comparison ?? metric.delta) ||
                  undefined,
              }))
              .filter((metric: { label?: string; value?: string }) =>
                Boolean(metric.label || metric.value),
              )
          : [],
        visual:
          section.visual || section.chart
            ? {
                type: this.normalizeString(
                  section.visual?.type ?? section.chart?.type,
                ),
                description: this.normalizeString(
                  section.visual?.description ?? section.chart?.description,
                ),
              }
            : undefined,
        iconType: this.normalizeString(
          section.icon_type ?? section.iconType ?? section.icon,
        ),
        sectionType:
          section.section_type === "summary" ||
          section.sectionType === "summary"
            ? "summary"
            : "main",
      }));

      insights.informationArchitecture = {
        title: this.normalizeString(infoRaw.title),
        subtitle: this.normalizeString(infoRaw.subtitle),
        heroStatement: this.normalizeString(
          infoRaw.hero_statement ?? infoRaw.heroStatement ?? infoRaw.tagline,
        ),
        centerVisualTitle: this.normalizeString(
          infoRaw.center_visual_title ?? infoRaw.centerVisualTitle,
        ),
        centerVisualItems: toArray(
          infoRaw.center_visual_items ?? infoRaw.centerVisualItems,
        ),
        sections,
        callToAction: this.normalizeString(
          infoRaw.call_to_action ?? infoRaw.callToAction,
        ),
      };

      const visualRaw = parsed.visual_language ?? parsed.visualLanguage ?? {};
      insights.visualLanguage = {
        colorPalette: toArray(
          visualRaw.color_palette ?? visualRaw.colorPalette,
        ),
        primaryColor:
          this.normalizeString(
            visualRaw.primary_color ?? visualRaw.primaryColor,
          ) || "#1e3a5f",
        accentColor:
          this.normalizeString(
            visualRaw.accent_color ?? visualRaw.accentColor,
          ) || "#0891b2",
        backgroundColor:
          this.normalizeString(
            visualRaw.background_color ?? visualRaw.backgroundColor,
          ) || "#f7f9fc",
        textColor:
          this.normalizeString(visualRaw.text_color ?? visualRaw.textColor) ||
          "#1a202c",
        typography: this.normalizeString(visualRaw.typography),
        iconography: this.normalizeString(visualRaw.iconography),
        chartStyle: this.normalizeString(
          visualRaw.chart_style ?? visualRaw.chartStyle,
        ),
        background: this.normalizeString(visualRaw.background),
        gridSystem: this.normalizeString(
          visualRaw.grid_system ?? visualRaw.gridSystem,
        ),
        // 新增风格字段
        designStyle: this.normalizeString(
          visualRaw.design_style ?? visualRaw.designStyle,
        ),
        fontStyle: this.normalizeString(
          visualRaw.font_style ?? visualRaw.fontStyle,
        ),
        borderRadius: this.normalizeString(
          visualRaw.border_radius ?? visualRaw.borderRadius,
        ),
        shadowStyle: this.normalizeString(
          visualRaw.shadow_style ?? visualRaw.shadowStyle,
        ),
      };

      insights.layoutPlan = toArray(parsed.layout_plan ?? parsed.layoutPlan);
      insights.qualityChecks = toArray(
        parsed.quality_checks ?? parsed.qualityChecks,
      );
      insights.negativeKeywords = toArray(
        parsed.negative_keywords ??
          parsed.negativeKeywords ??
          parsed.negative_prompt ??
          parsed.negativeTerms,
      );
      insights.inspiration = toArray(parsed.inspiration ?? parsed.references);

      const legacyStyle = toArray(
        parsed.style_shift_reasoning ?? parsed.styleShiftReasoning,
      );
      if (legacyStyle.length > 0) {
        insights.styleShiftReasoning = legacyStyle;
      } else if (insights.designJournal.length > 0) {
        insights.styleShiftReasoning = insights.designJournal.map(
          (entry) => entry.narrative,
        );
      }

      if (!insights.imagePrompt || insights.imagePrompt.length < 5) {
        insights.imagePrompt = fallbackPrompt;
      }

      return insights;
    } catch (error) {
      this.logger.warn(
        `[PromptEnhancement] Failed to parse structured response, falling back to raw prompt: ${error}`,
      );
      return this.createDefaultInsights(fallbackPrompt);
    }
  }

  private composeFinalImagePrompt(
    insights: PromptEngineeringInsights,
    style?: string,
  ): { prompt: string; negativeCandidates: string[] } {
    const info = insights.informationArchitecture;
    const visual = insights.visualLanguage;

    // Build structured content description
    const contentParts: string[] = [];

    // Main title
    if (info.title) {
      contentParts.push(`Main headline: "${info.title}"`);
    }
    if (info.subtitle) {
      contentParts.push(`Subheadline: "${info.subtitle}"`);
    }

    // Build section descriptions with icons
    const sectionDescriptions: string[] = [];
    info.sections.forEach((section, index) => {
      const parts: string[] = [];
      if (section.title) {
        parts.push(`"${section.title}"`);
      }
      if (section.bullets.length > 0) {
        parts.push(`with ${section.bullets.length} bullet points`);
      }
      if (section.metrics.length > 0) {
        const metricStr = section.metrics
          .slice(0, 2)
          .map((m) => m.value || m.label)
          .join(", ");
        parts.push(`showing metrics: ${metricStr}`);
      }
      if (section.visual?.type) {
        parts.push(`with ${section.visual.type} icon`);
      }
      if (parts.length > 0) {
        sectionDescriptions.push(`Section ${index + 1}: ${parts.join(" ")}`);
      }
    });

    if (sectionDescriptions.length > 0) {
      contentParts.push(`Content sections:\n${sectionDescriptions.join("\n")}`);
    }

    // Build visual style description
    const styleDescriptions: string[] = [];
    if (visual.colorPalette.length > 0) {
      styleDescriptions.push(
        `Colors: ${visual.colorPalette.slice(0, 4).join(", ")}`,
      );
    }
    if (visual.background) {
      styleDescriptions.push(`Background: ${visual.background}`);
    }
    if (insights.layoutPlan.length > 0) {
      styleDescriptions.push(
        `Layout: ${insights.layoutPlan.slice(0, 2).join("; ")}`,
      );
    }

    // Compose the final prompt with mandatory infographic keywords
    const mandatoryPrefix = `Professional consulting infographic, McKinsey BCG style visual summary, 2D flat design illustration, multi-column grid layout with numbered sections and icons, clean sans-serif typography, navy blue and gold color scheme on light gray background.`;

    const mandatorySuffix = `Style: Corporate presentation quality, executive briefing format, clean geometric shapes, flat color fills, consistent icon set, clear visual hierarchy, print-ready resolution. NO 3D rendering, NO photorealistic elements, NO AI art style, NO neon glow, NO dark moody lighting, NO cinematic effects.`;

    const promptParts = [
      mandatoryPrefix,
      insights.imagePrompt.trim(),
      contentParts.length > 0 ? contentParts.join("\n") : undefined,
      styleDescriptions.length > 0 ? styleDescriptions.join(". ") : undefined,
      mandatorySuffix,
    ].filter((part): part is string => Boolean(part));

    const combined = promptParts.join("\n\n");
    const finalPrompt = this.addStyleToPrompt(combined, style);

    // Enhanced negative keywords for infographic quality
    const enhancedNegatives = [
      ...insights.negativeKeywords,
      "3D render",
      "photorealistic",
      "neon glow",
      "gradient mesh",
      "painterly",
      "artistic",
      "abstract",
      "futuristic sci-fi",
      "dark moody",
      "cinematic lighting",
      "depth of field",
      "bokeh",
      "lens flare",
      "motion blur",
      "hyperrealistic",
      "oil painting",
      "watercolor",
      "sketch",
      "graffiti",
    ];

    return {
      prompt: finalPrompt.trim(),
      negativeCandidates: enhancedNegatives,
    };
  }

  private mergeNegativePrompts(
    base: string | undefined,
    extras: string[],
  ): string | undefined {
    const tokens = new Map<string, string>();

    const addToken = (value: string) => {
      const cleaned = value.trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (!tokens.has(key)) {
        tokens.set(key, cleaned);
      }
    };

    if (base) {
      base
        .split(/[,;\r\n]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .forEach(addToken);
    }

    extras.forEach(addToken);

    // Enhanced negative prompts for consulting-style infographics
    const enforcedNegatives = [
      "ai art style",
      "neon glow",
      "lens flare",
      "3d render",
      "graffiti texture",
      "painterly brushstroke",
      "blurry text",
      "illegible typography",
      "photorealistic",
      "cinematic lighting",
      "depth of field",
      "bokeh",
      "motion blur",
      "dark moody",
      "futuristic sci-fi",
      "abstract art",
      "oil painting",
      "watercolor",
      "sketch style",
      "gradient mesh",
      "hyperrealistic",
      "dramatic shadows",
      "vignette",
      "film grain",
    ];
    enforcedNegatives.forEach(addToken);

    if (tokens.size === 0) {
      return undefined;
    }

    return Array.from(tokens.values()).join(", ");
  }

  private formatListForStep(items: string[]): string | undefined {
    if (!items || items.length === 0) {
      return undefined;
    }
    return items.map((item) => `- ${item}`).join("\n");
  }

  private formatInformationArchitectureStep(
    info: PromptInformationArchitecture,
  ): string | undefined {
    const lines: string[] = [];
    if (info.title) {
      lines.push(`Title: ${info.title}`);
    }
    if (info.subtitle) {
      lines.push(`Subtitle: ${info.subtitle}`);
    }
    if (info.heroStatement) {
      lines.push(`Hero statement: ${info.heroStatement}`);
    }
    info.sections.forEach((section, index) => {
      const sectionTitle = section.title || `Section ${index + 1}`;
      const details: string[] = [];
      if (section.summary) {
        details.push(section.summary);
      }
      if (section.bullets.length > 0) {
        details.push(`Bullets: ${section.bullets.join(", ")}`);
      }
      if (section.metrics.length > 0) {
        details.push(
          `Metrics: ${section.metrics
            .map((metric) => {
              const value = metric.value ? `${metric.value}` : "";
              const comparison = metric.comparison
                ? ` (${metric.comparison})`
                : "";
              return `${metric.label || "Metric"} ${value}${comparison}`.trim();
            })
            .join("; ")}`,
        );
      }
      if (section.visual?.description || section.visual?.type) {
        details.push(
          `Visual: ${section.visual?.type || "chart"} – ${
            section.visual?.description || ""
          }`,
        );
      }
      lines.push(`${sectionTitle}: ${details.join(" | ")}`);
    });
    if (info.callToAction) {
      lines.push(`Call to action: ${info.callToAction}`);
    }
    return lines.length > 0 ? lines.join("\n") : undefined;
  }

  /**
   * 获取所有可用模型（文本模型 + 图片模型）
   * 使用 modelType 字段进行筛选，确保返回正确类型的模型
   */
  async getAvailableModels() {
    // 获取文本模型 - 使用 modelType = CHAT
    const textModels = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        icon: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    // 获取图片生成模型 - 使用 modelType = IMAGE_GENERATION
    const imageModels = await this.prisma.aIModel.findMany({
      where: {
        isEnabled: true,
        modelType: AIModelType.IMAGE_GENERATION,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        provider: true,
        modelId: true,
        icon: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    this.logger.log(
      `[getAvailableModels] Found ${textModels.length} CHAT models, ${imageModels.length} IMAGE_GENERATION models`,
    );

    return {
      textModels: textModels.map((m) => ({
        id: m.id,
        name: m.displayName || m.name,
        provider: m.provider,
        modelId: m.modelId,
        icon: m.icon,
        isDefault: m.isDefault,
      })),
      imageModels: imageModels.map((m) => ({
        id: m.id,
        name: m.displayName || m.name,
        provider: m.provider,
        modelId: m.modelId,
        icon: m.icon,
        isDefault: m.isDefault,
      })),
    };
  }

  /**
   * SSE 流式生成图片 - 实时推送处理进度
   * 返回 Observable，每个步骤完成时发送事件
   */
  generateImageStream(options: GenerateImageOptions): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // 异步执行生成流程
    this.executeStreamGeneration(options, subject).catch((error) => {
      this.logger.error(`Stream generation error: ${error.message}`);
      subject.next({
        data: JSON.stringify({
          type: "error",
          error: error.message,
        }),
      });
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * 执行流式生成的内部方法
   */
  private async executeStreamGeneration(
    options: GenerateImageOptions,
    subject: Subject<MessageEvent>,
  ): Promise<void> {
    const {
      prompt,
      urls,
      content,
      imageBase64,
      files,
      imageModelId,
      style,
      aspectRatio,
      negativePrompt,
      skipEnhancement,
      templateLayout: userTemplateLayout, // User-specified template (overrides AI)
      userId,
    } = options;

    let mergedNegativePrompt = negativePrompt
      ? negativePrompt.trim()
      : undefined;
    const processingSteps: ProcessingStep[] = [];

    // 发送步骤更新的辅助函数
    const emitStep = (
      stepId: string,
      title: string,
      status: ProcessingStep["status"],
      stepContent?: string,
    ) => {
      const step: ProcessingStep = {
        step: stepId,
        title,
        status,
        content: stepContent,
        timestamp: new Date().toISOString(),
      };

      // 更新本地记录
      const existing = processingSteps.find((s) => s.step === stepId);
      if (existing) {
        Object.assign(existing, step);
      } else {
        processingSteps.push(step);
      }

      // 发送 SSE 事件
      subject.next({
        data: JSON.stringify({
          type: "step",
          step,
          allSteps: processingSteps,
        }),
      });
    };

    try {
      // 验证输入
      const hasUrls = urls && urls.length > 0 && urls.some((u) => u.trim());
      const hasFiles = files && files.length > 0;
      if (!prompt && !hasUrls && !content && !imageBase64 && !hasFiles) {
        throw new BadRequestException("At least one input is required");
      }

      // ============================================================
      // 步骤1: 内容提取
      // ============================================================
      this.logger.log(
        "========== STREAM STEP 1: Content Extraction ==========",
      );
      const contentParts: string[] = [];

      if (prompt) {
        contentParts.push(`User prompt: ${prompt}`);
        emitStep("prompt_input", "User Prompt Received", "completed", prompt);
      }

      if (hasUrls) {
        for (const urlInput of urls!) {
          if (!urlInput.trim()) continue;

          const trimmedInput = urlInput.trim();
          const urlMatch = trimmedInput.match(
            /^(https?:\/\/\S+)(?:\s+(.*))?$/i,
          );
          let trimmedUrl: string;
          let userDescription: string | null = null;

          if (urlMatch) {
            trimmedUrl = urlMatch[1];
            userDescription = urlMatch[2]?.trim() || null;
          } else {
            trimmedUrl = trimmedInput;
          }

          const isYouTube =
            trimmedUrl.includes("youtube.com") ||
            trimmedUrl.includes("youtu.be");
          const isBilibili = trimmedUrl.includes("bilibili.com");
          const stepId = `url_${Date.now()}`;
          const stepTitle = isYouTube
            ? "Extracting YouTube Subtitles"
            : isBilibili
              ? "Extracting Bilibili Content"
              : "Extracting Web Content";

          emitStep(stepId, stepTitle, "processing", trimmedUrl);

          try {
            const urlContent =
              await this.contentExtractor.extractFromUrl(trimmedUrl);
            const cleanContent = urlContent.replace(/\[.*?\]/g, "").trim();

            if (cleanContent.length < 50) {
              emitStep(
                stepId,
                `${stepTitle} - Failed`,
                "error",
                `Insufficient content (${cleanContent.length} chars)`,
              );
              throw new Error(
                `Failed to extract sufficient content from ${trimmedUrl}`,
              );
            }

            contentParts.push(`Content from ${trimmedUrl}:\n${urlContent}`);
            if (userDescription) {
              contentParts.push(`User instruction: ${userDescription}`);
            }

            emitStep(
              stepId,
              isYouTube
                ? "YouTube Content Extracted"
                : isBilibili
                  ? "Bilibili Content Extracted"
                  : "Web Content Extracted",
              "completed",
              urlContent.slice(0, 500) + (urlContent.length > 500 ? "..." : ""),
            );
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            emitStep(stepId, `${stepTitle} - Failed`, "error", errorMsg);
            throw error;
          }
        }
      }

      if (content) {
        contentParts.push(`Text content:\n${content}`);
        emitStep(
          "text_content",
          "Text Content Received",
          "completed",
          content.slice(0, 300) + "...",
        );
      }

      if (hasFiles) {
        for (const file of files!) {
          const stepId = `file_${file.filename}`;
          emitStep(stepId, `Processing ${file.filename}`, "processing");

          try {
            const fileContent = await this.contentExtractor.extractFromFile(
              file.buffer,
              file.mimeType,
              file.filename,
            );
            contentParts.push(
              `Content from file "${file.filename}":\n${fileContent}`,
            );
            emitStep(
              stepId,
              `Extracted from ${file.filename}`,
              "completed",
              fileContent.slice(0, 300) + "...",
            );
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            emitStep(
              stepId,
              `Failed to process ${file.filename}`,
              "error",
              errorMsg,
            );
            throw error;
          }
        }
      }

      if (imageBase64) {
        emitStep(
          "image_reference",
          "Reference Image Prepared",
          "completed",
          "Image will be used as reference",
        );
      }

      const inputContent = contentParts.join("\n\n---\n\n");
      emitStep(
        "content_check",
        "Content Extraction Complete",
        "completed",
        `${inputContent.length} characters`,
      );

      // ============================================================
      // 步骤2: AI Prompt 生成
      // ============================================================
      this.logger.log(
        "========== STREAM STEP 2: AI Prompt Generation ==========",
      );
      let textModelUsed: string | undefined;
      let promptInsights = this.createDefaultInsights(inputContent);

      if (!skipEnhancement) {
        emitStep(
          "prompt_generate",
          "Generating Image Prompt with AI",
          "processing",
        );

        const textModel = await this.getDefaultTextModel();
        if (!textModel || !textModel.apiKey) {
          emitStep(
            "prompt_generate",
            "No Text Model Available",
            "error",
            "Please configure a text model",
          );
          throw new Error("No text model configured");
        }

        textModelUsed = textModel.displayName || textModel.name;
        emitStep("prompt_generate", `Using ${textModelUsed}`, "processing");

        const provider = textModel.provider.toLowerCase();
        const modelId = textModel.modelId.toLowerCase();
        let rawEnhancedPrompt: string;

        if (
          provider.includes("google") ||
          provider.includes("gemini") ||
          modelId.includes("gemini")
        ) {
          rawEnhancedPrompt = await this.callGeminiTextAPI(
            textModel.apiKey,
            textModel.modelId,
            inputContent,
          );
        } else {
          rawEnhancedPrompt = await this.callOpenAITextAPI(
            textModel.apiKey,
            textModel.apiEndpoint,
            textModel.modelId,
            inputContent,
          );
        }

        promptInsights = this.parsePromptEnhancementResponse(
          rawEnhancedPrompt,
          inputContent,
        );
        emitStep(
          "prompt_generate",
          "AI Prompt Generated",
          "completed",
          promptInsights.imagePrompt?.slice(0, 200) + "...",
        );
      } else {
        textModelUsed = "Direct Input";
        emitStep("prompt_generate", "Using Direct Input", "completed");
      }

      const composedPrompt = this.composeFinalImagePrompt(
        promptInsights,
        style,
      );
      const enhancedPrompt = composedPrompt.prompt;
      mergedNegativePrompt = this.mergeNegativePrompts(
        mergedNegativePrompt,
        composedPrompt.negativeCandidates,
      );

      // 发送 prompt insights
      subject.next({
        data: JSON.stringify({
          type: "insights",
          textModelUsed,
          imagePrompt: enhancedPrompt,
          informationArchitecture: promptInsights.informationArchitecture,
          renderingMode: promptInsights.renderingMode,
        }),
      });

      // ============================================================
      // 步骤3: 图片生成
      // ============================================================
      this.logger.log("========== STREAM STEP 3: Image Generation ==========");
      const dimensions = this.getDimensions(aspectRatio || "1:1");
      let generatedImageUrl: string | undefined;
      let imageModelUsed: string = "HTML Renderer";

      const renderingMode = promptInsights.renderingMode;

      if (renderingMode === "html_render" || renderingMode === "hybrid") {
        emitStep(
          "html_render",
          renderingMode === "hybrid"
            ? "Generating HTML Infographic with AI Background"
            : "Generating HTML Infographic",
          "processing",
        );

        try {
          // Override template if user specified one
          if (userTemplateLayout) {
            promptInsights.templateLayout = userTemplateLayout;
            this.logger.log(
              `[executeStreamGeneration] User overrode template to: ${userTemplateLayout}`,
            );
          }

          const infographicContent =
            this.convertToInfographicContent(promptInsights);
          let backgroundImageBase64: string | undefined;

          if (renderingMode === "hybrid") {
            emitStep(
              "background_gen",
              "Generating AI Background",
              "processing",
            );
            const imageModelConfig = imageModelId
              ? await this.getModelById(imageModelId)
              : await this.getDefaultImageModel();

            if (imageModelConfig && imageModelConfig.apiKey) {
              try {
                const bgPrompt =
                  promptInsights.backgroundPrompt ||
                  "Abstract professional background, subtle geometric patterns, gradient, modern, clean";
                backgroundImageBase64 = await this.callImageGenerationAPI(
                  imageModelConfig,
                  bgPrompt,
                  dimensions,
                  mergedNegativePrompt,
                );
                imageModelUsed =
                  imageModelConfig.displayName || imageModelConfig.name;
                emitStep(
                  "background_gen",
                  "AI Background Generated",
                  "completed",
                );
              } catch (bgError) {
                this.logger.warn(`Background generation failed: ${bgError}`);
                emitStep(
                  "background_gen",
                  "Background Generation Skipped",
                  "completed",
                  "Continuing without AI background",
                );
              }
            }
          }

          generatedImageUrl =
            await this.infographicTemplate.generateInfographic(
              infographicContent,
              {
                width: dimensions.width,
                height: dimensions.height,
                backgroundImageBase64,
              },
            );

          emitStep(
            "html_render",
            "HTML Infographic Generated Successfully",
            "completed",
          );
        } catch (htmlError) {
          this.logger.warn(
            `HTML rendering failed: ${htmlError}, falling back to AI image`,
          );
          emitStep(
            "html_render",
            "HTML Rendering Failed - Falling back to AI",
            "error",
          );
        }
      }

      if (!generatedImageUrl) {
        emitStep("ai_image", "Generating Image with AI", "processing");

        const imageModelConfig = imageModelId
          ? await this.getModelById(imageModelId)
          : await this.getDefaultImageModel();

        if (!imageModelConfig || !imageModelConfig.apiKey) {
          emitStep("ai_image", "No Image Model Available", "error");
          throw new Error("No image model configured");
        }

        imageModelUsed = imageModelConfig.displayName || imageModelConfig.name;
        emitStep("ai_image", `Using ${imageModelUsed}`, "processing");

        generatedImageUrl = await this.callImageGenerationAPI(
          imageModelConfig,
          enhancedPrompt,
          dimensions,
          mergedNegativePrompt,
        );
        emitStep("ai_image", "AI Image Generated Successfully", "completed");
      }

      // 保存到数据库
      emitStep("save", "Saving to Database", "processing");

      const actuallyUsedAI = imageModelUsed !== "HTML Renderer";
      const providerName = actuallyUsedAI
        ? "AI_IMAGE"
        : renderingMode === "html_render"
          ? "HTML_RENDER"
          : renderingMode === "hybrid"
            ? "HTML_RENDER_WITH_AI_BACKGROUND"
            : "AI_IMAGE";

      const image = await this.prisma.generatedImage.create({
        data: {
          prompt: inputContent.slice(0, 1000),
          enhancedPrompt,
          style: style || "realistic",
          aspectRatio: aspectRatio || "1:1",
          imageUrl: generatedImageUrl,
          width: dimensions.width,
          height: dimensions.height,
          userId: userId || null,
          provider: providerName,
          // 保存处理详情，用于历史记录显示
          textModelUsed: textModelUsed || null,
          imageModelUsed: imageModelUsed || null,
          processingSteps: processingSteps as any,
          promptInsights: promptInsights as any,
        },
      });

      emitStep("save", "Saved Successfully", "completed");

      // 发送最终结果
      subject.next({
        data: JSON.stringify({
          type: "complete",
          result: {
            id: image.id,
            prompt: inputContent.slice(0, 1000),
            enhancedPrompt,
            imageUrl: generatedImageUrl,
            width: image.width,
            height: image.height,
            createdAt: image.createdAt.toISOString(),
            processingSteps,
            extractedContent: inputContent.slice(0, 2000),
            textModelUsed,
            imageModelUsed,
            promptInsights,
          },
        }),
      });

      subject.complete();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Stream generation failed: ${errorMsg}`);

      subject.next({
        data: JSON.stringify({
          type: "error",
          error: errorMsg,
          processingSteps,
        }),
      });

      subject.complete();
    }
  }

  /**
   * 主方法：生成图片
   * 严格按顺序执行：
   * 1. 内容提取 (必须成功才继续)
   * 2. AI Prompt 生成 (必须成功才继续)
   * 3. 图片生成 (必须成功才返回)
   *
   * 任何一步失败都会中断并返回错误，不会继续执行后续步骤
   */
  async generateImage(
    options: GenerateImageOptions,
  ): Promise<GeneratedImageResult> {
    const {
      prompt,
      urls,
      content,
      imageBase64,
      files,
      imageModelId,
      style,
      aspectRatio,
      negativePrompt,
      skipEnhancement,
      templateLayout: userTemplateLayout, // User-specified template (overrides AI)
      userId,
    } = options;
    let mergedNegativePrompt = negativePrompt
      ? negativePrompt.trim()
      : undefined;

    // 处理步骤记录
    const processingSteps: ProcessingStep[] = [];

    // 更新或添加步骤
    const updateStep = (
      stepId: string,
      title: string,
      status: ProcessingStep["status"],
      stepContent?: string,
    ) => {
      const existing = processingSteps.find((s) => s.step === stepId);
      if (existing) {
        existing.title = title;
        existing.status = status;
        existing.content = stepContent;
        existing.timestamp = new Date().toISOString();
      } else {
        processingSteps.push({
          step: stepId,
          title,
          status,
          content: stepContent,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // 返回错误结果
    const returnError = (errorMsg: string): GeneratedImageResult => {
      this.logger.error(`Image generation stopped: ${errorMsg}`);
      return {
        id: `error-${Date.now()}`,
        imageUrl: "",
        prompt: "",
        width: 512,
        height: 512,
        createdAt: new Date().toISOString(),
        processingSteps,
        error: errorMsg,
      };
    };

    // 验证输入
    const hasUrls = urls && urls.length > 0 && urls.some((u) => u.trim());
    const hasFiles = files && files.length > 0;
    if (!prompt && !hasUrls && !content && !imageBase64 && !hasFiles) {
      updateStep(
        "validation",
        "Input Validation Failed",
        "error",
        "No input provided",
      );
      throw new BadRequestException(
        "At least one input is required: prompt, urls, content, files, or imageBase64",
      );
    }

    // ============================================================
    // 步骤1: 内容提取 (Content Extraction)
    // ============================================================
    this.logger.log("========== STEP 1: Content Extraction ==========");
    const contentParts: string[] = [];

    // 1.1 处理直接输入的提示词
    if (prompt) {
      contentParts.push(`User prompt: ${prompt}`);
      updateStep("prompt_input", "User Prompt Received", "completed", prompt);
      this.logger.log(`User prompt: ${prompt.slice(0, 100)}...`);
    }

    // 1.2 处理 URLs（YouTube、Bilibili、网页）- 必须等待完成
    // 支持 "URL 描述" 格式，例如 "https://example.com 请生成信息图"
    if (hasUrls) {
      for (const urlInput of urls!) {
        if (!urlInput.trim()) continue;

        const trimmedInput = urlInput.trim();

        // 解析 URL 和描述
        // URL 通常以 http:// 或 https:// 开头，找到第一个空格后的内容作为描述
        const urlMatch = trimmedInput.match(/^(https?:\/\/\S+)(?:\s+(.*))?$/i);
        let trimmedUrl: string;
        let userDescription: string | null = null;

        if (urlMatch) {
          trimmedUrl = urlMatch[1];
          userDescription = urlMatch[2]?.trim() || null;
          if (userDescription) {
            this.logger.log(
              `[STEP 1.2] URL with description: "${trimmedUrl}" + "${userDescription}"`,
            );
          }
        } else {
          // 没有匹配到标准 URL 格式，使用原始输入
          trimmedUrl = trimmedInput;
        }

        const isYouTube =
          trimmedUrl.includes("youtube.com") || trimmedUrl.includes("youtu.be");
        const isBilibili = trimmedUrl.includes("bilibili.com");
        const stepId = `url_${Date.now()}`;
        const stepTitle = isYouTube
          ? "Extracting YouTube Subtitles"
          : isBilibili
            ? "Extracting Bilibili Content"
            : "Extracting Web Content";

        updateStep(stepId, stepTitle, "processing", trimmedUrl);
        this.logger.log(`[STEP 1.2] Extracting content from: ${trimmedUrl}`);

        try {
          // 等待内容提取完成
          const urlContent =
            await this.contentExtractor.extractFromUrl(trimmedUrl);

          // 检查提取的内容是否有效
          const cleanContent = urlContent.replace(/\[.*?\]/g, "").trim();
          this.logger.log(
            `[STEP 1.2] Extracted ${cleanContent.length} chars from ${trimmedUrl}`,
          );

          if (cleanContent.length < 50) {
            // 内容太少，标记为失败并中断
            updateStep(
              stepId,
              `${stepTitle} - Failed`,
              "error",
              `Insufficient content extracted (${cleanContent.length} chars). The URL may not be accessible or has no subtitles.`,
            );
            return returnError(
              `Failed to extract sufficient content from ${trimmedUrl}. Only ${cleanContent.length} characters were extracted.`,
            );
          }

          // 内容提取成功
          contentParts.push(`Content from ${trimmedUrl}:\n${urlContent}`);

          // 如果用户提供了描述，添加到内容中以影响 AI 生成
          if (userDescription) {
            contentParts.push(
              `User instruction for this content: ${userDescription}`,
            );
            this.logger.log(
              `[STEP 1.2] Added user description to content: "${userDescription}"`,
            );
          }
          // 构建步骤显示内容
          let stepContent =
            urlContent.slice(0, 500) + (urlContent.length > 500 ? "..." : "");
          if (userDescription) {
            stepContent += `\n\n📝 User instruction: ${userDescription}`;
          }

          updateStep(
            stepId,
            isYouTube
              ? "YouTube Content Extracted"
              : isBilibili
                ? "Bilibili Content Extracted"
                : "Web Content Extracted",
            "completed",
            stepContent,
          );
          this.logger.log(
            `[STEP 1.2] ✓ Successfully extracted content from ${trimmedUrl}`,
          );
        } catch (error) {
          // 提取失败，标记错误并中断
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          updateStep(stepId, `${stepTitle} - Failed`, "error", errorMsg);
          return returnError(
            `Failed to extract content from ${trimmedUrl}: ${errorMsg}`,
          );
        }
      }
    }

    // 1.3 处理直接粘贴的文本内容
    if (content) {
      contentParts.push(`Text content:\n${content}`);
      updateStep(
        "text_content",
        "Text Content Received",
        "completed",
        content.slice(0, 300) + (content.length > 300 ? "..." : ""),
      );
      this.logger.log(
        `[STEP 1.3] ✓ Text content received: ${content.length} chars`,
      );
    }

    // 1.4 处理上传的文件
    if (hasFiles) {
      for (const file of files!) {
        const stepId = `file_${file.filename}`;
        updateStep(stepId, `Processing ${file.filename}`, "processing");
        this.logger.log(`[STEP 1.4] Processing file: ${file.filename}`);

        try {
          const fileContent = await this.contentExtractor.extractFromFile(
            file.buffer,
            file.mimeType,
            file.filename,
          );
          contentParts.push(
            `Content from file "${file.filename}":\n${fileContent}`,
          );
          updateStep(
            stepId,
            `Extracted from ${file.filename}`,
            "completed",
            fileContent.slice(0, 300) + (fileContent.length > 300 ? "..." : ""),
          );
          this.logger.log(`[STEP 1.4] ✓ Extracted from ${file.filename}`);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          updateStep(
            stepId,
            `Failed to process ${file.filename}`,
            "error",
            errorMsg,
          );
          return returnError(
            `Failed to process file ${file.filename}: ${errorMsg}`,
          );
        }
      }
    }

    // 1.5 处理参考图片 (Image-to-Image 模式)
    // 不需要分析图片内容，而是直接将原图作为参考发送给图像生成模型
    if (imageBase64) {
      updateStep(
        "image_reference",
        "Reference Image Prepared",
        "completed",
        "Image will be used as reference for generation",
      );
      this.logger.log(
        `[STEP 1.5] ✓ Reference image prepared for image-to-image generation`,
      );
      // 注意：不添加到 contentParts，原图会直接发送给图像生成模型
    }

    // 检查是否有足够的内容
    const inputContent = contentParts.join("\n\n---\n\n");
    this.logger.log(`[STEP 1] Total content: ${inputContent.length} chars`);

    // 如果用户提供了直接 prompt 或参考图片，跳过最小内容检查
    // 50 字符限制只针对从 URL/文件提取的内容
    const hasDirectPrompt = !!prompt && prompt.trim().length > 0;
    const hasReferenceImage = !!imageBase64;
    if (inputContent.length < 50 && !hasDirectPrompt && !hasReferenceImage) {
      updateStep(
        "content_check",
        "Content Check Failed",
        "error",
        "Insufficient content extracted",
      );
      return returnError("No valid content could be extracted from the input");
    }

    // 如果只有很短的 prompt 且没有其他内容且没有参考图片，也检查一下
    if (inputContent.length < 10 && !hasReferenceImage) {
      updateStep(
        "content_check",
        "Content Check Failed",
        "error",
        "Prompt is too short",
      );
      return returnError("Please provide a more detailed prompt");
    }

    updateStep(
      "content_check",
      "Content Extraction Complete",
      "completed",
      `${inputContent.length} characters`,
    );
    this.logger.log(
      `========== STEP 1 COMPLETE: ${inputContent.length} chars ==========`,
    );
    this.logger.debug(
      `[STEP 1] Input Content Preview: ${inputContent.slice(0, 500)}...`,
    );

    // ============================================================
    // 步骤2: AI Prompt 生成
    // ============================================================
    this.logger.log("========== STEP 2: AI Prompt Generation ==========");
    let textModelUsed: string | undefined;
    let promptInsights = this.createDefaultInsights(inputContent);
    let enhancedPrompt = "";

    if (skipEnhancement) {
      textModelUsed = "Direct Input";
      this.logger.log(`[STEP 2] Using direct input as prompt source`);
    } else {
      updateStep(
        "prompt_generate",
        "Generating Image Prompt with AI",
        "processing",
      );

      try {
        const textModel = await this.getDefaultTextModel();
        if (!textModel || !textModel.apiKey) {
          updateStep(
            "prompt_generate",
            "No Text Model Available",
            "error",
            "Please configure a text model",
          );
          return returnError("No text model configured for prompt enhancement");
        }

        textModelUsed = textModel.displayName || textModel.name;
        this.logger.log(`[STEP 2] Using text model: ${textModelUsed}`);

        const provider = textModel.provider.toLowerCase();
        const modelId = textModel.modelId.toLowerCase();
        let rawEnhancedPrompt: string;

        if (
          provider.includes("google") ||
          provider.includes("gemini") ||
          modelId.includes("gemini")
        ) {
          rawEnhancedPrompt = await this.callGeminiTextAPI(
            textModel.apiKey,
            textModel.modelId,
            inputContent,
          );
        } else {
          rawEnhancedPrompt = await this.callOpenAITextAPI(
            textModel.apiKey,
            textModel.apiEndpoint,
            textModel.modelId,
            inputContent,
          );
        }

        this.logger.debug(
          `[STEP 2] Structured prompt response: ${rawEnhancedPrompt.slice(0, 500)}${
            rawEnhancedPrompt.length > 500 ? "..." : ""
          }`,
        );

        promptInsights = this.parsePromptEnhancementResponse(
          rawEnhancedPrompt,
          inputContent,
        );

        // Debug: Log parsed insights summary
        this.logger.debug(
          `[STEP 2] Parsed promptInsights summary: ` +
            `designJournal=${promptInsights.designJournal.length}, ` +
            `sections=${promptInsights.informationArchitecture.sections.length}, ` +
            `layoutPlan=${promptInsights.layoutPlan.length}, ` +
            `colorPalette=${promptInsights.visualLanguage.colorPalette.length}, ` +
            `qualityChecks=${promptInsights.qualityChecks.length}, ` +
            `negativeKeywords=${promptInsights.negativeKeywords.length}, ` +
            `imagePrompt=${promptInsights.imagePrompt?.slice(0, 100)}...`,
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        updateStep(
          "prompt_generate",
          "Prompt Generation Failed",
          "error",
          errorMsg,
        );
        return returnError(`Failed to generate image prompt: ${errorMsg}`);
      }
    }

    const composedPrompt = this.composeFinalImagePrompt(promptInsights, style);
    enhancedPrompt = composedPrompt.prompt;
    mergedNegativePrompt = this.mergeNegativePrompts(
      mergedNegativePrompt,
      composedPrompt.negativeCandidates,
    );

    updateStep(
      "prompt_generate",
      skipEnhancement
        ? "Using Direct Input"
        : `AI Prompt Generated (${textModelUsed})`,
      "completed",
      enhancedPrompt.slice(0, 500),
    );

    if (promptInsights.designJournal.length > 0) {
      promptInsights.designJournal.forEach((entry, index) => {
        updateStep(
          `prompt_journal_${index + 1}`,
          entry.title || `Design Journal Step ${index + 1}`,
          "completed",
          entry.narrative,
        );
      });
    } else {
      const styleStep = this.formatListForStep(
        promptInsights.styleShiftReasoning,
      );
      if (styleStep) {
        updateStep(
          "prompt_style_shift",
          "Style Transformation Plan",
          "completed",
          styleStep,
        );
      }
    }

    const infoStep = this.formatInformationArchitectureStep(
      promptInsights.informationArchitecture,
    );
    if (infoStep) {
      updateStep(
        "prompt_information",
        "Information Architecture",
        "completed",
        infoStep,
      );
    }

    const layoutStep = this.formatListForStep(promptInsights.layoutPlan);
    if (layoutStep) {
      updateStep("prompt_layout", "Layout Blueprint", "completed", layoutStep);
    }

    const qualityStep = this.formatListForStep(promptInsights.qualityChecks);
    if (qualityStep) {
      updateStep(
        "prompt_quality",
        "Quality Validation",
        "completed",
        qualityStep,
      );
    }

    const designNotes: string[] = [];
    if (promptInsights.visualLanguage.colorPalette.length > 0) {
      designNotes.push(
        `Palette: ${promptInsights.visualLanguage.colorPalette.join(", ")}`,
      );
    }
    if (promptInsights.visualLanguage.typography) {
      designNotes.push(
        `Typography: ${promptInsights.visualLanguage.typography}`,
      );
    }
    if (promptInsights.visualLanguage.background) {
      designNotes.push(
        `Background: ${promptInsights.visualLanguage.background}`,
      );
    }
    if (promptInsights.visualLanguage.iconography) {
      designNotes.push(
        `Iconography: ${promptInsights.visualLanguage.iconography}`,
      );
    }
    if (promptInsights.visualLanguage.chartStyle) {
      designNotes.push(
        `Chart style: ${promptInsights.visualLanguage.chartStyle}`,
      );
    }
    if (promptInsights.visualLanguage.gridSystem) {
      designNotes.push(
        `Grid system: ${promptInsights.visualLanguage.gridSystem}`,
      );
    }

    const designStep = this.formatListForStep(designNotes);
    if (designStep) {
      updateStep("prompt_design", "Design Directives", "completed", designStep);
    }

    const inspirationStep = this.formatListForStep(promptInsights.inspiration);
    if (inspirationStep) {
      updateStep(
        "prompt_inspiration",
        "Reference Inspiration",
        "completed",
        inspirationStep,
      );
    }

    if (mergedNegativePrompt) {
      updateStep(
        "prompt_negative",
        "Negative Keywords",
        "completed",
        mergedNegativePrompt,
      );
    }

    this.logger.log(
      `[STEP 2] Final prompt preview: ${enhancedPrompt.slice(0, 120)}${
        enhancedPrompt.length > 120 ? "..." : ""
      }`,
    );
    this.logger.log("========== STEP 2 COMPLETE ==========");

    // ============================================================
    // 步骤3: 图片生成 (根据 renderingMode 选择方式)
    // ============================================================
    this.logger.log("========== STEP 3: Image Generation ==========");
    this.logger.log(`[STEP 3] Rendering mode: ${promptInsights.renderingMode}`);

    const dimensions = this.getDimensions(aspectRatio || "1:1");
    let generatedImageUrl: string | undefined;
    let imageModelUsed: string = "HTML Renderer";

    // 根据渲染模式选择生成方式
    const renderingMode = promptInsights.renderingMode;

    if (renderingMode === "html_render" || renderingMode === "hybrid") {
      // HTML 渲染模式或混合模式
      updateStep(
        "html_render",
        renderingMode === "hybrid"
          ? "Generating HTML Infographic with AI Background"
          : "Generating HTML Infographic",
        "processing",
      );

      try {
        // Override template if user specified one
        if (userTemplateLayout) {
          promptInsights.templateLayout = userTemplateLayout;
          this.logger.log(
            `[generateImage] User overrode template to: ${userTemplateLayout}`,
          );
        }

        // 转换信息架构为模板内容
        const infographicContent =
          this.convertToInfographicContent(promptInsights);

        let backgroundImageBase64: string | undefined;

        // 混合模式：先生成 AI 背景
        if (renderingMode === "hybrid") {
          const imageModelConfig = imageModelId
            ? await this.getModelById(imageModelId)
            : await this.getDefaultImageModel();

          if (imageModelConfig && imageModelConfig.apiKey) {
            imageModelUsed = `HTML + ${imageModelConfig.displayName || imageModelConfig.name}`;
            updateStep(
              "background_generate",
              `Generating Background with ${imageModelConfig.displayName || imageModelConfig.name}`,
              "processing",
            );

            try {
              // 使用 backgroundPrompt 或默认的装饰性背景提示
              const bgPrompt =
                promptInsights.backgroundPrompt ||
                "Abstract geometric pattern, subtle navy blue and gold gradient, professional corporate background, clean minimal design, no text, no icons, soft lighting, 2D flat illustration";

              backgroundImageBase64 = await this.callImageGenerationAPI(
                imageModelConfig,
                bgPrompt,
                dimensions,
                "text, typography, letters, words, numbers, 3D, photorealistic, faces, people",
              );
              updateStep(
                "background_generate",
                "Background Generated",
                "completed",
              );
            } catch (bgError) {
              this.logger.warn(
                `[STEP 3] Background generation failed, continuing without background: ${bgError}`,
              );
              updateStep(
                "background_generate",
                "Background Generation Skipped",
                "completed",
                "Continuing without AI background",
              );
            }
          }
        }

        // 生成 HTML 信息图
        generatedImageUrl = await this.infographicTemplate.generateInfographic(
          infographicContent,
          {
            width: dimensions.width,
            height: dimensions.height,
            backgroundImageBase64,
          },
        );

        updateStep(
          "html_render",
          "HTML Infographic Generated Successfully",
          "completed",
        );
        this.logger.log(`[STEP 3] ✓ HTML infographic generated successfully`);
      } catch (htmlError) {
        const errorMsg =
          htmlError instanceof Error ? htmlError.message : "Unknown error";
        this.logger.warn(
          `[STEP 3] HTML rendering failed, falling back to AI image: ${errorMsg}`,
        );
        updateStep(
          "html_render",
          "HTML Rendering Failed - Falling back to AI",
          "completed",
          errorMsg,
        );
        // 不返回错误，继续使用 AI 图片模式作为回退
      }
    }

    // 如果 HTML 渲染失败或者是 ai_image 模式，使用 AI 图片生成
    if (!generatedImageUrl) {
      // AI 图片模式 (ai_image) 或 HTML 回退
      const imageModelConfig = imageModelId
        ? await this.getModelById(imageModelId)
        : await this.getDefaultImageModel();

      if (!imageModelConfig || !imageModelConfig.apiKey) {
        updateStep(
          "image_generate",
          "No Image Model Available",
          "error",
          "Please configure an image model",
        );
        return returnError("No image generation model configured");
      }

      imageModelUsed = imageModelConfig.displayName || imageModelConfig.name;
      updateStep(
        "image_generate",
        `Generating Image with ${imageModelUsed}`,
        "processing",
      );
      this.logger.log(`[STEP 3] Using image model: ${imageModelUsed}`);

      try {
        // 如果有参考图片，使用 image-to-image 生成
        generatedImageUrl = imageBase64
          ? await this.callImageToImageAPI(
              imageModelConfig,
              enhancedPrompt,
              imageBase64,
              dimensions,
            )
          : await this.callImageGenerationAPI(
              imageModelConfig,
              enhancedPrompt,
              dimensions,
              mergedNegativePrompt,
            );

        // 验证生成的图片
        if (!generatedImageUrl || !generatedImageUrl.startsWith("data:image")) {
          updateStep(
            "image_generate",
            "Image Generation Failed",
            "error",
            "Invalid image data returned",
          );
          return returnError("Image generation returned invalid data");
        }

        updateStep(
          "image_generate",
          "Image Generated Successfully",
          "completed",
        );
        this.logger.log(`[STEP 3] ✓ Image generated successfully`);
      } catch (aiError) {
        const errorMsg =
          aiError instanceof Error ? aiError.message : "Unknown error";
        updateStep(
          "image_generate",
          "Image Generation Failed",
          "error",
          errorMsg,
        );
        return returnError(`Image generation failed: ${errorMsg}`);
      }
    }

    // 保存到数据库并返回结果
    // 如果使用了 AI 模型生成（包括回退情况），记录为 AI_IMAGE
    const actuallyUsedAI = imageModelUsed !== "HTML Renderer";
    const providerName = actuallyUsedAI
      ? "AI_IMAGE"
      : renderingMode === "html_render"
        ? "HTML_RENDER"
        : renderingMode === "hybrid"
          ? "HYBRID"
          : "AI_IMAGE";

    const image = await this.prisma.generatedImage.create({
      data: {
        prompt: inputContent.slice(0, 1000),
        enhancedPrompt,
        style: style || "realistic",
        aspectRatio: aspectRatio || "1:1",
        imageUrl: generatedImageUrl,
        width: dimensions.width,
        height: dimensions.height,
        provider: providerName,
        userId,
        // 保存处理详情，用于历史记录显示
        textModelUsed: textModelUsed || null,
        imageModelUsed: imageModelUsed || null,
        processingSteps: processingSteps as any,
        promptInsights: promptInsights as any,
      },
    });

    this.logger.log(`========== ALL STEPS COMPLETE: ${image.id} ==========`);

    return {
      id: image.id,
      imageUrl: image.imageUrl,
      prompt: image.prompt,
      enhancedPrompt: image.enhancedPrompt || undefined,
      promptInsights,
      negativePrompt: mergedNegativePrompt || undefined,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
      processingSteps,
      extractedContent: inputContent.slice(0, 2000),
      textModelUsed,
      imageModelUsed,
    };
  }

  /**
   * 将 PromptEngineeringInsights 转换为 InfographicContent
   */
  private convertToInfographicContent(
    insights: PromptEngineeringInsights,
  ): InfographicContent {
    const info = insights.informationArchitecture;
    const visual = insights.visualLanguage;

    this.logger.log(
      `[convertToInfographicContent] Title: ${info.title}, Sections count: ${info.sections?.length || 0}`,
    );

    let sections: InfographicSection[] = [];

    if (info.sections && info.sections.length > 0) {
      sections = info.sections.map((section) => ({
        title: section.title || "Section",
        summary: section.summary,
        bullets: section.bullets || [],
        metrics: (section.metrics || []).map((m) => ({
          label: m.label || "",
          value: m.value || "",
          comparison: m.comparison,
        })),
        iconType: section.iconType || section.visual?.type,
        sectionType: section.sectionType, // 传递 AI 的 section 分类
      }));

      // 记录 AI 的分类结果
      const mainCount = sections.filter(
        (s) => s.sectionType !== "summary",
      ).length;
      const summaryCount = sections.filter(
        (s) => s.sectionType === "summary",
      ).length;
      this.logger.log(
        `[convertToInfographicContent] AI section classification: main=${mainCount}, summary=${summaryCount}`,
      );
    } else {
      // Fallback: 如果没有sections，从imagePrompt中提取关键信息创建简单内容
      this.logger.warn(
        "[convertToInfographicContent] No sections found, creating fallback content",
      );

      // 从 prompt 中提取一些内容作为 fallback
      const promptText = insights.imagePrompt || "";
      const lines = promptText
        .split(/[.。\n]/)
        .filter((line) => line.trim().length > 10)
        .slice(0, 6);

      if (lines.length > 0) {
        sections = [
          {
            title: "Key Points",
            summary: "Main highlights from the content",
            bullets: lines.slice(0, 4).map((l) => l.trim().slice(0, 100)),
            metrics: [],
            iconType: "lightbulb",
          },
        ];
      }
    }

    // 如果仍然没有内容，创建占位符
    if (sections.length === 0) {
      sections = [
        {
          title: "Content Summary",
          summary:
            "This infographic summarizes the key information from the source material.",
          bullets: [
            "Key information extracted from the content",
            "Structured for easy reading",
            "Professional presentation format",
          ],
          metrics: [],
          iconType: "chart",
        },
      ];
    }

    // 获取模板布局类型
    const templateLayout = insights.templateLayout || "cards";

    this.logger.log(
      `[convertToInfographicContent] Final sections count: ${sections.length}, style: ${visual.designStyle || "consulting"}, template: ${templateLayout}`,
    );

    // 映射风格字符串到类型安全的值
    const validDesignStyles = [
      "consulting",
      "tech",
      "minimal",
      "creative",
      "dark",
      "academic",
      "business",
    ] as const;
    const validFontStyles = ["sans", "serif", "mono", "rounded"] as const;
    const validBorderRadius = ["none", "small", "medium", "large"] as const;
    const validShadowStyle = ["none", "subtle", "medium", "strong"] as const;
    const validTemplateLayouts = [
      "cards",
      "center_visual",
      "timeline",
      "comparison",
      "pyramid",
      "radial",
    ] as const;

    const designStyle = validDesignStyles.includes(
      visual.designStyle as (typeof validDesignStyles)[number],
    )
      ? (visual.designStyle as (typeof validDesignStyles)[number])
      : "consulting";

    const fontStyle = validFontStyles.includes(
      visual.fontStyle as (typeof validFontStyles)[number],
    )
      ? (visual.fontStyle as (typeof validFontStyles)[number])
      : "sans";

    const borderRadius = validBorderRadius.includes(
      visual.borderRadius as (typeof validBorderRadius)[number],
    )
      ? (visual.borderRadius as (typeof validBorderRadius)[number])
      : "medium";

    const shadowStyle = validShadowStyle.includes(
      visual.shadowStyle as (typeof validShadowStyle)[number],
    )
      ? (visual.shadowStyle as (typeof validShadowStyle)[number])
      : "medium";

    const finalTemplateLayout = validTemplateLayouts.includes(
      templateLayout as (typeof validTemplateLayouts)[number],
    )
      ? (templateLayout as (typeof validTemplateLayouts)[number])
      : "cards";

    return {
      title: info.title || "Infographic",
      subtitle: info.subtitle,
      heroStatement: info.heroStatement,
      sections,
      callToAction: info.callToAction,
      colorScheme: {
        primary: visual.primaryColor || "#1e3a5f",
        accent: visual.accentColor || "#0891b2",
        background: visual.backgroundColor || "#f8fafc",
        text: visual.textColor || "#334155",
      },
      styleOptions: {
        style: designStyle,
        fontStyle: fontStyle,
        templateLayout: finalTemplateLayout,
        borderRadius: borderRadius,
        shadowStyle: shadowStyle,
        centerVisualTitle: info.centerVisualTitle,
        centerVisualItems: info.centerVisualItems,
      },
    };
  }

  /**
   * 调用 Gemini 文本 API
   */
  private async callGeminiTextAPI(
    apiKey: string,
    modelId: string,
    content: string,
  ): Promise<string> {
    const model = modelId.includes("gemini") ? modelId : "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [
            {
              parts: [
                { text: PROMPT_ENHANCEMENT_SYSTEM },
                { text: `\n\nContent to analyze:\n${content}` },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 60000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (candidates?.[0]?.content?.parts?.[0]?.text) {
      return candidates[0].content.parts[0].text.trim();
    }

    throw new Error("No text in Gemini response");
  }

  /**
   * 调用 OpenAI 文本 API
   */
  private async callOpenAITextAPI(
    apiKey: string,
    apiEndpoint: string | null,
    modelId: string,
    content: string,
  ): Promise<string> {
    // 清理 endpoint URL - 确保格式正确
    let baseUrl = apiEndpoint || "https://api.openai.com/v1";
    // 移除末尾斜杠
    baseUrl = baseUrl.replace(/\/+$/, "");
    // 如果endpoint已经包含/chat/completions，不要重复添加
    const url = baseUrl.includes("/chat/completions")
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const effectiveModel = modelId || "gpt-4o-mini";
    this.logger.log(
      `Calling OpenAI text API: ${url} with model: ${effectiveModel}`,
    );

    // 新版 OpenAI 模型 (gpt-4o, gpt-5, o1, o3) 需要使用 max_completion_tokens
    const isNewerModel =
      effectiveModel.includes("gpt-4o") ||
      effectiveModel.includes("gpt-5") ||
      effectiveModel.startsWith("o1") ||
      effectiveModel.startsWith("o3");

    const tokenParam = isNewerModel
      ? { max_completion_tokens: 4096 }
      : { max_tokens: 4096 };

    try {
      const requestBody: Record<string, any> = {
        model: effectiveModel,
        messages: [
          { role: "system", content: PROMPT_ENHANCEMENT_SYSTEM },
          { role: "user", content: `Content to analyze:\n${content}` },
        ],
        ...tokenParam,
        temperature: 0.7,
      };

      const supportsJsonFormat =
        !effectiveModel.startsWith("gpt-3.5") &&
        !effectiveModel.startsWith("text-") &&
        !effectiveModel.startsWith("davinci") &&
        !effectiveModel.startsWith("curie");

      if (supportsJsonFormat) {
        requestBody.response_format = { type: "json_object" };
      }

      const response = await firstValueFrom(
        this.httpService.post(url, requestBody, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 60000,
        }),
      );

      this.logger.log(
        `OpenAI response status: ${response.status}, has data: ${!!response.data}`,
      );

      const message = response.data.choices?.[0]?.message?.content;
      if (message) {
        return message.trim();
      }

      // Log full response for debugging
      this.logger.error(
        `OpenAI response has no text. Response: ${JSON.stringify(response.data).slice(0, 500)}`,
      );
      throw new Error("No text in OpenAI response");
    } catch (error: any) {
      // Handle axios errors with more details
      if (error.response) {
        this.logger.error(
          `OpenAI API error: ${error.response.status} - ${JSON.stringify(error.response.data).slice(0, 500)}`,
        );
        throw new Error(
          `OpenAI API error: ${error.response.data?.error?.message || error.response.status}`,
        );
      }
      throw error;
    }
  }

  /**
   * 调用图片生成 API
   */
  private async callImageGenerationAPI(
    modelConfig: any,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const provider = modelConfig.provider.toLowerCase();
    const endpoint = modelConfig.apiEndpoint?.toLowerCase() || "";
    const modelId = modelConfig.modelId.toLowerCase();

    if (
      provider.includes("openai") ||
      endpoint.includes("openai") ||
      modelId.includes("dall")
    ) {
      return this.generateWithOpenAI(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
      );
    } else if (
      provider.includes("stability") ||
      endpoint.includes("stability") ||
      modelId.includes("stable")
    ) {
      return this.generateWithStability(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (
      provider.includes("replicate") ||
      endpoint.includes("replicate") ||
      modelId.includes("flux")
    ) {
      return this.generateWithReplicate(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
        negativePrompt,
      );
    } else if (provider.includes("together") || endpoint.includes("together")) {
      return this.generateWithTogether(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      modelId.includes("gemini") ||
      modelId.includes("imagen")
    ) {
      return this.generateWithGemini(
        modelConfig.apiKey,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    } else {
      // 默认尝试 OpenAI 兼容 API
      return this.generateWithOpenAICompatible(
        modelConfig.apiKey,
        modelConfig.apiEndpoint,
        modelConfig.modelId,
        prompt,
        dimensions,
      );
    }
  }

  /**
   * 调用 Image-to-Image API（图片引用完善）
   * 将参考图片和修改提示词一起发送，生成基于原图的新图片
   *
   * 重要：使用用户配置的模型，不要硬编码！
   */
  private async callImageToImageAPI(
    modelConfig: any,
    prompt: string,
    referenceImageBase64: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const provider = modelConfig.provider.toLowerCase();
    const modelId = modelConfig.modelId.toLowerCase();

    this.logger.log(
      `[Image-to-Image] Using user configured model: ${modelConfig.name} (provider: ${provider}, modelId: ${modelConfig.modelId})`,
    );

    // Google/Gemini/Imagen 模型 - 使用用户配置的模型
    if (
      provider.includes("google") ||
      provider.includes("gemini") ||
      modelId.includes("gemini") ||
      modelId.includes("imagen")
    ) {
      return this.generateImageToImageWithGoogleModel(
        modelConfig.apiKey,
        modelConfig.modelId, // 使用用户配置的模型ID！
        prompt,
        referenceImageBase64,
      );
    }

    // 对于不支持 image-to-image 的模型，回退到普通生成
    // 但在提示词中明确要求参考原图风格
    this.logger.warn(
      `[Image-to-Image] Model ${modelId} may not support image-to-image, falling back to text-to-image with enhanced prompt`,
    );
    const enhancedPrompt = `Based on the reference image style and composition: ${prompt}. Maintain similar visual elements, color palette, and artistic style.`;
    return this.callImageGenerationAPI(
      modelConfig,
      enhancedPrompt,
      dimensions,
      undefined,
    );
  }

  /**
   * 使用 Google 模型（Gemini/Imagen）进行 Image-to-Image 编辑
   * 使用用户配置的模型，不要硬编码！
   *
   * 关键要点：
   * 1. 使用用户配置的模型ID
   * 2. Imagen 模型使用 editImage API
   * 3. Gemini 模型使用 generateContent API with multimodal
   */
  private async generateImageToImageWithGoogleModel(
    apiKey: string,
    userModelId: string,
    prompt: string,
    referenceImageBase64: string,
  ): Promise<string> {
    const modelIdLower = userModelId.toLowerCase();

    this.logger.log(
      `[Image-to-Image] Using user's Google model: ${userModelId}`,
    );

    // 清理 Base64 数据（移除可能的 data URI 前缀）
    const cleanBase64 = referenceImageBase64.replace(
      /^data:image\/\w+;base64,/,
      "",
    );

    // 检测 MIME 类型
    let mimeType = "image/jpeg";
    if (referenceImageBase64.startsWith("data:image/png")) {
      mimeType = "image/png";
    } else if (referenceImageBase64.startsWith("data:image/webp")) {
      mimeType = "image/webp";
    }

    // 重要：Imagen 4 不支持图片编辑，只有 Imagen 3 (imagen-3.0-capability-001) 支持
    // 对于 Imagen 4 模型，我们需要回退到 Gemini 进行图片编辑
    if (
      modelIdLower.includes("imagen-4") ||
      modelIdLower.includes("imagen-4.0")
    ) {
      this.logger.warn(
        `[Image-to-Image] Imagen 4 does not support image editing. Falling back to Gemini 2.0 Flash for editing.`,
      );
      // Imagen 4 不支持编辑，使用 Gemini 作为编辑模型
      const geminiModel = "gemini-2.0-flash-exp";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
      return this.executeGeminiImageEdit(
        geminiUrl,
        prompt,
        cleanBase64,
        mimeType,
        apiKey,
      );
    }

    // Imagen 3 支持图片编辑
    if (
      modelIdLower.includes("imagen-3") ||
      modelIdLower.includes("imagen-3.0")
    ) {
      return this.generateImageToImageWithImagen3(
        apiKey,
        userModelId,
        prompt,
        cleanBase64,
        mimeType,
      );
    }

    // 其他 Gemini 模型使用 generateContent API with multimodal
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${userModelId}:generateContent?key=${apiKey}`;

    this.logger.log(
      `[Image-to-Image] Using Gemini ${userModelId} for image editing`,
    );

    return this.executeGeminiImageEdit(
      url,
      prompt,
      cleanBase64,
      mimeType,
      apiKey,
    );
  }

  /**
   * 使用 Gemini 执行图片编辑
   */
  private async executeGeminiImageEdit(
    url: string,
    prompt: string,
    cleanBase64: string,
    mimeType: string,
    apiKey: string,
  ): Promise<string> {
    const editPrompt = `Edit this image: ${prompt}

Keep the same subjects, composition, and overall structure. Only apply the specific changes requested above.`;

    this.logger.log(`[Image-to-Image] Edit prompt: ${editPrompt}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            contents: [
              {
                parts: [
                  { text: editPrompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      const candidates = response.data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error("No candidates in response");
      }

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error("No parts in response");
      }

      // 查找图片数据
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const responseMimeType = part.inlineData.mimeType || "image/png";
          this.logger.log(
            `[Image-to-Image] Successfully generated edited image`,
          );
          return `data:${responseMimeType};base64,${part.inlineData.data}`;
        }
      }

      // 如果没有图片数据
      const textPart = parts.find((p: any) => p.text);
      const errorDetail = textPart
        ? `Model returned text: ${textPart.text.slice(0, 300)}`
        : "No image data in response";
      throw new Error(`Image editing failed. ${errorDetail}`);
    } catch (error: any) {
      const errorDetail = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 500)
        : error.message;
      this.logger.error(`[Image-to-Image] Gemini edit error: ${errorDetail}`);
      // 尝试备用方案
      return this.generateImageToImageFallback(
        apiKey,
        prompt,
        cleanBase64,
        mimeType,
      );
    }
  }

  /**
   * 使用 Imagen 3 进行图片编辑（需要 Vertex AI）
   * 注意：这需要 Vertex AI 权限，普通 API key 可能不支持
   */
  private async generateImageToImageWithImagen3(
    apiKey: string,
    modelId: string,
    prompt: string,
    cleanBase64: string,
    mimeType: string,
  ): Promise<string> {
    this.logger.log(
      `[Image-to-Image] Trying Imagen 3 editImage API with model: ${modelId}`,
    );

    // Imagen 3 编辑 API 需要 Vertex AI，这里尝试使用 editImage endpoint
    // 如果失败，回退到 Gemini
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-capability-001:editImage?key=${apiKey}`;

      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            prompt: prompt,
            image: {
              bytesBase64Encoded: cleanBase64,
            },
            config: {
              editMode: "EDIT_MODE_INPAINT_INSERTION",
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      const images = response.data.generatedImages;
      if (images && images.length > 0 && images[0].image?.imageBytes) {
        this.logger.log(
          `[Image-to-Image] Successfully edited image with Imagen 3`,
        );
        return `data:image/png;base64,${images[0].image.imageBytes}`;
      }

      throw new Error("No image data in Imagen 3 response");
    } catch (error: any) {
      this.logger.warn(
        `[Image-to-Image] Imagen 3 editImage failed, falling back to Gemini: ${error.message}`,
      );
      // Imagen 3 API 可能不可用，回退到 Gemini
      const geminiModel = "gemini-2.0-flash-exp";
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
      return this.executeGeminiImageEdit(
        geminiUrl,
        prompt,
        cleanBase64,
        mimeType,
        apiKey,
      );
    }
  }

  /**
   * 备用的图片编辑方案
   * 使用 gemini-2.0-flash-exp 模型
   */
  private async generateImageToImageFallback(
    apiKey: string,
    prompt: string,
    cleanBase64: string,
    mimeType: string,
  ): Promise<string> {
    const model = "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    this.logger.log(`[Image-to-Image] Trying fallback model: ${model}`);

    // 更强调保留原图的提示词
    const editPrompt = `I want you to EDIT this exact image, not create a new one.

Instructions: ${prompt}

CRITICAL REQUIREMENTS:
1. KEEP the same person/subject from the original image
2. KEEP the same pose, angle, and composition
3. KEEP the same background elements
4. Only change what is specifically requested
5. The result must be recognizably the same scene, just modified

Generate the edited version of this image now.`;

    try {
      // 使用 snake_case 格式，text 在 image 之前
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            contents: [
              {
                parts: [
                  {
                    text: editPrompt,
                  },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      const candidates = response.data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error("No candidates in Gemini fallback response");
      }

      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error("No parts in Gemini fallback response");
      }

      // 查找图片数据
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const responseMimeType = part.inlineData.mimeType || "image/png";
          this.logger.log(
            `[Image-to-Image] Fallback model generated edited image`,
          );
          return `data:${responseMimeType};base64,${part.inlineData.data}`;
        }
      }

      // 如果仍然没有图片，抛出详细错误
      const textPart = parts.find((p: any) => p.text);
      const errorDetail = textPart
        ? `Model returned text: ${textPart.text.slice(0, 300)}`
        : "No image data in response";
      throw new Error(`Image editing failed. ${errorDetail}`);
    } catch (error: any) {
      const errorDetail = error.response?.data
        ? JSON.stringify(error.response.data).slice(0, 500)
        : error.message;
      this.logger.error(
        `[Image-to-Image] Fallback model error: ${errorDetail}`,
      );
      throw new Error(`Image editing failed: ${errorDetail}`);
    }
  }

  /**
   * 获取默认文本模型
   * 使用 modelType = CHAT 进行筛选
   * 优先使用 isDefault=true 的模型
   */
  private async getDefaultTextModel() {
    const googleConditions: Prisma.AIModelWhereInput = {
      OR: [
        {
          provider: {
            contains: "google",
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          provider: {
            contains: "gemini",
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          modelId: {
            contains: "gemini",
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    };

    // 1) 用户显式设置的默认 CHAT 模型（无论 provider）
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.CHAT,
      },
    });
    if (defaultModel) {
      this.logger.log(
        `[getDefaultTextModel] Found default CHAT model: ${defaultModel.displayName || defaultModel.name} (${defaultModel.modelId})`,
      );
      return defaultModel;
    }

    // 2) 若无默认模型，优先寻找 Google/Gemini
    const googleModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
        ...googleConditions,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (googleModel) {
      this.logger.log(
        `[getDefaultTextModel] Found Google/Gemini CHAT model: ${googleModel.displayName || googleModel.name} (${googleModel.modelId})`,
      );
      return googleModel;
    }

    // 3) 最后再找任意可用聊天模型
    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
      },
      orderBy: { createdAt: "desc" },
    });
    if (anyModel) {
      this.logger.log(
        `[getDefaultTextModel] Found fallback CHAT model: ${anyModel.displayName || anyModel.name} (${anyModel.modelId})`,
      );
    }

    return anyModel;
  }

  /**
   * 获取默认图片生成模型
   * 使用 modelType = IMAGE_GENERATION 进行筛选
   * 优先使用 isDefault=true 的模型
   */
  private async getDefaultImageModel() {
    // 首先尝试找到标记为默认的图片生成模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.IMAGE_GENERATION,
      },
    });

    if (defaultModel) {
      this.logger.log(
        `[getDefaultImageModel] Found default IMAGE_GENERATION model: ${defaultModel.name} (${defaultModel.provider})`,
      );
      return defaultModel;
    }

    // 如果没有默认的图片生成模型，查找任意可用的图片生成模型
    const anyImageModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.IMAGE_GENERATION,
      },
      orderBy: { createdAt: "desc" },
    });

    if (anyImageModel) {
      this.logger.log(
        `[getDefaultImageModel] Found fallback IMAGE_GENERATION model: ${anyImageModel.name} (${anyImageModel.provider})`,
      );
      return anyImageModel;
    }

    // 如果没有图片生成模型，尝试找多模态模型作为后备
    const multimodalModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.MULTIMODAL,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    if (multimodalModel) {
      this.logger.log(
        `[getDefaultImageModel] Found MULTIMODAL fallback model: ${multimodalModel.name} (${multimodalModel.provider})`,
      );
    }

    return multimodalModel;
  }

  // NOTE: getDefaultImageEditingModel 和 getDefaultChatModel 方法已准备好
  // 当需要时可以实现：
  // - IMAGE_EDITING: 用于图片编辑任务
  // - MULTIMODAL: 用于同时支持文本和图片的任务

  /**
   * 根据ID获取模型
   */
  private async getModelById(id: string) {
    return this.prisma.aIModel.findFirst({
      where: { id, isEnabled: true },
    });
  }

  /**
   * 添加样式到提示词
   */
  private addStyleToPrompt(prompt: string, style?: string): string {
    const styleEnhancements: Record<string, string> = {
      realistic: "photorealistic, 8k uhd, high quality, detailed",
      artistic: "artistic, painterly, vibrant colors, expressive",
      anime: "anime style, detailed, vibrant, studio quality",
      "3d": "3D render, octane render, unreal engine, highly detailed",
      sketch: "pencil sketch, detailed line art, artistic",
      watercolor: "watercolor painting, soft colors, artistic",
    };

    const enhancement = style ? styleEnhancements[style] : "";
    return enhancement ? `${prompt}, ${enhancement}` : prompt;
  }

  /**
   * 获取尺寸
   */
  private getDimensions(aspectRatio: string): {
    width: number;
    height: number;
  } {
    const dimensions: Record<string, { width: number; height: number }> = {
      "1:1": { width: 1024, height: 1024 },
      "16:9": { width: 1344, height: 768 },
      "9:16": { width: 768, height: 1344 },
      "4:3": { width: 1152, height: 896 },
    };
    return dimensions[aspectRatio] || dimensions["1:1"];
  }
  // ============ 图片生成 API 实现 ============

  /**
   * 使用 Google AI Image Generation API
   * 支持的图片生成模型:
   * - gemini-2.0-flash-exp (支持 responseModalities: IMAGE)
   * - gemini-2.0-flash-exp-image-generation
   * - imagen-3.0-generate-001 (Imagen 3)
   * - imagen-4.0-generate-preview-* (Imagen 4)
   * - imagen-4.0-ultra-generate-preview-* (Imagen 4 Ultra)
   */
  private async generateWithGemini(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const modelLower = modelId.toLowerCase();

    // 检查是否是 Imagen 模型 (使用不同的 API)
    if (modelLower.includes("imagen")) {
      return this.generateWithImagen(apiKey, modelId, prompt, dimensions);
    }

    // Gemini 模型支持列表
    const geminiImageModels = [
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-exp-image-generation",
    ];

    // 检查是否是支持图片生成的 Gemini 模型
    const isGeminiImageCapable = geminiImageModels.some((m) =>
      modelLower.includes(m.toLowerCase()),
    );

    // 如果不是支持的模型，使用默认的图片生成模型
    const model = isGeminiImageCapable ? modelId : "gemini-2.0-flash-exp";

    this.logger.log(
      `Using Gemini model for image generation: ${model} (original: ${modelId})`,
    );

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("No parts in Gemini response");
    }

    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data in Gemini response");
  }

  /**
   * 使用 Imagen API 生成图片
   * Imagen 4 使用 generateImages 端点
   * 参考: https://ai.google.dev/gemini-api/docs/imagen
   */
  private async generateWithImagen(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    this.logger.log(`Using Imagen model for image generation: ${modelId}`);

    // 计算宽高比
    const aspectRatio =
      dimensions.width === dimensions.height
        ? "1:1"
        : dimensions.width > dimensions.height
          ? "16:9"
          : "9:16";

    // 尝试使用 generateImages 端点 (Imagen 4 新 API)
    const generateImagesUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${apiKey}`;

    this.logger.log(`Calling Imagen API: ${generateImagesUrl}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          generateImagesUrl,
          {
            prompt: prompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspectRatio,
              outputOptions: {
                mimeType: "image/png",
              },
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      this.logger.log(
        `Imagen generateImages response: ${JSON.stringify(response.data).slice(0, 300)}`,
      );

      // Imagen 4 返回格式: { generatedImages: [{ image: { imageBytes: "base64..." } }] }
      const generatedImages = response.data.generatedImages;
      if (generatedImages && generatedImages.length > 0) {
        const imageData = generatedImages[0].image?.imageBytes;
        if (imageData) {
          this.logger.log(`Imagen image generated successfully`);
          return `data:image/png;base64,${imageData}`;
        }
      }

      // 备用: 检查旧格式
      const predictions = response.data.predictions;
      if (predictions && predictions.length > 0) {
        const prediction = predictions[0];
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || "image/png";
          return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
        }
      }

      this.logger.error(
        `Unexpected Imagen response format: ${JSON.stringify(response.data).slice(0, 500)}`,
      );
      throw new Error("No image data in Imagen response");
    } catch (error: any) {
      const errorStatus = error.response?.status;
      const errorData = error.response?.data;
      this.logger.error(
        `Imagen generateImages error: status=${errorStatus}, data=${JSON.stringify(errorData).slice(0, 500)}`,
      );

      // 如果 generateImages 失败，尝试使用 predict 端点 (旧 API)
      if (errorStatus === 404 || errorStatus === 400) {
        this.logger.log(
          `generateImages failed with ${errorStatus}, trying predict endpoint...`,
        );
        return this.generateWithImagenPredict(
          apiKey,
          modelId,
          prompt,
          aspectRatio,
        );
      }
      throw error;
    }
  }

  /**
   * 使用 Imagen predict 端点 (备用方案)
   * 如果 predict 也失败，回退到 Gemini 2.0 Flash 图片生成
   */
  private async generateWithImagenPredict(
    apiKey: string,
    modelId: string,
    prompt: string,
    aspectRatio: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`;

    this.logger.log(`Calling Imagen predict API: ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: aspectRatio,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        ),
      );

      this.logger.log(
        `Imagen predict response: ${JSON.stringify(response.data).slice(0, 300)}`,
      );

      const predictions = response.data.predictions;
      if (predictions && predictions.length > 0) {
        const prediction = predictions[0];
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || "image/png";
          return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
        }
      }

      // 如果 Imagen 不返回结果，回退到 Gemini 2.0 Flash
      this.logger.warn(
        `Imagen predict returned no data, falling back to Gemini 2.0 Flash`,
      );
      return this.generateWithGeminiFlash(apiKey, prompt);
    } catch (error: any) {
      this.logger.error(
        `Imagen predict error: ${error.response?.status} - ${JSON.stringify(error.response?.data).slice(0, 300)}`,
      );
      // 回退到 Gemini 2.0 Flash
      this.logger.warn(
        `Imagen predict failed, falling back to Gemini 2.0 Flash`,
      );
      return this.generateWithGeminiFlash(apiKey, prompt);
    }
  }

  /**
   * 使用 Gemini 2.0 Flash 生成图片 (最后备用方案)
   */
  private async generateWithGeminiFlash(
    apiKey: string,
    prompt: string,
  ): Promise<string> {
    const model = "gemini-2.0-flash-exp";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    this.logger.log(`Falling back to Gemini 2.0 Flash for image generation`);

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
        },
      ),
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const parts = candidates[0].content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          this.logger.log(`Gemini 2.0 Flash image generated successfully`);
          return `data:${mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data in Gemini 2.0 Flash response");
  }

  /**
   * 使用 OpenAI DALL-E API
   */
  private async generateWithOpenAI(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const size =
      dimensions.width === dimensions.height
        ? "1024x1024"
        : dimensions.width > dimensions.height
          ? "1792x1024"
          : "1024x1792";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          quality: "hd",
          response_format: "url",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url;
  }

  /**
   * 使用 Stability AI API
   */
  private async generateWithStability(
    apiKey: string,
    apiEndpoint: string | null,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const url =
      apiEndpoint ||
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          text_prompts: [
            { text: prompt, weight: 1 },
            ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
          ],
          cfg_scale: 7,
          width: dimensions.width,
          height: dimensions.height,
          samples: 1,
          steps: 30,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    const base64Image = response.data.artifacts[0].base64;
    return `data:image/png;base64,${base64Image}`;
  }

  /**
   * 使用 Replicate API
   */
  private async generateWithReplicate(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
    negativePrompt?: string,
  ): Promise<string> {
    const createResponse = await firstValueFrom(
      this.httpService.post(
        "https://api.replicate.com/v1/predictions",
        {
          version: modelId.includes(":")
            ? modelId.split(":")[1]
            : "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
          input: {
            prompt,
            negative_prompt: negativePrompt || "",
            width: dimensions.width,
            height: dimensions.height,
            num_outputs: 1,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${apiKey}`,
          },
        },
      ),
    );

    const predictionId = createResponse.data.id;
    let result = createResponse.data;
    let attempts = 0;
    const maxAttempts = 60;

    while (
      result.status !== "succeeded" &&
      result.status !== "failed" &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pollResponse = await firstValueFrom(
        this.httpService.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: { Authorization: `Token ${apiKey}` },
          },
        ),
      );
      result = pollResponse.data;
      attempts++;
    }

    if (result.status === "failed" || attempts >= maxAttempts) {
      throw new Error("Replicate generation failed or timed out");
    }

    return result.output[0];
  }

  /**
   * 使用 Together AI API
   */
  private async generateWithTogether(
    apiKey: string,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.together.xyz/v1/images/generations",
        {
          model: modelId || "black-forest-labs/FLUX.1-schnell-Free",
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          n: 1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return response.data.data[0].url || response.data.data[0].b64_json
      ? `data:image/png;base64,${response.data.data[0].b64_json}`
      : response.data.data[0].url;
  }

  /**
   * OpenAI 兼容 API
   */
  private async generateWithOpenAICompatible(
    apiKey: string,
    apiEndpoint: string | null,
    modelId: string,
    prompt: string,
    dimensions: { width: number; height: number },
  ): Promise<string> {
    const baseUrl = apiEndpoint || "https://api.openai.com/v1";
    const url = `${baseUrl}/images/generations`;

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          model: modelId,
          prompt,
          n: 1,
          size: `${dimensions.width}x${dimensions.height}`,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      ),
    );

    return (
      response.data.data[0].url ||
      (response.data.data[0].b64_json
        ? `data:image/png;base64,${response.data.data[0].b64_json}`
        : null)
    );
  }

  // ============ 历史记录 ============

  /**
   * 获取用户生成历史
   * 已登录：返回用户自己的图片 + 历史遗留图片
   * 未登录：仅返回历史遗留的无用户绑定图片（向后兼容）
   */
  async getHistory(userId?: string): Promise<GeneratedImageResult[]> {
    this.logger.log(`[getHistory] userId: ${userId || "not provided"}`);

    // 构建查询条件
    const whereCondition = userId
      ? {
          OR: [
            { userId }, // 当前用户的图片
            { userId: null }, // 历史遗留的无用户绑定图片
          ],
        }
      : { userId: null }; // 未登录：仅返回历史遗留图片

    this.logger.log(
      `[getHistory] whereCondition: ${JSON.stringify(whereCondition)}`,
    );

    const images = await this.prisma.generatedImage.findMany({
      where: whereCondition,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    this.logger.log(`[getHistory] Found ${images.length} images`);

    return images.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      prompt: img.prompt,
      enhancedPrompt: img.enhancedPrompt || undefined,
      width: img.width,
      height: img.height,
      isBookmarked: img.isBookmarked || false,
      createdAt: img.createdAt.toISOString(),
      // 返回处理详情
      textModelUsed: img.textModelUsed || undefined,
      imageModelUsed: img.imageModelUsed || undefined,
      processingSteps: (img.processingSteps as any) || undefined,
      promptInsights: (img.promptInsights as any) || undefined,
    }));
  }

  /**
   * 获取单个图片
   */
  async getImage(id: string): Promise<GeneratedImageResult | null> {
    const image = await this.prisma.generatedImage.findUnique({
      where: { id },
    });

    if (!image) return null;

    return {
      id: image.id,
      imageUrl: image.imageUrl,
      prompt: image.prompt,
      enhancedPrompt: image.enhancedPrompt || undefined,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    };
  }

  /**
   * 删除图片
   */
  async deleteImage(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 验证图片存在且属于该用户
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to delete this image",
        };
      }

      await this.prisma.generatedImage.delete({
        where: { id },
      });

      this.logger.log(`Deleted image: ${id}`);
      return { success: true, message: "Image deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete image ${id}:`, error);
      return { success: false, message: "Failed to delete image" };
    }
  }

  /**
   * 获取用户收藏的图片
   * 已登录：返回用户自己的收藏 + 历史遗留收藏
   * 未登录：仅返回历史遗留的无用户绑定收藏（向后兼容）
   */
  async getBookmarkedImages(userId?: string) {
    try {
      // 构建查询条件
      const whereCondition = userId
        ? {
            OR: [
              { userId, isBookmarked: true }, // 当前用户的收藏
              { userId: null, isBookmarked: true }, // 历史遗留的无用户绑定收藏
            ],
          }
        : { userId: null, isBookmarked: true }; // 未登录：仅返回历史遗留收藏

      const images = await this.prisma.generatedImage.findMany({
        where: whereCondition,
        orderBy: { createdAt: "desc" },
      });

      return images.map((img) => ({
        id: img.id,
        prompt: img.prompt,
        enhancedPrompt: img.enhancedPrompt,
        imageUrl: img.imageUrl,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        isBookmarked: img.isBookmarked,
      }));
    } catch (error) {
      this.logger.error("Failed to get bookmarked images:", error);
      return [];
    }
  }

  /**
   * 添加书签
   * 验证图片属于当前用户
   */
  async addBookmark(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      // 验证图片所有权
      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to bookmark this image",
        };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: true },
      });

      this.logger.log(`Bookmarked image: ${id} by user: ${userId}`);
      return { success: true, message: "Image bookmarked" };
    } catch (error) {
      this.logger.error(`Failed to bookmark image ${id}:`, error);
      return { success: false, message: "Failed to bookmark image" };
    }
  }

  /**
   * 移除书签
   * 验证图片属于当前用户
   */
  async removeBookmark(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      // 验证图片所有权
      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to modify this image",
        };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: false },
      });

      this.logger.log(`Removed bookmark from image: ${id} by user: ${userId}`);
      return { success: true, message: "Bookmark removed" };
    } catch (error) {
      this.logger.error(`Failed to remove bookmark from image ${id}:`, error);
      return { success: false, message: "Failed to remove bookmark" };
    }
  }
}
