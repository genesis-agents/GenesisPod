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
import { SecretsModule } from "../ai-infra/secrets/secrets.module";
import { UserApiKeysModule } from "../ai-infra/user-api-keys/user-api-keys.module";
import { KeyResolverModule } from "../ai-infra/key-resolver/key-resolver.module";
import { UserModelConfigsModule } from "../ai-infra/user-model-configs/user-model-configs.module";
import { AiEngineConstraintModule } from "./ai-engine-constraint.module";
import { AiEngineOrchestrationModule } from "./ai-engine-orchestration.module";
import * as http from "http";
import * as https from "https";

// LLM Core
import { LLMFactory } from "./llm/factory/llm-factory";
import { FunctionCallingLLMAdapter } from "./llm/adapters/function-calling-llm-adapter";
import { AiChatLLMAdapter } from "./llm/adapters/ai-chat-llm-adapter";
import { UniversalLLMAdapter } from "./llm/adapters/universal-llm-adapter";
import { TaskProfileMapperService } from "./llm/services/task-profile-mapper.service";

// Core Services
import { AiChatService } from "./llm/services/ai-chat.service";
import { AiModelConfigService } from "./llm/services/ai-model-config.service";
import { AiApiCallerService } from "./llm/services/ai-api-caller.service";
import { AiStreamHandlerService } from "./llm/services/ai-stream-handler.service";
import { AiChatPromptService } from "./llm/services/ai-chat-prompt.service";
import { AiChatRetryService } from "./llm/services/ai-chat-retry.service";

// Extracted Services (from ai-chat.service.ts God Object split)
import { AiConnectionTestService } from "./llm/services/ai-connection-test.service";
import { AiModelDiscoveryService } from "./llm/services/ai-model-discovery.service";
import { AiDirectKeyService } from "./llm/services/ai-direct-key.service";
import { AiImageGenerationService } from "./llm/services/ai-image-generation.service";
import { PromptCacheCoordinatorService } from "./llm/services/prompt-cache-coordinator.service";
import { SystemModelInventoryService } from "./llm/services/system-model-inventory.service";

// Model Fallback
import { ModelFallbackService } from "./llm/model-fallback/model-fallback.service";

// User-facing controllers: dynamic model discovery + one-click auto-configure
import {
  UserModelsController,
  UserModelConfigsAutoController,
} from "./llm/user-models.controller";
import { AutoConfigureService } from "./llm/user-models-auto-configure.service";

// Long-term editable recommendation matrix (user + admin auto-configure share this)
import { ModelRecommendationsService } from "./llm/recommendations/model-recommendations.service";

// Environment-aware model election (pick modelId from env snapshot + request hints)
import { ModelElectionService } from "./llm/election/model-election.service";

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
      // Axios config for large responses
      maxContentLength: 10 * 1024 * 1024, // 10MB
      maxBodyLength: 10 * 1024 * 1024, // 10MB
    }),
    SecretsModule,
    UserApiKeysModule,
    KeyResolverModule, // BYOK v2: 统一 API Key 解析
    UserModelConfigsModule, // BYOK v3: 用户自定义多模型
    AiEngineConstraintModule,
    forwardRef(() => AiEngineOrchestrationModule),
  ],
  controllers: [UserModelsController, UserModelConfigsAutoController],
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
  ],
})
export class AiEngineLLMModule {}
