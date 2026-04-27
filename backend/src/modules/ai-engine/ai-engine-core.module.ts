/**
 * AI Engine Core Module (Lightweight)
 *
 * 轻量级 AI Engine 入口，仅包含核心 LLM 能力和 Facade。
 * 不加载 Teams / Collaboration / Image / LongContent 等重型子模块。
 *
 * 使用场景：
 * - MCP Server 等外部网关只需 chat() + structured output
 * - 新的微服务只需 LLM 调用能力
 * - 测试环境快速启动
 *
 * 对比 AiEngineModule（完整版 16 个子模块），此模块仅加载：
 * - AiEngineLLMModule (LLM 适配 + 模型配置)
 * - AiEngineConstraintModule (速率限制 + 成本控制)
 * - AIEngineFacade (统一入口)
 * - Observability (追踪 + 指标)
 * - Prompt Registry (提示词版本管理)
 *
 * 注意：此模块不标记 @Global()，需要显式导入。
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { SecretsModule } from "../ai-infra/secrets/secrets.module";

// 子模块（仅核心）
import { AiEngineLLMModule } from "./ai-engine-llm.module";
import { AiEngineConstraintModule } from "./ai-engine-constraint.module";

// Facade
import { AIEngineFacade } from "./facade";
import { FACADE_FEATURE_PROVIDERS } from "./facade/facade.providers";

// Prompt Registry
import { PromptRegistryService } from "./llm/prompts/prompt-registry.service";

// Capabilities
import { AICapabilityResolver } from "./orchestration/capabilities/ai-capability-resolver.service";

// Observability core 由 ai-harness/ObservabilityModule (@Global) 提供 —
// 由 app.module.ts 统一装配，本轻量模块不直接依赖 ai-harness，
// 但消费者仍可注入 AiEngineTracingService / SessionLatencyTrackerService 等
// （得益于 @Global 提供器的全局可见性）。

@Module({
  imports: [
    PrismaModule,
    SecretsModule,
    AiEngineLLMModule,
    AiEngineConstraintModule,
  ],
  providers: [
    ...FACADE_FEATURE_PROVIDERS,
    AIEngineFacade,
    AICapabilityResolver,
    PromptRegistryService,
  ],
  exports: [
    AiEngineLLMModule,
    AiEngineConstraintModule,
    AIEngineFacade,
    AICapabilityResolver,
    PromptRegistryService,
  ],
})
export class AiEngineCoreModule {}
