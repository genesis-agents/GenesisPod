import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MulterModule } from "@nestjs/platform-express";
import { AiImageController } from "./ai-image.controller";
import { AiImageService } from "./ai-image.service";
import { ContentExtractorService } from "./content-extractor.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { YoutubeModule } from "../youtube/youtube.module";

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    YoutubeModule, // 复用 YoutubeService 提取字幕
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  ],
  controllers: [AiImageController],
  providers: [AiImageService, ContentExtractorService],
  exports: [AiImageService, ContentExtractorService],
})
export class AiImageModule {}
