/**
 * Slides Engine v4.0 - Page Generation Pipeline Skill
 *
 * 页面生成流水线：协调逐页生成和渲染
 * - 获取大纲规划中的所有页面
 * - 为每页生成内容
 * - 为每页渲染 HTML
 * - 每完成一页就通过回调发送事件
 *
 * 这是实现"完成一页发送一页"的核心组件
 */

import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import {
  OutlinePlan,
  PageOutline,
  PageContent,
} from "../checkpoint/checkpoint.types";
import { TemplateRenderingSkill } from "./template-rendering.skill";
import { ContentCompressionSkill } from "./content-compression.skill";

/**
 * 单页生成结果
 */
export interface PageGenerationResult {
  pageNumber: number;
  title: string;
  html: string;
  templateId: string;
  status: "completed" | "failed";
  error?: string;
  duration: number;
}

/**
 * 页面流水线输出
 */
export interface PagePipelineOutput {
  pages: PageGenerationResult[];
  totalPages: number;
  completedPages: number;
  failedPages: number;
  totalDuration: number;
}

/**
 * 页面生成事件（用于流式输出）
 */
export interface PageGeneratedEvent {
  type: "page:generated";
  pageNumber: number;
  totalPages: number;
  title: string;
  html: string;
  templateId: string;
  sessionId: string;
}

/**
 * MissionOrchestrator 传递的输入格式
 */
