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
import { ModelElectionService } from "../ai-engine/llm/selection";
import { SpecAgentRegistry } from "./kernel/core/spec-agent-registry";
import {
  SPEC_AGENT_REGISTRY_PROBE,
  TOOL_CIRCUIT_BREAKER_PROBE,
} from "../ai-harness/governance/resource/runtime-resource.abstractions";
import { HookRegistry } from "./kernel/core/hook-registry";
import { ReActLoop } from "./execution/loop/react-loop";
import { PlanActLoop } from "./execution/loop/plan-act-loop";
import { ReflexionLoop } from "./execution/loop/reflexion-loop";
import { SimpleLoop } from "./execution/loop/simple-loop";
import { LoopRegistry } from "./execution/loop/loop-registry";
import { ToolInvoker } from "./execution/executor/tool-invoker";
import { ToolCircuitBreaker } from "./execution/executor/tool-circuit-breaker";
import { LlmExecutor } from "./execution/executor/llm-executor";
import { AgentExecutorService } from "./execution/executor/agent-executor.service";
import { OutputReviewerService } from "./evaluation/critique/output-reviewer.service";
import { ReportArtifactAssembler } from "./evaluation/critique/report-artifact/report-artifact-assembler.service";
import { InMemoryVectorStore } from "./memory/vector/in-memory-vector-store";
import { PrismaVectorStore } from "./memory/vector/prisma-vector-store";
import { MemoryAutoIndexer } from "./memory/auto-index/memory-auto-indexer";
import { MemoryBridge } from "./memory/auto-index/memory-bridge.service";
import {
  BuiltInReActSkillRegistry,
  SkillLoader,
  SkillActivator,
} from "./kernel/builtin-skills";
import { SKILL_PROVIDERS } from "./kernel/abstractions";
import { EngineSkillProvider } from "../ai-engine/skills/runtime/engine-skill-provider";
import { AiEngineSkillsModule } from "../ai-engine/skills/ai-engine-skills.module";
import { SubagentSpawner } from "./process/subagent";
import {
  ContextManager,
  ContextCompactor,
  PriorityPruner,
} from "./execution/context";
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
import { ModelPricingRegistry } from "./runtime/cost/model-pricing-registry";
import { SpanExporter } from "./governance/observability/tracer/span-exporter";
import { JudgeService } from "./governance/verify/judge.service";
// ★ 沉淀（2026-04-29）: figure 相关性判断（来自 topic-insights, TI 暂不切换）
import { FigureRelevanceService } from "./evaluation/figure";
// ★ 沉淀（2026-04-29）: Reflexion 批评-改进闭环（来自 topic-insights, TI 暂不切换）
//   v3 (同日): quality-gate / section-remediation / report-evaluation / quality-trace-compute
import {
  CritiqueRefineService,
  SectionSelfEvalService,
  ReportQualityGateService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
} from "./evaluation/critique";
import { MCPRelay } from "./protocol/mcp/mcp-relay.service";
import { MCPManager } from "./protocol/mcp/manager/mcp-manager";
import { MCPClientRegistryService } from "./protocol/mcp/registry/mcp-client-registry.service";
import { AgentRunner, FixtureStore } from "./kernel/dev-tools";
// PR-J..P
import { LeaderWorkerLoop } from "./execution/loop/leader-worker-loop";
import { DomainEventRegistry } from "./protocol/events/domain-event-registry";
import { DomainEventBus } from "./protocol/events/domain-event-bus";
import { LoggerBroadcastAdapter } from "./protocol/events/broadcast-adapter";
import { DomainConceptRegistry } from "./kernel/domain/concept-registry";
import { DomainAdapterRegistry } from "./kernel/domain/domain-adapter";
import { PromptRegistry } from "./execution/prompt/prompt-registry";
import { ToolSelectorRegistry } from "./execution/tools-selector/tool-selector-registry";

import { AiEngineLLMModule } from "../ai-engine/llm/ai-engine-llm.module";
import { AiEngineToolsModule } from "../ai-engine/tools/ai-engine-tools.module";
// AiEngineMemoryModule 已移除（2026-04-30）—— Memory 服务全部迁到
// ai-harness/memory（RuntimeMemoryModule @Global），无需在此 forwardRef。

