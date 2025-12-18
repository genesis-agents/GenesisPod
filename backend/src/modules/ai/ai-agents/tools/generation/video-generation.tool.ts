/**
 * Video Generation Tool
 * 视频生成工具 - 支持文本转视频、图片转视频、视频编辑
 */

import { Injectable } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core/tool.interface";
import { ToolType } from "../../core/agent.types";

// ============================================================================
// Types
// ============================================================================

/**
 * 视频源类型
 */
export type VideoSourceType = "text" | "image" | "video";

/**
 * 视频分辨率
 */
export type VideoResolution = "480p" | "720p" | "1080p" | "4k";

/**
 * 视频风格
 */
export type VideoStyle =
  | "realistic"
  | "anime"
  | "cartoon"
  | "cinematic"
  | "artistic"
  | "minimal";

/**
 * 视频编辑操作
 */
export type VideoEditOperation =
  | "trim"
  | "merge"
  | "resize"
  | "speed"
  | "filter"
  | "transition";

export interface VideoGenerationInput {
  /**
   * 描述提示词（用于文本转视频）
   */
  prompt?: string;

  /**
   * 源类型（text/image/video）
   */
  sourceType: VideoSourceType;

  /**
   * 源内容 URL（用于 image/video 源）
   */
  sourceUrl?: string;

  /**
   * 视频时长（秒）
   */
  duration?: number;

  /**
   * 视频分辨率
   */
  resolution?: VideoResolution;

  /**
   * 视频风格
   */
  style?: VideoStyle;

  /**
   * 帧率（FPS）
   */
  fps?: number;

  /**
   * 视频编辑操作（可选）
   */
  editOperation?: {
    /**
     * 操作类型
     */
    type: VideoEditOperation;

    /**
     * 操作参数
     */
    params?: Record<string, unknown>;
  };

  /**
   * 附加选项
   */
  options?: {
    /**
     * 是否生成缩略图
     */
    generateThumbnail?: boolean;

    /**
     * 背景音乐 URL
     */
    backgroundMusic?: string;

    /**
     * 是否添加字幕
     */
    addSubtitles?: boolean;

    /**
     * 输出格式
     */
    outputFormat?: "mp4" | "webm" | "mov" | "avi";
  };
}

export interface VideoGenerationOutput {
  /**
   * 生成的视频 URL
   */
  videoUrl: string;

  /**
   * 缩略图 URL
   */
  thumbnailUrl?: string;

  /**
   * 视频时长（秒）
   */
  duration: number;

  /**
   * 视频格式
   */
  format: string;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 错误信息
   */
  error?: string;

