import { Module, forwardRef } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiOfficeModule } from "../../ai/ai-office/ai-office.module";

@Module({
  imports: [PrismaModule, forwardRef(() => AiOfficeModule)],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
