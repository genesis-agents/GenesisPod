import {
  EngineError,
  ValidationError,
  TimeoutError,
  CancelledError,
  NotFoundError,
  RetryExhaustedError,
  PreconditionError,
  DependencyError,
  RateLimitError,
} from "../base-error";
import { CommonErrorCode } from "../error-codes";

describe("EngineError", () => {
  it("should create with default code", () => {
    const error = new EngineError("test error");
    expect(error.message).toBe("test error");
    expect(error.code).toBe(CommonErrorCode.UNKNOWN);
    expect(error.name).toBe("EngineError");
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it("should create with custom code and options", () => {
    const cause = new Error("root cause");
    const error = new EngineError("timeout", CommonErrorCode.TIMEOUT, {
      details: { operation: "fetch" },
      cause,
      retryable: true,
      httpStatus: 408,
      userMessage: "Request timed out",
    });

    expect(error.code).toBe(CommonErrorCode.TIMEOUT);
    expect(error.details).toEqual({ operation: "fetch" });
    expect(error.cause).toBe(cause);
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(408);
    expect(error.userMessage).toBe("Request timed out");
  });

  it("should inherit retryable/httpStatus from error code meta", () => {
    const error = new EngineError("rate limited", CommonErrorCode.RATE_LIMITED);
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(429);
  });

  describe("fromError", () => {
    it("should return same instance if already EngineError", () => {
      const original = new EngineError("original");
      const result = EngineError.fromError(original);
      expect(result).toBe(original);
    });

    it("should wrap standard Error", () => {
      const error = new Error("std error");
      const result = EngineError.fromError(error);
      expect(result.message).toBe("std error");
      expect(result.cause).toBe(error);
    });

    it("should handle string errors", () => {
      const result = EngineError.fromError("string error");
      expect(result.message).toBe("string error");
    });

    it("should handle unknown errors", () => {
      const result = EngineError.fromError(42);
      expect(result.message).toBe("Unknown error");
    });
  });

  describe("toJSON", () => {
    it("should serialize to JSON", () => {
      const error = new EngineError("test", CommonErrorCode.NOT_FOUND);
      const json = error.toJSON();
      expect(json.name).toBe("EngineError");
      expect(json.code).toBe(CommonErrorCode.NOT_FOUND);
      expect(json.message).toBe("test");
      expect(json.timestamp).toBeDefined();
    });
  });

  describe("toResponse", () => {
    it("should return user-friendly response", () => {
      const error = new EngineError("internal", CommonErrorCode.NOT_FOUND, {
        userMessage: "Not found",
      });
      const response = error.toResponse();
      expect(response.error.code).toBe(CommonErrorCode.NOT_FOUND);
      expect(response.error.message).toBe("Not found");
    });
  });
});

describe("ValidationError", () => {
  it("should create with validation errors", () => {
    const errors = [
      { path: "name", message: "required", type: "required" },
      { path: "age", message: "must be positive", type: "min" },
    ];
    const error = new ValidationError(errors);
    expect(error.validationErrors).toEqual(errors);
    expect(error.code).toBe(CommonErrorCode.VALIDATION_FAILED);
    expect(error.httpStatus).toBe(400);
    expect(error.retryable).toBe(false);
  });
});

describe("TimeoutError", () => {
  it("should create with timeout value", () => {
    const error = new TimeoutError(5000);
    expect(error.timeout).toBe(5000);
    expect(error.message).toContain("5000ms");
    expect(error.retryable).toBe(true);
  });

  it("should use custom message when provided", () => {
    const error = new TimeoutError(3000, "Custom timeout");
    expect(error.message).toBe("Custom timeout");
    expect(error.timeout).toBe(3000);
  });
});

describe("CancelledError", () => {
  it("should create with default message", () => {
    const error = new CancelledError();
    expect(error.message).toBe("Operation was cancelled");
    expect(error.code).toBe(CommonErrorCode.CANCELLED);
    expect(error.retryable).toBe(false);
    expect(error.httpStatus).toBe(499);
    expect(error).toBeInstanceOf(EngineError);
  });

  it("should use custom message when provided", () => {
    const error = new CancelledError("User cancelled");
    expect(error.message).toBe("User cancelled");
    expect(error.code).toBe(CommonErrorCode.CANCELLED);
  });
});

describe("NotFoundError", () => {
  it("should create with default message", () => {
    const error = new NotFoundError("User", "123");
    expect(error.message).toBe("User '123' not found");
    expect(error.code).toBe(CommonErrorCode.NOT_FOUND);
    expect(error.resourceType).toBe("User");
    expect(error.resourceId).toBe("123");
    expect(error.retryable).toBe(false);
    expect(error.httpStatus).toBe(404);
    expect(error.details).toEqual({ resourceType: "User", resourceId: "123" });
  });

  it("should use custom message when provided", () => {
    const error = new NotFoundError("Agent", "abc", "Agent gone");
    expect(error.message).toBe("Agent gone");
    expect(error.resourceType).toBe("Agent");
    expect(error.resourceId).toBe("abc");
  });
});

describe("RetryExhaustedError", () => {
  it("should create with default message", () => {
    const error = new RetryExhaustedError(3);
    expect(error.message).toBe("Retry exhausted after 3 attempts");
    expect(error.code).toBe(CommonErrorCode.RETRY_EXHAUSTED);
    expect(error.attempts).toBe(3);
    expect(error.lastError).toBeUndefined();
    expect(error.retryable).toBe(false);
  });

  it("should store lastError when provided", () => {
    const cause = new Error("network down");
    const error = new RetryExhaustedError(5, cause);
    expect(error.attempts).toBe(5);
    expect(error.lastError).toBe(cause);
    expect(error.cause).toBe(cause);
  });

  it("should use custom message when provided", () => {
    const error = new RetryExhaustedError(2, undefined, "All retries failed");
    expect(error.message).toBe("All retries failed");
    expect(error.attempts).toBe(2);
  });
});

describe("PreconditionError", () => {
  it("should create from string condition", () => {
    const error = new PreconditionError("must be active");
    expect(error.message).toBe("Precondition failed: must be active");
    expect(error.code).toBe(CommonErrorCode.PRECONDITION_FAILED);
    expect(error.conditions).toEqual(["must be active"]);
    expect(error.retryable).toBe(false);
    expect(error.httpStatus).toBe(412);
  });

  it("should create from array of conditions", () => {
    const error = new PreconditionError(["has API key", "is admin"]);
    expect(error.message).toBe("Precondition failed: has API key, is admin");
    expect(error.conditions).toEqual(["has API key", "is admin"]);
  });

  it("should use custom message when provided", () => {
    const error = new PreconditionError(["cond1"], "Custom precondition msg");
    expect(error.message).toBe("Custom precondition msg");
    expect(error.conditions).toEqual(["cond1"]);
  });
});

describe("DependencyError", () => {
  it("should create with default message", () => {
    const error = new DependencyError(["redis", "postgres"]);
    expect(error.message).toBe("Missing dependencies: redis, postgres");
    expect(error.code).toBe(CommonErrorCode.DEPENDENCY_MISSING);
    expect(error.missingDependencies).toEqual(["redis", "postgres"]);
    expect(error.retryable).toBe(false);
  });

  it("should use custom message when provided", () => {
    const error = new DependencyError(["redis"], "Redis not available");
    expect(error.message).toBe("Redis not available");
    expect(error.missingDependencies).toEqual(["redis"]);
  });
});

describe("RateLimitError", () => {
  it("should create with retryAfter", () => {
    const error = new RateLimitError(5000);
    expect(error.message).toBe("Rate limit exceeded");
    expect(error.code).toBe(CommonErrorCode.RATE_LIMITED);
    expect(error.retryAfter).toBe(5000);
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(429);
    expect(error.details).toEqual({ retryAfter: 5000 });
  });

  it("should create without retryAfter", () => {
    const error = new RateLimitError();
    expect(error.retryAfter).toBeUndefined();
    expect(error.details).toBeUndefined();
    expect(error.retryable).toBe(true);
  });

  it("should use custom message when provided", () => {
    const error = new RateLimitError(1000, "Too fast");
    expect(error.message).toBe("Too fast");
    expect(error.retryAfter).toBe(1000);
  });
});

describe("EngineError - getFullMessage", () => {
  it("should include code and message", () => {
    const error = new EngineError("test", CommonErrorCode.UNKNOWN);
    expect(error.getFullMessage()).toBe("[ENGINE_1000] test");
  });

  it("should include cause", () => {
    const error = new EngineError("fail", CommonErrorCode.UNKNOWN, {
      cause: new Error("root"),
    });
    expect(error.getFullMessage()).toContain("Caused by: root");
  });

  it("should include details", () => {
    const error = new EngineError("fail", CommonErrorCode.UNKNOWN, {
      details: { key: "val" },
    });
    expect(error.getFullMessage()).toContain('Details: {"key":"val"}');
  });
});

describe("EngineError - toJSON edge cases", () => {
  it("should include details and cause when present", () => {
    const error = new EngineError("test", CommonErrorCode.UNKNOWN, {
      details: { foo: "bar" },
      cause: new Error("cause"),
    });
    const json = error.toJSON();
    expect(json.details).toEqual({ foo: "bar" });
    expect(json.cause).toEqual({ name: "Error", message: "cause" });
    expect(json.stack).toBeDefined();
  });

  it("should omit details and cause when absent", () => {
    const error = new EngineError("test");
    const json = error.toJSON();
    expect(json.details).toBeUndefined();
    expect(json.cause).toBeUndefined();
  });
});
