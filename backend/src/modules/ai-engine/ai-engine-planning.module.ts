/**
 * AI Engine Orchestration Module
 * 编排引擎子模块
 *
 * 提供:
 * - Executors (Sequential, DAG, Parallel, FunctionCalling)
 * - Checkpoint Manager
 * - Orchestration Services (12+ services)
 * - State Machine
 */

import { Module, forwardRef } from "@nestjs/common";

// Registries (from other modules)
import { AiEngineToolsModule } from "./ai-engine-tools.module";
import { AiEngineSkillsModule } from "./ai-engine-skills.module";
import { AiEngineConstraintModule } from "./ai-engine-constraint.module";
import { ToolRegistry } from "./tools/registry/tool-registry";
import { SkillRegistry } from "./skills/registry/skill-registry";

// Executors
import { SequentialExecutor } from "./planning/executors/sequential-executor";
import { DAGExecutor } from "./planning/executors/dag-executor";
import { ParallelExecutor } from "./planning/executors/parallel-executor";
import { FunctionCallingExecutor } from "./planning/executors/function-calling-executor";

// PR-X18: Engine 端 DI tokens (避免反向 import ai-harness)
// harness 的 AgentRegistry / CheckpointManager / ProgressTracker / TraceCollector /
// ConstraintEnforcement / ProcessSupervisor / AgentOrchestrator / AgentConfig 等
// 通过 @Global HarnessModule 用 useExisting 绑到这些 token，engine 通过 token 注入
import {
  AGENT_REGISTRY_PORT,
  CHECKPOINT_MANAGER_PORT,
  PROGRESS_TRACKER_PORT,
  TRACE_COLLECTOR_PORT,
  type IAgentRegistryPort,
  type ICheckpointManagerPort,
  type IProgressTrackerPort,
  type ITraceCollectorPort,
} from "./abstractions/runtime-deps.tokens";

// Orchestration Services
import { TaskDecomposerService } from "./planning/services/task-decomposer.service";
import { AgentExecutorService } from "./planning/services/agent-executor.service";
import { OutputReviewerService } from "./planning/services/output-reviewer.service";
import { IterationManagerService } from "./planning/services/iteration-manager.service";
import { CircuitBreakerService } from "./safety/resilience/circuit-breaker.service";
import { TokenBudgetService } from "./planning/services/token-budget.service";
import { ContextEvolutionService } from "./planning/services/context-evolution.service";
import { ContextInitializationService } from "./planning/services/context-initialization.service";
// PR-X18: ConstraintEnforcementService 通过 CONSTRAINT_ENFORCEMENT_PORT token 注入
import { ContextCompressionService } from "./planning/services/context-compression.service";
import { IntentDetectionService } from "./planning/services/intent-detection.service";
import { ReflectionService } from "./planning/services/reflection.service";
import { ComplexityAnalyzerService } from "./planning/services/complexity-analyzer.service";
import { IntelligentModelRouterService } from "./planning/services/intelligent-model-router.service";
import { TaskPlannerService } from "./planning/services/task-planner.service";
import { IntentRouterService } from "./planning/services/intent-router.service";
// ★ Phase 1-4: 基础设施升级新增服务
import { QueryLoopService } from "./planning/services/query-loop.service";
import { TokenTrackerService } from "./planning/services/token-tracker.service";
import { ContextCompactionPipelineService } from "./planning/services/context-compaction-pipeline.service";
import { ExecutionCheckpointService } from "./planning/services/execution-checkpoint.service";
import { AdaptiveReplannerService } from "./planning/services/adaptive-replanner.service";
import { CrossCuttingSynthesisService } from "./planning/services/cross-cutting-synthesis.service";
// ★ Phase 7: 会话记忆旁路
import { SessionMemorySidecarService } from "./planning/services/session-memory-sidecar.service";
// ★ Phase 9 → 已搬到 ai-harness/memory/dream/（C2-step1，2026-04-30）
//   AutoDreamService / AutoDreamSchedulerService 不再由 engine 注册

// State Machine — PR-X18: 通过 EXECUTION_STATE_MANAGER_PORT token 注入

// Handlers
import { WorkflowHandlerRegistry } from "./planning/handlers/handler-registry";

// Agents — PR-X18: 通过 AGENT_REGISTRY_PORT / AGENT_ORCHESTRATOR_PORT /
// AGENT_CONFIG_SERVICE_PORT token 注入；AgentsService 不再 re-export
import { AgentsService } from "../open-api/agents-api";

/**
 * Sequential Executor Factory（PR-X18: AgentRegistry 通过 token 注入）
 */
