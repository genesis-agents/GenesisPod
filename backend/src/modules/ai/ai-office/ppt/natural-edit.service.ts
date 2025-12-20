/**
 * Natural Language Edit Service - 自然语言编辑服务
 *
 * AI Office 3.0 - 自然语言局部编辑
 *
 * 功能:
 * 1. 解析用户自然语言指令为结构化编辑意图
 * 2. 执行局部编辑（只更新受影响的页面）
 * 3. 保持未修改页面不变（包括已生成的图片）
 * 4. 支持版本管理（编辑后自动保存版本）
 *
 * 支持的编辑类型:
 * - update_title: 修改标题
 * - update_content: 修改内容
 * - replace_image: 替换图片
 * - replace_chart: 替换图表类型
 * - delete_slide: 删除页面
 * - add_slide: 添加页面
 * - regenerate_slide: 重新生成页面
 * - batch_style: 批量修改样式
 */

import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AIModelService } from "../ai-model.service";
import { PPTDocument, GeneratedSlide } from "./ppt.types";
import { SlideContentService } from "./slide-content.service";
import { SlideImageService } from "./slide-image.service";
import { SlideRendererService } from "./slide-renderer.service";

// ============================================
// 编辑意图类型定义
// ============================================

export type EditIntentType =
  | "update_title"
  | "update_content"
  | "replace_image"
  | "replace_chart"
  | "delete_slide"
  | "add_slide"
  | "regenerate_slide"
  | "batch_style"
  | "unknown";

export interface EditIntent {
  type: EditIntentType;
  slideIndex: number; // 0-based, -1 表示最后一页
  confidence: number; // 0-1 置信度
  parameters: EditParameters;
  rawInput: string;
}

export type EditParameters =
  | UpdateTitleParams
  | UpdateContentParams
  | ReplaceImageParams
  | ReplaceChartParams
  | DeleteSlideParams
  | AddSlideParams
  | RegenerateSlideParams
  | BatchStyleParams;

interface UpdateTitleParams {
  type: "update_title";
  newTitle: string;
}

interface UpdateContentParams {
  type: "update_content";
  changes: Array<{
    field: "subtitle" | "bodyText" | "bulletPoints" | "speakerNotes";
    action: "replace" | "append" | "remove";
    value?: string | string[];
    index?: number; // 用于 bulletPoints 的特定项
  }>;
}

interface ReplaceImageParams {
  type: "replace_image";
  newPrompt: string;
  position?: "background" | "content";
  style?: string;
}

interface ReplaceChartParams {
  type: "replace_chart";
  newChartType: "bar" | "line" | "pie" | "donut" | "area";
}

interface DeleteSlideParams {
  type: "delete_slide";
}

interface AddSlideParams {
  type: "add_slide";
  afterIndex: number;
  title: string;
  content?: string[];
}

interface RegenerateSlideParams {
  type: "regenerate_slide";
  additionalPrompt?: string;
  regenerateImage?: boolean;
}

interface BatchStyleParams {
  type: "batch_style";
  changes: {
    primaryColor?: string;
    themeId?: string;
  };
}

// 编辑结果
export interface EditResult {
  success: boolean;
  editedSlideIndices: number[];
  document?: PPTDocument;
  error?: string;
  versionId?: string; // 新版本 ID
}

// ============================================
// 意图解析提示词
// ============================================

