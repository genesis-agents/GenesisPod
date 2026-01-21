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

import {
  Module,
  Global,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SecretsModule } from "../core/secrets/secrets.module";

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

// Orchestration Services (能力下沉)
import { TaskDecomposerService } from "./orchestration/services/task-decomposer.service";
import { AgentExecutorService } from "./orchestration/services/agent-executor.service";
import { OutputReviewerService } from "./orchestration/services/output-reviewer.service";
import { IterationManagerService } from "./orchestration/services/iteration-manager.service";
import { CircuitBreakerService } from "./orchestration/services/circuit-breaker.service";
import { TokenBudgetService } from "./orchestration/services/token-budget.service";
import { ContextEvolutionService } from "./orchestration/services/context-evolution.service";
import { ContextInitializationService } from "./orchestration/services/context-initialization.service";
import { ConstraintEnforcementService } from "./orchestration/services/constraint-enforcement.service";
import { ContextCompressionService } from "./orchestration/services/context-compression.service";
import { IntentDetectionService } from "./orchestration/services/intent-detection.service";
import { ReflectionService } from "./orchestration/services/reflection.service";

// State Machine (★ P4 沉淀)
import { ExecutionStateManager } from "./orchestration/state-machine/execution-state.manager";

// Model Fallback (★ P4 沉淀)
import { ModelFallbackService } from "./llm/model-fallback/model-fallback.service";

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
import { AiChatLLMAdapter } from "./llm/adapters/ai-chat-llm-adapter";
import { UniversalLLMAdapter } from "./llm/adapters/universal-llm-adapter";
import { TaskProfileMapperService } from "./llm/services/task-profile-mapper.service";

// Memory
import {
  InMemoryStore,
  ConversationMemory,
} from "./memory/stores/in-memory-store";

// MCP
import { MCPManager } from "./mcp/manager/mcp-manager";

// Capabilities
import { AICapabilityResolver } from "./capabilities/ai-capability-resolver.service";

// RAG
import { EmbeddingService } from "./rag/embedding";
import { VectorService } from "./rag/vector";
import { DocumentChunker } from "./rag/chunking";

// Image
import { ImageModule } from "./image/image.module";

// AiImageModule (使用 forwardRef 打破循环依赖)
import { AiImageModule } from "../ai-app/image/ai-image.module";

// NotebookResearchModule (使用 forwardRef 打破循环依赖 - AudioGenerationTool 需要 AiStudioTTSService)
import { NotebookResearchModule } from "../ai-app/research/notebook-research/notebook-research.module";

// Teams
import { TeamsModule } from "./teams/teams.module";

// Long Content Engine
import { LongContentModule } from "./long-content/long-content.module";

// Core Services (migrated from ai-core)
import { AiChatService } from "./llm/services/ai-chat.service";
import { SearchService } from "./search/search.service";
import { AiCoreService, AiCoreController } from "./api";

// Facade (统一入口)
import { AIEngineFacade } from "./facade";

// Skills SKILL.md System (★ 新增)
import { SkillLoaderService } from "./skills/loader/skill-loader.service";
import { SkillCacheService } from "./skills/loader/skill-cache.service";
import { SkillPromptBuilder } from "./skills/builder/skill-prompt-builder.service";
import { SkillsMPClientService } from "./skills/ecosystem/skillsmp-client.service";

// Skills Public API
import { SkillsController, SkillsApiService } from "./skills/api";

// Policy Research Tools (单独导入 PolicyDataService)
import { PolicyDataService } from "./tools/categories/information/policy";

