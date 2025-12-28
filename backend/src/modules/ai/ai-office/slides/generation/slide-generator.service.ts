/**
 * 幻灯片内容生成服务
 * 基于模板和内容特征生成高质量的幻灯片内容
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../../ai-core/ai-chat.service";
import { AIModelService } from "../../core/ai-model.service";
import {
  SLIDE_CONTENT_GENERATION_SYSTEM_PROMPT,
  SLIDE_CONTENT_USER_PROMPT,
} from "../../prompts";
import {
  SlideTemplateType,
  ImageRequirement,
  ImageType,
} from "../../common/template-selection.types";
import { SlidePlanItem } from "../../common/template-selection.service";
import { ImagePrompt } from "../../common/image-matching.service";
import {
  SlideTemplateContent,
  CoverSlideContent,
  TocSlideContent,
  MultiColumnSlideContent,
  ChapterTitleSlideContent,
} from "../types/slides-templates.types";

/**
 * 生成的幻灯片输出（包含元数据）
 */
export interface GeneratedSlideOutput {
  slideId: string;
  index: number;
  templateType: SlideTemplateType;
  title: string;
  content: SlideTemplateContent;
  speakerNotes?: string;
  imagePrompts: ImagePrompt[];
  metadata: {
    generatedAt: string;
    modelUsed: string;
  };
}

/**
 * 完整演示文稿内容
 */
export interface GeneratedPresentationContent {
  title: string;
  subtitle?: string;
  slides: GeneratedSlideOutput[];
  totalSlides: number;
  generationTime: number;
  metadata: {
    generatedAt: string;
    modelUsed: string;
  };
}

@Injectable()
export class SlideContentGeneratorService {
  private readonly logger = new Logger(SlideContentGeneratorService.name);

  constructor(
    private readonly aiModelService: AIModelService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成完整演示文稿内容
   */
  async generatePresentation(
    title: string,
    sourceContent: string,
    slidePlans: SlidePlanItem[],
    options: {
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "persuasive";
      targetAudience?: string;
      modelId?: string;
      generateSpeakerNotes?: boolean;
    } = {},
  ): Promise<GeneratedPresentationContent> {
    const startTime = Date.now();
    const slides: GeneratedSlideOutput[] = [];

    // 生成大纲上下文
    const outlineContext = slidePlans
      .map((s) => `${s.index + 1}. ${s.title} (${s.templateType})`)
      .join("\n");

    // 逐页生成
    for (let i = 0; i < slidePlans.length; i++) {
      const plan = slidePlans[i];
      const previousSlide = i > 0 ? slidePlans[i - 1] : null;
      const nextSlide = i < slidePlans.length - 1 ? slidePlans[i + 1] : null;

      const slideContent = await this.generateSlide(plan, {
        sourceContent,
        outlineContext,
        previousSlide: previousSlide?.title,
        nextSlide: nextSlide?.title,
        totalSlides: slidePlans.length,
        ...options,
      });

      slides.push(slideContent);

      this.logger.log(
        `Generated slide ${i + 1}/${slidePlans.length}: ${plan.title}`,
      );
    }

    return {
      title,
      slides,
      totalSlides: slides.length,
      generationTime: Date.now() - startTime,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: options.modelId || "gpt-4o",
      },
    };
  }