// PR-X18: Engine 端 DI tokens — harness 提供这 9 个 token 的 useExisting 绑定
import {
  AGENT_REGISTRY_PORT,
  AGENT_ORCHESTRATOR_PORT,
  AGENT_CONFIG_SERVICE_PORT,
  CHECKPOINT_MANAGER_PORT,
  PROGRESS_TRACKER_PORT,
  TRACE_COLLECTOR_PORT,
  CONSTRAINT_ENFORCEMENT_PORT,
  EXECUTION_STATE_MANAGER_PORT,
  MCP_PROVIDER_PORT,
} from "../ai-engine/abstractions/runtime-deps.tokens";
import { AgentRegistry as PlanBasedAgentRegistry } from "./kernel/registry/plan-based-agent-registry";
import { AgentOrchestrator } from "./kernel/registry/agent-orchestrator";
import { AgentConfigService } from "./kernel/config/agent-config.service";
import { CheckpointManager } from "./protocol/journal/checkpoint-manager";
import { ProgressTrackerService } from "./protocol/ipc/progress-tracker.service";
import { TraceCollectorService } from "./governance/observability/trace-collector.service";
import { FailureLearnerService } from "./lifecycle/learning/failure-learner.service";
import { ConstraintEnforcementService } from "./governance/resource/constraint-enforcement.service";
import { ProcessSupervisorService } from "./process/supervisor/process-supervisor.service";

