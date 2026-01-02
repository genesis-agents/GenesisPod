import { Module } from "@nestjs/common";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiEngineModule } from "../ai-engine";
import { AskLLMAdapter } from "./adapters";
import { RAGModule } from "../rag/rag.module";
import { CreditsModule } from "../../credits/credits.module";

@Module({
  imports: [
    PrismaModule,
    AiCoreModule,
    AiEngineModule,
    RAGModule,
    CreditsModule,
  ],
  controllers: [AiAskController],
  providers: [AiAskService, AskLLMAdapter],
  exports: [AiAskService],
})
export class AiAskModule {}
