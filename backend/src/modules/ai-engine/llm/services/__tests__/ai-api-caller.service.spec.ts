import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of } from "rxjs";
import { AiApiCallerService } from "../ai-api-caller.service";
import {
  safeReasoningEffort,
  isMinimalEffortSupported,
} from "../../types/task-profile.types";

// ==================== safeReasoningEffort / isMinimalEffortSupported ====================

describe("isMinimalEffortSupported", () => {
  it("returns true for gpt-5 (official API variant)", () => {
    expect(isMinimalEffortSupported("gpt-5")).toBe(true);
  });

  it("returns true for gpt-5o", () => {
    expect(isMinimalEffortSupported("gpt-5o")).toBe(true);
  });

  it("returns false for gpt-5.4-mini (BYOK variant with dot-digit suffix)", () => {
    expect(isMinimalEffortSupported("gpt-5.4-mini")).toBe(false);
  });

  it("returns true for o3-mini", () => {
    expect(isMinimalEffortSupported("o3-mini")).toBe(true);
  });

  it("returns true for o4-mini", () => {
    expect(isMinimalEffortSupported("o4-mini")).toBe(true);
  });

  it("returns true for gpt-4.1-mini", () => {
    expect(isMinimalEffortSupported("gpt-4.1-mini")).toBe(true);
  });

  it("returns true for gemini-2.5-flash-thinking", () => {
    expect(isMinimalEffortSupported("gemini-2.5-flash-thinking")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isMinimalEffortSupported(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isMinimalEffortSupported("")).toBe(false);
  });

  it("returns false for gpt-4o (non-reasoning model)", () => {
    expect(isMinimalEffortSupported("gpt-4o")).toBe(false);
  });
});

describe("safeReasoningEffort", () => {
  it("modelId=gpt-5, depth=minimal → effort=minimal (supported)", () => {
    expect(safeReasoningEffort("minimal", "gpt-5")).toBe("minimal");
  });

  it("modelId=gpt-5.4-mini, depth=minimal → effort=low (downgrade)", () => {
    expect(safeReasoningEffort("minimal", "gpt-5.4-mini")).toBe("low");
  });

  it("modelId undefined, depth=minimal → effort=low (conservative)", () => {
    expect(safeReasoningEffort("minimal", undefined)).toBe("low");
  });

  it("depth=moderate + modelId=gpt-5.4 → effort=medium (non-minimal unaffected)", () => {
    expect(safeReasoningEffort("moderate", "gpt-5.4")).toBe("medium");
  });

  it("depth=deep + any model → effort=high (non-minimal unaffected)", () => {
    expect(safeReasoningEffort("deep", "gpt-5.4-mini")).toBe("high");
  });

  it("depth=light + any model → effort=low (non-minimal unaffected)", () => {
    expect(safeReasoningEffort("light", "gpt-5.4-mini")).toBe("low");
  });

  it("depth undefined → effort=low (default fallback)", () => {
    expect(safeReasoningEffort(undefined, "gpt-5")).toBe("low");
  });
});

describe("AiApiCallerService", () => {
  let service: AiApiCallerService;
  let mockHttpService: jest.Mocked<Pick<HttpService, "post" | "get">>;

  const makeHttpResponse = (data: unknown) => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as any,
  });

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiApiCallerService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<AiApiCallerService>(AiApiCallerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== callOpenAICompatibleAPI ====================

  describe("callOpenAICompatibleAPI", () => {
    const messages = [{ role: "user" as const, content: "Hello" }];

    it("should call the API and return content", async () => {
      const apiResponse = {
        choices: [{ message: { content: "Hello back!" } }],
        usage: { total_tokens: 50 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
        0.7,
      );

      expect(result.content).toBe("Hello back!");
      expect(result.tokensUsed).toBe(50);
      expect(result.model).toBe("gpt-4o");
    });

    it("should use default endpoint if empty", async () => {
      const apiResponse = {
        choices: [{ message: { content: "OK" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "",
        "test-key",
        "gpt-4o",
        messages,
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("openai.com");
    });

    it("should add reasoning_effort=minimal when isReasoning=true no depth", async () => {
      // ★ 默认 minimal 是为了避免 gpt-5 系列 reasoning 吃光 max_completion_tokens
      //   导致 visible 输出空（OpenAI gpt-5 reasoning_tokens 不严格遵守限制）。
      const apiResponse = {
        choices: [{ message: { content: "reasoning" } }],
        usage: { total_tokens: 200 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o1-mini",
        messages,
        25000,
        undefined,
        120000,
        "max_completion_tokens",
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "low");
    });

    it("should map reasoningDepth=deep → reasoning_effort=high", async () => {
      const apiResponse = {
        choices: [{ message: { content: "reasoning" } }],
        usage: { total_tokens: 200 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o3-mini",
        messages,
        25000,
        undefined,
        120000,
        "max_completion_tokens",
        undefined,
        "deep", // reasoningDepth
        undefined,
        undefined,
        true, // isReasoning
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "high");
    });

    it("should send reasoning_effort for ANY DB-flagged reasoning model regardless of name", async () => {
      // ★ 防回归：模型每月新增，绝不依赖模型名 startsWith
      const apiResponse = {
        choices: [{ message: { content: "ok" } }],
        usage: { total_tokens: 100 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-5.4", // 名字不是 o1/o3/o4 开头，仍应走 reasoning 路径
        messages,
        25000,
        undefined,
        120000,
        "max_completion_tokens",
        undefined,
        undefined,
        undefined,
        undefined,
        true, // ★ isReasoning from DB config
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      // 没传 reasoningDepth → 默认 low（所有 reasoning 模型都接受的最低公分母）
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "low");
    });

    it("should NOT add reasoning_effort when isReasoning=false (default)", async () => {
      const apiResponse = {
        choices: [{ message: { content: "normal" } }],
        usage: { total_tokens: 100 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("reasoning_effort");
    });

    it("should NOT add reasoning_effort for o1 model when isReasoning param missing (DB not configured)", async () => {
      // ★ 用户责任：管理员要在 DB 把推理模型 isReasoning 设为 true，
      //   不配置就不传 reasoning_effort，模型走默认行为
      const apiResponse = {
        choices: [{ message: { content: "x" } }],
        usage: { total_tokens: 50 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o1-mini",
        messages,
        25000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("reasoning_effort");
    });

    it("should add json response_format when requested", async () => {
      const apiResponse = {
        choices: [{ message: { content: '{"key":"val"}' } }],
        usage: { total_tokens: 20 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
        0.7,
        120000,
        "max_tokens",
        "json",
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("response_format", {
        type: "json_object",
      });
    });

    it("should throw on API refusal", async () => {
      const apiResponse = {
        choices: [{ message: { refusal: "I cannot help with that" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await expect(
        service.callOpenAICompatibleAPI(
          "https://api.openai.com/v1/chat/completions",
          "test-key",
          "gpt-4o",
          messages,
          4000,
        ),
      ).rejects.toThrow("AI 拒绝响应");
    });

    it("should throw on empty content with finish_reason=length", async () => {
      const apiResponse = {
        choices: [{ message: { content: null }, finish_reason: "length" }],
        usage: { total_tokens: 4000, prompt_tokens: 3990 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await expect(
        service.callOpenAICompatibleAPI(
          "https://api.openai.com/v1/chat/completions",
          "test-key",
          "gpt-4o",
          messages,
          4000,
        ),
      ).rejects.toThrow("截断");
    });

    it("should throw for reasoning model token exhaustion", async () => {
      const apiResponse = {
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: {
          total_tokens: 1000,
          prompt_tokens: 100,
          completion_tokens: 1000,
          completion_tokens_details: { reasoning_tokens: 990 },
        },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await expect(
        service.callOpenAICompatibleAPI(
          "https://api.openai.com/v1/chat/completions",
          "test-key",
          "o1-mini",
          messages,
          1000,
        ),
      ).rejects.toThrow("推理模型");
    });

    it("should throw for unknown finish_reason with empty content", async () => {
      const apiResponse = {
        choices: [{ message: { content: "" }, finish_reason: "stop" }],
        usage: { total_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await expect(
        service.callOpenAICompatibleAPI(
          "https://api.openai.com/v1/chat/completions",
          "test-key",
          "gpt-4o",
          messages,
          4000,
        ),
      ).rejects.toThrow("AI 返回空响应");
    });

    it("should use custom tokenParamName", async () => {
      const apiResponse = {
        choices: [{ message: { content: "OK" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        8000,
        undefined,
        120000,
        "max_completion_tokens",
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("max_completion_tokens", 8000);
      expect(callArgs[1]).not.toHaveProperty("max_tokens");
    });

    it("should not include temperature when undefined", async () => {
      const apiResponse = {
        choices: [{ message: { content: "OK" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
        undefined,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("temperature");
    });

    it("should parse message text as fallback", async () => {
      const apiResponse = {
        choices: [{ message: { text: "Text response" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
      );

      expect(result.content).toBe("Text response");
    });

    // ==================== reasoningDepth tests ====================

    it("should use reasoningDepth='deep' as reasoning_effort='high' (isReasoning=true)", async () => {
      const apiResponse = {
        choices: [{ message: { content: "deep reasoning" } }],
        usage: { total_tokens: 500 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o3-mini",
        messages,
        32000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        "deep",
        undefined,
        undefined,
        true, // isReasoning
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "high");
    });

    it("should use reasoningDepth='moderate' as reasoning_effort='medium'", async () => {
      const apiResponse = {
        choices: [{ message: { content: "moderate" } }],
        usage: { total_tokens: 300 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o1",
        messages,
        25000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        "moderate",
        undefined,
        undefined,
        true, // isReasoning
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "medium");
    });

    it("should fallback to reasoning_effort=minimal when no reasoningDepth (isReasoning=true)", async () => {
      const apiResponse = {
        choices: [{ message: { content: "minimal" } }],
        usage: { total_tokens: 200 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o3",
        messages,
        25000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "low");
    });

    it("should send reasoning_effort for any DB-flagged reasoning model (no model name match)", async () => {
      const apiResponse = {
        choices: [{ message: { content: "ok" } }],
        usage: { total_tokens: 100 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "o4-mini",
        messages,
        25000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        "deep",
        undefined,
        undefined,
        true, // ★ DB-driven, not model-name pattern
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "high");
    });

    it("should downgrade minimal → low for unsupported model (gpt-5.4-mini)", async () => {
      // gpt-5.4-mini is a BYOK variant that does NOT support 'minimal'
      // safeReasoningEffort should downgrade it to 'low'
      const apiResponse = {
        choices: [{ message: { content: "downgraded" } }],
        usage: { total_tokens: 100 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-5.4-mini",
        messages,
        25000,
        undefined,
        120000,
        "max_completion_tokens",
        undefined,
        "minimal", // depth=minimal → triggers downgrade for this model
        undefined,
        undefined,
        true,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "low");
    });

    it("should keep minimal for model that supports it (gpt-5)", async () => {
      const apiResponse = {
        choices: [{ message: { content: "minimal ok" } }],
        usage: { total_tokens: 100 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-5",
        messages,
        25000,
        undefined,
        120000,
        "max_completion_tokens",
        undefined,
        "minimal",
        undefined,
        undefined,
        true,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("reasoning_effort", "minimal");
    });

    // ==================== outputSchema (Strict Structured Output) tests ====================

    it("should use json_schema response_format when outputSchema is provided", async () => {
      const apiResponse = {
        choices: [{ message: { content: '{"name":"test"}' } }],
        usage: { total_tokens: 20 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      };

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
        0.7,
        120000,
        "max_tokens",
        undefined, // responseFormat
        undefined, // reasoningDepth
        { type: "json_schema", schema },
        true, // schemaStrict
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1].response_format).toEqual({
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema,
          strict: true,
        },
      });
    });

    it("should prefer outputSchema over responseFormat='json'", async () => {
      const apiResponse = {
        choices: [{ message: { content: '{"k":"v"}' } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const schema = { type: "object", properties: {} };

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "test-key",
        "gpt-4o",
        messages,
        4000,
        0.7,
        120000,
        "max_tokens",
        "json", // responseFormat
        undefined,
        { type: "json_schema", schema }, // outputSchema takes precedence
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1].response_format.type).toBe("json_schema");
    });
  });

  // ==================== callAnthropicAPI ====================

  describe("callAnthropicAPI", () => {
    const messages = [
      { role: "system" as const, content: "You are a helper" },
      { role: "user" as const, content: "Hello" },
    ];

    it("should call Anthropic API and return content", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "Hello from Claude" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-3-5-sonnet-20241022",
        messages,
        4000,
        0.7,
      );

      expect(result.content).toBe("Hello from Claude");
      expect(result.tokensUsed).toBe(30);
      expect(result.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("should use default anthropic endpoint if empty", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "OK" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callAnthropicAPI(
        "",
        "test-key",
        "claude-3-5-sonnet-20241022",
        messages,
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("anthropic.com");
    });

    it("should separate system messages from conversation", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "OK" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-3-5-sonnet-20241022",
        messages,
        4000,
        0.7,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      const body = callArgs[1];
      expect(body.system).toBe("You are a helper");
      expect(body.messages).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ role: "system" })]),
      );
    });

    it("should handle json format warning gracefully", async () => {
      const apiResponse = {
        content: [{ type: "text", text: '{"result": "ok"}' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-3-5-sonnet-20241022",
        [{ role: "user", content: "return json" }],
        4000,
        0.7,
        120000,
        "json",
      );

      expect(result.content).toBeDefined();
    });

    it("should not include temperature when undefined", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "OK" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-3-5-sonnet-20241022",
        [{ role: "user", content: "Hello" }],
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty("temperature");
    });

    // ==================== cachePolicy tests ====================

    it("should wrap system message with cache_control when cachePolicy is auto", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "cached response" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-sonnet-4-20250514",
        messages,
        4000,
        0.7,
        120000,
        undefined, // responseFormat
        undefined, // reasoningDepth
        "auto", // cachePolicy
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      const body = callArgs[1];
      expect(Array.isArray(body.system)).toBe(true);
      expect(body.system[0]).toEqual({
        type: "text",
        text: "You are a helper",
        cache_control: { type: "ephemeral" },
      });
    });

    it("should use plain string system when cachePolicy is not set", async () => {
      const apiResponse = {
        content: [{ type: "text", text: "no cache" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callAnthropicAPI(
        "https://api.anthropic.com/v1/messages",
        "test-key",
        "claude-sonnet-4-20250514",
        messages,
        4000,
        0.7,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      const body = callArgs[1];
      expect(typeof body.system).toBe("string");
      expect(body.system).toBe("You are a helper");
    });
  });

  // ==================== callGoogleAPI ====================

  describe("callGoogleAPI", () => {
    const messages = [
      { role: "system" as const, content: "You are helpful" },
      { role: "user" as const, content: "What is AI?" },
    ];

    it("should call Google API and return content", async () => {
      const apiResponse = {
        candidates: [
          {
            content: { parts: [{ text: "AI is artificial intelligence" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
        },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callGoogleAPI(
        "https://generativelanguage.googleapis.com/v1beta",
        "test-key",
        "gemini-2.0-flash",
        messages,
        4000,
        0.7,
      );

      expect(result.content).toBe("AI is artificial intelligence");
      expect(result.tokensUsed).toBe(30);
    });

    it("should return safety message for blocked content", async () => {
      const apiResponse = {
        candidates: [
          {
            finishReason: "SAFETY",
          },
        ],
        usageMetadata: {},
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callGoogleAPI(
        "https://generativelanguage.googleapis.com/v1beta",
        "test-key",
        "gemini-2.0-flash",
        messages,
        4000,
      );

      expect(result.content).toContain("cannot provide");
      expect(result.tokensUsed).toBe(0);
    });

    it("should build URL with /models prefix", async () => {
      const apiResponse = {
        candidates: [
          {
            content: { parts: [{ text: "OK" }] },
          },
        ],
        usageMetadata: {},
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callGoogleAPI(
        "https://generativelanguage.googleapis.com/v1beta/models",
        "test-key",
        "gemini-2.0-flash",
        messages,
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("gemini-2.0-flash:generateContent");
    });

    it("should add json mime type when responseFormat=json", async () => {
      const apiResponse = {
        candidates: [
          {
            content: { parts: [{ text: '{"key":"val"}' }] },
          },
        ],
        usageMetadata: {},
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callGoogleAPI(
        "https://generativelanguage.googleapis.com/v1beta",
        "test-key",
        "gemini-2.0-flash",
        messages,
        4000,
        0.7,
        120000,
        "json",
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1].generationConfig).toHaveProperty(
        "responseMimeType",
        "application/json",
      );
    });

    it("should handle URL with :generateContent already", async () => {
      const apiResponse = {
        candidates: [
          {
            content: { parts: [{ text: "OK" }] },
          },
        ],
        usageMetadata: {},
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callGoogleAPI(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        "test-key",
        "gemini-pro",
        messages,
        4000,
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain(":generateContent?key=");
    });
  });

  // ==================== callXAIAPI ====================

  describe("callXAIAPI", () => {
    const messages = [{ role: "user" as const, content: "Hello Grok" }];

    it("should call xAI API and return content", async () => {
      const apiResponse = {
        choices: [{ message: { content: "Hello from Grok" } }],
        usage: { total_tokens: 30 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callXAIAPI(
        "https://api.x.ai/v1/chat/completions",
        "test-key",
        "grok-2",
        messages,
        4000,
        0.7,
      );

      expect(result.content).toBe("Hello from Grok");
      expect(result.tokensUsed).toBe(30);
    });

    it("should use default xAI endpoint if empty", async () => {
      const apiResponse = {
        choices: [{ message: { content: "OK" } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callXAIAPI("", "test-key", "grok-2", messages, 4000);

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("api.x.ai");
    });

    it("should add json response_format", async () => {
      const apiResponse = {
        choices: [{ message: { content: '{"key":"val"}' } }],
        usage: { total_tokens: 10 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callXAIAPI(
        "https://api.x.ai/v1/chat/completions",
        "test-key",
        "grok-2",
        messages,
        4000,
        0.7,
        120000,
        "max_tokens",
        "json",
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("response_format", {
        type: "json_object",
      });
    });
  });

  // ==================== Embedding APIs ====================

  describe("callOpenAICompatibleEmbeddingAPI", () => {
    it("should return embeddings", async () => {
      const apiResponse = {
        data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
        usage: { total_tokens: 20 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callOpenAICompatibleEmbeddingAPI(
        "https://api.openai.com/v1",
        "test-key",
        "text-embedding-3-large",
        ["Hello", "World"],
      );

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.totalTokens).toBe(20);
    });

    it("should append /embeddings if missing", async () => {
      const apiResponse = {
        data: [{ embedding: [0.1] }],
        usage: { total_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleEmbeddingAPI(
        "https://api.openai.com/v1",
        "test-key",
        "text-embedding-3-large",
        ["test"],
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("/embeddings");
    });

    it("should not double-append /embeddings", async () => {
      const apiResponse = {
        data: [{ embedding: [0.1] }],
        usage: { total_tokens: 5 },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callOpenAICompatibleEmbeddingAPI(
        "https://api.openai.com/v1/embeddings",
        "test-key",
        "text-embedding-3-large",
        ["test"],
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe("https://api.openai.com/v1/embeddings");
    });
  });

  describe("callGoogleEmbeddingAPI", () => {
    it("should return Google embeddings", async () => {
      const apiResponse = {
        embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callGoogleEmbeddingAPI(
        "https://generativelanguage.googleapis.com/v1beta",
        "test-key",
        "text-embedding-004",
        ["Hello", "World"],
      );

      expect(result.embeddings).toHaveLength(2);
      expect(result.totalTokens).toBe(0); // Google doesn't return token count
    });

    it("should normalize URL by stripping trailing /models", async () => {
      const apiResponse = { embeddings: [{ values: [0.1] }] };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callGoogleEmbeddingAPI(
        "https://generativelanguage.googleapis.com/v1beta/models/",
        "test-key",
        "text-embedding-004",
        ["test"],
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("text-embedding-004:batchEmbedContents");
      expect(callArgs[0]).not.toContain("models/models");
    });
  });

  describe("callCohereEmbeddingAPI", () => {
    it("should return Cohere embeddings", async () => {
      const apiResponse = {
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        meta: { billed_units: { input_tokens: 15 } },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      const result = await service.callCohereEmbeddingAPI(
        "https://api.cohere.com/v1",
        "test-key",
        "embed-english-v3.0",
        ["Hello", "World"],
      );

      expect(result.embeddings).toHaveLength(2);
      expect(result.totalTokens).toBe(15);
    });

    it("should append /embed if missing", async () => {
      const apiResponse = {
        embeddings: [[0.1]],
        meta: { billed_units: { input_tokens: 5 } },
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callCohereEmbeddingAPI(
        "https://api.cohere.com/v1",
        "test-key",
        "embed-english-v3.0",
        ["test"],
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain("/embed");
    });

    it("should use custom input_type", async () => {
      const apiResponse = {
        embeddings: [[0.1]],
        meta: {},
      };
      mockHttpService.post.mockReturnValueOnce(
        of(makeHttpResponse(apiResponse)) as any,
      );

      await service.callCohereEmbeddingAPI(
        "https://api.cohere.com/v1",
        "test-key",
        "embed-english-v3.0",
        ["query text"],
        "search_query",
      );

      const callArgs = (mockHttpService.post as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toHaveProperty("input_type", "search_query");
    });
  });
});

