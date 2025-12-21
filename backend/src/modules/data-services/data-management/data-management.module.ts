import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { SourceWhitelistService } from "./services/source-whitelist.service";
import { SourceWhitelistController } from "./controllers/source-whitelist.controller";
import { CollectionRuleService } from "./services/collection-rule.service";
import { CollectionRuleController } from "./controllers/collection-rule.controller";
import { CollectionConfigurationService } from "./services/collection-configuration.service";
import { CollectionConfigurationController } from "./controllers/collection-configuration.controller";
import { ImportManagerService } from "./services/import-manager.service";
import { ImportManagerController } from "./controllers/import-manager.controller";
import { ImportTaskProcessorService } from "./services/import-task-processor.service";
import { MetadataExtractorService } from "./services/metadata-extractor.service";
import { DuplicateDetectorService } from "./services/duplicate-detector.service";
import { PaperMetadataExtractorService } from "./services/paper-metadata-extractor.service";
import { DashboardService } from "./services/dashboard.service";
import { DashboardController } from "./controllers/dashboard.controller";
import { ConfigurationController } from "./controllers/configuration.controller";
import { ConfigurationService } from "./services/configuration.service";
import { AiUrlClassifierService } from "./services/ai-url-classifier.service";

/**
 * Data Management Module
 * 整合数据管理相关的服务、控制器和子模块
 * 包括：
 * - 来源白名单管理
 * - 采集规则引擎
 * - 采集配置管理（专业采集器）
 * - 采集任务监控
 * - 数据质量管理
 * - 导入管理和URL解析
 */
@Module({
  imports: [ConfigModule, PrismaModule, HttpModule],
  providers: [
    SourceWhitelistService,
    CollectionRuleService,
    CollectionConfigurationService,
    ImportManagerService,
    ImportTaskProcessorService,
    MetadataExtractorService,
    DuplicateDetectorService,
    PaperMetadataExtractorService,
    DashboardService,
    ConfigurationService,
    AiUrlClassifierService,
  ],
  controllers: [
    SourceWhitelistController,
    CollectionRuleController,
    CollectionConfigurationController,
    ImportManagerController,
    DashboardController,
    ConfigurationController,
  ],
  exports: [
    SourceWhitelistService,
    CollectionRuleService,
    CollectionConfigurationService,
    ImportManagerService,
    MetadataExtractorService,
    DuplicateDetectorService,
    AiUrlClassifierService,
  ],
})
export class DataManagementModule implements OnModuleInit {
  constructor(
    private sourceWhitelistService: SourceWhitelistService,
    private collectionRuleService: CollectionRuleService,
  ) {}

  /**
   * 模块初始化时初始化默认白名单和采集规则
   */
  async onModuleInit() {
    try {
      await this.sourceWhitelistService.initializeDefaultWhitelists();
      await this.collectionRuleService.initializeDefaultRules();
    } catch (error) {
      // 不要让初始化错误阻止应用启动
      console.warn("Failed to initialize data management defaults:", error);
    }
  }
}
