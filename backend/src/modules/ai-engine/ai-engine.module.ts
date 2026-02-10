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
 *
 * 架构：模块化拆分为子模块
 * - AiEngineLLMModule: LLM 适配层
 * - AiEngineToolsModule: 工具系统
 * - AiEngineSkillsModule: 技能系统
 * - AiEngineOrchestrationModule: 编排引擎
 * - AiEngineMemoryModule: 记忆系统
 * - AiEngineConstraintModule: 约束引擎
 */

import { Module, Global, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SecretsModule } from "../core/secrets/secrets.module";

// ★ 子模块导入
import { AiEngineLLMModule } from "./ai-engine-llm.module";
import { AiEngineToolsModule } from "./ai-engine-tools.module";
import { AiEngineSkillsModule } from "./ai-engine-skills.module";
import { AiEngineOrchestrationModule } from "./ai-engine-orchestration.module";
import { AiEngineMemoryModule } from "./ai-engine-memory.module";
import { AiEngineConstraintModule } from "./ai-engine-constraint.module";
// ★ P2 能力下沉：新增子模块导入
import { EvidenceModule } from "./evidence/evidence.module";
import { QualityModule } from "./quality/quality.module";
import { CollaborationModule } from "./collaboration/collaboration.module";
import { RealtimeModule } from "./realtime/realtime.module";

// Registries (从子模块重新导出，用于初始化)
import { ToolRegistry } from "./tools/registry/tool-registry";
import { SkillRegistry } from "./skills/registry/skill-registry";
import { AgentRegistry } from "./agents/registry";

// LLM Factory & Adapter (用于初始化)
import { LLMFactory } from "./llm/factory/llm-factory";
import { UniversalLLMAdapter } from "./llm/adapters/universal-llm-adapter";

// Controllers & API Services (only AiCoreController, others in sub-modules)
import { AiCoreController, AiCoreService } from "./api";

// Other Modules
import { ImageModule } from "./image/image.module";
import { TeamsModule } from "./teams/teams.module";
import { LongContentModule } from "./long-content/long-content.module";
import { PromptsModule } from "./prompts/prompts.module";
import { CreditsModule } from "../credits/credits.module";

// MCP
import { MCPManager } from "./mcp/manager/mcp-manager";

// Capabilities
import { AICapabilityResolver } from "./capabilities/ai-capability-resolver.service";

// RAG
import { EmbeddingService } from "./rag/embedding";
import { VectorService } from "./rag/vector";
import { DocumentChunker } from "./rag/chunking";

// Observability
import { AiEngineTracingService, TraceCollectorService } from "./observability";
import { AiObservabilityService } from "./observability/ai-observability.service";
import { CostAttributionService } from "./observability/cost-attribution.service";

// Prompt Registry
import { PromptRegistryService } from "./prompts/prompt-registry.service";

// Facade (统一入口)
import { AIEngineFacade } from "./facade";
import { FACADE_FEATURE_PROVIDERS } from "./facade/facade.providers";

// SKILL.md Runtime (PromptSkillBridge + InputBindingResolver)
import { PromptSkillBridge } from "./skills/runtime/prompt-skill-bridge.service";
import { InputBindingResolver } from "./skills/runtime/input-binding-resolver";

// ★ VotingManager 和 HandoffCoordinator 已迁移到 CollaborationModule
// (不再需要在此导入，通过 CollaborationModule 导出)

// Tools Token
import { ALL_TOOLS_TOKEN, TOTAL_TOOL_COUNT } from "./tools/tools.provider";
import { ITool } from "./tools/abstractions/tool.interface";

/**
 * AI Engine 核心模块
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    SecretsModule, // Required for EmbeddingService

    // ★ 子模块
    AiEngineLLMModule,
    AiEngineToolsModule,
    AiEngineSkillsModule,
    AiEngineOrchestrationModule,
    AiEngineMemoryModule,
    AiEngineConstraintModule,
    // ★ P2 能力下沉：新增子模块
    EvidenceModule,
    QualityModule,
    CollaborationModule,
    RealtimeModule,

    // Other Modules
    ImageModule,
    TeamsModule,
    LongContentModule,
    PromptsModule,
    CreditsModule, // ★ 积分服务（用于 Facade 自动计费）
  ],
  controllers: [AiCoreController],
  providers: [
    // === Facade Feature Providers (分组注入) ===
    ...FACADE_FEATURE_PROVIDERS,

    // === API Service ===
    AiCoreService,

    // ★ VotingManager 和 HandoffCoordinator 已迁移到 CollaborationModule

    // === MCP ===
    MCPManager,

    // === Capabilities ===
    AICapabilityResolver,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,

    // === Observability ===
    AiEngineTracingService,
    TraceCollectorService,
    AiObservabilityService,
    CostAttributionService,

    // === Prompt Registry ===
    PromptRegistryService,

    // === Facade (统一入口) ===
    AIEngineFacade,

    // === SKILL.md Runtime ===
    PromptSkillBridge,
    InputBindingResolver,
  ],
  exports: [
    // ★ 重新导出子模块
    AiEngineLLMModule,
    AiEngineToolsModule,
    AiEngineSkillsModule,
    AiEngineOrchestrationModule,
    AiEngineMemoryModule,
    AiEngineConstraintModule,
    // ★ P2 能力下沉：新增子模块导出
    EvidenceModule,
    QualityModule,
    CollaborationModule,
    RealtimeModule,

    // Other Modules
    ImageModule,
    TeamsModule,
    LongContentModule,
    PromptsModule,

    // ★ VotingManager 和 HandoffCoordinator 通过 CollaborationModule 导出

    // === MCP ===
    MCPManager,

    // === Capabilities ===
    AICapabilityResolver,

    // === RAG ===
    EmbeddingService,
    VectorService,
    DocumentChunker,

    // === Observability ===
    AiEngineTracingService,
    TraceCollectorService,
    AiObservabilityService,
    CostAttributionService,

    // === Prompt Registry ===
    PromptRegistryService,

    // === Facade (统一入口) ===
    AIEngineFacade,

    // === SKILL.md Runtime ===
    PromptSkillBridge,
    InputBindingResolver,
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
