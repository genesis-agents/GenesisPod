/**
 * Slides Engine - Main Orchestrator Service
 *
 * 核心编排服务，协调所有角色和技能完成 PPT 生成
 *
 * 三阶段生成管线：
 * Phase 1: 任务分解 (Task Decomposition)
 * Phase 2: 大纲规划 (Outline Planning)
 * Phase 3: 逐页渲染 (Page-by-Page Rendering)
 */

import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { Subject, Observable } from "rxjs";

// Checkpoint
import { CheckpointService } from "../checkpoint/checkpoint.service";
import {
  CheckpointState,
  TaskDecomposition,
  OutlinePlan,
  PageState,
  PageContent,
  GlobalStyles,
  StreamEvent,
  StreamEventType,
  QualityReport,
  GENSPARK_DESIGN_SYSTEM,
} from "../checkpoint/checkpoint.types";

// Roles
import { ArchitectService } from "../roles/architect.service";
import { WriterService } from "../roles/writer.service";
import { RendererService } from "../roles/renderer.service";
import { ImageGeneratorService } from "../roles/image-generator.service";
import { ReviewerService } from "../roles/reviewer.service";

// v4.0: Content-driven skills for feedback loop
import {
  ContentAnalyzerSkill,
  ContentAnalysisResult,
} from "../skills/content-analyzer.skill";
import { ContentCompressionSkill } from "../skills/content-compression.skill";

/**
 * 生成输入
 */
export interface GenerateInput {
  /** 用户 ID */
  userId: string;
  /** 标题 */
  title: string;
  /** 源文本内容 */
  sourceText: string;
  /** 用户需求描述 */
  userRequirement?: string;
  /** 目标页数 */
  targetPages?: number;
  /** 风格偏好 */
  stylePreference?: "dark" | "light" | "custom";
  /** 目标受众 */
  targetAudience?: string;
  /** 自定义样式 */
  customStyles?: Partial<GlobalStyles>;
  /** 主题ID，默认 'genspark-dark' */
  themeId?: string;
}

/**
 * 生成结果
 */
export interface GenerateResult {
  sessionId: string;
  checkpointId: string;
  pages: PageState[];
  qualityReport?: QualityReport;
  totalDurationMs: number;
}

/**
 * 生成进度
 */
export interface GenerationProgress {
  phase:
    | "task_decomposition"
    | "outline_planning"
    | "page_rendering"
    | "quality_review";
  phaseProgress: number; // 0-100
  overallProgress: number; // 0-100
  currentPage?: number;
  totalPages?: number;
  message: string;
}

@Injectable()
export class SlidesOrchestratorService {
  private readonly logger = new Logger(SlidesOrchestratorService.name);

  // v4.0: 反馈循环最大重试次数
  private readonly MAX_FEEDBACK_RETRIES = 2;

  constructor(
    private readonly checkpoint: CheckpointService,
    private readonly architect: ArchitectService,
    private readonly writer: WriterService,
    private readonly renderer: RendererService,
    private readonly imageGenerator: ImageGeneratorService,
    private readonly reviewer: ReviewerService,
    // v4.0: Content-driven skills
    @Inject(forwardRef(() => ContentAnalyzerSkill))
    private readonly contentAnalyzer: ContentAnalyzerSkill,
    @Inject(forwardRef(() => ContentCompressionSkill))
    private readonly contentCompression: ContentCompressionSkill,
  ) {}

  /**
   * 生成幻灯片（流式）
   */
  generateSlides(input: GenerateInput): Observable<StreamEvent> {
    const subject = new Subject<StreamEvent>();

    // 异步执行生成流程
    this.executeGeneration(input, subject).catch((error) => {
      this.logger.error("[generateSlides] Error:", error);
      subject.next(
        this.createEvent("error", input.title, { error: error.message }),
      );
      subject.complete();
    });

    return subject.asObservable();
  }

