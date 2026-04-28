import { Module } from "@nestjs/common";
import { ResourcesController } from "./resources.controller";
import { ResourcesService } from "./resources.service";
import { ResourcesRepository } from "./resources.repository";
import { AIEnrichmentService } from "./ai-enrichment.service";
import { PdfThumbnailService } from "./pdf-thumbnail.service";
import { DynamicThumbnailService } from "./dynamic-thumbnail.service";
import { ResourceHealthCheckScheduler } from "./resource-health-check.scheduler";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { MongoDBModule } from "../../../../common/mongodb/mongodb.module";
import { IngestionConfigModule } from "../../management/ingestion/config/config.module";
import { StorageModule } from "../../../ai-infra/storage/storage.module";
import { ProxyModule } from "../../library/proxy/proxy.module";

/**
 * 资源管理模块
 */
@Module({
  imports: [
    PrismaModule,
    MongoDBModule,
    IngestionConfigModule,
    StorageModule,
    ProxyModule, // 用于 FlareSolverr 支持
  ],
  controllers: [ResourcesController],
  providers: [
    ResourcesRepository,
    ResourcesService,
    AIEnrichmentService,
    PdfThumbnailService,
    DynamicThumbnailService,
    ResourceHealthCheckScheduler,
  ],
  exports: [
    ResourcesRepository,
    ResourcesService,
    AIEnrichmentService,
    PdfThumbnailService,
    DynamicThumbnailService,
  ],
})
export class ResourcesModule {}
