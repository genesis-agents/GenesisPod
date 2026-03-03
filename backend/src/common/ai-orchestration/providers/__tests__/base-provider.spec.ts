/**
 * BaseProvider, BaseTextProvider, BaseImageProvider — Tests
 *
 * Coverage targets (36.76% → ~70%+):
 * - BaseProvider.post(): success path, AIError rethrow, non-AIError fallback via classifier
 * - BaseProvider.handleHttpError(): all HTTP status branches (429, 401, 403, 400, 500+, ECONNABORTED, ETIMEDOUT, ENOTFOUND, ECONNREFUSED, unknown)
 * - BaseProvider.buildSuccessResult() with and without images
 * - BaseProvider.buildErrorResult()
 * - BaseProvider.healthCheck() returns true
 * - BaseTextProvider.execute(): success, retryable error rethrow, non-retryable error buildErrorResult
 * - BaseTextProvider.buildMessages(): systemPrompt only, messages only, prompt only, prompt + messages (ignored), no inputs
 * - BaseImageProvider.execute(): success with url image, success with base64, empty prompt error, retryable error, non-retryable error
 */

import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosError } from "axios";
import {
  BaseProvider,
  BaseTextProvider,
  BaseImageProvider,
} from "../base-provider";
import {
  AiCallInput,
  AiCallResult,
  AiModelConfig,
  AiTaskType,
} from "../../types";
import { AIError, AIErrorType } from "../../error-classifier";
import {
  ChatMessage,
  TextGenerationOptions,
  TextGenerationResult,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "../ai-provider.interface";

// ── Concrete implementations for testing ─────────────────────────────────────

class TestProvider extends BaseProvider {
  readonly providerId = "test-provider";
  readonly displayName = "Test Provider";

  supportsModel(_modelId: string): boolean {
    return true;
  }

  execute(_model: AiModelConfig, _input: AiCallInput): Promise<AiCallResult> {
    throw new Error("Not implemented in test");
  }

  // Expose protected methods for testing
  async callPost<T>(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    timeoutMs?: number,
  ): Promise<T> {
    return this.post<T>(url, body, headers, timeoutMs);
  }

  callHandleHttpError(error: AxiosError): AIError {
    return this.handleHttpError(error);
  }

  callBuildSuccessResult(
    model: AiModelConfig,
    content: string,
    tokensUsed: number,
    startTime: number,
    images?: AiCallResult["images"],
  ): AiCallResult {
    return this.buildSuccessResult(
      model,
      content,
      tokensUsed,
      startTime,
      images,
    );
  }

  callBuildErrorResult(
    model: AiModelConfig,
    error: AIError,
    startTime: number,
  ): AiCallResult {
    return this.buildErrorResult(model, error, startTime);
  }
}

class TestTextProvider extends BaseTextProvider {
  readonly providerId = "test-text";
  readonly displayName = "Test Text Provider";

  supportsModel(_modelId: string): boolean {
    return true;
  }

  generateText = jest.fn();

  callBuildMessages(input: AiCallInput): ChatMessage[] {
    return this.buildMessages(input);
  }
}

class TestImageProvider extends BaseImageProvider {
  readonly providerId = "test-image";
  readonly displayName = "Test Image Provider";

  supportsModel(_modelId: string): boolean {
    return true;
  }

  generateImage = jest.fn();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHttpService(): jest.Mocked<HttpService> {
  return {
    post: jest.fn(),
    get: jest.fn(),
  } as unknown as jest.Mocked<HttpService>;
}

function makeModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
  return {
    id: "model-1",
    name: "gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    modelId: "gpt-4o",
    modelType: "CHAT" as AiModelConfig["modelType"],
    apiKey: "sk-test",
    ...overrides,
  };
}

function makeAxiosError(
  status?: number,
  code?: string,
  message = "Error",
  errorMessage?: string,
): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.code = code;
  if (status !== undefined) {
    error.response = {
      status,
      statusText: "Error",
      data: errorMessage ? { error: { message: errorMessage } } : {},
      headers: {},
      config: {} as AxiosError["response"]["config"],
    };
  }
  return error;
}

