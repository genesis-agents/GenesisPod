/**
 * Schema Validator
 * JSONSchema 验证器 - 提供严格的输入验证
 */

import { Injectable } from "@nestjs/common";
import { JSONSchema } from "../tool.interface";
import { ToolError, ToolErrorCode } from "../errors";

// ============================================================================
// Types
// ============================================================================

/**
 * 验证错误信息
 */
export interface ValidationError {
  /** 错误路径 (如 "user.email") */
  path: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code: ValidationErrorCode;
  /** 期望的值 */
  expected?: unknown;
  /** 实际的值 */
  actual?: unknown;
}

/**
 * 验证错误代码
 */
export enum ValidationErrorCode {
  REQUIRED = "required",
  TYPE_MISMATCH = "type_mismatch",
  ENUM_MISMATCH = "enum_mismatch",
  FORMAT_INVALID = "format_invalid",
  MIN_LENGTH = "min_length",
  MAX_LENGTH = "max_length",
  MINIMUM = "minimum",
  MAXIMUM = "maximum",
  MIN_ITEMS = "min_items",
  MAX_ITEMS = "max_items",
  PATTERN_MISMATCH = "pattern_mismatch",
  ADDITIONAL_PROPERTIES = "additional_properties",
  ONE_OF_MISMATCH = "one_of_mismatch",
  ANY_OF_MISMATCH = "any_of_mismatch",
  ALL_OF_MISMATCH = "all_of_mismatch",
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
}

/**
 * 格式验证器
 */
type FormatValidator = (value: string) => boolean;

// ============================================================================
// Format Validators
// ============================================================================

const FORMAT_VALIDATORS: Record<string, FormatValidator> = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  uri: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  url: (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  "date-time": (value) => !isNaN(Date.parse(value)),
  date: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)),
  time: (value) => /^\d{2}:\d{2}(:\d{2})?$/.test(value),
  ipv4: (value) => {
    const parts = value.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
    });
  },
  ipv6: (value) => /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(value),
  hostname: (value) =>
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
      value,
    ),
  "json-pointer": (value) =>
    value === "" || /^(\/[^/~]*(~[01][^/~]*)*)*$/.test(value),
};

// ============================================================================
// Schema Validator Implementation
// ============================================================================

/**
 * JSONSchema 验证器
 * 提供完整的 JSON Schema Draft-07 验证支持
 */
@Injectable()
export class SchemaValidator {
  /**
   * 验证数据是否符合 Schema
   *
   * @param data 待验证数据
   * @param schema JSON Schema
   * @returns 验证结果
   */
  validate(data: unknown, schema: JSONSchema): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateValue(data, schema, "", errors);
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证并抛出错误
   * 如果验证失败，抛出 ToolError
   *
   * @param data 待验证数据
   * @param schema JSON Schema
   * @param source 错误来源
   * @throws ToolError 如果验证失败
   */
  validateOrThrow(data: unknown, schema: JSONSchema, source?: string): void {
    const result = this.validate(data, schema);
    if (!result.valid) {
      const firstError = result.errors[0];
      const code = this.mapValidationCodeToToolError(firstError.code);

      throw new ToolError(code, this.formatErrorMessage(result.errors), {
        source,
        details: {
          errors: result.errors,
          data,
        },
      });
    }
  }

  /**
   * 获取验证错误的格式化消息
   */
  getErrorMessages(result: ValidationResult): string[] {
    return result.errors.map((err) => {
      const path = err.path ? `${err.path}: ` : "";
      return `${path}${err.message}`;
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 验证单个值
   */
  private validateValue(
    data: unknown,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    // 处理组合 Schema
    if (schema.oneOf) {
      this.validateOneOf(data, schema.oneOf, path, errors);
      return;
    }
    if (schema.anyOf) {
      this.validateAnyOf(data, schema.anyOf, path, errors);
      return;
    }
    if (schema.allOf) {
      this.validateAllOf(data, schema.allOf, path, errors);
      return;
    }

    // 验证类型
    if (schema.type) {
      if (!this.validateType(data, schema.type, path, errors)) {
        return; // 类型不匹配，跳过后续验证
      }
    }

    // 根据类型进行特定验证
    switch (schema.type) {
      case "object":
        this.validateObject(
          data as Record<string, unknown>,
          schema,
          path,
          errors,
        );
        break;
      case "array":
        this.validateArray(data as unknown[], schema, path, errors);
        break;
      case "string":
        this.validateString(data as string, schema, path, errors);
        break;
      case "number":
        this.validateNumber(data as number, schema, path, errors);
        break;
    }

    // 验证枚举
    if (schema.enum) {
      this.validateEnum(data, schema.enum, path, errors);
    }
  }

  /**
   * 验证类型
   */
  private validateType(
    data: unknown,
    type: string,
    path: string,
    errors: ValidationError[],
  ): boolean {
    const actualType = this.getType(data);

    if (type === "number" && actualType === "number") {
      return true;
    }

    if (type !== actualType) {
      errors.push({
        path,
        message: `Expected ${type} but got ${actualType}`,
        code: ValidationErrorCode.TYPE_MISMATCH,
        expected: type,
        actual: actualType,
      });
      return false;
    }

    return true;
  }

  /**
   * 获取值的类型
   */
  private getType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  /**
   * 验证对象
   */
  private validateObject(
    data: Record<string, unknown>,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    // 验证必填字段
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data) || data[field] === undefined) {
          errors.push({
            path: path ? `${path}.${field}` : field,
            message: `Required field '${field}' is missing`,
            code: ValidationErrorCode.REQUIRED,
          });
        }
      }
    }

