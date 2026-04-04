/**
 * Unit tests for PermissionMiddleware
 */

import { Logger } from "@nestjs/common";
import { PermissionMiddleware } from "../permission.middleware";
import {
  ITool,
  ToolCategory,
  ToolContext,
  ToolResult,
} from "../../abstractions/tool.interface";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(id = "test-tool"): ITool {
  return {
    id,
    name: `Tool ${id}`,
    description: "Test tool",
    category: "information" as ToolCategory,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    enabled: true,
    cancellable: false,
    execute(_input: unknown, _context: ToolContext): Promise<ToolResult> {
      return Promise.resolve({
        success: true,
        data: {},
        metadata: {
          executionId: "e",
          startTime: new Date(),
          endTime: new Date(),
          duration: 0,
        },
      });
    },
    toFunctionDefinition: () => ({
      name: id,
      description: "Test",
      parameters: {},
    }),
    toCompactSummary: () => ({
      id,
      name: `Tool ${id}`,
      brief: "Test",
      category: "information" as ToolCategory,
    }),
  };
}

function makeContext(userId?: string): ToolContext {
  return {
    executionId: "exec-1",
    toolId: "test-tool",
    userId,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionMiddleware", () => {
  let middleware: PermissionMiddleware;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    middleware = new PermissionMiddleware();
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  it('has name "permission"', () => {
    expect(middleware.name).toBe("permission");
  });

  it("has priority 5", () => {
    expect(middleware.priority).toBe(5);
  });

  // -------------------------------------------------------------------------
  // before() — default isAllowed (permits all)
  // -------------------------------------------------------------------------

  it("before() resolves without throwing when default isAllowed returns permitted=true", async () => {
    const tool = makeTool();
    const context = makeContext("user-42");

    await expect(
      middleware.before(undefined, context, tool),
    ).resolves.toBeUndefined();
  });

  it("before() resolves for anonymous callers (no userId)", async () => {
    const tool = makeTool();
    const context = makeContext(); // no userId

    await expect(
      middleware.before(undefined, context, tool),
    ).resolves.toBeUndefined();
  });
});