const INTENT_PARSE_PROMPT = `You are a presentation editing assistant. Parse the user's natural language edit instruction into a structured intent.

## Current Document Context
- Total slides: {totalSlides}
- Slide titles: {slideTitles}

## User Instruction
"{userInput}"

## Available Intent Types
1. update_title - Change slide title
2. update_content - Modify content (subtitle, body, bullets)
3. replace_image - Replace/regenerate image
4. replace_chart - Change chart type
5. delete_slide - Remove a slide
6. add_slide - Add new slide
7. regenerate_slide - Completely regenerate slide content
8. batch_style - Apply style changes to all slides

## Output Format (JSON)
{
  "type": "update_title|update_content|replace_image|replace_chart|delete_slide|add_slide|regenerate_slide|batch_style|unknown",
  "slideIndex": <0-based index, -1 for last slide, -2 for all slides>,
  "confidence": <0.0-1.0>,
  "parameters": {
    // For update_title:
    "newTitle": "new title text"

    // For update_content:
    "changes": [{"field": "bulletPoints", "action": "replace", "value": ["point1", "point2"]}]

    // For replace_image:
    "newPrompt": "image description",
    "position": "background|content"

    // For replace_chart:
    "newChartType": "bar|line|pie|doughnut|area"

    // For add_slide:
    "afterIndex": <index>,
    "title": "new slide title",
    "content": ["bullet1", "bullet2"]

    // For regenerate_slide:
    "additionalPrompt": "optional additional context",
    "regenerateImage": true|false

    // For batch_style:
    "changes": {"primaryColor": "#1e3a5f", "themeId": "modern"}
  }
}

## Parsing Rules
1. Page numbers in Chinese (第X页) are 1-based, convert to 0-based index
2. "最后一页" = slideIndex: -1
3. "第一页" = slideIndex: 0
4. "所有页" or "整个PPT" = slideIndex: -2 (for batch operations)
5. If unclear which slide, try to infer from context or ask for clarification (type: "unknown")

## Examples
- "把第3页的标题改成市场分析" → {"type":"update_title","slideIndex":2,"confidence":0.95,"parameters":{"newTitle":"市场分析"}}
- "删除最后一页" → {"type":"delete_slide","slideIndex":-1,"confidence":0.98,"parameters":{}}
- "第5页的柱状图换成饼图" → {"type":"replace_chart","slideIndex":4,"confidence":0.9,"parameters":{"newChartType":"pie"}}
- "重新生成第2页的图片" → {"type":"replace_image","slideIndex":1,"confidence":0.95,"parameters":{"newPrompt":"","position":"content"}}

Output valid JSON only.`;

@Injectable()
export class NaturalEditService {
  private readonly logger = new Logger(NaturalEditService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly aiModelService: AIModelService,
    private readonly slideContentService: SlideContentService,
    private readonly slideImageService: SlideImageService,
    private readonly slideRendererService: SlideRendererService,
  ) {}

  // ============================================
  // 主入口：执行自然语言编辑
  // ============================================

  /**
   * 执行自然语言编辑
   *
   * @param document 当前 PPT 文档
   * @param userInput 用户的自然语言指令
   * @returns 编辑结果
   */
  async executeEdit(
    document: PPTDocument,
    userInput: string,
  ): Promise<EditResult> {
    this.logger.log(`[executeEdit] Input: "${userInput}"`);

    try {
      // 1. 解析用户意图
      const intent = await this.parseIntent(document, userInput);
      this.logger.log(
        `[executeEdit] Parsed intent: ${intent.type}, slide: ${intent.slideIndex}, confidence: ${intent.confidence}`,
      );

      // 如果意图不明确，返回错误
      if (intent.type === "unknown" || intent.confidence < 0.5) {
        return {
          success: false,
          editedSlideIndices: [],
          error: `无法理解编辑指令: "${userInput}"。请尝试更具体的描述，例如"把第3页标题改成xxx"。`,
        };
      }

      // 2. 解析实际的页码索引
      const resolvedIndex = this.resolveSlideIndex(
        intent.slideIndex,
        document.slides.length,
      );

      // 3. 根据意图类型执行编辑
      const editedDocument = await this.applyEdit(
        document,
        intent,
        resolvedIndex,
      );

      // 4. 返回结果
      return {
        success: true,
        editedSlideIndices:
          resolvedIndex === -2
            ? document.slides.map((_, i) => i)
            : [resolvedIndex],
        document: editedDocument,
      };
    } catch (error: any) {
      this.logger.error(`[executeEdit] Error: ${error.message}`);
      return {
        success: false,
        editedSlideIndices: [],
        error: error.message || "编辑失败",
      };
    }
  }

  // ============================================
  // 意图解析
  // ============================================

  /**
   * 解析用户意图
   */
  async parseIntent(
    document: PPTDocument,
    userInput: string,
  ): Promise<EditIntent> {
    // 首先尝试规则引擎快速解析
    const ruleBasedIntent = this.tryRuleBasedParsing(document, userInput);
    if (ruleBasedIntent && ruleBasedIntent.confidence >= 0.9) {
      this.logger.log("[parseIntent] Used rule-based parsing");
      return ruleBasedIntent;
    }

    // 否则使用 AI 解析
    return await this.aiParseIntent(document, userInput);
  }

