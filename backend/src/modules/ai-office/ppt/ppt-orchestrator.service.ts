/**
 * PPT Orchestrator Service
 *
 * PPT 生成总调度器 - AI Office 3.0 核心
 *
 * 职责：
 * 1. 协调整个 PPT 生成流程
 * 2. 管理内容提取、规划、生成、渲染各阶段
 * 3. 支持流式输出进度
 * 4. 处理错误和重试
 *
 * 复用 AI-Image 模块：
 * - ContentExtractorService: 多源内容提取
 * - DataFetchingService: 智能数据获取
 */

import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ContentExtractorService } from "../../ai-image/content-extractor.service";
import { DataFetchingService } from "../../ai-image/data-fetching.service";
import { AIModelService } from "../ai-model.service";
import { SlidePlanningService } from "./slide-planning.service";
import { SlideContentService } from "./slide-content.service";
import { SlideImageService } from "./slide-image.service";
import { SlideRendererService } from "./slide-renderer.service";
import {
  PPTGenerationInput,
  PPTDocument,
  PPTOutline,
  SlideSpec,
  GeneratedSlide,
  PPTTheme,
  PPT_THEMES,
  PPTStreamEvent,
  GeneratedSlideImage,
} from "./ppt.types";
import { randomUUID } from "crypto";

@Injectable()
export class PPTOrchestratorService {
  private readonly logger = new Logger(PPTOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly dataFetching: DataFetchingService,
    private readonly aiModelService: AIModelService,
    private readonly slidePlanning: SlidePlanningService,
    private readonly slideContent: SlideContentService,
    private readonly slideImage: SlideImageService,
    private readonly slideRenderer: SlideRendererService,
  ) {}

  /**
   * 生成 PPT（流式）
   *
   * 返回 Observable，实时推送生成进度
   */
  generatePPTStream(input: PPTGenerationInput): Observable<PPTStreamEvent> {
    const subject = new Subject<PPTStreamEvent>();

    // 异步执行生成流程
    this.executeGeneration(input, subject)
      .catch((error) => {
        this.logger.error("[generatePPTStream] Error:", error);
        subject.next({
          type: "error",
          timestamp: new Date().toISOString(),
          error: {
            code: "GENERATION_FAILED",
            message: error.message || "PPT generation failed",
          },
        });
      })
      .finally(() => {
        subject.complete();
      });

    return subject.asObservable();
  }

  /**
   * 生成 PPT（非流式，返回完整结果）
   */
  async generatePPT(input: PPTGenerationInput): Promise<PPTDocument> {
    const events: PPTStreamEvent[] = [];
    const stream = this.generatePPTStream(input);

    return new Promise((resolve, reject) => {
      stream.subscribe({
        next: (event) => events.push(event),
        error: (error) => reject(error),
        complete: () => {
          const completeEvent = events.find((e) => e.type === "complete");
          if (completeEvent?.result?.pptId) {
            // 返回生成的文档
            this.getPPTDocument(completeEvent.result.pptId)
              .then(resolve)
              .catch(reject);
          } else {
            const errorEvent = events.find((e) => e.type === "error");
            reject(
              new Error(errorEvent?.error?.message || "Generation failed"),
            );
          }
        },
      });
    });
  }