  /**
   * 生成单张幻灯片内容
   */
  async generateSlide(
    plan: SlidePlanItem,
    context: {
      sourceContent: string;
      outlineContext: string;
      previousSlide?: string;
      nextSlide?: string;
      totalSlides: number;
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "persuasive";
      targetAudience?: string;
      modelId?: string;
      generateSpeakerNotes?: boolean;
    },
  ): Promise<GeneratedSlideOutput> {
    const {
      sourceContent,
      previousSlide,
      nextSlide,
      language = "zh-CN",
      style = "formal",
      targetAudience = "专业人士",
      modelId,
      generateSpeakerNotes = true,
    } = context;

    // 对于结构性页面，使用预设内容
    if (this.isStructuralSlide(plan.templateType)) {
      return this.generateStructuralSlide(plan, context);
    }

    // 构建用户提示词
    const userPrompt = SLIDE_CONTENT_USER_PROMPT.replace(
      "{{slideIndex}}",
      String(plan.index + 1),
    )
      .replace("{{templateType}}", plan.templateType)
      .replace("{{title}}", plan.title)
      .replace(
        "{{chapterTitle}}",
        plan.chapterNumber ? `第${plan.chapterNumber}章` : "",
      )
      .replace("{{sourceContent}}", this.truncateContent(sourceContent, 4000))
      .replace("{{language}}", language)
      .replace("{{style}}", style)
      .replace("{{targetAudience}}", targetAudience)
      .replace("{{previousSlide}}", previousSlide || "无")
      .replace("{{nextSlide}}", nextSlide || "无");

    // 获取模型配置
    const model = await this.aiModelService.getDefaultTextModel(modelId);

    // 调用 AI 生成内容
    const response = await this.aiChatService.generateChatCompletionWithKey({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: model.apiKey || "",
      systemPrompt: this.buildSystemPrompt(
        plan.templateType,
        generateSpeakerNotes,
      ),
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.7,
      maxTokens: 1500,
    });

    // 解析响应
    const { content, speakerNotes } = this.parseSlideResponse(
      response.content,
      plan.templateType,
    );

    // 生成图片提示词
    const imagePrompts = this.generateImagePrompts(
      plan.imageRequirements,
      plan.title,
      content,
    );

    return {
      slideId: `slide-${plan.index}`,
      index: plan.index,
      templateType: plan.templateType,
      title: plan.title,
      content,
      speakerNotes,
      imagePrompts,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: modelId || "gpt-4o",
      },
    };
  }

  /**
   * 判断是否是结构性幻灯片
   */
  private isStructuralSlide(templateType: SlideTemplateType): boolean {
    return [
      SlideTemplateType.COVER,
      SlideTemplateType.TABLE_OF_CONTENTS,
      SlideTemplateType.CHAPTER_TITLE,
    ].includes(templateType);
  }

  /**
   * 生成结构性幻灯片
   */
  private async generateStructuralSlide(
    plan: SlidePlanItem,
    context: {
      sourceContent: string;
      outlineContext: string;
      totalSlides: number;
      language?: "zh-CN" | "en-US";
    },
  ): Promise<GeneratedSlideOutput> {
    let content: SlideTemplateContent;

    switch (plan.templateType) {
      case SlideTemplateType.COVER:
        content = this.generateCoverContent(plan, context);
        break;
      case SlideTemplateType.TABLE_OF_CONTENTS:
        content = this.generateTocContent(plan, context);
        break;
      case SlideTemplateType.CHAPTER_TITLE:
        content = this.generateChapterTitleContent(plan);
        break;
      default:
        content = {
          templateType: "cover",
          title: plan.title,
        } as CoverSlideContent;
    }

    return {
      slideId: `slide-${plan.index}`,
      index: plan.index,
      templateType: plan.templateType,
      title: plan.title,
      content,
      imagePrompts: this.generateImagePrompts(
        plan.imageRequirements,
        plan.title,
        content,
      ),
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: "template",
      },
    };
  }

  /**
   * 生成封面内容
   */
  private generateCoverContent(
    plan: SlidePlanItem,
    context: { language?: string },
  ): CoverSlideContent {
    return {
      templateType: "cover",
      title: plan.title,
      subtitle: plan.contentOutline[0] || "",
      date: new Date().toLocaleDateString(
        context.language === "en-US" ? "en-US" : "zh-CN",
      ),
    };
  }

  /**
   * 生成目录内容
   */
  private generateTocContent(
    _plan: SlidePlanItem,
    context: { outlineContext: string },
  ): TocSlideContent {
    const items = context.outlineContext
      .split("\n")
      .filter((line) => line.trim())
      .map((line, index) => {
        const match = line.match(/^\d+\.\s*(.+?)\s*\(/);
        return {
          number: index + 1,
          title: match ? match[1].trim() : line,
        };
      });

    return {
      templateType: "toc",
      title: "目录",
      items,
      style: "numbered",
    };
  }

  /**
   * 生成章节标题内容
   */
  private generateChapterTitleContent(
    plan: SlidePlanItem,
  ): ChapterTitleSlideContent {
    return {
      templateType: "chapterTitle",
      chapterNumber: plan.chapterNumber || 1,
      title: plan.title,
      description: plan.contentOutline[0],
    };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(
    templateType: SlideTemplateType,
    includeSpeakerNotes: boolean,
  ): string {
    const templateInstructions = this.getTemplateInstructions(templateType);
    const notesInstruction = includeSpeakerNotes
      ? "\n\n## 演讲者备注\n请在内容后添加 `---SPEAKER_NOTES---` 分隔符，然后提供1-2句演讲者备注。"
      : "";

    return `${SLIDE_CONTENT_GENERATION_SYSTEM_PROMPT}\n\n## 当前模板: ${templateType}\n\n${templateInstructions}${notesInstruction}`;
  }

  /**
   * 获取模板专用指令
   */
  private getTemplateInstructions(templateType: SlideTemplateType): string {
    const instructions: Record<string, string> = {
      [SlideTemplateType.DASHBOARD]: `
### 仪表盘模板
输出 JSON 格式:
\`\`\`json
{
  "title": "数据概览",
  "metrics": [
    {"label": "指标名", "value": "数值", "trend": "up/down/stable", "trendValue": "+15%"}
  ],
  "charts": [
    {"type": "bar/line/pie", "title": "图表标题", "data": [{"label": "x", "value": 100}]}
  ],
  "layout": "grid"
}
\`\`\``,

      [SlideTemplateType.TIMELINE]: `
### 时间线模板
输出 JSON 格式:
\`\`\`json
{
  "title": "发展历程",
  "events": [
    {"date": "2020", "title": "里程碑", "description": "详情", "status": "past/current/future"}
  ],
  "orientation": "horizontal"
}
\`\`\``,

      [SlideTemplateType.COMPARISON]: `
### 对比模板
输出 JSON 格式:
\`\`\`json
{
  "title": "方案对比",
  "subjects": [{"id": "a", "name": "方案A"}, {"id": "b", "name": "方案B"}],
  "criteria": [
    {"name": "维度1", "values": {"a": "优势描述", "b": "劣势描述"}}
  ],
  "layout": "table"
}
\`\`\``,

      [SlideTemplateType.CASE_STUDY]: `
### 案例研究模板
输出 JSON 格式:
\`\`\`json
{
  "title": "成功案例",
  "company": "公司名",
  "challenge": {"description": "面临的挑战"},
  "solution": {"description": "解决方案"},
  "results": [{"metric": "指标", "value": "数值", "improvement": "+50%"}]
}
\`\`\``,

      [SlideTemplateType.RECOMMENDATIONS]: `
### 建议模板
输出 JSON 格式:
\`\`\`json
{
  "title": "行动建议",
  "recommendations": [
    {"id": "1", "title": "建议1", "description": "详情", "priority": "high/medium/low", "timeframe": "immediate/short_term"}
  ],
  "layout": "numbered"
}
\`\`\``,

      [SlideTemplateType.MULTI_COLUMN]: `
### 多栏模板
输出 JSON 格式:
\`\`\`json
{
  "title": "主题",
  "columns": [
    {"title": "要点1", "content": "详细内容", "items": ["子要点1", "子要点2"]}
  ],
  "columnCount": 3
}
\`\`\``,

      [SlideTemplateType.SPLIT_LAYOUT]: `
### 分屏模板
输出 JSON 格式:
\`\`\`json
{
  "title": "主题",
  "left": {"type": "text", "title": "左侧标题", "content": "详细内容"},
  "right": {"type": "image", "imageUrl": "placeholder"},
  "ratio": "50-50"
}
\`\`\``,

      [SlideTemplateType.CHAPTER_SUMMARY]: `
### 章节摘要模板
输出 JSON 格式:
\`\`\`json
{
  "title": "本章要点",
  "keyPoints": [
    {"title": "要点1", "description": "简短说明"}
  ],
  "transitionText": "下一章我们将探讨..."
}
\`\`\``,

      [SlideTemplateType.CONCLUSION]: `
### 结论模板
输出 JSON 格式:
\`\`\`json
{
  "title": "结论",
  "keyTakeaways": [
    {"text": "核心观点1", "emphasis": "high"}
  ],
  "callToAction": "立即行动的号召"
}
\`\`\``,

      [SlideTemplateType.EVOLUTION_ROADMAP]: `
### 路线图模板
输出 JSON 格式:
\`\`\`json
{
  "title": "发展路线图",
  "stages": [
    {"id": "1", "phase": "Phase 1", "title": "阶段名", "description": "描述", "status": "completed/in_progress/planned"}
  ],
  "orientation": "horizontal"
}
\`\`\``,

      [SlideTemplateType.MATURITY_MODEL]: `
### 成熟度模型
输出 JSON 格式:
\`\`\`json
{
  "title": "成熟度评估",
  "dimensions": [{"id": "d1", "name": "维度1"}],
  "levels": [{"level": 1, "name": "初始", "description": "描述"}],
  "currentAssessment": {"d1": 2}
}
\`\`\``,

      [SlideTemplateType.RISK_OPPORTUNITY]: `
### 风险机会模板
输出 JSON 格式:
\`\`\`json
{
  "title": "风险与机会",
  "risks": [{"id": "r1", "title": "风险1", "description": "描述", "probability": "high", "impact": "high"}],
  "opportunities": [{"id": "o1", "title": "机会1", "description": "描述", "potential": "high", "feasibility": "medium"}],
  "layout": "split"
}
\`\`\``,
    };

    return (
      instructions[templateType] || "请根据内容生成适合该模板的结构化内容。"
    );
  }

  /**
   * 解析幻灯片响应
   */
  private parseSlideResponse(
    response: string,
    templateType: SlideTemplateType,
  ): { content: SlideTemplateContent; speakerNotes?: string } {
    // 分离演讲者备注
    const parts = response.split("---SPEAKER_NOTES---");
    const mainContent = parts[0].trim();
    const speakerNotes = parts[1]?.trim();

    // 尝试解析 JSON
    const jsonMatch = mainContent.match(/```json\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        // 添加模板类型标识
        parsed.templateType = this.templateTypeToContentType(templateType);
        return { content: parsed as SlideTemplateContent, speakerNotes };
      } catch (e) {
        this.logger.warn(`Failed to parse JSON for ${templateType}`, e);
      }
    }

    // 降级：创建简单内容
    return {
      content: this.createFallbackContent(templateType, mainContent),
      speakerNotes,
    };
  }

  /**
   * 模板类型转内容类型
   */
  private templateTypeToContentType(
    templateType: SlideTemplateType,
  ): SlideTemplateContent["templateType"] {
    const mapping: Record<
      SlideTemplateType,
      SlideTemplateContent["templateType"]
    > = {
      [SlideTemplateType.COVER]: "cover",
      [SlideTemplateType.TABLE_OF_CONTENTS]: "toc",
      [SlideTemplateType.CHAPTER_TITLE]: "chapterTitle",
      [SlideTemplateType.CHAPTER_SUMMARY]: "chapterSummary",
      [SlideTemplateType.CONCLUSION]: "conclusion",
      [SlideTemplateType.TIMELINE]: "timeline",
      [SlideTemplateType.MULTI_COLUMN]: "multiColumn",
      [SlideTemplateType.SPLIT_LAYOUT]: "splitLayout",
      [SlideTemplateType.DASHBOARD]: "dashboard",
      [SlideTemplateType.EVOLUTION_ROADMAP]: "evolutionRoadmap",
      [SlideTemplateType.COMPARISON]: "comparison",
      [SlideTemplateType.CASE_STUDY]: "caseStudy",
      [SlideTemplateType.MATURITY_MODEL]: "maturityModel",
      [SlideTemplateType.RISK_OPPORTUNITY]: "riskOpportunity",
      [SlideTemplateType.RECOMMENDATIONS]: "recommendations",
    };
    return mapping[templateType] || "splitLayout";
  }

  /**
   * 创建降级内容
   */
  private createFallbackContent(
    _templateType: SlideTemplateType,
    text: string,
  ): SlideTemplateContent {
    // 提取要点
    const lines = text.split("\n").filter((l) => l.trim());
    const title = lines[0] || "内容";
    const points = lines.slice(1, 5);

    // 默认使用多栏布局
    return {
      templateType: "multiColumn",
      title,
      columns: points.map((point, index) => ({
        title: `要点 ${index + 1}`,
        content: point,
      })),
      columnCount: Math.min(points.length, 3) as 2 | 3 | 4,
    } as MultiColumnSlideContent;
  }

  /**
   * 生成图片提示词
   */
  private generateImagePrompts(
    requirements: ImageRequirement[],
    slideTitle: string,
    _content: SlideTemplateContent,
  ): ImagePrompt[] {
    return requirements.map((req) => ({
      prompt: `${req.description}, ${slideTitle}, professional presentation style, clean design, high quality`,
      promptZh: `${req.description}，${slideTitle}，专业演示风格，简洁设计`,
      negativePrompt: "blurry, low quality, text, watermark",
      style: this.getImageStyle(req.type),
      aspectRatio: "16:9" as const,
      suggestedModel: "dalle3" as const,
    }));
  }

  /**
   * 获取图片风格
   */
  private getImageStyle(imageType: ImageType): string {
    const styles: Record<ImageType, string> = {
      [ImageType.INFOGRAPHIC]: "infographic",
      [ImageType.DIAGRAM]: "diagram",
      [ImageType.CHART]: "chart",
      [ImageType.ICON]: "icon",
      [ImageType.PHOTO_BUSINESS]: "photo",
      [ImageType.PHOTO_TECHNOLOGY]: "photo",
      [ImageType.PHOTO_PEOPLE]: "photo",
      [ImageType.PHOTO_ABSTRACT]: "abstract",
      [ImageType.ILLUSTRATION_FLAT]: "flat",
      [ImageType.ILLUSTRATION_3D]: "3d",
      [ImageType.ILLUSTRATION_ISOMETRIC]: "isometric",
      [ImageType.BACKGROUND]: "background",
      [ImageType.PATTERN]: "pattern",
      [ImageType.DECORATION]: "decoration",
    };
    return styles[imageType] || "illustration";
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  }

  /**
   * 流式生成演示文稿
   */
  async *generatePresentationStream(
    title: string,
    sourceContent: string,
    slidePlans: SlidePlanItem[],
    options: {
      language?: "zh-CN" | "en-US";
      style?: "formal" | "casual" | "persuasive";
      targetAudience?: string;
      modelId?: string;
      generateSpeakerNotes?: boolean;
    } = {},
  ): AsyncGenerator<{
    type: "progress" | "slide_complete" | "complete" | "error";
    data: unknown;
  }> {
    const startTime = Date.now();
    const slides: GeneratedSlideOutput[] = [];

    const outlineContext = slidePlans
      .map((s) => `${s.index + 1}. ${s.title} (${s.templateType})`)
      .join("\n");

    try {
      for (let i = 0; i < slidePlans.length; i++) {
        const plan = slidePlans[i];

        yield {
          type: "progress",
          data: {
            currentSlide: i + 1,
            totalSlides: slidePlans.length,
            slideTitle: plan.title,
            percentage: Math.round((i / slidePlans.length) * 100),
          },
        };

        const previousSlide = i > 0 ? slidePlans[i - 1] : null;
        const nextSlide = i < slidePlans.length - 1 ? slidePlans[i + 1] : null;

        const slideContent = await this.generateSlide(plan, {
          sourceContent,
          outlineContext,
          previousSlide: previousSlide?.title,
          nextSlide: nextSlide?.title,
          totalSlides: slidePlans.length,
          ...options,
        });

        slides.push(slideContent);

        yield {
          type: "slide_complete",
          data: {
            slideIndex: i,
            slideId: slideContent.slideId,
            title: slideContent.title,
            templateType: slideContent.templateType,
          },
        };
      }

      yield {
        type: "complete",
        data: {
          title,
          totalSlides: slides.length,
          generationTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      yield {
        type: "error",
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }
}