  /**
   * 规则引擎解析（快速路径）
   */
  private tryRuleBasedParsing(
    document: PPTDocument,
    userInput: string,
  ): EditIntent | null {
    const input = userInput.trim();

    // 解析页码
    const slideIndex = this.extractSlideIndex(input, document.slides.length);

    // 模式1: 修改标题 - "把第X页标题改成xxx" / "第X页标题改为xxx"
    const titleMatch = input.match(
      /(?:把)?第?(\d+|最后一?|一)页?(?:的)?标题(?:改成|改为|换成|修改为|设为)["'「]?(.+?)["'」]?$/,
    );
    if (titleMatch) {
      return {
        type: "update_title",
        slideIndex: slideIndex !== null ? slideIndex : 0,
        confidence: 0.95,
        parameters: { type: "update_title", newTitle: titleMatch[2].trim() },
        rawInput: input,
      };
    }

    // 模式2: 删除页面 - "删除第X页" / "删掉最后一页"
    const deleteMatch = input.match(/(?:删除|删掉|移除)第?(\d+|最后一?|一)页/);
    if (deleteMatch) {
      return {
        type: "delete_slide",
        slideIndex: slideIndex !== null ? slideIndex : -1,
        confidence: 0.98,
        parameters: { type: "delete_slide" },
        rawInput: input,
      };
    }

    // 模式3: 换图表类型 - "第X页换成饼图"
    const chartMatch = input.match(
      /第?(\d+|最后一?|一)页?.{0,10}(?:换成|改成|改为)(.+?图)/,
    );
    if (chartMatch) {
      const chartTypeMap: Record<string, ReplaceChartParams["newChartType"]> = {
        饼图: "pie",
        柱状图: "bar",
        条形图: "bar",
        折线图: "line",
        面积图: "area",
        环形图: "donut",
      };
      const chartType = chartTypeMap[chartMatch[2]];
      if (chartType) {
        return {
          type: "replace_chart",
          slideIndex: slideIndex !== null ? slideIndex : 0,
          confidence: 0.9,
          parameters: { type: "replace_chart", newChartType: chartType },
          rawInput: input,
        };
      }
    }

    // 模式4: 重新生成图片 - "重新生成第X页的图片"
    const imageMatch = input.match(
      /(?:重新生成|更换|换一下)第?(\d+|最后一?|一)页?.{0,5}(?:的)?图片/,
    );
    if (imageMatch) {
      return {
        type: "replace_image",
        slideIndex: slideIndex !== null ? slideIndex : 0,
        confidence: 0.9,
        parameters: {
          type: "replace_image",
          newPrompt: "",
          position: "content",
        },
        rawInput: input,
      };
    }

    // 模式5: 重新生成页面 - "重新生成第X页"
    const regenMatch = input.match(/(?:重新生成|重做)第?(\d+|最后一?|一)页/);
    if (regenMatch) {
      return {
        type: "regenerate_slide",
        slideIndex: slideIndex !== null ? slideIndex : 0,
        confidence: 0.85,
        parameters: { type: "regenerate_slide", regenerateImage: true },
        rawInput: input,
      };
    }

    return null;
  }

  /**
   * AI 意图解析
   */
  private async aiParseIntent(
    document: PPTDocument,
    userInput: string,
  ): Promise<EditIntent> {
    const textModel = await this.aiModelService.getDefaultTextModel();
    if (!textModel) {
      throw new Error("No text model available for intent parsing");
    }

    // 构建上下文
    const slideTitles = document.slides
      .map((s, i) => `${i + 1}. ${s.content.title}`)
      .join("\n");

    const prompt = INTENT_PARSE_PROMPT.replace(
      "{totalSlides}",
      String(document.slides.length),
    )
      .replace("{slideTitles}", slideTitles)
      .replace("{userInput}", userInput);

    // 调用 AI
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
    try {
      let cleaned = response.trim();
      const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        cleaned = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(cleaned);

      return {
        type: parsed.type || "unknown",
        slideIndex: parsed.slideIndex ?? 0,
        confidence: parsed.confidence ?? 0.5,
        parameters: { type: parsed.type, ...parsed.parameters },
        rawInput: userInput,
      };
    } catch (error) {
      this.logger.error(`[aiParseIntent] Parse error: ${error}`);
      return {
        type: "unknown",
        slideIndex: 0,
        confidence: 0,
        parameters: { type: "delete_slide" }, // 默认空参数
        rawInput: userInput,
      };
    }
  }

  /**
   * 从用户输入中提取页码索引
   */
  private extractSlideIndex(input: string, totalSlides: number): number | null {
    // 最后一页
    if (input.includes("最后一页") || input.includes("最后")) {
      return totalSlides - 1;
    }

    // 第一页
    if (input.includes("第一页") || input.includes("首页")) {
      return 0;
    }

    // 第N页
    const pageMatch = input.match(/第(\d+)页/);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      if (pageNum >= 1 && pageNum <= totalSlides) {
        return pageNum - 1; // 转换为 0-based
      }
    }

    return null;
  }

