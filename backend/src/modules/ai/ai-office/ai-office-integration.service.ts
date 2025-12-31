/**
 * AI Office Integration Service
 * AI Office 整合服务 - 为 ai-agents 模块提供统一入口
 *
 * 整合以下服务：
 * - SlidesOrchestratorService: 幻灯片生成编排
 * - GenerationService: 文档生成
 * - SlidesExportService: 幻灯片导出
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  SlidesOrchestratorV3Service,
  GenerateInput,
  StreamEvent,
} from "./slides";
import { GenerationService, GenerationConfig } from "./generation";

// 导出格式类型
export type ExportFormat = "docx" | "pdf" | "markdown" | "pptx";

/**
 * 办公文档类型
 */
export enum OfficeDocumentType {
  PPTX = "PPTX",
  DOCX = "DOCX",
  PDF = "PDF",
}

/**
 * PPT 生成选项
 */
export interface PPTGenerationOptions {
  prompt: string;
  userId: string;
  themeId?: string;
  slideCount?: number;
  templateId?: string;
  language?: "zh-CN" | "en-US";
  includeImages?: boolean;
  textModelId?: string;
  imageModelId?: string;
}

/**
 * 文档生成选项
 */
export interface DocGenerationOptions {
  prompt: string;
  userId: string;
  documentType?: "RESEARCH" | "PROPOSAL" | "ARTICLE";
  language?: "zh-CN" | "en-US";
  detailLevel?: 1 | 2 | 3;
  resourceIds?: string[];
  textModelId?: string;
}

/**
 * 文档导出选项
 */
export interface DocExportOptions {
  content: string;
  title: string;
  format: ExportFormat;
  documentType?: string;
  metadata?: Record<string, any>;
}

/**
 * 生成结果
 */
export interface GenerationResult {
  success: boolean;
  content?: string;
  buffer?: Buffer;
  filename?: string;
  mimeType?: string;
  error?: string;
}

@Injectable()
export class AiOfficeIntegrationService {
  private readonly logger = new Logger(AiOfficeIntegrationService.name);

