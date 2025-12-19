/**
 * 安全护栏系统 (Guardrails)
 * 保护工具执行的安全性、合规性和性能
 *
 * 护栏功能:
 * - 内容过滤: 阻止恶意输入和输出
 * - 输出验证: 确保输出符合 Schema 规范
 * - 速率限制: 防止滥用和 DoS 攻击
 * - 成本控制: 限制 Token 使用和执行时间
 * - 隐私保护: 检测和保护敏感信息
 */

import { Injectable, Logger } from "@nestjs/common";
import { JSONSchema } from "../tool/tool.interface";
import { ToolType } from "../agent/agent.types";

// ==================== 护栏类型定义 ====================

/**
 * 内容过滤配置
 */
export interface ContentFilterConfig {
  /**
   * 启用内容过滤
   */
  enabled: boolean;

  /**
   * 阻止的关键词模式（正则表达式）
   */
  blockedPatterns?: string[];

  /**
   * 阻止的内容类别
   */
  blockedCategories?: ContentCategory[];

  /**
   * 敏感信息检测
   */
  piiDetection?: boolean;

  /**
   * 最大输入长度（字符）
   */
  maxInputLength?: number;
}

/**
 * 内容类别
 */
export enum ContentCategory {
  HATE_SPEECH = "hate_speech",
  VIOLENCE = "violence",
  SEXUAL = "sexual",
  SELF_HARM = "self_harm",
  ILLEGAL = "illegal",
  SPAM = "spam",
  MALWARE = "malware",
}

/**
 * 输出验证配置
 */
export interface OutputValidationConfig {
  /**
   * 启用输出验证
   */
  enabled: boolean;

  /**
   * 输出 Schema 验证
   */
  schema?: JSONSchema;

  /**
   * 最大输出长度（字符）
   */
  maxOutputLength?: number;

  /**
   * 必需字段
   */
  requiredFields?: string[];

  /**
   * 自定义验证器
   */
  customValidator?: (output: unknown) => ValidationResult;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /**
   * 启用速率限制
   */
  enabled: boolean;

  /**
   * 时间窗口（毫秒）
   */
  windowMs: number;

  /**
   * 最大调用次数
   */
  maxCalls: number;

  /**
   * 限流策略
   */
  strategy?: RateLimitStrategy;

  /**
   * 按用户限流
   */
  perUser?: boolean;

  /**
   * 按工具类型限流
   */
  perTool?: boolean;
}

/**
 * 限流策略
 */
export enum RateLimitStrategy {
  /**
   * 固定窗口
   */
  FIXED_WINDOW = "fixed_window",

  /**
   * 滑动窗口
   */
  SLIDING_WINDOW = "sliding_window",

  /**
   * 令牌桶
   */
  TOKEN_BUCKET = "token_bucket",
}

/**
 * 成本控制配置
 */
export interface CostControlConfig {
  /**
   * 启用成本控制
   */
  enabled: boolean;

  /**
   * 最大 Token 数
   */
  maxTokens?: number;

  /**
   * 最大执行时间（毫秒）
   */
  maxExecutionTime?: number;

  /**
   * 单日最大成本（美元）
   */
  maxDailyCost?: number;

  /**
   * 成本估算器
   */
  costEstimator?: (toolType: ToolType, input: unknown) => number;
}

/**
 * 隐私保护配置
 */
export interface PrivacyConfig {
  /**
   * 启用隐私保护
   */
  enabled: boolean;

  /**
   * 检测个人身份信息 (PII)
   */
  detectPII?: boolean;

  /**
   * 自动脱敏
   */
  autoRedact?: boolean;

  /**
   * 敏感信息类型
   */
  sensitiveTypes?: SensitiveInfoType[];
}

/**
 * 敏感信息类型
 */
export enum SensitiveInfoType {
  EMAIL = "email",
  PHONE = "phone",
  SSN = "ssn", // 社保号
  CREDIT_CARD = "credit_card",
  IP_ADDRESS = "ip_address",
  API_KEY = "api_key",
  PASSWORD = "password",
}

/**
 * 完整护栏配置
 */
export interface GuardrailConfig {
  /**
   * 内容过滤
   */
  contentFilter?: ContentFilterConfig;

  /**
   * 输出验证
   */
  outputValidation?: OutputValidationConfig;

  /**
   * 速率限制
   */
  rateLimit?: RateLimitConfig;

