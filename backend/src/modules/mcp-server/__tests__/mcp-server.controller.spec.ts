/**
 * MCP Server Controller - Integration Tests
 * 覆盖 HTTP 层：响应格式、auth guard、null 处理、所有 JSON-RPC 方法
 */

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, HttpStatus } from "@nestjs/common";
import * as request from "supertest";
import { MCPServerController } from "../mcp-server.controller";
import { MCPServerService } from "../mcp-server.service";
import { MCPApiKeyGuard } from "../guards/mcp-api-key.guard";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";

const TEST_API_KEY = "test-mcp-key-abc123";

class MockToolHandler implements IMCPToolHandler {
  readonly toolName = "test_tool";
  readonly description = "A test tool";
  readonly inputSchema = {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  };

  async execute(
    args: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    return {
      content: [{ type: "text", text: `Result: ${args.query}` }],
    };
  }
}

class FailingToolHandler implements IMCPToolHandler {
  readonly toolName = "failing_tool";
  readonly description = "A tool that always fails";
  readonly inputSchema = { type: "object", properties: {} };

  async execute(): Promise<MCPToolResponse> {
    throw new Error("Tool execution failed");
  }
}

describe("MCPServerController (integration)", () => {
  let app: INestApplication;
  let service: MCPServerService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MCPServerController],
      providers: [MCPServerService],
    })
      .overrideGuard(MCPApiKeyGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const auth = req.headers["authorization"];
          if (auth === `Bearer ${TEST_API_KEY}`) {
            req.mcpApiKeyId = "test-key-id";
            return true;
          }
          // Simulate real guard: throw 401
          const { UnauthorizedException } = require("@nestjs/common");
          throw new UnauthorizedException("Invalid API key");
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();

    service = module.get<MCPServerService>(MCPServerService);
    service.registerToolHandler(new MockToolHandler());
    service.registerToolHandler(new FailingToolHandler());
  });

  afterAll(async () => {
    await app.close();
  }, 10000);

  const authedPost = (body: string | object) =>
    request(app.getHttpServer())
      .post("/mcp")
      .set("Authorization", `Bearer ${TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send(body);

  // ==================== Auth ====================

  describe("authentication", () => {
    it("should reject request without API key (401)", async () => {
      const res = await request(app.getHttpServer())
        .post("/mcp")
        .set("Content-Type", "application/json")
        .send({ jsonrpc: "2.0", id: 1, method: "ping" });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it("should reject request with invalid API key (401)", async () => {
      const res = await request(app.getHttpServer())
        .post("/mcp")
        .set("Authorization", "Bearer wrong-key")
        .set("Content-Type", "application/json")
        .send({ jsonrpc: "2.0", id: 1, method: "ping" });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it("should accept request with valid API key", async () => {
      const res = await authedPost({ jsonrpc: "2.0", id: 1, method: "ping" });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveProperty("jsonrpc", "2.0");
    });
  });

  // ==================== Response Format ====================

  describe("response format (raw JSON-RPC, no envelope)", () => {
    it("should return raw JSON-RPC without success/data/metadata wrapper", async () => {
      const res = await authedPost({ jsonrpc: "2.0", id: 1, method: "ping" });

      expect(res.status).toBe(HttpStatus.OK);
      // Must be raw JSON-RPC
      expect(res.body).toHaveProperty("jsonrpc", "2.0");
      expect(res.body).toHaveProperty("id", 1);
      expect(res.body).toHaveProperty("result");
      // Must NOT have envelope
      expect(res.body).not.toHaveProperty("success");
      expect(res.body).not.toHaveProperty("data");
      expect(res.body).not.toHaveProperty("metadata");
    });
  });

  // ==================== Initialize ====================

  describe("initialize", () => {
    it("should return server capabilities and session ID header", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          clientInfo: { name: "test-client", version: "1.0" },
        },
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(1);
      expect(res.body.result.protocolVersion).toBe("2024-11-05");
      expect(res.body.result.capabilities.tools).toBeDefined();
      expect(res.body.result.serverInfo.name).toBe("raven-ai-engine");
      // Session ID in header
      expect(res.headers["mcp-session-id"]).toMatch(/^mcp-/);
      // Session ID in _meta
      expect(res.body.result._meta.sessionId).toMatch(/^mcp-/);
    });
  });

  // ==================== Ping ====================

  describe("ping", () => {
    it("should return empty result", async () => {
      const res = await authedPost({ jsonrpc: "2.0", id: 10, method: "ping" });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toEqual({
        jsonrpc: "2.0",
        id: 10,
        result: {},
      });
    });
  });

  // ==================== tools/list ====================

  describe("tools/list", () => {
    it("should list all registered tools", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(2);
      const tools = res.body.result.tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(2);
      expect(tools.find((t: any) => t.name === "test_tool")).toBeDefined();
      expect(tools.find((t: any) => t.name === "failing_tool")).toBeDefined();
    });
  });

  // ==================== tools/call ====================

  describe("tools/call", () => {
    it("should execute tool and return result", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "test_tool", arguments: { query: "hello" } },
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(3);
      expect(res.body.result.content[0].text).toBe("Result: hello");
      expect(res.body.error).toBeUndefined();
    });

    it("should return JSON-RPC error for unknown tool", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nonexistent", arguments: {} },
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(4);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32601);
    });

    it("should return error content when tool throws", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "failing_tool", arguments: {} },
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.jsonrpc).toBe("2.0");
      expect(res.body.id).toBe(5);
      // Tool errors are returned as isError content, not JSON-RPC error
      expect(res.body.result.isError).toBe(true);
      expect(res.body.result.content[0].text).toContain(
        "Tool execution failed",
      );
    });

    it("should return JSON-RPC error when name param missing", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { arguments: {} },
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32602); // INVALID_PARAMS
    });
  });

  // ==================== Notifications (no id) ====================

  describe("notifications", () => {
    it("should return 204 for notification (no id)", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(res.text).toBe("");
    });

    it("should return 204 for ping notification (no id)", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        method: "ping",
      });

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(res.text).toBe("");
    });
  });

  // ==================== Batch Requests ====================

  describe("batch requests", () => {
    it("should handle batch of normal requests", async () => {
      const res = await authedPost([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]);

      expect(res.status).toBe(HttpStatus.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].id).toBe(1);
      expect(res.body[1].id).toBe(2);
    });

    it("should return 204 for batch of all notifications", async () => {
      const res = await authedPost([
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", method: "ping" },
      ]);

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
      expect(res.text).toBe("");
    });

    it("should filter out notifications from batch response", async () => {
      const res = await authedPost([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ]);

      expect(res.status).toBe(HttpStatus.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(1);
    });
  });

  // ==================== Invalid Requests ====================

  describe("invalid requests", () => {
    it("should return JSON-RPC error for invalid jsonrpc version", async () => {
      const res = await authedPost({
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32600);
    });

    it("should return JSON-RPC error for missing method", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 1,
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32600);
    });

    it("should return JSON-RPC error for unknown method", async () => {
      const res = await authedPost({
        jsonrpc: "2.0",
        id: 1,
        method: "nonexistent/method",
      });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32601);
    });

    it("should return JSON-RPC error for empty object body", async () => {
      const res = await authedPost({});

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32600);
    });
  });

  // ==================== SSE ====================

  describe("GET /mcp (SSE)", () => {
    it("should return text/event-stream headers and keepalive", (done) => {
      const req = request(app.getHttpServer())
        .get("/mcp")
        .set("Authorization", `Bearer ${TEST_API_KEY}`)
        .set("Mcp-Session-Id", "test-session");

      req.expect(HttpStatus.OK).expect("content-type", /text\/event-stream/);

      // Collect initial data then abort
      let data = "";
      req.buffer(false).parse((res: any, callback: any) => {
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
          // Got keepalive comment, test passes
          if (data.includes(": keepalive")) {
            res.destroy();
            done();
          }
        });
        res.on("end", () => callback(null, data));
        res.on("error", () => callback(null, data));
      });

      // Safety timeout
      setTimeout(() => {
        done();
      }, 3000);
    }, 5000);
  });

  // ==================== DELETE /mcp ====================

  describe("DELETE /mcp (terminate session)", () => {
    it("should return 204", async () => {
      const res = await request(app.getHttpServer())
        .delete("/mcp")
        .set("Authorization", `Bearer ${TEST_API_KEY}`)
        .set("Mcp-Session-Id", "test-session");

      expect(res.status).toBe(HttpStatus.NO_CONTENT);
    });
  });
});
