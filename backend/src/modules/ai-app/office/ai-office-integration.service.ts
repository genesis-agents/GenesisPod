/**
 * AI Office Integration Service
 * AI Office 整合服务 - 为 ai-agents 模块提供统一入口
 *
 * 整合以下服务：
 * - SlidesEngineService: 幻灯片生成编排 (v4.0)
 * - GenerationService: 文档生成
 * - SlidesExportService: 幻灯片导出
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  SlidesEngineService,
  SlidesGenerateInput,
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
  metadata?: Record<string, unknown>;
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
    private readonly slidesEngine: SlidesEngineService,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * 生成幻灯片
   * 通过 SlidesEngineService 生成演示文稿
   */
  async *generatePPT(
    options: PPTGenerationOptions,
  ): AsyncGenerator<PPTStreamEvent> {
    this.logger.log(
      `[generatePPT] Starting slides generation for: ${options.prompt.slice(0, 50)}...`,
    );

    try {
      const input: SlidesGenerateInput = {
        userId: options.userId,
        sourceText: options.prompt,
        targetPages: options.slideCount || 10,
        stylePreference: "dark",
        themeId: options.themeId || "genspark-dark",
      };

      // 使用 SlidesEngineService 的 AsyncGenerator
      for await (const event of this.slidesEngine.generateSlides(input)) {
        yield this.convertEventToPPTEvent(event);
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
   * 转换事件为旧 PPT 事件格式
   */
  private convertEventToPPTEvent(event: StreamEvent): PPTStreamEvent {
    const eventData = event.data as Record<string, unknown> | undefined;

    switch (event.type) {
      case "progress_update":
        return {
          type: "progress",
          progress: {
            phase: (eventData?.phase as string) || "generating",
            percentage: (eventData?.overallProgress as number) || 0,
            message: (eventData?.message as string) || "",
          },
        };
      case "page_completed":
        return {
          type: "slide_complete",
          slide: {
            index: (eventData?.pageNumber as number) || 0,
            html: (eventData?.html as string) || "",
          },
        };
      case "complete":
        return {
          type: "complete",
          result: {
            pptId: (eventData?.sessionId as string) || event.sessionId || "",
            totalSlides: (eventData?.totalPages as number) || 0,
            duration: (eventData?.totalDuration as number) || 0,
          },
        };
      case "error":
        return {
          type: "error",
          error: (eventData?.message as string) || "Unknown error",
        };
      default:
        return { type: event.type, ...(eventData || {}) };
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
        yield this.mapToDocStreamEvent(chunk as unknown as Record<string, unknown>);
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
  private mapToDocStreamEvent(chunk: Record<string, unknown>): DocStreamEvent {
    switch (chunk.type) {
      case "progress":
        return {
          type: "progress",
          step: ((chunk.progress as Record<string, unknown>)?.step as string) || "unknown",
          percentage: ((chunk.progress as Record<string, unknown>)?.percentage as number) || 0,
          message: ((chunk.progress as Record<string, unknown>)?.message as string) || "",
        };
      case "content":
        return {
          type: "content",
          content: (chunk.content as string) || "",
        };
      case "complete":
        return {
          type: "complete",
          documentId: chunk.documentId as string,
        };
      case "error":
        return {
          type: "error",
          error: (chunk.error as string) || "Unknown error",
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
  [key: string]: unknown;
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
