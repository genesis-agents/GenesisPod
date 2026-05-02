/**
 * AI Engine Knowledge Module
 * 知识能力子模块
 *
 * 提供:
 * - EmbeddingService (向量化)
 * - VectorService (向量存储)
 * - DocumentChunker (文档分块)
 * - RAGPipelineService (检索增强生成管线)
 * - SearchService (搜索)
 */

import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";
import { UserApiKeysModule } from "../../ai-infra/credentials/user-api-keys/user-api-keys.module";
import { AiEngineLLMModule } from "../llm/llm.module";

// RAG
import { EmbeddingService } from "../rag/embedding";
import { VectorService } from "../rag/vector";
import { DocumentChunker } from "../rag/chunking";
import { RAGPipelineService } from "../rag/pipeline";

// Search
import { SearchService } from "./search/search.service";

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    SecretsModule,
    UserApiKeysModule,
    AiEngineLLMModule,
  ],
  providers: [
    EmbeddingService,
    VectorService,
    DocumentChunker,
    RAGPipelineService,
    SearchService,
  ],
  exports: [
    EmbeddingService,
    VectorService,
    DocumentChunker,
    RAGPipelineService,
    SearchService,
  ],
})
export class AiEngineKnowledgeModule {}
