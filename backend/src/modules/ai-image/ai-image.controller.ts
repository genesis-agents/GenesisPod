import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
  Request,
  Logger,
  UseInterceptors,
  UploadedFiles,
  Sse,
  Query,
  MessageEvent,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Observable } from "rxjs";
import { AiImageService } from "./ai-image.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

interface GenerateImageDto {
  // 输入内容 - 支持多种来源
  prompt?: string; // 直接输入的提示词或文本
  urls?: string[]; // 多个URL (文章、视频等)
  content?: string; // 大块文本 (论文、字幕等)
  imageBase64?: string; // 参考图片的 Base64

  // 模型选择
  textModelId?: string; // 文本模型ID (用于分析内容生成提示词)
  imageModelId?: string; // 图片模型ID (用于生成图片)

  // 生成选项
  style?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3";
  negativePrompt?: string;

  // 是否跳过提示词优化 (直接使用用户输入)
  skipEnhancement?: boolean;
}

@Controller("ai-image")
export class AiImageController {
  private readonly logger = new Logger(AiImageController.name);

  constructor(private readonly aiImageService: AiImageService) {}

  @Get("models")
  @UseGuards(JwtAuthGuard)
  async getAvailableModels() {
    return this.aiImageService.getAvailableModels();
  }

  @Post("generate")
  @UseGuards(JwtAuthGuard)
  async generateImage(@Body() dto: GenerateImageDto, @Request() req: any) {
    this.logger.log(`Generating image for user ${req.user?.userId}`);
    return this.aiImageService.generateImage({
      prompt: dto.prompt,
      urls: dto.urls,
      content: dto.content,
      imageBase64: dto.imageBase64,
      textModelId: dto.textModelId,
      imageModelId: dto.imageModelId,
      style: dto.style,
      aspectRatio: dto.aspectRatio,
      negativePrompt: dto.negativePrompt,
      skipEnhancement: dto.skipEnhancement,
      userId: req.user?.userId,
    });
  }

  /**
   * SSE 流式生成图片 - 实时推送处理进度
   * 前端使用 EventSource 连接此端点
   */
  @Sse("generate/stream")
  @UseGuards(JwtAuthGuard)
  generateImageStream(
    @Query("prompt") prompt: string,
    @Query("urls") urls: string,
    @Query("content") content: string,
    @Query("imageModelId") imageModelId: string,
    @Query("textModelId") textModelId: string,
    @Query("style") style: string,
    @Query("aspectRatio") aspectRatio: string,
    @Query("negativePrompt") negativePrompt: string,
    @Query("skipEnhancement") skipEnhancement: string,
    @Query("templateLayout") templateLayout: string,
    @Request() req: any,
  ): Observable<MessageEvent> {
    this.logger.log(
      `SSE: Starting stream generation for user ${req.user?.userId}`,
    );

    const parsedUrls = urls
      ? urls.split(",").filter((u) => u.trim())
      : undefined;
    const validAspectRatio = ["1:1", "16:9", "9:16", "4:3"].includes(
      aspectRatio,
    )
      ? (aspectRatio as "1:1" | "16:9" | "9:16" | "4:3")
      : undefined;
    const validTemplateLayouts = [
      "cards",
      "center_visual",
      "timeline",
      "comparison",
      "pyramid",
      "radial",
    ];
    const validTemplateLayout = validTemplateLayouts.includes(templateLayout)
      ? (templateLayout as
          | "cards"
          | "center_visual"
          | "timeline"
          | "comparison"
          | "pyramid"
          | "radial")
      : undefined;

    return this.aiImageService.generateImageStream({
      prompt: prompt || undefined,
      urls: parsedUrls,
      content: content || undefined,
      imageModelId: imageModelId || undefined,
      textModelId: textModelId || undefined,
      style: style || undefined,
      aspectRatio: validAspectRatio,
      negativePrompt: negativePrompt || undefined,
      skipEnhancement: skipEnhancement === "true",
      templateLayout: validTemplateLayout,
      userId: req.user?.userId,
    });
  }

  @Post("generate-with-files")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
    }),
  )
  async generateImageWithFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: GenerateImageDto,
    @Request() req: any,
  ) {
    this.logger.log(
      `Generating image with ${files?.length || 0} files for user ${req.user?.userId}`,
    );

    // 处理上传的文件
    const fileContents: Array<{
      buffer: Buffer;
      mimeType: string;
      filename: string;
    }> = [];

    if (files && files.length > 0) {
      for (const file of files) {
        fileContents.push({
          buffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname,
        });
      }
    }

    return this.aiImageService.generateImage({
      prompt: dto.prompt,
      urls: dto.urls
        ? Array.isArray(dto.urls)
          ? dto.urls
          : [dto.urls]
        : undefined,
      content: dto.content,
      imageBase64: dto.imageBase64,
      files: fileContents,
      textModelId: dto.textModelId,
      imageModelId: dto.imageModelId,
      style: dto.style,
      aspectRatio: dto.aspectRatio,
      negativePrompt: dto.negativePrompt,
      skipEnhancement: dto.skipEnhancement,
      userId: req.user?.userId,
    });
  }

  @Get("history")
  @UseGuards(JwtAuthGuard)
  async getHistory(@Request() req: any) {
    return this.aiImageService.getHistory(req.user?.userId);
  }

  @Get("bookmarks")
  @UseGuards(JwtAuthGuard)
  async getBookmarkedImages(@Request() req: any) {
    return this.aiImageService.getBookmarkedImages(req.user?.userId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getImage(@Param("id") id: string) {
    return this.aiImageService.getImage(id);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async deleteImage(@Param("id") id: string, @Request() req: any) {
    this.logger.log(`Deleting image ${id} for user ${req.user?.userId}`);
    return this.aiImageService.deleteImage(id, req.user?.userId);
  }

  @Post(":id/bookmark")
  @UseGuards(JwtAuthGuard)
  async addBookmark(@Param("id") id: string, @Request() req: any) {
    this.logger.log(
      `Adding bookmark for image ${id} by user ${req.user?.userId}`,
    );
    return this.aiImageService.addBookmark(id, req.user?.userId);
  }

  @Delete(":id/bookmark")
  @UseGuards(JwtAuthGuard)
  async removeBookmark(@Param("id") id: string, @Request() req: any) {
    this.logger.log(
      `Removing bookmark for image ${id} by user ${req.user?.userId}`,
    );
    return this.aiImageService.removeBookmark(id, req.user?.userId);
  }

  /**
   * 手动触发清理旧图片
   * 保留最新的20张未收藏图片，删除其余的
   */
  @Post("cleanup")
  @UseGuards(JwtAuthGuard)
  async cleanupOldImages(@Request() req: any) {
    this.logger.log(`Manual cleanup triggered by user ${req.user?.userId}`);
    const deletedCount = await this.aiImageService.cleanupOldImages(
      req.user?.userId,
    );
    return {
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} old images`,
    };
  }

  /**
   * 管理员清理所有用户的旧图片
   * 使用密钥验证，不需要登录
   */
  @Post("cleanup-all")
  async adminCleanupAllImages(@Query("key") key: string) {
    // 简单的密钥验证
    if (key !== "deepdive-admin-cleanup-2024") {
      return { success: false, message: "Invalid key" };
    }
    this.logger.log("Admin cleanup all users images triggered");
    const result = await this.aiImageService.cleanupAllUsersImages();
    return {
      success: true,
      ...result,
      message: `Cleaned up ${result.totalDeleted} images from ${result.usersCleaned} users`,
    };
  }
}
