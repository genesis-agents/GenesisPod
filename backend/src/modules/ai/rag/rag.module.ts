/**
 * RAG Module
 * Provides Retrieval-Augmented Generation capabilities
 */

import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AdminModule } from "../../core/admin/admin.module";
import { AiOrchestrationModule } from "../../../common/ai-orchestration";

// Services
import { DocumentProcessorService } from "./services/document-processor.service";
import { EmbeddingService } from "./services/embedding.service";
import { RAGPipelineService } from "./services/rag-pipeline.service";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { GoogleDriveRAGService } from "./services/google-drive-rag.service";
import { VectorService } from "./services/vector.service";
import { UrlFetchService } from "./services/url-fetch.service";
import { PlatformImportService } from "./services/platform-import.service";

// Controller
import { RAGController } from "./rag.controller";

@Module({
  imports: [PrismaModule, forwardRef(() => AdminModule), AiOrchestrationModule],
  controllers: [RAGController],
  providers: [
    VectorService,
    DocumentProcessorService,
    EmbeddingService,
    RAGPipelineService,
    KnowledgeBaseService,
    GoogleDriveRAGService,
    UrlFetchService,
    PlatformImportService,
  ],
  exports: [
    VectorService,
    DocumentProcessorService,
    EmbeddingService,
    RAGPipelineService,
    KnowledgeBaseService,
    GoogleDriveRAGService,
    UrlFetchService,
    PlatformImportService,
  ],
})
export class RAGModule {}
