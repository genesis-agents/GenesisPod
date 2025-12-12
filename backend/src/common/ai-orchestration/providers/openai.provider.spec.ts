/**
 * OpenAI Provider 单元测试
 *
 * 遵循 Martin Fowler 的重构原则：
 * - 测试驱动的重构验证
 * - 行为等价性验证
 * - 边界条件覆盖
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosResponse, AxiosError } from "axios";
import { OpenAITextProvider, DallEProvider } from "./openai.provider";
import { AiModelConfig } from "../types";
import { AIErrorType } from "../error-classifier";

describe("OpenAITextProvider", () => {
  let provider: OpenAITextProvider;
  let httpService: jest.Mocked<HttpService>;

  const mockModel: AiModelConfig = {
    id: "test-model",
    name: "GPT-4 Turbo",
    displayName: "GPT-4 Turbo",
    provider: "openai",
    modelId: "gpt-4-turbo-preview",
    modelType: "TEXT" as any,
    apiKey: "test-api-key",
  };

  beforeEach(async () => {
    const mockHttpService = {
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAITextProvider,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    provider = module.get<OpenAITextProvider>(OpenAITextProvider);
    httpService = module.get(HttpService);
  });

  describe("supportsModel", () => {
    it("should support GPT-4 models", () => {
      expect(provider.supportsModel("gpt-4")).toBe(true);
      expect(provider.supportsModel("gpt-4-turbo")).toBe(true);
      expect(provider.supportsModel("gpt-4o")).toBe(true);
    });

    it("should support GPT-3.5 models", () => {
      expect(provider.supportsModel("gpt-3.5-turbo")).toBe(true);
    });

    it("should support o1 and o3 models", () => {
      expect(provider.supportsModel("o1-preview")).toBe(true);
      expect(provider.supportsModel("o3-mini")).toBe(true);
    });

    it("should not support non-OpenAI models", () => {
      expect(provider.supportsModel("claude-3")).toBe(false);
      expect(provider.supportsModel("gemini-pro")).toBe(false);
    });
  });

  describe("generateText", () => {
    it("should generate text successfully", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: "chatcmpl-123",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello, world!" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await provider.generateText(
        mockModel,
        [{ role: "user", content: "Say hello" }],
        { maxTokens: 100 },
      );

      expect(result.content).toBe("Hello, world!");
      expect(result.tokensUsed).toBe(15);
      expect(result.finishReason).toBe("stop");
    });

    it("should handle empty response", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          id: "chatcmpl-123",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "" },
              finish_reason: "stop",
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      await expect(
        provider.generateText(
          mockModel,
          [{ role: "user", content: "test" }],
          {},
        ),
      ).rejects.toThrow("No content in OpenAI response");
    });

    it("should use max_completion_tokens for new models", async () => {
      const newModel = { ...mockModel, modelId: "gpt-4o-mini" };
      const mockResponse: AxiosResponse = {
        data: {
          choices: [{ message: { content: "test" } }],
          usage: { total_tokens: 10 },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      await provider.generateText(newModel, [{ role: "user", content: "hi" }], {
        maxTokens: 500,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          max_completion_tokens: 500,
        }),
        expect.any(Object),
      );
    });

    it("should use max_tokens for old models", async () => {
      const oldModel = { ...mockModel, modelId: "gpt-3.5-turbo" };
      const mockResponse: AxiosResponse = {
        data: {
          choices: [{ message: { content: "test" } }],
          usage: { total_tokens: 10 },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      await provider.generateText(oldModel, [{ role: "user", content: "hi" }], {
        maxTokens: 500,
      });

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          max_tokens: 500,
        }),
        expect.any(Object),
      );
    });
  });

  describe("error handling", () => {
    it("should classify rate limit errors", async () => {
      const axiosError = {
        response: {
          status: 429,
          data: { error: { message: "Rate limit exceeded" } },
        },
        isAxiosError: true,
        code: "ERR_BAD_REQUEST",
      } as AxiosError;

      httpService.post.mockReturnValue(throwError(() => axiosError));

      try {
        await provider.generateText(
          mockModel,
          [{ role: "user", content: "test" }],
          {},
        );
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error.type).toBe(AIErrorType.RATE_LIMIT);
        expect(error.isRetryable()).toBe(true);
      }
    });

    it("should classify authentication errors", async () => {
      const axiosError = {
        response: {
          status: 401,
          data: { error: { message: "Invalid API key" } },
        },
        isAxiosError: true,
      } as AxiosError;

      httpService.post.mockReturnValue(throwError(() => axiosError));

      try {
        await provider.generateText(
          mockModel,
          [{ role: "user", content: "test" }],
          {},
        );
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error.type).toBe(AIErrorType.INVALID_API_KEY);
        expect(error.isRetryable()).toBe(false);
      }
    });

    it("should classify timeout errors", async () => {
      const axiosError = {
        code: "ECONNABORTED",
        message: "timeout of 120000ms exceeded",
        isAxiosError: true,
      } as AxiosError;

      httpService.post.mockReturnValue(throwError(() => axiosError));

      try {
        await provider.generateText(
          mockModel,
          [{ role: "user", content: "test" }],
          {},
        );
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error.type).toBe(AIErrorType.TIMEOUT);
        expect(error.isRetryable()).toBe(true);
      }
    });
  });
});

describe("DallEProvider", () => {
  let provider: DallEProvider;
  let httpService: jest.Mocked<HttpService>;

  const mockModel: AiModelConfig = {
    id: "test-dalle",
    name: "DALL-E 3",
    displayName: "DALL-E 3",
    provider: "openai",
    modelId: "dall-e-3",
    modelType: "IMAGE" as any,
    apiKey: "test-api-key",
  };

  beforeEach(async () => {
    const mockHttpService = {
      post: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DallEProvider,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    provider = module.get<DallEProvider>(DallEProvider);
    httpService = module.get(HttpService);
  });

  describe("supportsModel", () => {
    it("should support DALL-E models", () => {
      expect(provider.supportsModel("dall-e-2")).toBe(true);
      expect(provider.supportsModel("dall-e-3")).toBe(true);
    });

    it("should not support non-DALL-E models", () => {
      expect(provider.supportsModel("imagen-3")).toBe(false);
      expect(provider.supportsModel("gpt-4")).toBe(false);
    });
  });

  describe("generateImage", () => {
    it("should generate image successfully", async () => {
      const mockBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const mockResponse: AxiosResponse = {
        data: {
          created: 1234567890,
          data: [
            {
              b64_json: mockBase64,
              revised_prompt: "A beautiful sunset",
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      const result = await provider.generateImage(mockModel, "A sunset", {
        aspectRatio: "16:9",
      });

      expect(result.images).toHaveLength(1);
      expect(result.images[0].base64).toBe(mockBase64);
      expect(result.images[0].mimeType).toBe("image/png");
      expect(result.images[0].width).toBe(1792);
      expect(result.images[0].height).toBe(1024);
    });

    it("should use correct size for aspect ratio", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: [{ b64_json: "test" }],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      // 16:9
      await provider.generateImage(mockModel, "test", { aspectRatio: "16:9" });
      expect(httpService.post).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ size: "1792x1024" }),
        expect.any(Object),
      );

      // 9:16
      await provider.generateImage(mockModel, "test", { aspectRatio: "9:16" });
      expect(httpService.post).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ size: "1024x1792" }),
        expect.any(Object),
      );

      // 1:1 (default)
      await provider.generateImage(mockModel, "test", {});
      expect(httpService.post).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ size: "1024x1024" }),
        expect.any(Object),
      );
    });

    it("should handle empty response", async () => {
      const mockResponse: AxiosResponse = {
        data: {
          data: [{}],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      httpService.post.mockReturnValue(of(mockResponse));

      await expect(
        provider.generateImage(mockModel, "test", {}),
      ).rejects.toThrow("No image data in DALL-E response");
    });
  });
});