// ★ 所有内置工具统一提供者
import {
  ALL_TOOL_PROVIDERS,
  ALL_TOOLS_TOKEN,
  allToolsProvider,
  TOTAL_TOOL_COUNT,
} from "./tools/tools.provider";
import { ITool } from "./tools/abstractions/tool.interface";

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
  imports: [
    PrismaModule,
    HttpModule,
    ImageModule,
    TeamsModule,
    LongContentModule,
    SecretsModule,
    // 使用 forwardRef 打破循环依赖: AiEngineModule ← ImageGenerationTool ← AiImageService ← AiImageModule → AiEngineModule
    forwardRef(() => AiImageModule),
    // 使用 forwardRef 打破循环依赖: AiEngineModule ← AudioGenerationTool ← AiStudioTTSService ← NotebookResearchModule → AiEngineModule
    forwardRef(() => NotebookResearchModule),
  ],
  controllers: [AgentsController, AiCoreController, SkillsController],
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

    // === Orchestration Services (能力下沉) ===
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    IterationManagerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ConstraintEnforcementService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService, // ★ P0 沉淀: 从 Deep Research 提取的通用反思能力
    ExecutionStateManager, // ★ P4 沉淀

    // === Model Fallback (★ P4 沉淀) ===
    ModelFallbackService,

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
    AiChatLLMAdapter,
    UniversalLLMAdapter,
    TaskProfileMapperService,

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

    // === Capabilities ===
    AICapabilityResolver,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,

    // === Facade (统一入口) ===
    AIEngineFacade,

    // === Skills SKILL.md System (★ 新增) ===
    SkillCacheService,
    SkillLoaderService,
    SkillPromptBuilder,
    SkillsMPClientService,
    SkillsApiService,

    // === Policy Data Service ===
    PolicyDataService,

    // === ★ 所有内置工具 (46 个) ===
    ...ALL_TOOL_PROVIDERS,
    allToolsProvider, // 批量注入 token
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

    // === Orchestration Services (能力下沉) ===
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    IterationManagerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ConstraintEnforcementService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService, // ★ P0 沉淀: 从 Deep Research 提取的通用反思能力
    ExecutionStateManager, // ★ P4 沉淀

    // === Model Fallback (★ P4 沉淀) ===
    ModelFallbackService,

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
    AiChatLLMAdapter,
    UniversalLLMAdapter,
    TaskProfileMapperService,

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

    // === Capabilities ===
    AICapabilityResolver,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,

    // === Image (re-export the module) ===
    ImageModule,

    // === Teams (re-export the module) ===
    TeamsModule,

    // === Long Content Engine ===
    LongContentModule,

    // === Facade (统一入口) ===
    AIEngineFacade,

    // === Skills SKILL.md System (★ 新增) ===
    SkillCacheService,
    SkillLoaderService,
    SkillPromptBuilder,
    SkillsMPClientService,

    // === Policy Data Service ===
    PolicyDataService,

    // === ★ 所有内置工具导出 ===
    ...ALL_TOOL_PROVIDERS,
  ],
})
export class AiEngineModule implements OnModuleInit {
  private readonly logger = new Logger(AiEngineModule.name);

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRegistry: AgentRegistry,
    private readonly llmFactory: LLMFactory,
    private readonly universalLLMAdapter: UniversalLLMAdapter,
    private readonly prisma: PrismaService,
    // ★ 批量注入所有工具
    @Inject(ALL_TOOLS_TOKEN) private readonly allTools: ITool[],
  ) {}

  async onModuleInit() {
    // 注册 LLM 适配器到工厂
    this.llmFactory.registerAdapter(this.universalLLMAdapter);

    // ★ 批量注册所有工具到 ToolRegistry
    for (const tool of this.allTools) {
      this.toolRegistry.register(tool);
    }

    this.logger.log("AI Engine Module initialized");
    this.logger.log(
      `  Tools: ${this.toolRegistry.size()} (expected: ${TOTAL_TOOL_COUNT})`,
    );
    this.logger.log(`  Skills: ${this.skillRegistry.size()}`);
    this.logger.log(`  Agents: ${this.agentRegistry.size()}`);
    this.logger.log(
      `  LLM Adapters: ${this.llmFactory.getAllAdapters().length}`,
    );

    // ★ T4: 验证 ToolConfig 与 ToolRegistry 同步
    await this.validateToolConfigSync();
  }

  /**
   * ★ T4: 启动时验证 ToolConfig 与 ToolRegistry 同步
   * 检测孤立配置（数据库有配置但工具未注册）
   */
  private async validateToolConfigSync(): Promise<void> {
    try {
      const dbConfigs = await this.prisma.toolConfig.findMany({
        select: { toolId: true, enabled: true },
      });

      const registeredToolIds = new Set(
        this.toolRegistry.getAll().map((t) => t.id),
      );

      // 检查孤立配置：数据库有配置但 ToolRegistry 中没有对应工具
      const orphanedConfigs = dbConfigs.filter(
        (config) => !registeredToolIds.has(config.toolId),
      );

      if (orphanedConfigs.length > 0) {
        this.logger.warn(
          `[T4] Found ${orphanedConfigs.length} orphaned ToolConfig entries (in DB but not in registry):`,
        );
        for (const config of orphanedConfigs) {
          this.logger.warn(`  - ${config.toolId} (enabled: ${config.enabled})`);
        }
        this.logger.warn(
          `  → These configs will be ignored. Consider removing them from the database.`,
        );
      }

      // 统计：有多少注册的工具在数据库中有配置
      const configuredToolIds = new Set(dbConfigs.map((c) => c.toolId));
      const unconfiguredTools = Array.from(registeredToolIds).filter(
        (id) => !configuredToolIds.has(id),
      );

      if (unconfiguredTools.length > 0) {
        this.logger.log(
          `[T4] ${unconfiguredTools.length} tools have no database config (using defaults)`,
        );
      }

      this.logger.log(
        `[T4] ToolConfig sync check: ${dbConfigs.length} DB configs, ${registeredToolIds.size} registered tools`,
      );
    } catch (error) {
      this.logger.error(
        `[T4] Failed to validate ToolConfig sync: ${error instanceof Error ? error.message : error}`,
      );
    }
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
