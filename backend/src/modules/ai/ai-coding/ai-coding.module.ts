import { Module } from "@nestjs/common";
import { AiCodingController } from "./ai-coding.controller";
import { AiCodingService } from "./ai-coding.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [AiCodingController],
  providers: [AiCodingService],
  exports: [AiCodingService],
})
export class AiCodingModule {}
