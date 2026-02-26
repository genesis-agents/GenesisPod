import {
  AiServiceUnavailableError,
  AiResponseInvalidError,
  AiOutputValidationError,
  AiTaskExecutionError,
} from "../ai-service.exception";

describe("AiServiceUnavailableError", () => {
  it("should extend Error", () => {
    const error = new AiServiceUnavailableError("service down");
    expect(error).toBeInstanceOf(Error);
  });

  it("should set name correctly", () => {
    const error = new AiServiceUnavailableError("service down");
    expect(error.name).toBe("AiServiceUnavailableError");
  });

  it("should set message correctly", () => {
    const error = new AiServiceUnavailableError("service down");
    expect(error.message).toBe("service down");
  });

  it("should use default code when not provided", () => {
    const error = new AiServiceUnavailableError("service down");
    expect(error.code).toBe("AI_SERVICE_UNAVAILABLE");
  });

  it("should use custom code when provided", () => {
    const error = new AiServiceUnavailableError(
      "service down",
      undefined,
      "CUSTOM_CODE",
    );
    expect(error.code).toBe("CUSTOM_CODE");
  });

  it("should set provider when provided", () => {
    const error = new AiServiceUnavailableError("service down", "openai");
    expect(error.provider).toBe("openai");
  });

  it("should leave provider undefined when not provided", () => {
    const error = new AiServiceUnavailableError("service down");
    expect(error.provider).toBeUndefined();
  });

  it("should set all fields when all arguments are provided", () => {
    const error = new AiServiceUnavailableError(
      "api key missing",
      "anthropic",
      "API_KEY_MISSING",
    );
    expect(error.message).toBe("api key missing");
    expect(error.provider).toBe("anthropic");
    expect(error.code).toBe("API_KEY_MISSING");
  });
});

describe("AiResponseInvalidError", () => {
  it("should extend Error", () => {
    const error = new AiResponseInvalidError("bad response");
    expect(error).toBeInstanceOf(Error);
  });

  it("should set name correctly", () => {
    const error = new AiResponseInvalidError("bad response");
    expect(error.name).toBe("AiResponseInvalidError");
  });

  it("should set message correctly", () => {
    const error = new AiResponseInvalidError("bad response");
    expect(error.message).toBe("bad response");
  });

  it("should use default code when not provided", () => {
    const error = new AiResponseInvalidError("bad response");
    expect(error.code).toBe("AI_RESPONSE_INVALID");
  });

  it("should use custom code when provided", () => {
    const error = new AiResponseInvalidError("bad response", "PARSE_ERROR");
    expect(error.code).toBe("PARSE_ERROR");
  });
});

describe("AiOutputValidationError", () => {
  it("should extend Error", () => {
    const error = new AiOutputValidationError("validation failed");
    expect(error).toBeInstanceOf(Error);
  });

  it("should set name correctly", () => {
    const error = new AiOutputValidationError("validation failed");
    expect(error.name).toBe("AiOutputValidationError");
  });

  it("should set message correctly", () => {
    const error = new AiOutputValidationError("validation failed");
    expect(error.message).toBe("validation failed");
  });

  it("should use default code when not provided", () => {
    const error = new AiOutputValidationError("validation failed");
    expect(error.code).toBe("AI_OUTPUT_VALIDATION_FAILED");
  });

  it("should set validationErrors when provided", () => {
    const validationErrors = ["field 'title' is required", "field 'body' is too short"];
    const error = new AiOutputValidationError(
      "validation failed",
      validationErrors,
    );
    expect(error.validationErrors).toEqual(validationErrors);
  });

  it("should leave validationErrors undefined when not provided", () => {
    const error = new AiOutputValidationError("validation failed");
    expect(error.validationErrors).toBeUndefined();
  });

  it("should set all fields when all arguments are provided", () => {
    const validationErrors = ["missing summary"];
    const error = new AiOutputValidationError(
      "output invalid",
      validationErrors,
      "SCHEMA_MISMATCH",
    );
    expect(error.message).toBe("output invalid");
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.code).toBe("SCHEMA_MISMATCH");
  });
});

describe("AiTaskExecutionError", () => {
  it("should extend Error", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error).toBeInstanceOf(Error);
  });

  it("should set name correctly", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error.name).toBe("AiTaskExecutionError");
  });

  it("should set message correctly", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error.message).toBe("task failed");
  });

  it("should use default code when not provided", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error.code).toBe("AI_TASK_EXECUTION_FAILED");
  });

  it("should set taskType when provided", () => {
    const error = new AiTaskExecutionError("task failed", "research");
    expect(error.taskType).toBe("research");
  });

  it("should leave taskType undefined when not provided", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error.taskType).toBeUndefined();
  });

  it("should set attempts when provided", () => {
    const error = new AiTaskExecutionError("task failed", "research", 3);
    expect(error.attempts).toBe(3);
  });

  it("should leave attempts undefined when not provided", () => {
    const error = new AiTaskExecutionError("task failed");
    expect(error.attempts).toBeUndefined();
  });

  it("should set all fields when all arguments are provided", () => {
    const error = new AiTaskExecutionError(
      "max retries exceeded",
      "summarization",
      5,
      "MAX_RETRIES_EXCEEDED",
    );
    expect(error.message).toBe("max retries exceeded");
    expect(error.taskType).toBe("summarization");
    expect(error.attempts).toBe(5);
    expect(error.code).toBe("MAX_RETRIES_EXCEEDED");
  });
});
