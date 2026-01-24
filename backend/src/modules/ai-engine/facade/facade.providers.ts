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
  executor: FunctionCallingExecutor;
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
// Injection Tokens
// ============================================================================

export const MEMORY_FEATURE = "MEMORY_FEATURE";
export const TOOL_FEATURE = "TOOL_FEATURE";
export const ORCHESTRATION_FEATURE = "ORCHESTRATION_FEATURE";
export const SKILL_FEATURE = "SKILL_FEATURE";

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
    return { registry, executor: executor! };
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
// All Feature Providers
// ============================================================================

export const FACADE_FEATURE_PROVIDERS: Provider[] = [
  memoryFeatureProvider,
  toolFeatureProvider,
  orchestrationFeatureProvider,
  skillFeatureProvider,
];
