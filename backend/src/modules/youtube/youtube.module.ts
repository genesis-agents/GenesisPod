import { Module, forwardRef } from "@nestjs/common";
import { YoutubeController } from "./youtube.controller";
import { YoutubeService } from "./youtube.service";
import { PdfGeneratorService } from "./pdf-generator.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AdminModule } from "../admin/admin.module";

@Module({
  imports: [PrismaModule, forwardRef(() => AdminModule)],
  controllers: [YoutubeController],
  providers: [YoutubeService, PdfGeneratorService],
  exports: [YoutubeService, PdfGeneratorService],
})
export class YoutubeModule {}
