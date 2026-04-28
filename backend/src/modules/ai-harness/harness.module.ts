/**
 * Harness Module — Agent 运行时脚手架
 *
 * 依赖链：
 *   AI App → HarnessFacade → AgentFactory → (ReActLoop + MemoryBridge + SkillActivator)
 *     ReActLoop → AiChatService + ToolInvoker + HookRegistry
 *     ToolInvoker → ToolRegistry
 *     MemoryBridge → MemoryCoordinatorService (@Optional)
 *     SkillActivator → SkillRegistry + HookRegistry
 *     SkillLoader → SkillRegistry (OnModuleInit 自动加载 built-in/*)
 *
 * Phase 1: abstractions + HarnessedAgent skeleton + HookRegistry
 * Phase 2: ReActLoop + ToolInvoker + MemoryBridge
 * Phase 3: SKILL.md system (parser / registry / loader / activator)
 * Phase 4: SubagentSpawner + 3-level isolation (none / context / worktree)
 * Phase 5: Context Engineering (compactor / pruner / manager)
 * Phase 6 (current): Long-horizon checkpoint + resume + skill learning
 */

import {
  Global,
  Module,
  forwardRef,
  OnApplicationBootstrap,
  Inject,
  Optional,
} from "@nestjs/common";
import { HarnessFacade } from "./facade/harness.facade";
import { AgentFactory } from "./kernel/core/agent-factory";
import { ModelElectionService } from "../ai-engine/llm/election";
import { SpecAgentRegistry } from "./kernel/core/spec-agent-registry";
import {
  SPEC_AGENT_REGISTRY_PROBE,
  TOOL_CIRCUIT_BREAKER_PROBE,
} from "../ai-harness/governance/resource/runtime-resource.abstractions";
import { HookRegistry } from "./kernel/core/hook-registry";
import { ReActLoop } from "./execution/loop/react-loop";
import { PlanActLoop } from "./execution/loop/plan-act-loop";
import { ReflexionLoop } from "./execution/loop/reflexion-loop";
import { LoopRegistry } from "./execution/loop/loop-registry";
import { ToolInvoker } from "./execution/executor/tool-invoker";
import { ToolCircuitBreaker } from "./execution/executor/tool-circuit-breaker";
import { LlmExecutor } from "./execution/executor/llm-executor";
import { InMemoryVectorStore } from "./memory/vector/in-memory-vector-store";
import { PrismaVectorStore } from "./memory/vector/prisma-vector-store";
import { MemoryAutoIndexer } from "./memory/auto-index/memory-auto-indexer";
import { MemoryBridge } from "./memory/auto-index/memory-bridge.service";
import { SkillRegistry, SkillLoader, SkillActivator } from "./kernel/skills";
import { SubagentSpawner } from "./process/subagent";
import { ContextManager, ContextCompactor, PriorityPruner } from "./execution/context";
import { CacheControlPlanner } from "./execution/context/cache-control-planner";
import { AgentRegistry } from "./process/handoff/agent-registry";
import { HandoffService } from "./process/handoff/handoff.service";
import {
  CheckpointService,
  InMemoryCheckpointStore,
  PrismaCheckpointStore,
  AgentEventStore,
} from "./memory/checkpoint";
import type { ICheckpointStore } from "./memory/checkpoint/checkpoint.types";
import { SkillLearner, SkillLearningCoordinator } from "./kernel/learning";

// ★ SOTA task-centric runtime (Phase 2-5) — 通用 L2 组件，任何 AI App 可注入
import {
  ReActRunner,
  AgentTracer,
  ToolRegistry,
  MissionOrchestrator,
} from "./runtime";
import { ModelPricingRegistry } from "./runtime/budget/model-pricing-registry";
import { SpanExporter } from "./runtime/tracer/span-exporter";
import { JudgeService } from "./governance/verify/judge.service";
import { MCPRelay } from "./protocol/mcp/mcp-relay.service";
import { MCPManager } from "./protocol/mcp/manager/mcp-manager";
import { MCPClientRegistryService } from "./protocol/mcp/registry/mcp-client-registry.service";
import { AgentRunner, FixtureStore, HarnessInspectorController } from "./kernel/dx";
// PR-J..P
import { LeaderWorkerLoop } from "./execution/loop/leader-worker-loop";
import { DomainEventRegistry } from "./protocol/events/domain-event-registry";
import { DomainEventBus } from "./protocol/events/domain-event-bus";
import { LoggerBroadcastAdapter } from "./protocol/events/broadcast-adapter";
import { DomainConceptRegistry } from "./kernel/domain/concept-registry";
import { DomainAdapterRegistry } from "./kernel/domain/domain-adapter";
import { PromptRegistry } from "./execution/prompt/prompt-registry";
import { ToolSelectorRegistry } from "./execution/tools-selector/tool-selector-registry";

