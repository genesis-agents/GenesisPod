import { AIModelType } from "@prisma/client";
import { StructuredOutputTool } from "../structured-output.tool";
import { AiChatService } from "../../../../llm/services/ai-chat.service";
import { ToolContext } from "../../../abstractions/tool.interface";

// ============================================================================
// Interfaces for mock return types
// ============================================================================

interface ChatResult {
  content: string;
  usage?: { totalTokens: number };
  model: string;
}

interface ChatCallArg {
  messages: Array<{ role: string; content: string }>;
  modelType: AIModelType;
  taskProfile: { creativity: string; outputLength: string };
}

// ============================================================================
// Mock factory
// ============================================================================

const mockAiChatService = {
  chat: jest.fn() as jest.MockedFunction<
    (options: unknown) => Promise<ChatResult>
  >,
};

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "structured-output",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("StructuredOutputTool", () => {
  let tool: StructuredOutputTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new StructuredOutputTool(
      mockAiChatService as unknown as AiChatService,
    );
  });

  // --------------------------------------------------------------------------
  // JSON format — happy path
  // --------------------------------------------------------------------------

  describe("JSON format", () => {
    it("should return success: true, validated: true, and data as parsed object for valid JSON", async () => {
      const jsonPayload = { name: "Alice", age: 30 };
      mockAiChatService.chat.mockResolvedValueOnce({
        content: JSON.stringify(jsonPayload),
        model: "gpt-4o",
        usage: { totalTokens: 50 },
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate a user record", format: "json" },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.validated).toBe(true);
      expect(result.data?.data).toEqual(jsonPayload);
    });

    it("should return validationErrors and validated: false when JSON is invalid", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "{ this is not valid json",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate something", format: "json" },
        context,
      );

      expect(result.data?.success).toBe(true);
      expect(result.data?.validated).toBe(false);
      expect(result.data?.validationErrors).toBeDefined();
      expect(result.data?.validationErrors!.length).toBeGreaterThan(0);
    });

    it("should prettify JSON output when prettify is true (default)", async () => {
      const jsonPayload = { key: "value" };
      mockAiChatService.chat.mockResolvedValueOnce({
        content: JSON.stringify(jsonPayload),
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "json", prettify: true },
        context,
      );

      // prettified JSON contains newlines
      expect(result.data?.output).toContain("\n");
    });
  });

  // --------------------------------------------------------------------------
  // modelType
  // --------------------------------------------------------------------------

  describe("modelType", () => {
    it("should pass AIModelType.CHAT to chat()", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: '{"ok":true}',
        model: "gpt-4o",
      });
      const context = createMockContext();

      await tool.execute({ prompt: "Generate data", format: "json" }, context);

      const callArg = mockAiChatService.chat.mock.calls[0][0] as ChatCallArg;
      expect(callArg.modelType).toBe(AIModelType.CHAT);
    });
  });

  // --------------------------------------------------------------------------
  // Temperature → creativity mapping
  // --------------------------------------------------------------------------

  describe("temperature to creativity mapping", () => {
    it("should pass creativity='low' when temperature <= 0.3", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: '{"result":"ok"}',
        model: "gpt-4o",
      });
      const context = createMockContext();

      await tool.execute(
        { prompt: "Generate data", format: "json", temperature: 0.2 },
        context,
      );

      const callArg = mockAiChatService.chat.mock.calls[0][0] as ChatCallArg;
      expect(callArg.taskProfile.creativity).toBe("low");
    });

    it("should pass creativity='medium' when 0.3 < temperature <= 0.5", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: '{"result":"ok"}',
        model: "gpt-4o",
      });
      const context = createMockContext();

      await tool.execute(
        { prompt: "Generate data", format: "json", temperature: 0.4 },
        context,
      );

      const callArg = mockAiChatService.chat.mock.calls[0][0] as ChatCallArg;
      expect(callArg.taskProfile.creativity).toBe("medium");
    });

    it("should pass creativity='high' when temperature > 0.5", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: '{"result":"ok"}',
        model: "gpt-4o",
      });
      const context = createMockContext();

      await tool.execute(
        { prompt: "Generate data", format: "json", temperature: 0.8 },
        context,
      );

      const callArg = mockAiChatService.chat.mock.calls[0][0] as ChatCallArg;
      expect(callArg.taskProfile.creativity).toBe("high");
    });
  });

  // --------------------------------------------------------------------------
  // Markdown fence cleanup
  // --------------------------------------------------------------------------

  describe("markdown cleanup", () => {
    it("should strip markdown json code fence from AI output", async () => {
      const jsonPayload = { stripped: true };
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "```json\n" + JSON.stringify(jsonPayload) + "\n```",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "json" },
        context,
      );

      expect(result.data?.output).not.toContain("```");
      expect(result.data?.validated).toBe(true);
    });

    it("should strip generic code fence (```) from AI output", async () => {
      const jsonPayload = { stripped: true };
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "```\n" + JSON.stringify(jsonPayload) + "\n```",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "json" },
        context,
      );

      expect(result.data?.output).not.toContain("```");
    });
  });

  // --------------------------------------------------------------------------
  // YAML format
  // --------------------------------------------------------------------------

  describe("YAML format", () => {
    it("should return success: true and validated: true for valid YAML with key-value pairs", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "name: Alice\nage: 30\nactive: true",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate YAML user config", format: "yaml" },
        context,
      );

      expect(result.data?.success).toBe(true);
      expect(result.data?.format).toBe("yaml");
      expect(result.data?.validated).toBe(true);
    });

    it("should return validated: false for an empty string YAML response", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate YAML", format: "yaml" },
        context,
      );

      expect(result.data?.validated).toBe(false);
    });

    it("should not include data field for YAML format", async () => {
      mockAiChatService.chat.mockResolvedValueOnce({
        content: "key: value",
        model: "gpt-4o",
      });
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate YAML", format: "yaml" },
        context,
      );

      expect(result.data?.data).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // validateInput
  // --------------------------------------------------------------------------

  describe("validateInput", () => {
    it("should return true for a valid json format input", () => {
      expect(
        tool.validateInput({ prompt: "Generate data", format: "json" }),
      ).toBe(true);
    });

    it("should return true for yaml and xml formats", () => {
      expect(tool.validateInput({ prompt: "Generate", format: "yaml" })).toBe(
        true,
      );
      expect(tool.validateInput({ prompt: "Generate", format: "xml" })).toBe(
        true,
      );
    });

    it("should return false when prompt is empty", () => {
      expect(tool.validateInput({ prompt: "", format: "json" })).toBe(false);
    });

    it("should return false for an invalid format", () => {
      expect(
        tool.validateInput({ prompt: "Generate", format: "csv" as "json" }),
      ).toBe(false);
    });

    it("should return false when temperature is out of range (> 1)", () => {
      expect(
        tool.validateInput({
          prompt: "Generate",
          format: "json",
          temperature: 1.5,
        }),
      ).toBe(false);
    });

    it("should return false when temperature is negative", () => {
      expect(
        tool.validateInput({
          prompt: "Generate",
          format: "json",
          temperature: -0.1,
        }),
      ).toBe(false);
    });

    it("should return true when temperature is exactly 0 or 1", () => {
      expect(
        tool.validateInput({
          prompt: "Generate",
          format: "json",
          temperature: 0,
        }),
      ).toBe(true);
      expect(
        tool.validateInput({
          prompt: "Generate",
          format: "json",
          temperature: 1,
        }),
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe("error handling", () => {
    it("should return success: false when chat() throws", async () => {
      mockAiChatService.chat.mockRejectedValueOnce(
        new Error("AI service unavailable"),
      );
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "json" },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(false);
    });

    it("should include error message in the output when chat() throws", async () => {
      mockAiChatService.chat.mockRejectedValueOnce(
        new Error("AI service unavailable"),
      );
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "json" },
        context,
      );

      expect(result.data?.error).toBeDefined();
    });

    it("should return the format in the output even when chat() throws", async () => {
      mockAiChatService.chat.mockRejectedValueOnce(new Error("timeout"));
      const context = createMockContext();

      const result = await tool.execute(
        { prompt: "Generate data", format: "yaml" },
        context,
      );

      expect(result.data?.format).toBe("yaml");
    });
  });
});
