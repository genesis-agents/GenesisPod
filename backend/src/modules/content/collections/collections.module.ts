import { Module } from "@nestjs/common";
import { CollectionsService } from "./collections.service";
import { CollectionsController } from "./collections.controller";
import { CollectionsRepository } from "./collections.repository";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";

@Module({
  imports: [PrismaModule, AiEngineModule],
  controllers: [CollectionsController],
  providers: [CollectionsRepository, CollectionsService],
  exports: [CollectionsRepository, CollectionsService],
})
export class CollectionsModule {}
