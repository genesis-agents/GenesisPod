import { Module } from "@nestjs/common";
import { AiFileOrganizerController } from "./ai-file-organizer.controller";
import { AiFileOrganizerService } from "./ai-file-organizer.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../../ai/ai-core/ai-core.module";

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [AiFileOrganizerController],
  providers: [AiFileOrganizerService],
  exports: [AiFileOrganizerService],
})
export class AiFileOrganizerModule {}
