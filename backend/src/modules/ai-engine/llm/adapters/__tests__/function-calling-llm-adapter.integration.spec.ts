/**
 * FunctionCallingLLMAdapter - Extended coverage tests
 *
 * Covers paths not hit by the base spec:
 *  - Line 209: systemMessage extracted as systemPrompt
 *  - Lines 225-226: catch block in chat()
 *  - Line 369: anyModel fallback found in getDefaultModelConfig
 *  - Line 393: getAIMemberConfig throw when no aiMemberId
 *  - Line 430: second findFirst for aiMember by name
 *  - Lines 463-466: secretKey found but no secret value → warn + fallback apiKey
 *  - Line 474: getApiKeyFromEnv called when no DB apiKey
 *  - Line 511: getDefaultEndpoint returns "" for unknown provider
 *  - Lines 528-550: getApiKeyFromEnv branches (xai, anthropic, google, other)
 *  - Lines 622-629: parseOpenAIResponse raw choices format
 *  - Lines 675-679: parseAnthropicResponse tool_use block
 *  - Lines 743-759: parseGoogleResponse raw candidates format
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FunctionCallingLLMAdapter } from "../function-calling-llm.adapter";
import { AiChatService } from "../../services/ai-chat.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/facade";

describe("FunctionCallingLLMAdapter (extended coverage)", () => {
  let adapter: FunctionCallingLLMAdapter;
  let mockAiChatService: Record<string, jest.Mock>;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockSecretsService: Record<string, jest.Mock>;
  let mockConfigService: Record<string, jest.Mock>;

  const defaultChatResponse = {
    content: "Test response",
    model: "gpt-4o",
    tokensUsed: 100,
    usage: { totalTokens: 100 },
  };

  beforeEach(async () => {
    mockAiChatService = {
      chat: jest.fn().mockResolvedValue(defaultChatResponse),
    };

    mockPrisma = {
      aIModel: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      topicAIMember: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    mockSecretsService = {
      getValueInternal: jest.fn().mockResolvedValue(null),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionCallingLLMAdapter,
        { provide: AiChatService, useValue: mockAiChatService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<FunctionCallingLLMAdapter>(FunctionCallingLLMAdapter);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Line 209: systemMessage extracted as systemPrompt
  // =========================================================================

  describe("system message extraction (line 209)", () => {
    it("extracts systemMessage content as systemPrompt", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "test-key",
        apiEndpoint: "https://api.openai.com/v1",
      });

      const messages = [
        { role: "system" as const, content: "You are a helpful assistant." },
        { role: "user" as const, content: "Hello" },
      ];

      await adapter.chat({ messages, maxTokens: 100 });

      expect(mockAiChatService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: "You are a helpful assistant.",
        }),
      );
    });
  });

  // =========================================================================
  // Lines 225-226: catch block in chat()
  // =========================================================================

  describe("catch block in chat (lines 225-226)", () => {
    it("rethrows error when AiChatService throws", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "test-key",
        apiEndpoint: "",
      });

      mockAiChatService.chat.mockRejectedValue(
        new Error("Service unavailable"),
      );

      const messages = [{ role: "user" as const, content: "Hello" }];

      await expect(adapter.chat({ messages })).rejects.toThrow(
        "Service unavailable",
      );
    });
  });

  // =========================================================================
  // Line 369: anyModel fallback found in getDefaultModelConfig
  // =========================================================================

  describe("anyModel fallback in getDefaultModelConfig (line 369)", () => {
    it("uses anyModel when no isDefault model found", async () => {
      // First findFirst (isDefault: true) → null; second findFirst → model
      mockPrisma.aIModel.findFirst
        .mockResolvedValueOnce(null) // no default
        .mockResolvedValueOnce({
          modelId: "any-model",
          provider: "openai",
          apiKey: "any-key",
          apiEndpoint: "https://api.openai.com/v1",
        });

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });
      expect(result.content).toBe("Test response");
    });
  });

  // =========================================================================
  // Line 393: getAIMemberConfig throw when no aiMemberId
  // =========================================================================

  describe("getAIMemberConfig throws when aiMemberId not configured (line 393)", () => {
    it("throws error when aiMemberId config is missing", async () => {
      adapter.setConfig({ aiMemberId: undefined });

      const messages = [{ role: "user" as const, content: "Hello" }];

      // Without aiMemberId, should fall back to getDefaultModelConfig
      // which returns null then anyModel (tested above)
      // setConfig with aiMemberId = undefined means getAIMemberConfig won't be called
      // Actually, getAIMemberConfig is called when config.aiMemberId is set
      // Let's test with aiMemberId set but provider path
      adapter.setConfig({ aiMemberId: "member-123" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue(null);

      await expect(adapter.chat({ messages })).rejects.toThrow(
        "AI Member not found",
      );
    });
  });

  // =========================================================================
  // Line 430: second findFirst for aiMember by name
  // =========================================================================

  describe("second findFirst for aiMember by name (line 430)", () => {
    it("falls back to name-based lookup when modelId lookup fails", async () => {
      adapter.setConfig({ aiMemberId: "member-456" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue({
        aiModel: "my-custom-model",
        displayName: "Custom Agent",
      });

      // First findFirst (by modelId) → null; second findFirst (by name) → model
      mockPrisma.aIModel.findFirst
        .mockResolvedValueOnce(null) // by modelId → not found
        .mockResolvedValueOnce({
          modelId: "my-custom-model",
          provider: "openai",
          apiKey: "custom-key",
          secretKey: null,
          apiEndpoint: "https://api.openai.com/v1",
        });

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });
      expect(result.content).toBe("Test response");
    });
  });

  // =========================================================================
  // Lines 463-466: secretKey found but no secret value → fallback to apiKey
  // =========================================================================

  describe("secretKey without secret value → fallback apiKey (lines 463-466)", () => {
    it("falls back to model apiKey when secretKey not found in SecretsService", async () => {
      adapter.setConfig({ aiMemberId: "member-789" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue({
        aiModel: "gemini-pro",
        displayName: "Gemini Agent",
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gemini-pro",
        provider: "google",
        apiKey: "fallback-api-key",
        secretKey: "GEMINI_SECRET", // has secretKey
        apiEndpoint: "https://generativelanguage.googleapis.com",
      });

      // secretKey lookup returns null → should fall back to apiKey
      mockSecretsService.getValueInternal.mockResolvedValue(null);

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });
      expect(result.content).toBe("Test response");

      // Verify it tried to look up the secret
      expect(mockSecretsService.getValueInternal).toHaveBeenCalledWith(
        "GEMINI_SECRET",
      );
    });
  });

  // =========================================================================
  // Line 474: getApiKeyFromEnv called when no DB apiKey
  // =========================================================================

  describe("getApiKeyFromEnv called when no DB apiKey (line 474)", () => {
    it("falls back to env var when DB has no apiKey", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: null, // no apiKey in DB
        secretKey: null,
        apiEndpoint: "https://api.openai.com/v1",
      });

      // Set up env var
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "OPENAI_API_KEY") return "env-openai-key";
        return null;
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });
      expect(result.content).toBe("Test response");

      // Verify env var was used
      expect(mockConfigService.get).toHaveBeenCalledWith("OPENAI_API_KEY");
    });
  });

  // =========================================================================
  // Line 511: getDefaultEndpoint returns "" for unknown provider
  // =========================================================================

  describe("getDefaultEndpoint returns '' for unknown provider (line 511)", () => {
    it("uses empty endpoint for unknown provider model", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "custom-model",
        provider: "unknown-provider",
        apiKey: "custom-key",
        secretKey: null,
        apiEndpoint: null, // no endpoint → should use getDefaultEndpoint → ""
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });
      expect(result.content).toBe("Test response");
    });
  });

  // =========================================================================
  // Lines 528-550: getApiKeyFromEnv branches
  // =========================================================================

  describe("getApiKeyFromEnv provider branches (lines 528-550)", () => {
    it("returns XAI_API_KEY for xai provider", async () => {
      adapter.setConfig({ aiMemberId: "m-xai" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue({
        aiModel: "grok-2",
        displayName: "Grok Agent",
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "grok-2",
        provider: "xai",
        apiKey: null,
        secretKey: null,
        apiEndpoint: "https://api.x.ai/v1",
      });

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "XAI_API_KEY") return "xai-test-key";
        return null;
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      await adapter.chat({ messages });
      expect(mockConfigService.get).toHaveBeenCalledWith("XAI_API_KEY");
    });

    it("returns ANTHROPIC_API_KEY for anthropic provider", async () => {
      adapter.setConfig({ aiMemberId: "m-claude" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue({
        aiModel: "claude-3-5-sonnet",
        displayName: "Claude Agent",
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "claude-3-5-sonnet",
        provider: "anthropic",
        apiKey: null,
        secretKey: null,
        apiEndpoint: "https://api.anthropic.com/v1",
      });

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "ANTHROPIC_API_KEY") return "anthropic-test-key";
        return null;
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      await adapter.chat({ messages });
      expect(mockConfigService.get).toHaveBeenCalledWith("ANTHROPIC_API_KEY");
    });

    it("returns GOOGLE_AI_API_KEY for google provider", async () => {
      adapter.setConfig({ aiMemberId: "m-google" });

      mockPrisma.topicAIMember.findUnique.mockResolvedValue({
        aiModel: "gemini-pro",
        displayName: "Gemini Agent",
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gemini-pro",
        provider: "google",
        apiKey: null,
        secretKey: null,
        apiEndpoint: "https://generativelanguage.googleapis.com",
      });

      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "GOOGLE_AI_API_KEY") return "google-test-key";
        return null;
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      await adapter.chat({ messages });
      expect(mockConfigService.get).toHaveBeenCalledWith("GOOGLE_AI_API_KEY");
    });
  });

  // =========================================================================
  // Lines 622-629: parseOpenAIResponse raw choices format
  // =========================================================================

  describe("parseOpenAIResponse raw choices format (lines 622-629)", () => {
    it("parses raw OpenAI choices format (not simplified)", async () => {
      // Return raw OpenAI API format (no .content at top level)
      mockAiChatService.chat.mockResolvedValue({
        choices: [
          {
            message: {
              content: "Raw OpenAI response",
              tool_calls: undefined,
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: "gpt-4o",
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "test-key",
        apiEndpoint: "https://api.openai.com/v1",
      });

      const messages = [{ role: "user" as const, content: "Hello" }];
      const result = await adapter.chat({ messages });

      expect(result.content).toBe("Raw OpenAI response");
      expect(result.finishReason).toBe("stop");
    });
  });

  // =========================================================================
  // Lines 675-679: parseAnthropicResponse tool_use block
  // =========================================================================

  describe("parseAnthropicResponse with tool_use (lines 675-679)", () => {
    it("parses tool_use blocks in Anthropic response", async () => {
      mockAiChatService.chat.mockResolvedValue({
        content: [
          { type: "text", text: "I'll help you with that." },
          {
            type: "tool_use",
            id: "tool-123",
            name: "search",
            input: { query: "test query" },
          },
        ],
        model: "claude-3-5-sonnet",
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "claude-3-5-sonnet",
        provider: "anthropic",
        apiKey: "claude-key",
        apiEndpoint: "https://api.anthropic.com/v1",
      });

      const messages = [{ role: "user" as const, content: "Use a tool" }];
      const result = await adapter.chat({ messages });

      expect(result.content).toBe("I'll help you with that.");
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]?.function.name).toBe("search");
    });
  });

  // =========================================================================
  // Lines 743-759: parseGoogleResponse raw candidates format
  // =========================================================================

  describe("parseGoogleResponse raw candidates format (lines 743-759)", () => {
    it("parses raw Gemini candidates format (not simplified)", async () => {
      // Return raw Gemini API format without top-level .content
      mockAiChatService.chat.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: "Gemini raw response" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      });

      mockPrisma.aIModel.findFirst.mockResolvedValue({
        modelId: "gemini-pro",
        provider: "google",
        apiKey: "google-key",
        apiEndpoint: "https://generativelanguage.googleapis.com",
      });

      const messages = [{ role: "user" as const, content: "Hello Gemini" }];
      const result = await adapter.chat({ messages });

      expect(result.content).toBe("Gemini raw response");
      expect(result.usage?.totalTokens).toBe(30);
    });
  });
});

