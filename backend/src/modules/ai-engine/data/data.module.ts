/**
 * AI Engine - Data Module
 * 数据获取与增强模块
 */

import { Module } from "@nestjs/common";
import { DataSourceRouterService } from "./services/data-source-router.service";
import { DataEnrichmentService } from "./services/data-enrichment.service";
import { DataCacheService } from "./services/data-cache.service";

@Module({
  providers: [DataSourceRouterService, DataEnrichmentService, DataCacheService],
  exports: [DataSourceRouterService, DataEnrichmentService, DataCacheService],
})
export class DataModule {}
