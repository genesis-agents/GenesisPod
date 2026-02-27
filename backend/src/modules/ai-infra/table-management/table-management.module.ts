import { Module } from "@nestjs/common";
import { TableManagementController } from "./table-management.controller";
import { TableManagementService } from "./table-management.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TableManagementController],
  providers: [TableManagementService],
  exports: [TableManagementService],
})
export class TableManagementModule {}
