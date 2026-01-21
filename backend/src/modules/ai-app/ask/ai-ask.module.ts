import { Module } from "@nestjs/common";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { RAGModule } from "../rag/rag.module";
import { CreditsModule } from "../../credits/credits.module";

@Module({
  imports: [PrismaModule, AiEngineModule, RAGModule, CreditsModule],
  controllers: [AiAskController],
  providers: [AiAskService],
  exports: [AiAskService],
})
export class AiAskModule {}
