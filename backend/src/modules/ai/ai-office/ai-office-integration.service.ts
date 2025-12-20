/**
 * AI Office Integration Service
 * AI Office 整合服务 - 为 ai-agents 模块提供统一入口
 *
 * 整合以下服务：
 * - PPTOrchestratorService: PPT 生成编排
 * - GenerationService: 文档生成
 * - ExportService: 文档导出
 * - SlidePlanningService: 幻灯片规划
 */

import { Injectable, Logger } from "@nestjs/common";
import { PPTOrchestratorService } from "./ppt/ppt-orchestrator.service";
import { GenerationService, GenerationConfig } from "./generation";
import { ExportService, ExportFormat } from "./export";

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
    private readonly pptOrchestrator: PPTOrchestratorService,
    private readonly generationService: GenerationService,
    private readonly exportService: ExportService,
  ) {}

  /**
   * 生成 PPT
   * 通过 PPTOrchestratorService 生成演示文稿
   */
  async *generatePPT(
    options: PPTGenerationOptions,
  ): AsyncGenerator<PPTStreamEvent> {
    this.logger.log(
      `[generatePPT] Starting PPT generation for: ${options.prompt.slice(0, 50)}...`,
    );

    try {
      // 使用 generatePPTStream 获取 Observable 并转换为 AsyncGenerator
      const observable = this.pptOrchestrator.generatePPTStream({
        prompt: options.prompt,
        themeId: options.themeId || "professional",
        slideCount: options.slideCount || 10,
        language: options.language === "en-US" ? "en" : "zh",
        textModelId: options.textModelId,
        imageModelId: options.imageModelId,
      });

      // 使用 Promise 将 Observable 转换为事件
      yield* this.observableToAsyncGenerator(observable);
    } catch (error) {
      this.logger.error(`[generatePPT] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "PPT 生成失败",
      };
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
   * 通过 ExportService 导出文档
   */
  async exportDocument(options: DocExportOptions): Promise<GenerationResult> {
    this.logger.log(`[exportDocument] Exporting document: ${options.title}`);

    try {
      const result = await this.exportService.exportDocument({
        format: options.format,
        title: options.title,
        content: options.content,
        documentType: options.documentType as any,
        metadata: options.metadata,
      });

      return {
        success: true,
        buffer: result.buffer,
        filename: result.filename,
        mimeType: result.mimeType,
      };
    } catch (error) {
      this.logger.error(`[exportDocument] Error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "文档导出失败",
      };
    }
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
