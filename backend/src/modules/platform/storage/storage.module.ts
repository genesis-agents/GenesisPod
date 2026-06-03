import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorageGovernanceController } from "./governance/storage-governance.controller";
import { StorageGovernanceService } from "./governance/storage-governance.service";
import { ObjectStorageService } from "./runtime/object-storage.service";
import { StorageOffloadService } from "./governance/storage-offload.service";
import { StorageInventoryService } from "./governance/storage-inventory.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// W2-A: object storage backend plugin（@Global，提供 OBJECT_STORAGE_BACKEND_TOKEN）
import { ObjectStorageModule } from "@/plugins/storage/object-storage.module";

@Module({
  imports: [PrismaModule, ConfigModule, ObjectStorageModule],
  controllers: [StorageGovernanceController],
  providers: [
    // Governance aggregate for storage admin/cleanup workflows.
    StorageGovernanceService,
    // Runtime object storage orchestrator (delegates to plugin backend).
    ObjectStorageService,
    // Governance-side storage jobs.
    StorageOffloadService,
    StorageInventoryService,
  ],
  exports: [
    StorageGovernanceService,
    ObjectStorageService,
    StorageOffloadService,
    StorageInventoryService,
  ],
})
export class StorageModule {}
