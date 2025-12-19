/**
 * Tool Registry Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ToolRegistry } from "../tool/tool.registry";
import { BaseTool, JSONSchema, ToolContext } from "../tool/tool.interface";
import { ToolType } from "../agent/agent.types";

// Mock Tool 实现
class MockTool extends BaseTool<{ query: string }, { result: string }> {
  readonly type = ToolType.WEB_SEARCH;
  readonly name = "Mock Tool";
  readonly description = "A mock tool for testing";
  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  };
  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      result: { type: "string" },
    },
  };

  protected async doExecute(
    input: { query: string },
    _context: ToolContext,
  ): Promise<{ result: string }> {
    return { result: `Result for: ${input.query}` };
  }
}

class AnotherMockTool extends BaseTool<{ data: string }, { output: string }> {
  readonly type = ToolType.TEXT_GENERATION;
  readonly name = "Another Mock Tool";
  readonly description = "Another mock tool";
  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: { data: { type: "string" } },
    required: ["data"],
  };
  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: { output: { type: "string" } },
  };

  protected async doExecute(
    input: { data: string },
    _context: ToolContext,
  ): Promise<{ output: string }> {
    return { output: input.data.toUpperCase() };
  }
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  let mockTool: MockTool;
  let anotherTool: AnotherMockTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolRegistry],
    }).compile();

    registry = module.get<ToolRegistry>(ToolRegistry);
    mockTool = new MockTool();
    anotherTool = new AnotherMockTool();
  });

  describe("register", () => {
    it("should register a tool", () => {
      registry.register(mockTool);

      expect(registry.has(ToolType.WEB_SEARCH)).toBe(true);
    });

    it("should allow overwriting existing tool with warning", () => {
      registry.register(mockTool);

      const newMockTool = new MockTool();
      registry.register(newMockTool);

      expect(registry.has(ToolType.WEB_SEARCH)).toBe(true);
    });
  });

  describe("registerMany", () => {
    it("should register multiple tools", () => {
      registry.registerMany([mockTool, anotherTool]);

      expect(registry.has(ToolType.WEB_SEARCH)).toBe(true);
      expect(registry.has(ToolType.TEXT_GENERATION)).toBe(true);
    });
  });

  describe("get", () => {
    it("should return registered tool", () => {
      registry.register(mockTool);

      const tool = registry.get(ToolType.WEB_SEARCH);

      expect(tool).toBe(mockTool);
      expect(tool.name).toBe("Mock Tool");
    });

    it("should throw error for unregistered tool", () => {
      expect(() => registry.get(ToolType.WEB_SEARCH)).toThrow(
        "Tool web_search not registered",
      );
    });
  });

  describe("getOptional", () => {
    it("should return tool if registered", () => {
      registry.register(mockTool);

      const tool = registry.getOptional(ToolType.WEB_SEARCH);

      expect(tool).toBe(mockTool);
    });

    it("should return undefined if not registered", () => {
      const tool = registry.getOptional(ToolType.WEB_SEARCH);

      expect(tool).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered tool", () => {
      registry.register(mockTool);

      expect(registry.has(ToolType.WEB_SEARCH)).toBe(true);
    });

    it("should return false for unregistered tool", () => {
      expect(registry.has(ToolType.WEB_SEARCH)).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return all registered tools", () => {
      registry.registerMany([mockTool, anotherTool]);

      const tools = registry.getAll();

      expect(tools).toHaveLength(2);
      expect(tools).toContain(mockTool);
      expect(tools).toContain(anotherTool);
    });

    it("should return empty array when no tools registered", () => {
      const tools = registry.getAll();

      expect(tools).toHaveLength(0);
    });
  });

  describe("getRegisteredTypes", () => {
    it("should return all registered tool types", () => {
      registry.registerMany([mockTool, anotherTool]);

      const types = registry.getRegisteredTypes();

      expect(types).toContain(ToolType.WEB_SEARCH);
      expect(types).toContain(ToolType.TEXT_GENERATION);
    });
  });

  describe("hasAll", () => {
    it("should return true when all tools are registered", () => {
      registry.registerMany([mockTool, anotherTool]);

      expect(
        registry.hasAll([ToolType.WEB_SEARCH, ToolType.TEXT_GENERATION]),
      ).toBe(true);
    });

    it("should return false when some tools are missing", () => {
      registry.register(mockTool);

      expect(
        registry.hasAll([ToolType.WEB_SEARCH, ToolType.TEXT_GENERATION]),
      ).toBe(false);
    });
  });

  describe("getMany", () => {
    it("should return multiple tools", () => {
      registry.registerMany([mockTool, anotherTool]);

      const tools = registry.getMany([
        ToolType.WEB_SEARCH,
        ToolType.TEXT_GENERATION,
      ]);

      expect(tools).toHaveLength(2);
      expect(tools[0]).toBe(mockTool);
      expect(tools[1]).toBe(anotherTool);
    });

    it("should throw if any tool is not registered", () => {
      registry.register(mockTool);

      expect(() =>
        registry.getMany([ToolType.WEB_SEARCH, ToolType.TEXT_GENERATION]),
      ).toThrow();
    });
  });

  describe("unregister", () => {
    it("should remove registered tool", () => {
      registry.register(mockTool);

      const result = registry.unregister(ToolType.WEB_SEARCH);

      expect(result).toBe(true);
      expect(registry.has(ToolType.WEB_SEARCH)).toBe(false);
    });

    it("should return false for unregistered tool", () => {
      const result = registry.unregister(ToolType.WEB_SEARCH);

      expect(result).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all tools", () => {
      registry.registerMany([mockTool, anotherTool]);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    it("should return statistics", () => {
      registry.registerMany([mockTool, anotherTool]);

      const stats = registry.getStats();

      expect(stats.total).toBe(2);
      expect(stats.registered).toContain(ToolType.WEB_SEARCH);
      expect(stats.registered).toContain(ToolType.TEXT_GENERATION);
    });
  });
});

describe("BaseTool", () => {
  let tool: MockTool;

  beforeEach(() => {
    tool = new MockTool();
  });

  describe("execute", () => {
    it("should execute and return success result", async () => {
      const result = await tool.execute(
        { query: "test" },
        { taskId: "task-1" },
      );

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe("Result for: test");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle invalid input", async () => {
      // @ts-ignore - intentionally testing invalid input
      tool.validateInput = () => false;

      const result = await tool.execute(
        { query: "test" },
        { taskId: "task-1" },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Custom validation failed");
    });
  });

  describe("toFunctionDefinition", () => {
    it("should return OpenAI function definition format", () => {
      const definition = tool.toFunctionDefinition();

      expect(definition.name).toBe(ToolType.WEB_SEARCH);
      expect(definition.description).toBe("A mock tool for testing");
      expect(definition.parameters).toEqual(tool.inputSchema);
    });
  });

  describe("validateInput", () => {
    it("should return true by default", () => {
      expect(tool.validateInput({ query: "test" })).toBe(true);
    });
  });
});
