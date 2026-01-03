import { Module } from "@nestjs/common";
import { AiFileOrganizerController } from "./ai-file-organizer.controller";
import { AiFileOrganizerService } from "./ai-file-organizer.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AiFileOrganizerController],
  providers: [AiFileOrganizerService],
  exports: [AiFileOrganizerService],
})
export class AiFileOrganizerModule {}
