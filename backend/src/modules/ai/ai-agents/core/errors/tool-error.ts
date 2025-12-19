/**
 * Tool Error System
 * 工具错误分类系统 - 提供细粒度的错误类型和处理
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * 工具错误代码枚举
 * 使用分层编码: CATEGORY_SPECIFIC (如 VALIDATION_SCHEMA_INVALID)
 */
export enum ToolErrorCode {
  // 验证错误 (1xxx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  VALIDATION_SCHEMA_INVALID = 'VALIDATION_SCHEMA_INVALID',
  VALIDATION_REQUIRED_MISSING = 'VALIDATION_REQUIRED_MISSING',
  VALIDATION_TYPE_MISMATCH = 'VALIDATION_TYPE_MISMATCH',
  VALIDATION_FORMAT_INVALID = 'VALIDATION_FORMAT_INVALID',
  VALIDATION_RANGE_EXCEEDED = 'VALIDATION_RANGE_EXCEEDED',

  // 执行错误 (2xxx)
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED = 'EXECUTION_CANCELLED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  // 权限错误 (3xxx)
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PERMISSION_INSUFFICIENT_SCOPE = 'PERMISSION_INSUFFICIENT_SCOPE',
  PERMISSION_AUTHENTICATION_REQUIRED = 'PERMISSION_AUTHENTICATION_REQUIRED',

  // 资源错误 (4xxx)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',

  // 限流错误 (5xxx)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_QUOTA_EXCEEDED = 'RATE_LIMIT_QUOTA_EXCEEDED',
  RATE_LIMIT_CONCURRENT_EXCEEDED = 'RATE_LIMIT_CONCURRENT_EXCEEDED',

  // 外部服务错误 (6xxx)
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_RATE_LIMITED = 'EXTERNAL_SERVICE_RATE_LIMITED',
  EXTERNAL_SERVICE_AUTHENTICATION_FAILED = 'EXTERNAL_SERVICE_AUTHENTICATION_FAILED',

  // 内部错误 (9xxx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INTERNAL_CONFIGURATION_ERROR = 'INTERNAL_CONFIGURATION_ERROR',
  INTERNAL_DEPENDENCY_ERROR = 'INTERNAL_DEPENDENCY_ERROR',
  INTERNAL_UNEXPECTED_ERROR = 'INTERNAL_UNEXPECTED_ERROR',
}

/**
 * 错误代码元数据
 */
export interface ToolErrorCodeMeta {
  /** 错误代码 */
  code: ToolErrorCode;
  /** 数字代码 (用于日志和监控) */
  numericCode: number;
  /** HTTP 状态码映射 */
  httpStatus: number;
  /** 是否可重试 */
  retryable: boolean;
  /** 默认重试延迟 (毫秒) */
  retryDelay?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 错误类别 */
  category: 'validation' | 'execution' | 'permission' | 'resource' | 'rate_limit' | 'external' | 'internal';
}

/**
 * 错误代码元数据注册表
 */
