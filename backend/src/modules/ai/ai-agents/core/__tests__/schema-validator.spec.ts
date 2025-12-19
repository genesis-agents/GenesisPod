/**
 * Schema Validator Tests
 */

import { SchemaValidator, ValidationErrorCode } from "../validation";
import { JSONSchema } from "../tool/tool.interface";

describe("SchemaValidator", () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe("Type Validation", () => {
    it("should validate string type", () => {
      const schema: JSONSchema = { type: "string" };

      expect(validator.validate("hello", schema).valid).toBe(true);
      expect(validator.validate(123, schema).valid).toBe(false);
      expect(validator.validate(null, schema).valid).toBe(false);
    });

    it("should validate number type", () => {
      const schema: JSONSchema = { type: "number" };

      expect(validator.validate(123, schema).valid).toBe(true);
      expect(validator.validate(123.45, schema).valid).toBe(true);
      expect(validator.validate("123", schema).valid).toBe(false);
    });

    it("should validate boolean type", () => {
      const schema: JSONSchema = { type: "boolean" };

      expect(validator.validate(true, schema).valid).toBe(true);
      expect(validator.validate(false, schema).valid).toBe(true);
      expect(validator.validate("true", schema).valid).toBe(false);
    });

    it("should validate array type", () => {
      const schema: JSONSchema = { type: "array" };

      expect(validator.validate([], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate({}, schema).valid).toBe(false);
    });

    it("should validate object type", () => {
      const schema: JSONSchema = { type: "object" };

      expect(validator.validate({}, schema).valid).toBe(true);
      expect(validator.validate({ key: "value" }, schema).valid).toBe(true);
      expect(validator.validate([], schema).valid).toBe(false);
    });
  });

  describe("Required Fields", () => {
    it("should validate required fields", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };

      expect(validator.validate({ name: "John" }, schema).valid).toBe(true);
      expect(validator.validate({ name: "John", age: 30 }, schema).valid).toBe(
        true,
      );

      const result = validator.validate({ age: 30 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.REQUIRED);
    });

    it("should report missing required field path", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              email: { type: "string" },
            },
            required: ["email"],
          },
        },
        required: ["user"],
      };

      const result = validator.validate({ user: {} }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe("user.email");
    });
  });

  describe("String Validation", () => {
    it("should validate minLength", () => {
      const schema: JSONSchema = { type: "string", minLength: 3 };

      expect(validator.validate("abc", schema).valid).toBe(true);
      expect(validator.validate("abcd", schema).valid).toBe(true);

      const result = validator.validate("ab", schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MIN_LENGTH);
    });

    it("should validate maxLength", () => {
      const schema: JSONSchema = { type: "string", maxLength: 5 };

      expect(validator.validate("abc", schema).valid).toBe(true);
      expect(validator.validate("abcde", schema).valid).toBe(true);

      const result = validator.validate("abcdef", schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MAX_LENGTH);
    });

    it("should validate pattern", () => {
      const schema: JSONSchema = { type: "string", pattern: "^[A-Z]+$" };

      expect(validator.validate("ABC", schema).valid).toBe(true);

      const result = validator.validate("abc", schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.PATTERN_MISMATCH);
    });

    it("should validate email format", () => {
      const schema: JSONSchema = { type: "string", format: "email" };

      expect(validator.validate("test@example.com", schema).valid).toBe(true);

      const result = validator.validate("invalid-email", schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.FORMAT_INVALID);
    });

    it("should validate uri format", () => {
      const schema: JSONSchema = { type: "string", format: "uri" };

      expect(validator.validate("https://example.com", schema).valid).toBe(
        true,
      );
      expect(validator.validate("ftp://files.example.com", schema).valid).toBe(
        true,
      );

      const result = validator.validate("not-a-uri", schema);
      expect(result.valid).toBe(false);
    });

    it("should validate uuid format", () => {
      const schema: JSONSchema = { type: "string", format: "uuid" };

      expect(
        validator.validate("550e8400-e29b-41d4-a716-446655440000", schema)
          .valid,
      ).toBe(true);

      const result = validator.validate("not-a-uuid", schema);
      expect(result.valid).toBe(false);
    });
  });

  describe("Number Validation", () => {
    it("should validate minimum", () => {
      const schema: JSONSchema = { type: "number", minimum: 10 };

      expect(validator.validate(10, schema).valid).toBe(true);
      expect(validator.validate(15, schema).valid).toBe(true);

      const result = validator.validate(5, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MINIMUM);
    });

    it("should validate maximum", () => {
      const schema: JSONSchema = { type: "number", maximum: 100 };

      expect(validator.validate(50, schema).valid).toBe(true);
      expect(validator.validate(100, schema).valid).toBe(true);

      const result = validator.validate(150, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MAXIMUM);
    });
  });

  describe("Array Validation", () => {
    it("should validate minItems", () => {
      const schema: JSONSchema = { type: "array", minItems: 2 };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);

      const result = validator.validate([1], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MIN_ITEMS);
    });

    it("should validate maxItems", () => {
      const schema: JSONSchema = { type: "array", maxItems: 3 };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);

      const result = validator.validate([1, 2, 3, 4], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.MAX_ITEMS);
    });

    it("should validate array items", () => {
      const schema: JSONSchema = {
        type: "array",
        items: { type: "number" },
      };

      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);

      const result = validator.validate([1, "two", 3], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toContain("[1]");
    });
  });

  describe("Enum Validation", () => {
    it("should validate enum values", () => {
      const schema: JSONSchema = {
        type: "string",
        enum: ["red", "green", "blue"],
      };

      expect(validator.validate("red", schema).valid).toBe(true);
      expect(validator.validate("green", schema).valid).toBe(true);

      const result = validator.validate("yellow", schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ValidationErrorCode.ENUM_MISMATCH);
    });
  });

  describe("Nested Object Validation", () => {
    it("should validate nested objects", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 1 },
              email: { type: "string", format: "email" },
            },
            required: ["name", "email"],
          },
        },
        required: ["user"],
      };

      const validData = {
        user: {
          name: "John",
          email: "john@example.com",
        },
      };
      expect(validator.validate(validData, schema).valid).toBe(true);

      const invalidData = {
        user: {
          name: "",
          email: "invalid",
        },
      };
      const result = validator.validate(invalidData, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Complex Tool Schema", () => {
    it("should validate web search input schema", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
            minLength: 1,
            maxLength: 500,
          },
          numResults: {
            type: "number",
            description: "Number of results",
            minimum: 1,
            maximum: 10,
            default: 5,
          },
          language: {
            type: "string",
            enum: ["zh-CN", "en-US", "auto"],
            default: "auto",
          },
        },
        required: ["query"],
      };

      // Valid inputs
      expect(validator.validate({ query: "AI news" }, schema).valid).toBe(true);
      expect(
        validator.validate({ query: "test", numResults: 5 }, schema).valid,
      ).toBe(true);
      expect(
        validator.validate({ query: "test", language: "zh-CN" }, schema).valid,
      ).toBe(true);

      // Invalid inputs
      expect(validator.validate({}, schema).valid).toBe(false); // Missing query
      expect(validator.validate({ query: "" }, schema).valid).toBe(false); // Empty query
      expect(
        validator.validate({ query: "test", numResults: 20 }, schema).valid,
      ).toBe(false); // Over max
      expect(
        validator.validate({ query: "test", language: "fr-FR" }, schema).valid,
      ).toBe(false); // Invalid enum
    });
  });

  describe("Error Messages", () => {
    it("should provide helpful error messages", () => {
      const schema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };

      const result = validator.validate({}, schema);
      expect(result.valid).toBe(false);

      const messages = validator.getErrorMessages(result);
      expect(messages.length).toBe(1);
      expect(messages[0]).toContain("name");
      expect(messages[0]).toContain("Required");
    });
  });
});
