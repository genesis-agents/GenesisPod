import { Module } from "@nestjs/common";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine";
import { RAGModule } from "../rag/rag.module";
import { CreditsModule } from "../../credits/credits.module";

@Module({
  imports: [PrismaModule, AiEngineModule, RAGModule, CreditsModule],
  controllers: [AiAskController],
  providers: [AiAskService],
  exports: [AiAskService],
})
export class AiAskModule {}
