import { Module } from "@nestjs/common";
import { NotesService } from "./notes.service";
import { NotesController } from "./notes.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiOfficeModule } from "../../ai-app/office/ai-office.module";

@Module({
  imports: [PrismaModule, AiOfficeModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
