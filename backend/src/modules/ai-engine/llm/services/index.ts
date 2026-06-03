/**
 * AI Engine - LLM Services
 * LLM 服务层导出
 */

// 主服务
export { AiChatService } from "./ai-chat.service";
export type {
  AIModelConfig,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
} from "./ai-chat.service";

// 子服务
export { AiChatTokenService } from "./chat/ai-chat-token.service";
export { AiChatPromptService } from "./chat/ai-chat-prompt.service";
export { AiChatRetryService } from "./chat/ai-chat-retry.service";
// v3.1 A0：AiChatModelConfigService 已弃用（thin wrapper），新代码请改用
// `AiModelConfigService`。保留 re-export 供历史 import 点编译通过。
export { AiChatModelConfigService } from "./chat/ai-chat-model-config.service";
export {
  PromptCacheCoordinatorService,
  type CachePrefix,
} from "./chat/prompt-cache-coordinator.service";
