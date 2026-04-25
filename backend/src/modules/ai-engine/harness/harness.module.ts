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
import { AgentFactory } from "./core/agent-factory";
import { ModelElectionService } from "../llm/election";
import { SpecAgentRegistry } from "./core/spec-agent-registry";
import { HookRegistry } from "./core/hook-registry";
import { ReActLoop } from "./loop/react-loop";
import { PlanActLoop } from "./loop/plan-act-loop";
import { ReflexionLoop } from "./loop/reflexion-loop";
import { LoopRegistry } from "./loop/loop-registry";
import { ToolInvoker } from "./executor/tool-invoker";
import { ToolCircuitBreaker } from "./executor/tool-circuit-breaker";
import { LlmExecutor } from "./executor/llm-executor";
import { InMemoryVectorStore } from "./memory-bridge/in-memory-vector-store";
import { PrismaVectorStore } from "./memory-bridge/prisma-vector-store";
import { MemoryAutoIndexer } from "./memory-bridge/memory-auto-indexer";
import { MemoryBridge } from "./memory-bridge/memory-bridge.service";
import { SkillRegistry, SkillLoader, SkillActivator } from "./skills";
import { SubagentSpawner } from "./subagent";
import { ContextManager, ContextCompactor, PriorityPruner } from "./context";
import { CacheControlPlanner } from "./context/cache-control-planner";
import { AgentRegistry } from "./handoff/agent-registry";
import { HandoffService } from "./handoff/handoff.service";
import {
  CheckpointService,
  InMemoryCheckpointStore,
  PrismaCheckpointStore,
  AgentEventStore,
} from "./checkpoint";
import type { ICheckpointStore } from "./checkpoint/checkpoint.types";
import { SkillLearner, SkillLearningCoordinator } from "./learning";

// ★ SOTA task-centric runtime (Phase 2-5) — 通用 L2 组件，任何 AI App 可注入
import {
  ReActRunner,
  AgentTracer,
  ToolRegistry,
  MissionOrchestrator,
} from "./runtime";
import { ModelPricingRegistry } from "./runtime/model-pricing-registry";
import { SpanExporter } from "./runtime/span-exporter";
import { JudgeService } from "./verify/judge.service";
import { MCPRelay } from "./mcp/mcp-relay.service";
import { AgentRunner, FixtureStore, HarnessInspectorController } from "./dx";
// PR-J..P
import { LeaderWorkerLoop } from "./loop/leader-worker-loop";
import { DomainEventRegistry } from "./events/domain-event-registry";
import { DomainEventBus } from "./events/domain-event-bus";
import { LoggerBroadcastAdapter } from "./events/broadcast-adapter";
import { DomainConceptRegistry } from "./domain/concept-registry";
import { DomainAdapterRegistry } from "./domain/domain-adapter";
import { PromptRegistry } from "./prompt/prompt-registry";
import { ToolSelectorRegistry } from "./tools-selector/tool-selector-registry";

import { AiEngineLLMModule } from "../ai-engine-llm.module";
import { AiEngineToolsModule } from "../ai-engine-tools.module";
import { AiEngineMemoryModule } from "../ai-engine-memory.module";

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
    AgentRunner,
    FixtureStore,
    ToolCircuitBreaker,
    InMemoryVectorStore,

    // PR-J..P exports
    LeaderWorkerLoop,
    DomainEventRegistry,
    DomainEventBus,
    LoggerBroadcastAdapter,
    DomainConceptRegistry,
    DomainAdapterRegistry,
    PromptRegistry,
    ToolSelectorRegistry,
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
