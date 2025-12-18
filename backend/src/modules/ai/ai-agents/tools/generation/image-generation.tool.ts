/**
 * Image Generation Tool
 * 图像生成工具 - 复用 AiImageService
 */

import { Injectable } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core/tool.interface";
import { ToolType } from "../../core/agent.types";
import { AiImageService } from "../../../ai-image/ai-image.service";

// ============================================================================
// Types
// ============================================================================

export interface ImageGenerationInput {
  /**
   * 图像描述提示词
   */
  prompt: string;

  /**
   * 参考内容（可选）
   */
  content?: string;

  /**
   * 参考 URL 列表（可选）
   */
  urls?: string[];

  /**
   * 图像风格
   */
  style?: string;

  /**
   * 宽高比
   */
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

  /**
   * 模板布局
   */
  templateLayout?: string;
}

export interface ImageGenerationOutput {
  /**
   * 生成的图像 URL
   */
  imageUrl: string;

  /**
   * 图像宽度
   */
  width?: number;

  /**
   * 图像高度
   */
  height?: number;

  /**
   * 使用的模型
   */
  model?: string;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 错误信息
   */
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class ImageGenerationTool extends BaseTool<
  ImageGenerationInput,
  ImageGenerationOutput
> {
  readonly type = ToolType.IMAGE_GENERATION;
  readonly name = "图像生成";
  readonly description =
    "使用 AI 模型生成图像。支持文字描述生成图片、信息图、海报等。可指定风格、宽高比和模板布局。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "图像描述提示词，详细描述想要生成的图像内容",
      },
      content: {
        type: "string",
        description: "参考内容，用于生成信息图等需要数据的图像",
      },
      urls: {
        type: "array",
        description: "参考 URL 列表，从这些页面获取内容作为参考",
        items: { type: "string" },
      },
      style: {
        type: "string",
        description: "图像风格，如 realistic, cartoon, minimalist 等",
      },
      aspectRatio: {
        type: "string",
        description: "图像宽高比",
        enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        default: "16:9",
      },
      templateLayout: {
        type: "string",
        description: "模板布局类型，用于信息图生成",
      },
    },
    required: ["prompt"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        description: "生成的图像 URL",
      },
      width: {
        type: "number",
        description: "图像宽度（像素）",
      },
      height: {
        type: "number",
        description: "图像高度（像素）",
      },
      model: {
        type: "string",
        description: "使用的模型名称",
      },
      success: {
        type: "boolean",
        description: "生成是否成功",
      },
      error: {
        type: "string",
        description: "错误信息（如果失败）",
      },
    },
  };

  constructor(private readonly aiImageService: AiImageService) {
    super();
    this.defaultTimeout = 120000; // 120 秒超时（图像生成较慢）
  }

  validateInput(input: ImageGenerationInput): boolean {
    return (
      typeof input.prompt === "string" &&
      input.prompt.trim().length > 0 &&
      input.prompt.length <= 5000
    );
  }

  protected async doExecute(
    input: ImageGenerationInput,
    _context: ToolContext,
  ): Promise<ImageGenerationOutput> {
    const {
      prompt,
      content,
      urls,
      style,
      aspectRatio = "16:9",
      templateLayout,
    } = input;

    try {
      // 使用流式生成并等待完成
      // 将输入参数转换为服务期望的格式
      const validAspectRatios = ["1:1", "16:9", "9:16"];
      const safeAspectRatio = validAspectRatios.includes(aspectRatio)
        ? (aspectRatio as "1:1" | "16:9" | "9:16")
        : "16:9";

      const result = await this.generateImageAsync({
        prompt,
        content,
        urls,
        style,
        aspectRatio: safeAspectRatio,
        templateLayout,
      });

      return {
        imageUrl: result.imageUrl,
        width: result.width,
        height: result.height,
        model: result.model,
        success: true,
      };
    } catch (error) {
      return {
        imageUrl: "",
        success: false,
        error:
          error instanceof Error ? error.message : "Image generation failed",
      };
    }
  }

  /**
   * 异步生成图像（将流式 API 转换为 Promise）
   */
  private async generateImageAsync(
    options: {
      prompt: string;
      content?: string;
      urls?: string[];
      style?: string;
      aspectRatio?: "9:16" | "16:9" | "1:1";
      templateLayout?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } & Record<string, any>,
  ): Promise<{
    imageUrl: string;
    width?: number;
    height?: number;
    model?: string;
  }> {
    return new Promise((resolve, reject) => {
      // Cast to any to bypass strict type checking for templateLayout
      const stream = this.aiImageService.generateImageStream(options as any);

      let result: any = null;

      const subscription = stream.subscribe({
        next: (event) => {
          const data = JSON.parse(event.data as string);
          if (data.type === "complete" && data.result) {
            result = data.result;
          } else if (data.type === "error") {
            reject(new Error(data.error || "Image generation failed"));
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          reject(error);
        },
        complete: () => {
          subscription.unsubscribe();
          if (result) {
            resolve({
              imageUrl: result.imageUrl || result.url,
              width: result.width,
              height: result.height,
              model: result.model,
            });
          } else {
            reject(new Error("No image result received"));
          }
        },
      });

      // 超时处理
      setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error("Image generation timeout"));
      }, 120000);
    });
  }
}
