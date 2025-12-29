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
 * 5. 🆕 素材分析与绑定（内容质量保障）
 * 6. 🆕 全局一致性控制
 *
 * 复用 AI-Image 模块：
 * - ContentExtractorService: 多源内容提取
 * - DataFetchingService: 智能数据获取
 */

import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  ContentExtractorService,
  DataFetchingService,
} from "../../../../../common/content-processing";
import { AIModelService } from "../../core";
import { SlidePlanningService } from "../planning/slide-planning.service";
import { SlideContentService } from "../generation/slide-content.service";
import { SlideImageService } from "../generation/slide-image.service";
import { SlideRendererService } from "../rendering/slide-renderer.service";
import {
  SourceAnalysisService,
  SourceAnalysis,
} from "../generation/source-analysis.service";
import { ContentAnalyzerService } from "../template-selection/content-analyzer.service";
import { TemplateSelectorService } from "../services/template-selector.service";
import { LayoutAdjusterService } from "../services/layout-adjuster.service";
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
  SlideDataPoint,
} from "../types/slides.types";
import { randomUUID } from "crypto";

@Injectable()
export class SlidesOrchestratorService {
  private readonly logger = new Logger(SlidesOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentExtractor: ContentExtractorService,
    private readonly dataFetching: DataFetchingService,
    private readonly aiModelService: AIModelService,
    private readonly slidePlanning: SlidePlanningService,
    private readonly slideContent: SlideContentService,
    private readonly slideImage: SlideImageService,
    private readonly slideRenderer: SlideRendererService,
    private readonly sourceAnalysis: SourceAnalysisService,
    // 🆕 Phase 5 Services
    private readonly contentAnalyzer: ContentAnalyzerService,
    private readonly templateSelector: TemplateSelectorService,
    private readonly layoutAdjuster: LayoutAdjusterService,
  ) {
    // 确保 Phase 5 服务可用（用于后续模板选择功能）
    this.logger.debug(
      `[Phase5] Services initialized: templateSelector=${!!this.templateSelector}`,
    );
  }

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
   * 🆕 执行生成流程（Phase 5 重构版 - 4层管道架构）
   *
   * 流程：
   * 1. 内容分析 → 提取特征
   * 2. 大纲规划 → 金字塔结构
   * 3. 模板选择 → 内容→模板匹配
   * 4. 内容生成 → 按模板生成
   * 5. 图片生成 → 背景+插图
   */
  async *generateSlides(
    options: PPTGenerationInput,
  ): AsyncGenerator<PPTStreamEvent> {
    const startTime = Date.now();
    const pptId = randomUUID();

    this.logger.log(`[generateSlides] Starting Phase 5 generation: ${pptId}`);

    try {
      // ============================================
      // Step 1: 内容分析
      // ============================================
      yield {
        type: "content_analyzing",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "analyzing",
          percentage: 5,
          message: "分析内容特征...",
        },
      };

      const extractedContent = await this.extractContent(options);
      const features = await this.contentAnalyzer.analyze(
        extractedContent,
        options.urls,
      );

      yield {
        type: "content_analyzed",
        timestamp: new Date().toISOString(),
        features: {
          topic: features.topic,
          contentType: features.contentType,
          suggestedSlideRange: features.suggestedSlideRange,
        },
        progress: {
          phase: "analyzing",
          percentage: 10,
          message: `特征提取完成: ${features.topic}`,
        },
      };

      this.logger.log(
        `[generateSlides] Content analysis complete: topic="${features.topic}", type=${features.contentType}`,
      );

      // ============================================
      // Step 2: 大纲规划
      // ============================================
      yield {
        type: "outline_generating",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "planning",
          percentage: 15,
          message: "规划PPT结构...",
        },
      };

      const outline = await this.slidePlanning.generateOutline(
        extractedContent,
        {
          slideCount: options.slideCount || features.suggestedSlideRange.max,
          language: options.language,
          targetAudience: options.targetAudience || features.targetAudience,
          presentationStyle: options.presentationStyle,
        },
      );

