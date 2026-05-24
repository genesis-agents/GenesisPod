/**
 * AiChatFailoverCallerService
 *
 * 抽自 AiChatService（2026-05-05）—— 把 BYOK per-key failover 路径独立成 service，
 * 让 ai-chat.service.ts 回到 god-class 阈值以下；行为/语义不变（PR-4 BYOK failover）。
 *
 * 职责：
 *   - userId 路径下：把 callAPIWithConfig 的 apiCall 包到 keyExecutor.execute()
 *   - 单 key 401/429/quota 自动切到下一把 PERSONAL/ASSIGNED key
 *   - 内层重试（同一把 key 上的 5xx）走 retryService 指数退避
 *   - 全部 key 失败抛 AllKeysFailedError；strictMode=true 时直接 rethrow
 *
 * 与 callAPIWithConfig 旧路径的区别：
 *   - 旧路径：resolveApiKey 单 key + retryService 内层重试（同 key 5xx）
 *   - 新路径：keyExecutor 外层换 key + retryService 内层重试（每个 key 都重试一遍）
 *
 * 错误语义：
 *   - 全部 key 401 → AllKeysFailedError（HTTP 403 + code=ALL_KEYS_FAILED）
 *   - provider 5xx → 抛原始 error（不切下一把，retryService 内层已重试）
 *   - 全部 key quota → AllKeysFailedError 携带 lastReason=QUOTA_EXCEEDED
 *
 * 依赖反转（DI）：
 *   - KeyExecutorService（@Optional 兼容老链路缺失场景，调用方负责检查）
 *   - AiApiCallerService（4 provider API 转发）
 *   - AiChatRetryService（同 key 内层重试）
 *   - AiModelConfigService（isReasoningModel 用于 timeout 推断）
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ChatMessage } from "../types";
import { AIModelConfig, AiModelConfigService } from "./ai-model-config.service";
import { AiApiCallerService } from "./ai-api-caller.service";
import { AiChatRetryService } from "./ai-chat-retry.service";
import { KeyExecutorService } from "@/modules/ai-infra/credentials/executor";
import { BYOKError } from "@/modules/ai-infra/credentials/key-resolver/key-resolver.errors";
import type { ChatCompletionResult } from "./ai-chat.service";
import type { StructuredOutputStrategy } from "../structured-output/structured-output-strategy.types";
import type { FunctionDefinition } from "../../tools/abstractions/tool.interface";

@Injectable()
export class AiChatFailoverCallerService {
  private readonly logger = new Logger(AiChatFailoverCallerService.name);

  constructor(
    private readonly apiCallerService: AiApiCallerService,
    private readonly retryService: AiChatRetryService,
    private readonly modelConfigService: AiModelConfigService,
    @Optional() private readonly keyExecutor?: KeyExecutorService,
  ) {}

  isAvailable(): boolean {
    return this.keyExecutor != null;
  }

  /**
   * 流式调用完成后记账：标记 key HEALTHY + 更新 LastGood（粘性）
   * AiChatService.chatStream 在流末尾 yield done:true 后调用
   */
  async trackSuccess(
    healthKeyId: string,
    provider: string,
    userId: string,
  ): Promise<void> {
    if (!this.keyExecutor) return;
    await this.keyExecutor.trackSuccess(healthKeyId, provider, userId);
  }

  /**
   * 流式调用失败时记账：分类 401/403/quota/429 → DEAD/COOLDOWN
   * 流式无法做 mid-stream failover，但能让下次 resolveKeyChain 跳过坏 key
   */
  async trackFailure(
    healthKeyId: string,
    provider: string,
    error: unknown,
  ): Promise<void> {
    if (!this.keyExecutor) return;
    await this.keyExecutor.trackFailure(healthKeyId, provider, error);
  }

  async callAPIWithFailover(
    userId: string,
    config: AIModelConfig,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number | undefined,
    optionStrictMode: boolean | undefined,
    responseFormat: string | undefined,
    reasoningDepth: import("../types").ReasoningDepth | undefined,
    cachePolicy: "auto" | undefined,
    outputSchema:
      | { type: "json_schema"; schema: Record<string, unknown> }
      | undefined,
    structuredOutputStrategy?: StructuredOutputStrategy,
    outputJsonSchema?: Record<string, unknown>,
    schemaName?: string,
    tools?: FunctionDefinition[],
  ): Promise<ChatCompletionResult> {
    if (!this.keyExecutor) {
      throw new Error("KeyExecutor not available — should not reach here");
    }
    const { modelId, apiEndpoint, provider } = config;
    const apiFormat = config.apiFormat || "openai";
    const supportsTemp = config.supportsTemperature ?? true;
    const isReasoning = config.isReasoning ?? false;
    const tokenParamName =
      config.tokenParamName ||
      (isReasoning ? "max_completion_tokens" : "max_tokens");

    const configLimit = config.maxTokens;
    if (configLimit > 0 && maxTokens > configLimit) {
      this.logger.warn(
        `[callAPIWithFailover] Clamping maxTokens from ${maxTokens} to model limit ${configLimit} for ${modelId}`,
      );
      maxTokens = configLimit;
    }

    // ★ 修复：用 Math.max 而非 || 短路，避免 UserModelConfig.defaultTimeoutMs
    // 默认值 120000（schema @default）让 reasoning model 永远走不到 540s+ 的 timeout 算法。
    // configured 仍允许 admin/用户显式调大（如 900000），但不会被低于推荐值的旧默认值卡死。
    const computedTimeout = this.modelConfigService.getTimeoutForModel(
      modelId,
      maxTokens,
    );
    const configuredTimeout = config.defaultTimeoutMs ?? 0;
    const timeout = Math.max(computedTimeout, configuredTimeout);
    const useStrictMode = optionStrictMode ?? false;
    const effectiveTemperature = supportsTemp ? temperature : undefined;

    try {
      const result = await this.keyExecutor.execute(
        userId,
        provider,
        async (key) => {
          const apiKey = key.apiKey;
          const effectiveEndpoint = key.apiEndpoint || apiEndpoint;

          const apiCall = async (): Promise<ChatCompletionResult> => {
            switch (apiFormat) {
              case "openai":
                return await this.apiCallerService.callOpenAICompatibleAPI(
                  effectiveEndpoint,
                  apiKey,
                  modelId,
                  messages,
                  maxTokens,
                  effectiveTemperature,
                  timeout,
                  tokenParamName,
                  responseFormat,
                  reasoningDepth,
                  outputSchema,
                  useStrictMode,
                  isReasoning,
                  structuredOutputStrategy,
                  outputJsonSchema,
                  schemaName,
                  tools,
                  provider, // v3.1 §A: 让 ModelCapabilityService 判 nativeMode==='none'
                );
              case "anthropic":
                return await this.apiCallerService.callAnthropicAPI(
                  effectiveEndpoint,
                  apiKey,
                  modelId,
                  messages,
                  maxTokens,
                  effectiveTemperature,
                  timeout,
                  responseFormat,
                  reasoningDepth,
                  cachePolicy,
                  structuredOutputStrategy,
                  outputJsonSchema,
                  schemaName,
                );
              case "google":
                return await this.apiCallerService.callGoogleAPI(
                  effectiveEndpoint,
                  apiKey,
                  modelId,
                  messages,
                  maxTokens,
                  effectiveTemperature,
                  timeout,
                  responseFormat,
                  reasoningDepth,
                  structuredOutputStrategy,
                  outputJsonSchema,
                  schemaName,
                );
              case "xai":
                return await this.apiCallerService.callXAIAPI(
                  effectiveEndpoint,
                  apiKey,
                  modelId,
                  messages,
                  maxTokens,
                  effectiveTemperature,
                  timeout,
                  tokenParamName,
                  responseFormat,
                  reasoningDepth,
                  outputSchema,
                  useStrictMode,
                  isReasoning,
                  structuredOutputStrategy,
                  outputJsonSchema,
                  schemaName,
                  tools,
                );
              default:
                return await this.apiCallerService.callOpenAICompatibleAPI(
                  effectiveEndpoint,
                  apiKey,
                  modelId,
                  messages,
                  maxTokens,
                  effectiveTemperature,
                  timeout,
                  tokenParamName,
                  responseFormat,
                  reasoningDepth,
                  outputSchema,
                  useStrictMode,
                  isReasoning,
                  structuredOutputStrategy,
                  outputJsonSchema,
                  schemaName,
                  tools,
                  provider, // v3.1 §A: 让 ModelCapabilityService 判 nativeMode==='none'
                );
            }
          };
          // 内层重试：同一把 key 上的 5xx 走 retryService 指数退避；
          // 抛出后 KeyExecutor 才接管 key 切换
          return await this.retryService.withExponentialBackoff(
            apiCall,
            `callAPIWithFailover [${modelId}|${key.healthKeyId}]`,
            provider,
          );
        },
      );
      result.apiKeySource = result.apiKeySource ?? "personal"; // BYOK 路径都打 personal/assigned 标
      return result;
    } catch (error) {
      // BYOKError（含 AllKeysFailedError / ProviderCooldownError / InvalidApiKeyError）
      // 直接上抛，让 HTTP 层按 code 返回结构化错误
      if (error instanceof BYOKError) throw error;
      if (useStrictMode) throw error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[callAPIWithFailover] ${provider} API failed after failover: ${errorMsg}`,
      );
      return {
        content: `**${provider} API 调用失败**\n\n模型：${modelId}\n错误信息：${errorMsg}\n\n请稍后重试或检查 API 配置。`,
        model: modelId,
        tokensUsed: 0,
        isError: true,
      };
    }
  }
}
