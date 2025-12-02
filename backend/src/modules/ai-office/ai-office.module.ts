import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { QuickGenerateController } from "./quick-generate.controller";
import { QuickGenerateService } from "./quick-generate.service";
import { OfficeDocumentController } from "./office-document.controller";
import { OfficeDocumentService } from "./office-document.service";
import { AIModelController } from "./ai-model.controller";
import { AIModelService } from "./ai-model.service";
import { DocumentGenerationController } from "./document-generation.controller";
import { DocumentGenerationService } from "./document-generation.service";
import { DocumentExportController } from "./document-export.controller";
import { DocumentExportService } from "./document-export.service";

@Module({
  imports: [HttpModule, ConfigModule, PrismaModule, AiModule],
  controllers: [
    QuickGenerateController,
    OfficeDocumentController,
    AIModelController,
    DocumentGenerationController,
    DocumentExportController,
  ],
  providers: [
    QuickGenerateService,
    OfficeDocumentService,
    AIModelService,
    DocumentGenerationService,
    DocumentExportService,
  ],
  exports: [
    QuickGenerateService,
    OfficeDocumentService,
    AIModelService,
    DocumentGenerationService,
    DocumentExportService,
  ],
})
export class AiOfficeModule {}