  /**
   * 元数据
   */
  metadata?: {
    resolution: VideoResolution;
    fps: number;
    fileSize?: number;
    width?: number;
    height?: number;
    codec?: string;
    provider?: string;
    processingTime?: number;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class VideoGenerationTool extends BaseTool<
  VideoGenerationInput,
  VideoGenerationOutput
> {
  readonly type = ToolType.VIDEO_GENERATION;
  readonly name = "视频生成";
  readonly description =
    "智能视频生成工具。支持文本转视频（Text-to-Video）、图片转视频（Image-to-Video）、视频编辑（剪辑、合并、调整大小等）。适用于生成营销视频、产品演示、动画效果等。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "视频内容描述（用于文本转视频）",
      },
      sourceType: {
        type: "string",
        description:
          "源类型：text（文本转视频）、image（图片转视频）、video（视频编辑）",
        enum: ["text", "image", "video"],
      },
      sourceUrl: {
        type: "string",
        description: "源文件 URL（image 或 video 类型必需）",
      },
      duration: {
        type: "number",
        description: "视频时长（秒），范围 1-60，默认 5 秒",
        default: 5,
      },
      resolution: {
        type: "string",
        description: "视频分辨率",
        enum: ["480p", "720p", "1080p", "4k"],
        default: "1080p",
      },
      style: {
        type: "string",
        description: "视频风格",
        enum: [
          "realistic",
          "anime",
          "cartoon",
          "cinematic",
          "artistic",
          "minimal",
        ],
        default: "realistic",
      },
      fps: {
        type: "number",
        description: "帧率（FPS），范围 24-60，默认 30",
        default: 30,
      },
      editOperation: {
        type: "object",
        description: "视频编辑操作（可选）",
        properties: {
          type: {
            type: "string",
            description: "操作类型",
            enum: ["trim", "merge", "resize", "speed", "filter", "transition"],
          },
          params: {
            type: "object",
            description: "操作参数",
          },
        },
      },
      options: {
        type: "object",
        description: "附加选项",
        properties: {
          generateThumbnail: {
            type: "boolean",
            description: "是否生成缩略图",
            default: true,
          },
          backgroundMusic: {
            type: "string",
            description: "背景音乐 URL",
          },
          addSubtitles: {
            type: "boolean",
            description: "是否添加字幕",
            default: false,
          },
          outputFormat: {
            type: "string",
            description: "输出格式",
            enum: ["mp4", "webm", "mov", "avi"],
            default: "mp4",
          },
        },
      },
    },
    required: ["sourceType"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      videoUrl: {
        type: "string",
        description: "生成的视频 URL",
      },
      thumbnailUrl: {
        type: "string",
        description: "缩略图 URL",
      },
      duration: {
        type: "number",
        description: "视频时长（秒）",
      },
      format: {
        type: "string",
        description: "视频格式",
      },
      success: {
        type: "boolean",
        description: "生成是否成功",
      },
      error: {
        type: "string",
        description: "错误信息（如果失败）",
      },
      metadata: {
        type: "object",
        description: "元数据信息",
        properties: {
          resolution: { type: "string" },
          fps: { type: "number" },
          fileSize: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          codec: { type: "string" },
          provider: { type: "string" },
          processingTime: { type: "number" },
        },
      },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 300000; // 300 秒超时（视频生成可能很慢）
  }

