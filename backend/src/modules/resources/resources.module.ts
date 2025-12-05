import { Module } from "@nestjs/common";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";
import { AIEnrichmentService } from "./ai-enrichment.service";
import { PdfThumbnailService } from "./pdf-thumbnail.service";
import { DynamicThumbnailService } from "./dynamic-thumbnail.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { MongoDBModule } from "../../common/mongodb/mongodb.module";
import { DataManagementModule } from "../data-management/data-management.module";

/**
 * 资源管理模块
 */
@Module({
  imports: [PrismaModule, MongoDBModule, DataManagementModule],
  controllers: [ResourcesController],
  providers: [
    ResourcesService,
    AIEnrichmentService,
    PdfThumbnailService,
    DynamicThumbnailService,
  ],
  exports: [
    ResourcesService,
    AIEnrichmentService,
    PdfThumbnailService,
    DynamicThumbnailService,
  ],
})
export class ResourcesModule {}