export const TOOL_ERROR_CODES: Record<ToolErrorCode, ToolErrorCodeMeta> = {
  // 验证错误
  [ToolErrorCode.VALIDATION_ERROR]: {
    code: ToolErrorCode.VALIDATION_ERROR,
    numericCode: 1000,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },
  [ToolErrorCode.VALIDATION_SCHEMA_INVALID]: {
    code: ToolErrorCode.VALIDATION_SCHEMA_INVALID,
    numericCode: 1001,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },
  [ToolErrorCode.VALIDATION_REQUIRED_MISSING]: {
    code: ToolErrorCode.VALIDATION_REQUIRED_MISSING,
    numericCode: 1002,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },
  [ToolErrorCode.VALIDATION_TYPE_MISMATCH]: {
    code: ToolErrorCode.VALIDATION_TYPE_MISMATCH,
    numericCode: 1003,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },
  [ToolErrorCode.VALIDATION_FORMAT_INVALID]: {
    code: ToolErrorCode.VALIDATION_FORMAT_INVALID,
    numericCode: 1004,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },
  [ToolErrorCode.VALIDATION_RANGE_EXCEEDED]: {
    code: ToolErrorCode.VALIDATION_RANGE_EXCEEDED,
    numericCode: 1005,
    httpStatus: 400,
    retryable: false,
    category: 'validation',
  },

  // 执行错误
  [ToolErrorCode.EXECUTION_ERROR]: {
    code: ToolErrorCode.EXECUTION_ERROR,
    numericCode: 2000,
    httpStatus: 500,
    retryable: true,
    retryDelay: 1000,
    maxRetries: 3,
    category: 'execution',
  },
  [ToolErrorCode.EXECUTION_TIMEOUT]: {
    code: ToolErrorCode.EXECUTION_TIMEOUT,
    numericCode: 2001,
    httpStatus: 504,
    retryable: true,
    retryDelay: 2000,
    maxRetries: 2,
    category: 'execution',
  },
  [ToolErrorCode.EXECUTION_CANCELLED]: {
    code: ToolErrorCode.EXECUTION_CANCELLED,
    numericCode: 2002,
    httpStatus: 499,
    retryable: false,
    category: 'execution',
  },
  [ToolErrorCode.EXECUTION_FAILED]: {
    code: ToolErrorCode.EXECUTION_FAILED,
    numericCode: 2003,
    httpStatus: 500,
    retryable: true,
    retryDelay: 1000,
    maxRetries: 3,
    category: 'execution',
  },

  // 权限错误
  [ToolErrorCode.PERMISSION_DENIED]: {
    code: ToolErrorCode.PERMISSION_DENIED,
    numericCode: 3000,
    httpStatus: 403,
    retryable: false,
    category: 'permission',
  },
  [ToolErrorCode.PERMISSION_INSUFFICIENT_SCOPE]: {
    code: ToolErrorCode.PERMISSION_INSUFFICIENT_SCOPE,
    numericCode: 3001,
    httpStatus: 403,
    retryable: false,
    category: 'permission',
  },
  [ToolErrorCode.PERMISSION_AUTHENTICATION_REQUIRED]: {
    code: ToolErrorCode.PERMISSION_AUTHENTICATION_REQUIRED,
    numericCode: 3002,
    httpStatus: 401,
    retryable: false,
    category: 'permission',
  },

  // 资源错误
  [ToolErrorCode.RESOURCE_NOT_FOUND]: {
    code: ToolErrorCode.RESOURCE_NOT_FOUND,
    numericCode: 4000,
    httpStatus: 404,
    retryable: false,
    category: 'resource',
  },
  [ToolErrorCode.RESOURCE_ALREADY_EXISTS]: {
    code: ToolErrorCode.RESOURCE_ALREADY_EXISTS,
    numericCode: 4001,
    httpStatus: 409,
    retryable: false,
    category: 'resource',
  },
  [ToolErrorCode.RESOURCE_UNAVAILABLE]: {
    code: ToolErrorCode.RESOURCE_UNAVAILABLE,
    numericCode: 4002,
    httpStatus: 503,
    retryable: true,
    retryDelay: 5000,
    maxRetries: 3,
    category: 'resource',
  },
  [ToolErrorCode.RESOURCE_EXHAUSTED]: {
    code: ToolErrorCode.RESOURCE_EXHAUSTED,
    numericCode: 4003,
    httpStatus: 507,
    retryable: true,
    retryDelay: 10000,
    maxRetries: 2,
    category: 'resource',
  },

  // 限流错误
  [ToolErrorCode.RATE_LIMIT_EXCEEDED]: {
    code: ToolErrorCode.RATE_LIMIT_EXCEEDED,
    numericCode: 5000,
    httpStatus: 429,
    retryable: true,
    retryDelay: 60000,
    maxRetries: 3,
    category: 'rate_limit',
  },
  [ToolErrorCode.RATE_LIMIT_QUOTA_EXCEEDED]: {
    code: ToolErrorCode.RATE_LIMIT_QUOTA_EXCEEDED,
    numericCode: 5001,
    httpStatus: 429,
    retryable: false,
    category: 'rate_limit',
  },
  [ToolErrorCode.RATE_LIMIT_CONCURRENT_EXCEEDED]: {
    code: ToolErrorCode.RATE_LIMIT_CONCURRENT_EXCEEDED,
    numericCode: 5002,
    httpStatus: 429,
    retryable: true,
    retryDelay: 1000,
    maxRetries: 5,
    category: 'rate_limit',
  },

  // 外部服务错误
  [ToolErrorCode.EXTERNAL_SERVICE_ERROR]: {
    code: ToolErrorCode.EXTERNAL_SERVICE_ERROR,
    numericCode: 6000,
    httpStatus: 502,
    retryable: true,
    retryDelay: 2000,
    maxRetries: 3,
    category: 'external',
  },
  [ToolErrorCode.EXTERNAL_SERVICE_TIMEOUT]: {
    code: ToolErrorCode.EXTERNAL_SERVICE_TIMEOUT,
    numericCode: 6001,
    httpStatus: 504,
    retryable: true,
    retryDelay: 3000,
    maxRetries: 2,
    category: 'external',
  },
  [ToolErrorCode.EXTERNAL_SERVICE_UNAVAILABLE]: {
    code: ToolErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
    numericCode: 6002,
    httpStatus: 503,
    retryable: true,
    retryDelay: 5000,
    maxRetries: 3,
    category: 'external',
  },
  [ToolErrorCode.EXTERNAL_SERVICE_RATE_LIMITED]: {
    code: ToolErrorCode.EXTERNAL_SERVICE_RATE_LIMITED,
    numericCode: 6003,
    httpStatus: 429,
    retryable: true,
    retryDelay: 60000,
    maxRetries: 2,
    category: 'external',
  },
  [ToolErrorCode.EXTERNAL_SERVICE_AUTHENTICATION_FAILED]: {
    code: ToolErrorCode.EXTERNAL_SERVICE_AUTHENTICATION_FAILED,
    numericCode: 6004,
    httpStatus: 401,
    retryable: false,
    category: 'external',
  },

  // 内部错误
  [ToolErrorCode.INTERNAL_ERROR]: {
    code: ToolErrorCode.INTERNAL_ERROR,
    numericCode: 9000,
    httpStatus: 500,
    retryable: false,
    category: 'internal',
  },
  [ToolErrorCode.INTERNAL_CONFIGURATION_ERROR]: {
    code: ToolErrorCode.INTERNAL_CONFIGURATION_ERROR,
    numericCode: 9001,
    httpStatus: 500,
    retryable: false,
    category: 'internal',
  },
  [ToolErrorCode.INTERNAL_DEPENDENCY_ERROR]: {
    code: ToolErrorCode.INTERNAL_DEPENDENCY_ERROR,
    numericCode: 9002,
    httpStatus: 500,
    retryable: true,
    retryDelay: 1000,
    maxRetries: 2,
    category: 'internal',
  },
  [ToolErrorCode.INTERNAL_UNEXPECTED_ERROR]: {
    code: ToolErrorCode.INTERNAL_UNEXPECTED_ERROR,
    numericCode: 9003,
    httpStatus: 500,
    retryable: false,
    category: 'internal',
  },
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * 工具错误详情
 */
export interface ToolErrorDetails {
  /** 错误代码 */
  code: ToolErrorCode;
  /** 错误消息 */
  message: string;
  /** 详细信息 */
  details?: unknown;
  /** 是否可重试 */
  retryable: boolean;
  /** 建议重试延迟 (毫秒) */
  retryAfter?: number;
  /** 错误发生时间 */
  timestamp: Date;
  /** 错误来源 (工具类型) */
  source?: string;
  /** 堆栈信息 (仅开发环境) */
  stack?: string;
}

/**
 * 工具执行错误
 * 统一的工具错误类型
 */
export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: unknown;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly timestamp: Date;
  readonly source?: string;
  readonly meta: ToolErrorCodeMeta;

  constructor(
    code: ToolErrorCode,
    message: string,
    options?: {
      details?: unknown;
      source?: string;
      retryAfter?: number;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = options?.details;
    this.source = options?.source;
    this.timestamp = new Date();
    this.meta = TOOL_ERROR_CODES[code];
    this.retryable = this.meta.retryable;
    this.retryAfter = options?.retryAfter ?? this.meta.retryDelay;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // 保持正确的原型链
    Object.setPrototypeOf(this, ToolError.prototype);
  }

  /**
   * 转换为错误详情对象
   */
  toDetails(): ToolErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      timestamp: this.timestamp,
      source: this.source,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }

  /**
   * 转换为 JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      numericCode: this.meta.numericCode,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      timestamp: this.timestamp.toISOString(),
      source: this.source,
    };
  }

  /**
   * 从普通 Error 创建 ToolError
   */
  static fromError(
    error: Error,
    code: ToolErrorCode = ToolErrorCode.INTERNAL_ERROR,
    source?: string,
  ): ToolError {
    if (error instanceof ToolError) {
      return error;
    }

    return new ToolError(code, error.message, {
      source,
      cause: error,
      details: { originalError: error.name },
    });
  }

  /**
   * 创建验证错误
   */
  static validation(
    message: string,
    details?: unknown,
    code: ToolErrorCode = ToolErrorCode.VALIDATION_ERROR,
  ): ToolError {
    return new ToolError(code, message, { details });
  }

  /**
   * 创建超时错误
   */
  static timeout(timeoutMs: number, source?: string): ToolError {
    return new ToolError(
      ToolErrorCode.EXECUTION_TIMEOUT,
      `Execution timeout after ${timeoutMs}ms`,
      { source, details: { timeoutMs } },
    );
  }

  /**
   * 创建取消错误
   */
  static cancelled(reason?: string, source?: string): ToolError {
    return new ToolError(
      ToolErrorCode.EXECUTION_CANCELLED,
      reason || 'Execution was cancelled',
      { source },
    );
  }

  /**
   * 创建资源未找到错误
   */
  static notFound(resource: string, source?: string): ToolError {
    return new ToolError(
      ToolErrorCode.RESOURCE_NOT_FOUND,
      `Resource not found: ${resource}`,
      { source, details: { resource } },
    );
  }

  /**
   * 创建外部服务错误
   */
  static externalService(
    service: string,
    message: string,
    code: ToolErrorCode = ToolErrorCode.EXTERNAL_SERVICE_ERROR,
  ): ToolError {
    return new ToolError(code, `${service}: ${message}`, {
      details: { service },
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 判断错误是否可重试
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return error.retryable;
  }
  return false;
}

/**
 * 获取重试延迟
 */
export function getRetryDelay(error: unknown, attempt: number): number {
  if (error instanceof ToolError && error.retryAfter) {
    // 指数退避
    return error.retryAfter * Math.pow(2, attempt - 1);
  }
  return 1000 * Math.pow(2, attempt - 1);
}

/**
 * 判断是否应该重试
 */
export function shouldRetry(error: unknown, attempt: number): boolean {
  if (!isRetryableError(error)) {
    return false;
  }

  if (error instanceof ToolError) {
    const maxRetries = error.meta.maxRetries ?? 3;
    return attempt < maxRetries;
  }

  return attempt < 3;
}
