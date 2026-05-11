import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { WikiModule } from "../wiki/wiki.module";
import { KbQueryService } from "./kb-query.service";

/**
 * KbQueryModule — exports the unified KB query facade (PR-2).
 *
 * Composition:
 *  - WikiModule provides WikiSourceProvider (BM25 over WikiPage)
 *  - AiEngineModule provides RAGPipelineService (chunk RAG)
 *
 * Consumers (ai-ask, topic-insights/data-source-fetcher, teams/topic-context-
 * retrieval, etc.) import THIS module and inject KbQueryService instead of
 * RAGPipelineService directly. The wiki layer becomes a transparent
 * enhancement — they don't add wiki branches in their own code.
 */
@Module({
  imports: [PrismaModule, AiEngineModule, WikiModule],
  providers: [KbQueryService],
  exports: [KbQueryService],
})
export class KbQueryModule {}