  /**
   * 执行生成流程
   */
  private async executeGeneration(
    input: PPTGenerationInput,
    subject: Subject<PPTStreamEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    const pptId = randomUUID();

    this.logger.log(`[executeGeneration] Starting PPT generation: ${pptId}`);

    // 发送初始进度
    this.emitProgress(subject, "outline", 0, "Initializing...");

    // ============================================
    // Phase 1: 内容提取
    // ============================================
    this.emitProgress(subject, "outline", 5, "Extracting content...");

    const extractedContent = await this.extractContent(input);

    this.logger.log(
      `[executeGeneration] Extracted ${extractedContent.length} characters of content`,
    );

    // ============================================
    // Phase 1.5: 智能数据获取（复用 AI-Image）
    // ============================================
    this.emitProgress(subject, "outline", 10, "Fetching real-time data...");

    const dataResult =
      await this.dataFetching.processDataFetching(extractedContent);
    const enrichedContent = dataResult.enrichedContent;

    if (dataResult.needsFetching) {
      this.logger.log(
        `[executeGeneration] Fetched ${dataResult.fetchedData.length} data items`,
      );
    }

    // ============================================
    // Phase 2: 生成大纲
    // ============================================
    this.emitProgress(subject, "outline", 15, "Generating outline...");

    const outline = await this.slidePlanning.generateOutline(enrichedContent, {
      slideCount: input.slideCount,
      language: input.language,
      targetAudience: input.targetAudience,
      presentationStyle: input.presentationStyle,
    });

    this.logger.log(
      `[executeGeneration] Generated outline with ${outline.slides.length} slides`,
    );

    // 发送大纲完成事件
    subject.next({
      type: "outline_complete",
      timestamp: new Date().toISOString(),
      outline,
    });

    // ============================================
    // Phase 3: 获取主题
    // ============================================
    const theme = this.getTheme(input.themeId, outline.suggestedTheme);

    // ============================================
    // Phase 4: 逐页规划
    // ============================================
    this.emitProgress(subject, "planning", 20, "Planning slides...");

    const slideSpecs = await this.slidePlanning.planAllSlides(outline, theme);

    // 发送每页规划完成事件
    for (const spec of slideSpecs) {
      subject.next({
        type: "slide_planned",
        timestamp: new Date().toISOString(),
        slide: {
          index: spec.index,
          spec,
        },
      });
    }

    this.logger.log(`[executeGeneration] Planned ${slideSpecs.length} slides`);

    // ============================================
    // Phase 5: 并行生成内容和图像
    // ============================================
    this.emitProgress(subject, "content", 30, "Generating content...");

    const generatedSlides: GeneratedSlide[] = [];
    const totalSlides = slideSpecs.length;

    // 获取模型信息
    const textModel = await this.aiModelService.getDefaultTextModel(
      input.textModelId,
    );
    const imageModel =
      input.includeImages !== false
        ? await this.aiModelService.getDefaultImageModel(input.imageModelId)
        : null;

    // 逐页生成（保持顺序，但内容和图像并行）
    for (let i = 0; i < slideSpecs.length; i++) {
      const spec = slideSpecs[i];
      const progressBase = 30 + (i / totalSlides) * 60;

      this.emitProgress(
        subject,
        "content",
        progressBase,
        `Generating slide ${i + 1}/${totalSlides}: ${spec.title}`,
        i + 1,
        totalSlides,
      );

      // 并行生成内容和图像
      const [content, images] = await Promise.all([
        this.slideContent.generateContent(spec, enrichedContent, {
          language: input.language || "auto",
          includeSpeakerNotes: input.includeSpeakerNotes !== false,
        }),
        this.generateSlideImages(
          spec,
          theme,
          imageModel,
          input.includeImages !== false,
        ),
      ]);

      // 发送内容完成事件
      subject.next({
        type: "slide_content_complete",
        timestamp: new Date().toISOString(),
        slide: {
          index: spec.index,
          content,
        },
      });

      // 如果有图像，发送图像完成事件
      if (images.length > 0) {
        subject.next({
          type: "slide_image_complete",
          timestamp: new Date().toISOString(),
          slide: {
            index: spec.index,
            images,
          },
        });
      }

      // 渲染 HTML
      const renderedHtml = await this.slideRenderer.renderSlide(
        {
          spec,
          content,
          images,
        },
        theme,
      );

      // 组装完整幻灯片
      const generatedSlide: GeneratedSlide = {
        id: spec.id,
        index: spec.index,
        spec,
        content,
        images,
        renderedHtml,
        isEdited: false,
        editHistory: [],
        generationMetadata: {
          textModelUsed: textModel?.name || "unknown",
          imageModelUsed: imageModel?.name,
          contentGeneratedAt: new Date().toISOString(),
          imagesGeneratedAt:
            images.length > 0 ? new Date().toISOString() : undefined,
        },
      };

      generatedSlides.push(generatedSlide);

      // 发送单页完成事件
      subject.next({
        type: "slide_complete",
        timestamp: new Date().toISOString(),
        slide: {
          index: spec.index,
          spec,
          content,
          images,
          renderedHtml,
        },
      });
    }

    // ============================================
    // Phase 6: 组装并保存文档
    // ============================================
    this.emitProgress(subject, "rendering", 95, "Finalizing presentation...");

    const pptDocument = await this.assemblePPTDocument(
      pptId,
      input,
      outline,
      theme,
      generatedSlides,
      textModel,
      imageModel,
    );

    // 保存到数据库
    await this.savePPTDocument(pptDocument);

    const duration = Date.now() - startTime;

    this.logger.log(
      `[executeGeneration] Completed in ${duration}ms, ${generatedSlides.length} slides`,
    );

    // 发送完成事件
    subject.next({
      type: "complete",
      timestamp: new Date().toISOString(),
      progress: {
        phase: "complete",
        percentage: 100,
        message: "PPT generation completed!",
      },
      result: {
        pptId,
        totalSlides: generatedSlides.length,
        duration,
      },
    });
  }

