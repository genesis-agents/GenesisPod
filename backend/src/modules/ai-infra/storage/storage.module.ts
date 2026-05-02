import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StorageGovernanceController } from "./governance/storage-governance.controller";
import { StorageGovernanceService } from "./governance/storage-governance.service";
import { R2StorageService } from "./runtime/r2-storage.service";
import { StorageOffloadService } from "./governance/storage-offload.service";
import { StorageInventoryService } from "./governance/storage-inventory.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [StorageGovernanceController],
  providers: [
    // Governance aggregate for storage admin/cleanup workflows.
    StorageGovernanceService,
    // Runtime object storage adapter.
    R2StorageService,
    // Governance-side storage jobs.
    StorageOffloadService,
    StorageInventoryService,
  ],
  exports: [
    StorageGovernanceService,
    R2StorageService,
    StorageOffloadService,
    StorageInventoryService,
  ],
})
export class StorageModule {}
