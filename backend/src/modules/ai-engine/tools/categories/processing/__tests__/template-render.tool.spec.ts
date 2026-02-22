/**
 * TemplateRenderTool Unit Tests
 */

import {
  TemplateRenderTool,
  TemplateRenderInput,
} from "../template-render.tool";
import { ToolContext } from "../../../abstractions/tool.interface";

// ============================================================================
// Helpers
// ============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "template-render",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("TemplateRenderTool", () => {
  let tool: TemplateRenderTool;

  beforeEach(() => {
    tool = new TemplateRenderTool();
  });

  // --------------------------------------------------------------------------
  // Tool metadata
  // --------------------------------------------------------------------------

  describe("tool metadata", () => {
    it("should have correct id and category", () => {
      expect(tool.id).toBe("template-render");
      expect(tool.category).toBe("processing");
    });
  });

  // --------------------------------------------------------------------------
  // validateInput
  // --------------------------------------------------------------------------

  describe("validateInput", () => {
    it("should return true when template and variables are provided", () => {
      const input: TemplateRenderInput = {
        template: "Hello {{name}}",
        variables: { name: "World" },
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return false when template is missing", () => {
      const input = {
        variables: { name: "World" },
      } as unknown as TemplateRenderInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when variables is missing", () => {
      const input = { template: "Hello" } as unknown as TemplateRenderInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return true when template has no placeholders", () => {
      const input: TemplateRenderInput = {
        template: "Static text with no variables",
        variables: {},
      };
      expect(tool.validateInput(input)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Basic rendering
  // --------------------------------------------------------------------------

  describe("basic variable substitution", () => {
    it("should substitute a simple {{name}} variable", async () => {
      const input: TemplateRenderInput = {
        template: "Hello, {{name}}!",
        variables: { name: "Alice" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe("Hello, Alice!");
    });

    it("should substitute multiple variables", async () => {
      const input: TemplateRenderInput = {
        template: "{{greeting}}, {{name}}! You are {{age}} years old.",
        variables: { greeting: "Hi", name: "Bob", age: 30 },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("Hi, Bob! You are 30 years old.");
    });

    it("should render empty string for undefined variable in non-strict mode", async () => {
      const input: TemplateRenderInput = {
        template: "Hello, {{unknownVar}}!",
        variables: {},
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe("Hello, !");
      expect(result.data?.undefinedVariables).toContain("unknownVar");
    });
  });

  // --------------------------------------------------------------------------
  // Handlebars conditionals
  // --------------------------------------------------------------------------

  describe("handlebars conditionals", () => {
    it("should render if block when condition is truthy", async () => {
      const input: TemplateRenderInput = {
        template: "{{#if isAdmin}}Admin panel{{/if}}",
        variables: { isAdmin: true },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toContain("Admin panel");
    });

    it("should not render if block when condition is falsy", async () => {
      const input: TemplateRenderInput = {
        template: "{{#if isAdmin}}Admin panel{{/if}}",
        variables: { isAdmin: false },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).not.toContain("Admin panel");
    });
  });

  // --------------------------------------------------------------------------
  // Handlebars loops
  // --------------------------------------------------------------------------

  describe("handlebars loops", () => {
    it("should iterate over an array with #each", async () => {
      const input: TemplateRenderInput = {
        template: "{{#each items}}{{this}},{{/each}}",
        variables: { items: ["a", "b", "c"] },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toContain("a,");
      expect(result.data?.result).toContain("b,");
      expect(result.data?.result).toContain("c,");
    });
  });

  // --------------------------------------------------------------------------
  // Custom helpers
  // --------------------------------------------------------------------------

  describe("custom helpers", () => {
    it("should uppercase string with uppercase helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{uppercase name}}",
        variables: { name: "alice" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("ALICE");
    });

    it("should lowercase string with lowercase helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{lowercase name}}",
        variables: { name: "ALICE" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("alice");
    });

    it("should capitalize string with capitalize helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{capitalize name}}",
        variables: { name: "alice" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("Alice");
    });

    it("should join array with join helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{join tags ', '}}",
        variables: { tags: ["a", "b", "c"] },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("a, b, c");
    });

    it("should serialize object with json helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{json data}}",
        variables: { data: { key: "value" } },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(() => JSON.parse(result.data?.result ?? "")).not.toThrow();
      const parsed = JSON.parse(result.data?.result ?? "");
      expect(parsed.key).toBe("value");
    });

    it("should add numbers with add helper", async () => {
      const input: TemplateRenderInput = {
        template: "{{add a b}}",
        variables: { a: 5, b: 3 },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("8");
    });
  });

  // --------------------------------------------------------------------------
  // usedVariables and undefinedVariables tracking
  // --------------------------------------------------------------------------

  describe("variable tracking", () => {
    it("should list all used variables", async () => {
      const input: TemplateRenderInput = {
        template: "{{name}} is {{age}} years old",
        variables: { name: "Alice", age: 30 },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.usedVariables).toContain("name");
      expect(result.data?.usedVariables).toContain("age");
    });

    it("should list undefined variables separately", async () => {
      const input: TemplateRenderInput = {
        template: "{{name}} from {{city}}",
        variables: { name: "Alice" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.undefinedVariables).toContain("city");
      expect(result.data?.undefinedVariables).not.toContain("name");
    });
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  describe("statistics", () => {
    it("should report template and output lengths", async () => {
      const template = "Hello, {{name}}!";
      const input: TemplateRenderInput = {
        template,
        variables: { name: "World" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.statistics.templateLength).toBe(template.length);
      expect(result.data?.statistics.outputLength).toBe("Hello, World!".length);
      expect(result.data?.statistics.variableCount).toBe(1);
      expect(result.data?.statistics.renderTime).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // format option
  // --------------------------------------------------------------------------

  describe("format option", () => {
    it("should pretty-print valid JSON output when format=json", async () => {
      const input: TemplateRenderInput = {
        template: '{"key":"{{value}}"}',
        variables: { value: "hello" },
        format: "json",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      // Should be reformatted JSON
      const parsed = JSON.parse(result.data?.result ?? "");
      expect(parsed.key).toBe("hello");
    });

    it("should return plain text for format=text", async () => {
      const input: TemplateRenderInput = {
        template: "Plain: {{value}}",
        variables: { value: "content" },
        format: "text",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.result).toBe("Plain: content");
    });
  });

  // --------------------------------------------------------------------------
  // Strict mode
  // --------------------------------------------------------------------------

  describe("strict mode", () => {
    it("should throw in strict mode when variable is undefined", async () => {
      const input: TemplateRenderInput = {
        template: "Hello {{missingVar}}",
        variables: {},
        options: { strict: true },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      // In strict mode, Handlebars throws - BaseTool wraps it as success:false
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle template with no variables", async () => {
      const input: TemplateRenderInput = {
        template: "No variables here at all.",
        variables: {},
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe("No variables here at all.");
      expect(result.data?.usedVariables).toHaveLength(0);
    });

    it("should handle empty variables object with template", async () => {
      const input: TemplateRenderInput = {
        template: "Static content",
        variables: {},
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.result).toBe("Static content");
    });
  });
});