  /**
   * 执行生成流程
   */
  private async executeGeneration(
    input: GenerateInput,
    subject: Subject<StreamEvent>,
  ): Promise<void> {
    const startTime = Date.now();
    let sessionId = "";

    // 启动心跳定时器，每 15 秒发送一次心跳
    const heartbeatInterval = setInterval(() => {
      if (!subject.closed) {
        subject.next(
          this.createEvent("heartbeat", sessionId, {
            timestamp: new Date().toISOString(),
            elapsed: Date.now() - startTime,
          }),
        );
      }
    }, 15000);

    try {
      // 创建会话
      const session = await this.checkpoint.createSession(
        input.userId,
        input.title,
      );
      sessionId = session.id;

      subject.next(this.createEvent("session_created", sessionId, { session }));

      // Phase 1: 任务分解
      subject.next(
        this.createEvent("phase_started", sessionId, {
          phase: "task_decomposition",
        }),
      );

      const taskDecomposition = await this.architect.decomposeTask({
        sourceText: input.sourceText,
        userRequirement: input.userRequirement,
        targetPages: input.targetPages,
        stylePreference: input.stylePreference,
        targetAudience: input.targetAudience,
        sessionId,
      });

      // 保存检查点
      await this.checkpoint.create({
        sessionId,
        type: "task_decomposition",
        state: {
          taskDecomposition,
          pages: [],
          conversation: [],
        },
      });

      subject.next(
        this.createEvent("phase_completed", sessionId, {
          phase: "task_decomposition",
          data: taskDecomposition,
        }),
      );

      subject.next(
        this.createEvent("checkpoint_created", sessionId, {
          type: "task_decomposition",
          name: "任务分解完成",
        }),
      );

      // Phase 2: 大纲规划
      subject.next(
        this.createEvent("phase_started", sessionId, {
          phase: "outline_planning",
        }),
      );

      const outlinePlan = await this.architect.planOutline({
        taskDecomposition,
        sourceText: input.sourceText,
        sessionId,
      });

      // 应用自定义样式
      const globalStyles = this.mergeStyles(
        outlinePlan.globalStyles,
        input.customStyles,
      );
      outlinePlan.globalStyles = globalStyles;

      // 保存检查点
      await this.checkpoint.create({
        sessionId,
        type: "outline_confirmed",
        state: {
          taskDecomposition,
          outlinePlan,
          pages: outlinePlan.pages.map((outline) => ({
            pageNumber: outline.pageNumber,
            outline,
            status: "pending" as const,
          })),
          conversation: [],
          globalStyles,
        },
      });

      subject.next(
        this.createEvent("phase_completed", sessionId, {
          phase: "outline_planning",
          data: outlinePlan,
        }),
      );

      subject.next(
        this.createEvent("checkpoint_created", sessionId, {
          type: "outline_confirmed",
          name: "大纲规划完成",
        }),
      );

      // Phase 3: 逐页渲染
      subject.next(
        this.createEvent("phase_started", sessionId, {
          phase: "page_rendering",
        }),
      );

      const pages = await this.renderAllPages(
        outlinePlan,
        taskDecomposition,
        input.sourceText,
        globalStyles,
        sessionId,
        subject,
        input.themeId,
      );

      subject.next(
        this.createEvent("phase_completed", sessionId, {
          phase: "page_rendering",
          data: { completedPages: pages.length },
        }),
      );

      // Phase 4: 质量审核
      subject.next(
        this.createEvent("phase_started", sessionId, {
          phase: "quality_review",
        }),
      );

      const qualityReport = await this.reviewer.reviewAll(
        pages,
        outlinePlan,
        sessionId,
      );

      subject.next(
        this.createEvent("phase_completed", sessionId, {
          phase: "quality_review",
          data: qualityReport,
        }),
      );

      // 保存最终检查点
      const finalCheckpoint = await this.checkpoint.create({
        sessionId,
        type: "batch_rendered",
        state: {
          taskDecomposition,
          outlinePlan,
          pages,
          conversation: [],
          globalStyles,
        },
        metadata: {
          trigger: "auto",
          description: "Generation completed",
          durationMs: Date.now() - startTime,
        },
      });

      // 完成
      subject.next(
        this.createEvent("complete", sessionId, {
          sessionId,
          checkpointId: finalCheckpoint.id,
          totalPages: pages.length,
          qualityScore: qualityReport.score,
          durationMs: Date.now() - startTime,
        }),
      );
    } catch (error) {
      this.logger.error("[executeGeneration] Error:", error);
      subject.next(
        this.createEvent("error", sessionId, {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      clearInterval(heartbeatInterval);
      subject.complete();
    }
  }

  /**
   * 渲染所有页面
   */
  private async renderAllPages(
    outlinePlan: OutlinePlan,
    taskDecomposition: TaskDecomposition,
    sourceText: string,
    globalStyles: GlobalStyles,
    sessionId: string,
    subject: Subject<StreamEvent>,
    themeId?: string,
  ): Promise<PageState[]> {
    const pages: PageState[] = [];
    const totalPages = outlinePlan.pages.length;

    for (let i = 0; i < totalPages; i++) {
      const pageOutline = outlinePlan.pages[i];

      subject.next(
        this.createEvent("page_started", sessionId, {
          pageNumber: pageOutline.pageNumber,
          totalPages,
        }),
      );

      try {
        // Step 1: 提取页面相关内容
        const pageSourceText = this.writer.extractSourceTextForPage(
          pageOutline,
          sourceText,
          taskDecomposition,
        );

        // Step 2: 内容填充
        let pageContent = await this.writer.fillContent({
          pageOutline,
          sourceText: pageSourceText,
          taskDecomposition,
          sessionId,
        });

        // v4.0: Step 2.5 - 反馈循环：分析内容并在必要时压缩
        const feedbackResult = await this.applyFeedbackLoop(
          pageContent,
          pageOutline.templateType,
          pageOutline.pageNumber,
        );
        pageContent = feedbackResult.content;
        const additionalPages = feedbackResult.additionalPages;

        // 如果内容被拆分成多页，记录日志
        if (additionalPages.length > 0) {
          this.logger.log(
            `[renderAllPages] Page ${pageOutline.pageNumber} was split into ${additionalPages.length + 1} pages due to content overflow`,
          );
        }

        // Step 3: 四步设计和 HTML 生成
        // Step 3.5: 先生成图像（背景图等），以便在 HTML 中使用
        const imageResult = await this.imageGenerator.generateForPage({
          pageOutline,
          globalStyles,
          sessionId,
        });

        // 日志：显示图片生成结果
        this.logger.log(
          `[renderAllPages] Page ${pageOutline.pageNumber} image result: ${imageResult.images.length} images, ${imageResult.errors.length} errors`,
        );
        if (imageResult.images.length > 0) {
          this.logger.log(
            `[renderAllPages] Page ${pageOutline.pageNumber} images: ${imageResult.images.map((img) => `${img.position}:${img.url?.substring(0, 50)}...`).join(", ")}`,
          );
        }
        if (imageResult.errors.length > 0) {
          this.logger.warn(
            `[renderAllPages] Page ${pageOutline.pageNumber} image errors: ${imageResult.errors.join(", ")}`,
          );
        }

        // Step 4: 渲染 HTML，传入生成的图片
        const renderResult = await this.renderer.renderPage({
          pageOutline,
          pageContent,
          globalStyles,
          sessionId,
          images: imageResult.images, // 传入图片供 HTML 渲染使用
          themeId,
        });

        const pageState: PageState = {
          pageNumber: pageOutline.pageNumber,
          outline: pageOutline,
          content: pageContent,
          design: renderResult.design,
          html: renderResult.html,
          images: imageResult.images,
          status: "completed",
          // v4.0: 包含内容分析信息
          contentAnalysis: {
            recommendedLayout: feedbackResult.analysis.recommendedLayout,
            totalSections: feedbackResult.analysis.totalSections,
            totalCharacters: feedbackResult.analysis.totalCharacters,
            wasCompressed: feedbackResult.wasCompressed,
            wasSplit: feedbackResult.wasSplit,
          },
        };

        pages.push(pageState);

        // v4.0: 处理拆分出的额外页面
        // 注意：这些页面会在后续迭代中自然处理，这里只是记录
        // 实际拆分逻辑在 applyFeedbackLoop 中处理

        subject.next(
          this.createEvent("page_completed", sessionId, {
            pageNumber: pageOutline.pageNumber,
            totalPages,
            html: pageState.html,
            content: pageState.content,
            design: pageState.design,
            images: pageState.images, // 添加图片信息到事件
          }),
        );

        // 每 5 页保存一次检查点
        if (
          (i + 1) % 5 === 0 &&
          this.checkpoint.shouldAutoSave("page_rendered", i + 1)
        ) {
          await this.checkpoint.create({
            sessionId,
            type: "page_rendered",
            state: {
              taskDecomposition,
              outlinePlan,
              pages,
              conversation: [],
              globalStyles,
            },
          });

          subject.next(
            this.createEvent("checkpoint_created", sessionId, {
              type: "page_rendered",
              pageNumber: pageOutline.pageNumber,
              name: `渲染到第 ${pageOutline.pageNumber} 页`,
            }),
          );
        }

        // 更新进度
        subject.next(
          this.createEvent("progress_update", sessionId, {
            phase: "page_rendering",
            current: i + 1,
            total: totalPages,
            percentage: Math.round(((i + 1) / totalPages) * 100),
          }),
        );
      } catch (error) {
        this.logger.error(
          `[renderAllPages] Error rendering page ${pageOutline.pageNumber}:`,
          error,
        );

        const errorState: PageState = {
          pageNumber: pageOutline.pageNumber,
          outline: pageOutline,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };

        pages.push(errorState);

        subject.next(
          this.createEvent("error", sessionId, {
            pageNumber: pageOutline.pageNumber,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    return pages;
  }

  /**
   * 从检查点恢复
   * @returns 包含 state, sessionId, checkpointId 的对象
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<{
    state: CheckpointState;
    sessionId: string;
    checkpointId: string;
  }> {
    return this.checkpoint.restore(checkpointId);
  }

  /**
   * 获取会话的所有检查点
   */
  async getCheckpoints(sessionId: string) {
    return this.checkpoint.list({ sessionId });
  }

  /**
   * 重新渲染指定页面
   */
  async rerenderPage(
    sessionId: string,
    pageNumber: number,
    sourceText: string,
    themeId?: string,
  ): Promise<PageState> {
    const latestCheckpoint =
      await this.checkpoint.getLatestCheckpoint(sessionId);

    if (!latestCheckpoint) {
      throw new Error("No checkpoint found for session");
    }

    const state = latestCheckpoint.state;
    const pageOutline = state.outlinePlan?.pages.find(
      (p) => p.pageNumber === pageNumber,
    );

    if (!pageOutline) {
      throw new Error(`Page ${pageNumber} not found in outline`);
    }

    const globalStyles = state.globalStyles || GENSPARK_DESIGN_SYSTEM;

    // 重新填充内容
    const pageContent = await this.writer.fillContent({
      pageOutline,
      sourceText,
      taskDecomposition: state.taskDecomposition,
      sessionId,
    });

    // 先生成图像（背景图等），以便在 HTML 中使用
    const imageResult = await this.imageGenerator.generateForPage({
      pageOutline,
      globalStyles,
      sessionId,
    });

    // 渲染 HTML，传入生成的图片
    const renderResult = await this.renderer.renderPage({
      pageOutline,
      pageContent,
      globalStyles,
      sessionId,
      images: imageResult.images, // 传入图片供 HTML 渲染使用
      themeId,
    });

    const newPageState: PageState = {
      pageNumber,
      outline: pageOutline,
      content: pageContent,
      design: renderResult.design,
      html: renderResult.html,
      images: imageResult.images,
      status: "completed",
    };

    // 更新检查点
    const updatedPages = state.pages.map((p) =>
      p.pageNumber === pageNumber ? newPageState : p,
    );

    await this.checkpoint.create({
      sessionId,
      type: "user_modified",
      state: {
        ...state,
        pages: updatedPages,
      },
      metadata: {
        trigger: "user",
        description: `Re-rendered page ${pageNumber}`,
      },
    });

    return newPageState;
  }

  // ============================================================================
  // v4.0: 反馈循环机制
  // ============================================================================

  /**
   * 应用反馈循环
   *
   * 分析内容，检测溢出，必要时压缩或拆分
   * 返回处理后的内容和分析结果
   */
  private async applyFeedbackLoop(
    content: PageContent,
    templateType: string,
    pageNumber: number,
  ): Promise<{
    content: PageContent;
    additionalPages: PageContent[];
    analysis: ContentAnalysisResult;
    wasCompressed: boolean;
    wasSplit: boolean;
  }> {
    // 1. 分析内容
    const analysis = this.contentAnalyzer.analyze(content);

    this.logger.debug(
      `[applyFeedbackLoop] Page ${pageNumber}: layout=${analysis.recommendedLayout}, ` +
        `sections=${analysis.totalSections}, chars=${analysis.totalCharacters}, ` +
        `fitsOnOnePage=${analysis.estimatedCapacity.fitsOnOnePage}`,
    );

    // 2. 检测溢出
    const overflowResult = this.contentCompression.willOverflow(
      content,
      templateType,
    );

    // 如果没有溢出，直接返回
    if (!overflowResult.overflow) {
      return {
        content,
        additionalPages: [],
        analysis,
        wasCompressed: false,
        wasSplit: false,
      };
    }

    this.logger.log(
      `[applyFeedbackLoop] Page ${pageNumber} overflow detected: ${overflowResult.reason}, excess=${overflowResult.excessAmount}`,
    );

    // 3. 尝试压缩
    let retryCount = 0;
    let currentContent = content;
    let wasCompressed = false;

    while (retryCount < this.MAX_FEEDBACK_RETRIES) {
      // 应用自动压缩
      currentContent = this.contentCompression.autoCompress(
        currentContent,
        templateType,
      );
      wasCompressed = true;

      // 重新检测溢出
      const recheckResult = this.contentCompression.willOverflow(
        currentContent,
        templateType,
      );

      if (!recheckResult.overflow) {
        this.logger.log(
          `[applyFeedbackLoop] Page ${pageNumber} compressed successfully after ${retryCount + 1} attempts`,
        );
        return {
          content: currentContent,
          additionalPages: [],
          analysis: this.contentAnalyzer.analyze(currentContent),
          wasCompressed: true,
          wasSplit: false,
        };
      }

      retryCount++;
    }

    // 4. 压缩无法解决，尝试拆分
    this.logger.log(
      `[applyFeedbackLoop] Page ${pageNumber} cannot be compressed, attempting split`,
    );

    const splitPages = this.contentCompression.splitIntoPages(
      currentContent,
      templateType,
    );

    if (splitPages.length > 1) {
      this.logger.log(
        `[applyFeedbackLoop] Page ${pageNumber} split into ${splitPages.length} pages`,
      );

      return {
        content: splitPages[0], // 第一页作为主内容
        additionalPages: splitPages.slice(1), // 其余作为额外页
        analysis: this.contentAnalyzer.analyze(splitPages[0]),
        wasCompressed,
        wasSplit: true,
      };
    }

    // 5. 拆分也无法解决，返回压缩后的内容
    this.logger.warn(
      `[applyFeedbackLoop] Page ${pageNumber} could not be adequately compressed or split, returning best-effort content`,
    );

    return {
      content: currentContent,
      additionalPages: [],
      analysis: this.contentAnalyzer.analyze(currentContent),
      wasCompressed,
      wasSplit: false,
    };
  }

  /**
   * 合并样式
   */
  private mergeStyles(
    base: GlobalStyles,
    custom?: Partial<GlobalStyles>,
  ): GlobalStyles {
    if (!custom) return base;
    return { ...base, ...custom };
  }

  /**
   * 创建流事件
   */
  private createEvent(
    type: StreamEventType,
    sessionId: string,
    data: unknown,
  ): StreamEvent {
    return {
      type,
      timestamp: new Date(),
      data,
      sessionId,
    };
  }
}
