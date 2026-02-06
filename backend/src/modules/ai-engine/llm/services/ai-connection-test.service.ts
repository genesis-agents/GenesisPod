import { Injectable, Logger, Optional } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AiModelConfigService } from "./ai-model-config.service";

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
  ) {}

  /**
   * 推断模型是否为推理模型（用于 tokenParamName 决策）
   */
  private inferIsReasoning(modelId: string): boolean {
    if (this.modelConfigService) {
      return this.modelConfigService.isReasoningModel(modelId);
    }
    // Fallback if service not available
    const modelLower = modelId.toLowerCase();
    return (
      modelLower.includes("o1") ||
      modelLower.includes("o3") ||
      modelLower.includes("deepseek-r1") ||
      modelLower.includes("reasoning") ||
      modelLower.includes("thinking")
    );
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
                model: modelId || "grok-beta",
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
          const effectiveOpenAIModel = modelId || "gpt-4";
          const isReasoningModel = this.inferIsReasoning(effectiveOpenAIModel);
          const openAITokenParamName = isReasoningModel
            ? "max_completion_tokens"
            : "max_tokens";
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
                model: modelId || "claude-3-sonnet-20240229",
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
            } catch (testError: any) {
              const latency = Date.now() - startTime;
              const errorMsg =
                testError.response?.data?.error?.message ||
                testError.message ||
                "Unknown error";
              const errorCode = testError.response?.status || "N/A";
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

            const effectiveGeminiModel = modelId || "gemini-pro";
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

        // Chinese providers (OpenAI-compatible format)
        case "deepseek":
        case "qwen":
        case "alibaba":
        case "doubao":
        case "bytedance":
        case "zhipu":
        case "glm":
        case "kimi":
        case "moonshot":
          response = await firstValueFrom(
            this.httpService.post(
              apiEndpoint,
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
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
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
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
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
    } catch (error: any) {
      const latency = Date.now() - startTime;
      let errorMessage = "Unknown error";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        errorMessage = `API Error (${status}): ${data?.error?.message || data?.message || JSON.stringify(data)}`;
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Connection timeout";
      } else if (error.message) {
        errorMessage = error.message;
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
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const errorMessage = error.message || "Unknown error";

      this.logger.error(`TTS model test failed: ${errorMessage}`);

      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
        latency,
      };
    }
  }
}
