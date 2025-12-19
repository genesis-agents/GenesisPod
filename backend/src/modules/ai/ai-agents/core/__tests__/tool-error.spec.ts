/**
 * Tool Error Tests
 */

import {
  ToolError,
  ToolErrorCode,
  TOOL_ERROR_CODES,
  isRetryableError,
  getRetryDelay,
  shouldRetry,
} from '../errors';

describe('ToolError', () => {
  describe('Constructor', () => {
    it('should create error with code and message', () => {
      const error = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid input');

      expect(error.code).toBe(ToolErrorCode.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ToolError');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create error with details', () => {
      const error = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid input', {
        details: { field: 'query', reason: 'too short' },
        source: 'web_search',
      });

      expect(error.details).toEqual({ field: 'query', reason: 'too short' });
      expect(error.source).toBe('web_search');
    });

    it('should inherit retryable from error code meta', () => {
      const retryableError = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout');
      expect(retryableError.retryable).toBe(true);

      const nonRetryableError = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid');
      expect(nonRetryableError.retryable).toBe(false);
    });
  });

  describe('Static Factories', () => {
    it('should create validation error', () => {
      const error = ToolError.validation('Field is required', { field: 'name' });

      expect(error.code).toBe(ToolErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual({ field: 'name' });
      expect(error.retryable).toBe(false);
    });

    it('should create timeout error', () => {
      const error = ToolError.timeout(30000, 'python_executor');

      expect(error.code).toBe(ToolErrorCode.EXECUTION_TIMEOUT);
      expect(error.message).toContain('30000');
      expect(error.source).toBe('python_executor');
      expect(error.retryable).toBe(true);
    });

    it('should create cancelled error', () => {
      const error = ToolError.cancelled('User cancelled', 'web_search');

      expect(error.code).toBe(ToolErrorCode.EXECUTION_CANCELLED);
      expect(error.message).toBe('User cancelled');
      expect(error.retryable).toBe(false);
    });

    it('should create not found error', () => {
      const error = ToolError.notFound('file://test.txt', 'file_reader');

      expect(error.code).toBe(ToolErrorCode.RESOURCE_NOT_FOUND);
      expect(error.message).toContain('file://test.txt');
      expect(error.retryable).toBe(false);
    });

    it('should create external service error', () => {
      const error = ToolError.externalService('OpenAI API', 'Rate limited');

      expect(error.code).toBe(ToolErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.message).toContain('OpenAI API');
      expect(error.message).toContain('Rate limited');
    });

    it('should create from Error', () => {
      const originalError = new Error('Something went wrong');
      const toolError = ToolError.fromError(originalError, ToolErrorCode.INTERNAL_ERROR, 'test');

      expect(toolError.code).toBe(ToolErrorCode.INTERNAL_ERROR);
      expect(toolError.message).toBe('Something went wrong');
      expect(toolError.source).toBe('test');
      expect(toolError.cause).toBe(originalError);
    });

    it('should return same error if already ToolError', () => {
      const toolError = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Test');
      const result = ToolError.fromError(toolError);

      expect(result).toBe(toolError);
    });
  });

  describe('toDetails', () => {
    it('should convert to details object', () => {
      const error = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout', {
        source: 'python_executor',
        retryAfter: 5000,
      });

      const details = error.toDetails();

      expect(details.code).toBe(ToolErrorCode.EXECUTION_TIMEOUT);
      expect(details.message).toBe('Timeout');
      expect(details.retryable).toBe(true);
      expect(details.retryAfter).toBe(5000);
      expect(details.source).toBe('python_executor');
      expect(details.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('toJSON', () => {
    it('should convert to JSON', () => {
      const error = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid');
      const json = error.toJSON();

      expect(json.name).toBe('ToolError');
      expect(json.code).toBe(ToolErrorCode.VALIDATION_ERROR);
      expect(json.numericCode).toBe(TOOL_ERROR_CODES[ToolErrorCode.VALIDATION_ERROR].numericCode);
      expect(json.message).toBe('Invalid');
      expect(typeof json.timestamp).toBe('string');
    });
  });
});

describe('Error Code Metadata', () => {
  it('should have metadata for all error codes', () => {
    const allCodes = Object.values(ToolErrorCode);

    for (const code of allCodes) {
      const meta = TOOL_ERROR_CODES[code];
      expect(meta).toBeDefined();
      expect(meta.code).toBe(code);
      expect(typeof meta.numericCode).toBe('number');
      expect(typeof meta.httpStatus).toBe('number');
      expect(typeof meta.retryable).toBe('boolean');
      expect(meta.category).toBeDefined();
    }
  });

  it('should have correct HTTP status codes', () => {
    expect(TOOL_ERROR_CODES[ToolErrorCode.VALIDATION_ERROR].httpStatus).toBe(400);
    expect(TOOL_ERROR_CODES[ToolErrorCode.PERMISSION_DENIED].httpStatus).toBe(403);
    expect(TOOL_ERROR_CODES[ToolErrorCode.RESOURCE_NOT_FOUND].httpStatus).toBe(404);
    expect(TOOL_ERROR_CODES[ToolErrorCode.RATE_LIMIT_EXCEEDED].httpStatus).toBe(429);
    expect(TOOL_ERROR_CODES[ToolErrorCode.INTERNAL_ERROR].httpStatus).toBe(500);
  });

  it('should have retry info for retryable errors', () => {
    const retryableCodes = Object.entries(TOOL_ERROR_CODES)
      .filter(([_, meta]) => meta.retryable)
      .map(([code, _]) => code);

    expect(retryableCodes.length).toBeGreaterThan(0);

    for (const code of retryableCodes) {
      const meta = TOOL_ERROR_CODES[code as ToolErrorCode];
      expect(meta.retryDelay).toBeDefined();
      expect(meta.maxRetries).toBeDefined();
    }
  });
});

describe('Helper Functions', () => {
  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      const error = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-ToolError', () => {
      const error = new Error('Regular error');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const error = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout');

      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      expect(delay2).toBe(delay1 * 2);
      expect(delay3).toBe(delay1 * 4);
    });

    it('should use default delay for non-ToolError', () => {
      const error = new Error('Regular error');

      expect(getRetryDelay(error, 1)).toBe(1000);
      expect(getRetryDelay(error, 2)).toBe(2000);
      expect(getRetryDelay(error, 3)).toBe(4000);
    });
  });

  describe('shouldRetry', () => {
    it('should return true when within retry limit', () => {
      const error = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout');

      expect(shouldRetry(error, 1)).toBe(true);
      expect(shouldRetry(error, 2)).toBe(true);
    });

    it('should return false when at retry limit', () => {
      const error = new ToolError(ToolErrorCode.EXECUTION_TIMEOUT, 'Timeout');
      const maxRetries = TOOL_ERROR_CODES[ToolErrorCode.EXECUTION_TIMEOUT].maxRetries!;

      expect(shouldRetry(error, maxRetries)).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      const error = new ToolError(ToolErrorCode.VALIDATION_ERROR, 'Invalid');

      expect(shouldRetry(error, 1)).toBe(false);
    });
  });
});
