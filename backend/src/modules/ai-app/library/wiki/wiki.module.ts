import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../../ai-infra/credits/credits.module";
import { RAGModule } from "../rag/rag.module";

import { WikiPageService } from "./wiki-page.service";
import { WikiDiffService } from "./wiki-diff.service";
import { WikiIngestService } from "./wiki-ingest.service";
import { WikiLintService } from "./wiki-lint.service";
import { WikiQueryService } from "./wiki-query.service";
import { WikiKbAdminService } from "./wiki-kb-admin.service";
import { WikiController } from "./wiki.controller";
import { WikiKbAdminController } from "./wiki-kb-admin.controller";

/**
 * LLM Wiki module (v1.5.3 P1).
 *
 * Imports:
 *  - PrismaModule for DB access
 *  - AiEngineModule for facade (slug-normalize / wiki-link-parser /
 *    sanitizeMarkdownBody / StaleDetectorService /
 *    CrossCuttingSynthesisService.detect{Contradictions,DataGaps})
 *  - RAGModule for KnowledgeBaseService.hasAccess (KB role checks)
 *  - CreditsModule for upcoming ingest LLM cost accounting (P2)
 *
 * Exports WikiPageService for testability and potential cross-app reuse
 * (e.g. an export job worker may stream pages without going through the
 * HTTP controller).
 */
@Module({
  imports: [PrismaModule, AiEngineModule, RAGModule, CreditsModule],
  controllers: [WikiController, WikiKbAdminController],
  providers: [
    WikiPageService,
    WikiDiffService,
    WikiIngestService,
    WikiLintService,
    WikiQueryService,
    WikiKbAdminService,
  ],
  exports: [
    WikiPageService,
    WikiDiffService,
    WikiIngestService,
    WikiLintService,
    WikiQueryService,
    WikiKbAdminService,
  ],
})
export class WikiModule {}
