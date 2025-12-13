import { Module } from "@nestjs/common";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";

@Module({
  imports: [PrismaModule, AiCoreModule],
  controllers: [AiAskController],
  providers: [AiAskService],
  exports: [AiAskService],
})
export class AiAskModule {}
