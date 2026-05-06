/**
 * AI Engine LLM Module
 * LLM 适配层子模块
 *
 * 提供:
 * - AI Chat Service
 * - Task Profile Mapper
 * - Model Fallback
 * - LLM Factory & Adapters
 */

import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";
import { UserApiKeysModule } from "../../ai-infra/credentials/user-api-keys/user-api-keys.module";
import { KeyResolverModule } from "../../ai-infra/credentials/key-resolver/key-resolver.module";
import { KeyExecutorModule } from "../../ai-infra/credentials/executor/key-executor.module";
import { UserModelConfigsModule } from "../../ai-infra/credentials/user-model-configs/user-model-configs.module";
import { AiEngineConstraintModule } from "../safety/constraint.module";
import { AiEnginePlanningModule } from "../planning/planning.module";
import * as http from "http";
import * as https from "https";

// LLM Core
import { LLMFactory } from "./factory/llm.factory";
import { FunctionCallingLLMAdapter } from "./adapters/function-calling-llm.adapter";
import { AiChatLLMAdapter } from "./adapters/ai-chat-llm.adapter";
import { UniversalLLMAdapter } from "./adapters/universal-llm.adapter";
import { TaskProfileMapperService } from "./services/task-profile-mapper.service";

// Core Services
import { AiChatService } from "./services/ai-chat.service";
import { AiModelConfigService } from "./services/ai-model-config.service";
import { AiApiCallerService } from "./services/ai-api-caller.service";
import { AiStreamHandlerService } from "./services/ai-stream-handler.service";
import { AiChatPromptService } from "./services/ai-chat-prompt.service";
import { AiChatRetryService } from "./services/ai-chat-retry.service";
// 2026-05-05 抽自 AiChatService（god-class size 治理）：BYOK per-key failover 路径
import { AiChatFailoverCallerService } from "./services/ai-chat-failover-caller.service";

// Extracted Services (from ai-chat.service.ts God Object split)
import { AiConnectionTestService } from "./services/ai-connection-test.service";
import { AiModelDiscoveryService } from "./services/ai-model-discovery.service";
import { AiDirectKeyService } from "./services/ai-direct-key.service";
import { AiImageGenerationService } from "./services/ai-image-generation.service";
import { PromptCacheCoordinatorService } from "./services/prompt-cache-coordinator.service";
import { SystemModelInventoryService } from "./services/system-model-inventory.service";

// Model Fallback
import { ModelFallbackService } from "./selection/model-fallback.service";

// Auto-configure service (used by UserModelConfigsAutoController in ai-app/byok)
import { AutoConfigureService } from "./user-config/user-models-auto-configure.service";

// Long-term editable recommendation matrix (user + admin auto-configure share this)
import { ModelRecommendationsService } from "./selection/model-recommendations.service";

// Environment-aware model election (pick modelId from env snapshot + request hints)
import { ModelElectionService } from "./selection/model-election.service";

// Single source of truth for model pricing (DB AIModel table → in-memory hydrate)
import { ModelPricingRegistry } from "./pricing/model-pricing.registry";

@Module({
  imports: [
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 3,
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        maxHeaderSize: 64 * 1024,
      } as http.AgentOptions & { maxHeaderSize: number }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        maxHeaderSize: 64 * 1024,
      } as https.AgentOptions & { maxHeaderSize: number }),
      // Axios config for large responses（LLM 1M context + 长输出可达 30MB）
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024, // 50MB
    }),
    SecretsModule,
    UserApiKeysModule,
    KeyResolverModule, // BYOK v2: 统一 API Key 解析
    KeyExecutorModule, // BYOK v3 (PR-4): 失效切换 + LastGood 粘性
    UserModelConfigsModule, // BYOK v3: 用户自定义多模型
    AiEngineConstraintModule,
    forwardRef(() => AiEnginePlanningModule),
  ],
  providers: [
    // LLM Factory & Adapters
    LLMFactory,
    FunctionCallingLLMAdapter,
    AiChatLLMAdapter,
    UniversalLLMAdapter,

    // Services
    TaskProfileMapperService,
    AiModelConfigService,
    AiApiCallerService,
    AiStreamHandlerService,
    AiChatPromptService,
    AiChatRetryService,
    AiChatFailoverCallerService,
    AiChatService,

    // Extracted Services
    AiConnectionTestService,
    AiModelDiscoveryService,
    AiDirectKeyService,
    AiImageGenerationService,

    // BYOK v3 auto-configure
    AutoConfigureService,
    ModelRecommendationsService,

    // Prompt Cache
    PromptCacheCoordinatorService,

    // Model Fallback
    ModelFallbackService,

    // Admin — 系统模型全景
    SystemModelInventoryService,

    // Environment-aware model election
    ModelElectionService,

    // Pricing single source of truth (replaces 3 hardcoded tables)
    ModelPricingRegistry,
  ],
  exports: [
    LLMFactory,
    FunctionCallingLLMAdapter,
    AiChatLLMAdapter,
    UniversalLLMAdapter,
    TaskProfileMapperService,
    AiModelConfigService,
    AiApiCallerService,
    AiStreamHandlerService,
    AiChatPromptService,
    AiChatRetryService,
    AiChatFailoverCallerService,
    AiChatService,
    AiConnectionTestService,
    AiModelDiscoveryService,
    AiDirectKeyService,
    AiImageGenerationService,
    PromptCacheCoordinatorService,
    ModelFallbackService,
    ModelRecommendationsService,
    SystemModelInventoryService,
    ModelElectionService,
    AutoConfigureService,
    ModelPricingRegistry,
  ],
})
export class AiEngineLLMModule {}
