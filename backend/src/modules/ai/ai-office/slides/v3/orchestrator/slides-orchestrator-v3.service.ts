/**
 * Slides Engine v3.0 - Main Orchestrator Service
 *
 * 核心编排服务，协调所有角色和技能完成 PPT 生成
 *
 * 三阶段生成管线：
 * Phase 1: 任务分解 (Task Decomposition)
 * Phase 2: 大纲规划 (Outline Planning)
 * Phase 3: 逐页渲染 (Page-by-Page Rendering)
 */

import { Injectable, Logger } from "@nestjs/common";
import { Subject, Observable } from "rxjs";

// Checkpoint
import { CheckpointService } from "../checkpoint/checkpoint.service";
import {
  CheckpointState,
  TaskDecomposition,
  OutlinePlan,
  PageState,
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
export class SlidesOrchestratorV3Service {
  private readonly logger = new Logger(SlidesOrchestratorV3Service.name);

  constructor(
    private readonly checkpoint: CheckpointService,
    private readonly architect: ArchitectService,
    private readonly writer: WriterService,
    private readonly renderer: RendererService,
    private readonly imageGenerator: ImageGeneratorService,
    private readonly reviewer: ReviewerService,
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
        const pageContent = await this.writer.fillContent({
          pageOutline,
          sourceText: pageSourceText,
          taskDecomposition,
          sessionId,
        });

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
        });

        const pageState: PageState = {
          pageNumber: pageOutline.pageNumber,
          outline: pageOutline,
          content: pageContent,
          design: renderResult.design,
          html: renderResult.html,
          images: imageResult.images,
          status: "completed",
        };

        pages.push(pageState);

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
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<CheckpointState> {
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
