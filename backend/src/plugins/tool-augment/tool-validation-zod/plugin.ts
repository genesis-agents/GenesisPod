/**
 * tool-validation-zod plugin 实现（v5.1 R0.5-E W1-a）
 *
 * 设计：
 *   - TOOL_BEFORE：取 call.inputSchema + call.input；用 zod 校验。
 *   - TOOL_AFTER：取 call.outputSchema + result.data；strict / coerce / lenient 三档。
 *
 * 三档 mode 由 ENV 控制（与 legacy ValidationMiddleware 行为一致）：
 *   - STRICT_OUTPUT_VALIDATION_MODE=strict|coerce|lenient
 *   - STRICT_OUTPUT_VALIDATION=0 兼容映射 lenient
 *   - 默认 strict
 *
 * abort 语义：
 *   - input 失败 → ctx.abort('validation-failed', { phase: 'input', errors })
 *   - output strict 失败 → ctx.abort('validation-failed', { phase: 'output', errors })
 *   - lenient → 仅 logger.warn，不 abort
 *   - coerce → 缺 optional 字段补默认值；缺 required 字段 fallthrough strict reject
 */
import { z } from "zod";
import type {
  IPlugin,
  IPluginContext,
  HookHandler,
  PluginHealth,
  ToolBeforePayload,
  ToolAfterPayload,
} from "@/plugins/core/abstractions";
import { CORE_HOOKS } from "@/plugins/core/abstractions";
import { TOOL_VALIDATION_ZOD_MANIFEST } from "./manifest";

type ValidationMode = "lenient" | "strict" | "coerce";

interface JsonSchemaShape {
  type?: string | string[];
  properties?: Record<string, JsonSchemaShape>;
  required?: string[];
  items?: JsonSchemaShape;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  $ref?: string;
}

export interface ToolValidationZodConfig {
  /** 启用 input 校验，默认 true */
  readonly validateInput?: boolean;
  /** 启用 output 校验，默认按 ENV 解析（生产 strict） */
  readonly validateOutput?: boolean;
  /** 强制 mode 覆盖 ENV，默认从 ENV 读取 */
  readonly mode?: ValidationMode;
}

export class ToolValidationZodPlugin implements IPlugin<ToolValidationZodConfig> {
  readonly manifest = TOOL_VALIDATION_ZOD_MANIFEST;

  private validateInput = true;
  private validateOutput = true;
  private modeOverride: ValidationMode | null = null;
  private logger?: IPluginContext["logger"];

  async init(
    ctx: IPluginContext,
    config: ToolValidationZodConfig,
  ): Promise<void> {
    this.logger = ctx.logger;
    this.validateInput = config.validateInput ?? true;
    this.validateOutput =
      config.validateOutput ?? process.env.STRICT_OUTPUT_VALIDATION !== "0";
    this.modeOverride = config.mode ?? null;

    ctx.hooks.register(CORE_HOOKS.TOOL_BEFORE, this.onToolBefore, {
      priority: 95, // 早于 cache（100）之外的；cache miss 后立即校验 input
    });
    ctx.hooks.register(CORE_HOOKS.TOOL_AFTER, this.onToolAfter, {
      priority: 50,
    });
  }

  async healthCheck(): Promise<PluginHealth> {
    return { status: "healthy" };
  }

  // ── hook handlers ──

  private onToolBefore: HookHandler<ToolBeforePayload> = async (ctx) => {
    if (!this.validateInput) return ctx.next();
    const callTyped = ctx.payload.call as
      | { toolId?: string; input?: unknown; inputSchema?: JsonSchemaShape }
      | undefined;
    const schema = callTyped?.inputSchema;
    if (!schema) return ctx.next(); // 无 schema → 跳过

    const result = this.validate(callTyped?.input, schema);
    if (result.valid) return ctx.next();

    return ctx.abort("validation-failed", {
      phase: "input",
      toolId: callTyped?.toolId,
      errors: result.errors,
    });
  };

  private onToolAfter: HookHandler<ToolAfterPayload> = async (ctx) => {
    if (!this.validateOutput) return ctx.next();
    const payload = ctx.payload;
    if (payload.abortReason) return ctx.next(); // abort 路径不校验
    const callTyped = payload.call as
      | { toolId?: string; outputSchema?: JsonSchemaShape }
      | undefined;
    const schema = callTyped?.outputSchema;
    if (!schema) return ctx.next();
    const r = payload.result as
      | { success?: boolean; data?: unknown }
      | undefined;
    if (!r || r.success !== true) return ctx.next(); // 失败结果不校验

    const result = this.validate(r.data, schema);
    if (result.valid) return ctx.next();

    const mode = this.resolveMode();
    if (mode === "lenient") {
      this.logger?.warn(
        `[tool-validation-zod] output validation warning for '${callTyped?.toolId ?? "unknown"}': ${JSON.stringify(result.errors)}`,
      );
      return ctx.next();
    }

    if (mode === "coerce") {
      // 简化版 coerce：只处理 object 类型缺 optional 字段
      const coerced = this.tryCoerce(r.data, schema);
      if (coerced !== null) {
        this.logger?.warn(
          `[tool-validation-zod] output coerced for '${callTyped?.toolId ?? "unknown"}'`,
        );
        return ctx.next();
      }
      // coerce 兜底失败 → fallthrough strict
    }

    return ctx.abort("validation-failed", {
      phase: "output",
      toolId: callTyped?.toolId,
      errors: result.errors,
    });
  };

