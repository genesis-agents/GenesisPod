import { Module } from "@nestjs/common";
import { NotesService } from "./notes.service";
import { NotesController } from "./notes.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../../ai/ai-core/ai-core.module";
import { AiOfficeModule } from "../../ai/ai-office/ai-office.module";

@Module({
  imports: [PrismaModule, AiCoreModule, AiOfficeModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