interface OrchestratorInput {
  task?: string;
  context?: {
    input?: {
      sourceText?: string;
      userRequirement?: string;
      themeId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  previousOutputs?: Record<string, unknown>;
}

@Injectable()
export class PagePipelineSkill
  implements ISkill<OrchestratorInput, PagePipelineOutput>
{
  private readonly logger = new Logger(PagePipelineSkill.name);

  readonly id = "slides-page-pipeline";
  readonly name = "页面生成流水线";
  readonly description = "协调逐页生成内容和渲染 HTML，支持流式输出";
  readonly layer: SkillLayer = "orchestration";
  readonly domain = "slides";
  readonly tags = ["slides", "pipeline", "streaming", "generation"];
  readonly version = "1.0.0";

  constructor(
    private readonly templateRendering: TemplateRenderingSkill,
    private readonly contentCompression: ContentCompressionSkill,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 执行页面生成流水线
   */
  async execute(
    input: OrchestratorInput,
    context: SkillContext,
  ): Promise<SkillResult<PagePipelineOutput>> {
    const startTime = Date.now();
    const sessionId = context.sessionId || "unknown";

    // ★★★ 关键诊断日志 ★★★
    this.logger.warn(
      `[execute] ★★★ PAGE-PIPELINE CALLED ★★★ sessionId=${sessionId}, eventEmitter exists=${!!this.eventEmitter}`,
    );
    this.logger.warn(
      `[execute] ★★★ INPUT KEYS: ${Object.keys(input).join(", ")}`,
    );
    if (input.previousOutputs) {
      this.logger.warn(
        `[execute] ★★★ previousOutputs KEYS: ${Object.keys(input.previousOutputs).join(", ")}`,
      );
    }
    const inputWithOutline = input as OrchestratorInput & { outline?: unknown };
    this.logger.warn(
      `[execute] ★★★ input.outline exists=${!!inputWithOutline.outline}, type=${typeof inputWithOutline.outline}`,
    );

    this.logger.log(
      `[execute] Starting page pipeline for session ${sessionId}`,
    );

    // 1. 提取必要数据
    const { outlinePlan, sourceText, themeId } = this.extractInputData(input);

    if (!outlinePlan || !outlinePlan.pages || outlinePlan.pages.length === 0) {
      this.logger.error("[execute] No outline plan or pages found");
      return {
        success: false,
        error: {
          code: "NO_OUTLINE_PLAN",
          message: "未找到大纲规划或页面列表",
          retryable: false,
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
        },
      };
    }

    const totalPages = outlinePlan.pages.length;
    const pages: PageGenerationResult[] = [];
    let completedPages = 0;
    let failedPages = 0;

    // 2. 逐页生成
    for (let i = 0; i < totalPages; i++) {
      const pageOutline = outlinePlan.pages[i];
      const pageNumber = pageOutline.pageNumber || i + 1;
      const pageStartTime = Date.now();

      this.logger.log(
        `[execute] Processing page ${pageNumber}/${totalPages}: ${pageOutline.title}`,
      );

      try {
        // 2a. 生成页面内容
        const pageContent = await this.generatePageContent(
          pageOutline,
          sourceText,
          context,
        );

        // 2b. 渲染 HTML
        const renderResult = await this.renderPage(
          pageOutline,
          pageContent,
          themeId,
          context,
        );

        if (renderResult.success && renderResult.data) {
          const htmlLength = renderResult.data.html?.length || 0;
          this.logger.log(
            `[execute] ★ Page ${pageNumber} rendered successfully, HTML length: ${htmlLength}`,
          );

          const result: PageGenerationResult = {
            pageNumber,
            title: pageOutline.title,
            html: renderResult.data.html,
            templateId: renderResult.data.templateId,
            status: "completed",
            duration: Date.now() - pageStartTime,
          };

          pages.push(result);
          completedPages++;

          // 2c. 发送页面生成事件（流式输出的关键）
          this.emitPageGenerated({
            type: "page:generated",
            pageNumber,
            totalPages,
            title: pageOutline.title,
            html: renderResult.data.html,
            templateId: renderResult.data.templateId,
            sessionId,
          });

          this.logger.log(
            `[execute] Page ${pageNumber} completed in ${result.duration}ms`,
          );
        } else {
          throw new Error(renderResult.error?.message || "渲染失败");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "未知错误";

        this.logger.error(
          `[execute] Page ${pageNumber} failed: ${errorMessage}`,
        );

        pages.push({
          pageNumber,
          title: pageOutline.title,
          html: "",
          templateId: "",
          status: "failed",
          error: errorMessage,
          duration: Date.now() - pageStartTime,
        });

        failedPages++;

        // 发送失败事件
        this.eventEmitter.emit("slides.page.failed", {
          pageNumber,
          totalPages,
          title: pageOutline.title,
          error: errorMessage,
          sessionId,
        });
      }
    }

    // 3. 返回结果
    const output: PagePipelineOutput = {
      pages,
      totalPages,
      completedPages,
      failedPages,
      totalDuration: Date.now() - startTime,
    };

    this.logger.log(
      `[execute] Pipeline completed: ${completedPages}/${totalPages} pages, ${failedPages} failed`,
    );

    return {
      success: failedPages === 0,
      data: output,
      metadata: {
        executionId: context.executionId,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * 提取输入数据
   */
  private extractInputData(input: OrchestratorInput): {
    outlinePlan: OutlinePlan | null;
    sourceText: string;
    themeId: string;
  } {
    const previousOutputs = input.previousOutputs || {};
    const contextInput = input.context?.input || {};

    // ★ 修复：从多个位置获取大纲规划（包括 input.outline）
    const inputWithOutline = input as OrchestratorInput & {
      outline?: OutlinePlan;
      sourceText?: string;
      themeId?: string;
    };

    let outlinePlan =
      // 1. 直接在 input.outline（SlidesTeamMember.buildSkillInput 设置）
      inputWithOutline.outline ||
      // 2. 从 previousOutputs 获取（完整 OutlinePlan）
      (previousOutputs["slides-outline-planning"] as OutlinePlan) ||
      (previousOutputs["outline-planning"] as OutlinePlan) ||
      // 3. 从 context 获取
      (input.context?.outlinePlan as OutlinePlan) ||
      (input.context?.outline as OutlinePlan) ||
      null;

    // 如果大纲在 data 字段中（嵌套结构）
    if (!outlinePlan && previousOutputs["slides-outline-planning"]) {
      const maybeNested = previousOutputs["slides-outline-planning"] as {
        data?: OutlinePlan;
      };
      if (maybeNested.data?.pages) {
        outlinePlan = maybeNested.data;
      }
    }

    // ★ 修复：sourceText 和 themeId 也可能在顶层
    const sourceText =
      inputWithOutline.sourceText ||
      (contextInput.sourceText as string) ||
      (input.context?.sourceText as string) ||
      "";
    const themeId =
      inputWithOutline.themeId ||
      (contextInput.themeId as string) ||
      (input.context?.themeId as string) ||
      "genspark-dark";

    this.logger.log(
      `[extractInputData] ★ Found outline: ${!!outlinePlan}, pages: ${outlinePlan?.pages?.length || 0}, sourceText: ${sourceText.length} chars, themeId: ${themeId}`,
    );
    if (!outlinePlan) {
      this.logger.error(
        `[extractInputData] ✗ OUTLINE NOT FOUND! input keys: ${Object.keys(input).join(", ")}, previousOutputs keys: ${Object.keys(input.previousOutputs || {}).join(", ")}`,
      );
    }

    return { outlinePlan, sourceText, themeId };
  }

  /**
   * 生成页面内容
   * 使用 ContentCompression 将源文本压缩为页面内容
   */
  private async generatePageContent(
    pageOutline: PageOutline,
    sourceText: string,
    context: SkillContext,
  ): Promise<PageContent> {
    // 使用 ContentCompression 压缩源文本
    try {
      const result = await this.contentCompression.execute(
        {
          pageOutline,
          sourceText,
          maxCharacters: 500, // 每页最大字数
        },
        {
          ...context,
          executionId: `${context.executionId}-compress-${pageOutline.pageNumber}`,
        },
      );

      if (result.success && result.data?.pageContent) {
        return result.data.pageContent;
      }
    } catch (error) {
      this.logger.warn(
        `[generatePageContent] ContentCompression failed: ${error}`,
      );
    }

    // 降级：创建基础内容
    return this.createBasicPageContent(pageOutline);
  }

  /**
   * 创建基础页面内容（降级方案）
   */
  private createBasicPageContent(pageOutline: PageOutline): PageContent {
    return {
      title: pageOutline.title,
      subtitle: pageOutline.subtitle,
      sections:
        pageOutline.keyElements?.map((element) => ({
          type: "text" as const,
          position: "center" as const,
          content: element,
        })) || [],
    };
  }

  /**
   * 渲染页面 HTML
   */
  private async renderPage(
    pageOutline: PageOutline,
    pageContent: PageContent,
    themeId: string,
    context: SkillContext,
  ) {
    return this.templateRendering.execute(
      {
        pageOutline,
        pageContent,
        themeId,
      },
      {
        ...context,
        executionId: `${context.executionId}-render-${pageOutline.pageNumber}`,
      },
    );
  }

  /**
   * 发送页面生成事件
   */
  private emitPageGenerated(event: PageGeneratedEvent): void {
    // ★★★ 关键诊断日志 ★★★
    this.logger.warn(
      `[emitPageGenerated] ★★★ EMITTING EVENT ★★★ page=${event.pageNumber}, sessionId=${event.sessionId}, htmlLength=${event.html?.length || 0}`,
    );

    // 通过 EventEmitter 发送事件
    if (!this.eventEmitter) {
      this.logger.error(
        `[emitPageGenerated] ★★★ ERROR: eventEmitter is NULL! ★★★`,
      );
      return;
    }

    this.eventEmitter.emit("slides.page.generated", event);

    this.logger.warn(
      `[emitPageGenerated] ★★★ EVENT EMITTED ★★★ page=${event.pageNumber}`,
    );
  }
}