import { AiEngineLLMModule } from "../ai-engine/ai-engine-llm.module";
import { AiEngineToolsModule } from "../ai-engine/ai-engine-tools.module";
import { AiEngineMemoryModule } from "../ai-engine/ai-engine-memory.module";

// ★ PR-X13: AIFacade + Domain Facades (migrated from ai-engine/facade)
import { AIFacade } from "./facade/ai.facade";
import { ChatFacade } from "./facade/domain/chat.facade";
import { RAGFacade } from "./facade/domain/rag.facade";
import { AgentFacade } from "./facade/domain/agent.facade";
import { TeamFacade } from "./facade/domain/team.facade";
import { ToolFacade } from "./facade/domain/tool.facade";
import { ModelResolverService } from "./facade/model-resolver.service";
import { FACADE_FEATURE_PROVIDERS } from "./facade/facade.providers";

@Global()
@Module({
  imports: [
    forwardRef(() => AiEngineLLMModule),
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineMemoryModule),
  ],
  providers: [
    // Cross-cutting
    HookRegistry,

    // ai-engine/runtime/resource 通过 DI token 拿 harness 能力探针，避免反向 import
    {
      provide: SPEC_AGENT_REGISTRY_PROBE,
      useExisting: SpecAgentRegistry,
    },
    {
      provide: TOOL_CIRCUIT_BREAKER_PROBE,
      useExisting: ToolCircuitBreaker,
    },

    // Executor / Loop / Memory (Phase 2)
    ToolInvoker,
    ToolCircuitBreaker,
    InMemoryVectorStore,
    LlmExecutor,
    ReActLoop,
    PlanActLoop,
    ReflexionLoop,
    LoopRegistry,
    MemoryBridge,

    // Skills (Phase 3)
    SkillRegistry,
    SkillLoader,
    SkillActivator,

    // Subagent (Phase 4)
    SubagentSpawner,

    // Context Engineering (Phase 5)
    ContextCompactor,
    PriorityPruner,
    ContextManager,
    CacheControlPlanner,

    // PR-R: Agent Handoff
    AgentRegistry,
    HandoffService,

    // PR-S: Vector memory + auto-index
    PrismaVectorStore,
    MemoryAutoIndexer,

    // Checkpoint + Learning (Phase 6) — PR-C 升级为 Prisma 可选
    InMemoryCheckpointStore,
    PrismaCheckpointStore,
    {
      // env HARNESS_CHECKPOINT_PERSIST=1 → Prisma；否则 in-memory（保持测试/本地不污染 DB）
      provide: CheckpointService,
      useFactory: (
        memStore: InMemoryCheckpointStore,
        prismaStore: PrismaCheckpointStore,
      ) => {
        const usePrisma = process.env.HARNESS_CHECKPOINT_PERSIST === "1";
        const store: ICheckpointStore = usePrisma ? prismaStore : memStore;
        return new CheckpointService(store);
      },
      inject: [InMemoryCheckpointStore, PrismaCheckpointStore],
    },
    AgentEventStore,
    SkillLearner,
    SkillLearningCoordinator,

    // Core
    AgentFactory,
    SpecAgentRegistry,
    HarnessFacade,

    // ★ SOTA task-centric runtime (L2 generic — any AI App can inject)
    AgentTracer,
    ToolRegistry,
    ReActRunner,
    MissionOrchestrator,

    // ★ PR-B: Pricing + Verifier facade
    ModelPricingRegistry,
    JudgeService,

    // ★ PR-G: SpanExporter — AgentTracer 多目标分发（Logger + Langfuse）
    SpanExporter,

    // ★ PR-E: MCP Relay — 远端 MCP server 工具自动注册
    MCPRelay,

    // ★ PR-X7: MCP Manager + Client Registry (moved from ai-engine)
    MCPManager,
    MCPClientRegistryService,

    // ★ PR-H: DX 套件 — @DefineAgent + AgentRunner + record/replay
    AgentRunner,
    FixtureStore,

    // PR-J..P
    LeaderWorkerLoop,
    DomainEventRegistry,
    DomainEventBus,
    LoggerBroadcastAdapter,
    DomainConceptRegistry,
    DomainAdapterRegistry,
    PromptRegistry,
    ToolSelectorRegistry,

    // ★ PR-X13: AIFacade + Domain Facades (migrated from ai-engine/facade)
    // These are @Global — all ai-app modules can inject them without explicit imports.
    ...FACADE_FEATURE_PROVIDERS,
    ModelResolverService,
    ChatFacade,
    RAGFacade,
    AgentFacade,
    TeamFacade,
    ToolFacade,
    AIFacade,
  ],
  // PR-I: 关键 SOTA 缺口补全
  // - ToolCircuitBreaker: 连续失败自动 disable
  // - InMemoryVectorStore: Harness 内置语义召回（不强依赖外部 coordinator）
  controllers:
    process.env.NODE_ENV === "production" ? [] : [HarnessInspectorController],
  exports: [
    HarnessFacade,
    AgentFactory,
    SpecAgentRegistry,
    LlmExecutor,
    SkillRegistry,
    ContextManager,
    CheckpointService,
    AgentEventStore,
    SkillLearner,
    SkillLearningCoordinator,
    LoopRegistry,
    ReActLoop,
    PlanActLoop,
    ReflexionLoop,

    // ★ SOTA runtime exports
    AgentTracer,
    ToolRegistry,
    ReActRunner,
    MissionOrchestrator,
    ModelPricingRegistry,
    JudgeService,
    SpanExporter,
    MCPRelay,
    MCPManager,
    MCPClientRegistryService,
    AgentRunner,
    FixtureStore,
    ToolCircuitBreaker,
    InMemoryVectorStore,

    // ai-engine/runtime/resource 探针 token（实际指向上面 useExisting）
    SPEC_AGENT_REGISTRY_PROBE,
    TOOL_CIRCUIT_BREAKER_PROBE,

    // PR-S: Vector memory + auto-index
    PrismaVectorStore,
    MemoryAutoIndexer,

    // PR-J..P exports
    LeaderWorkerLoop,
    DomainEventRegistry,
    DomainEventBus,
    LoggerBroadcastAdapter,
    DomainConceptRegistry,
    DomainAdapterRegistry,
    PromptRegistry,
    ToolSelectorRegistry,

    // ★ PR-X13: AIFacade + Domain Facades
    ModelResolverService,
    ChatFacade,
    RAGFacade,
    AgentFacade,
    TeamFacade,
    ToolFacade,
    AIFacade,
  ],
})
export class HarnessModule implements OnApplicationBootstrap {
  constructor(
    @Inject(AgentFactory) private readonly factory: AgentFactory,
    @Inject(SubagentSpawner) private readonly spawner: SubagentSpawner,
    @Inject(LoopRegistry) private readonly loopRegistry: LoopRegistry,
    @Inject(ReActLoop) private readonly reactLoop: ReActLoop,
    @Inject(PlanActLoop) private readonly planActLoop: PlanActLoop,
    @Inject(ReflexionLoop) private readonly reflexionLoop: ReflexionLoop,
    @Inject(LeaderWorkerLoop)
    private readonly leaderWorkerLoop: LeaderWorkerLoop,
    @Inject(JudgeService) private readonly judgeService: JudgeService,
    @Inject(DomainEventBus) private readonly eventBus: DomainEventBus,
    @Inject(LoggerBroadcastAdapter)
    private readonly defaultBroadcaster: LoggerBroadcastAdapter,
    @Optional()
    @Inject(ModelElectionService)
    private readonly election?: ModelElectionService,
  ) {}

