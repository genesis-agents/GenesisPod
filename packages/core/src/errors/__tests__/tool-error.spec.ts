import { ToolError } from "../tool-error";
import { EngineError } from "../base-error";
import { ToolErrorCode } from "../error-codes";

describe("ToolError", () => {
  describe("constructor", () => {
    it("should create with message only, defaulting to UNKNOWN code", () => {
      const error = new ToolError("something went wrong");

      expect(error.message).toBe("something went wrong");
      expect(error.code).toBe(ToolErrorCode.UNKNOWN);
      expect(error.toolId).toBeUndefined();
      expect(error.toolName).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it("should set name to ToolError", () => {
      const error = new ToolError("test");
      expect(error.name).toBe("ToolError");
    });

    it("should be an instance of EngineError and Error", () => {
      const error = new ToolError("test");
      expect(error).toBeInstanceOf(ToolError);
      expect(error).toBeInstanceOf(EngineError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should create with explicit code", () => {
      const error = new ToolError("not found", ToolErrorCode.NOT_FOUND);
      expect(error.code).toBe(ToolErrorCode.NOT_FOUND);
    });

    it("should set toolId and toolName from options", () => {
      const error = new ToolError("test", ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
        toolName: "My Tool",
      });

      expect(error.toolId).toBe("my-tool");
      expect(error.toolName).toBe("My Tool");
    });

    it("should merge toolId and toolName into details", () => {
      const error = new ToolError("test", ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
        toolName: "My Tool",
      });

      expect(error.details).toEqual({ toolId: "my-tool", toolName: "My Tool" });
    });

    it("should merge toolId/toolName with extra details", () => {
      const error = new ToolError("test", ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
        toolName: "My Tool",
        details: { extra: "value" },
      });

      expect(error.details).toEqual({
        toolId: "my-tool",
        toolName: "My Tool",
        extra: "value",
      });
    });

    it("should not set details when toolId and toolName are absent and no extra details", () => {
      const error = new ToolError("test", ToolErrorCode.UNKNOWN);
      expect(error.details).toBeUndefined();
    });

    it("should preserve extra details without toolId or toolName", () => {
      const error = new ToolError("test", ToolErrorCode.UNKNOWN, {
        details: { reason: "bad input" },
      });

      expect(error.details).toEqual({ reason: "bad input" });
    });

    it("should set retryable from options", () => {
      const retryable = new ToolError("test", ToolErrorCode.UNKNOWN, {
        retryable: true,
      });
      expect(retryable.retryable).toBe(true);

      const notRetryable = new ToolError("test", ToolErrorCode.UNKNOWN, {
        retryable: false,
      });
      expect(notRetryable.retryable).toBe(false);
    });

    it("should set cause from options", () => {
      const cause = new Error("root cause");
      const error = new ToolError("test", ToolErrorCode.UNKNOWN, { cause });
      expect(error.cause).toBe(cause);
    });

    it("should have a timestamp", () => {
      const before = new Date();
      const error = new ToolError("test");
      const after = new Date();

      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should have a stack trace", () => {
      const error = new ToolError("test");
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe("string");
    });
  });

  describe("notFound", () => {
    it("should create a not-found error with correct code and message", () => {
      const error = ToolError.notFound("search-tool");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.NOT_FOUND);
      expect(error.message).toBe("Tool 'search-tool' not found");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.notFound("search-tool");
      expect(error.toolId).toBe("search-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.notFound("search-tool");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId in details", () => {
      const error = ToolError.notFound("search-tool");
      expect(error.details).toEqual({ toolId: "search-tool" });
    });
  });

  describe("notRegistered", () => {
    it("should create a not-registered error with correct code and message", () => {
      const error = ToolError.notRegistered("calc-tool");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.NOT_REGISTERED);
      expect(error.message).toBe("Tool 'calc-tool' is not registered");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.notRegistered("calc-tool");
      expect(error.toolId).toBe("calc-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.notRegistered("calc-tool");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId in details", () => {
      const error = ToolError.notRegistered("calc-tool");
      expect(error.details).toEqual({ toolId: "calc-tool" });
    });
  });

  describe("invalidInput", () => {
    it("should create an invalid-input error with correct code and message", () => {
      const error = ToolError.invalidInput("parser-tool", "value must be a string");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.INVALID_INPUT);
      expect(error.message).toBe(
        "Invalid input for tool 'parser-tool': value must be a string",
      );
    });

    it("should set toolId on the error", () => {
      const error = ToolError.invalidInput("parser-tool", "reason");
      expect(error.toolId).toBe("parser-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.invalidInput("parser-tool", "reason");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId in details when no extra details provided", () => {
      const error = ToolError.invalidInput("parser-tool", "reason");
      expect(error.details).toEqual({ toolId: "parser-tool" });
    });

    it("should merge extra details with toolId", () => {
      const extraDetails = { field: "name", expected: "string" };
      const error = ToolError.invalidInput("parser-tool", "reason", extraDetails);

      expect(error.details).toEqual({
        toolId: "parser-tool",
        field: "name",
        expected: "string",
      });
    });
  });

  describe("missingParameter", () => {
    it("should create a missing-parameter error with correct code and message", () => {
      const error = ToolError.missingParameter("http-tool", "url");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.MISSING_PARAMETER);
      expect(error.message).toBe(
        "Missing required parameter 'url' for tool 'http-tool'",
      );
    });

    it("should set toolId on the error", () => {
      const error = ToolError.missingParameter("http-tool", "url");
      expect(error.toolId).toBe("http-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.missingParameter("http-tool", "url");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId and parameterName in details", () => {
      const error = ToolError.missingParameter("http-tool", "url");
      expect(error.details).toEqual({ toolId: "http-tool", parameterName: "url" });
    });
  });

  describe("executionFailed", () => {
    it("should create an execution-failed error with correct code and message", () => {
      const error = ToolError.executionFailed("runner-tool", "process exited with code 1");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(error.message).toBe(
        "Tool 'runner-tool' execution failed: process exited with code 1",
      );
    });

    it("should set toolId on the error", () => {
      const error = ToolError.executionFailed("runner-tool", "reason");
      expect(error.toolId).toBe("runner-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.executionFailed("runner-tool", "reason");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId in details", () => {
      const error = ToolError.executionFailed("runner-tool", "reason");
      expect(error.details).toEqual({ toolId: "runner-tool" });
    });

    it("should accept an optional cause", () => {
      const cause = new Error("underlying OS error");
      const error = ToolError.executionFailed("runner-tool", "reason", cause);
      expect(error.cause).toBe(cause);
    });

    it("should work without a cause", () => {
      const error = ToolError.executionFailed("runner-tool", "reason");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("timeout", () => {
    it("should create a timeout error with correct code and message", () => {
      const error = ToolError.timeout("slow-tool", 5000);

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.TIMEOUT);
      expect(error.message).toBe("Tool 'slow-tool' timed out after 5000ms");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.timeout("slow-tool", 5000);
      expect(error.toolId).toBe("slow-tool");
    });

    it("should be retryable", () => {
      const error = ToolError.timeout("slow-tool", 5000);
      expect(error.retryable).toBe(true);
    });

    it("should include toolId and timeout in details", () => {
      const error = ToolError.timeout("slow-tool", 5000);
      expect(error.details).toEqual({ toolId: "slow-tool", timeout: 5000 });
    });

    it("should handle different timeout values", () => {
      const error = ToolError.timeout("slow-tool", 30000);
      expect(error.message).toBe("Tool 'slow-tool' timed out after 30000ms");
      expect(error.details).toEqual({ toolId: "slow-tool", timeout: 30000 });
    });
  });

  describe("cancelled", () => {
    it("should create a cancelled error with correct code and message", () => {
      const error = ToolError.cancelled("task-tool");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.CANCELLED);
      expect(error.message).toBe("Tool 'task-tool' execution was cancelled");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.cancelled("task-tool");
      expect(error.toolId).toBe("task-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.cancelled("task-tool");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId in details", () => {
      const error = ToolError.cancelled("task-tool");
      expect(error.details).toEqual({ toolId: "task-tool" });
    });
  });

  describe("rateLimited", () => {
    it("should create a rate-limited error with correct code and message (no retryAfter)", () => {
      const error = ToolError.rateLimited("api-tool");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.RATE_LIMITED);
      expect(error.message).toBe("Tool 'api-tool' is rate limited");
    });

    it("should create a rate-limited error with retryAfter in message", () => {
      const error = ToolError.rateLimited("api-tool", 2000);
      expect(error.message).toBe("Tool 'api-tool' is rate limited, retry after 2000ms");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.rateLimited("api-tool");
      expect(error.toolId).toBe("api-tool");
    });

    it("should be retryable", () => {
      const error = ToolError.rateLimited("api-tool");
      expect(error.retryable).toBe(true);
    });

    it("should be retryable even when retryAfter is provided", () => {
      const error = ToolError.rateLimited("api-tool", 1000);
      expect(error.retryable).toBe(true);
    });

    it("should include only toolId in details when retryAfter is absent", () => {
      const error = ToolError.rateLimited("api-tool");
      expect(error.details).toEqual({ toolId: "api-tool" });
    });

    it("should include toolId and retryAfter in details when retryAfter is provided", () => {
      const error = ToolError.rateLimited("api-tool", 2000);
      expect(error.details).toEqual({ toolId: "api-tool", retryAfter: 2000 });
    });

    it("should include retryAfter=0 in details because the check is !== undefined, not truthy", () => {
      // The source uses `retryAfter !== undefined ? { retryAfter } : undefined`,
      // so 0 is treated as a valid value and included.
      const error = ToolError.rateLimited("api-tool", 0);
      expect(error.details).toEqual({ toolId: "api-tool", retryAfter: 0 });
    });
  });

  describe("externalServiceError", () => {
    it("should create an external-service error with correct code and message", () => {
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.message).toBe(
        "External service 'ElasticSearch' error in tool 'search-tool'",
      );
    });

    it("should set toolId on the error", () => {
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch");
      expect(error.toolId).toBe("search-tool");
    });

    it("should be retryable", () => {
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch");
      expect(error.retryable).toBe(true);
    });

    it("should include toolId and serviceName in details", () => {
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch");
      expect(error.details).toEqual({
        toolId: "search-tool",
        serviceName: "ElasticSearch",
      });
    });

    it("should accept an optional cause", () => {
      const cause = new Error("connection refused");
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch", cause);
      expect(error.cause).toBe(cause);
    });

    it("should work without a cause", () => {
      const error = ToolError.externalServiceError("search-tool", "ElasticSearch");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("networkError", () => {
    it("should create a network error with correct code and message", () => {
      const error = ToolError.networkError("fetch-tool");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.NETWORK_ERROR);
      expect(error.message).toBe("Network error in tool 'fetch-tool'");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.networkError("fetch-tool");
      expect(error.toolId).toBe("fetch-tool");
    });

    it("should be retryable", () => {
      const error = ToolError.networkError("fetch-tool");
      expect(error.retryable).toBe(true);
    });

    it("should include toolId in details", () => {
      const error = ToolError.networkError("fetch-tool");
      expect(error.details).toEqual({ toolId: "fetch-tool" });
    });

    it("should accept an optional cause", () => {
      const cause = new Error("ECONNREFUSED");
      const error = ToolError.networkError("fetch-tool", cause);
      expect(error.cause).toBe(cause);
    });

    it("should work without a cause", () => {
      const error = ToolError.networkError("fetch-tool");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("apiError", () => {
    it("should create an API error with correct code and message", () => {
      const error = ToolError.apiError("rest-tool", 404, "Not Found");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.API_ERROR);
      expect(error.message).toBe("API error in tool 'rest-tool': 404 - Not Found");
    });

    it("should set toolId on the error", () => {
      const error = ToolError.apiError("rest-tool", 404, "Not Found");
      expect(error.toolId).toBe("rest-tool");
    });

    it("should include toolId and statusCode in details", () => {
      const error = ToolError.apiError("rest-tool", 422, "Unprocessable Entity");
      expect(error.details).toEqual({ toolId: "rest-tool", statusCode: 422 });
    });

    describe("retryable based on statusCode", () => {
      it("should not be retryable for 4xx status codes", () => {
        const codes = [400, 401, 403, 404, 409, 422, 429, 499];
        for (const statusCode of codes) {
          const error = ToolError.apiError("rest-tool", statusCode, "client error");
          expect(error.retryable).toBe(false);
        }
      });

      it("should be retryable for 5xx status codes", () => {
        const codes = [500, 502, 503, 504];
        for (const statusCode of codes) {
          const error = ToolError.apiError("rest-tool", statusCode, "server error");
          expect(error.retryable).toBe(true);
        }
      });

      it("should not be retryable for exactly 499 (boundary below 500)", () => {
        const error = ToolError.apiError("rest-tool", 499, "edge case");
        expect(error.retryable).toBe(false);
      });

      it("should be retryable for exactly 500 (boundary at 500)", () => {
        const error = ToolError.apiError("rest-tool", 500, "internal server error");
        expect(error.retryable).toBe(true);
      });
    });
  });

  describe("resourceNotFound", () => {
    it("should create a resource-not-found error with correct code and message", () => {
      const error = ToolError.resourceNotFound("db-tool", "Document", "doc-123");

      expect(error).toBeInstanceOf(ToolError);
      expect(error.code).toBe(ToolErrorCode.RESOURCE_NOT_FOUND);
      expect(error.message).toBe(
        "Resource 'Document:doc-123' not found in tool 'db-tool'",
      );
    });

    it("should set toolId on the error", () => {
      const error = ToolError.resourceNotFound("db-tool", "Document", "doc-123");
      expect(error.toolId).toBe("db-tool");
    });

    it("should not be retryable", () => {
      const error = ToolError.resourceNotFound("db-tool", "Document", "doc-123");
      expect(error.retryable).toBe(false);
    });

    it("should include toolId, resourceType and resourceId in details", () => {
      const error = ToolError.resourceNotFound("db-tool", "Document", "doc-123");
      expect(error.details).toEqual({
        toolId: "db-tool",
        resourceType: "Document",
        resourceId: "doc-123",
      });
    });
  });

  describe("fromError", () => {
    it("should return the same ToolError instance unchanged (passthrough)", () => {
      const original = ToolError.notFound("some-tool");
      const result = ToolError.fromError(original);
      expect(result).toBe(original);
    });

    it("should wrap a standard Error into a ToolError", () => {
      const cause = new Error("unexpected failure");
      const result = ToolError.fromError(cause, ToolErrorCode.EXECUTION_FAILED);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("unexpected failure");
      expect(result.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(result.cause).toBe(cause);
    });

    it("should use UNKNOWN code as default when wrapping a standard Error", () => {
      const cause = new Error("some error");
      const result = ToolError.fromError(cause);

      expect(result.code).toBe(ToolErrorCode.UNKNOWN);
    });

    it("should handle a string error", () => {
      const result = ToolError.fromError("string error message");

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("string error message");
      expect(result.code).toBe(ToolErrorCode.UNKNOWN);
    });

    it("should handle an unknown/non-Error value", () => {
      const result = ToolError.fromError(42);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("Unknown tool error");
    });

    it("should handle null as an unknown value", () => {
      const result = ToolError.fromError(null);
      expect(result.message).toBe("Unknown tool error");
    });

    it("should handle undefined as an unknown value", () => {
      const result = ToolError.fromError(undefined);
      expect(result.message).toBe("Unknown tool error");
    });

    it("should extract toolId from details when wrapping a standard Error", () => {
      const cause = new Error("error");
      const result = ToolError.fromError(cause, ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
      });

      expect(result.toolId).toBe("my-tool");
    });

    it("should extract toolId from details when handling a string error", () => {
      const result = ToolError.fromError("string error", ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
      });

      expect(result.toolId).toBe("my-tool");
    });

    it("should pass through details to the resulting ToolError", () => {
      const cause = new Error("error");
      const result = ToolError.fromError(cause, ToolErrorCode.UNKNOWN, {
        toolId: "my-tool",
        extra: "context",
      });

      expect(result.details).toBeDefined();
      expect((result.details as Record<string, unknown>)["extra"]).toBe("context");
    });

    it("should not wrap an EngineError subclass that is not a ToolError as passthrough", () => {
      // EngineError is NOT a ToolError, so fromError should wrap it
      const engineError = new EngineError("engine-level error");
      const result = ToolError.fromError(engineError);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("engine-level error");
      expect(result.cause).toBe(engineError);
    });
  });

  describe("fromToolError", () => {
    it("should pass through an existing ToolError unchanged", () => {
      const original = ToolError.notFound("some-tool");
      const result = ToolError.fromToolError(original);
      expect(result).toBe(original);
    });

    it("should wrap a standard Error with a toolId", () => {
      const cause = new Error("execution error");
      const result = ToolError.fromToolError(cause, "my-tool", ToolErrorCode.EXECUTION_FAILED);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("execution error");
      expect(result.toolId).toBe("my-tool");
      expect(result.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(result.cause).toBe(cause);
    });

    it("should use UNKNOWN code as default", () => {
      const cause = new Error("error");
      const result = ToolError.fromToolError(cause, "my-tool");
      expect(result.code).toBe(ToolErrorCode.UNKNOWN);
    });

    it("should handle a string error with a toolId", () => {
      const result = ToolError.fromToolError("string error", "my-tool");

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("string error");
      expect(result.toolId).toBe("my-tool");
    });

    it("should handle an unknown value with a toolId", () => {
      const result = ToolError.fromToolError({ weird: true }, "my-tool");

      expect(result).toBeInstanceOf(ToolError);
      expect(result.message).toBe("Unknown tool error");
      expect(result.toolId).toBe("my-tool");
    });

    it("should work without providing a toolId", () => {
      const cause = new Error("some error");
      const result = ToolError.fromToolError(cause);

      expect(result).toBeInstanceOf(ToolError);
      expect(result.toolId).toBeUndefined();
    });

    it("should work without providing a toolId or code", () => {
      const result = ToolError.fromToolError("bare string");

      expect(result).toBeInstanceOf(ToolError);
      expect(result.code).toBe(ToolErrorCode.UNKNOWN);
      expect(result.toolId).toBeUndefined();
    });
  });

  describe("inherited EngineError behaviour", () => {
    it("toJSON should include ToolError fields", () => {
      const error = ToolError.executionFailed("runner-tool", "crashed");
      const json = error.toJSON();

      expect(json.name).toBe("ToolError");
      expect(json.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(json.message).toBe("Tool 'runner-tool' execution failed: crashed");
      expect(json.retryable).toBe(false);
      expect(json.timestamp).toBeDefined();
      expect(json.details).toEqual({ toolId: "runner-tool" });
    });

    it("toJSON should include cause when present", () => {
      const cause = new Error("root cause");
      const error = ToolError.executionFailed("runner-tool", "crashed", cause);
      const json = error.toJSON();

      expect(json.cause).toEqual({ name: "Error", message: "root cause" });
    });

    it("toResponse should return structured error object", () => {
      const error = ToolError.notFound("search-tool");
      const response = error.toResponse();

      expect(response.error.code).toBe(ToolErrorCode.NOT_FOUND);
      expect(typeof response.error.message).toBe("string");
    });

    it("getFullMessage should include code, message, cause and details", () => {
      const cause = new Error("root cause");
      const error = ToolError.executionFailed("runner-tool", "crashed", cause);
      const full = error.getFullMessage();

      expect(full).toContain(ToolErrorCode.EXECUTION_FAILED);
      expect(full).toContain("crashed");
      expect(full).toContain("root cause");
    });

    it("getFullMessage should include details when present", () => {
      const error = ToolError.timeout("slow-tool", 5000);
      const full = error.getFullMessage();

      expect(full).toContain("5000");
    });
  });
});
