/**
 * MCP Adapter 单元测试
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MCPAdapter, MCPErrorCode } from "../mcp-adapter";
import { ToolRegistry } from "../../tool/tool.registry";
import { BaseTool } from "../../tool/tool.interface";
import { ToolType } from "../../agent/agent.types";

// Mock 工具
class MockWebSearchTool extends BaseTool {
  readonly type = ToolType.WEB_SEARCH;
  readonly name = "Web Search";
  readonly description = "Search the web";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Search query" },
    },
    required: ["query"],
  };
  readonly outputSchema = {
    type: "object" as const,
    properties: {
      results: { type: "array" as const },
    },
  };

  protected async doExecute(input: any) {
    return { results: [`Result for: ${input.query}`] };
  }
}

describe("MCPAdapter", () => {
  let adapter: MCPAdapter;
  let registry: ToolRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MCPAdapter, ToolRegistry],
    }).compile();

    adapter = module.get<MCPAdapter>(MCPAdapter);
    registry = module.get<ToolRegistry>(ToolRegistry);

    // 注册 mock 工具
    registry.register(new MockWebSearchTool());
  });

  describe("Tool Management", () => {
    it("should list all registered tools", () => {
      const tools = adapter.listTools();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      const webSearchTool = tools.find((t) => t.name === ToolType.WEB_SEARCH);
      expect(webSearchTool).toBeDefined();
      expect(webSearchTool?.description).toBe("Search the web");
    });

    it("should get a specific tool", () => {
      const tool = adapter.getTool(ToolType.WEB_SEARCH);

      expect(tool).toBeDefined();
      expect(tool?.name).toBe(ToolType.WEB_SEARCH);
      expect(tool?.inputSchema).toBeDefined();
    });

    it("should return undefined for non-existent tool", () => {
      const tool = adapter.getTool("nonexistent_tool" as ToolType);

      expect(tool).toBeUndefined();
    });

    it("should call tool successfully", async () => {
      const response = await adapter.callTool(ToolType.WEB_SEARCH, {
        query: "test",
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty("data");
    });

    it("should return error for non-existent tool", async () => {
      const response = await adapter.callTool(
        "nonexistent_tool" as ToolType,
        {},
      );

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.TOOL_NOT_FOUND);
      expect(response.error?.message).toContain("not found");
    });
  });

  describe("Resource Management", () => {
    it("should register and list resources", () => {
      const resource = {
        uri: "file:///test.pdf",
        name: "Test File",
        description: "A test PDF file",
        mimeType: "application/pdf",
      };

      adapter.registerResource(resource);

      const resources = adapter.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe("file:///test.pdf");
      expect(resources[0].name).toBe("Test File");
    });

    it("should read registered resource", async () => {
      const resource = {
        uri: "file:///test.pdf",
        name: "Test File",
      };

      adapter.registerResource(resource);

      const response = await adapter.readResource("file:///test.pdf");

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result?.uri).toBe("file:///test.pdf");
    });

    it("should return error for non-existent resource", async () => {
      const response = await adapter.readResource("file:///nonexistent.pdf");

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.RESOURCE_NOT_FOUND);
    });

    it("should unregister resource", () => {
      const resource = {
        uri: "file:///test.pdf",
        name: "Test File",
      };

      adapter.registerResource(resource);
      expect(adapter.listResources()).toHaveLength(1);

      const result = adapter.unregisterResource("file:///test.pdf");
      expect(result).toBe(true);
      expect(adapter.listResources()).toHaveLength(0);
    });
  });

  describe("Prompt Management", () => {
    it("should register and list prompts", () => {
      const prompt = {
        name: "test_prompt",
        description: "A test prompt",
        arguments: [
          { name: "arg1", description: "First argument", required: true },
        ],
        template: "Test template with {{arg1}}",
      };

      adapter.registerPrompt(prompt);

      const prompts = adapter.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe("test_prompt");
    });

    it("should get registered prompt", () => {
      const prompt = {
        name: "test_prompt",
        description: "A test prompt",
        template: "Test template",
      };

      adapter.registerPrompt(prompt);

      const retrieved = adapter.getPrompt("test_prompt");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("test_prompt");
    });

    it("should render prompt with arguments", () => {
      const prompt = {
        name: "test_prompt",
        template: "Hello {{name}}, welcome to {{place}}!",
      };

      adapter.registerPrompt(prompt);

      const rendered = adapter.renderPrompt("test_prompt", {
        name: "World",
        place: "MCP",
      });

      expect(rendered).toBe("Hello World, welcome to MCP!");
    });

    it("should return null for non-existent prompt", () => {
      const rendered = adapter.renderPrompt("nonexistent", {});
      expect(rendered).toBeNull();
    });
  });

  describe("Progress Reporting", () => {
    it("should register and call progress callback", () => {
      const token = "task_123";
      const progressEvents: any[] = [];

      adapter.onProgress(token, (progress) => {
        progressEvents.push(progress);
      });

      adapter.reportProgress(token, 25, "Starting...");
      adapter.reportProgress(token, 50, "Halfway there...");
      adapter.reportProgress(token, 100, "Complete!");

      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0].progress).toBe(25);
      expect(progressEvents[0].message).toBe("Starting...");
      expect(progressEvents[2].progress).toBe(100);
    });

    it("should clamp progress to 0-100", () => {
      const token = "task_123";
      let lastProgress = 0;

      adapter.onProgress(token, (progress) => {
        lastProgress = progress.progress;
      });

      adapter.reportProgress(token, -10);
      expect(lastProgress).toBe(0);

      adapter.reportProgress(token, 150);
      expect(lastProgress).toBe(100);
    });

    it("should remove progress callback", () => {
      const token = "task_123";
      let callCount = 0;

      adapter.onProgress(token, () => {
        callCount++;
      });

      adapter.reportProgress(token, 50);
      expect(callCount).toBe(1);

      adapter.removeProgressCallback(token);

      adapter.reportProgress(token, 100);
      expect(callCount).toBe(1); // 没有增加
    });
  });

  describe("Cancellation", () => {
    it("should cancel execution", () => {
      const taskId = "task_123";

      // 启动一个执行（需要先创建 abort controller）
      adapter.callTool(ToolType.WEB_SEARCH, { query: "test" }, { taskId });

      // 取消执行
      const cancelled = adapter.cancelExecution(taskId);
      expect(cancelled).toBe(true);
    });

    it("should return false for non-existent task", () => {
      const cancelled = adapter.cancelExecution("nonexistent_task");
      expect(cancelled).toBe(false);
    });
  });

  describe("Request Handling", () => {
    it("should handle tools/list request", async () => {
      const response = await adapter.handleRequest({
        id: 1,
        method: "tools/list",
      });

      expect(response.id).toBe(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(Array.isArray(response.result)).toBe(true);
    });

    it("should handle tools/call request", async () => {
      const response = await adapter.handleRequest({
        id: 2,
        method: "tools/call",
        params: {
          name: ToolType.WEB_SEARCH,
          arguments: { query: "test" },
        },
      });

      expect(response.id).toBe(2);
      expect(response.error).toBeUndefined();
    });

    it("should handle resources/list request", async () => {
      adapter.registerResource({
        uri: "file:///test.pdf",
        name: "Test",
      });

      const response = await adapter.handleRequest({
        id: 3,
        method: "resources/list",
      });

      expect(response.id).toBe(3);
      expect(response.result).toBeDefined();
      expect(Array.isArray(response.result)).toBe(true);
    });

    it("should handle unknown method", async () => {
      const response = await adapter.handleRequest({
        id: 4,
        method: "unknown/method",
      });

      expect(response.id).toBe(4);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.METHOD_NOT_FOUND);
    });

    it("should handle invalid params", async () => {
      const response = await adapter.handleRequest({
        id: 5,
        method: "tools/call",
        params: { invalid: "params" },
      });

      expect(response.id).toBe(5);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.INVALID_PARAMS);
    });
  });

  describe("Statistics", () => {
    it("should return correct stats", () => {
      adapter.registerResource({ uri: "file:///test.pdf", name: "Test" });
      adapter.registerPrompt({ name: "test_prompt" });

      const stats = adapter.getStats();

      expect(stats.tools).toBeGreaterThan(0);
      expect(stats.resources).toBe(1);
      expect(stats.prompts).toBe(1);
      expect(stats.activeExecutions).toBeGreaterThanOrEqual(0);
      expect(stats.activeProgressCallbacks).toBeGreaterThanOrEqual(0);
    });
  });
});
