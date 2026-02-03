/**
 * AI Engine Facade Providers
 * Facade 依赖注入配置
 *
 * 将多个服务分组为 Feature 模块，简化 Facade 的构造函数
 */

import { Provider } from "@nestjs/common";
import { ShortTermMemoryService } from "../memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "../memory/stores/long-term-memory.service";
import { ToolRegistry } from "../tools/registry/tool-registry";
import { FunctionCallingExecutor } from "../orchestration/executors/function-calling-executor";
import { CircuitBreakerService } from "../orchestration/services/circuit-breaker.service";
import { AgentExecutorService } from "../orchestration/services/agent-executor.service";
import { SkillLoaderService } from "../skills/loader/skill-loader.service";
import { SkillPromptBuilder } from "../skills/builder/skill-prompt-builder.service";
// ★ P2 能力下沉：新增 Feature 依赖
import { DataSourceRouterService } from "../data/services/data-source-router.service";
import { DataEnrichmentService } from "../data/services/data-enrichment.service";
import { EvidenceManagerService } from "../evidence/services/evidence-manager.service";
import { QualityGateService } from "../quality/services/quality-gate.service";
import { ReviewWorkflowService } from "../collaboration/review/review-workflow.service";
import { TodoService } from "../collaboration/todo/todo.service";
import { EngineEventEmitterService } from "../realtime/services/engine-event-emitter.service";
import { ProgressTrackerService } from "../realtime/services/progress-tracker.service";

// ============================================================================
// Feature Interfaces (re-export from facade)
// ============================================================================

/**
 * 记忆能力特性
 */
export interface MemoryFeature {
  shortTerm: ShortTermMemoryService;
  longTerm: LongTermMemoryService;
}

/**
 * 工具执行特性
 */
export interface ToolFeature {
  registry: ToolRegistry;
  executor?: FunctionCallingExecutor; // ★ 设为可选，避免运行时错误
}

/**
 * 编排能力特性
 */
export interface OrchestrationFeature {
  circuitBreaker: CircuitBreakerService;
  agentExecutor: AgentExecutorService;
}

/**
 * 技能特性
 */
export interface SkillFeature {
  loader: SkillLoaderService;
  promptBuilder: SkillPromptBuilder;
}

// ============================================================================
// ★ P2 能力下沉：新增 Feature Interfaces
// ============================================================================

/**
 * 数据获取与富化特性
 */
export interface DataFeature {
  router: DataSourceRouterService;
  enrichment: DataEnrichmentService;
}

/**
 * 证据管理特性
 */
export interface EvidenceFeature {
  manager: EvidenceManagerService;
}

/**
 * 质量门控特性
 */
export interface QualityFeature {
  gate: QualityGateService;
}

/**
 * 审查与待办特性
 */
export interface ReviewFeature {
  workflow: ReviewWorkflowService;
  todo: TodoService;
}

/**
 * 实时推送特性
 */
export interface RealtimeFeature {
  eventEmitter: EngineEventEmitterService;
  progressTracker: ProgressTrackerService;
}

// ============================================================================
// Injection Tokens
// ============================================================================

export const MEMORY_FEATURE = "MEMORY_FEATURE";
export const TOOL_FEATURE = "TOOL_FEATURE";
export const ORCHESTRATION_FEATURE = "ORCHESTRATION_FEATURE";
export const SKILL_FEATURE = "SKILL_FEATURE";
// ★ P2 能力下沉：新增 Injection Tokens
export const DATA_FEATURE = "DATA_FEATURE";
export const EVIDENCE_FEATURE = "EVIDENCE_FEATURE";
export const QUALITY_FEATURE = "QUALITY_FEATURE";
export const REVIEW_FEATURE = "REVIEW_FEATURE";
export const REALTIME_FEATURE = "REALTIME_FEATURE";

// ============================================================================
// Factory Providers
// ============================================================================

/**
 * Memory Feature Provider
 * 聚合短期和长期记忆服务
 */
export const memoryFeatureProvider: Provider = {
  provide: MEMORY_FEATURE,
  useFactory: (
    shortTerm?: ShortTermMemoryService,
    longTerm?: LongTermMemoryService,
  ): MemoryFeature | undefined => {
    if (!shortTerm || !longTerm) return undefined;
    return { shortTerm, longTerm };
  },
  inject: [
    { token: ShortTermMemoryService, optional: true },
    { token: LongTermMemoryService, optional: true },
  ],
};

/**
 * Tool Feature Provider
 * 聚合工具注册表和执行器
 */
