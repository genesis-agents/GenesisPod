import { EngineError, ValidationError, TimeoutError } from "../base-error";
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
});