    // 验证属性
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const propPath = path ? `${path}.${key}` : key;
          this.validateValue(data[key], propSchema, propPath, errors);
        }
      }
    }

    // 验证额外属性
    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Additional property '${key}' is not allowed`,
            code: ValidationErrorCode.ADDITIONAL_PROPERTIES,
          });
        }
      }
    }
  }

  /**
   * 验证数组
   */
  private validateArray(
    data: unknown[],
    schema: JSONSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    // 验证最小长度
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        code: ValidationErrorCode.MIN_ITEMS,
        expected: schema.minItems,
        actual: data.length,
      });
    }

    // 验证最大长度
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        code: ValidationErrorCode.MAX_ITEMS,
        expected: schema.maxItems,
        actual: data.length,
      });
    }

    // 验证数组项
    if (schema.items) {
      data.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }

  /**
   * 验证字符串
   */
  private validateString(
    data: string,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    // 验证最小长度
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        code: ValidationErrorCode.MIN_LENGTH,
        expected: schema.minLength,
        actual: data.length,
      });
    }

    // 验证最大长度
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        code: ValidationErrorCode.MAX_LENGTH,
        expected: schema.maxLength,
        actual: data.length,
      });
    }

    // 验证正则表达式
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          path,
          message: `String does not match pattern: ${schema.pattern}`,
          code: ValidationErrorCode.PATTERN_MISMATCH,
          expected: schema.pattern,
          actual: data,
        });
      }
    }

    // 验证格式
    if (schema.format) {
      const validator = FORMAT_VALIDATORS[schema.format];
      if (validator && !validator(data)) {
        errors.push({
          path,
          message: `String is not a valid ${schema.format}`,
          code: ValidationErrorCode.FORMAT_INVALID,
          expected: schema.format,
          actual: data,
        });
      }
    }
  }

  /**
   * 验证数字
   */
  private validateNumber(
    data: number,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    // 验证最小值
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Number must be at least ${schema.minimum}`,
        code: ValidationErrorCode.MINIMUM,
        expected: schema.minimum,
        actual: data,
      });
    }

    // 验证最大值
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Number must be at most ${schema.maximum}`,
        code: ValidationErrorCode.MAXIMUM,
        expected: schema.maximum,
        actual: data,
      });
    }
  }

  /**
   * 验证枚举
   */
  private validateEnum(
    data: unknown,
    enumValues: string[],
    path: string,
    errors: ValidationError[],
  ): void {
    if (!enumValues.includes(data as string)) {
      errors.push({
        path,
        message: `Value must be one of: ${enumValues.join(", ")}`,
        code: ValidationErrorCode.ENUM_MISMATCH,
        expected: enumValues,
        actual: data,
      });
    }
  }

  /**
   * 验证 oneOf
   */
  private validateOneOf(
    data: unknown,
    schemas: JSONSchema[],
    path: string,
    errors: ValidationError[],
  ): void {
    let matchCount = 0;
    for (const schema of schemas) {
      const tempErrors: ValidationError[] = [];
      this.validateValue(data, schema, path, tempErrors);
      if (tempErrors.length === 0) {
        matchCount++;
      }
    }

    if (matchCount !== 1) {
      errors.push({
        path,
        message: `Value must match exactly one of the schemas`,
        code: ValidationErrorCode.ONE_OF_MISMATCH,
      });
    }
  }

  /**
   * 验证 anyOf
   */
  private validateAnyOf(
    data: unknown,
    schemas: JSONSchema[],
    path: string,
    errors: ValidationError[],
  ): void {
    for (const schema of schemas) {
      const tempErrors: ValidationError[] = [];
      this.validateValue(data, schema, path, tempErrors);
      if (tempErrors.length === 0) {
        return; // 匹配到一个就通过
      }
    }

    errors.push({
      path,
      message: `Value must match at least one of the schemas`,
      code: ValidationErrorCode.ANY_OF_MISMATCH,
    });
  }

  /**
   * 验证 allOf
   */
  private validateAllOf(
    data: unknown,
    schemas: JSONSchema[],
    path: string,
    errors: ValidationError[],
  ): void {
    for (const schema of schemas) {
      this.validateValue(data, schema, path, errors);
    }
  }

  /**
   * 映射验证错误码到工具错误码
   */
  private mapValidationCodeToToolError(
    code: ValidationErrorCode,
  ): ToolErrorCode {
    switch (code) {
      case ValidationErrorCode.REQUIRED:
        return ToolErrorCode.VALIDATION_REQUIRED_MISSING;
      case ValidationErrorCode.TYPE_MISMATCH:
        return ToolErrorCode.VALIDATION_TYPE_MISMATCH;
      case ValidationErrorCode.FORMAT_INVALID:
        return ToolErrorCode.VALIDATION_FORMAT_INVALID;
      case ValidationErrorCode.MIN_LENGTH:
      case ValidationErrorCode.MAX_LENGTH:
      case ValidationErrorCode.MINIMUM:
      case ValidationErrorCode.MAXIMUM:
      case ValidationErrorCode.MIN_ITEMS:
      case ValidationErrorCode.MAX_ITEMS:
        return ToolErrorCode.VALIDATION_RANGE_EXCEEDED;
      default:
        return ToolErrorCode.VALIDATION_SCHEMA_INVALID;
    }
  }

  /**
   * 格式化错误消息
   */
  private formatErrorMessage(errors: ValidationError[]): string {
    if (errors.length === 1) {
      const err = errors[0];
      return err.path ? `${err.path}: ${err.message}` : err.message;
    }

    return `Validation failed with ${errors.length} errors: ${errors
      .slice(0, 3)
      .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
      .join("; ")}${errors.length > 3 ? "..." : ""}`;
  }
}
