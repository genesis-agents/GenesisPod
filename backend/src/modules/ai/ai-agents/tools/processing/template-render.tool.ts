/**
 * Template Render Tool
 * 模板渲染工具 - 使用变量渲染模板（Handlebars 风格）
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";

// ============================================================================
// Types
// ============================================================================

export interface TemplateRenderInput {
  /**
   * 模板字符串
   */
  template: string;

  /**
   * 变量数据
   */
  variables: Record<string, unknown>;

  /**
   * 输出格式
   */
  format?: "text" | "html" | "markdown" | "json";

  /**
   * 渲染选项
   */
  options?: {
    /**
     * 严格模式（未定义变量抛出错误）
     */
    strict?: boolean;

    /**
     * 自动转义 HTML
     */
    escapeHtml?: boolean;

    /**
     * 允许部分渲染
     */
    partial?: boolean;

    /**
     * 自定义分隔符
     */
    delimiters?: {
      start: string;
      end: string;
    };
  };
}

export interface TemplateRenderOutput {
  /**
   * 渲染结果
   */
  result: string;

  /**
   * 使用的变量列表
   */
  usedVariables: string[];

  /**
   * 未定义的变量列表
   */
  undefinedVariables: string[];

  /**
   * 渲染统计
   */
  statistics: {
    /**
     * 模板长度
     */
    templateLength: number;

    /**
     * 输出长度
     */
    outputLength: number;

    /**
     * 变量数量
     */
    variableCount: number;

    /**
     * 渲染时间（毫秒）
     */
    renderTime: number;
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class TemplateRenderTool extends BaseTool<
  TemplateRenderInput,
  TemplateRenderOutput
> {
  private readonly logger = new Logger(TemplateRenderTool.name);

  readonly type = ToolType.TEMPLATE_RENDER;
  readonly name = "模板渲染";
  readonly description =
    "使用变量渲染模板内容。支持 Handlebars 风格语法、条件逻辑、循环、自定义辅助函数等。支持文本、HTML、Markdown、JSON 等多种格式。适用于邮件模板、文档生成、代码生成等场景。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      template: {
        type: "string",
        description:
          "模板字符串（支持 {{variable}}、{{#if}}、{{#each}} 等语法）",
      },
      variables: {
        type: "object",
        description: "变量数据（键值对）",
      },
      format: {
        type: "string",
        description: "输出格式",
        enum: ["text", "html", "markdown", "json"],
        default: "text",
      },
      options: {
        type: "object",
        description: "渲染选项",
        properties: {
          strict: {
            type: "boolean",
            description: "严格模式（未定义变量抛出错误）",
            default: false,
          },
          escapeHtml: {
            type: "boolean",
            description: "自动转义 HTML",
            default: true,
          },
          partial: {
            type: "boolean",
            description: "允许部分渲染",
            default: false,
          },
          delimiters: {
            type: "object",
            description: "自定义分隔符",
            properties: {
              start: {
                type: "string",
                description: "起始分隔符",
                default: "{{",
              },
              end: { type: "string", description: "结束分隔符", default: "}}" },
            },
          },
        },
      },
    },
    required: ["template", "variables"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      result: {
        type: "string",
        description: "渲染结果",
      },
      usedVariables: {
        type: "array",
        description: "使用的变量列表",
        items: { type: "string" },
      },
      undefinedVariables: {
        type: "array",
        description: "未定义的变量列表",
        items: { type: "string" },
      },
      statistics: {
        type: "object",
        description: "渲染统计",
        properties: {
          templateLength: { type: "number", description: "模板长度" },
          outputLength: { type: "number", description: "输出长度" },
          variableCount: { type: "number", description: "变量数量" },
          renderTime: { type: "number", description: "渲染时间（毫秒）" },
        },
      },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 30000; // 30 秒超时
  }

