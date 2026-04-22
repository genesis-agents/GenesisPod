import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";
import { R2StorageService } from "./r2-storage.service";
import { TopicReportStorageService } from "./topic-report-storage.service";
import { StorageOffloadService } from "./storage-offload.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    R2StorageService,
    TopicReportStorageService,
    StorageOffloadService,
  ],
  exports: [
    StorageService,
    R2StorageService,
    TopicReportStorageService,
    StorageOffloadService,
  ],
})
export class StorageModule {}