// ── Tests: BaseProvider ───────────────────────────────────────────────────────

describe("BaseProvider", () => {
  let httpService: jest.Mocked<HttpService>;
  let provider: TestProvider;

  beforeEach(() => {
    httpService = makeHttpService();
    provider = new TestProvider(httpService);
  });

  describe("healthCheck()", () => {
    it("returns true by default", async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe("post()", () => {
    it("returns response data on success", async () => {
      const responseData = { result: "success", items: [1, 2, 3] };
      httpService.post.mockReturnValue(
        of({
          data: responseData,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as unknown,
        }),
      );

      const result = await provider.callPost<typeof responseData>(
        "https://api.example.com/endpoint",
        { query: "test" },
        { Authorization: "Bearer token" },
      );

      expect(result).toEqual(responseData);
      expect(httpService.post).toHaveBeenCalledWith(
        "https://api.example.com/endpoint",
        { query: "test" },
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer token",
          }),
        }),
      );
    });

    it("rethrows AIError directly", async () => {
      const aiError = new AIError(AIErrorType.RATE_LIMIT, "Rate limited");
      httpService.post.mockReturnValue(throwError(() => aiError));

      await expect(
        provider.callPost("https://api.example.com", {}, {}),
      ).rejects.toBeInstanceOf(AIError);
    });

    it("classifies non-AIError via errorClassifier", async () => {
      const genericError = new Error("Generic failure");
      httpService.post.mockReturnValue(throwError(() => genericError));

      await expect(
        provider.callPost("https://api.example.com", {}, {}),
      ).rejects.toBeInstanceOf(AIError);
    });

    it("uses provided timeoutMs", async () => {
      const responseData = { ok: true };
      httpService.post.mockReturnValue(
        of({
          data: responseData,
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as unknown,
        }),
      );

      await provider.callPost("https://api.example.com", {}, {}, 5000);

      expect(httpService.post).toHaveBeenCalled();
    });
  });

  describe("handleHttpError()", () => {
    it("returns RATE_LIMIT error for 429", () => {
      const error = makeAxiosError(429, undefined, "Too Many Requests");
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.RATE_LIMIT);
      expect(result.message).toContain("Rate limit exceeded");
    });

    it("returns RATE_LIMIT with custom message for 429", () => {
      const error = makeAxiosError(
        429,
        undefined,
        "Rate limited",
        "Custom rate limit message",
      );
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.RATE_LIMIT);
      expect(result.message).toContain("Custom rate limit message");
    });

    it("returns INVALID_API_KEY for 401", () => {
      const error = makeAxiosError(401);
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.INVALID_API_KEY);
      expect(result.message).toContain("Authentication failed");
    });

    it("returns INVALID_API_KEY for 403", () => {
      const error = makeAxiosError(403);
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.INVALID_API_KEY);
      expect(result.message).toContain("Authentication failed");
    });

    it("returns INVALID_REQUEST for 400", () => {
      const error = makeAxiosError(
        400,
        undefined,
        "Bad Request",
        "Invalid parameter",
      );
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.INVALID_REQUEST);
      expect(result.message).toContain("Invalid parameter");
    });

    it("returns TEMPORARY_UNAVAILABLE for 500", () => {
      const error = makeAxiosError(500);
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.TEMPORARY_UNAVAILABLE);
      expect(result.message).toContain("Service error");
    });

    it("returns TEMPORARY_UNAVAILABLE for 502", () => {
      const error = makeAxiosError(502);
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.TEMPORARY_UNAVAILABLE);
    });

    it("returns TEMPORARY_UNAVAILABLE for 503", () => {
      const error = makeAxiosError(503);
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.TEMPORARY_UNAVAILABLE);
    });

    it("returns TIMEOUT for ECONNABORTED", () => {
      const error = makeAxiosError(
        undefined,
        "ECONNABORTED",
        "Request aborted",
      );
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.TIMEOUT);
      expect(result.message).toBe("Request timed out");
    });

    it("returns TIMEOUT for ETIMEDOUT", () => {
      const error = makeAxiosError(undefined, "ETIMEDOUT", "Request timed out");
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.TIMEOUT);
    });

    it("returns NETWORK_ERROR for ENOTFOUND", () => {
      const error = makeAxiosError(undefined, "ENOTFOUND", "DNS lookup failed");
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.NETWORK_ERROR);
      expect(result.message).toContain("Network error");
    });

    it("returns NETWORK_ERROR for ECONNREFUSED", () => {
      const error = makeAxiosError(
        undefined,
        "ECONNREFUSED",
        "Connection refused",
      );
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.NETWORK_ERROR);
    });

    it("returns UNKNOWN for unrecognized error", () => {
      const error = makeAxiosError(undefined, undefined, "Unexpected error");
      const result = provider.callHandleHttpError(error);

      expect(result.type).toBe(AIErrorType.UNKNOWN);
      expect(result.message).toContain("Unknown error");
    });

    it("uses default message when data.error.message is absent (429)", () => {
      const error = makeAxiosError(429, undefined, "Too Many Requests");
      const result = provider.callHandleHttpError(error);

      expect(result.message).toContain("Too many requests");
    });

    it("uses default message when data.error.message is absent (400)", () => {
      const error = makeAxiosError(400, undefined, "Bad Request");
      const result = provider.callHandleHttpError(error);

      expect(result.message).toContain("Bad request");
    });
  });

  describe("buildSuccessResult()", () => {
    it("builds correct success result", () => {
      const model = makeModel();
      const startTime = Date.now() - 100;

      const result = provider.callBuildSuccessResult(
        model,
        "Generated content",
        1500,
        startTime,
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe("Generated content");
      expect(result.model).toBe("gpt-4o");
      expect(result.provider).toBe("openai");
      expect(result.tokensUsed).toBe(1500);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.images).toBeUndefined();
    });

    it("includes images in success result", () => {
      const model = makeModel();
      const images: AiCallResult["images"] = [
        {
          url: "https://example.com/img.png",
          width: 1024,
          height: 1024,
          mimeType: "image/png",
        },
      ];

      const result = provider.callBuildSuccessResult(
        model,
        "![image](https://example.com/img.png)",
        0,
        Date.now() - 50,
        images,
      );

      expect(result.success).toBe(true);
      expect(result.images).toEqual(images);
    });
  });

  describe("buildErrorResult()", () => {
    it("builds correct error result", () => {
      const model = makeModel();
      const error = new AIError(AIErrorType.RATE_LIMIT, "Rate limit hit");
      const startTime = Date.now() - 200;

      const result = provider.callBuildErrorResult(model, error, startTime);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rate limit hit");
      expect(result.errorType).toBe(AIErrorType.RATE_LIMIT);
      expect(result.model).toBe("gpt-4o");
      expect(result.provider).toBe("openai");
      expect(result.tokensUsed).toBe(0);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Tests: BaseTextProvider ───────────────────────────────────────────────────

describe("BaseTextProvider", () => {
  let httpService: jest.Mocked<HttpService>;
  let provider: TestTextProvider;

  beforeEach(() => {
    httpService = makeHttpService();
    provider = new TestTextProvider(httpService);
    provider.generateText.mockReset();
  });

  describe("execute()", () => {
    it("returns success result when generateText succeeds", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        prompt: "Hello",
      };

      provider.generateText.mockResolvedValue({
        content: "Hello! How can I help?",
        tokensUsed: 42,
      } as TextGenerationResult);

      const result = await provider.execute(model, input);

      expect(result.success).toBe(true);
      expect(result.content).toBe("Hello! How can I help?");
      expect(result.tokensUsed).toBe(42);
    });

    it("rethrows retryable error (RATE_LIMIT)", async () => {
      const model = makeModel();
      const input: AiCallInput = { taskType: AiTaskType.CHAT, prompt: "Hi" };

      provider.generateText.mockRejectedValue(
        new AIError(AIErrorType.RATE_LIMIT, "Rate limited"),
      );

      await expect(provider.execute(model, input)).rejects.toBeInstanceOf(
        AIError,
      );
    });

    it("rethrows retryable error (TIMEOUT)", async () => {
      const model = makeModel();
      const input: AiCallInput = { taskType: AiTaskType.CHAT, prompt: "Hi" };

      provider.generateText.mockRejectedValue(
        new AIError(AIErrorType.TIMEOUT, "Timed out"),
      );

      await expect(provider.execute(model, input)).rejects.toBeInstanceOf(
        AIError,
      );
    });

    it("rethrows retryable error (NETWORK_ERROR)", async () => {
      const model = makeModel();
      const input: AiCallInput = { taskType: AiTaskType.CHAT, prompt: "Hi" };

      provider.generateText.mockRejectedValue(
        new AIError(AIErrorType.NETWORK_ERROR, "Network error"),
      );

      await expect(provider.execute(model, input)).rejects.toBeInstanceOf(
        AIError,
      );
    });

    it("returns error result for non-retryable error (INVALID_REQUEST)", async () => {
      const model = makeModel();
      const input: AiCallInput = { taskType: AiTaskType.CHAT, prompt: "Hi" };

      provider.generateText.mockRejectedValue(
        new AIError(AIErrorType.INVALID_REQUEST, "Bad request"),
      );

      const result = await provider.execute(model, input);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(AIErrorType.INVALID_REQUEST);
    });

    it("classifies non-AIError and returns error result for non-retryable", async () => {
      const model = makeModel();
      const input: AiCallInput = { taskType: AiTaskType.CHAT, prompt: "Hi" };

      provider.generateText.mockRejectedValue(new Error("Unexpected error"));

      const result = await provider.execute(model, input);

      expect(result.success).toBe(false);
    });

    it("passes maxTokens and temperature from input to options", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        prompt: "Hi",
        maxTokens: 2000,
        temperature: 0.5,
      };

      provider.generateText.mockResolvedValue({
        content: "Reply",
        tokensUsed: 100,
      } as TextGenerationResult);

      await provider.execute(model, input);

      const options = provider.generateText.mock
        .calls[0][2] as TextGenerationOptions;
      expect(options.maxTokens).toBe(2000);
      expect(options.temperature).toBe(0.5);
    });
  });

  describe("buildMessages()", () => {
    it("includes system prompt when present", () => {
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        systemPrompt: "You are helpful.",
        prompt: "Hello",
      };

      const messages = provider.callBuildMessages(input);

      expect(messages[0]).toEqual({
        role: "system",
        content: "You are helpful.",
      });
    });

    it("includes messages array when provided", () => {
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi!" },
          { role: "user", content: "How are you?" },
        ],
      };

      const messages = provider.callBuildMessages(input);

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    });

    it("adds prompt as user message when no messages array", () => {
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        prompt: "What is AI?",
      };

      const messages = provider.callBuildMessages(input);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: "user", content: "What is AI?" });
    });

    it("ignores prompt when messages array is provided", () => {
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        prompt: "This should be ignored",
        messages: [{ role: "user", content: "Use this instead" }],
      };

      const messages = provider.callBuildMessages(input);

      // prompt should not be added because messages is non-empty
      expect(
        messages.every((m) => m.content !== "This should be ignored"),
      ).toBe(true);
    });

    it("returns empty array when no inputs", () => {
      const input: AiCallInput = { taskType: AiTaskType.CHAT };

      const messages = provider.callBuildMessages(input);

      expect(messages).toHaveLength(0);
    });

    it("combines systemPrompt + messages", () => {
      const input: AiCallInput = {
        taskType: AiTaskType.CHAT,
        systemPrompt: "System context",
        messages: [{ role: "user", content: "Question" }],
      };

      const messages = provider.callBuildMessages(input);

      expect(messages[0]).toEqual({
        role: "system",
        content: "System context",
      });
      expect(messages[1]).toEqual({ role: "user", content: "Question" });
    });
  });
});