  validateInput(input: TemplateRenderInput): boolean {
    if (!input.template || !input.variables) {
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: TemplateRenderInput,
    _context: ToolContext,
  ): Promise<TemplateRenderOutput> {
    const { template, variables, format = "text", options = {} } = input;

    this.logger.log(`[doExecute] Rendering template (format: ${format})...`);

    const startTime = Date.now();

    try {
      const handlebars = await import("handlebars");

      // 配置 Handlebars
      const hbs = handlebars.create();

      // 注册自定义辅助函数
      this.registerHelpers(hbs);

      // 设置选项
      if (options.escapeHtml === false) {
        // Disable HTML escaping
      }

      // 编译模板
      const compiledTemplate = hbs.compile(template, {
        strict: options.strict || false,
        noEscape: !options.escapeHtml,
      });

      // 渲染模板
      let result = compiledTemplate(variables);

      // 跟踪使用的变量
      const usedVariables: Set<string> = new Set();
      const undefinedVariables: Set<string> = new Set();

      this.extractVariables(template, options.delimiters).forEach((varName) => {
        usedVariables.add(varName);

        if (this.getNestedValue(variables, varName) === undefined) {
          undefinedVariables.add(varName);
        }
      });

      // 格式化输出
      if (format === "json") {
        try {
          result = JSON.stringify(JSON.parse(result), null, 2);
        } catch {
          // If not valid JSON, keep as is
        }
      } else if (format === "markdown") {
        // Add markdown-specific formatting if needed
      } else if (format === "html") {
        // HTML is already handled by escapeHtml option
      }

      const renderTime = Date.now() - startTime;

      const output: TemplateRenderOutput = {
        result,
        usedVariables: Array.from(usedVariables),
        undefinedVariables: Array.from(undefinedVariables),
        statistics: {
          templateLength: template.length,
          outputLength: result.length,
          variableCount: usedVariables.size,
          renderTime,
        },
      };

      this.logger.log(
        `[doExecute] Rendering complete. Variables: ${usedVariables.size}, Undefined: ${undefinedVariables.size}, Time: ${renderTime}ms`,
      );

      return output;
    } catch (error) {
      this.logger.error(
        `[doExecute] Rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // ==========================================================================
  // Custom Helpers
  // ==========================================================================

  private registerHelpers(hbs: any): void {
    // Date formatting
    hbs.registerHelper("formatDate", function (date: any, format: string) {
      const d = new Date(date);
      if (isNaN(d.getTime())) return date;

      if (format === "iso") return d.toISOString();
      if (format === "short") return d.toLocaleDateString();
      if (format === "long") return d.toLocaleString();

      return d.toString();
    });

    // Number formatting
    hbs.registerHelper("formatNumber", function (num: any, decimals = 2) {
      const n = parseFloat(num);
      if (isNaN(n)) return num;

      return n.toFixed(decimals);
    });

    // String operations
    hbs.registerHelper("uppercase", function (str: string) {
      return str?.toUpperCase() || "";
    });

    hbs.registerHelper("lowercase", function (str: string) {
      return str?.toLowerCase() || "";
    });

    hbs.registerHelper("capitalize", function (str: string) {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
    });

    // Conditional helpers
    hbs.registerHelper("eq", function (a: any, b: any) {
      return a === b;
    });

    hbs.registerHelper("ne", function (a: any, b: any) {
      return a !== b;
    });

    hbs.registerHelper("gt", function (a: any, b: any) {
      return a > b;
    });

    hbs.registerHelper("lt", function (a: any, b: any) {
      return a < b;
    });

    hbs.registerHelper("gte", function (a: any, b: any) {
      return a >= b;
    });

    hbs.registerHelper("lte", function (a: any, b: any) {
      return a <= b;
    });

    hbs.registerHelper("and", function (...args: any[]) {
      return args.slice(0, -1).every((arg) => arg);
    });

    hbs.registerHelper("or", function (...args: any[]) {
      return args.slice(0, -1).some((arg) => arg);
    });

    hbs.registerHelper("not", function (value: any) {
      return !value;
    });

    // Array helpers
    hbs.registerHelper("length", function (arr: any[]) {
      return arr?.length || 0;
    });

    hbs.registerHelper("join", function (arr: any[], separator = ", ") {
      return arr?.join(separator) || "";
    });

    hbs.registerHelper("first", function (arr: any[]) {
      return arr?.[0];
    });

    hbs.registerHelper("last", function (arr: any[]) {
      return arr?.[arr.length - 1];
    });

    // JSON helpers
    hbs.registerHelper("json", function (obj: any) {
      return JSON.stringify(obj, null, 2);
    });

    hbs.registerHelper("jsonInline", function (obj: any) {
      return JSON.stringify(obj);
    });

    // Math helpers
    hbs.registerHelper("add", function (a: number, b: number) {
      return a + b;
    });

    hbs.registerHelper("subtract", function (a: number, b: number) {
      return a - b;
    });

    hbs.registerHelper("multiply", function (a: number, b: number) {
      return a * b;
    });

    hbs.registerHelper("divide", function (a: number, b: number) {
      return b !== 0 ? a / b : 0;
    });

    // Default value helper
    hbs.registerHelper("default", function (value: any, defaultValue: any) {
      return value !== undefined && value !== null ? value : defaultValue;
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * 提取模板中的变量
   */
  private extractVariables(
    template: string,
    delimiters?: { start: string; end: string },
  ): string[] {
    const start = delimiters?.start || "{{";
    const end = delimiters?.end || "}}";

    const pattern = new RegExp(
      `${this.escapeRegex(start)}\\s*([^}#/\\s]+)\\s*${this.escapeRegex(end)}`,
      "g",
    );

    const variables: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
      const varName = match[1].trim();
      // Skip helper functions
      if (
        !varName.startsWith("if") &&
        !varName.startsWith("each") &&
        !varName.startsWith("unless") &&
        !varName.startsWith("with")
      ) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: any = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }
}
