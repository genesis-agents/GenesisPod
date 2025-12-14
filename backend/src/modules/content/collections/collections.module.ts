import { Module } from "@nestjs/common";
import { CollectionsService } from "./collections.service";
import { CollectionsController } from "./collections.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../../ai/ai-core/ai-core.module";
import { AiOfficeModule } from "../../ai/ai-office/ai-office.module";

@Module({
  imports: [PrismaModule, AiCoreModule, AiOfficeModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