// ── Tests: BaseImageProvider ──────────────────────────────────────────────────

describe("BaseImageProvider", () => {
  let httpService: jest.Mocked<HttpService>;
  let provider: TestImageProvider;

  beforeEach(() => {
    httpService = makeHttpService();
    provider = new TestImageProvider(httpService);
    provider.generateImage.mockReset();
  });

  describe("execute()", () => {
    it("returns success result with URL image", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: "A beautiful sunset",
      };

      provider.generateImage.mockResolvedValue({
        images: [
          {
            url: "https://cdn.example.com/image.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        ],
      } as ImageGenerationResult);

      const result = await provider.execute(model, input);

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(1);
      expect(result.images![0].url).toBe("https://cdn.example.com/image.png");
      expect(result.content).toContain("![Generated Image]");
    });

    it("returns success result with base64 image (no url)", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: "Abstract art",
      };

      provider.generateImage.mockResolvedValue({
        images: [{ base64: "base64encodeddata", mimeType: "image/png" }],
      } as ImageGenerationResult);

      const result = await provider.execute(model, input);

      expect(result.success).toBe(true);
      expect(result.content).toContain(
        "data:image/png;base64,base64encodeddata",
      );
    });

    it("throws INVALID_REQUEST when no prompt provided", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        // no prompt, no messages
      };

      // Non-retryable error → returns error result (not throws)
      const result = await provider.execute(model, input);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(AIErrorType.INVALID_REQUEST);
    });

    it("extracts prompt from last message when no explicit prompt", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        messages: [
          { role: "user", content: "Earlier message" },
          { role: "user", content: "Draw a cat" },
        ],
      };

      provider.generateImage.mockResolvedValue({
        images: [{ url: "https://example.com/cat.png", mimeType: "image/png" }],
      } as ImageGenerationResult);

      const result = await provider.execute(model, input);

      expect(result.success).toBe(true);
      const [, promptArg] = provider.generateImage.mock.calls[0];
      expect(promptArg).toBe("Draw a cat");
    });

    it("rethrows retryable error (TEMPORARY_UNAVAILABLE)", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: "A test image",
      };

      provider.generateImage.mockRejectedValue(
        new AIError(AIErrorType.TEMPORARY_UNAVAILABLE, "Service down"),
      );

      await expect(provider.execute(model, input)).rejects.toBeInstanceOf(
        AIError,
      );
    });

    it("returns error result for non-retryable error (CONTENT_FILTERED)", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: "Filtered content",
      };

      provider.generateImage.mockRejectedValue(
        new AIError(AIErrorType.CONTENT_FILTERED, "Content filtered"),
      );

      const result = await provider.execute(model, input);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe(AIErrorType.CONTENT_FILTERED);
    });

    it("passes imageOptions to generateImage", async () => {
      const model = makeModel();
      const input: AiCallInput = {
        taskType: AiTaskType.IMAGE_GENERATION,
        prompt: "A wide image",
        imageOptions: { aspectRatio: "16:9", style: "vivid" },
      };

      provider.generateImage.mockResolvedValue({
        images: [
          { url: "https://example.com/wide.png", mimeType: "image/png" },
        ],
      } as ImageGenerationResult);

      await provider.execute(model, input);

      const [, , options] = provider.generateImage.mock.calls[0];
      expect((options as ImageGenerationOptions).aspectRatio).toBe("16:9");
      expect((options as ImageGenerationOptions).style).toBe("vivid");
      expect((options as ImageGenerationOptions).numberOfImages).toBe(1);
    });
  });
});
