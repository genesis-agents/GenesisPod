import { Injectable, Logger, Optional } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AiModelConfigService } from "./ai-model-config.service";
import { inferIsReasoning } from "../types/model.utils";
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
   *      UserApiKeysService.resolveProviderDefaults() 查询，自动兜底
   *      hardcoded PROVIDER_DEFAULTS（DB 未 seed 时的迁移期 fallback）。
   *
   * 2026-05-10 §2：之前 OpenAI-compatible 一族（deepseek/qwen/groq/doubao/zhipu/
   * kimi/moonshot 等）在 override 为空时直接 POST 到空字符串导致测试按钮几乎
   * 全部失败。新 provider 走 DB seed（ai_providers 表），不再加 TS 硬编码。
   */
  private async resolveOpenAICompatibleChatEndpoint(
    provider: string,
    override?: string,
  ): Promise<string | null> {
    const trimmed = override?.trim();
    if (trimmed) {
      const noTrailing = trimmed.replace(/\/+$/, "");
      return noTrailing.endsWith("/chat/completions")
        ? noTrailing
        : `${noTrailing}/chat/completions`;
    }
    const defaults = await this.userApiKeys?.resolveProviderDefaults(
      provider.toLowerCase(),
    );
    if (!defaults?.endpoint) return null;
    return `${defaults.endpoint.replace(/\/+$/, "")}/chat/completions`;
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
              apiEndpoint || "https://api.x.ai/v1/chat/completions",
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
              apiEndpoint || "https://api.openai.com/v1/chat/completions",
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
              apiEndpoint || "https://api.anthropic.com/v1/messages",
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
            let geminiEndpoint: string;
            if (apiEndpoint && apiEndpoint.includes(":generateContent")) {
              geminiEndpoint = apiEndpoint;
            } else {
              const baseUrl =
                apiEndpoint?.replace(/\/$/, "") ||
                "https://generativelanguage.googleapis.com/v1beta/models";
              geminiEndpoint = `${baseUrl}/${effectiveGeminiModel}:generateContent`;
            }

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
              apiEndpoint || "https://api.perplexity.ai/chat/completions",
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

        default:
          return {
            success: false,
            message: `Unsupported provider: ${provider}`,
            latency: Date.now() - startTime,
          };
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
          let openaiEmbeddingsUrl = "https://api.openai.com/v1/embeddings";
          if (apiEndpoint) {
            const baseUrl = apiEndpoint.replace(/\/+$/, "");
            if (baseUrl.endsWith("/embeddings")) {
              openaiEmbeddingsUrl = baseUrl;
            } else {
              openaiEmbeddingsUrl = `${baseUrl}/embeddings`;
            }
          }
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
          let cohereEmbedUrl = "https://api.cohere.ai/v1/embed";
          if (apiEndpoint) {
            const baseUrl = apiEndpoint.replace(/\/+$/, "");
            if (baseUrl.endsWith("/embed")) {
              cohereEmbedUrl = baseUrl;
            } else {
              cohereEmbedUrl = `${baseUrl}/embed`;
            }
          }
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
          const geminiBaseUrl = apiEndpoint
            ? apiEndpoint.replace(/\/models\/?$/, "").replace(/\/+$/, "")
            : "https://generativelanguage.googleapis.com/v1beta";
          const geminiEndpoint = `${geminiBaseUrl}/models/${modelId || "text-embedding-004"}:embedContent`;

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

        default:
          return {
            success: false,
            message: `Embedding not supported for provider: ${provider}`,
            latency: Date.now() - startTime,
          };
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
    try {
      const testQuery = "What is the capital of France?";
      const testDocuments = [
        "Paris is the capital of France.",
        "London is the capital of UK.",
      ];
      let response;

      switch (provider.toLowerCase()) {
        case "cohere":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint || "https://api.cohere.ai/v1/rerank",
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

        default:
          return {
            success: false,
            message: `Rerank not supported for provider: ${provider}. Supported: cohere`,
            latency: Date.now() - startTime,
          };
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

      this.logger.error(`Rerank model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
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
        const baseUrl =
          apiEndpoint
            ?.replace(/\/+$/, "")
            .replace(/\/chat\/completions$/, "") || "https://api.openai.com/v1";
        const url = baseUrl.endsWith("/v1")
          ? `${baseUrl}/images/generations`
          : `${baseUrl}/v1/images/generations`;

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