// ★ PR-X13: AIFacade + Domain Facades (migrated from ai-engine/facade)
import { AIFacade } from "./facade/ai.facade";
import { ChatFacade } from "./facade/domain/chat.facade";
import { ConcurrencyPlanner } from "./governance/resource/concurrency-planner.service";
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
    // 2026-05-01 (PR-X-K): 让 SkillActivator 能 fallback 到 ai-engine SkillRegistry，
    // 透出用户在 Admin UI / API 自定义的 skill 给 harness agent
    forwardRef(() => AiEngineSkillsModule),
  ],
  providers: [
    // Cross-cutting
    HookRegistry,

    // ai-harness/governance/resource (RuntimeResourceModule) 通过 DI token 拿 harness 能力探针，避免反向 import
    {
      provide: SPEC_AGENT_REGISTRY_PROBE,
      useExisting: SpecAgentRegistry,
    },
    {
      provide: TOOL_CIRCUIT_BREAKER_PROBE,
      useExisting: ToolCircuitBreaker,
    },

    // PR-X18: 8 个 engine 端 DI tokens — harness 提供具体类的 useExisting 绑定
    // 这样 ai-engine-planning.module 用 token 注入，避免反向 import harness 类
    PlanBasedAgentRegistry,
    AgentOrchestrator,
    AgentConfigService,
    CheckpointManager,
    ProcessSupervisorService,
    { provide: AGENT_REGISTRY_PORT, useExisting: PlanBasedAgentRegistry },
    { provide: AGENT_ORCHESTRATOR_PORT, useExisting: AgentOrchestrator },
    { provide: AGENT_CONFIG_SERVICE_PORT, useExisting: AgentConfigService },
    { provide: CHECKPOINT_MANAGER_PORT, useExisting: CheckpointManager },
    { provide: PROGRESS_TRACKER_PORT, useExisting: ProgressTrackerService },
    { provide: TRACE_COLLECTOR_PORT, useExisting: TraceCollectorService },
    {
      provide: CONSTRAINT_ENFORCEMENT_PORT,
      useExisting: ConstraintEnforcementService,
    },
    {
      provide: EXECUTION_STATE_MANAGER_PORT,
      useExisting: ProcessSupervisorService,
    },
    { provide: MCP_PROVIDER_PORT, useExisting: MCPManager },

    // Executor / Loop / Memory (Phase 2)
    ToolInvoker,
    ToolCircuitBreaker,
    InMemoryVectorStore,
    LlmExecutor,
    AgentExecutorService,
    OutputReviewerService,
    ReportArtifactAssembler,
    FailureLearnerService,
    ReActLoop,
    PlanActLoop,
    ReflexionLoop,
    SimpleLoop,
    LoopRegistry,
    MemoryBridge,

    // Skills (Phase 3)
    BuiltInReActSkillRegistry,
    SkillLoader,
    SkillActivator,
    // ★ 2026-05-01 (PR-X-K): SKILL_PROVIDERS 多源注入 — built-in miss 时 fallback
    // 到 ai-engine SkillRegistry（DB-backed 用户自定义 skill）
    {
      provide: SKILL_PROVIDERS,
      useFactory: (engineProvider: EngineSkillProvider) => [engineProvider],
      inject: [EngineSkillProvider],
    },

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

    // ★ 沉淀: figure 相关性判断（agent-playground 复用，TI 暂保留私有）
    FigureRelevanceService,
    // ★ 沉淀: Reflexion critique-refine 闭环
    CritiqueRefineService,
    SectionSelfEvalService,
    // ★ 沉淀 v3: quality-gate / remediation / evaluation / trace-compute
    ReportQualityGateService,
    SectionRemediationService,
    ReportEvaluationService,
    QualityTraceComputeService,

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
    ConcurrencyPlanner,
  ],
  // PR-I: 关键 SOTA 缺口补全
  // - ToolCircuitBreaker: 连续失败自动 disable
  // - InMemoryVectorStore: Harness 内置语义召回（不强依赖外部 coordinator）
  // HarnessInspectorController moved to open-api/admin/harness-inspector.controller.ts (PR-X17)
  exports: [
    HarnessFacade,
    AgentFactory,
    SpecAgentRegistry,
    LlmExecutor,
    AgentExecutorService,
    OutputReviewerService,
    ReportArtifactAssembler,
    FailureLearnerService,
    BuiltInReActSkillRegistry,
    ContextManager,
    CheckpointService,
    AgentEventStore,
    SkillLearner,
    SkillLearningCoordinator,
    LoopRegistry,
    ReActLoop,
    PlanActLoop,
    ReflexionLoop,
    SimpleLoop,

    // PR-X18: 导出 8 个 engine 端 token + 实现类（@Global，跨模块全局可注入）
    PlanBasedAgentRegistry,
    AgentOrchestrator,
    AgentConfigService,
    CheckpointManager,
    ProcessSupervisorService,
    AGENT_REGISTRY_PORT,
    AGENT_ORCHESTRATOR_PORT,
    AGENT_CONFIG_SERVICE_PORT,
    CHECKPOINT_MANAGER_PORT,
    PROGRESS_TRACKER_PORT,
    TRACE_COLLECTOR_PORT,
    CONSTRAINT_ENFORCEMENT_PORT,
    EXECUTION_STATE_MANAGER_PORT,
    MCP_PROVIDER_PORT,

    // ★ SOTA runtime exports
    AgentTracer,
    ToolRegistry,
    ReActRunner,
    MissionOrchestrator,
    ModelPricingRegistry,
    JudgeService,
    FigureRelevanceService, // ★ 沉淀: figure 相关性
    CritiqueRefineService, // ★ 沉淀: critique-refine
    SectionSelfEvalService, // ★ 沉淀: section-level 4 维自评
    ReportQualityGateService, // ★ 沉淀 v3: code-enforced 质量门控
    SectionRemediationService, // ★ 沉淀 v3: 弱维度合并补救
    ReportEvaluationService, // ★ 沉淀 v3: 10 维结构化报告评审
    QualityTraceComputeService, // ★ 沉淀 v3: 全链路质量 trace 纯计算
    SpanExporter,
    MCPRelay,
    MCPManager,
    MCPClientRegistryService,
    AgentRunner,
    FixtureStore,
    ToolCircuitBreaker,
    InMemoryVectorStore,

    // ai-harness/governance/resource 探针 token（实际指向上面 useExisting）
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
    ConcurrencyPlanner,
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
    @Inject(SimpleLoop) private readonly simpleLoop: SimpleLoop,
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
    // ★ Phase live-fix (2026-04-30): 单步直答 loop（纯生成 / 评分类 agent 用）
    this.loopRegistry.register(this.simpleLoop);
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
