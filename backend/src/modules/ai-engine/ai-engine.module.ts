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
 * - AiEnginePlanningModule: 编排引擎
 * - AiEngineMemoryModule: 记忆系统
 * - AiEngineConstraintModule: 约束引擎
 * - AiEngineKnowledgeModule: 知识能力 (RAG + Search)
 */

import { Module, Global, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SecretsModule } from "../ai-infra/secrets/secrets.module";

// ★ 子模块导入
import { AiEngineLLMModule } from "./ai-engine-llm.module";
import { AiEngineToolsModule } from "./ai-engine-tools.module";
import { AiEngineSkillsModule } from "./ai-engine-skills.module";
import { AiEnginePlanningModule } from "./ai-engine-planning.module";
import { AiEngineMemoryModule } from "./ai-engine-memory.module";
import { AiEngineConstraintModule } from "./ai-engine-constraint.module";
import { AiEngineKnowledgeModule } from "./ai-engine-knowledge.module";
// ★ P2 能力下沉：新增子模块导入
import { EvidenceModule } from "./knowledge/evidence/evidence.module";
import { QualityModule } from "./safety/quality/quality.module";
// ★ HarnessModule / RuntimeModule / RealtimeModule + CollaborationModule 由
// app.module.ts / harness.module.ts 直接装配（@Global，跨模块可注入）。
// AI Engine 不再反向依赖 ai-harness。

// Registries (从子模块重新导出，用于初始化)
import { ToolRegistry } from "./tools/registry/tool-registry";
import { SkillRegistry } from "./skills/registry/skill-registry";
// AgentRegistry 在 ai-harness/kernel/registry，由 HarnessModule 装配；
// ai-engine.module 不再注入它，注册日志移至 HarnessModule onModuleInit。

// LLM Factory & Adapter (用于初始化)
import { LLMFactory } from "./llm/factory/llm-factory";
import { UniversalLLMAdapter } from "./llm/adapters/universal-llm-adapter";

// AiCoreController + AiCoreService moved to open-api/ai-core (PR-X6)
// They are now registered in AiCoreModule, not here.

// ★ Phase 3: ContentAnalysisModule moved to ai-app/office/content-analysis/

// Content Fetch (generic URL fetch capability)
import { ContentFetchModule } from "./content/fetch/content-fetch.module";

// ★ Phase 3: SynthesisModule moved to ai-app/office/content-synthesis/

// Other Modules
import { ImageModule } from "./content/image/image.module";
// ★ TeamsModule 已迁移到 ai-harness/runtime/teams（PR-X4），由 RuntimeModule 统一装配
// ★ Phase 3: LongContentModule moved to ai-app/writing/content-engine/
import { PromptsModule } from "./llm/prompts/prompts.module";
import { CreditsModule } from "../ai-infra/credits/credits.module";

// MCP moved to ai-harness/protocol/mcp (PR-X7)
// MCPManager and MCPClientRegistryService are now provided by HarnessModule (@Global)

// Capabilities
import { AICapabilityResolver } from "./planning/capabilities/ai-capability-resolver.service";

// Observability core 全部由 ai-harness/ObservabilityModule (@Global) 提供，
// 包括 AiEngineTracingService / EvalPipelineService — engine 不再注册它们。

// Prompt Registry
import { PromptRegistryService } from "./llm/prompts/prompt-registry.service";

// ★ PR-X13: AIEngineFacade + Domain Facades + FACADE_FEATURE_PROVIDERS + ModelResolverService
// 已迁移至 ai-harness/facade，由 HarnessModule (@Global) 统一装配。

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
    SecretsModule,

    // ★ 子模块
    AiEngineLLMModule,
    AiEngineToolsModule,
    AiEngineSkillsModule,
    AiEnginePlanningModule,
    AiEngineMemoryModule,
    AiEngineConstraintModule,
    AiEngineKnowledgeModule,
    // ★ P2 能力下沉：新增子模块
    EvidenceModule,
    QualityModule,
    // CollaborationModule 已搬到 ai-harness/process/collaboration（@Global），
    // 由 harness.module 装配，无需在 engine 重复

    // Content Fetch (generic URL fetch capability)
    ContentFetchModule,

    // Other Modules
    ImageModule,
    // TeamsModule 已迁移到 ai-harness/runtime/teams（PR-X4），由 RuntimeModule 统一装配
    PromptsModule,
    CreditsModule, // ★ 积分服务（用于 Facade 自动计费）
  ],
  controllers: [], // AiCoreController moved to open-api/ai-core (PR-X6)
  providers: [
    // AiCoreService moved to open-api/ai-core (PR-X6)

    // ★ VotingManager 和 HandoffCoordinator 已迁移到 CollaborationModule

    // === MCP moved to ai-harness/protocol/mcp (PR-X7) ===
    // MCPManager and MCPClientRegistryService now provided by HarnessModule (@Global)

    // === Capabilities ===
    AICapabilityResolver,

    // === Observability (全部由 ai-harness/ObservabilityModule @Global 提供) ===

    // === Prompt Registry ===
    PromptRegistryService,

    // === Facade (PR-X13) ===
    // AIEngineFacade / Domain Facades / FACADE_FEATURE_PROVIDERS / ModelResolverService
    // 已迁移至 ai-harness/facade，由 HarnessModule (@Global) 统一装配。

    // === SKILL.md Runtime ===
    PromptSkillBridge,
    InputBindingResolver,
  ],
  exports: [
    // ★ 重新导出子模块
    AiEngineLLMModule,
    AiEngineToolsModule,
    AiEngineSkillsModule,
    AiEnginePlanningModule,
    AiEngineMemoryModule,
    AiEngineConstraintModule,
    AiEngineKnowledgeModule,
    // ★ P2 能力下沉：新增子模块导出
    EvidenceModule,
    QualityModule,
    // CollaborationModule 已搬到 ai-harness/process/collaboration（@Global），
    // 由 harness.module 装配，无需在 engine 重复

    // Content Fetch (generic URL fetch capability)
    ContentFetchModule,

    // Other Modules
    ImageModule,
    // TeamsModule 已迁移到 ai-harness/runtime/teams（PR-X4），不再由 ai-engine 导出
    PromptsModule,

    // ★ VotingManager 和 HandoffCoordinator 通过 CollaborationModule 导出

    // === MCP moved to ai-harness/protocol/mcp (PR-X7) — MCPManager exported by HarnessModule ===

    // === Capabilities ===
    AICapabilityResolver,

    // === Observability (全部由 ai-harness/ObservabilityModule @Global 提供) ===

    // === Prompt Registry ===
    PromptRegistryService,

    // === Facade (PR-X13) ===
    // AIEngineFacade / Domain Facades / ModelResolverService
    // 已迁移至 ai-harness/facade，由 HarnessModule (@Global) 统一装配。

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
    // Agents registry 由 HarnessModule 自报状态
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

      // Provider ID → Registry Tool ID 别名映射
      // 前端用 provider ID（如 openalex）保存配置，代码用 registry ID（如 openalex-search）注册工具
      const providerAliases: Record<string, string> = {
        openalex: "openalex-search",
        "alpha-vantage": "finance-api",
      };

      // 检查孤立配置：数据库有配置但 ToolRegistry 中没有对应工具（考虑别名）
      const orphanedConfigs = dbConfigs.filter(
        (config) =>
          !registeredToolIds.has(config.toolId) &&
          !registeredToolIds.has(providerAliases[config.toolId] ?? ""),
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
        `[T4] Failed to validate ToolConfig sync: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
