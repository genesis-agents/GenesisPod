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
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
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
}
