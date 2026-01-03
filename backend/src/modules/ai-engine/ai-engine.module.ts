/**
 * AI Engine Module
 * AI 引擎 NestJS 模块
 *
 * 提供统一的 AI 引擎能力：
 * - 工具系统 (Tools)
 * - 技能系统 (Skills)
 * - Agent 框架 (Agents)
 * - 编排引擎 (Orchestration)
 * - 协作框架 (Collaboration)
 * - 约束引擎 (Constraint)
 * - LLM 适配层 (LLM)
 * - 记忆系统 (Memory)
 * - MCP 协议 (MCP)
 */

import { Module, Global, OnModuleInit, Logger } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../common/prisma/prisma.module";

// Registries
import { ToolRegistry } from "./tools/registry/tool-registry";
import { SkillRegistry } from "./skills/registry/skill-registry";
import { AgentRegistry, AgentOrchestrator } from "./agents/registry";

// Agents API Layer
import { AgentsController, AgentsService } from "./agents/api";

// Orchestration
import { SequentialExecutor } from "./orchestration/executors/sequential-executor";
import { DAGExecutor } from "./orchestration/executors/dag-executor";
import { ParallelExecutor } from "./orchestration/executors/parallel-executor";
import { CheckpointManager } from "./orchestration/checkpoints/checkpoint-manager";
import { FunctionCallingExecutor } from "./orchestration/executors/function-calling-executor";

// Memory Services
import { ShortTermMemoryService } from "./memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "./memory/stores/long-term-memory.service";

// Tool Middleware
import { ToolPipeline, ToolExecutor } from "./tools/middleware/tool-pipeline";
import { ValidationMiddleware } from "./tools/middleware/validation.middleware";
import { TimeoutMiddleware } from "./tools/middleware/timeout.middleware";

// Collaboration
import { VotingManager } from "./collaboration/patterns/voting-pattern";
import { HandoffCoordinator } from "./collaboration/patterns/handoff-pattern";

// Constraint
import { SchemaValidator } from "./constraint/validators/schema-validator";
import { ContentFilter } from "./constraint/guardrails/content-filter";
import { CostController } from "./constraint/guardrails/cost-controller";
import { RateLimiter } from "./constraint/guardrails/rate-limiter";

// LLM
import { LLMFactory } from "./llm/factory/llm-factory";
import { FunctionCallingLLMAdapter } from "./llm/adapters/function-calling-llm-adapter";

// Memory
import {
  InMemoryStore,
  ConversationMemory,
} from "./memory/stores/in-memory-store";

// MCP
import { MCPManager } from "./mcp/manager/mcp-manager";

// RAG
import { EmbeddingService } from "./rag/embedding";
import { VectorService } from "./rag/vector";
import { DocumentChunker } from "./rag/chunking";

// Image
import { ImageModule } from "./image/image.module";

// Core Services (migrated from ai-core)
import { AiChatService } from "./llm/services/ai-chat.service";
import { SearchService } from "./search/search.service";
import { AiCoreService, AiCoreController } from "./api";

/**
 * 工具管道工厂
 */
const toolPipelineFactory = {
  provide: ToolPipeline,
  useFactory: () => {
    const pipeline = new ToolPipeline();
    // 添加默认中间件
    pipeline.use(new ValidationMiddleware());
    pipeline.use(new TimeoutMiddleware());
    return pipeline;
  },
};

/**
 * 工具执行器工厂
 */
const toolExecutorFactory = {
  provide: ToolExecutor,
  useFactory: (pipeline: ToolPipeline) => {
    return new ToolExecutor(pipeline);
  },
  inject: [ToolPipeline],
};

/**
 * 顺序执行器工厂
 */
const sequentialExecutorFactory = {
  provide: SequentialExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
  ) => {
    const executor = new SequentialExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    return executor;
  },
  inject: [ToolRegistry, SkillRegistry, AgentRegistry],
};

/**
 * DAG 执行器工厂
 */
const dagExecutorFactory = {
  provide: DAGExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
  ) => {
    const executor = new DAGExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    return executor;
  },
  inject: [ToolRegistry, SkillRegistry, AgentRegistry],
};

/**
 * 并行执行器工厂
 */
const parallelExecutorFactory = {
  provide: ParallelExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
  ) => {
    const executor = new ParallelExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    return executor;
  },
  inject: [ToolRegistry, SkillRegistry, AgentRegistry],
};

/**
 * 检查点管理器工厂
 */
const checkpointManagerFactory = {
  provide: CheckpointManager,
  useFactory: () => {
    return new CheckpointManager();
  },
};

/**
 * 内容过滤器工厂
 */
const contentFilterFactory = {
  provide: ContentFilter,
  useFactory: () => {
    return new ContentFilter();
  },
};

/**
 * 投票管理器工厂
 */
const votingManagerFactory = {
  provide: VotingManager,
  useFactory: () => {
    return new VotingManager();
  },
};

/**
 * 交接协调器工厂
 */