  /**
   * 解析页码索引
   */
  private resolveSlideIndex(index: number, totalSlides: number): number {
    if (index === -1) {
      return totalSlides - 1; // 最后一页
    }
    if (index === -2) {
      return -2; // 所有页面
    }
    if (index < 0 || index >= totalSlides) {
      throw new Error(`无效的页码: ${index + 1}，文档共 ${totalSlides} 页`);
    }
    return index;
  }

  // ============================================
  // 编辑执行
  // ============================================

  /**
   * 应用编辑
   */
  private async applyEdit(
    document: PPTDocument,
    intent: EditIntent,
    slideIndex: number,
  ): Promise<PPTDocument> {
    // 深拷贝文档
    const newDocument: PPTDocument = JSON.parse(JSON.stringify(document));

    switch (intent.type) {
      case "update_title":
        return await this.applyTitleEdit(
          newDocument,
          slideIndex,
          intent.parameters as UpdateTitleParams,
        );

      case "update_content":
        return await this.applyContentEdit(
          newDocument,
          slideIndex,
          intent.parameters as UpdateContentParams,
        );

      case "replace_image":
        return await this.applyImageEdit(
          newDocument,
          slideIndex,
          intent.parameters as ReplaceImageParams,
        );

      case "replace_chart":
        return await this.applyChartEdit(
          newDocument,
          slideIndex,
          intent.parameters as ReplaceChartParams,
        );

      case "delete_slide":
        return this.applyDeleteSlide(newDocument, slideIndex);

      case "add_slide":
        return await this.applyAddSlide(
          newDocument,
          intent.parameters as AddSlideParams,
        );

      case "regenerate_slide":
        return await this.applyRegenerateSlide(
          newDocument,
          slideIndex,
          intent.parameters as RegenerateSlideParams,
        );

      case "batch_style":
        return await this.applyBatchStyle(
          newDocument,
          intent.parameters as BatchStyleParams,
        );

      default:
        throw new Error(`不支持的编辑类型: ${intent.type}`);
    }
  }

