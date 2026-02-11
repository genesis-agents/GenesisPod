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
import { FunctionCallingLLMAdapter } from "../llm/adapters/function-calling-llm-adapter";
import { CircuitBreakerService } from "../orchestration/services/circuit-breaker.service";
import { AgentExecutorService } from "../orchestration/services/agent-executor.service";
import { SkillLoaderService } from "../skills/loader/skill-loader.service";
import { SkillPromptBuilder } from "../skills/builder/skill-prompt-builder.service";
// ★ P2 能力下沉：Realtime Feature 依赖
import { EngineEventEmitterService } from "../realtime/services/engine-event-emitter.service";
import { ProgressTrackerService } from "../realtime/services/progress-tracker.service";
// ★ Constraint Feature 依赖
import { RateLimiter } from "../constraint/guardrails/rate-limiter";
import { CostController } from "../constraint/guardrails/cost-controller";

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
  llmAdapter?: FunctionCallingLLMAdapter; // ★ Facade 封装 chatWithToolsStream
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
// ★ P2 能力下沉：Realtime Feature Interface
// ============================================================================

/**
 * 实时推送特性
 */
export interface RealtimeFeature {
  eventEmitter: EngineEventEmitterService;
  progressTracker: ProgressTrackerService;
}

// ============================================================================
// Constraint Feature Interface
// ============================================================================

/**
 * 约束控制特性
 */
export interface ConstraintFeature {
  rateLimiter: RateLimiter;
  costController: CostController;
}

// ============================================================================
// Injection Tokens
// ============================================================================

export const MEMORY_FEATURE = "MEMORY_FEATURE";
export const TOOL_FEATURE = "TOOL_FEATURE";
export const ORCHESTRATION_FEATURE = "ORCHESTRATION_FEATURE";
export const SKILL_FEATURE = "SKILL_FEATURE";
// ★ P2 能力下沉：Realtime Injection Token
export const REALTIME_FEATURE = "REALTIME_FEATURE";
export const CONSTRAINT_FEATURE = "CONSTRAINT_FEATURE";

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
    llmAdapter?: FunctionCallingLLMAdapter,
  ): ToolFeature | undefined => {
    if (!registry) return undefined;
    return { registry, executor, llmAdapter };
  },
  inject: [
    { token: ToolRegistry, optional: true },
    { token: FunctionCallingExecutor, optional: true },
    { token: FunctionCallingLLMAdapter, optional: true },
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
// ★ P2 能力下沉：Realtime Feature Provider
// ============================================================================

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
// Constraint Feature Provider
// ============================================================================

/**
 * Constraint Feature Provider
 * 聚合速率限制器和成本控制器
 */
export const constraintFeatureProvider: Provider = {
  provide: CONSTRAINT_FEATURE,
  useFactory: (
    rateLimiter?: RateLimiter,
    costController?: CostController,
  ): ConstraintFeature | undefined => {
    if (!rateLimiter || !costController) return undefined;
    return { rateLimiter, costController };
  },
  inject: [
    { token: RateLimiter, optional: true },
    { token: CostController, optional: true },
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
  // ★ P2 能力下沉：Realtime Provider
  realtimeFeatureProvider,
  constraintFeatureProvider,
];