const handoffCoordinatorFactory = {
  provide: HandoffCoordinator,
  useFactory: () => {
    return new HandoffCoordinator();
  },
};

/**
 * 内存存储工厂
 */
const inMemoryStoreFactory = {
  provide: InMemoryStore,
  useFactory: () => {
    return new InMemoryStore();
  },
};

/**
 * 对话记忆工厂
 */
const conversationMemoryFactory = {
  provide: ConversationMemory,
  useFactory: () => {
    return new ConversationMemory();
  },
};

/**
 * AI Engine 核心模块
 */
@Global()
@Module({
  imports: [PrismaModule, HttpModule, ImageModule],
  controllers: [AgentsController, AiCoreController],
  providers: [
    // === Registries ===
    ToolRegistry,
    SkillRegistry,
    AgentRegistry,
    AgentOrchestrator,
    AgentsService,

    // === Tool System ===
    toolPipelineFactory,
    toolExecutorFactory,

    // === Orchestration ===
    sequentialExecutorFactory,
    dagExecutorFactory,
    parallelExecutorFactory,
    checkpointManagerFactory,
    FunctionCallingExecutor,

    // === Collaboration ===
    votingManagerFactory,
    handoffCoordinatorFactory,

    // === Constraint ===
    SchemaValidator,
    contentFilterFactory,
    CostController,
    RateLimiter,

    // === LLM ===
    LLMFactory,
    FunctionCallingLLMAdapter,

    // === Core Services (from ai-core) ===
    AiChatService,
    SearchService,
    AiCoreService,

    // === Memory ===
    inMemoryStoreFactory,
    conversationMemoryFactory,
    ShortTermMemoryService,
    LongTermMemoryService,

    // === MCP ===
    MCPManager,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,
  ],
  exports: [
    // === Registries ===
    ToolRegistry,
    SkillRegistry,
    AgentRegistry,
    AgentOrchestrator,
    AgentsService,

    // === Tool System ===
    ToolPipeline,
    ToolExecutor,

    // === Orchestration ===
    SequentialExecutor,
    DAGExecutor,
    ParallelExecutor,
    CheckpointManager,
    FunctionCallingExecutor,

    // === Collaboration ===
    VotingManager,
    HandoffCoordinator,

    // === Constraint ===
    SchemaValidator,
    ContentFilter,
    CostController,
    RateLimiter,

    // === LLM ===
    LLMFactory,
    FunctionCallingLLMAdapter,

    // === Core Services (from ai-core) ===
    AiChatService,
    SearchService,
    AiCoreService,

    // === Memory ===
    InMemoryStore,
    ConversationMemory,
    ShortTermMemoryService,
    LongTermMemoryService,

    // === MCP ===
    MCPManager,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,

    // === Image (re-export the module) ===
    ImageModule,
  ],
})
export class AiEngineModule implements OnModuleInit {
  private readonly logger = new Logger(AiEngineModule.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  onModuleInit() {
    this.logger.log("AI Engine Module initialized");
    this.logger.log(`  Tools: ${this.toolRegistry.size()}`);
    this.logger.log(`  Skills: ${this.skillRegistry.size()}`);
    this.logger.log(`  Agents: ${this.agentRegistry.size()}`);
  }
}

/**
 * AI Engine 工具子模块
 * 仅导出工具相关服务
 */
@Module({
  providers: [ToolRegistry, toolPipelineFactory, toolExecutorFactory],
  exports: [ToolRegistry, ToolPipeline, ToolExecutor],
})
export class AiEngineToolsModule {}

/**
 * AI Engine 技能子模块
 * 仅导出技能相关服务
 */
@Module({
  providers: [SkillRegistry],
  exports: [SkillRegistry],
})
export class AiEngineSkillsModule {}

/**
 * AI Engine Agent 子模块
 * 仅导出 Agent 相关服务
 */
@Module({
  providers: [AgentRegistry],
  exports: [AgentRegistry],
})
export class AiEngineAgentsModule {}

/**
 * AI Engine 编排子模块
 */
@Module({
  imports: [AiEngineToolsModule, AiEngineSkillsModule, AiEngineAgentsModule],
  providers: [
    sequentialExecutorFactory,
    dagExecutorFactory,
    parallelExecutorFactory,
    checkpointManagerFactory,
  ],
  exports: [
    SequentialExecutor,
    DAGExecutor,
    ParallelExecutor,
    CheckpointManager,
  ],
})
export class AiEngineOrchestrationModule {}

/**
 * AI Engine 协作子模块
 */
@Module({
  providers: [votingManagerFactory, handoffCoordinatorFactory],
  exports: [VotingManager, HandoffCoordinator],
})
export class AiEngineCollaborationModule {}

/**
 * AI Engine 约束子模块
 */
@Module({
  providers: [
    SchemaValidator,
    contentFilterFactory,
    CostController,
    RateLimiter,
  ],
  exports: [SchemaValidator, ContentFilter, CostController, RateLimiter],
})
export class AiEngineConstraintModule {}
