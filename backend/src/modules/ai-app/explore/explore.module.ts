import { Module } from "@nestjs/common";
import { YoutubeController } from "./youtube.controller";
import { YoutubeService } from "@/modules/ai-harness/facade";
import { PdfGeneratorService } from "./pdf-generator.service";
import { YoutubeVideosController } from "./youtube-videos.controller";
import { YoutubeVideosService } from "./youtube-videos.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { BrowserModule } from "../../../common/browser/browser.module";
import { SystemSettingModule } from "../../../common/settings/system-setting.module";

/**
 * Explore Module
 * 整合 YouTube 相关功能：字幕获取、PDF导出、视频管理
 */
@Module({
  imports: [PrismaModule, BrowserModule, SystemSettingModule],
  controllers: [YoutubeController, YoutubeVideosController],
  providers: [YoutubeService, PdfGeneratorService, YoutubeVideosService],
  exports: [YoutubeService, PdfGeneratorService, YoutubeVideosService],
})
export class ExploreModule {}
