import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { MongoDBModule } from "../../common/mongodb/mongodb.module";
import { CrawlerModule } from "../crawler/crawler.module";

// Services
import { DataSourceService } from "./data-source.service";
import { CollectionTaskService } from "./collection-task.service";
import { DashboardService } from "./dashboard.service";
import { MonitorService } from "./monitor.service";
import { QualityService } from "./quality.service";
import { HistoryService } from "./history.service";
import { DataSourceSeederService } from "./data-source-seeder.service";

// Controllers
import { DataSourceController } from "./data-source.controller";
import { CollectionTaskController } from "./collection-task.controller";
import { DashboardController } from "./dashboard.controller";
import { MonitorController } from "./monitor.controller";
import { QualityController } from "./quality.controller";
import { HistoryController } from "./history.controller";

@Module({
  imports: [PrismaModule, MongoDBModule, CrawlerModule],
  controllers: [
    DataSourceController,
    CollectionTaskController,
    DashboardController,
    MonitorController,
    QualityController,
    HistoryController,
  ],
  providers: [
    DataSourceService,
    CollectionTaskService,
    DashboardService,
    MonitorService,
    QualityService,
    HistoryService,
    DataSourceSeederService, // Auto-seeds validated data sources on startup
  ],
  exports: [
    DataSourceService,
    CollectionTaskService,
    DashboardService,
    MonitorService,
    QualityService,
    HistoryService,
  ],
})
export class DataCollectionModule {}