  /**
   * 提取内容（复用 AI-Image 的 ContentExtractor）
   */
  private async extractContent(input: PPTGenerationInput): Promise<string> {
    const contentParts: string[] = [];

    // 1. 直接提示词
    if (input.prompt) {
      contentParts.push(input.prompt);
    }

    // 2. URL 内容提取
    if (input.urls && input.urls.length > 0) {
      for (const url of input.urls) {
        try {
          const urlContent = await this.contentExtractor.extractFromUrl(url);
          contentParts.push(`[Source: ${url}]\n${urlContent}`);
        } catch (error) {
          this.logger.warn(`Failed to extract content from URL: ${url}`, error);
        }
      }
    }

    // 3. 文件内容提取
    if (input.files && input.files.length > 0) {
      for (const file of input.files) {
        try {
          const fileContent = await this.contentExtractor.extractFromFile(
            file.buffer,
            file.mimeType,
            file.filename,
          );
          contentParts.push(`[File: ${file.filename}]\n${fileContent}`);
        } catch (error) {
          this.logger.warn(
            `Failed to extract content from file: ${file.filename}`,
            error,
          );
        }
      }
    }

    return contentParts.join("\n\n---\n\n");
  }

  /**
   * 生成幻灯片图像
   */
  private async generateSlideImages(
    spec: SlideSpec,
    theme: PPTTheme,
    imageModel: any,
    includeImages: boolean,
  ): Promise<GeneratedSlideImage[]> {
    const images: GeneratedSlideImage[] = [];

    if (!includeImages || !imageModel) {
      return images;
    }

    // 生成背景图像（如果需要）
    if (
      spec.backgroundDecision.type === "ai_generated" &&
      spec.backgroundDecision.aiConfig
    ) {
      try {
        const bgImage = await this.slideImage.generateImage(
          spec.backgroundDecision.aiConfig.prompt,
          {
            model: imageModel,
            style: theme.style,
            aspectRatio: "16:9",
            purpose: "background",
          },
        );

        if (bgImage) {
          images.push({
            url: bgImage.url,
            prompt: spec.backgroundDecision.aiConfig.prompt,
            modelUsed: imageModel.name,
            position: "background",
            width: bgImage.width,
            height: bgImage.height,
            generatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to generate background image for slide ${spec.index}`,
          error,
        );
      }
    }

    // 生成内容图像（如果需要）
    if (spec.imageSpec) {
      try {
        const contentImage = await this.slideImage.generateImage(
          spec.imageSpec.prompt,
          {
            model: imageModel,
            style: spec.imageSpec.style,
            aspectRatio: spec.imageSpec.aspectRatio,
            purpose: "content",
          },
        );

        if (contentImage) {
          images.push({
            url: contentImage.url,
            prompt: spec.imageSpec.prompt,
            modelUsed: imageModel.name,
            position: spec.imageSpec.position,
            width: contentImage.width,
            height: contentImage.height,
            generatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to generate content image for slide ${spec.index}`,
          error,
        );
      }
    }

    return images;
  }

  /**
   * 获取主题
   */
  private getTheme(themeId?: string, suggestedTheme?: string): PPTTheme {
    // 优先使用用户指定的主题
    if (themeId && PPT_THEMES[themeId]) {
      return PPT_THEMES[themeId];
    }

    // 其次使用 AI 建议的主题
    if (suggestedTheme && PPT_THEMES[suggestedTheme]) {
      return PPT_THEMES[suggestedTheme];
    }

    // 默认使用专业主题
    return PPT_THEMES.professional;
  }

  /**
   * 组装 PPT 文档
   */
  private async assemblePPTDocument(
    pptId: string,
    input: PPTGenerationInput,
    outline: PPTOutline,
    theme: PPTTheme,
    slides: GeneratedSlide[],
    textModel: any,
    imageModel: any,
  ): Promise<PPTDocument> {
    // 计算统计信息
    const wordCount = slides.reduce((acc, slide) => {
      const content = slide.content;
      let count = 0;
      if (content.title) count += content.title.length;
      if (content.bodyText) count += content.bodyText.length;
      if (content.bulletPoints) count += content.bulletPoints.join(" ").length;
      if (content.speakerNotes) count += content.speakerNotes.length;
      return acc + count;
    }, 0);

    const imageCount = slides.reduce(
      (acc, slide) => acc + slide.images.length,
      0,
    );

    const now = new Date().toISOString();

    return {
      id: pptId,
      userId: input.userId || "anonymous",
      title: outline.title,
      subtitle: outline.subtitle,
      theme,
      aspectRatio: input.aspectRatio || "16:9",
      language: (input.language as "zh" | "en" | "mixed") || "mixed",
      originalInput: {
        prompt: input.prompt,
        urls: input.urls,
        files: input.files?.map((f) => f.filename),
      },
      outline,
      slides,
      generationConfig: {
        textModelId: textModel?.id || "",
        textModelName: textModel?.name || "unknown",
        imageModelId: imageModel?.id,
        imageModelName: imageModel?.name,
        includeImages: input.includeImages !== false,
        includeSpeakerNotes: input.includeSpeakerNotes !== false,
        style: theme.style,
      },
      versions: [
        {
          id: randomUUID(),
          timestamp: now,
          type: "auto",
          trigger: "ai_generation",
          description: "Initial generation",
          slides,
          metadata: {
            slideCount: slides.length,
            wordCount,
          },
        },
      ],
      currentVersionId: "", // 将在保存时设置
      status: "completed",
      metadata: {
        slideCount: slides.length,
        wordCount,
        imageCount,
        estimatedDuration: outline.estimatedDuration,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      },
    };
  }

  /**
   * 保存 PPT 文档
   */
  private async savePPTDocument(document: PPTDocument): Promise<void> {
    // 设置当前版本 ID
    document.currentVersionId = document.versions[0].id;

    // Map PPT document status to Prisma enum
    const prismaStatus = this.mapStatusToPrisma(document.status);

    await this.prisma.officeDocument.create({
      data: {
        id: document.id,
        userId: document.userId,
        type: "PPT",
        title: document.title,
        status: prismaStatus,
        content: document as any, // 存储完整文档结构
        metadata: document.metadata as any,
        createdAt: new Date(document.metadata.createdAt),
        updatedAt: new Date(document.metadata.updatedAt),
      },
    });

    this.logger.log(`[savePPTDocument] Saved PPT document: ${document.id}`);
  }

  /**
   * 获取 PPT 文档
   */
  async getPPTDocument(pptId: string): Promise<PPTDocument> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: pptId },
    });

    if (!doc) {
      throw new Error(`PPT document not found: ${pptId}`);
    }

    return doc.content as unknown as PPTDocument;
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    subject: Subject<PPTStreamEvent>,
    phase: string,
    percentage: number,
    message: string,
    currentSlide?: number,
    totalSlides?: number,
  ): void {
    subject.next({
      type: "progress",
      timestamp: new Date().toISOString(),
      progress: {
        phase,
        percentage,
        message,
        currentSlide,
        totalSlides,
      },
    });
  }

  // ============================================
  // 编辑功能
  // ============================================

  /**
   * 重新生成单页
   */
  async regenerateSlide(
    pptId: string,
    slideIndex: number,
    options: {
      newPrompt?: string;
      regenerateContent?: boolean;
      regenerateImage?: boolean;
    },
  ): Promise<GeneratedSlide> {
    const document = await this.getPPTDocument(pptId);
    const slide = document.slides[slideIndex];

    if (!slide) {
      throw new Error(`Slide not found at index: ${slideIndex}`);
    }

    const imageModel = await this.aiModelService.getDefaultImageModel();

    // 重新生成内容
    if (options.regenerateContent) {
      const newContent = await this.slideContent.generateContent(
        {
          ...slide.spec,
          contentOutline: options.newPrompt
            ? [options.newPrompt]
            : slide.spec.contentOutline,
        },
        document.originalInput.prompt || "",
        {
          language: document.language,
          includeSpeakerNotes: document.generationConfig.includeSpeakerNotes,
        },
      );

      slide.content = newContent;
    }

    // 重新生成图像
    if (options.regenerateImage && imageModel) {
      const newImages = await this.generateSlideImages(
        slide.spec,
        document.theme,
        imageModel,
        true,
      );

      slide.images = newImages;
    }

    // 重新渲染
    slide.renderedHtml = await this.slideRenderer.renderSlide(
      {
        spec: slide.spec,
        content: slide.content,
        images: slide.images,
      },
      document.theme,
    );

    // 记录编辑历史
    slide.isEdited = true;
    slide.editHistory.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: options.regenerateImage ? "image" : "content",
      before: null,
      after: options.newPrompt || "regenerated",
    });

    // 更新文档
    document.slides[slideIndex] = slide;
    document.metadata.updatedAt = new Date().toISOString();

    await this.updatePPTDocument(document);

    return slide;
  }

  /**
   * 更新 PPT 文档
   */
  private async updatePPTDocument(document: PPTDocument): Promise<void> {
    await this.prisma.officeDocument.update({
      where: { id: document.id },
      data: {
        content: document as any,
        metadata: document.metadata as any,
        updatedAt: new Date(document.metadata.updatedAt),
      },
    });
  }

  /**
   * Map PPT document status to Prisma OfficeDocumentStatus enum
   */
  private mapStatusToPrisma(
    status: PPTDocument["status"],
  ): "DRAFT" | "GENERATING" | "COMPLETED" | "ARCHIVED" {
    const statusMap: Record<
      PPTDocument["status"],
      "DRAFT" | "GENERATING" | "COMPLETED" | "ARCHIVED"
    > = {
      draft: "DRAFT",
      generating: "GENERATING",
      completed: "COMPLETED",
      failed: "ARCHIVED", // Map failed to archived
    };
    return statusMap[status] || "DRAFT";
  }
}
