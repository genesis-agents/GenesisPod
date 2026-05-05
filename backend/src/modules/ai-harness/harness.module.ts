/**
 * Harness Module Ã¢â‚¬â€ Agent Ã¨Â¿ÂÃ¨Â¡Å’Ã¦â€”Â¶Ã¨â€žÅ¡Ã¦â€°â€¹Ã¦Å¾Â¶
 *
 * Ã¤Â¾ÂÃ¨Âµâ€“Ã©â€œÂ¾Ã¯Â¼Å¡
 *   AI App Ã¢â€ â€™ HarnessFacade Ã¢â€ â€™ AgentFactory Ã¢â€ â€™ (ReActLoop + MemoryContextBindingService + SkillActivator)
 *     ReActLoop Ã¢â€ â€™ AiChatService + ToolInvoker + HookRegistry
 *     ToolInvoker Ã¢â€ â€™ ToolRegistry
 *     MemoryContextBindingService Ã¢â€ â€™ MemoryCoordinatorService (@Optional)
 *     SkillActivator Ã¢â€ â€™ SkillRegistry + HookRegistry
 *     SkillLoader Ã¢â€ â€™ SkillRegistry (OnModuleInit Ã¨â€¡ÂªÃ¥Å Â¨Ã¥Å Â Ã¨Â½Â½ built-in/*)
 *
 * Phase 1: abstractions + HarnessedAgent skeleton + HookRegistry
 * Phase 2: ReActLoop + ToolInvoker + MemoryContextBindingService
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
import { AgentFactory } from "./agents/core/agent-factory";
import { ModelElectionService } from "../ai-engine/llm/selection";
import { SpecAgentRegistry } from "./agents/core/spec-agent-registry";
import {
  SPEC_AGENT_REGISTRY_PROBE,
  TOOL_CIRCUIT_BREAKER_PROBE,
} from "../ai-harness/guardrails/runtime/runtime-resource.abstractions";
import { HookRegistry } from "./agents/core/hook-registry";
import { ReActLoop } from "./runner/loop/react-loop";
import { PlanActLoop } from "./runner/loop/plan-act-loop";
import { ReflexionLoop } from "./runner/loop/reflexion-loop";
import { SimpleLoop } from "./runner/loop/simple-loop";
import { LoopRegistry } from "./runner/loop/loop-registry";
import { ToolInvoker } from "./runner/tool-invoker/tool-invoker";
import { ToolCircuitBreaker } from "./runner/tool-invoker/tool-circuit-breaker";
import { LlmExecutor } from "./runner/executor/llm-executor";
import { AgentExecutorService } from "./runner/executor/agent-executor.service";
import { OutputReviewerService } from "./evaluation/critique/output-reviewer.service";
import { ReportArtifactAssembler } from "./evaluation/critique/report-artifact/report-artifact-assembler.service";
import { InMemoryVectorStore } from "./memory/vector/in-memory-vector-store";
import { PrismaVectorStore } from "./memory/vector/prisma-vector-store";
import { MemoryAutoIndexer } from "./memory/indexing/memory-auto-indexer";
import { MemoryContextBindingService } from "./memory/indexing/memory-context-binding.service";
import {
  BuiltinSkillCatalog,
  SkillLoader,
  SkillActivator,
} from "./agents/builtin-skills";
import { SKILL_PROVIDERS } from "./agents/abstractions";
import { EngineSkillProvider } from "../ai-engine/skills/runtime/adapters/engine-skill-provider.adapter";
import { AiEngineSkillsModule } from "../ai-engine/skills/skills.module";
import { SubagentSpawner } from "./agents/subagents";
import {
  ContextManager,
  ContextCompactor,
  PriorityPruner,
} from "./runner/context";
import { CacheControlPlanner } from "./runner/context/cache-control-planner";
import { AgentRegistry } from "./handoffs/agent-registry";
import { HandoffService } from "./handoffs/handoff.service";
import {
  CheckpointService,
  InMemoryCheckpointStore,
  PrismaCheckpointStore,
  AgentEventStore,
} from "./memory/checkpoint";
import type { ICheckpointStore } from "./memory/checkpoint/checkpoint.types";
import { SkillLearner, SkillLearningCoordinator } from "./agents/learning";

// SOTA task-centric runner/planning services available to AI Apps.
import { ReActRunner } from "./runner/env/react-runner";
import { AgentTracer } from "./tracing/tracer/otel-tracer";
import { ToolRegistry } from "./runner/env/tool-registry";
import { MissionOrchestrator } from "./runner/plan-execution/task-execution-orchestrator";
import { ModelPricingRegistry } from "@/modules/ai-engine/llm/pricing/model-pricing.registry";
import { SpanExporter } from "./tracing/tracer/span-exporter";
import { JudgeService } from "./evaluation/verify/judge.service";
// Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬Ã¯Â¼Ë†2026-04-29Ã¯Â¼â€°: figure Ã§â€ºÂ¸Ã¥â€¦Â³Ã¦â‚¬Â§Ã¥Ë†Â¤Ã¦â€“Â­Ã¯Â¼Ë†Ã¦ÂÂ¥Ã¨â€¡Âª <consumer>, TI Ã¦Å¡â€šÃ¤Â¸ÂÃ¥Ë†â€¡Ã¦ÂÂ¢Ã¯Â¼â€°
import { FigureRelevanceService } from "./evaluation/figure";
// Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬Ã¯Â¼Ë†2026-04-29Ã¯Â¼â€°: Reflexion Ã¦â€°Â¹Ã¨Â¯â€ž-Ã¦â€Â¹Ã¨Â¿â€ºÃ©â€”Â­Ã§Å½Â¯Ã¯Â¼Ë†Ã¦ÂÂ¥Ã¨â€¡Âª <consumer>, TI Ã¦Å¡â€šÃ¤Â¸ÂÃ¥Ë†â€¡Ã¦ÂÂ¢Ã¯Â¼â€°
//   v3 (Ã¥ÂÅ’Ã¦â€”Â¥): quality-gate / section-remediation / report-evaluation / quality-trace-compute
import {
  CritiqueRefineService,
  SectionSelfEvalService,
  ReportQualityGateService,
  SectionRemediationService,
  ReportEvaluationService,
  QualityTraceComputeService,
} from "./evaluation/critique";
import { MCPRelay } from "../ai-engine/tools/adapters/mcp/mcp-relay.service";
import { MCPManager } from "../ai-engine/tools/adapters/mcp/manager/mcp-manager";
import { MCPClientRegistryService } from "../ai-engine/tools/adapters/mcp/registry/mcp-client-registry.service";
import { AgentRunner, FixtureStore } from "./agents/dev-tools";
// PR-J..P
import { LeaderWorkerLoop } from "./runner/loop/leader-worker-loop";
import { DomainEventRegistry } from "./protocols/events/domain-event-registry";
import { DomainEventBus } from "./protocols/events/domain-event-bus";
import { LoggerBroadcastAdapter } from "./protocols/events/broadcast-adapter";
import { DomainConceptRegistry } from "./agents/domain/concept-registry";
import { DomainAdapterRegistry } from "./agents/domain/domain-adapter";
import { PromptRegistry } from "./runner/prompt/prompt-registry";
import { ToolSelectorRegistry } from "./runner/tool-routing/tool-selector-registry";

import { AiEngineLLMModule } from "../ai-engine/llm/llm.module";
import { AiEngineToolsModule } from "../ai-engine/tools/tools.module";
// AiEngineMemoryModule Ã¥Â·Â²Ã§Â§Â»Ã©â„¢Â¤Ã¯Â¼Ë†2026-04-30Ã¯Â¼â€°Ã¢â‚¬â€Ã¢â‚¬â€ Memory Ã¦Å“ÂÃ¥Å Â¡Ã¥â€¦Â¨Ã©Æ’Â¨Ã¨Â¿ÂÃ¥Ë†Â°
// ai-harness/memoryÃ¯Â¼Ë†RuntimeMemoryModule @GlobalÃ¯Â¼â€°Ã¯Â¼Å’Ã¦â€”Â Ã©Å“â‚¬Ã¥Å“Â¨Ã¦Â­Â¤ forwardRefÃ£â‚¬â€š

// PR-X18: Engine Ã§Â«Â¯ DI tokens Ã¢â‚¬â€ harness Ã¦ÂÂÃ¤Â¾â€ºÃ¨Â¿â„¢ 9 Ã¤Â¸Âª token Ã§Å¡â€ž useExisting Ã§Â»â€˜Ã¥Â®Å¡
import {
  AGENT_REGISTRY_PORT,
  AGENT_ORCHESTRATOR_PORT,
  AGENT_CONFIG_SERVICE_PORT,
  CHAT_PROVIDER_PORT,
  CHECKPOINT_MANAGER_PORT,
  PROGRESS_TRACKER_PORT,
  TRACE_COLLECTOR_PORT,
  CONSTRAINT_ENFORCEMENT_PORT,
  EXECUTION_STATE_MANAGER_PORT,
  MCP_PROVIDER_PORT,
} from "@/modules/ai-engine/facade/abstractions/runtime-deps.tokens";
import { AgentRegistry as PlanBasedAgentRegistry } from "./agents/registry/plan-based-agent-registry";
import { AgentOrchestrator } from "./agents/registry/agent-orchestrator";
import { AgentConfigService } from "./agents/config/agent-config.service";
import { CheckpointManager } from "./protocols/journal/checkpoint-manager";
import { ProgressTrackerService } from "./protocols/ipc/progress-tracker.service";
import { TraceCollectorService } from "./tracing/observability/trace-collector.service";
import { FailureLearnerService } from "./lifecycle/learning/failure-learner.service";
import { PostmortemClassifierService } from "./lifecycle/learning/postmortem-classifier.service";
import { ConstraintEnforcementService } from "./guardrails/constraints/constraint-enforcement.service";
import { ProcessSupervisorService } from "./lifecycle/supervisor/process-supervisor.service";

// Ã¢Ëœâ€¦ PR-X13: AIFacade + Domain Facades (migrated from ai-engine/facade)
import { AIFacade } from "./facade/ai.facade";
import { ChatFacade } from "./facade/domain/chat.facade";
import { ConcurrencyPlanner } from "./guardrails/resources/concurrency-planner.service";
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
    // 2026-05-01 (PR-X-K): Ã¨Â®Â© SkillActivator Ã¨Æ’Â½ fallback Ã¥Ë†Â° ai-engine SkillRegistryÃ¯Â¼Å’
    // Ã©â‚¬ÂÃ¥â€¡ÂºÃ§â€Â¨Ã¦Ë†Â·Ã¥Å“Â¨ Admin UI / API Ã¨â€¡ÂªÃ¥Â®Å¡Ã¤Â¹â€°Ã§Å¡â€ž skill Ã§Â»â„¢ harness agent
    forwardRef(() => AiEngineSkillsModule),
  ],
  providers: [
    // Cross-cutting
    HookRegistry,

    // ai-harness/guardrails (RuntimeResourceModule) Ã©â‚¬Å¡Ã¨Â¿â€¡ DI token Ã¦â€¹Â¿ harness Ã¨Æ’Â½Ã¥Å â€ºÃ¦Å½Â¢Ã©â€™Ë†Ã¯Â¼Å’Ã©ÂÂ¿Ã¥â€¦ÂÃ¥ÂÂÃ¥Ââ€˜ import
    {
      provide: SPEC_AGENT_REGISTRY_PROBE,
      useExisting: SpecAgentRegistry,
    },
    {
      provide: TOOL_CIRCUIT_BREAKER_PROBE,
      useExisting: ToolCircuitBreaker,
    },

    // PR-X18: 8 Ã¤Â¸Âª engine Ã§Â«Â¯ DI tokens Ã¢â‚¬â€ harness Ã¦ÂÂÃ¤Â¾â€ºÃ¥â€¦Â·Ã¤Â½â€œÃ§Â±Â»Ã§Å¡â€ž useExisting Ã§Â»â€˜Ã¥Â®Å¡
    // Ã¨Â¿â„¢Ã¦Â Â· planning.module Ã§â€Â¨ token Ã¦Â³Â¨Ã¥â€¦Â¥Ã¯Â¼Å’Ã©ÂÂ¿Ã¥â€¦ÂÃ¥ÂÂÃ¥Ââ€˜ import harness Ã§Â±Â»
    PlanBasedAgentRegistry,
    AgentOrchestrator,
    AgentConfigService,
    CheckpointManager,
    ProcessSupervisorService,
    { provide: AGENT_REGISTRY_PORT, useExisting: PlanBasedAgentRegistry },
    { provide: AGENT_ORCHESTRATOR_PORT, useExisting: AgentOrchestrator },
    { provide: AGENT_CONFIG_SERVICE_PORT, useExisting: AgentConfigService },
    { provide: CHAT_PROVIDER_PORT, useExisting: ChatFacade },
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
    PostmortemClassifierService,
    ReActLoop,
    PlanActLoop,
    ReflexionLoop,
    SimpleLoop,
    LoopRegistry,
    MemoryContextBindingService,

    // Skills (Phase 3)
    BuiltinSkillCatalog,
    SkillLoader,
    SkillActivator,
    // Ã¢Ëœâ€¦ 2026-05-01 (PR-X-K): SKILL_PROVIDERS Ã¥Â¤Å¡Ã¦ÂºÂÃ¦Â³Â¨Ã¥â€¦Â¥ Ã¢â‚¬â€ built-in miss Ã¦â€”Â¶ fallback
    // Ã¥Ë†Â° ai-engine SkillRegistryÃ¯Â¼Ë†DB-backed Ã§â€Â¨Ã¦Ë†Â·Ã¨â€¡ÂªÃ¥Â®Å¡Ã¤Â¹â€° skillÃ¯Â¼â€°
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

    // PR-S: Vector memory + indexing
    PrismaVectorStore,
    MemoryAutoIndexer,

    // Checkpoint + Learning (Phase 6) Ã¢â‚¬â€ PR-C Ã¥Ââ€¡Ã§ÂºÂ§Ã¤Â¸Âº Prisma Ã¥ÂÂ¯Ã©â‚¬â€°
    InMemoryCheckpointStore,
    PrismaCheckpointStore,
    {
      // env HARNESS_CHECKPOINT_PERSIST=1 Ã¢â€ â€™ PrismaÃ¯Â¼â€ºÃ¥ÂÂ¦Ã¥Ë†â„¢ in-memoryÃ¯Â¼Ë†Ã¤Â¿ÂÃ¦Å’ÂÃ¦Âµâ€¹Ã¨Â¯â€¢/Ã¦Å“Â¬Ã¥Å“Â°Ã¤Â¸ÂÃ¦Â±Â¡Ã¦Å¸â€œ DBÃ¯Â¼â€°
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

    // SOTA task-centric runner/planning services.
    AgentTracer,
    ToolRegistry,
    ReActRunner,
    MissionOrchestrator,

    // Ã¢Ëœâ€¦ PR-B: Pricing + Verifier facade
    ModelPricingRegistry,
    JudgeService,

    // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬: figure Ã§â€ºÂ¸Ã¥â€¦Â³Ã¦â‚¬Â§Ã¥Ë†Â¤Ã¦â€“Â­Ã¯Â¼Ë†<consumer> Ã¥Â¤ÂÃ§â€Â¨Ã¯Â¼Å’TI Ã¦Å¡â€šÃ¤Â¿ÂÃ§â€¢â„¢Ã§Â§ÂÃ¦Å“â€°Ã¯Â¼â€°
    FigureRelevanceService,
    // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬: Reflexion critique-refine Ã©â€”Â­Ã§Å½Â¯
    CritiqueRefineService,
    SectionSelfEvalService,
    // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬ v3: quality-gate / remediation / evaluation / trace-compute
    ReportQualityGateService,
    SectionRemediationService,
    ReportEvaluationService,
    QualityTraceComputeService,

    // Ã¢Ëœâ€¦ PR-G: SpanExporter Ã¢â‚¬â€ AgentTracer Ã¥Â¤Å¡Ã§â€ºÂ®Ã¦Â â€¡Ã¥Ë†â€ Ã¥Ââ€˜Ã¯Â¼Ë†Logger + LangfuseÃ¯Â¼â€°
    SpanExporter,

    // Ã¢Ëœâ€¦ PR-E: MCP Relay Ã¢â‚¬â€ Ã¨Â¿Å“Ã§Â«Â¯ MCP server Ã¥Â·Â¥Ã¥â€¦Â·Ã¨â€¡ÂªÃ¥Å Â¨Ã¦Â³Â¨Ã¥â€ Å’
    MCPRelay,

    // Ã¢Ëœâ€¦ PR-X7: MCP Manager + Client Registry (moved from ai-engine)
    MCPManager,
    MCPClientRegistryService,

    // Ã¢Ëœâ€¦ PR-H: DX Ã¥Â¥â€”Ã¤Â»Â¶ Ã¢â‚¬â€ @DefineAgent + AgentRunner + record/replay
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

    // Ã¢Ëœâ€¦ PR-X13: AIFacade + Domain Facades (migrated from ai-engine/facade)
    // These are @Global Ã¢â‚¬â€ all ai-app modules can inject them without explicit imports.
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
  // PR-I: Ã¥â€¦Â³Ã©â€Â® SOTA Ã§Â¼ÂºÃ¥ÂÂ£Ã¨Â¡Â¥Ã¥â€¦Â¨
  // - ToolCircuitBreaker: Ã¨Â¿Å¾Ã§Â»Â­Ã¥Â¤Â±Ã¨Â´Â¥Ã¨â€¡ÂªÃ¥Å Â¨ disable
  // - InMemoryVectorStore: Harness Ã¥â€ â€¦Ã§Â½Â®Ã¨Â¯Â­Ã¤Â¹â€°Ã¥ÂÂ¬Ã¥â€ºÅ¾Ã¯Â¼Ë†Ã¤Â¸ÂÃ¥Â¼ÂºÃ¤Â¾ÂÃ¨Âµâ€“Ã¥Â¤â€“Ã©Æ’Â¨ coordinatorÃ¯Â¼â€°
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
    PostmortemClassifierService,
    BuiltinSkillCatalog,
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

    // PR-X18: Ã¥Â¯Â¼Ã¥â€¡Âº 8 Ã¤Â¸Âª engine Ã§Â«Â¯ token + Ã¥Â®Å¾Ã§Å½Â°Ã§Â±Â»Ã¯Â¼Ë†@GlobalÃ¯Â¼Å’Ã¨Â·Â¨Ã¦Â¨Â¡Ã¥Ââ€”Ã¥â€¦Â¨Ã¥Â±â‚¬Ã¥ÂÂ¯Ã¦Â³Â¨Ã¥â€¦Â¥Ã¯Â¼â€°
    PlanBasedAgentRegistry,
    AgentOrchestrator,
    AgentConfigService,
    CheckpointManager,
    ProcessSupervisorService,
    AGENT_REGISTRY_PORT,
    AGENT_ORCHESTRATOR_PORT,
    AGENT_CONFIG_SERVICE_PORT,
    CHAT_PROVIDER_PORT,
    CHECKPOINT_MANAGER_PORT,
    PROGRESS_TRACKER_PORT,
    TRACE_COLLECTOR_PORT,
    CONSTRAINT_ENFORCEMENT_PORT,
    EXECUTION_STATE_MANAGER_PORT,
    MCP_PROVIDER_PORT,

    // Ã¢Ëœâ€¦ SOTA runtime exports
    AgentTracer,
    ToolRegistry,
    ReActRunner,
    MissionOrchestrator,
    ModelPricingRegistry,
    JudgeService,
    FigureRelevanceService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬: figure Ã§â€ºÂ¸Ã¥â€¦Â³Ã¦â‚¬Â§
    CritiqueRefineService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬: critique-refine
    SectionSelfEvalService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬: section-level 4 Ã§Â»Â´Ã¨â€¡ÂªÃ¨Â¯â€ž
    ReportQualityGateService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬ v3: code-enforced Ã¨Â´Â¨Ã©â€¡ÂÃ©â€”Â¨Ã¦Å½Â§
    SectionRemediationService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬ v3: Ã¥Â¼Â±Ã§Â»Â´Ã¥ÂºÂ¦Ã¥ÂË†Ã¥Â¹Â¶Ã¨Â¡Â¥Ã¦â€¢â€˜
    ReportEvaluationService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬ v3: 10 Ã§Â»Â´Ã§Â»â€œÃ¦Å¾â€žÃ¥Å’â€“Ã¦Å Â¥Ã¥â€˜Å Ã¨Â¯â€žÃ¥Â®Â¡
    QualityTraceComputeService, // Ã¢Ëœâ€¦ Ã¦Â²â€°Ã¦Â·â‚¬ v3: Ã¥â€¦Â¨Ã©â€œÂ¾Ã¨Â·Â¯Ã¨Â´Â¨Ã©â€¡Â trace Ã§ÂºÂ¯Ã¨Â®Â¡Ã§Â®â€”
    SpanExporter,
    MCPRelay,
    MCPManager,
    MCPClientRegistryService,
    AgentRunner,
    FixtureStore,
    ToolCircuitBreaker,
    InMemoryVectorStore,

    // ai-harness/guardrails Ã¦Å½Â¢Ã©â€™Ë† tokenÃ¯Â¼Ë†Ã¥Â®Å¾Ã©â„¢â€¦Ã¦Å’â€¡Ã¥Ââ€˜Ã¤Â¸Å Ã©ÂÂ¢ useExistingÃ¯Â¼â€°
    SPEC_AGENT_REGISTRY_PROBE,
    TOOL_CIRCUIT_BREAKER_PROBE,

    // PR-S: Vector memory + indexing
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

    // Ã¢Ëœâ€¦ PR-X13: AIFacade + Domain Facades
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
    // Break the circular dependency: AgentFactory Ã¢â€ â€ SubagentSpawner.
    // Constructor injection requires both instances up-front; setter injection
    // lets NestJS finish provider instantiation, then we wire the cycle here.
    this.factory.setSubagentSpawner(this.spawner);
    // Same rationale for ModelElectionService Ã¢â‚¬â€ forwardRef-provided dep.
    // At onApplicationBootstrap the container is fully instantiated so Optional
    // inject here resolves cleanly without sibling-provider timing side effects.
    if (this.election) {
      this.factory.setElectionService(this.election);
    }

    // v2: Ã¦Å Å Ã¥â€ â€¦Ã§Â½Â® loops Ã¦Â³Â¨Ã¥â€ Å’Ã¥Ë†Â° LoopRegistryÃ£â‚¬â€š
    // AgentFactory.pickLoop(spec) Ã¦ÂÂ®Ã¦Â­Â¤Ã¦Å’â€° spec.loop Ã¥Â­â€”Ã¦Â®ÂµÃ¦Â´Â¾Ã¥Ââ€˜Ã£â‚¬â€š
    this.loopRegistry.register(this.reactLoop);
    this.loopRegistry.register(this.planActLoop);
    this.loopRegistry.register(this.reflexionLoop);
    // Ã¢Ëœâ€¦ Phase live-fix (2026-04-30): Ã¥Ââ€¢Ã¦Â­Â¥Ã§â€ºÂ´Ã§Â­â€ loopÃ¯Â¼Ë†Ã§ÂºÂ¯Ã§â€Å¸Ã¦Ë†Â / Ã¨Â¯â€žÃ¥Ë†â€ Ã§Â±Â» agent Ã§â€Â¨Ã¯Â¼â€°
    this.loopRegistry.register(this.simpleLoop);
    // PR-L: Ã¤Âºâ€Ã¥â€¦Æ’Ã§Å½Â¯ loop
    this.loopRegistry.register(this.leaderWorkerLoop);

    // PR-B: Ã§Â»â„¢ ReflexionLoop Ã¦Â³Â¨Ã¥â€¦Â¥Ã©Â»ËœÃ¨Â®Â¤ verifiersÃ¯Â¼Ë†self + criticalÃ¯Â¼â€°Ã£â‚¬â€š
    // PR-I Ã¥Â¿â€¦Ã¤Â¿Â® #3: Ã¦â€Â¹Ã§â€Â¨Ã¥Â®Å¾Ã¤Â¾â€¹Ã¦â€“Â¹Ã¦Â³â€¢Ã¯Â¼Ë†Ã¤Â¹â€¹Ã¥â€°ÂÃ¦ËœÂ¯ staticÃ¯Â¼Å’Ã¥Â½Â±Ã¥â€œÂÃ¦Âµâ€¹Ã¨Â¯â€¢Ã©Å¡â€Ã§Â¦Â»Ã¯Â¼â€°
    const defaults = this.judgeService.createVerifiers(["self", "critical"]);
    this.reflexionLoop.setDefaultVerifiers(defaults);

    // PR-K: Ã©Â»ËœÃ¨Â®Â¤Ã¦Å Å  LoggerBroadcastAdapter Ã¨Â£â€¦Ã¥Ë†Â° EventBusÃ¯Â¼Ë†Ã¤Â¸Å¡Ã¥Å Â¡Ã¦â€“Â¹Ã¥ÂÂ¯Ã¥ÂÅ½Ã§Â»Â­Ã¦Â³Â¨Ã¥â€ Å’Ã¦â€ºÂ´Ã¥Â¤Å¡Ã¯Â¼â€°
    this.eventBus.registerAdapter(this.defaultBroadcaster);
  }
}