  /**
   * 成本控制
   */
  costControl?: CostControlConfig;

  /**
   * 隐私保护
   */
  privacy?: PrivacyConfig;
}

/**
 * 护栏检查结果
 */
export interface GuardrailResult {
  /**
   * 是否通过
   */
  passed: boolean;

  /**
   * 失败原因
   */
  reason?: string;

  /**
   * 违规类型
   */
  violationType?: ViolationType;

  /**
   * 详细信息
   */
  details?: Record<string, unknown>;

  /**
   * 建议
   */
  suggestions?: string[];
}

/**
 * 违规类型
 */
export enum ViolationType {
  CONTENT_VIOLATION = "content_violation",
  SCHEMA_VIOLATION = "schema_violation",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  COST_LIMIT_EXCEEDED = "cost_limit_exceeded",
  PRIVACY_VIOLATION = "privacy_violation",
  TIMEOUT = "timeout",
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// ==================== 速率限制器 ====================

/**
 * 速率限制记录
 */
interface RateLimitRecord {
  count: number;
  resetTime: number;
  calls: number[];
}

/**
 * 速率限制器
 */
class RateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();

  /**
   * 检查是否超过速率限制
   */
  check(
    key: string,
    config: RateLimitConfig,
    now: number = Date.now(),
  ): boolean {
    if (!config.enabled) {
      return true;
    }

    const record = this.records.get(key);

    if (!record) {
      // 首次调用
      this.records.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
        calls: [now],
      });
      return true;
    }

    // 检查是否需要重置
    if (now >= record.resetTime) {
      this.records.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
        calls: [now],
      });
      return true;
    }

    // 滑动窗口策略
    if (config.strategy === RateLimitStrategy.SLIDING_WINDOW) {
      const windowStart = now - config.windowMs;
      const recentCalls = record.calls.filter((time) => time >= windowStart);

      if (recentCalls.length < config.maxCalls) {
        record.calls = [...recentCalls, now];
        record.count = recentCalls.length + 1;
        this.records.set(key, record);
        return true;
      }
      return false;
    }

    // 固定窗口策略
    if (record.count < config.maxCalls) {
      record.count++;
      record.calls.push(now);
      this.records.set(key, record);
      return true;
    }

    return false;
  }

  /**
   * 重置限流记录
   */
  reset(key: string): void {
    this.records.delete(key);
  }

  /**
   * 清理过期记录
   */
  cleanup(now: number = Date.now()): void {
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetTime) {
        this.records.delete(key);
      }
    }
  }
}

// ==================== 护栏服务 ====================

/**
 * 默认护栏配置
 */
const DEFAULT_GUARDRAIL_CONFIG: Required<GuardrailConfig> = {
  contentFilter: {
    enabled: true,
    blockedPatterns: [
      "(?i)(hack|exploit|malware|virus|trojan)",
      "(?i)(sql injection|xss|csrf)",
      "(?i)(bypass|circumvent|evade)",
    ],
    blockedCategories: [
      ContentCategory.HATE_SPEECH,
      ContentCategory.VIOLENCE,
      ContentCategory.ILLEGAL,
      ContentCategory.MALWARE,
    ],
    piiDetection: true,
    maxInputLength: 100000, // 100KB
  },
  outputValidation: {
    enabled: true,
    maxOutputLength: 1000000, // 1MB
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000, // 1分钟
    maxCalls: 100,
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    perUser: true,
    perTool: false,
  },
  costControl: {
    enabled: true,
    maxTokens: 100000,
    maxExecutionTime: 300000, // 5分钟
    maxDailyCost: 10, // $10
  },
  privacy: {
    enabled: true,
    detectPII: true,
    autoRedact: false,
    sensitiveTypes: [
      SensitiveInfoType.EMAIL,
      SensitiveInfoType.PHONE,
      SensitiveInfoType.CREDIT_CARD,
      SensitiveInfoType.API_KEY,
      SensitiveInfoType.PASSWORD,
    ],
  },
};

/**
 * 护栏服务
 * 提供工具执行的安全保护
 *
 * @example
 * ```typescript
 * const guardrails = new GuardrailService();
 *
 * // 检查输入
 * const inputCheck = await guardrails.checkInput(ToolType.WEB_SEARCH, { query: 'test' });
 * if (!inputCheck.passed) {
 *   throw new Error(inputCheck.reason);
 * }
 *
 * // 检查输出
 * const outputCheck = await guardrails.checkOutput(ToolType.WEB_SEARCH, result);
 * if (!outputCheck.passed) {
 *   throw new Error(outputCheck.reason);
 * }
 * ```
 */