export const toolFeatureProvider: Provider = {
  provide: TOOL_FEATURE,
  useFactory: (
    registry?: ToolRegistry,
    executor?: FunctionCallingExecutor,
  ): ToolFeature | undefined => {
    if (!registry) return undefined;
    return { registry, executor }; // ★ 移除非空断言，executor 可能为 undefined
  },
  inject: [
    { token: ToolRegistry, optional: true },
    { token: FunctionCallingExecutor, optional: true },
  ],
};

/**
 * Orchestration Feature Provider
 * 聚合熔断器和 Agent 执行器
 */
export const orchestrationFeatureProvider: Provider = {
  provide: ORCHESTRATION_FEATURE,
  useFactory: (
    circuitBreaker?: CircuitBreakerService,
    agentExecutor?: AgentExecutorService,
  ): OrchestrationFeature | undefined => {
    if (!circuitBreaker || !agentExecutor) return undefined;
    return { circuitBreaker, agentExecutor };
  },
  inject: [
    { token: CircuitBreakerService, optional: true },
    { token: AgentExecutorService, optional: true },
  ],
};

/**
 * Skill Feature Provider
 * 聚合技能加载器和提示词构建器
 */
export const skillFeatureProvider: Provider = {
  provide: SKILL_FEATURE,
  useFactory: (
    loader?: SkillLoaderService,
    promptBuilder?: SkillPromptBuilder,
  ): SkillFeature | undefined => {
    if (!loader || !promptBuilder) return undefined;
    return { loader, promptBuilder };
  },
  inject: [
    { token: SkillLoaderService, optional: true },
    { token: SkillPromptBuilder, optional: true },
  ],
};

// ============================================================================
// ★ P2 能力下沉：新增 Feature Providers
// ============================================================================

/**
 * Data Feature Provider
 * 聚合数据源路由和富化服务
 */
export const dataFeatureProvider: Provider = {
  provide: DATA_FEATURE,
  useFactory: (
    router?: DataSourceRouterService,
    enrichment?: DataEnrichmentService,
  ): DataFeature | undefined => {
    if (!router || !enrichment) return undefined;
    return { router, enrichment };
  },
  inject: [
    { token: DataSourceRouterService, optional: true },
    { token: DataEnrichmentService, optional: true },
  ],
};

/**
 * Evidence Feature Provider
 * 聚合证据管理服务
 */
export const evidenceFeatureProvider: Provider = {
  provide: EVIDENCE_FEATURE,
  useFactory: (
    manager?: EvidenceManagerService,
  ): EvidenceFeature | undefined => {
    if (!manager) return undefined;
    return { manager };
  },
  inject: [{ token: EvidenceManagerService, optional: true }],
};

/**
 * Quality Feature Provider
 * 聚合质量门控服务
 */
export const qualityFeatureProvider: Provider = {
  provide: QUALITY_FEATURE,
  useFactory: (gate?: QualityGateService): QualityFeature | undefined => {
    if (!gate) return undefined;
    return { gate };
  },
  inject: [{ token: QualityGateService, optional: true }],
};

/**
 * Review Feature Provider
 * 聚合审查工作流和待办服务
 */
export const reviewFeatureProvider: Provider = {
  provide: REVIEW_FEATURE,
  useFactory: (
    workflow?: ReviewWorkflowService,
    todo?: TodoService,
  ): ReviewFeature | undefined => {
    if (!workflow || !todo) return undefined;
    return { workflow, todo };
  },
  inject: [
    { token: ReviewWorkflowService, optional: true },
    { token: TodoService, optional: true },
  ],
};

/**
 * Realtime Feature Provider
 * 聚合事件发射和进度追踪服务
 */
export const realtimeFeatureProvider: Provider = {
  provide: REALTIME_FEATURE,
  useFactory: (
    eventEmitter?: EngineEventEmitterService,
    progressTracker?: ProgressTrackerService,
  ): RealtimeFeature | undefined => {
    if (!eventEmitter || !progressTracker) return undefined;
    return { eventEmitter, progressTracker };
  },
  inject: [
    { token: EngineEventEmitterService, optional: true },
    { token: ProgressTrackerService, optional: true },
  ],
};

// ============================================================================
// All Feature Providers
// ============================================================================

export const FACADE_FEATURE_PROVIDERS: Provider[] = [
  memoryFeatureProvider,
  toolFeatureProvider,
  orchestrationFeatureProvider,
  skillFeatureProvider,
  // ★ P2 能力下沉：新增 Providers
  dataFeatureProvider,
  evidenceFeatureProvider,
  qualityFeatureProvider,
  reviewFeatureProvider,
  realtimeFeatureProvider,
];
