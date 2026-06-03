import { Module } from "@nestjs/common";
import { DbOpsController } from "./db-ops.controller";
import { DbOpsService } from "./db-ops.service";
import { DataRetentionService } from "./data-retention.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [DbOpsController],
  providers: [DbOpsService, DataRetentionService],
  exports: [DbOpsService, DataRetentionService],
})
export class DbOpsModule {}
