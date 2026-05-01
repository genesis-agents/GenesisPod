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

// Executors —— 2026-04-30 (C2-step2) 删除 4 个死代码 (BaseExecutor / DAGExecutor /
// SequentialExecutor / ParallelExecutor)；DAG 业务实际用 ai-harness/execution/dag/
// 165行轻量版替代。保留 FunctionCallingExecutor (1340行 teams/ai-response 真用)
import { FunctionCallingExecutor } from "./planning/executors/function-calling-executor";

// Orchestration Services —— 2026-04-30 (C2-step2) 删除 3 个真死代码:
//   - IterationManagerService (in-memory store 但 0 调用)
//   - IntelligentModelRouterService ("支柱四"未接入)
//   - ComplexityAnalyzerService (仅被 IntelligentModelRouter 用 → 绑死)
import { TaskDecomposerService } from "./planning/services/task-decomposer.service";
import { AgentExecutorService } from "./planning/services/agent-executor.service";
import { OutputReviewerService } from "./planning/services/output-reviewer.service";
import { CircuitBreakerService } from "./safety/resilience/circuit-breaker.service";
import { TokenBudgetService } from "./planning/services/token-budget.service";
import { ContextEvolutionService } from "./planning/services/context-evolution.service";
import { ContextInitializationService } from "./planning/services/context-initialization.service";
// PR-X18: ConstraintEnforcementService 通过 CONSTRAINT_ENFORCEMENT_PORT token 注入
import { ContextCompressionService } from "./planning/services/context-compression.service";
import { IntentDetectionService } from "./planning/services/intent-detection.service";
import { ReflectionService } from "./planning/services/reflection.service";
// IntentRouterService / TaskPlannerService 已删 (2026-04-30) — 死代码，前端 0 消费
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

// Handlers —— 2026-04-30 (C2-step2) 删除（仅被 BaseExecutor 用，BaseExecutor 死）

// Agents — PR-X18: 通过 AGENT_REGISTRY_PORT / AGENT_ORCHESTRATOR_PORT /
// AGENT_CONFIG_SERVICE_PORT token 注入；AgentsService 不再 re-export
import { AgentsService } from "../open-api/agents-api";

// 2026-04-30 (C2-step2): 删除 sequentialExecutorFactory / dagExecutorFactory /
// parallelExecutorFactory —— 这 3 个 factory 包装的 executor 已删（0 业务调用），
// DAG 业务实际用 ai-harness/execution/dag/ 165行轻量版替代。
// FunctionCallingExecutor 不需 factory（直接 NestJS 注入）。

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

    // Executors —— 仅保留 FunctionCallingExecutor (其他 4 个 + handlers 已删 C2-step2)
    FunctionCallingExecutor,

    // NOTE: harness 服务（ProgressTracker / TraceCollector / CheckpointManager
    // / CircuitBreaker / ConstraintEnforcement / ExecutionStateManager）come
    // from @Global() HarnessModule via DI tokens — engine 不直接 import

    // Engine Orchestration Services —— C2-step2 删除 IterationManager / ComplexityAnalyzer / IntelligentModelRouter
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService,
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

    // Executors
    FunctionCallingExecutor,

    // Engine Services
    TaskDecomposerService,
    AgentExecutorService,
    OutputReviewerService,
    CircuitBreakerService,
    TokenBudgetService,
    ContextEvolutionService,
    ContextInitializationService,
    ContextCompressionService,
    IntentDetectionService,
    ReflectionService,
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
