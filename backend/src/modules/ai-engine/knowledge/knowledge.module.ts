/**
 * AI Engine Knowledge Module
 * 知识能力子模块
 *
 * 提供:
 * - EmbeddingService (向量化)
 * - VectorService (向量存储)
 * - DocumentChunker (文档分块)
 * - RAGPipelineService (检索增强生成管线)
 *
 * 注：SearchService（web 搜索 egress）W5 已迁 content/web-search（WebSearchModule）。
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { SecretsModule } from "../../platform/credentials/storage/secrets/secrets.module";
import { UserApiKeysModule } from "../../platform/credentials/user-owned/user-api-keys/user-api-keys.module";
import { KeyExecutorModule } from "../../platform/credentials/resolution/executor/key-executor.module";
import { KeyResolverModule } from "../../platform/credentials/resolution/key-resolver/key-resolver.module";
import { KeyHealthModule } from "../../platform/credentials/governance/key-health/key-health.module";
import { ToolKeyResolverModule } from "../../platform/credentials/resolution/tool-key-resolver/tool-key-resolver.module";
import { AiEngineLLMModule } from "../llm/llm.module";
// W2-B: vector backends @Global module（pgvector / jsonb，未来 qdrant / pinecone）
import { VectorBackendsModule } from "@/plugins/storage/vector-backends.module";

// RAG
import { EmbeddingService } from "../rag/embedding";
import { VectorService } from "../rag/vector";
import { DocumentChunker } from "../rag/chunking";
import { RAGPipelineService } from "../rag/pipeline";

// Entity Resolution（实体消歧，复用 EmbeddingService）
import { EntityResolutionService } from "./entity-resolution/entity-resolution.service";
// Ontology（知识本体图谱，P1 engine core）
import { OntologyService } from "./ontology/ontology.service";
// Ontology Builder Skill（P3 engine skill）
import { OntologyBuilderSkill } from "./ontology/skills/ontology-builder.skill";
// SkillRegistry（engine skills/registry，@Global AiEngineModule re-exports it）
import { SkillRegistry } from "../skills/registry/skill.registry";

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    SecretsModule,
    UserApiKeysModule,
    KeyExecutorModule, // PR-5 (2026-05-05): cohere rerank failover
    KeyResolverModule, // 2026-05-12: 严格 BYOK——EmbeddingService 需要解析 user BYOK key
    ToolKeyResolverModule, // 2026-05-27 BYOK 全量化：SearchService 解析 user 工具 Key
    KeyHealthModule, // 2026-05-12: EmbeddingService 用 KeyErrorClassifier 把失败 → ClassifiedError 回写 user_api_keys.test_status
    AiEngineLLMModule,
    VectorBackendsModule, // W2-B: VECTOR_BACKENDS_TOKEN provider
  ],
  providers: [
    EmbeddingService,
    VectorService,
    DocumentChunker,
    RAGPipelineService,
    EntityResolutionService,
    OntologyService,
    // P3: Ontology Builder Skill
    OntologyBuilderSkill,
  ],
  exports: [
    EmbeddingService,
    VectorService,
    DocumentChunker,
    RAGPipelineService,
    EntityResolutionService,
    OntologyService,
    // P3: exported so AiEngineModule or consumers can inject it if needed
    OntologyBuilderSkill,
  ],
})
export class AiEngineKnowledgeModule implements OnModuleInit {
  private readonly logger = new Logger(AiEngineKnowledgeModule.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly ontologyBuilderSkill: OntologyBuilderSkill,
  ) {}

  onModuleInit(): void {
    this.skillRegistry.register(this.ontologyBuilderSkill);
    this.logger.log(
      `Registered engine skill: ${this.ontologyBuilderSkill.id} (layer=${this.ontologyBuilderSkill.layer})`,
    );
  }
}
