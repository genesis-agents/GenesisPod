import { Module, forwardRef } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiOfficeModule } from "../../ai/ai-office/ai-office.module";
import { ExportModule } from "../../export/export.module";

@Module({
  imports: [PrismaModule, forwardRef(() => AiOfficeModule), ExportModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