  // ── validation impl ──

  private validate(
    data: unknown,
    schema: JsonSchemaShape,
  ): {
    valid: boolean;
    errors?: Array<{ path: string; message: string; type: string }>;
  } {
    const zodSchema = this.jsonSchemaToZod(schema);
    if (zodSchema instanceof z.ZodUnknown) {
      // schema 有 $ref / 不支持字段 → 跳过校验（保守）
      return { valid: true };
    }
    const r = zodSchema.safeParse(data);
    if (r.success) return { valid: true };
    return {
      valid: false,
      errors: r.error.issues.map((i) => ({
        path: i.path.join(".") || "root",
        message: i.message,
        type: i.code,
      })),
    };
  }

  private resolveMode(): ValidationMode {
    if (this.modeOverride) return this.modeOverride;
    const m = process.env.STRICT_OUTPUT_VALIDATION_MODE?.toLowerCase();
    if (m === "lenient" || m === "coerce" || m === "strict") return m;
    if (process.env.STRICT_OUTPUT_VALIDATION === "0") return "lenient";
    return "strict";
  }

  /** 与 legacy ValidationMiddleware.jsonSchemaToZod 等价（迁移自原文件，保留行为） */
  private jsonSchemaToZod(schema: JsonSchemaShape): z.ZodTypeAny {
    if (schema.$ref !== undefined) return z.unknown();
    const types = schema.type
      ? Array.isArray(schema.type)
        ? schema.type
        : [schema.type]
      : [];
    if (types.length === 0) return z.unknown();

    const buildSingleType = (t: string): z.ZodTypeAny => {
      switch (t) {
        case "string": {
          let s = z.string();
          if (schema.minLength !== undefined) s = s.min(schema.minLength);
          if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
          if (schema.enum !== undefined) {
            const vals = schema.enum as string[];
            return z.enum(vals as [string, ...string[]]);
          }
          return s;
        }
        case "number":
        case "integer": {
          let n = t === "integer" ? z.number().int() : z.number();
          if (schema.minimum !== undefined) n = n.min(schema.minimum);
          if (schema.maximum !== undefined) n = n.max(schema.maximum);
          return n;
        }
        case "boolean":
          return z.boolean();
        case "null":
          return z.null();
        case "array": {
          const itemSchema = schema.items
            ? this.jsonSchemaToZod(schema.items)
            : z.unknown();
          return z.array(itemSchema);
        }
        case "object": {
          const shape: Record<string, z.ZodTypeAny> = {};
          if (schema.properties) {
            for (const [k, p] of Object.entries(schema.properties)) {
              const isReq = schema.required?.includes(k) ?? false;
              const zp = this.jsonSchemaToZod(p);
              shape[k] = isReq ? zp : zp.optional();
            }
          }
          if (schema.required) {
            for (const k of schema.required) {
              if (!(k in shape)) {
                shape[k] = z.unknown().refine((v) => v !== undefined, {
                  message: `Required property '${k}' is missing`,
                });
              }
            }
          }
          return z.object(shape).passthrough();
        }
        default:
          return z.unknown();
      }
    };

    if (types.length === 1) return buildSingleType(types[0]);
    const schemas = types.map(buildSingleType) as [
      z.ZodTypeAny,
      z.ZodTypeAny,
      ...z.ZodTypeAny[],
    ];
    return z.union(schemas);
  }

  /** coerce mode：补 optional 字段默认值；required 缺失返回 null */
  private tryCoerce(data: unknown, schema: JsonSchemaShape): unknown | null {
    if (!data || typeof data !== "object" || !schema.properties) return null;
    const obj = data as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };
    for (const [k, p] of Object.entries(schema.properties)) {
      if (k in out) continue;
      if (schema.required?.includes(k)) return null;
      const t = p.type;
      const tt = Array.isArray(t) ? t[0] : t;
      if (tt === "string") out[k] = "";
      else if (tt === "number" || tt === "integer") out[k] = 0;
      else if (tt === "boolean") out[k] = false;
      else if (tt === "array") out[k] = [];
      else if (tt === "object") out[k] = {};
    }
    return out;
  }
}
