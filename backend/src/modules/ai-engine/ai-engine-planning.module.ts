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
import { AgentRegistry } from "../ai-harness/kernel/registry/legacy-agent-registry";

// Executors
import { SequentialExecutor } from "./planning/executors/sequential-executor";
import { DAGExecutor } from "./planning/executors/dag-executor";
import { ParallelExecutor } from "./planning/executors/parallel-executor";
import { FunctionCallingExecutor } from "./planning/executors/function-calling-executor";

// Checkpoints
import { CheckpointManager } from "../ai-harness/protocol/journal/checkpoint-manager";

// ★ Kernel services for executor integration
import { ProgressTrackerService } from "../ai-harness/protocol/ipc/progress-tracker.service";
import { TraceCollectorService } from "@/modules/ai-harness/governance/observability/trace-collector.service";

// Orchestration Services
import { TaskDecomposerService } from "./planning/services/task-decomposer.service";
import { AgentExecutorService } from "./planning/services/agent-executor.service";
import { OutputReviewerService } from "./planning/services/output-reviewer.service";
import { IterationManagerService } from "./planning/services/iteration-manager.service";
import { CircuitBreakerService } from "./safety/resilience/circuit-breaker.service";
import { TokenBudgetService } from "./planning/services/token-budget.service";
import { ContextEvolutionService } from "./planning/services/context-evolution.service";
import { ContextInitializationService } from "./planning/services/context-initialization.service";
import { ConstraintEnforcementService } from "../ai-harness/governance/resource/constraint-enforcement.service";
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
// ★ Phase 9: 后台自主 Agent
import { AutoDreamService } from "./planning/services/auto-dream.service";
import { AutoDreamSchedulerService } from "./planning/services/auto-dream-scheduler.service";

// State Machine
import { ProcessSupervisorService as ExecutionStateManager } from "../ai-harness/process/supervisor/process-supervisor.service";

// Handlers
import { WorkflowHandlerRegistry } from "./planning/handlers/handler-registry";

// Agents (needed for executors)
import { AgentOrchestrator } from "../ai-harness/kernel/registry/agent-orchestrator";
import { AgentsService } from "../open-api/agents-api";
import { AgentConfigService } from "../ai-harness/kernel/config/agent-config.service";

/**
 * Sequential Executor Factory
 * ★ 也注入 CircuitBreaker（BaseExecutor 通用能力）
 */
const sequentialExecutorFactory = {
  provide: SequentialExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
    handlerRegistry: WorkflowHandlerRegistry,
    circuitBreaker: CircuitBreakerService,
  ) => {
    const executor = new SequentialExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCircuitBreaker(circuitBreaker);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AgentRegistry,
    WorkflowHandlerRegistry,
    CircuitBreakerService,
  ],
};

/**
 * DAG Executor Factory
 * ★ 注入 Kernel 服务：ProgressTracker, CheckpointManager, CircuitBreaker, TraceCollector
 */
const dagExecutorFactory = {
  provide: DAGExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
    handlerRegistry: WorkflowHandlerRegistry,
    checkpointManager: CheckpointManager,
    circuitBreaker: CircuitBreakerService,
    progressTracker: ProgressTrackerService,
    traceCollector: TraceCollectorService,
  ) => {
    const executor = new DAGExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCheckpointManager(checkpointManager);
    executor.setCircuitBreaker(circuitBreaker);
    executor.setProgressTracker(progressTracker);
    executor.setTraceCollector(traceCollector);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AgentRegistry,
    WorkflowHandlerRegistry,
    CheckpointManager,
    CircuitBreakerService,
    ProgressTrackerService,
    TraceCollectorService,
  ],
};

/**
 * Parallel Executor Factory
 * ★ 也注入 CircuitBreaker（BaseExecutor 通用能力）
 */
const parallelExecutorFactory = {
  provide: ParallelExecutor,
  useFactory: (
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    agentRegistry: AgentRegistry,
    handlerRegistry: WorkflowHandlerRegistry,
    circuitBreaker: CircuitBreakerService,
  ) => {
    const executor = new ParallelExecutor();
    executor.setRegistries(toolRegistry, skillRegistry, agentRegistry);
    executor.setHandlerRegistry(handlerRegistry);
    executor.setCircuitBreaker(circuitBreaker);
    return executor;
  },
  inject: [
    ToolRegistry,
    SkillRegistry,
    AgentRegistry,
    WorkflowHandlerRegistry,
    CircuitBreakerService,
  ],
};

/**
 * Checkpoint Manager Factory
 */
const checkpointManagerFactory = {
  provide: CheckpointManager,
  useFactory: () => {
    return new CheckpointManager();
  },
};

@Module({
  imports: [
    forwardRef(() => AiEngineToolsModule),
    forwardRef(() => AiEngineSkillsModule),
    forwardRef(() => AiEngineConstraintModule),
  ],
  controllers: [],
  providers: [
    // Agents (needed for executors)
    AgentRegistry,
    AgentOrchestrator,
    AgentsService,
    AgentConfigService,

    // Handlers
    WorkflowHandlerRegistry,

    // Executors
    sequentialExecutorFactory,
    dagExecutorFactory,
    parallelExecutorFactory,
    FunctionCallingExecutor,

    // Checkpoint
    checkpointManagerFactory,

    // NOTE: ProgressTrackerService, TraceCollectorService, CheckpointManager,
    // CircuitBreakerService come from @Global() AiKernelModule — no need to re-declare

    // Orchestration Services
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
    // ★ Phase 9: Background Autonomous Agents
    AutoDreamService,
    AutoDreamSchedulerService,

    // State Machine
    ExecutionStateManager,
  ],
  exports: [
    // Agents
    AgentRegistry,
    AgentOrchestrator,
    AgentsService,
    AgentConfigService,

    // Handlers
    WorkflowHandlerRegistry,

    // Executors
    SequentialExecutor,
    DAGExecutor,
    ParallelExecutor,
    FunctionCallingExecutor,
    CheckpointManager,

    // Services
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
    ReflectionService,
    ComplexityAnalyzerService,
    IntelligentModelRouterService,
    TaskPlannerService,
    IntentRouterService,
    ExecutionStateManager,
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
    // ★ Phase 9: Background Autonomous Agents
    AutoDreamService,
    AutoDreamSchedulerService,
  ],
})
export class AiEnginePlanningModule {}
