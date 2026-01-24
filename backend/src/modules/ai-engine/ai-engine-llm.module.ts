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

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SecretsModule } from '../core/secrets/secrets.module';

// LLM Core
import { LLMFactory } from './llm/factory/llm-factory';
import { FunctionCallingLLMAdapter } from './llm/adapters/function-calling-llm-adapter';
import { AiChatLLMAdapter } from './llm/adapters/ai-chat-llm-adapter';
import { UniversalLLMAdapter } from './llm/adapters/universal-llm-adapter';
import { TaskProfileMapperService } from './llm/services/task-profile-mapper.service';

// Core Services
import { AiChatService } from './llm/services/ai-chat.service';
import { AiModelConfigService } from './llm/services/ai-model-config.service';
import { AiApiCallerService } from './llm/services/ai-api-caller.service';
import { AiStreamHandlerService } from './llm/services/ai-stream-handler.service';
import { SearchService } from './search/search.service';

// Model Fallback
import { ModelFallbackService } from './llm/model-fallback/model-fallback.service';

@Module({
  imports: [HttpModule, SecretsModule],
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
    AiChatService,
    SearchService,

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
    AiChatService,
    SearchService,
    ModelFallbackService,
  ],
})
export class AiEngineLLMModule {}
