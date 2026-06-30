/**
 * zodToJsonSchema —— Zod → JSON Schema 转换的根节点合法性回归测试。
 *
 * 复现 2026-06-29 生产事故：playground LeaderAgent 的 outputSchema 根是
 * z.discriminatedUnion，旧实现转换后根节点为 {}（无 type），OpenAI
 * structured-output 反复 400 "schema must be type object, got type None"，
 * 整个 mission 卡死烧 BYOK key（gpt-5.4 25 分钟 474 次）。
 *
 * 强成功标准：任何作为 structured-output 根的 Zod schema，转换后根节点必有
 * type:"object"（OpenAI response_format.json_schema.schema 的硬约束）。
 */
import { z } from "zod";

import { zodToJsonSchema } from "../llm-executor";

describe("zodToJsonSchema — OpenAI structured-output 根节点合法性", () => {
  // ── 复现生产 bug：discriminatedUnion 根 ──────────────────────────────
  it("discriminatedUnion 根 → 根节点是 type:object（修复前是 {} 无 type）", () => {
    const schema = z.discriminatedUnion("phase", [
      z.object({ phase: z.literal("plan"), theme: z.string() }),
      z.object({ phase: z.literal("assess"), decision: z.string() }),
      z.object({ phase: z.literal("done"), summary: z.string() }),
    ]);

    const json = zodToJsonSchema(schema);

    expect(json.type).toBe("object");
    // 判别字段 enum 作为提示透出
    expect(json.properties).toMatchObject({
      phase: { type: "string", enum: ["plan", "assess", "done"] },
    });
    expect(json.required).toEqual(["phase"]);
  });

  it("union 根 → 根节点被强制成 type:object（root anyOf 会被 OpenAI 拒）", () => {
    const schema = z.union([
      z.object({ a: z.string() }),
      z.object({ b: z.number() }),
    ]);
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe("object");
  });

  it("z.any() 根 → 根节点被强制成 type:object（修复前是 {} 无 type）", () => {
    const json = zodToJsonSchema(z.any());
    expect(json.type).toBe("object");
  });

  it("primitive 根（string）→ 根节点被强制成 type:object", () => {
    const json = zodToJsonSchema(z.string());
    expect(json.type).toBe("object");
  });

  // ── 不回归：正常 object 根保持精确形状 ───────────────────────────────
  it("object 根 → 保留 properties / required / additionalProperties:false", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe("object");
    expect(json.properties).toMatchObject({
      name: { type: "string" },
      age: { type: "number" },
    });
    expect(json.required).toEqual(["name"]); // age optional → 不在 required
    expect(json.additionalProperties).toBe(false);
  });

  // ── 嵌套语义保持正确：嵌套 union 仍是 anyOf（合法 JSON Schema）─────────
  it("嵌套 union 仍输出 anyOf（仅根层强制 object，嵌套保持语义）", () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });
    const json = zodToJsonSchema(schema) as {
      properties: { value: Record<string, unknown> };
    };
    expect(json.properties.value.anyOf).toEqual([
      { type: "string" },
      { type: "number" },
    ]);
  });

  it("嵌套 discriminatedUnion 也产出 object（非 anyOf，OpenAI 安全）", () => {
    const schema = z.object({
      result: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("ok"), data: z.string() }),
        z.object({ kind: z.literal("err"), msg: z.string() }),
      ]),
    });
    const json = zodToJsonSchema(schema) as {
      properties: { result: Record<string, unknown> };
    };
    expect(json.properties.result.type).toBe("object");
  });
});