  /**
   * 修改标题
   */
  private async applyTitleEdit(
    document: PPTDocument,
    slideIndex: number,
    params: UpdateTitleParams,
  ): Promise<PPTDocument> {
    const slide = document.slides[slideIndex];
    if (!slide) {
      throw new Error(`页面 ${slideIndex + 1} 不存在`);
    }

    // 记录编辑历史
    slide.editHistory.push({
      id: `edit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "content",
      before: { title: slide.content.title },
      after: { title: params.newTitle },
    });

    // 更新标题
    slide.content.title = params.newTitle;
    slide.isEdited = true;

    // 重新渲染 HTML
    slide.renderedHtml = await this.slideRendererService.renderSlide(
      { spec: slide.spec, content: slide.content, images: slide.images },
      document.theme,
    );

    // 更新文档时间戳
    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 修改内容
   */
  private async applyContentEdit(
    document: PPTDocument,
    slideIndex: number,
    params: UpdateContentParams,
  ): Promise<PPTDocument> {
    const slide = document.slides[slideIndex];
    if (!slide) {
      throw new Error(`页面 ${slideIndex + 1} 不存在`);
    }

    const before = { ...slide.content };

    for (const change of params.changes) {
      switch (change.field) {
        case "subtitle":
          if (change.action === "replace") {
            slide.content.subtitle = change.value as string;
          } else if (change.action === "remove") {
            slide.content.subtitle = undefined;
          }
          break;

        case "bodyText":
          if (change.action === "replace") {
            slide.content.bodyText = change.value as string;
          } else if (change.action === "append") {
            slide.content.bodyText =
              (slide.content.bodyText || "") + (change.value as string);
          } else if (change.action === "remove") {
            slide.content.bodyText = undefined;
          }
          break;

        case "bulletPoints":
          if (change.action === "replace") {
            slide.content.bulletPoints = change.value as string[];
          } else if (change.action === "append") {
            slide.content.bulletPoints = [
              ...(slide.content.bulletPoints || []),
              ...(Array.isArray(change.value)
                ? change.value
                : [change.value as string]),
            ];
          } else if (change.action === "remove" && change.index !== undefined) {
            slide.content.bulletPoints?.splice(change.index, 1);
          }
          break;

        case "speakerNotes":
          if (change.action === "replace") {
            slide.content.speakerNotes = change.value as string;
          }
          break;
      }
    }

    // 记录编辑历史
    slide.editHistory.push({
      id: `edit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "content",
      before,
      after: { ...slide.content },
    });

    slide.isEdited = true;

    // 重新渲染 HTML
    slide.renderedHtml = await this.slideRendererService.renderSlide(
      { spec: slide.spec, content: slide.content, images: slide.images },
      document.theme,
    );

    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 替换图片
   */
  private async applyImageEdit(
    document: PPTDocument,
    slideIndex: number,
    params: ReplaceImageParams,
  ): Promise<PPTDocument> {
    const slide = document.slides[slideIndex];
    if (!slide) {
      throw new Error(`页面 ${slideIndex + 1} 不存在`);
    }

    // 获取图像模型
    const imageModel = await this.aiModelService.getDefaultImageModel();
    if (!imageModel) {
      throw new Error("没有可用的图像模型");
    }

    // 生成新图片
    const imagePrompt =
      params.newPrompt ||
      slide.spec.imageSpec?.prompt ||
      `Professional image for: ${slide.content.title}`;

    const newImage = await this.slideImageService.generateImage(imagePrompt, {
      model: {
        id: imageModel.id,
        name: imageModel.displayName || imageModel.modelId,
        provider: imageModel.provider,
        modelId: imageModel.modelId,
        apiKey: imageModel.apiKey || "",
        apiEndpoint: imageModel.apiEndpoint,
      },
      style: params.style || document.theme.style,
      aspectRatio: "16:9",
      purpose: "content",
    });

    if (newImage) {
      // 根据位置替换或添加图片
      const position = params.position || "content";
      const existingIndex = slide.images.findIndex(
        (img) => img.position === position,
      );

      const imageData = {
        url: newImage.url,
        prompt: imagePrompt,
        modelUsed: imageModel.modelId,
        position,
        width: newImage.width || 1920,
        height: newImage.height || 1080,
        generatedAt: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        slide.images[existingIndex] = imageData;
      } else {
        slide.images.push(imageData);
      }

      // 记录编辑历史
      slide.editHistory.push({
        id: `edit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "image",
        before: { imageCount: slide.images.length - 1 },
        after: { imageCount: slide.images.length, newImage: imageData },
      });

      slide.isEdited = true;

      // 重新渲染 HTML
      slide.renderedHtml = await this.slideRendererService.renderSlide(
        { spec: slide.spec, content: slide.content, images: slide.images },
        document.theme,
      );
    }

    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 替换图表类型
   */
  private async applyChartEdit(
    document: PPTDocument,
    slideIndex: number,
    params: ReplaceChartParams,
  ): Promise<PPTDocument> {
    const slide = document.slides[slideIndex];
    if (!slide) {
      throw new Error(`页面 ${slideIndex + 1} 不存在`);
    }

    // 更新图表规格
    if (slide.spec.chartSpec) {
      const before = { chartType: slide.spec.chartSpec.type };
      // Map donut to compatible chart type
      const chartType =
        params.newChartType === "donut" ? "pie" : params.newChartType;
      slide.spec.chartSpec.type = chartType as typeof slide.spec.chartSpec.type;

      slide.editHistory.push({
        id: `edit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "content",
        before,
        after: { chartType: params.newChartType },
      });

      slide.isEdited = true;

      // 重新渲染 HTML
      slide.renderedHtml = await this.slideRendererService.renderSlide(
        { spec: slide.spec, content: slide.content, images: slide.images },
        document.theme,
      );
    }

    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 删除页面
   */
  private applyDeleteSlide(
    document: PPTDocument,
    slideIndex: number,
  ): PPTDocument {
    if (document.slides.length <= 1) {
      throw new Error("无法删除唯一的页面");
    }

    // 删除页面
    document.slides.splice(slideIndex, 1);

    // 重新编号
    document.slides.forEach((slide, i) => {
      slide.index = i;
      slide.spec.index = i;
    });

    // 更新元数据
    document.metadata.slideCount = document.slides.length;
    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 添加页面
   */
  private async applyAddSlide(
    document: PPTDocument,
    params: AddSlideParams,
  ): Promise<PPTDocument> {
    const insertIndex = params.afterIndex + 1;

    // 创建新页面
    const newSlide: GeneratedSlide = {
      id: `slide-${Date.now()}`,
      index: insertIndex,
      spec: {
        id: `spec-${Date.now()}`,
        index: insertIndex,
        purpose: "content",
        title: params.title,
        contentOutline: params.content || [],
        layoutType: "bullet_points",
        layoutReasoning: "User added slide",
        backgroundDecision: {
          type: "solid",
          reasoning: "User manually added slide with default background",
          colors: { primary: document.theme.colors.background },
        },
      },
      content: {
        title: params.title,
        bulletPoints: params.content,
      },
      images: [],
      isEdited: false,
      editHistory: [],
      generationMetadata: {
        textModelUsed: "user_added",
        contentGeneratedAt: new Date().toISOString(),
      },
    };

    // 渲染 HTML
    newSlide.renderedHtml = await this.slideRendererService.renderSlide(
      {
        spec: newSlide.spec,
        content: newSlide.content,
        images: newSlide.images,
      },
      document.theme,
    );

    // 插入页面
    document.slides.splice(insertIndex, 0, newSlide);

    // 重新编号
    document.slides.forEach((slide, i) => {
      slide.index = i;
      slide.spec.index = i;
    });

    // 更新元数据
    document.metadata.slideCount = document.slides.length;
    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 重新生成页面
   */
  private async applyRegenerateSlide(
    document: PPTDocument,
    slideIndex: number,
    params: RegenerateSlideParams,
  ): Promise<PPTDocument> {
    const slide = document.slides[slideIndex];
    if (!slide) {
      throw new Error(`页面 ${slideIndex + 1} 不存在`);
    }

    // 重新生成内容
    const sourceContent = document.originalInput.extractedContent || "";
    const newContent = await this.slideContentService.generateContent(
      slide.spec,
      sourceContent +
        (params.additionalPrompt ? `\n\n${params.additionalPrompt}` : ""),
      { language: document.language, includeSpeakerNotes: true },
    );

    const before = { ...slide.content };
    slide.content = newContent;

    // 如果需要重新生成图片
    if (params.regenerateImage && slide.spec.imageSpec) {
      const imageModel = await this.aiModelService.getDefaultImageModel();
      if (imageModel) {
        const newImage = await this.slideImageService.generateImage(
          slide.spec.imageSpec.prompt,
          {
            model: {
              id: imageModel.id,
              name: imageModel.displayName || imageModel.modelId,
              provider: imageModel.provider,
              modelId: imageModel.modelId,
              apiKey: imageModel.apiKey || "",
              apiEndpoint: imageModel.apiEndpoint,
            },
            style: document.theme.style,
            aspectRatio: slide.spec.imageSpec.aspectRatio,
            purpose: "content",
          },
        );

        if (newImage) {
          slide.images = [
            {
              url: newImage.url,
              prompt: slide.spec.imageSpec.prompt,
              modelUsed: imageModel.modelId,
              position: slide.spec.imageSpec.position,
              width: newImage.width || 1920,
              height: newImage.height || 1080,
              generatedAt: new Date().toISOString(),
            },
          ];
        }
      }
    }

    // 记录编辑历史
    slide.editHistory.push({
      id: `edit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: "content",
      before,
      after: { ...slide.content },
    });

    slide.isEdited = true;
    slide.generationMetadata.contentGeneratedAt = new Date().toISOString();

    // 重新渲染 HTML
    slide.renderedHtml = await this.slideRendererService.renderSlide(
      { spec: slide.spec, content: slide.content, images: slide.images },
      document.theme,
    );

    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  /**
   * 批量样式修改
   */
  private async applyBatchStyle(
    document: PPTDocument,
    params: BatchStyleParams,
  ): Promise<PPTDocument> {
    // 如果有主题 ID，切换主题
    if (params.changes.themeId) {
      // 这里需要引入 PPT_THEMES，暂时跳过
      this.logger.log(
        `[applyBatchStyle] Theme change requested: ${params.changes.themeId}`,
      );
    }

    // 如果有主色变更
    if (params.changes.primaryColor) {
      document.theme.colors.primary = params.changes.primaryColor;
    }

    // 重新渲染所有页面
    for (const slide of document.slides) {
      slide.renderedHtml = await this.slideRendererService.renderSlide(
        { spec: slide.spec, content: slide.content, images: slide.images },
        document.theme,
      );
    }

    document.metadata.updatedAt = new Date().toISOString();

    return document;
  }

  // ============================================
  // 辅助方法
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

    const response = await firstValueFrom(
      this.httpService.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3, // 低温度，更确定性
            maxOutputTokens: 1000,
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
    let url = model.apiEndpoint || "https://api.openai.com/v1/chat/completions";
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
                "You are a presentation editing assistant. Output valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
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
