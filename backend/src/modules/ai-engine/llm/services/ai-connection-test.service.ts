import { Injectable, Logger, Optional } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AiModelConfigService } from "./ai-model-config.service";
import { inferIsReasoning } from "../types/model.utils";
import {
  ensureChatCompletionsPath,
  ensureMessagesPath,
  ensureGeminiGenerateContentPath,
  ensureOpenAIEmbeddingsPath,
  ensureCohereEmbedPath,
  ensureGeminiEmbedContentPath,
  ensureOpenAIImagesGenerationsPath,
} from "../types/endpoint.utils";
import { UserApiKeysService } from "@/modules/ai-infra/credentials/user-api-keys/user-api-keys.service";

/**
 * AI Connection Test Service
 * 职责：AI 模型连接测试（各 provider 的连通性验证）
 *
 * 从 AiChatService 提取，处理：
 * - Chat 模型连接测试
 * - Embedding 模型连接测试
 * - Rerank 模型连接测试
 * - TTS/Audio 模型连接测试
 * - Imagen 模型连接测试
 */
@Injectable()
export class AiConnectionTestService {
  private readonly logger = new Logger(AiConnectionTestService.name);

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly modelConfigService?: AiModelConfigService,
    @Optional() private readonly userApiKeys?: UserApiKeysService,
  ) {}

  /**
   * 解析 OpenAI-compatible provider 的 chat-completions 完整 URL。
   *
   * 优先级：
   *   1. 调用方传入的 override（用户在 UserModelConfig.apiEndpoint 显式配置）—
   *      尾部已含 /chat/completions 直接用，否则按"base + /chat/completions"拼。
   *   2. DB `ai_providers` 单源（admin 维护 + scope=user 自定义）— 经
   *      UserApiKeysService.resolveProviderDefaults() 查询。
   *
   * 2026-05-11 P2: PROVIDER_DEFAULTS 硬编码已删除。DB 未配该 provider 时
   *   resolveProviderDefaults 返回 null，下游报"请去 admin 维护页配置"。
   */
  private async resolveOpenAICompatibleChatEndpoint(
    provider: string,
    override?: string,
  ): Promise<string | null> {
    // 用户显式 override 直接走单源 helper
    const overrideNormalized = ensureChatCompletionsPath(override);
    if (overrideNormalized) return overrideNormalized;
    // 否则走 DB ai_providers 真源 + 单源 helper
    const defaults = await this.userApiKeys?.resolveProviderDefaults(
      provider.toLowerCase(),
    );
    return ensureChatCompletionsPath(defaults?.endpoint);
  }

  /**
   * 推断模型是否为推理模型（用于 tokenParamName 决策）
   *
   * 优先走 modelConfigService（读 DB + 缓存），DI 未完整时回落到
   * types/model.utils.ts 的统一名单——不再维护本地 fallback 副本，
   * 避免多份"推理模型名单"漂移。
   */
  private inferIsReasoning(modelId: string): boolean {
    if (this.modelConfigService) {
      return this.modelConfigService.isReasoningModel(modelId);
    }
    return inferIsReasoning(modelId);
  }

  /**
   * Test connection to an AI model with custom API key and endpoint
   * Used for testing models configured in the database
   */
  async testModelConnectionWithKey(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    modelType?: string,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();

    if (!apiKey) {
      return {
        success: false,
        message: "API key is not configured",
        latency: 0,
      };
    }

    try {
      // Handle EMBEDDING models specially
      if (modelType === "EMBEDDING") {
        return await this.testEmbeddingModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      // Handle RERANK models specially
      if (modelType === "RERANK") {
        return await this.testRerankModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      // Handle TTS/AUDIO models
      if (
        modelType === "TTS" ||
        modelType === "AUDIO" ||
        modelId?.toLowerCase().includes("tts")
      ) {
        return await this.testTTSModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          startTime,
        );
      }

      // Handle IMAGE_GENERATION / IMAGE_EDITING models.
      // DALL-E / gpt-image 只能通过 /v1/images/generations；
      // 走 chat/completions 会 403 "not allowed to sample from this model"。
      if (
        modelType === "IMAGE_GENERATION" ||
        modelType === "IMAGE_EDITING" ||
        (provider.toLowerCase() === "openai" &&
          (modelId?.startsWith("dall-e") || modelId?.startsWith("gpt-image")))
      ) {
        return await this.testImageModel(
          provider,
          modelId,
          apiKey,
          apiEndpoint,
          modelType,
          startTime,
        );
      }

      const testMessages = [
        {
          role: "user" as const,
          content: "Say 'OK' to confirm you are working.",
        },
      ];

      let response;

      switch (provider.toLowerCase()) {
        case "xai":
        case "grok": {
          const grokTestMessages = [
            {
              role: "user" as const,
              content: "What is 2+2?",
            },
          ];
          response = await firstValueFrom(
            this.httpService.post(
              ensureChatCompletionsPath(apiEndpoint) ||
                "https://api.x.ai/v1/chat/completions",
              {
                model: modelId || "",
                messages: grokTestMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;
        }

        case "openai":
        case "gpt": {
          const effectiveOpenAIModel = modelId || "";
          // ★ Read tokenParamName from DB config first, fallback to reasoning inference
          const dbConfig =
            await this.modelConfigService?.getModelConfig(effectiveOpenAIModel);
          const openAITokenParamName =
            dbConfig?.tokenParamName ||
            (this.inferIsReasoning(effectiveOpenAIModel)
              ? "max_completion_tokens"
              : "max_tokens");
          const openAITokenParam = { [openAITokenParamName]: 50 };

          response = await firstValueFrom(
            this.httpService.post(
              ensureChatCompletionsPath(apiEndpoint) ||
                "https://api.openai.com/v1/chat/completions",
              {
                model: effectiveOpenAIModel,
                messages: testMessages,
                ...openAITokenParam,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;
        }

        case "anthropic":
        case "claude":
          response = await firstValueFrom(
            this.httpService.post(
              ensureMessagesPath(apiEndpoint) ||
                "https://api.anthropic.com/v1/messages",
              {
                model: modelId || "",
                max_tokens: 50,
                messages: testMessages,
              },
              {
                headers: {
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01",
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;

        case "google":
        case "gemini": {
          const isImagenModel = modelId?.toLowerCase().includes("imagen");

          if (isImagenModel) {
            const imagenEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`;

            this.logger.log(`Testing Imagen API: ${imagenEndpoint}`);

            try {
              response = await firstValueFrom(
                this.httpService.post(
                  imagenEndpoint,
                  {
                    instances: [
                      {
                        prompt: "A simple blue circle on white background",
                      },
                    ],
                    parameters: {
                      sampleCount: 1,
                      aspectRatio: "1:1",
                      outputOptions: {
                        mimeType: "image/png",
                      },
                    },
                  },
                  {
                    headers: {
                      "x-goog-api-key": apiKey,
                      "Content-Type": "application/json",
                    },
                    timeout: 120000,
                  },
                ),
              );

              if (response.data?.predictions?.[0]?.bytesBase64Encoded) {
                const latency = Date.now() - startTime;
                return {
                  success: true,
                  message: `Imagen connection successful! Image generated.`,
                  latency,
                };
              }

              if (response.data?.generatedImages?.[0]?.image?.imageBytes) {
                const latency = Date.now() - startTime;
                return {
                  success: true,
                  message: `Imagen connection successful! Image generated.`,
                  latency,
                };
              }

              const latency = Date.now() - startTime;
              return {
                success: true,
                message: `Imagen API responded successfully. Response keys: ${Object.keys(response.data || {}).join(", ")}`,
                latency,
              };
            } catch (testError: unknown) {
              const latency = Date.now() - startTime;
              const err = testError as Record<string, unknown>;
              const response = err.response as
                | Record<string, unknown>
                | undefined;
              const data = response?.data as
                | Record<string, unknown>
                | undefined;
              const error = data?.error as Record<string, unknown> | undefined;
              const errorMsg =
                (error?.message as string) ||
                (err.message as string) ||
                "Unknown error";
              const errorCode = (response?.status as number) || "N/A";
              return {
                success: false,
                message: `Imagen test failed (${errorCode}): ${errorMsg}`,
                latency,
              };
            }
          } else {
            const isImageCapableModel =
              modelId?.includes("gemini-2.0-flash-exp") ||
              modelId?.includes("image");

            const geminiTestPrompt = isImageCapableModel
              ? "Hello"
              : testMessages[0].content;

            const geminiConfig: Record<string, unknown> = isImageCapableModel
              ? {}
              : {
                  maxOutputTokens: 50,
                  temperature: 0,
                };

            const effectiveGeminiModel = modelId || "";
            // 2026-05-10 §2/§4：单源归一化。
            const geminiEndpoint = ensureGeminiGenerateContentPath(
              apiEndpoint,
              effectiveGeminiModel,
            );

            this.logger.log(`Testing Gemini API: ${geminiEndpoint}`);

            response = await firstValueFrom(
              this.httpService.post(
                geminiEndpoint,
                {
                  contents: [
                    {
                      parts: [{ text: geminiTestPrompt }],
                    },
                  ],
                  ...(Object.keys(geminiConfig).length > 0
                    ? { generationConfig: geminiConfig }
                    : {}),
                },
                {
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                  },
                  timeout: 30000,
                },
              ),
            );
          }
          break;
        }

        // Perplexity (OpenAI-compatible format)
        case "perplexity":
          response = await firstValueFrom(
            this.httpService.post(
              ensureChatCompletionsPath(apiEndpoint) ||
                "https://api.perplexity.ai/chat/completions",
              {
                model: modelId || "",
                messages: testMessages,
                max_tokens: 50,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 15000,
              },
            ),
          );
          break;

        // OpenAI-compatible providers — endpoint 走 DB ai_providers 真源
        case "groq":
        case "openrouter":
        case "minimax":
        case "deepseek":
        case "qwen":
        case "alibaba":
        case "doubao":
        case "bytedance":
        case "zhipu":
        case "glm":
        case "kimi":
        case "moonshot": {
          const chatUrl = await this.resolveOpenAICompatibleChatEndpoint(
            provider,
            apiEndpoint,
          );
          if (!chatUrl) {
            return {
              success: false,
              message:
                `Provider "${provider}" 没有可用的 chat endpoint：` +
                `请在 admin /admin/ai/providers 维护 ai_providers 行，` +
                `或在该模型 UserModelConfig.apiEndpoint 显式填写完整 URL。`,
              latency: Date.now() - startTime,
            };
          }
          response = await firstValueFrom(
            this.httpService.post(
              chatUrl,
              {
                model: modelId,
                messages: testMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;
        }

        default: {
          // 2026-05-11 P4: 不再硬拒"未知 provider"。admin 在 UI 加的新 provider
          // 走通用 OpenAI-兼容派发：DB ai_providers.endpoint + Bearer auth +
          // /chat/completions 后缀。apiFormat=anthropic/google 走专用分支由前面
          // 的 case 处理；其他全部归 openai-compat 默认。
          const chatUrl = await this.resolveOpenAICompatibleChatEndpoint(
            provider,
            apiEndpoint,
          );
          if (!chatUrl) {
            return {
              success: false,
              message:
                `Provider "${provider}" 没有可用的 chat endpoint：` +
                `请在 admin /admin/ai-providers 维护页添加该 provider 行，` +
                `或在该模型 UserModelConfig.apiEndpoint 显式填写完整 URL。`,
              latency: Date.now() - startTime,
            };
          }
          response = await firstValueFrom(
            this.httpService.post(
              chatUrl,
              {
                model: modelId,
                messages: testMessages,
                max_tokens: 50,
                temperature: 0,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          break;
        }
      }

      const latency = Date.now() - startTime;

      let content = "";
      if (
        provider.toLowerCase() === "anthropic" ||
        provider.toLowerCase() === "claude"
      ) {
        content = response.data?.content?.[0]?.text || "";
      } else if (
        provider.toLowerCase() === "google" ||
        provider.toLowerCase() === "gemini"
      ) {
        content =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        content = response.data?.choices?.[0]?.message?.content || "";
      }

      return {
        success: true,
        message: `Connection successful! Response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`,
        latency,
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      const err = error as Record<string, unknown>;
      if (err.response) {
        const response = err.response as Record<string, unknown>;
        const status = response.status;
        const data = response.data as Record<string, unknown> | undefined;
        errorMessage = `API Error (${status}): ${(data?.error as Record<string, unknown>)?.message || data?.message || JSON.stringify(data)}`;
      } else if (err.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (err.message) {
        errorMessage = err.message as string;
      }

      this.logger.error(`Model connection test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to an embedding model
   */
  private async testEmbeddingModel(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const testInput = "Hello, this is a test.";
      let response;

      switch (provider.toLowerCase()) {
        case "openai":
        case "gpt": {
          // 2026-05-10 §2/§4：单源归一化。
          const openaiEmbeddingsUrl =
            ensureOpenAIEmbeddingsPath(apiEndpoint) ||
            "https://api.openai.com/v1/embeddings";
          response = await firstValueFrom(
            this.httpService.post(
              openaiEmbeddingsUrl,
              {
                model: modelId || "text-embedding-3-small",
                input: testInput,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.data?.[0]?.embedding) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.data[0].embedding.length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;
        }

        case "cohere": {
          // 2026-05-10 §2/§4：单源归一化。
          const cohereEmbedUrl =
            ensureCohereEmbedPath(apiEndpoint) ||
            "https://api.cohere.ai/v1/embed";
          response = await firstValueFrom(
            this.httpService.post(
              cohereEmbedUrl,
              {
                model: modelId || "embed-english-v3.0",
                texts: [testInput],
                input_type: "search_document",
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.embeddings?.[0]) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.embeddings[0].length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;
        }

        case "google":
        case "gemini": {
          // 2026-05-10 §2/§4：单源归一化。
          const geminiEndpoint = ensureGeminiEmbedContentPath(
            apiEndpoint,
            modelId || "text-embedding-004",
          );

          response = await firstValueFrom(
            this.httpService.post(
              geminiEndpoint,
              {
                content: {
                  parts: [{ text: testInput }],
                },
              },
              {
                headers: {
                  "x-goog-api-key": apiKey,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.embedding?.values) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.embedding.values.length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;
        }

        // Voyage AI / Jina embedding — OpenAI-compatible (`{ model, input }`)，
        // 仅 endpoint default 不同。Voyage docs: https://docs.voyageai.com/reference/embeddings-api
        case "voyage":
        case "voyageai":
        case "jina": {
          const defaultEmbedUrl =
            provider.toLowerCase() === "jina"
              ? "https://api.jina.ai/v1/embeddings"
              : "https://api.voyageai.com/v1/embeddings";
          const embedUrl =
            ensureOpenAIEmbeddingsPath(apiEndpoint) || defaultEmbedUrl;
          response = await firstValueFrom(
            this.httpService.post(
              embedUrl,
              {
                model: modelId,
                input: testInput,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.data?.[0]?.embedding) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.data[0].embedding.length;
            return {
              success: true,
              message: `Embedding model connected! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;
        }

        default: {
          // ★ 2026-05-11 拉齐 BYOK：admin 端不再硬拒未知 provider，按 OpenAI
          //   兼容协议（{model, input} body + Bearer auth + /embeddings 路径）
          //   兜底。若 apiEndpoint 缺失或 provider 真不兼容，由远端 API 自身
          //   报真实错误而非系统层假阴性。
          if (!apiEndpoint?.trim()) {
            return {
              success: false,
              message:
                `Provider "${provider}" 未声明 embedding endpoint：` +
                `请填写完整 API Endpoint（如 https://api.example.com/v1）` +
                `或在 admin /admin/ai/providers 维护 ai_providers 行。`,
              latency: Date.now() - startTime,
            };
          }
          const fallbackUrl =
            ensureOpenAIEmbeddingsPath(apiEndpoint) || apiEndpoint;
          response = await firstValueFrom(
            this.httpService.post(
              fallbackUrl,
              {
                model: modelId,
                input: testInput,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          if (response.data?.data?.[0]?.embedding) {
            const latency = Date.now() - startTime;
            const dimensions = response.data.data[0].embedding.length;
            return {
              success: true,
              message: `Embedding model connected (OpenAI-compat)! Dimensions: ${dimensions}`,
              latency,
            };
          }
          break;
        }
      }

      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Embedding API responded successfully`,
        latency,
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      const err = error as Record<string, unknown>;
      if (err.response) {
        const response = err.response as Record<string, unknown>;
        const status = response.status;
        const data = response.data as Record<string, unknown> | undefined;
        errorMessage = `API Error (${status}): ${(data?.error as Record<string, unknown>)?.message || data?.message || JSON.stringify(data)}`;
      } else if (err.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (err.message) {
        errorMessage = err.message as string;
      }

      this.logger.error(`Embedding model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to a rerank model
   */
  private async testRerankModel(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    // 2026-05-13 P3-#9: admin 配错 endpoint 时 prod 报 `API Error (405): ""`
    // 空 body + 没 URL = admin 完全没法诊断。错误处理记录实际请求的 URL，让
    // admin 能立即看出 endpoint 拼接结果是否符合 provider /rerank API 规范。
    let attemptedUrl: string | undefined;
    try {
      const testQuery = "What is the capital of France?";
      const testDocuments = [
        "Paris is the capital of France.",
        "London is the capital of UK.",
      ];
      let response;

      // Cohere / Voyage / Jina 的 rerank API 协议高度一致：
      //   POST /rerank  body { model, query, documents, top_n }  Bearer auth
      // 主要差异在响应字段：cohere = `results[].relevance_score`、
      // voyage/jina = `data[].relevance_score`。
      //
      // 2026-05-11 P4: 删除 ensureRerankPath 的"防呆抛错"逻辑（admin 填错
      // endpoint 后缀时强行 throw）。改为正向：
      //   - 空 endpoint → 用 provider 默认 URL
      //   - 含 /rerank → 直接用
      //   - 不含 /rerank → 拼一个（信任 endpoint base，不主动判错）
      // admin 填错时由远端 provider 返回真实错误（如 cohere 404 "unknown route"）。
      // 前端 Add Model 表单在 P8 加柔性提示帮 admin 自检。
      const ensureRerankPath = (url: string, defaultUrl: string): string => {
        const trimmed = url.trim().replace(/\/+$/, "");
        if (!trimmed) return defaultUrl;
        if (trimmed.endsWith("/rerank")) return trimmed;
        return `${trimmed}/rerank`;
      };

      switch (provider.toLowerCase()) {
        case "cohere": {
          const cohereUrl = ensureRerankPath(
            apiEndpoint,
            "https://api.cohere.com/v1/rerank",
          );
          attemptedUrl = cohereUrl;
          response = await firstValueFrom(
            this.httpService.post(
              cohereUrl,
              {
                model: modelId || "rerank-v3.5",
                query: testQuery,
                documents: testDocuments,
                top_n: 2,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );

          if (response.data?.results) {
            const latency = Date.now() - startTime;
            const topScore =
              response.data.results[0]?.relevance_score?.toFixed(4) || "N/A";
            return {
              success: true,
              message: `Rerank model connected! Top relevance score: ${topScore}`,
              latency,
            };
          }
          break;
        }

        case "voyage":
        case "voyageai": {
          const voyageUrl = ensureRerankPath(
            apiEndpoint,
            "https://api.voyageai.com/v1/rerank",
          );
          attemptedUrl = voyageUrl;
          response = await firstValueFrom(
            this.httpService.post(
              voyageUrl,
              {
                model: modelId,
                query: testQuery,
                documents: testDocuments,
                top_k: 2,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          if (response.data?.data) {
            const latency = Date.now() - startTime;
            const topScore =
              response.data.data[0]?.relevance_score?.toFixed(4) || "N/A";
            return {
              success: true,
              message: `Rerank model connected! Top relevance score: ${topScore}`,
              latency,
            };
          }
          break;
        }

        case "jina": {
          const jinaUrl = ensureRerankPath(
            apiEndpoint,
            "https://api.jina.ai/v1/rerank",
          );
          attemptedUrl = jinaUrl;
          response = await firstValueFrom(
            this.httpService.post(
              jinaUrl,
              {
                model: modelId,
                query: testQuery,
                documents: testDocuments,
                top_n: 2,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          if (response.data?.results) {
            const latency = Date.now() - startTime;
            const topScore =
              response.data.results[0]?.relevance_score?.toFixed(4) || "N/A";
            return {
              success: true,
              message: `Rerank model connected! Top relevance score: ${topScore}`,
              latency,
            };
          }
          break;
        }

        default: {
          // ★ 2026-05-11 拉齐 BYOK：default 走 Cohere/Voyage 兼容协议。
          //   未知 provider 但 endpoint 显式提供时由远端 API 报真实错误。
          if (!apiEndpoint?.trim()) {
            return {
              success: false,
              message:
                `Provider "${provider}" 未声明 rerank endpoint：` +
                `请填写完整 API Endpoint（如 https://api.example.com/v1/rerank）。`,
              latency: Date.now() - startTime,
            };
          }
          const fallbackUrl = ensureRerankPath(apiEndpoint, "");
          attemptedUrl = fallbackUrl;
          response = await firstValueFrom(
            this.httpService.post(
              fallbackUrl,
              {
                model: modelId,
                query: testQuery,
                documents: testDocuments,
                top_n: 2,
              },
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 30000,
              },
            ),
          );
          if (response.data?.results || response.data?.data) {
            const latency = Date.now() - startTime;
            const rows = response.data?.results || response.data?.data || [];
            const topScore = rows[0]?.relevance_score?.toFixed(4) || "N/A";
            return {
              success: true,
              message: `Rerank model connected (OpenAI-compat)! Top relevance score: ${topScore}`,
              latency,
            };
          }
          break;
        }
      }

      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Rerank API responded successfully`,
        latency,
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";
      let hint = "";

      const err = error as Record<string, unknown>;
      if (err.response) {
        const response = err.response as Record<string, unknown>;
        const status = response.status;
        const data = response.data as Record<string, unknown> | undefined;
        const bodyText =
          (data?.error as Record<string, unknown>)?.message ||
          data?.message ||
          (data ? JSON.stringify(data) : "(empty body)");
        errorMessage = `API Error (${status}): ${bodyText}`;
        // ★ 405 + 空 body 是 admin 配错 endpoint 的常见模式（base URL 拼 /rerank
        //   后命中 provider 上的 GET-only 路径或非 rerank 路径）。给出诊断引导。
        if (status === 405) {
          hint =
            ` — POST ${attemptedUrl ?? "(unknown URL)"} 不被接受。` +
            `Endpoint 拼接后可能不是 ${provider} 的 rerank API 路径。` +
            `请检查 admin Add Model 的 API Endpoint，确认填写的是 base URL（如 https://api.cohere.com/v1）` +
            `或完整 rerank URL（如 https://api.cohere.com/v1/rerank）。`;
        } else if (status === 404) {
          hint =
            ` — POST ${attemptedUrl ?? "(unknown URL)"} 路径不存在。` +
            `请确认 endpoint 是 ${provider} 的正确 rerank API base / 完整 URL。`;
        }
      } else if (err.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (err.message) {
        errorMessage = err.message as string;
      }

      this.logger.error(
        `Rerank model test failed: ${errorMessage}${hint}` +
          (attemptedUrl ? ` [attempted POST ${attemptedUrl}]` : ""),
      );

      return {
        success: false,
        message: `Connection failed: ${errorMessage}${hint}`,
        latency,
      };
    }
  }

  /**
   * Test connection to a TTS/Audio model
   */
  private async testTTSModel(
    provider: string,
    _modelId: string,
    _apiKey: string,
    _apiEndpoint: string,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const latency = Date.now() - startTime;

      if (
        provider.toLowerCase() === "google" ||
        provider.toLowerCase() === "gemini"
      ) {
        return {
          success: true,
          message: `TTS model configured. Note: TTS models output audio, not text. API key is set.`,
          latency,
        };
      }

      return {
        success: true,
        message: `TTS/Audio model configured. This model outputs audio instead of text. API key is set.`,
        latency,
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const err = error as Record<string, unknown>;
      const errorMessage = (err.message as string) || "Unknown error";

      this.logger.error(`TTS model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * Test connection to an image-generation / image-editing model.
   *
   * OpenAI: /v1/images/generations（DALL-E / gpt-image-*）
   *   - 走 chat/completions 会 403 "not allowed to sample from this model"
   *   - 为了降低成本：size=256x256（DALL-E 3 不支持，会 fallback 到其默认 1024）
   * Google: imagen 走 :predict（已在主分支 handle）；这里兜底同一处理
   */
  private async testImageModel(
    provider: string,
    modelId: string,
    apiKey: string,
    apiEndpoint: string,
    modelType: string | undefined,
    startTime: number,
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    try {
      const p = provider.toLowerCase();

      if (p === "openai" || p === "gpt") {
        // IMAGE_EDITING 真正的 API 是 /v1/images/edits，需要上传一张图。
        // 这里测"连接可用性"——对 dall-e-2 也用 generations 端点做一次最小 prompt 探测，
        // 只要返回结构正确即算成功。避免上传图片素材。
        // 2026-05-10 §2/§4：单源归一化。
        const url =
          ensureOpenAIImagesGenerationsPath(apiEndpoint) ||
          "https://api.openai.com/v1/images/generations";

        const body: Record<string, unknown> = {
          model: modelId,
          prompt: "a small blue circle on a white background",
          n: 1,
          size: modelId?.startsWith("dall-e-3") ? "1024x1024" : "256x256",
        };

        const response = await firstValueFrom(
          this.httpService.post(url, body, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 60000,
          }),
        );

        const latency = Date.now() - startTime;
        const imageUrl = response.data?.data?.[0]?.url;
        const imageB64 = response.data?.data?.[0]?.b64_json;
        if (imageUrl || imageB64) {
          return {
            success: true,
            message: `Image model connected! Generated 1 image (${modelType || "IMAGE"}).`,
            latency,
          };
        }
        return {
          success: true,
          message: `Image API responded but no image data in response.`,
          latency,
        };
      }

      if (p === "google" || p === "gemini") {
        // Imagen 已在主分支处理，这里兜底不应该常被走到
        return {
          success: true,
          message: `Image model ${modelId} configured (Google path). Skipping active probe to save cost.`,
          latency: Date.now() - startTime,
        };
      }

      return {
        success: false,
        message: `Image generation not supported for provider: ${provider}`,
        latency: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      const err = error as Record<string, unknown>;
      if (err.response) {
        const response = err.response as Record<string, unknown>;
        const status = response.status;
        const data = response.data as Record<string, unknown> | undefined;
        const errObj = data?.error as Record<string, unknown> | undefined;
        errorMessage = `API Error (${status}): ${
          (errObj?.message as string) ||
          (data?.message as string) ||
          JSON.stringify(data)
        }`;
      } else if (err.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (err.message) {
        errorMessage = err.message as string;
      }

      this.logger.error(`Image model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }
}