  constructor(
    private readonly slidesOrchestrator: SlidesOrchestratorV3Service,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * 生成幻灯片
   * 通过 SlidesOrchestratorV3Service 生成演示文稿
   */
  async *generatePPT(
    options: PPTGenerationOptions,
  ): AsyncGenerator<PPTStreamEvent> {
    this.logger.log(
      `[generatePPT] Starting slides generation for: ${options.prompt.slice(0, 50)}...`,
    );

    try {
      // 使用 V3 generateSlides 获取 Observable 并转换为 AsyncGenerator
      const input: GenerateInput = {
        userId: options.userId,
        title: options.prompt.slice(0, 50),
        sourceText: options.prompt,
        targetPages: options.slideCount || 10,
        stylePreference: "dark",
        themeId: options.themeId || "genspark-dark",
      };

      const observable = this.slidesOrchestrator.generateSlides(input);

      // 转换 V3 事件为旧格式
      for await (const event of this.observableToAsyncGenerator(observable)) {
        yield this.convertV3EventToPPTEvent(event as StreamEvent);
      }
    } catch (error) {
      this.logger.error(`[generatePPT] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "PPT 生成失败",
      };
    }
  }

  /**
   * 转换 V3 事件为旧 PPT 事件格式
   */
  private convertV3EventToPPTEvent(event: StreamEvent): PPTStreamEvent {
    const eventData = event.data as Record<string, any> | undefined;

    switch (event.type) {
      case "progress_update":
        return {
          type: "progress",
          progress: {
            phase: eventData?.phase || "generating",
            percentage: eventData?.overallProgress || 0,
            message: eventData?.message || "",
          },
        };
      case "page_completed":
        return {
          type: "slide_complete",
          slide: {
            index: eventData?.pageNumber || 0,
            html: eventData?.html || "",
          },
        };
      case "complete":
        return {
          type: "complete",
          result: {
            pptId: eventData?.sessionId || event.sessionId || "",
            totalSlides: eventData?.totalPages || 0,
            duration: eventData?.totalDuration || 0,
          },
        };
      case "error":
        return {
          type: "error",
          error: eventData?.message || "Unknown error",
        };
      default:
        return { type: event.type, ...(eventData || {}) };
    }
  }

  /**
   * 将 Observable 转换为 AsyncGenerator
   */
  private async *observableToAsyncGenerator<T>(
    observable: import("rxjs").Observable<T>,
  ): AsyncGenerator<T> {
    const events: T[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveNext: (() => void) | null = null;

    observable.subscribe({
      next: (value) => {
        events.push(value);
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      },
      error: (err) => {
        error = err;
        done = true;
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      },
      complete: () => {
        done = true;
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      },
    });

    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }

    if (error) {
      throw error;
    }
  }

  /**
   * 生成文档
   * 通过 GenerationService 生成文档
   */
  async *generateDocument(
    options: DocGenerationOptions,
  ): AsyncGenerator<DocStreamEvent> {
    this.logger.log(
      `[generateDocument] Starting document generation for: ${options.prompt.slice(0, 50)}...`,
    );

    try {
      const config: GenerationConfig = {
        title: this.extractTitle(options.prompt),
        prompt: options.prompt,
        documentType: options.documentType || "ARTICLE",
        language: options.language || "zh-CN",
        detailLevel: options.detailLevel || 2,
        resourceIds: options.resourceIds,
        textModelId: options.textModelId,
      };

      const generator = this.generationService.generateDocument(
        options.userId,
        config,
      );

      for await (const chunk of generator) {
        yield this.mapToDocStreamEvent(chunk);
      }
    } catch (error) {
      this.logger.error(`[generateDocument] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "文档生成失败",
      };
    }
  }

  /**
   * 导出文档
   * TODO: 使用统一的 ExportModule 实现
   */
  async exportDocument(options: DocExportOptions): Promise<GenerationResult> {
    this.logger.log(`[exportDocument] Exporting document: ${options.title}`);

    // TODO: 集成统一的 ExportModule
    return {
      success: false,
      error: "文档导出功能待集成统一的 ExportModule",
    };
  }

  /**
   * 获取支持的文档类型
   */
  getSupportedDocumentTypes(): OfficeDocumentType[] {
    return [
      OfficeDocumentType.PPTX,
      OfficeDocumentType.DOCX,
      OfficeDocumentType.PDF,
    ];
  }

  /**
   * 获取支持的导出格式
   */
  getSupportedExportFormats(): ExportFormat[] {
    return ["docx", "pdf", "markdown"];
  }

  /**
   * 从提示词中提取标题
   */
  private extractTitle(prompt: string): string {
    const patterns = [
      /撰写(?:关于)?[《"']?([^《》"']+)[》"']?的/,
      /写一(?:篇|份)[《"']?([^《》"']+)[》"']?/,
      /创建[《"']?([^《》"']+)[》"']?/,
      /生成[《"']?([^《》"']+)[》"']?/,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return prompt.slice(0, 30).trim() || "未命名文档";
  }

  /**
   * 将文档流事件映射为标准事件
   */
  private mapToDocStreamEvent(chunk: any): DocStreamEvent {
    switch (chunk.type) {
      case "progress":
        return {
          type: "progress",
          step: chunk.progress?.step || "unknown",
          percentage: chunk.progress?.percentage || 0,
          message: chunk.progress?.message || "",
        };
      case "content":
        return {
          type: "content",
          content: chunk.content || "",
        };
      case "complete":
        return {
          type: "complete",
          documentId: chunk.documentId,
        };
      case "error":
        return {
          type: "error",
          error: chunk.error || "Unknown error",
        };
      default:
        return {
          type: "progress",
          step: "unknown",
          percentage: 0,
          message: "",
        };
    }
  }
}

// 类型定义
export interface PPTStreamEvent {
  type: string;
  [key: string]: any;
}

export interface DocStreamEvent {
  type: "progress" | "content" | "complete" | "error";
  step?: string;
  percentage?: number;
  message?: string;
  content?: string;
  documentId?: string;
  error?: string;
}
