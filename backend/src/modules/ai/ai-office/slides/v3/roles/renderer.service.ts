/**
 * Slides Engine v3.0 - Renderer Service
 *
 * 渲染器角色：负责四步设计、HTML 生成
 * 使用 CHAT 模型 + QUALITY_FIRST 策略
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  FourStepDesignSkill,
  FourStepDesignInput,
} from "../skills/four-step-design.skill";
import { PageTypeSelectionSkill } from "../skills/page-type-selection.skill";
import {
  PageOutline,
  PageContent,
  PageDesign,
  PageState,
  GlobalStyles,
  GENSPARK_DESIGN_SYSTEM,
} from "../checkpoint/checkpoint.types";

import { GeneratedImage } from "../checkpoint/checkpoint.types";

/**
 * 页面渲染输入
 */
export interface PageRenderInput {
  pageOutline: PageOutline;
  pageContent: PageContent;
  globalStyles?: GlobalStyles;
  sessionId?: string;
  /** 预生成的图片（背景图等） */
  images?: GeneratedImage[];
}

/**
 * 页面渲染结果
 */
export interface PageRenderResult {
  pageNumber: number;
  design: PageDesign;
  html: string;
  durationMs: number;
}

/**
 * 批量渲染输入
 */
export interface BatchRenderInput {
  pages: Array<{
    pageOutline: PageOutline;
    pageContent: PageContent;
  }>;
  globalStyles?: GlobalStyles;
  sessionId?: string;
  concurrency?: number;
}

@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);

  constructor(
    private readonly fourStepDesignSkill: FourStepDesignSkill,
    private readonly pageTypeSelectionSkill: PageTypeSelectionSkill,
  ) {}

  /**
   * 渲染单页
   */
  async renderPage(input: PageRenderInput): Promise<PageRenderResult> {
    const { pageOutline, pageContent, globalStyles, sessionId, images } = input;

    this.logger.log(
      `[renderPage] Rendering page ${pageOutline.pageNumber} with ${images?.length || 0} images`,
    );

    // 确保模板类型已选择
    const templateType =
      pageOutline.templateType ||
      this.pageTypeSelectionSkill.selectTemplateType(pageOutline);

    const designInput: FourStepDesignInput = {
      pageOutline: { ...pageOutline, templateType },
      pageContent,
      globalStyles: globalStyles || GENSPARK_DESIGN_SYSTEM,
      sessionId,
      images, // 传入预生成的图片
    };

    const result = await this.fourStepDesignSkill.execute(designInput);

    return {
      pageNumber: pageOutline.pageNumber,
      design: result.design,
      html: result.html,
      durationMs: result.durationMs,
    };
  }

  /**
   * 批量渲染多页
   */
  async renderBatch(
    input: BatchRenderInput,
  ): Promise<Map<number, PageRenderResult>> {
    const { pages, globalStyles, sessionId, concurrency = 3 } = input;

    this.logger.log(
      `[renderBatch] Rendering ${pages.length} pages with concurrency ${concurrency}`,
    );

    const results = new Map<number, PageRenderResult>();
    const startTime = Date.now();

    // 分批处理
    const batches: Array<typeof pages> = [];
    for (let i = 0; i < pages.length; i += concurrency) {
      batches.push(pages.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async ({ pageOutline, pageContent }) => {
          try {
            return await this.renderPage({
              pageOutline,
              pageContent,
              globalStyles,
              sessionId,
            });
          } catch (error) {
            this.logger.error(
              `[renderBatch] Failed to render page ${pageOutline.pageNumber}:`,
              error,
            );
            return this.createErrorResult(pageOutline.pageNumber, error);
          }
        }),
      );

      for (const result of batchResults) {
        results.set(result.pageNumber, result);
      }
    }

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `[renderBatch] Completed ${pages.length} pages in ${totalDuration}ms`,
    );

    return results;
  }

  /**
   * 优化 HTML 输出
   */
  optimizeHtml(html: string, globalStyles: GlobalStyles): string {
    // 确保画布尺寸正确
    if (!html.includes(`width: ${globalStyles.canvasWidth}px`)) {
      this.logger.debug("[optimizeHtml] Adding canvas width");
    }

    // 如果 HTML 不包含基本样式，添加包装器
    if (!html.includes("font-family")) {
      return `
<div style="
  width: ${globalStyles.canvasWidth}px;
  height: ${globalStyles.canvasHeight}px;
  background-color: ${globalStyles.backgroundColor};
  font-family: ${globalStyles.fontFamily};
  color: ${globalStyles.textPrimary};
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
">
  ${html}
</div>`;
    }

    return html;
  }

  /**
   * 验证渲染结果
   */
  validateRenderResult(result: PageRenderResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查 HTML 是否存在
    if (!result.html) {
      issues.push("HTML content is missing");
    }

    // 检查设计过程是否完整
    if (!result.design.step4_formulatingHTML.html) {
      issues.push("Design step 4 HTML is missing");
    }

    // 检查画布尺寸
    if (result.html && !result.html.includes("1280")) {
      issues.push("Canvas width may be incorrect");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 从 PageState 提取渲染所需信息
   */
  prepareRenderInput(
    pageState: PageState,
    globalStyles?: GlobalStyles,
    sessionId?: string,
  ): PageRenderInput | null {
    if (!pageState.content) {
      this.logger.warn(
        `[prepareRenderInput] Page ${pageState.pageNumber} has no content`,
      );
      return null;
    }

    return {
      pageOutline: pageState.outline,
      pageContent: pageState.content,
      globalStyles: globalStyles || GENSPARK_DESIGN_SYSTEM,
      sessionId,
    };
  }

  /**
   * 更新 PageState 的渲染结果
   */
  applyRenderResult(pageState: PageState, result: PageRenderResult): PageState {
    return {
      ...pageState,
      design: result.design,
      html: result.html,
      status: "completed",
    };
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    pageNumber: number,
    error: unknown,
  ): PageRenderResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      pageNumber,
      design: {
        step1_drafting: {
          style: "error",
          coreElements: [],
          mood: "error",
        },
        step2_refiningLayout: {
          alignment: "",
          graphicsPosition: "",
          spacing: "",
        },
        step3_planningVisuals: {
          backgroundColor: GENSPARK_DESIGN_SYSTEM.backgroundColor,
          accentColors: [],
          decorations: [],
        },
        step4_formulatingHTML: {
          html: "",
          externalDependencies: [],
        },
      },
      html: `<div style="
        width: 1280px;
        height: 720px;
        background-color: #0F172A;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #F87171;
        font-family: 'Noto Sans SC', sans-serif;
      ">
        <div style="text-align: center;">
          <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
          <h2 style="font-size: 24px; margin-bottom: 8px;">渲染失败</h2>
          <p style="font-size: 14px; color: #94A3B8;">${errorMessage}</p>
        </div>
      </div>`,
      durationMs: 0,
    };
  }
}