      yield {
        type: "outline_complete",
        timestamp: new Date().toISOString(),
        outline,
        progress: {
          phase: "planning",
          percentage: 25,
          message: `大纲生成完成: ${outline.slides.length} 页`,
        },
      };

      this.logger.log(
        `[generateSlides] Outline generated with ${outline.slides.length} slides`,
      );

      // ============================================
      // Step 3: 模板选择（使用现有的快速规划）
      // ============================================
      yield {
        type: "template_selecting",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "template",
          percentage: 30,
          message: "选择页面模板...",
        },
      };

      // 注意：模板选择功能已集成到 SlidePlanningService.planAllSlides 中
      // 这里仅发送事件以保持流程一致性

      yield {
        type: "template_selected",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "template",
          percentage: 35,
          message: "模板选择完成",
        },
      };

      this.logger.log(
        `[generateSlides] Template selection integrated into planning`,
      );

      // ============================================
      // Step 4: 内容生成
      // ============================================
      const theme = this.getTheme(options.themeId, outline.suggestedTheme);
      const generatedSlides: GeneratedSlide[] = [];

      const textModel = await this.aiModelService.getDefaultTextModel(
        options.textModelId,
      );
      let imageModel = null;

      if (options.includeImages !== false) {
        try {
          imageModel = await this.aiModelService.getDefaultImageModel(
            options.imageModelId,
          );
        } catch (error: any) {
          this.logger.warn(
            `[generateSlides] Image model not available: ${error.message}`,
          );
        }
      }

      // 使用 SlideSpec（已经包含布局决策）
      const slideSpecs = await this.slidePlanning.planAllSlides(outline, theme);

      for (let i = 0; i < slideSpecs.length; i++) {
        const spec = slideSpecs[i];
        const progressBase = 40 + (i / slideSpecs.length) * 45;

        yield {
          type: "slide_generating",
          timestamp: new Date().toISOString(),
          slide: { index: i },
          progress: {
            phase: "content",
            percentage: progressBase,
            message: `生成第 ${i + 1}/${slideSpecs.length} 页: ${spec.title}`,
            currentSlide: i + 1,
            totalSlides: slideSpecs.length,
          },
        };

        // 并行生成内容和图像
        const [content, images] = await Promise.all([
          this.slideContent.generateContent(spec, extractedContent, {
            language: options.language || "auto",
            includeSpeakerNotes: options.includeSpeakerNotes !== false,
          }),
          this.generateSlideImages(
            spec,
            theme,
            imageModel,
            options.includeImages !== false,
          ),
        ]);

        yield {
          type: "slide_content_complete",
          timestamp: new Date().toISOString(),
          slide: {
            index: i,
            content,
          },
        };

        if (images.length > 0) {
          yield {
            type: "slide_image_complete",
            timestamp: new Date().toISOString(),
            slide: {
              index: i,
              images,
            },
          };
        }

        // 渲染 HTML
        const renderedHtml = await this.slideRenderer.renderSlide(
          { spec, content, images },
          theme,
        );

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

        yield {
          type: "slide_complete",
          timestamp: new Date().toISOString(),
          slide: {
            index: i,
            spec,
            content,
            images,
            renderedHtml,
          },
        };
      }

      // ============================================
      // Step 5: 布局调整与全局样式
      // ============================================
      yield {
        type: "progress",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "rendering",
          percentage: 90,
          message: "应用全局样式...",
        },
      };

      // 布局调整
      await this.layoutAdjuster.adjustAllSlides(generatedSlides);

      // 全局样式
      await this.applyGlobalStyleToSlides(generatedSlides, options);

      // ============================================
      // Step 6: 组装并保存文档
      // ============================================
      yield {
        type: "progress",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "finalizing",
          percentage: 95,
          message: "保存演示文稿...",
        },
      };

      const pptDocument = await this.assemblePPTDocument(
        pptId,
        options,
        outline,
        theme,
        generatedSlides,
        textModel,
        imageModel,
      );

      await this.savePPTDocument(pptDocument);

      const duration = Date.now() - startTime;

      this.logger.log(
        `[generateSlides] Completed in ${duration}ms, ${generatedSlides.length} slides`,
      );

      yield {
        type: "complete",
        timestamp: new Date().toISOString(),
        progress: {
          phase: "complete",
          percentage: 100,
          message: "PPT生成完成!",
        },
        result: {
          pptId,
          totalSlides: generatedSlides.length,
          duration,
        },
      };
    } catch (error) {
      this.logger.error("[generateSlides] Error:", error);
      yield {
        type: "error",
        timestamp: new Date().toISOString(),
        error: {
          code: "GENERATION_FAILED",
          message:
            error instanceof Error ? error.message : "PPT generation failed",
        },
      };
      throw error;
    }
  }

  /**
   * 执行生成流程（保留旧版本以确保向后兼容）
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
    // 🆕 Phase 1.7: 素材分析（P0 内容质量保障）
    // ============================================
    this.emitProgress(subject, "outline", 12, "Analyzing source material...");

    let sourceAnalysisResult: SourceAnalysis | null = null;

    // 仅当有足够内容时进行素材分析
    if (enrichedContent.length > 500) {
      try {
        sourceAnalysisResult = await this.sourceAnalysis.analyzeSource(
          enrichedContent,
          {
            language: input.language === "zh" ? "zh" : "en",
            extractChapters: true,
            extractDataPoints: true,
            generateInsights: true,
            extractQuotes: true,
          },
        );

        this.logger.log(
          `[executeGeneration] Source analysis complete: ${sourceAnalysisResult.chapters.length} chapters, ${sourceAnalysisResult.dataPoints.length} data points`,
        );
      } catch (error) {
        this.logger.warn(
          `[executeGeneration] Source analysis failed, continuing without binding: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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

    // 🆕 Phase 4.5: 素材绑定到 SlideSpec（P0 内容质量保障）
    if (sourceAnalysisResult && sourceAnalysisResult.chapters.length > 0) {
      this.bindSourceToSlideSpecs(slideSpecs, sourceAnalysisResult);
      this.logger.log(
        `[executeGeneration] Bound source material to ${slideSpecs.filter((s) => s.sourceRef).length} slides`,
      );
    }

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

    let imageModel = null;
    if (input.includeImages !== false) {
      try {
        imageModel = await this.aiModelService.getDefaultImageModel(
          input.imageModelId,
        );
        this.logger.log(
          `[executeGeneration] Image model loaded: ${imageModel?.name || "none"} (${imageModel?.modelId || "none"}), provider: ${imageModel?.provider || "none"}, hasApiKey: ${!!imageModel?.apiKey}`,
        );
      } catch (error: any) {
        this.logger.error(
          `[executeGeneration] Failed to get image model: ${error.message}`,
        );
        // 继续生成，但不包含图片
      }
    } else {
      this.logger.log(
        `[executeGeneration] Image generation disabled by user (includeImages=${input.includeImages})`,
      );
    }

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

      // 🆕 内容验证（如果启用了素材绑定）
      let contentValidation = undefined;
      if (spec.mustNotFabricate && spec.sourceExcerpt) {
        contentValidation = this.slideContent.validateContent(content, spec);
        if (!contentValidation.passed) {
          this.logger.warn(
            `[executeGeneration] Content validation warning for slide ${spec.index}: ${contentValidation.message}`,
          );
        }
      }

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
        // 🆕 内容验证结果
        contentValidation,
      };

      generatedSlides.push(generatedSlide);

      // 发送单页完成事件
      this.logger.log(
        `[executeGeneration] Emitting slide_complete for slide ${spec.index}, images: ${images.length}, imageUrls: ${images.map((img) => img.url?.slice(0, 50)).join(", ") || "none"}`,
      );
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
    // 🆕 Phase 5.5: 应用全局样式一致性
    // ============================================
    this.emitProgress(subject, "rendering", 92, "Applying global style...");

    await this.applyGlobalStyleToSlides(generatedSlides, input);

    this.logger.log(
      `[executeGeneration] Applied global style to ${generatedSlides.length} slides`,
    );

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

    // 详细日志 - 调试图片生成
    this.logger.log(
      `[generateSlideImages] Slide ${spec.index}: includeImages=${includeImages}, hasImageModel=${!!imageModel}, bgType=${spec.backgroundDecision?.type}, hasImageSpec=${!!spec.imageSpec}`,
    );

    if (!includeImages) {
      this.logger.warn(
        `[generateSlideImages] Skipping slide ${spec.index}: includeImages is false`,
      );
      return images;
    }

    if (!imageModel) {
      this.logger.error(
        `[generateSlideImages] Skipping slide ${spec.index}: No image model available!`,
      );
      return images;
    }

    // 生成背景图像（如果需要）
    if (
      spec.backgroundDecision.type === "ai_generated" &&
      spec.backgroundDecision.aiConfig
    ) {
      this.logger.log(
        `[generateSlideImages] Slide ${spec.index}: Generating AI background with prompt: ${spec.backgroundDecision.aiConfig.prompt.slice(0, 100)}...`,
      );
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
          this.logger.log(
            `[generateSlideImages] Slide ${spec.index}: Background image generated successfully: ${bgImage.url}`,
          );
          images.push({
            url: bgImage.url,
            prompt: spec.backgroundDecision.aiConfig.prompt,
            modelUsed: imageModel.name,
            position: "background",
            width: bgImage.width,
            height: bgImage.height,
            generatedAt: new Date().toISOString(),
          });
        } else {
          this.logger.warn(
            `[generateSlideImages] Slide ${spec.index}: Background image returned null`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[generateSlideImages] Slide ${spec.index}: Failed to generate background image: ${error.message}`,
          error.stack,
        );
      }
    } else {
      this.logger.debug(
        `[generateSlideImages] Slide ${spec.index}: No AI background needed (type=${spec.backgroundDecision?.type})`,
      );
    }

    // 生成内容图像（如果需要）
    if (spec.imageSpec) {
      this.logger.log(
        `[generateSlideImages] Slide ${spec.index}: Generating content image with prompt: ${spec.imageSpec.prompt.slice(0, 100)}...`,
      );
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
          this.logger.log(
            `[generateSlideImages] Slide ${spec.index}: Content image generated successfully: ${contentImage.url}`,
          );
          images.push({
            url: contentImage.url,
            prompt: spec.imageSpec.prompt,
            modelUsed: imageModel.name,
            position: spec.imageSpec.position,
            width: contentImage.width,
            height: contentImage.height,
            generatedAt: new Date().toISOString(),
          });
        } else {
          this.logger.warn(
            `[generateSlideImages] Slide ${spec.index}: Content image returned null`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[generateSlideImages] Slide ${spec.index}: Failed to generate content image: ${error.message}`,
          error.stack,
        );
      }
    } else {
      this.logger.debug(
        `[generateSlideImages] Slide ${spec.index}: No content image spec defined`,
      );
    }

    this.logger.log(
      `[generateSlideImages] Slide ${spec.index}: Generated ${images.length} images total`,
    );

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

    // 处理 userId - 如果是 "anonymous" 或无效，尝试找一个系统用户
    let validUserId = document.userId;
    if (validUserId === "anonymous" || !validUserId) {
      // 查找任意有效用户作为临时所有者（生产环境应该使用真实用户认证）
      const systemUser = await this.prisma.user.findFirst({
        select: { id: true },
      });
      if (systemUser) {
        validUserId = systemUser.id;
      } else {
        this.logger.warn(
          "[savePPTDocument] No users found, skipping database save",
        );
        return; // 无法保存，但不阻断生成流程
      }
    }

    await this.prisma.officeDocument.create({
      data: {
        id: document.id,
        userId: validUserId,
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
   * 更新文档元数据
   */
  async updateDocumentMetadata(
    pptId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const doc = await this.prisma.officeDocument.findUnique({
      where: { id: pptId },
      select: { metadata: true },
    });

    if (!doc) {
      throw new Error(`PPT document not found: ${pptId}`);
    }

    const existingMetadata = (doc.metadata as Record<string, any>) || {};
    const updatedMetadata = { ...existingMetadata, ...metadata };

    await this.prisma.officeDocument.update({
      where: { id: pptId },
      data: {
        metadata: updatedMetadata,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `[updateDocumentMetadata] Updated metadata for ${pptId}: ${Object.keys(metadata).join(", ")}`,
    );
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
  async updatePPTDocument(document: PPTDocument): Promise<void> {
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

  // ============================================
  // 🆕 全局样式应用（生成后一致性控制）
  // ============================================

  /**
   * 应用全局样式到所有幻灯片
   */
  private async applyGlobalStyleToSlides(
    slides: GeneratedSlide[],
    input: PPTGenerationInput,
  ): Promise<void> {
    // 构建默认全局样式配置
    const globalStyle = {
      footer: {
        show: true,
        format: "{page}/{total}",
        position: "bottom-right",
        style: {
          fontSize: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#666666",
        },
      },
      pageNumber: {
        show: true,
        format: "number" as const,
        position: "footer" as const,
      },
      safeArea: {
        top: 80,
        bottom: 80,
        left: 100,
        right: 100,
      },
      typography: {
        headingFont: "Inter, system-ui, sans-serif",
        bodyFont: "Inter, system-ui, sans-serif",
        monoFont: "Fira Code, monospace",
      },
    };

    // 为每个幻灯片应用样式
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // 跳过封面页和结尾页的页脚
      const skipFooter =
        slide.spec.purpose === "title" ||
        slide.spec.purpose === "closing" ||
        slide.spec.purpose === "qna";

      // 应用页脚
      if (globalStyle.footer.show && !skipFooter) {
        const footerText = globalStyle.footer.format
          .replace("{page}", String(i + 1))
          .replace("{total}", String(slides.length));

        (slide.content as any).footer = {
          text: footerText,
          position: globalStyle.footer.position,
          style: globalStyle.footer.style,
        };
      }

      // 应用安全区
      (slide.content as any).safeArea = globalStyle.safeArea;

      // 应用字体配置
      (slide.content as any).typography = globalStyle.typography;

      // 重新渲染 HTML 以应用新样式
      slide.renderedHtml = await this.slideRenderer.renderSlide(
        {
          spec: slide.spec,
          content: slide.content,
          images: slide.images,
        },
        slides[0]?.spec
          ? this.getTheme(input.themeId)
          : this.getTheme(undefined),
      );
    }

    this.logger.debug(
      `[applyGlobalStyleToSlides] Applied footer and safe area to ${slides.filter((s) => s.content.footer).length} slides`,
    );
  }

  // ============================================
  // 🆕 素材绑定方法（P0 内容质量保障）
  // ============================================

  /**
   * 将素材分析结果绑定到幻灯片规格
   *
   * 绑定策略：
   * 1. 根据幻灯片标题与章节标题的相似度匹配
   * 2. 将章节内容和数据点绑定到对应的幻灯片
   * 3. 启用 mustNotFabricate 标记，强制内容生成约束
   */
  private bindSourceToSlideSpecs(
    slideSpecs: SlideSpec[],
    sourceAnalysis: SourceAnalysis,
  ): void {
    const { chapters, dataPoints } = sourceAnalysis;

    // 跳过标题页、结尾页、问答页
    const contentSlides = slideSpecs.filter(
      (spec) =>
        spec.purpose !== "title" &&
        spec.purpose !== "closing" &&
        spec.purpose !== "qna",
    );

    // 为每个内容页分配章节
    for (const spec of contentSlides) {
      // 查找最匹配的章节
      const matchedChapter = this.findMatchingChapter(spec, chapters);

      if (matchedChapter) {
        // 绑定章节信息
        spec.sourceRef = matchedChapter.id;
        spec.sourceExcerpt = matchedChapter.content.slice(0, 2000); // 限制长度

        // 绑定该章节的数据点
        const chapterDataPoints = dataPoints
          .filter((dp) => dp.chapterId === matchedChapter.id)
          .map(
            (dp): SlideDataPoint => ({
              id: dp.id,
              value: dp.value,
              type: dp.type,
              context: dp.context,
              required: true, // 章节数据点默认必须包含
            }),
          );

        spec.requiredDataPoints = chapterDataPoints;

        // 启用素材约束
        spec.mustNotFabricate = true;

        this.logger.debug(
          `[bindSourceToSlideSpecs] Slide ${spec.index} bound to chapter "${matchedChapter.title}" with ${chapterDataPoints.length} data points`,
        );
      }
    }

    // 处理未匹配章节的幻灯片 - 分配全局数据点
    const unboundSlides = contentSlides.filter((spec) => !spec.sourceRef);
    const globalDataPoints = dataPoints
      .filter((dp) => !dp.chapterId)
      .map(
        (dp): SlideDataPoint => ({
          id: dp.id,
          value: dp.value,
          type: dp.type,
          context: dp.context,
          required: false, // 全局数据点可选
        }),
      );

    if (globalDataPoints.length > 0 && unboundSlides.length > 0) {
      // 平均分配全局数据点
      const pointsPerSlide = Math.ceil(
        globalDataPoints.length / unboundSlides.length,
      );

      for (let i = 0; i < unboundSlides.length; i++) {
        const spec = unboundSlides[i];
        const start = i * pointsPerSlide;
        const end = Math.min(start + pointsPerSlide, globalDataPoints.length);
        spec.requiredDataPoints = globalDataPoints.slice(start, end);
      }
    }
  }

  /**
   * 查找与幻灯片最匹配的章节
   */
  private findMatchingChapter(
    spec: SlideSpec,
    chapters: SourceAnalysis["chapters"],
  ): SourceAnalysis["chapters"][0] | null {
    if (chapters.length === 0) return null;

    let bestMatch: SourceAnalysis["chapters"][0] | null = null;
    let bestScore = 0;

    for (const chapter of chapters) {
      // 计算标题相似度
      const titleScore = this.calculateTextSimilarity(
        spec.title,
        chapter.title,
      );

      // 计算大纲与章节要点的相似度
      const outlineScore = this.calculateOutlineChapterScore(
        spec.contentOutline,
        chapter.keyPoints,
      );

      const totalScore = titleScore * 0.6 + outlineScore * 0.4;

      if (totalScore > bestScore && totalScore > 55) {
        // 阈值 55%（提高精度，减少错误绑定）
        bestScore = totalScore;
        bestMatch = chapter;
      }
    }

    return bestMatch;
  }

  /**
   * 计算文本相似度（简单的词汇重叠）
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(
      text1
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );
    const tokens2 = new Set(
      text2
        .toLowerCase()
        .split(/[\s,.\-!?;:，。！？；：]+/)
        .filter((t) => t.length > 1),
    );

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let matchCount = 0;
    for (const token of tokens1) {
      if (tokens2.has(token)) matchCount++;
    }

    return (matchCount / Math.max(tokens1.size, tokens2.size)) * 100;
  }

  /**
   * 计算大纲与章节要点的匹配分数
   */
  private calculateOutlineChapterScore(
    outline: string[],
    keyPoints: string[],
  ): number {
    if (outline.length === 0 || keyPoints.length === 0) return 0;

    let totalScore = 0;

    for (const outlineItem of outline) {
      let bestItemScore = 0;
      for (const keyPoint of keyPoints) {
        const score = this.calculateTextSimilarity(outlineItem, keyPoint);
        if (score > bestItemScore) {
          bestItemScore = score;
        }
      }
      totalScore += bestItemScore;
    }

    return totalScore / outline.length;
  }
}