  validateInput(input: VideoGenerationInput): boolean {
    // 验证源类型
    if (!["text", "image", "video"].includes(input.sourceType)) {
      return false;
    }

    // 验证 text 源类型需要 prompt
    if (input.sourceType === "text" && !input.prompt?.trim()) {
      return false;
    }

    // 验证 image/video 源类型需要 sourceUrl
    if (
      (input.sourceType === "image" || input.sourceType === "video") &&
      !input.sourceUrl?.trim()
    ) {
      return false;
    }

    // 验证时长
    if (input.duration && (input.duration < 1 || input.duration > 60)) {
      return false;
    }

    // 验证帧率
    if (input.fps && (input.fps < 24 || input.fps > 60)) {
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: VideoGenerationInput,
    _context: ToolContext,
  ): Promise<VideoGenerationOutput> {
    const {
      sourceType,
      prompt,
      sourceUrl,
      duration = 5,
      resolution = "1080p",
      style = "realistic",
      fps = 30,
      editOperation,
      options = {},
    } = input;

    const {
      generateThumbnail = true,
      outputFormat = "mp4",
      backgroundMusic: _backgroundMusic,
      addSubtitles: _addSubtitles = false,
    } = options;

    try {
      // TODO: 实际的视频生成 API 集成
      // 目前使用 mock 数据返回

      // 模拟处理时间
      const processingTime = this.estimateProcessingTime(
        sourceType,
        duration,
        resolution,
      );
      await this.simulateProcessing(processingTime);

      // 根据源类型生成不同的视频
      let videoUrl: string;
      let thumbnailUrl: string | undefined;

      switch (sourceType) {
        case "text":
          videoUrl = this.generateTextToVideoMock(prompt!, style);
          break;

        case "image":
          videoUrl = this.generateImageToVideoMock(sourceUrl!, duration);
          break;

        case "video":
          videoUrl = this.generateVideoEditMock(sourceUrl!, editOperation);
          break;

        default:
          throw new Error(`Unsupported source type: ${sourceType}`);
      }

      // 生成缩略图
      if (generateThumbnail) {
        thumbnailUrl = this.generateThumbnailMock(videoUrl);
      }

      // 计算视频尺寸
      const { width, height } = this.getResolutionDimensions(resolution);

      // 估算文件大小（简单估算：分辨率 * fps * duration * 压缩率）
      const fileSize = this.estimateFileSize(width, height, fps, duration);

      return {
        videoUrl,
        thumbnailUrl,
        duration,
        format: outputFormat,
        success: true,
        metadata: {
          resolution,
          fps,
          fileSize,
          width,
          height,
          codec: "h264",
          provider: "mock-video-service",
          processingTime,
        },
      };
    } catch (error) {
      return {
        videoUrl: "",
        duration: 0,
        format: outputFormat,
        success: false,
        error:
          error instanceof Error ? error.message : "Video generation failed",
      };
    }
  }

  /**
   * 估算处理时间（毫秒）
   */
  private estimateProcessingTime(
    sourceType: VideoSourceType,
    duration: number,
    resolution: VideoResolution,
  ): number {
    // 基础时间
    const baseTime = 1000;

    // 源类型系数
    const sourceTypeMultiplier = {
      text: 3,
      image: 2,
      video: 1,
    };

    // 分辨率系数
    const resolutionMultiplier = {
      "480p": 1,
      "720p": 1.5,
      "1080p": 2,
      "4k": 4,
    };

    return (
      baseTime *
      sourceTypeMultiplier[sourceType] *
      resolutionMultiplier[resolution] *
      duration
    );
  }

  /**
   * 模拟处理延迟
   */
  private async simulateProcessing(processingTime: number): Promise<void> {
    // 为了演示效果，实际等待时间缩短
    const simulatedTime = Math.min(processingTime / 10, 2000);
    await new Promise((resolve) => setTimeout(resolve, simulatedTime));
  }

  /**
   * Mock: 文本转视频
   */
  private generateTextToVideoMock(prompt: string, style: VideoStyle): string {
    // 生成 mock URL
    const hash = this.simpleHash(prompt + style);
    return `https://storage.example.com/videos/text-to-video/${hash}.mp4`;
  }

  /**
   * Mock: 图片转视频
   */
  private generateImageToVideoMock(
    sourceUrl: string,
    duration: number,
  ): string {
    const hash = this.simpleHash(sourceUrl + duration);
    return `https://storage.example.com/videos/image-to-video/${hash}.mp4`;
  }

  /**
   * Mock: 视频编辑
   */
  private generateVideoEditMock(
    sourceUrl: string,
    editOperation?: VideoGenerationInput["editOperation"],
  ): string {
    const hash = this.simpleHash(sourceUrl + (editOperation?.type || "none"));
    return `https://storage.example.com/videos/edited/${hash}.mp4`;
  }

  /**
   * Mock: 生成缩略图
   */
  private generateThumbnailMock(videoUrl: string): string {
    const hash = this.simpleHash(videoUrl);
    return `https://storage.example.com/thumbnails/${hash}.jpg`;
  }

  /**
   * 获取分辨率尺寸
   */
  private getResolutionDimensions(resolution: VideoResolution): {
    width: number;
    height: number;
  } {
    const dimensions = {
      "480p": { width: 854, height: 480 },
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
      "4k": { width: 3840, height: 2160 },
    };

    return dimensions[resolution];
  }

  /**
   * 估算文件大小（字节）
   */
  private estimateFileSize(
    width: number,
    height: number,
    fps: number,
    duration: number,
  ): number {
    // 简化的文件大小估算
    // 假设压缩率为 0.1 bpp (bits per pixel)
    const pixelsPerFrame = width * height;
    const framesTotal = fps * duration;
    const bitsPerPixel = 0.1;

    return Math.floor((pixelsPerFrame * framesTotal * bitsPerPixel) / 8);
  }

  /**
   * 简单哈希函数（用于生成 mock URL）
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