  onApplicationBootstrap(): void {
    // Break the circular dependency: AgentFactory ↔ SubagentSpawner.
    // Constructor injection requires both instances up-front; setter injection
    // lets NestJS finish provider instantiation, then we wire the cycle here.
    this.factory.setSubagentSpawner(this.spawner);
    // Same rationale for ModelElectionService — forwardRef-provided dep.
    // At onApplicationBootstrap the container is fully instantiated so Optional
    // inject here resolves cleanly without sibling-provider timing side effects.
    if (this.election) {
      this.factory.setElectionService(this.election);
    }

    // v2: 把内置 loops 注册到 LoopRegistry。
    // AgentFactory.pickLoop(spec) 据此按 spec.loop 字段派发。
    this.loopRegistry.register(this.reactLoop);
    this.loopRegistry.register(this.planActLoop);
    this.loopRegistry.register(this.reflexionLoop);
    // PR-L: 五元环 loop
    this.loopRegistry.register(this.leaderWorkerLoop);

    // PR-B: 给 ReflexionLoop 注入默认 verifiers（self + critical）。
    // PR-I 必修 #3: 改用实例方法（之前是 static，影响测试隔离）
    const defaults = this.judgeService.createVerifiers(["self", "critical"]);
    this.reflexionLoop.setDefaultVerifiers(defaults);

    // PR-K: 默认把 LoggerBroadcastAdapter 装到 EventBus（业务方可后续注册更多）
    this.eventBus.registerAdapter(this.defaultBroadcaster);
  }
}
