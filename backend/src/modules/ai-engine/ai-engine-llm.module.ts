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

// Model Fallback
import { ModelFallbackService } from "./llm/model-fallback/model-fallback.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 3,
      // Custom agents with increased maxHeaderSize (default is 16KB)
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
      }),
      // Axios config for large responses
      maxContentLength: 10 * 1024 * 1024, // 10MB
      maxBodyLength: 10 * 1024 * 1024, // 10MB
    }),
    SecretsModule,
    UserApiKeysModule,
    AiEngineConstraintModule,
    forwardRef(() => AiEngineOrchestrationModule),
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
    AiChatService,

    // Extracted Services
    AiConnectionTestService,
    AiModelDiscoveryService,
    AiDirectKeyService,
    AiImageGenerationService,

    // Model Fallback
    ModelFallbackService,
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
    ModelFallbackService,
  ],
})
export class AiEngineLLMModule {}
