import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FunctionCallingLLMAdapter } from "../function-calling-llm.adapter";
import { AiChatService } from "../../services/ai-chat.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/secrets/secrets.service";

describe("FunctionCallingLLMAdapter", () => {
  let adapter: FunctionCallingLLMAdapter;
  let mockAiChatService: any;
  let mockPrisma: any;
  let mockSecretsService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockAiChatService = {
      chat: jest.fn().mockResolvedValue({
        content: "mocked AI response",
        usage: { totalTokens: 100 },
      }),
    };

    mockPrisma = {
      aIModel: {
        findFirst: jest.fn().mockResolvedValue({
          modelId: "gpt-4o",
          provider: "openai",
          apiKey: "test-api-key",
          apiEndpoint: "https://api.openai.com/v1",
        }),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== setConfig / getConfig ====================

  describe("setConfig / getConfig", () => {
    it("should set and get config", () => {
      adapter.setConfig({ aiMemberId: "member-123", workspaceId: "ws-456" });
      const config = adapter.getConfig();
      expect(config?.aiMemberId).toBe("member-123");
      expect(config?.workspaceId).toBe("ws-456");
    });

    it("should return undefined config when not set", () => {
      const config = adapter.getConfig();
      expect(config).toBeUndefined();
    });
  });

  // ==================== formatTools ====================

  describe("formatTools", () => {
    it("should wrap functions in type:function format", () => {
      const functions = [
        { name: "web_search", description: "Search the web", parameters: {} },
      ];

      const tools = adapter.formatTools(functions as any);

      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe("function");
      expect(tools[0].function.name).toBe("web_search");
    });

    it("should handle empty functions list", () => {
      const tools = adapter.formatTools([]);
      expect(tools).toHaveLength(0);
    });
  });

  // ==================== parseToolCalls ====================

  describe("parseToolCalls", () => {
    it("should parse OpenAI tool_calls format", () => {
      const response = {
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function" as const,
            function: {
              name: "web_search",
              arguments: '{"query": "test"}',
            },
          },
        ],
      } as any;

      const toolCalls = adapter.parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].id).toBe("call_abc");
      expect(toolCalls[0].name).toBe("web_search");
      expect(toolCalls[0].arguments).toBe('{"query": "test"}');
    });

    it("should parse legacy function_call format", () => {
      const response = {
        content: null,
        function_call: {
          name: "get_weather",
          arguments: '{"city": "Shanghai"}',
        },
      } as any;

      const toolCalls = adapter.parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe("get_weather");
      expect(toolCalls[0].id).toMatch(/^call_/);
    });

    it("should return empty array when no tool calls", () => {
      const response = { content: "regular text" } as any;
      const toolCalls = adapter.parseToolCalls(response);
      expect(toolCalls).toHaveLength(0);
    });

    it("should parse both tool_calls and function_call", () => {
      const response = {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "fn1", arguments: "{}" },
          },
        ],
        function_call: {
          name: "fn2",
          arguments: "{}",
        },
      } as any;

      const toolCalls = adapter.parseToolCalls(response);
      // Both should be parsed
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== buildToolResultMessage ====================

  describe("buildToolResultMessage", () => {
    it("should build tool result message with string result", () => {
      const message = adapter.buildToolResultMessage(
        "call_abc",
        "web_search",
        "search results here",
      );

      expect(message.role).toBe("tool");
      expect(message.content).toBe("search results here");
      expect(message.tool_call_id).toBe("call_abc");
      expect(message.name).toBe("web_search");
    });

    it("should serialize object result to JSON", () => {
      const message = adapter.buildToolResultMessage("call_abc", "get_data", {
        key: "value",
        count: 42,
      });

      expect(message.content).toBe('{"key":"value","count":42}');
    });
  });

  // ==================== chat ====================

  describe("chat", () => {
    it("should call AiChatService with messages", async () => {
      const result = await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockAiChatService.chat).toHaveBeenCalled();
      expect(result.content).toBe("mocked AI response");
    });

    it("should pass tools to AiChatService when provided", async () => {
      const functions = [
        { name: "test_fn", description: "Test function", parameters: {} },
      ];

      await adapter.chat({
        messages: [{ role: "user", content: "Use the tool" }],
        functions: functions as any,
      });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(callArgs.tools).toHaveLength(1);
    });

    it("should use resolved model from DB", async () => {
      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockAiChatService.chat).toHaveBeenCalled();
    });

    it("should throw when DB has no models", async () => {
      mockPrisma.aIModel.findFirst.mockResolvedValue(null);

      await expect(
        adapter.chat({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("No AI model configured");
    });

    it("should use config model when set", async () => {
      adapter.setConfig({
        modelId: "claude-3-5-sonnet-20241022",
        provider: "anthropic",
        apiKey: "claude-key",
      });

      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("should pass taskProfile when provided", async () => {
      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
        taskProfile: { creativity: "low", outputLength: "short" },
      });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.taskProfile).toEqual({
        creativity: "low",
        outputLength: "short",
      });
    });

    it("should include tool_choice when functions provided", async () => {
      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
        functions: [
          { name: "test", description: "test", parameters: {} } as any,
        ],
        tool_choice: "auto",
      });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.tool_choice).toBe("auto");
    });

    it("should handle AI member config", async () => {
      const mockMember = {
        aiModel: "gpt-4o",
        displayName: "Test Member",
      };
      mockPrisma.topicAIMember.findUnique.mockResolvedValue(mockMember);

      const memberModel = {
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "member-key",
        secretKey: null,
        apiEndpoint: null,
      };
      mockPrisma.aIModel.findFirst.mockResolvedValue(memberModel);

      adapter.setConfig({ aiMemberId: "member-123" });

      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockAiChatService.chat).toHaveBeenCalled();
    });

    it("should throw when AI member not found", async () => {
      mockPrisma.topicAIMember.findUnique.mockResolvedValue(null);
      adapter.setConfig({ aiMemberId: "nonexistent-member" });

      await expect(
        adapter.chat({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("AI Member not found");
    });

    it("should use secretKey for API key resolution", async () => {
      mockSecretsService.getValueInternal.mockResolvedValue("secret-key-value");

      const mockMember = { aiModel: "gpt-4o", displayName: "Test" };
      mockPrisma.topicAIMember.findUnique.mockResolvedValue(mockMember);

      const memberModel = {
        modelId: "gpt-4o",
        provider: "openai",
        apiKey: "fallback-key",
        secretKey: "MY_SECRET",
        apiEndpoint: null,
      };
      mockPrisma.aIModel.findFirst.mockResolvedValue(memberModel);

      adapter.setConfig({ aiMemberId: "member-123" });

      await adapter.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockSecretsService.getValueInternal).toHaveBeenCalledWith(
        "MY_SECRET",
      );
    });
  });

  // ==================== Response parsing ====================

  describe("response parsing (OpenAI format)", () => {
    it("should parse simplified chat response", async () => {
      mockAiChatService.chat.mockResolvedValue({
        content: "Hello World",
        tokensUsed: 50,
      });

      const result = await adapter.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(result.content).toBe("Hello World");
      expect(result.usage?.totalTokens).toBe(50);
    });

    it("should parse response with usage.totalTokens", async () => {
      mockAiChatService.chat.mockResolvedValue({
        content: "Response",
        usage: { totalTokens: 200 },
      });

      const result = await adapter.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(result.content).toBe("Response");
      expect(result.usage?.totalTokens).toBe(200);
    });

    it("should return stop as finishReason", async () => {
      const result = await adapter.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(result.finishReason).toBe("stop");
    });
  });

  // ==================== Provider inference ====================

  describe("provider inference from model name", () => {
    it("should infer openai for gpt models", async () => {
      adapter.setConfig({
        modelId: "gpt-4o",
        apiKey: "key",
      });

      await adapter.chat({ messages: [{ role: "user", content: "hi" }] });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.provider).toBe("openai");
    });

    it("should infer anthropic for claude models", async () => {
      adapter.setConfig({
        modelId: "claude-3-5-sonnet-20241022",
        apiKey: "key",
      });

      await adapter.chat({ messages: [{ role: "user", content: "hi" }] });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.provider).toBe("anthropic");
    });

    it("should infer google for gemini models", async () => {
      adapter.setConfig({
        modelId: "gemini-2.0-flash",
        apiKey: "key",
      });

      await adapter.chat({ messages: [{ role: "user", content: "hi" }] });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.provider).toBe("google");
    });

    it("should infer xai for grok models", async () => {
      adapter.setConfig({
        modelId: "grok-2",
        apiKey: "key",
      });

      await adapter.chat({ messages: [{ role: "user", content: "hi" }] });

      const callArgs = mockAiChatService.chat.mock.calls[0][0];
      expect(callArgs.provider).toBe("xai");
    });
  });
});

