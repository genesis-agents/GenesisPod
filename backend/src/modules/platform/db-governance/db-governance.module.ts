import { Module } from "@nestjs/common";
import { DbGovernanceController } from "./db-governance.controller";
import { DbGovernanceService } from "./db-governance.service";
import { DataRetentionService } from "./data-retention.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [DbGovernanceController],
  providers: [DbGovernanceService, DataRetentionService],
  exports: [DbGovernanceService, DataRetentionService],
})
export class DbGovernanceModule {}
