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
import { AgentRegistry } from "./agents/registry";

// Executors
import { SequentialExecutor } from "./orchestration/executors/sequential-executor";
import { DAGExecutor } from "./orchestration/executors/dag-executor";
import { ParallelExecutor } from "./orchestration/executors/parallel-executor";
import { FunctionCallingExecutor } from "./orchestration/executors/function-calling-executor";

// Checkpoints
import { CheckpointManager } from "../ai-engine/facade";

// ★ Kernel services for executor integration
import { ProgressTrackerService } from "../ai-engine/facade";
import { TraceCollectorService } from "@/modules/ai-engine/runtime/observability/trace-collector.service";

// Orchestration Services
import { TaskDecomposerService } from "./orchestration/services/task-decomposer.service";
import { AgentExecutorService } from "./orchestration/services/agent-executor.service";
import { OutputReviewerService } from "./orchestration/services/output-reviewer.service";
import { IterationManagerService } from "./orchestration/services/iteration-manager.service";
import { CircuitBreakerService } from "../ai-engine/facade";
import { TokenBudgetService } from "./orchestration/services/token-budget.service";
import { ContextEvolutionService } from "./orchestration/services/context-evolution.service";
import { ContextInitializationService } from "./orchestration/services/context-initialization.service";
import { ConstraintEnforcementService } from "../ai-engine/facade";
import { ContextCompressionService } from "./orchestration/services/context-compression.service";
import { IntentDetectionService } from "./orchestration/services/intent-detection.service";
import { ReflectionService } from "./orchestration/services/reflection.service";
import { ComplexityAnalyzerService } from "./orchestration/services/complexity-analyzer.service";
import { IntelligentModelRouterService } from "./orchestration/services/intelligent-model-router.service";
import { TaskPlannerService } from "./orchestration/services/task-planner.service";
import { IntentRouterService } from "./orchestration/services/intent-router.service";
// ★ Phase 1-4: 基础设施升级新增服务
import { QueryLoopService } from "./orchestration/services/query-loop.service";
import { TokenTrackerService } from "./orchestration/services/token-tracker.service";
import { ContextCompactionPipelineService } from "./orchestration/services/context-compaction-pipeline.service";
import { ExecutionCheckpointService } from "./orchestration/services/execution-checkpoint.service";
import { AdaptiveReplannerService } from "./orchestration/services/adaptive-replanner.service";
import { CrossCuttingSynthesisService } from "./orchestration/services/cross-cutting-synthesis.service";
// ★ Phase 7: 会话记忆旁路
import { SessionMemorySidecarService } from "./orchestration/services/session-memory-sidecar.service";
// ★ Phase 9: 后台自主 Agent
import { AutoDreamService } from "./orchestration/services/auto-dream.service";
import { AutoDreamSchedulerService } from "./orchestration/services/auto-dream-scheduler.service";

// State Machine
import { ProcessSupervisorService as ExecutionStateManager } from "../ai-engine/facade";

// Handlers
import { WorkflowHandlerRegistry } from "./orchestration/handlers/handler-registry";

// Agents (needed for executors)
import { AgentOrchestrator } from "./agents/registry";
import { AgentsController, AgentsService } from "./agents/api";
import { AgentConfigService } from "./agents/config/agent-config.service";

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
  controllers: [AgentsController],
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
export class AiEngineOrchestrationModule {}
