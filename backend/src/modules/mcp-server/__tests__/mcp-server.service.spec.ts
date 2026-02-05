/**
 * MCP Server Service - Unit Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { MCPServerService } from "../mcp-server.service";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
  JSON_RPC_ERRORS,
} from "../abstractions/mcp-server.interface";

class MockToolHandler implements IMCPToolHandler {
  readonly toolName = "test_tool";
  readonly description = "Test tool for unit tests";
  readonly inputSchema = {
    type: "object",
    properties: {
      input: { type: "string" },
    },
    required: ["input"],
  };

  async execute(
    args: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    return {
      content: [{ type: "text", text: `Processed: ${args.input}` }],
    };
  }
}

describe("MCPServerService", () => {
  let service: MCPServerService;
  let mockHandler: MockToolHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MCPServerService],
    }).compile();

    service = module.get<MCPServerService>(MCPServerService);
    mockHandler = new MockToolHandler();
    service.registerToolHandler(mockHandler);
  });

  describe("registerToolHandler", () => {
    it("should register a tool handler", () => {
      const status = service.getStatus();
      expect(status.tools).toContain("test_tool");
      expect(status.toolCount).toBe(1);
    });
  });

  describe("handleRequest - initialize", () => {
    it("should handle initialize request", async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "raven-ai-engine",
            version: "1.0.0",
          },
        },
      });
    });
  });

  describe("handleRequest - tools/list", () => {
    it("should list registered tools", async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 2,
        method: "tools/list",
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            {
              name: "test_tool",
              description: "Test tool for unit tests",
              inputSchema: mockHandler.inputSchema,
            },
          ],
        },
      });
    });
  });

  describe("handleRequest - tools/call", () => {
    it("should call a registered tool", async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "tools/call",
        params: {
          name: "test_tool",
          arguments: { input: "hello" },
        },
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: [{ type: "text", text: "Processed: hello" }],
        },
      });
    });

    it("should return error for unknown tool", async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: "tools/call",
        params: {
          name: "unknown_tool",
          arguments: {},
        },
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 4,
        error: {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND.code,
          message: "Unknown tool: unknown_tool",
        },
      });
    });
  });

  describe("handleRequest - invalid requests", () => {
    it("should return error for invalid JSON-RPC format", async () => {
      const request = {
        jsonrpc: "1.0",
        id: 5,
        method: "test",
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST.code,
        },
      });
    });

    it("should return error for unknown method", async () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 6,
        method: "unknown_method",
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(request, context);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 6,
        error: {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND.code,
        },
      });
    });
  });

  describe("handleRequest - batch requests", () => {
    it("should handle batch requests", async () => {
      const requests = [
        {
          jsonrpc: "2.0" as const,
          id: 1,
          method: "ping",
        },
        {
          jsonrpc: "2.0" as const,
          id: 2,
          method: "tools/list",
        },
      ];

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const responses = await service.handleRequest(requests, context);

      expect(Array.isArray(responses)).toBe(true);
      expect((responses as any[]).length).toBe(2);
    });
  });

  describe("handleRequest - notifications", () => {
    it("should not return response for notifications (no id)", async () => {
      const notification = {
        jsonrpc: "2.0" as const,
        method: "notifications/initialized",
      };

      const context: MCPRequestContext = {
        apiKeyId: "test-key",
      };

      const response = await service.handleRequest(notification, context);

      // Notifications (no id) return null per JSON-RPC 2.0 spec
      expect(response).toBeNull();
    });
  });
});
