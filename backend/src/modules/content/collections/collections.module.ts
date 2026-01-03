import { Module } from "@nestjs/common";
import { CollectionsService } from "./collections.service";
import { CollectionsController } from "./collections.controller";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiOfficeModule } from "../../ai-app/office/ai-office.module";

@Module({
  imports: [PrismaModule, AiOfficeModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
