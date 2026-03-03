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
import { CheckpointManager } from "../ai-kernel/facade";

// Orchestration Services
import { TaskDecomposerService } from "./orchestration/services/task-decomposer.service";
import { AgentExecutorService } from "./orchestration/services/agent-executor.service";
import { OutputReviewerService } from "./orchestration/services/output-reviewer.service";
import { IterationManagerService } from "./orchestration/services/iteration-manager.service";
import { CircuitBreakerService } from "../ai-kernel/facade";
import { TokenBudgetService } from "./orchestration/services/token-budget.service";
import { ContextEvolutionService } from "./orchestration/services/context-evolution.service";
import { ContextInitializationService } from "./orchestration/services/context-initialization.service";
import { ConstraintEnforcementService } from "../ai-kernel/facade";
import { ContextCompressionService } from "./orchestration/services/context-compression.service";
import { IntentDetectionService } from "./orchestration/services/intent-detection.service";
import { ReflectionService } from "./orchestration/services/reflection.service";
import { ComplexityAnalyzerService } from "./orchestration/services/complexity-analyzer.service";
import { IntelligentModelRouterService } from "./orchestration/services/intelligent-model-router.service";
import { TaskPlannerService } from "./orchestration/services/task-planner.service";
import { IntentRouterService } from "./orchestration/services/intent-router.service";

// State Machine
import { ProcessSupervisorService as ExecutionStateManager } from "../ai-kernel/facade";

// Agents (needed for executors)
import { AgentOrchestrator } from "./agents/registry";
import { AgentsController, AgentsService } from "./agents/api";
import { AgentConfigService } from "./agents/config/agent-config.service";

/**
 * Sequential Executor Factory
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
 * DAG Executor Factory
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
 * Parallel Executor Factory
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

    // Executors
    sequentialExecutorFactory,
    dagExecutorFactory,
    parallelExecutorFactory,
    FunctionCallingExecutor,

    // Checkpoint
    checkpointManagerFactory,

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

    // State Machine
    ExecutionStateManager,
  ],
  exports: [
    // Agents
    AgentRegistry,
    AgentOrchestrator,
    AgentsService,
    AgentConfigService,

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
  ],
})
export class AiEngineOrchestrationModule {}
