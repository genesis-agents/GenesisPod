/**
 * RAG Module
 * Provides Retrieval-Augmented Generation capabilities
 *
 * 核心能力 (EmbeddingService, VectorService, DocumentChunker, RAGPipelineService) 来自 AI Engine
 * 业务服务 (KnowledgeBaseService, etc.) 在本模块实现
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";

// Business Services (保留在本模块)
import { DocumentProcessorService } from "./services/document-processor.service";
import { EmbeddingProcessorService } from "./services/embedding-processor.service";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { GoogleDriveRAGService } from "./services/google-drive-rag.service";
import { UrlFetchService } from "./services/url-fetch.service";
import { PlatformImportService } from "./services/platform-import.service";
import { FeishuImportService } from "./services/feishu-import.service";

// Controller
import { RAGController } from "./rag.controller";

@Module({
  imports: [
    PrismaModule,
    AiEngineModule, // 导入 AI Engine 获取 RAG 核心能力（含 RAGPipelineService）
  ],
  controllers: [RAGController],
  providers: [
    // 业务服务
    DocumentProcessorService,
    EmbeddingProcessorService,
    KnowledgeBaseService,
    GoogleDriveRAGService,
    UrlFetchService,
    PlatformImportService,
    FeishuImportService,
  ],
  exports: [
    // 重新导出 AiEngineModule (向后兼容，使导入 RAGModule 的模块可以访问 AI Engine 服务)
    AiEngineModule,
    // 业务服务
    DocumentProcessorService,
    EmbeddingProcessorService,
    KnowledgeBaseService,
    GoogleDriveRAGService,
    UrlFetchService,
    PlatformImportService,
    FeishuImportService,
  ],
})
export class RAGModule {}