const sequentialExecutorFactory = {
  provide: SequentialExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: IAgentRegistryPort,
    handlerRegistry: WorkflowHandlerRegistry,
    circuitBreaker: CircuitBreakerService,
  ) => {
    const executor = new SequentialExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry as never);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCircuitBreaker(circuitBreaker);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AGENT_REGISTRY_PORT,
    WorkflowHandlerRegistry,
    CircuitBreakerService,
  ],
};

/**
 * DAG Executor Factory（PR-X18: harness 服务通过 tokens 注入）
 */
const dagExecutorFactory = {
  provide: DAGExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: IAgentRegistryPort,
    handlerRegistry: WorkflowHandlerRegistry,
    checkpointManager: ICheckpointManagerPort,
    circuitBreaker: CircuitBreakerService,
    progressTracker: IProgressTrackerPort,
    traceCollector: ITraceCollectorPort,
  ) => {
    const executor = new DAGExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry as never);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCheckpointManager(checkpointManager as never);
    executor.setCircuitBreaker(circuitBreaker);
    executor.setProgressTracker(progressTracker as never);
    executor.setTraceCollector(traceCollector as never);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AGENT_REGISTRY_PORT,
    WorkflowHandlerRegistry,
    CHECKPOINT_MANAGER_PORT,
    CircuitBreakerService,
    PROGRESS_TRACKER_PORT,
    TRACE_COLLECTOR_PORT,
  ],
};

/**
 * Parallel Executor Factory（PR-X18: AgentRegistry 通过 token 注入）
 */
const parallelExecutorFactory = {
  provide: ParallelExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: IAgentRegistryPort,
    handlerRegistry: WorkflowHandlerRegistry,
    circuitBreaker: CircuitBreakerService,
  ) => {
    const executor = new ParallelExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry as never);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCircuitBreaker(circuitBreaker);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AGENT_REGISTRY_PORT,
    WorkflowHandlerRegistry,
    CircuitBreakerService,
  ],
};

// CheckpointManager Factory removed — PR-X18: harness HarnessModule 提供
// CHECKPOINT_MANAGER_PORT 绑定，engine 通过 token 注入

@Module({
  imports: [
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineSkillsModule),
    forwardRef(() => AiEngineConstraintModule),
  ],
  controllers: [],
  providers: [
    // PR-X18: AgentRegistry / AgentOrchestrator / AgentConfigService /
    // CheckpointManager / ConstraintEnforcementService / ExecutionStateManager
    // 由 @Global HarnessModule 提供（绑到 *_PORT tokens），engine 不再注册
    AgentsService,

    // Handlers
    WorkflowHandlerRegistry,

    // Executors
    sequentialExecutorFactory,
    dagExecutorFactory,
    parallelExecutorFactory,
    FunctionCallingExecutor,

    // NOTE: harness 服务（ProgressTracker / TraceCollector / CheckpointManager
    // / CircuitBreaker / ConstraintEnforcement / ExecutionStateManager）come
    // from @Global() HarnessModule via DI tokens — engine 不直接 import

    // Engine Orchestration Services
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    IterationManagerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService,
    ComplexityAnalyzerService,
    IntelligentModelRouterService,
    TaskPlannerService,
    IntentRouterService,
    // ★ Phase 1-4: 基础设施升级
    QueryLoopService,
    TokenTrackerService,
    ContextCompactionPipelineService,
    ExecutionCheckpointService,
    AdaptiveReplannerService,
    // ★ Phase 10: Coordinator Synthesize-Before-Delegate
    CrossCuttingSynthesisService,
    // ★ Phase 7: Session Memory Sidecar
    SessionMemorySidecarService,
  ],
  exports: [
    // PR-X18: AgentRegistry / AgentOrchestrator / AgentConfigService /
    // CheckpointManager / ConstraintEnforcementService / ExecutionStateManager
    // 由 HarnessModule (@Global) 导出，engine 不再 re-export
    AgentsService,

    // Handlers
    WorkflowHandlerRegistry,

    // Executors
    SequentialExecutor,
    DAGExecutor,
    ParallelExecutor,
    FunctionCallingExecutor,

    // Engine Services
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    IterationManagerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService,
    ComplexityAnalyzerService,
    IntelligentModelRouterService,
    TaskPlannerService,
    IntentRouterService,
    // ★ Phase 1-4: 基础设施升级
    QueryLoopService,
    TokenTrackerService,
    ContextCompactionPipelineService,
    ExecutionCheckpointService,
    AdaptiveReplannerService,
    // ★ Phase 10: Coordinator Synthesize-Before-Delegate
    CrossCuttingSynthesisService,
    // ★ Phase 7: Session Memory Sidecar
    SessionMemorySidecarService,
  ],
})
export class AiEnginePlanningModule {}
