import {
  ERROR_PREFIX,
  CommonErrorCode,
  ToolErrorCode,
  SkillErrorCode,
  AgentErrorCode,
  OrchestrationErrorCode,
  LLMErrorCode,
  ERROR_CODE_META,
  getErrorCodeMeta,
  isRetryableError,
  getHttpStatus,
} from "../error-codes";

// ---------------------------------------------------------------------------
// ERROR_PREFIX
// ---------------------------------------------------------------------------

describe("ERROR_PREFIX", () => {
  it("should define all required prefixes with correct values", () => {
    expect(ERROR_PREFIX.ENGINE).toBe("ENGINE");
    expect(ERROR_PREFIX.TOOL).toBe("TOOL");
    expect(ERROR_PREFIX.SKILL).toBe("SKILL");
    expect(ERROR_PREFIX.AGENT).toBe("AGENT");
    expect(ERROR_PREFIX.ORCHESTRATION).toBe("ORCH");
    expect(ERROR_PREFIX.COLLABORATION).toBe("COLLAB");
    expect(ERROR_PREFIX.CONSTRAINT).toBe("CONST");
    expect(ERROR_PREFIX.LLM).toBe("LLM");
    expect(ERROR_PREFIX.MEMORY).toBe("MEM");
  });

  it("should have exactly 9 prefix entries", () => {
    expect(Object.keys(ERROR_PREFIX)).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// Error code constants
// ---------------------------------------------------------------------------

describe("CommonErrorCode", () => {
  describe("system errors (1xxx)", () => {
    it("UNKNOWN should equal ENGINE_1000", () => {
      expect(CommonErrorCode.UNKNOWN).toBe("ENGINE_1000");
    });

    it("INTERNAL should equal ENGINE_1001", () => {
      expect(CommonErrorCode.INTERNAL).toBe("ENGINE_1001");
    });

    it("NOT_IMPLEMENTED should equal ENGINE_1002", () => {
      expect(CommonErrorCode.NOT_IMPLEMENTED).toBe("ENGINE_1002");
    });

    it("DEPRECATED should equal ENGINE_1003", () => {
      expect(CommonErrorCode.DEPRECATED).toBe("ENGINE_1003");
    });
  });

  describe("validation errors (2xxx)", () => {
    it("VALIDATION_FAILED should equal ENGINE_2000", () => {
      expect(CommonErrorCode.VALIDATION_FAILED).toBe("ENGINE_2000");
    });

    it("INVALID_INPUT should equal ENGINE_2001", () => {
      expect(CommonErrorCode.INVALID_INPUT).toBe("ENGINE_2001");
    });

    it("INVALID_OUTPUT should equal ENGINE_2002", () => {
      expect(CommonErrorCode.INVALID_OUTPUT).toBe("ENGINE_2002");
    });

    it("SCHEMA_MISMATCH should equal ENGINE_2003", () => {
      expect(CommonErrorCode.SCHEMA_MISMATCH).toBe("ENGINE_2003");
    });

    it("MISSING_REQUIRED should equal ENGINE_2004", () => {
      expect(CommonErrorCode.MISSING_REQUIRED).toBe("ENGINE_2004");
    });

    it("TYPE_ERROR should equal ENGINE_2005", () => {
      expect(CommonErrorCode.TYPE_ERROR).toBe("ENGINE_2005");
    });
  });

  describe("execution errors (3xxx)", () => {
    it("EXECUTION_FAILED should equal ENGINE_3000", () => {
      expect(CommonErrorCode.EXECUTION_FAILED).toBe("ENGINE_3000");
    });

    it("TIMEOUT should equal ENGINE_3001", () => {
      expect(CommonErrorCode.TIMEOUT).toBe("ENGINE_3001");
    });

    it("CANCELLED should equal ENGINE_3002", () => {
      expect(CommonErrorCode.CANCELLED).toBe("ENGINE_3002");
    });

    it("RETRY_EXHAUSTED should equal ENGINE_3003", () => {
      expect(CommonErrorCode.RETRY_EXHAUSTED).toBe("ENGINE_3003");
    });

    it("PRECONDITION_FAILED should equal ENGINE_3004", () => {
      expect(CommonErrorCode.PRECONDITION_FAILED).toBe("ENGINE_3004");
    });
  });

  describe("resource errors (4xxx)", () => {
    it("NOT_FOUND should equal ENGINE_4000", () => {
      expect(CommonErrorCode.NOT_FOUND).toBe("ENGINE_4000");
    });

    it("ALREADY_EXISTS should equal ENGINE_4001", () => {
      expect(CommonErrorCode.ALREADY_EXISTS).toBe("ENGINE_4001");
    });

    it("RESOURCE_EXHAUSTED should equal ENGINE_4002", () => {
      expect(CommonErrorCode.RESOURCE_EXHAUSTED).toBe("ENGINE_4002");
    });

    it("RATE_LIMITED should equal ENGINE_4003", () => {
      expect(CommonErrorCode.RATE_LIMITED).toBe("ENGINE_4003");
    });

    it("QUOTA_EXCEEDED should equal ENGINE_4004", () => {
      expect(CommonErrorCode.QUOTA_EXCEEDED).toBe("ENGINE_4004");
    });
  });

  describe("permission errors (5xxx)", () => {
    it("UNAUTHORIZED should equal ENGINE_5000", () => {
      expect(CommonErrorCode.UNAUTHORIZED).toBe("ENGINE_5000");
    });

    it("FORBIDDEN should equal ENGINE_5001", () => {
      expect(CommonErrorCode.FORBIDDEN).toBe("ENGINE_5001");
    });

    it("ACCESS_DENIED should equal ENGINE_5002", () => {
      expect(CommonErrorCode.ACCESS_DENIED).toBe("ENGINE_5002");
    });
  });

  describe("dependency errors (6xxx)", () => {
    it("DEPENDENCY_MISSING should equal ENGINE_6000", () => {
      expect(CommonErrorCode.DEPENDENCY_MISSING).toBe("ENGINE_6000");
    });

    it("DEPENDENCY_FAILED should equal ENGINE_6001", () => {
      expect(CommonErrorCode.DEPENDENCY_FAILED).toBe("ENGINE_6001");
    });

    it("CIRCULAR_DEPENDENCY should equal ENGINE_6002", () => {
      expect(CommonErrorCode.CIRCULAR_DEPENDENCY).toBe("ENGINE_6002");
    });
  });
});

describe("ToolErrorCode", () => {
  it("UNKNOWN should equal TOOL_1000", () => {
    expect(ToolErrorCode.UNKNOWN).toBe("TOOL_1000");
  });

  it("NOT_FOUND should equal TOOL_1001", () => {
    expect(ToolErrorCode.NOT_FOUND).toBe("TOOL_1001");
  });

  it("NOT_REGISTERED should equal TOOL_1002", () => {
    expect(ToolErrorCode.NOT_REGISTERED).toBe("TOOL_1002");
  });

  it("DISABLED should equal TOOL_1003", () => {
    expect(ToolErrorCode.DISABLED).toBe("TOOL_1003");
  });

  it("INVALID_INPUT should equal TOOL_2000", () => {
    expect(ToolErrorCode.INVALID_INPUT).toBe("TOOL_2000");
  });

  it("MISSING_PARAMETER should equal TOOL_2001", () => {
    expect(ToolErrorCode.MISSING_PARAMETER).toBe("TOOL_2001");
  });

  it("PARAMETER_TYPE_ERROR should equal TOOL_2002", () => {
    expect(ToolErrorCode.PARAMETER_TYPE_ERROR).toBe("TOOL_2002");
  });

  it("INPUT_TOO_LARGE should equal TOOL_2003", () => {
    expect(ToolErrorCode.INPUT_TOO_LARGE).toBe("TOOL_2003");
  });

  it("EXECUTION_FAILED should equal TOOL_3000", () => {
    expect(ToolErrorCode.EXECUTION_FAILED).toBe("TOOL_3000");
  });

  it("TIMEOUT should equal TOOL_3001", () => {
    expect(ToolErrorCode.TIMEOUT).toBe("TOOL_3001");
  });

  it("CANCELLED should equal TOOL_3002", () => {
    expect(ToolErrorCode.CANCELLED).toBe("TOOL_3002");
  });

  it("RATE_LIMITED should equal TOOL_3003", () => {
    expect(ToolErrorCode.RATE_LIMITED).toBe("TOOL_3003");
  });

  it("EXTERNAL_SERVICE_ERROR should equal TOOL_4000", () => {
    expect(ToolErrorCode.EXTERNAL_SERVICE_ERROR).toBe("TOOL_4000");
  });

  it("NETWORK_ERROR should equal TOOL_4001", () => {
    expect(ToolErrorCode.NETWORK_ERROR).toBe("TOOL_4001");
  });

  it("API_ERROR should equal TOOL_4002", () => {
    expect(ToolErrorCode.API_ERROR).toBe("TOOL_4002");
  });

  it("AUTHENTICATION_ERROR should equal TOOL_4003", () => {
    expect(ToolErrorCode.AUTHENTICATION_ERROR).toBe("TOOL_4003");
  });

  it("RESOURCE_NOT_FOUND should equal TOOL_5000", () => {
    expect(ToolErrorCode.RESOURCE_NOT_FOUND).toBe("TOOL_5000");
  });

  it("RESOURCE_ACCESS_DENIED should equal TOOL_5001", () => {
    expect(ToolErrorCode.RESOURCE_ACCESS_DENIED).toBe("TOOL_5001");
  });

  it("RESOURCE_EXHAUSTED should equal TOOL_5002", () => {
    expect(ToolErrorCode.RESOURCE_EXHAUSTED).toBe("TOOL_5002");
  });
});

describe("SkillErrorCode", () => {
  it("UNKNOWN should equal SKILL_1000", () => {
    expect(SkillErrorCode.UNKNOWN).toBe("SKILL_1000");
  });

  it("NOT_FOUND should equal SKILL_1001", () => {
    expect(SkillErrorCode.NOT_FOUND).toBe("SKILL_1001");
  });

  it("NOT_REGISTERED should equal SKILL_1002", () => {
    expect(SkillErrorCode.NOT_REGISTERED).toBe("SKILL_1002");
  });

  it("DISABLED should equal SKILL_1003", () => {
    expect(SkillErrorCode.DISABLED).toBe("SKILL_1003");
  });

  it("PRECONDITION_FAILED should equal SKILL_2000", () => {
    expect(SkillErrorCode.PRECONDITION_FAILED).toBe("SKILL_2000");
  });

  it("MISSING_TOOL should equal SKILL_2001", () => {
    expect(SkillErrorCode.MISSING_TOOL).toBe("SKILL_2001");
  });

  it("MISSING_SKILL should equal SKILL_2002", () => {
    expect(SkillErrorCode.MISSING_SKILL).toBe("SKILL_2002");
  });

  it("EXECUTION_FAILED should equal SKILL_3000", () => {
    expect(SkillErrorCode.EXECUTION_FAILED).toBe("SKILL_3000");
  });

  it("TIMEOUT should equal SKILL_3001", () => {
    expect(SkillErrorCode.TIMEOUT).toBe("SKILL_3001");
  });

  it("CANCELLED should equal SKILL_3002", () => {
    expect(SkillErrorCode.CANCELLED).toBe("SKILL_3002");
  });

  it("FALLBACK_FAILED should equal SKILL_3003", () => {
    expect(SkillErrorCode.FALLBACK_FAILED).toBe("SKILL_3003");
  });

  it("COMPOSITION_FAILED should equal SKILL_4000", () => {
    expect(SkillErrorCode.COMPOSITION_FAILED).toBe("SKILL_4000");
  });

  it("TOOL_CALL_FAILED should equal SKILL_4001", () => {
    expect(SkillErrorCode.TOOL_CALL_FAILED).toBe("SKILL_4001");
  });

  it("LLM_CALL_FAILED should equal SKILL_4002", () => {
    expect(SkillErrorCode.LLM_CALL_FAILED).toBe("SKILL_4002");
  });
});

describe("AgentErrorCode", () => {
  it("UNKNOWN should equal AGENT_1000", () => {
    expect(AgentErrorCode.UNKNOWN).toBe("AGENT_1000");
  });

  it("NOT_FOUND should equal AGENT_1001", () => {
    expect(AgentErrorCode.NOT_FOUND).toBe("AGENT_1001");
  });

  it("NOT_REGISTERED should equal AGENT_1002", () => {
    expect(AgentErrorCode.NOT_REGISTERED).toBe("AGENT_1002");
  });

  it("NOT_READY should equal AGENT_1003", () => {
    expect(AgentErrorCode.NOT_READY).toBe("AGENT_1003");
  });

  it("INVALID_MODE should equal AGENT_1004", () => {
    expect(AgentErrorCode.INVALID_MODE).toBe("AGENT_1004");
  });

  it("MISSING_DEPENDENCY should equal AGENT_1005", () => {
    expect(AgentErrorCode.MISSING_DEPENDENCY).toBe("AGENT_1005");
  });

  it("PLANNING_FAILED should equal AGENT_2000", () => {
    expect(AgentErrorCode.PLANNING_FAILED).toBe("AGENT_2000");
  });

  it("INVALID_PLAN should equal AGENT_2001", () => {
    expect(AgentErrorCode.INVALID_PLAN).toBe("AGENT_2001");
  });

  it("PLAN_TIMEOUT should equal AGENT_2002", () => {
    expect(AgentErrorCode.PLAN_TIMEOUT).toBe("AGENT_2002");
  });

  it("EXECUTION_FAILED should equal AGENT_3000", () => {
    expect(AgentErrorCode.EXECUTION_FAILED).toBe("AGENT_3000");
  });

  it("MAX_ITERATIONS_EXCEEDED should equal AGENT_3001", () => {
    expect(AgentErrorCode.MAX_ITERATIONS_EXCEEDED).toBe("AGENT_3001");
  });

  it("MAX_TOOL_CALLS_EXCEEDED should equal AGENT_3002", () => {
    expect(AgentErrorCode.MAX_TOOL_CALLS_EXCEEDED).toBe("AGENT_3002");
  });

  it("TIMEOUT should equal AGENT_3003", () => {
    expect(AgentErrorCode.TIMEOUT).toBe("AGENT_3003");
  });

  it("CANCELLED should equal AGENT_3004", () => {
    expect(AgentErrorCode.CANCELLED).toBe("AGENT_3004");
  });

  it("ROUTING_FAILED should equal AGENT_4000", () => {
    expect(AgentErrorCode.ROUTING_FAILED).toBe("AGENT_4000");
  });

  it("NO_MATCHING_AGENT should equal AGENT_4001", () => {
    expect(AgentErrorCode.NO_MATCHING_AGENT).toBe("AGENT_4001");
  });

  it("AMBIGUOUS_ROUTING should equal AGENT_4002", () => {
    expect(AgentErrorCode.AMBIGUOUS_ROUTING).toBe("AGENT_4002");
  });
});

describe("OrchestrationErrorCode", () => {
  it("UNKNOWN should equal ORCH_1000", () => {
    expect(OrchestrationErrorCode.UNKNOWN).toBe("ORCH_1000");
  });

  it("WORKFLOW_NOT_FOUND should equal ORCH_1001", () => {
    expect(OrchestrationErrorCode.WORKFLOW_NOT_FOUND).toBe("ORCH_1001");
  });

  it("INVALID_WORKFLOW should equal ORCH_1002", () => {
    expect(OrchestrationErrorCode.INVALID_WORKFLOW).toBe("ORCH_1002");
  });

  it("STEP_FAILED should equal ORCH_2000", () => {
    expect(OrchestrationErrorCode.STEP_FAILED).toBe("ORCH_2000");
  });

  it("STEP_TIMEOUT should equal ORCH_2001", () => {
    expect(OrchestrationErrorCode.STEP_TIMEOUT).toBe("ORCH_2001");
  });

  it("STEP_SKIPPED should equal ORCH_2002", () => {
    expect(OrchestrationErrorCode.STEP_SKIPPED).toBe("ORCH_2002");
  });

  it("STEP_DEPENDENCY_FAILED should equal ORCH_2003", () => {
    expect(OrchestrationErrorCode.STEP_DEPENDENCY_FAILED).toBe("ORCH_2003");
  });

  it("EXECUTION_FAILED should equal ORCH_3000", () => {
    expect(OrchestrationErrorCode.EXECUTION_FAILED).toBe("ORCH_3000");
  });

  it("CHECKPOINT_FAILED should equal ORCH_3001", () => {
    expect(OrchestrationErrorCode.CHECKPOINT_FAILED).toBe("ORCH_3001");
  });

  it("ROLLBACK_FAILED should equal ORCH_3002", () => {
    expect(OrchestrationErrorCode.ROLLBACK_FAILED).toBe("ORCH_3002");
  });

  it("INVALID_STATE should equal ORCH_4000", () => {
    expect(OrchestrationErrorCode.INVALID_STATE).toBe("ORCH_4000");
  });

  it("STATE_TRANSITION_ERROR should equal ORCH_4001", () => {
    expect(OrchestrationErrorCode.STATE_TRANSITION_ERROR).toBe("ORCH_4001");
  });
});

describe("LLMErrorCode", () => {
  it("UNKNOWN should equal LLM_1000", () => {
    expect(LLMErrorCode.UNKNOWN).toBe("LLM_1000");
  });

  it("PROVIDER_NOT_FOUND should equal LLM_1001", () => {
    expect(LLMErrorCode.PROVIDER_NOT_FOUND).toBe("LLM_1001");
  });

  it("MODEL_NOT_FOUND should equal LLM_1002", () => {
    expect(LLMErrorCode.MODEL_NOT_FOUND).toBe("LLM_1002");
  });

  it("API_ERROR should equal LLM_2000", () => {
    expect(LLMErrorCode.API_ERROR).toBe("LLM_2000");
  });

  it("AUTHENTICATION_ERROR should equal LLM_2001", () => {
    expect(LLMErrorCode.AUTHENTICATION_ERROR).toBe("LLM_2001");
  });

  it("RATE_LIMITED should equal LLM_2002", () => {
    expect(LLMErrorCode.RATE_LIMITED).toBe("LLM_2002");
  });

  it("QUOTA_EXCEEDED should equal LLM_2003", () => {
    expect(LLMErrorCode.QUOTA_EXCEEDED).toBe("LLM_2003");
  });

  it("INVALID_REQUEST should equal LLM_3000", () => {
    expect(LLMErrorCode.INVALID_REQUEST).toBe("LLM_3000");
  });

  it("CONTEXT_TOO_LONG should equal LLM_3001", () => {
    expect(LLMErrorCode.CONTEXT_TOO_LONG).toBe("LLM_3001");
  });

  it("CONTENT_FILTERED should equal LLM_3002", () => {
    expect(LLMErrorCode.CONTENT_FILTERED).toBe("LLM_3002");
  });

  it("INVALID_RESPONSE should equal LLM_4000", () => {
    expect(LLMErrorCode.INVALID_RESPONSE).toBe("LLM_4000");
  });

  it("PARSE_ERROR should equal LLM_4001", () => {
    expect(LLMErrorCode.PARSE_ERROR).toBe("LLM_4001");
  });

  it("EMPTY_RESPONSE should equal LLM_4002", () => {
    expect(LLMErrorCode.EMPTY_RESPONSE).toBe("LLM_4002");
  });
});

// ---------------------------------------------------------------------------
// ERROR_CODE_META mapping
// ---------------------------------------------------------------------------

describe("ERROR_CODE_META", () => {
  describe("CommonErrorCode entries", () => {
    it("UNKNOWN entry has httpStatus 500, retryable false", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.UNKNOWN];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(500);
      expect(meta.retryable).toBe(false);
      expect(meta.userMessage).toBeDefined();
    });

    it("TIMEOUT entry has httpStatus 408, retryable true, retryDelay 1000, maxRetries 3", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.TIMEOUT];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(408);
      expect(meta.retryable).toBe(true);
      expect(meta.retryDelay).toBe(1000);
      expect(meta.maxRetries).toBe(3);
      expect(meta.userMessage).toBeDefined();
    });

    it("RATE_LIMITED entry has httpStatus 429, retryable true, retryDelay 5000, maxRetries 3", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.RATE_LIMITED];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(429);
      expect(meta.retryable).toBe(true);
      expect(meta.retryDelay).toBe(5000);
      expect(meta.maxRetries).toBe(3);
      expect(meta.userMessage).toBeDefined();
    });

    it("VALIDATION_FAILED entry has httpStatus 400, retryable false", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.VALIDATION_FAILED];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(400);
      expect(meta.retryable).toBe(false);
      expect(meta.userMessage).toBeDefined();
    });

    it("NOT_FOUND entry has httpStatus 404, retryable false", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.NOT_FOUND];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(404);
      expect(meta.retryable).toBe(false);
      expect(meta.userMessage).toBeDefined();
    });

    it("UNAUTHORIZED entry has httpStatus 401, retryable false", () => {
      const meta = ERROR_CODE_META[CommonErrorCode.UNAUTHORIZED];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(401);
      expect(meta.retryable).toBe(false);
      expect(meta.userMessage).toBeDefined();
    });
  });

  describe("ToolErrorCode entries", () => {
    it("TIMEOUT entry has httpStatus 408, retryable true, retryDelay 1000, maxRetries 2", () => {
      const meta = ERROR_CODE_META[ToolErrorCode.TIMEOUT];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(408);
      expect(meta.retryable).toBe(true);
      expect(meta.retryDelay).toBe(1000);
      expect(meta.maxRetries).toBe(2);
      expect(meta.userMessage).toBeDefined();
    });

    it("EXTERNAL_SERVICE_ERROR entry has httpStatus 502, retryable true, retryDelay 2000, maxRetries 2", () => {
      const meta = ERROR_CODE_META[ToolErrorCode.EXTERNAL_SERVICE_ERROR];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(502);
      expect(meta.retryable).toBe(true);
      expect(meta.retryDelay).toBe(2000);
      expect(meta.maxRetries).toBe(2);
      expect(meta.userMessage).toBeDefined();
    });
  });

  describe("LLMErrorCode entries", () => {
    it("RATE_LIMITED entry has httpStatus 429, retryable true, retryDelay 10000, maxRetries 3", () => {
      const meta = ERROR_CODE_META[LLMErrorCode.RATE_LIMITED];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(429);
      expect(meta.retryable).toBe(true);
      expect(meta.retryDelay).toBe(10000);
      expect(meta.maxRetries).toBe(3);
      expect(meta.userMessage).toBeDefined();
    });

    it("CONTEXT_TOO_LONG entry has httpStatus 400, retryable false", () => {
      const meta = ERROR_CODE_META[LLMErrorCode.CONTEXT_TOO_LONG];
      expect(meta).toBeDefined();
      expect(meta.httpStatus).toBe(400);
      expect(meta.retryable).toBe(false);
      expect(meta.userMessage).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// getErrorCodeMeta
// ---------------------------------------------------------------------------

describe("getErrorCodeMeta", () => {
  it("returns meta for a known common error code", () => {
    const meta = getErrorCodeMeta(CommonErrorCode.TIMEOUT);
    expect(meta).toBeDefined();
    expect(meta?.httpStatus).toBe(408);
    expect(meta?.retryable).toBe(true);
  });

  it("returns meta for a known tool error code", () => {
    const meta = getErrorCodeMeta(ToolErrorCode.TIMEOUT);
    expect(meta).toBeDefined();
    expect(meta?.httpStatus).toBe(408);
  });

  it("returns meta for a known LLM error code", () => {
    const meta = getErrorCodeMeta(LLMErrorCode.RATE_LIMITED);
    expect(meta).toBeDefined();
    expect(meta?.httpStatus).toBe(429);
    expect(meta?.retryable).toBe(true);
  });

  it("returns meta for CommonErrorCode.NOT_FOUND", () => {
    const meta = getErrorCodeMeta(CommonErrorCode.NOT_FOUND);
    expect(meta).toBeDefined();
    expect(meta?.httpStatus).toBe(404);
    expect(meta?.retryable).toBe(false);
  });

  it("returns meta for CommonErrorCode.VALIDATION_FAILED", () => {
    const meta = getErrorCodeMeta(CommonErrorCode.VALIDATION_FAILED);
    expect(meta).toBeDefined();
    expect(meta?.httpStatus).toBe(400);
    expect(meta?.retryable).toBe(false);
  });

  it("returns undefined for an unknown code", () => {
    const meta = getErrorCodeMeta("UNKNOWN_FAKE_9999");
    expect(meta).toBeUndefined();
  });

  it("returns undefined for an empty string code", () => {
    const meta = getErrorCodeMeta("");
    expect(meta).toBeUndefined();
  });

  it("returns undefined for a code that shares a prefix with known codes but does not exist", () => {
    const meta = getErrorCodeMeta("ENGINE_9999");
    expect(meta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe("isRetryableError", () => {
  describe("returns true for retryable codes", () => {
    it("CommonErrorCode.TIMEOUT is retryable", () => {
      expect(isRetryableError(CommonErrorCode.TIMEOUT)).toBe(true);
    });

    it("CommonErrorCode.RATE_LIMITED is retryable", () => {
      expect(isRetryableError(CommonErrorCode.RATE_LIMITED)).toBe(true);
    });

    it("ToolErrorCode.TIMEOUT is retryable", () => {
      expect(isRetryableError(ToolErrorCode.TIMEOUT)).toBe(true);
    });

    it("ToolErrorCode.EXTERNAL_SERVICE_ERROR is retryable", () => {
      expect(isRetryableError(ToolErrorCode.EXTERNAL_SERVICE_ERROR)).toBe(true);
    });

    it("LLMErrorCode.RATE_LIMITED is retryable", () => {
      expect(isRetryableError(LLMErrorCode.RATE_LIMITED)).toBe(true);
    });
  });

  describe("returns false for non-retryable codes", () => {
    it("CommonErrorCode.VALIDATION_FAILED is not retryable", () => {
      expect(isRetryableError(CommonErrorCode.VALIDATION_FAILED)).toBe(false);
    });

    it("CommonErrorCode.NOT_FOUND is not retryable", () => {
      expect(isRetryableError(CommonErrorCode.NOT_FOUND)).toBe(false);
    });

    it("CommonErrorCode.UNKNOWN is not retryable", () => {
      expect(isRetryableError(CommonErrorCode.UNKNOWN)).toBe(false);
    });

    it("CommonErrorCode.UNAUTHORIZED is not retryable", () => {
      expect(isRetryableError(CommonErrorCode.UNAUTHORIZED)).toBe(false);
    });

    it("LLMErrorCode.CONTEXT_TOO_LONG is not retryable", () => {
      expect(isRetryableError(LLMErrorCode.CONTEXT_TOO_LONG)).toBe(false);
    });
  });

  describe("returns false for codes with no meta entry (unknown codes)", () => {
    it("returns false for a completely unknown code", () => {
      expect(isRetryableError("SOME_RANDOM_CODE")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isRetryableError("")).toBe(false);
    });

    it("returns false for a code not in ERROR_CODE_META", () => {
      expect(isRetryableError(AgentErrorCode.UNKNOWN)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getHttpStatus
// ---------------------------------------------------------------------------

describe("getHttpStatus", () => {
  describe("returns correct HTTP status for known codes", () => {
    it("returns 408 for CommonErrorCode.TIMEOUT", () => {
      expect(getHttpStatus(CommonErrorCode.TIMEOUT)).toBe(408);
    });

    it("returns 429 for CommonErrorCode.RATE_LIMITED", () => {
      expect(getHttpStatus(CommonErrorCode.RATE_LIMITED)).toBe(429);
    });

    it("returns 400 for CommonErrorCode.VALIDATION_FAILED", () => {
      expect(getHttpStatus(CommonErrorCode.VALIDATION_FAILED)).toBe(400);
    });

    it("returns 404 for CommonErrorCode.NOT_FOUND", () => {
      expect(getHttpStatus(CommonErrorCode.NOT_FOUND)).toBe(404);
    });

    it("returns 401 for CommonErrorCode.UNAUTHORIZED", () => {
      expect(getHttpStatus(CommonErrorCode.UNAUTHORIZED)).toBe(401);
    });

    it("returns 500 for CommonErrorCode.UNKNOWN", () => {
      expect(getHttpStatus(CommonErrorCode.UNKNOWN)).toBe(500);
    });

    it("returns 408 for ToolErrorCode.TIMEOUT", () => {
      expect(getHttpStatus(ToolErrorCode.TIMEOUT)).toBe(408);
    });

    it("returns 502 for ToolErrorCode.EXTERNAL_SERVICE_ERROR", () => {
      expect(getHttpStatus(ToolErrorCode.EXTERNAL_SERVICE_ERROR)).toBe(502);
    });

    it("returns 429 for LLMErrorCode.RATE_LIMITED", () => {
      expect(getHttpStatus(LLMErrorCode.RATE_LIMITED)).toBe(429);
    });

    it("returns 400 for LLMErrorCode.CONTEXT_TOO_LONG", () => {
      expect(getHttpStatus(LLMErrorCode.CONTEXT_TOO_LONG)).toBe(400);
    });
  });

  describe("returns 500 as default for unknown codes", () => {
    it("returns 500 for a completely unknown code string", () => {
      expect(getHttpStatus("UNKNOWN_CODE_FAKE")).toBe(500);
    });

    it("returns 500 for an empty string", () => {
      expect(getHttpStatus("")).toBe(500);
    });

    it("returns 500 for a code not in ERROR_CODE_META (e.g. AgentErrorCode.TIMEOUT)", () => {
      expect(getHttpStatus(AgentErrorCode.TIMEOUT)).toBe(500);
    });

    it("returns 500 for a code not in ERROR_CODE_META (e.g. OrchestrationErrorCode.UNKNOWN)", () => {
      expect(getHttpStatus(OrchestrationErrorCode.UNKNOWN)).toBe(500);
    });
  });
});