@Injectable()
export class GuardrailService {
  private readonly logger = new Logger(GuardrailService.name);
  private readonly rateLimiter = new RateLimiter();

  /**
   * 护栏配置（按工具类型）
   */
  private readonly configs = new Map<ToolType, GuardrailConfig>();

  /**
   * 默认配置
   */
  private defaultConfig: GuardrailConfig = DEFAULT_GUARDRAIL_CONFIG;

  /**
   * 每日成本跟踪
   */
  private dailyCost = 0;
  private lastResetDate = new Date().toDateString();

  constructor() {
    this.logger.log("Guardrail Service initialized");

    // 定期清理过期的速率限制记录
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000); // 每分钟清理一次
  }

  // ==================== 配置管理 ====================

  /**
   * 设置默认护栏配置
   *
   * @param config 护栏配置
   */
  setDefaultConfig(config: GuardrailConfig): void {
    this.defaultConfig = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  }

  /**
   * 设置特定工具的护栏配置
   *
   * @param toolType 工具类型
   * @param config 护栏配置
   */
  setToolConfig(toolType: ToolType, config: GuardrailConfig): void {
    this.configs.set(toolType, config);
  }

  /**
   * 获取工具的护栏配置
   *
   * @param toolType 工具类型
   * @returns 护栏配置
   */
  private getConfig(toolType: ToolType): GuardrailConfig {
    return this.configs.get(toolType) || this.defaultConfig;
  }

  // ==================== 输入检查 ====================

  /**
   * 检查输入
   *
   * @param toolType 工具类型
   * @param input 输入数据
   * @param userId 用户 ID（可选）
   * @returns 检查结果
   */
  async checkInput(
    toolType: ToolType,
    input: unknown,
    userId?: string,
  ): Promise<GuardrailResult> {
    const config = this.getConfig(toolType);

    // 1. 内容过滤
    if (config.contentFilter?.enabled) {
      const contentCheck = this.checkContent(input, config.contentFilter);
      if (!contentCheck.passed) {
        return contentCheck;
      }
    }

    // 2. 速率限制
    if (config.rateLimit?.enabled && userId) {
      const rateLimitCheck = this.checkRateLimit(
        userId,
        toolType,
        config.rateLimit,
      );
      if (!rateLimitCheck.passed) {
        return rateLimitCheck;
      }
    }

    // 3. 隐私保护
    if (config.privacy?.enabled) {
      const privacyCheck = this.checkPrivacy(input, config.privacy);
      if (!privacyCheck.passed) {
        return privacyCheck;
      }
    }

    // 4. 成本控制
    if (config.costControl?.enabled) {
      const costCheck = this.checkCost(toolType, input, config.costControl);
      if (!costCheck.passed) {
        return costCheck;
      }
    }

    return { passed: true };
  }

  // ==================== 输出检查 ====================

  /**
   * 检查输出
   *
   * @param toolType 工具类型
   * @param output 输出数据
   * @returns 检查结果
   */
  async checkOutput(
    toolType: ToolType,
    output: unknown,
  ): Promise<GuardrailResult> {
    const config = this.getConfig(toolType);

    // 1. 输出验证
    if (config.outputValidation?.enabled) {
      const validationCheck = this.validateOutput(
        output,
        config.outputValidation,
      );
      if (!validationCheck.passed) {
        return validationCheck;
      }
    }

    // 2. 内容过滤（输出）
    if (config.contentFilter?.enabled) {
      const contentCheck = this.checkContent(output, config.contentFilter);
      if (!contentCheck.passed) {
        return contentCheck;
      }
    }

    // 3. 隐私保护（输出）
    if (config.privacy?.enabled && config.privacy.detectPII) {
      const privacyCheck = this.checkPrivacy(output, config.privacy);
      if (!privacyCheck.passed) {
        return privacyCheck;
      }
    }

    return { passed: true };
  }

  // ==================== 速率限制检查 ====================

  /**
   * 检查速率限制
   *
   * @param userId 用户 ID
   * @param toolType 工具类型
   * @param config 速率限制配置
   * @returns 检查结果
   */
  checkRateLimit(
    userId: string,
    toolType: ToolType,
    config?: RateLimitConfig,
  ): GuardrailResult {
    const rateLimitConfig = config || this.defaultConfig.rateLimit;
    if (!rateLimitConfig || !rateLimitConfig.enabled) {
      return { passed: true };
    }

    // 生成限流 key
    const key = rateLimitConfig.perTool ? `${userId}:${toolType}` : userId;

    const allowed = this.rateLimiter.check(key, rateLimitConfig);

    if (!allowed) {
      return {
        passed: false,
        reason: "Rate limit exceeded",
        violationType: ViolationType.RATE_LIMIT_EXCEEDED,
        details: {
          maxCalls: rateLimitConfig.maxCalls,
          windowMs: rateLimitConfig.windowMs,
        },
        suggestions: [
          `Please wait ${Math.ceil(rateLimitConfig.windowMs / 1000)} seconds before retrying`,
        ],
      };
    }

    return { passed: true };
  }

  // ==================== 内容过滤检查 ====================

  /**
   * 检查内容
   *
   * @param data 数据
   * @param config 内容过滤配置
   * @returns 检查结果
   */
  private checkContent(
    data: unknown,
    config: ContentFilterConfig,
  ): GuardrailResult {
    const content = this.extractTextContent(data);

    // 检查长度
    if (config.maxInputLength && content.length > config.maxInputLength) {
      return {
        passed: false,
        reason: "Content exceeds maximum length",
        violationType: ViolationType.CONTENT_VIOLATION,
        details: {
          length: content.length,
          maxLength: config.maxInputLength,
        },
      };
    }

    // 检查阻止的模式
    if (config.blockedPatterns) {
      for (const pattern of config.blockedPatterns) {
        // 处理 (?i) 前缀 - JavaScript 不支持内联标志，转换为 RegExp 标志
        let regexPattern = pattern;
        let flags = "";
        if (pattern.startsWith("(?i)")) {
          regexPattern = pattern.slice(4);
          flags = "i";
        }
        const regex = new RegExp(regexPattern, flags);
        if (regex.test(content)) {
          return {
            passed: false,
            reason: "Content contains blocked pattern",
            violationType: ViolationType.CONTENT_VIOLATION,
            details: { pattern },
          };
        }
      }
    }

    return { passed: true };
  }

  // ==================== 输出验证 ====================

  /**
   * 验证输出
   *
   * @param output 输出数据
   * @param config 输出验证配置
   * @returns 检查结果
   */
  private validateOutput(
    output: unknown,
    config: OutputValidationConfig,
  ): GuardrailResult {
    // 检查长度
    const content = this.extractTextContent(output);
    if (config.maxOutputLength && content.length > config.maxOutputLength) {
      return {
        passed: false,
        reason: "Output exceeds maximum length",
        violationType: ViolationType.SCHEMA_VIOLATION,
        details: {
          length: content.length,
          maxLength: config.maxOutputLength,
        },
      };
    }

    // Schema 验证
    if (config.schema) {
      const schemaCheck = this.validateSchema(output, config.schema);
      if (!schemaCheck.valid) {
        return {
          passed: false,
          reason: "Output does not match schema",
          violationType: ViolationType.SCHEMA_VIOLATION,
          details: { errors: schemaCheck.errors },
        };
      }
    }

    // 自定义验证器
    if (config.customValidator) {
      const customCheck = config.customValidator(output);
      if (!customCheck.valid) {
        return {
          passed: false,
          reason: "Custom validation failed",
          violationType: ViolationType.SCHEMA_VIOLATION,
          details: { errors: customCheck.errors },
        };
      }
    }

    return { passed: true };
  }

  // ==================== 隐私保护检查 ====================

  /**
   * 检查隐私
   *
   * @param data 数据
   * @param config 隐私配置
   * @returns 检查结果
   */
  private checkPrivacy(data: unknown, config: PrivacyConfig): GuardrailResult {
    if (!config.detectPII) {
      return { passed: true };
    }

    const content = this.extractTextContent(data);
    const detected: SensitiveInfoType[] = [];

    // 检测各类敏感信息
    if (config.sensitiveTypes?.includes(SensitiveInfoType.EMAIL)) {
      if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) {
        detected.push(SensitiveInfoType.EMAIL);
      }
    }

    if (config.sensitiveTypes?.includes(SensitiveInfoType.PHONE)) {
      if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content)) {
        detected.push(SensitiveInfoType.PHONE);
      }
    }

    if (config.sensitiveTypes?.includes(SensitiveInfoType.CREDIT_CARD)) {
      if (/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/.test(content)) {
        detected.push(SensitiveInfoType.CREDIT_CARD);
      }
    }

    if (config.sensitiveTypes?.includes(SensitiveInfoType.API_KEY)) {
      if (/\b[A-Za-z0-9_-]{32,}\b/.test(content)) {
        detected.push(SensitiveInfoType.API_KEY);
      }
    }

    if (detected.length > 0) {
      return {
        passed: false,
        reason: "Sensitive information detected",
        violationType: ViolationType.PRIVACY_VIOLATION,
        details: { detected },
        suggestions: config.autoRedact
          ? ["Sensitive information has been redacted"]
          : ["Remove sensitive information before proceeding"],
      };
    }

    return { passed: true };
  }

  // ==================== 成本控制检查 ====================

  /**
   * 检查成本
   *
   * @param toolType 工具类型
   * @param input 输入数据
   * @param config 成本控制配置
   * @returns 检查结果
   */
  private checkCost(
    toolType: ToolType,
    input: unknown,
    config: CostControlConfig,
  ): GuardrailResult {
    // 重置每日成本
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyCost = 0;
      this.lastResetDate = today;
    }

    // 检查每日成本
    if (config.maxDailyCost && this.dailyCost >= config.maxDailyCost) {
      return {
        passed: false,
        reason: "Daily cost limit exceeded",
        violationType: ViolationType.COST_LIMIT_EXCEEDED,
        details: {
          dailyCost: this.dailyCost,
          maxDailyCost: config.maxDailyCost,
        },
      };
    }

    // 估算成本（如果提供了估算器）
    if (config.costEstimator) {
      const estimatedCost = config.costEstimator(toolType, input);
      if (
        config.maxDailyCost &&
        this.dailyCost + estimatedCost > config.maxDailyCost
      ) {
        return {
          passed: false,
          reason: "Operation would exceed daily cost limit",
          violationType: ViolationType.COST_LIMIT_EXCEEDED,
          details: {
            estimatedCost,
            dailyCost: this.dailyCost,
            maxDailyCost: config.maxDailyCost,
          },
        };
      }
    }

    return { passed: true };
  }

  /**
   * 记录成本
   *
   * @param cost 成本（美元）
   */
  recordCost(cost: number): void {
    this.dailyCost += cost;
  }

  // ==================== 工具方法 ====================

  /**
   * 提取文本内容
   */
  private extractTextContent(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }
    if (typeof data === "object" && data !== null) {
      return JSON.stringify(data);
    }
    return String(data);
  }

  /**
   * 简单的 Schema 验证
   */
  private validateSchema(data: unknown, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];

    // 基础类型检查
    const dataType = Array.isArray(data) ? "array" : typeof data;
    if (schema.type === "object" && dataType !== "object") {
      errors.push(`Expected object, got ${dataType}`);
      return { valid: false, errors };
    }

    // 对象属性检查
    if (
      schema.type === "object" &&
      schema.properties &&
      typeof data === "object" &&
      data !== null
    ) {
      const obj = data as Record<string, unknown>;

      // 检查必需字段
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in obj)) {
            errors.push(`Missing required field: ${field}`);
          }
        }
      }

      // 递归验证子属性（简化版）
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const propResult = this.validateSchema(obj[key], propSchema);
          if (!propResult.valid) {
            errors.push(...(propResult.errors || []));
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==================== 统计信息 ====================

  /**
   * 获取统计信息
   */
  getStats(): {
    dailyCost: number;
    lastResetDate: string;
    configuredTools: number;
  } {
    return {
      dailyCost: this.dailyCost,
      lastResetDate: this.lastResetDate,
      configuredTools: this.configs.size,
    };
  }

  /**
   * 重置速率限制
   *
   * @param userId 用户 ID
   * @param toolType 工具类型（可选）
   */
  resetRateLimit(userId: string, toolType?: ToolType): void {
    const key = toolType ? `${userId}:${toolType}` : userId;
    this.rateLimiter.reset(key);
    this.logger.log(`Rate limit reset for ${key}`);
  }
}
