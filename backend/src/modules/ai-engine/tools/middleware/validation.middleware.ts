/**
 * AI Engine - Validation Middleware
 * 验证中间件
 */

import { Logger } from "@nestjs/common";
import { ValidationError } from "../../core/errors";
import {
  ITool,
  ToolContext,
  ToolResult,
  JSONSchema,
} from "../abstractions/tool.interface";
import { IToolMiddleware } from "./middleware.interface";

/**
 * 验证中间件配置
 */
export interface ValidationMiddlewareConfig {
  /**
   * 是否启用输入验证
   */
  validateInput?: boolean;

  /**
   * 是否启用输出验证
   */
  validateOutput?: boolean;

  /**
   * 是否允许额外属性
   */
  allowAdditionalProperties?: boolean;

  /**
   * 自定义验证器
   */
  customValidator?: (input: unknown, schema: JSONSchema) => ValidationResult;
}

/**
 * 验证结果
 */
interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    type: string;
  }>;
}

/**
 * 验证中间件
 * 在工具执行前验证输入，执行后验证输出
 */
export class ValidationMiddleware implements IToolMiddleware {
  readonly name = "validation";
  readonly priority = 10; // 高优先级，最先执行

  constructor(private readonly config: ValidationMiddlewareConfig = {}) {
    this.config = {
      validateInput: true,
      validateOutput: process.env.STRICT_OUTPUT_VALIDATION === "1",
      allowAdditionalProperties: true,
      ...config,
    };
  }

  async before(
    input: unknown,
    _context: ToolContext,
    tool: ITool,
  ): Promise<void> {
    if (!this.config.validateInput) {
      return;
    }

    // 使用工具自带的验证方法
    if (tool.validateInput) {
      const result = tool.validateInput(input);
      // 支持返回 boolean 或 ValidationResult
      const isValid = typeof result === "boolean" ? result : result.valid;
      if (!isValid) {
        const errors =
          typeof result === "boolean"
            ? [{ path: "", message: "Validation failed", type: "unknown" }]
            : result.errors?.map((e) => ({
                path: e.path,
                message: e.message,
                type: e.type,
              })) || [
                { path: "", message: "Validation failed", type: "unknown" },
              ];
        throw new ValidationError(
          errors,
          `Input validation failed for tool '${tool.id}'`,
        );
      }
    }

    // 使用 Schema 验证
    const schemaResult = this.validateAgainstSchema(input, tool.inputSchema);
    if (!schemaResult.valid) {
      throw new ValidationError(
        schemaResult.errors || [],
        `Schema validation failed for tool '${tool.id}'`,
      );
    }

    // 自定义验证器
    if (this.config.customValidator) {
      const customResult = this.config.customValidator(input, tool.inputSchema);
      if (!customResult.valid) {
        throw new ValidationError(
          customResult.errors || [],
          `Custom validation failed for tool '${tool.id}'`,
        );
      }
    }
  }

  async after(
    result: ToolResult,
    _context: ToolContext,
    tool: ITool,
  ): Promise<ToolResult> {
    if (!this.config.validateOutput || !result.success) {
      return result;
    }

    const schemaResult = this.validateAgainstSchema(
      result.data,
      tool.outputSchema,
    );
    if (!schemaResult.valid) {
      if (process.env.STRICT_OUTPUT_VALIDATION === "1") {
        throw new ValidationError(
          schemaResult.errors ?? [],
          `Output validation failed for tool '${tool.id}'`,
        );
      }
      Logger.warn(
        `Output validation warning for tool '${tool.id}': ${JSON.stringify(schemaResult.errors)}`,
        "ValidationMiddleware",
      );
    }

    return result;
  }

  /**
   * 简单的 JSON Schema 验证
   * 注意：这是一个简化实现，生产环境建议使用 ajv 等专业库
   */
  private validateAgainstSchema(
    data: unknown,
    schema: JSONSchema,
  ): ValidationResult {
    const errors: Array<{ path: string; message: string; type: string }> = [];

    this.validateValue(data, schema, "", errors);

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private validateValue(
    value: unknown,
    schema: JSONSchema,
    path: string,
    errors: Array<{ path: string; message: string; type: string }>,
  ): void {
    // 类型检查
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actualType = this.getType(value);

      if (
        !types.includes(actualType) &&
        !(actualType === "null" && types.includes("null"))
      ) {
        errors.push({
          path: path || "root",
          message: `Expected ${types.join(" or ")}, got ${actualType}`,
          type: "type",
        });
        return;
      }
    }

    // 对象属性检查
    if (
      schema.type === "object" &&
      typeof value === "object" &&
      value !== null
    ) {
      const obj = value as Record<string, unknown>;

      // 必填字段检查
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj)) {
            errors.push({
              path: path ? `${path}.${key}` : key,
              message: `Required property '${key}' is missing`,
              type: "required",
            });
          }
        }
      }

      // 属性验证
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            this.validateValue(
              obj[key],
              propSchema,
              path ? `${path}.${key}` : key,
              errors,
            );
          }
        }
      }
    }

    // 数组项检查
    if (schema.type === "array" && Array.isArray(value) && schema.items) {
      for (let i = 0; i < value.length; i++) {
        this.validateValue(value[i], schema.items, `${path}[${i}]`, errors);
      }
    }

    // 字符串长度检查
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path: path || "root",
          message: `String length must be >= ${schema.minLength}`,
          type: "minLength",
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path: path || "root",
          message: `String length must be <= ${schema.maxLength}`,
          type: "maxLength",
        });
      }
    }

    // 数字范围检查
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path: path || "root",
          message: `Value must be >= ${schema.minimum}`,
          type: "minimum",
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path: path || "root",
          message: `Value must be <= ${schema.maximum}`,
          type: "maximum",
        });
      }
    }

    // 枚举检查
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({
        path: path || "root",
        message: `Value must be one of: ${schema.enum.join(", ")}`,
        type: "enum",
      });
    }
  }

  private getType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}

/**
 * 创建验证中间件
 */
export function createValidationMiddleware(
  config?: ValidationMiddlewareConfig,
): IToolMiddleware {
  return new ValidationMiddleware(config);
}
