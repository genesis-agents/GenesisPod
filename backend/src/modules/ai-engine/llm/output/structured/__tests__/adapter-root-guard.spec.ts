/**
 * Structured-output adapter 根守卫回归测试。
 *
 * 复现 2026-06-29 生产事故：simple-loop 的 SIMPLE_LOOP_OUTPUT_JSON_SCHEMA 根是
 * `{ oneOf: [...] }`（无 type），经 json_schema adapter 原样上线，OpenAI gpt-5.4
 * 反复 400 "schema must be type object, got type None"，reviewer/verifier 类
 * simple-loop agent 每轮失败 → mission thrash 烧 BYOK key。
 *
 * 强成功标准：任何送入 json_schema(_strict) adapter 的 schema，最终
 * response_format.json_schema.schema 根节点必有 type:"object"。
 */
import { JsonSchemaAdapter, JsonSchemaStrictAdapter } from "../adapters";
import { SIMPLE_LOOP_OUTPUT_JSON_SCHEMA } from "../../../../../ai-harness/runner/loop/loop-output-schemas";

type RF = {
  response_format: {
    json_schema: { schema: Record<string, unknown>; strict: boolean };
  };
};

function rootOf(patch: Record<string, unknown>): {
  schema: Record<string, unknown>;
  strict: boolean;
} {
  const rf = patch as unknown as RF;
  return {
    schema: rf.response_format.json_schema.schema,
    strict: rf.response_format.json_schema.strict,
  };
}

describe("json_schema adapter — OpenAI 根必须是 type:object", () => {
  const cases: Array<{ name: string; schema: Record<string, unknown> }> = [
    {
      name: "oneOf 根 (旧 SIMPLE_LOOP bug)",
      schema: { oneOf: [{ type: "object" }, { type: "array" }] },
    },
    { name: "anyOf 根 (union 转换)", schema: { anyOf: [{ type: "object" }] } },
    { name: "缺 type 的空 schema", schema: {} },
    { name: "array 根", schema: { type: "array", items: { type: "string" } } },
  ];

  for (const c of cases) {
    it(`JsonSchemaAdapter 收敛非 object 根 → object: ${c.name}`, () => {
      const out = new JsonSchemaAdapter().adapt({
        jsonSchema: c.schema,
        schemaName: "x",
        modelId: "gpt-5.4",
      });
      expect(rootOf(out.requestBodyPatch).schema.type).toBe("object");
    });

    it(`JsonSchemaStrictAdapter 收敛非 object 根 + 退 strict: ${c.name}`, () => {
      const out = new JsonSchemaStrictAdapter().adapt({
        jsonSchema: c.schema,
        schemaName: "x",
        modelId: "gpt-5.4",
      });
      const { schema, strict } = rootOf(out.requestBodyPatch);
      expect(schema.type).toBe("object");
      expect(strict).toBe(false); // 被收敛 → 不能 strict
    });
  }

  it("正常 object 根保持原样 + strict 保留", () => {
    const real = {
      type: "object",
      additionalProperties: false,
      required: ["a"],
      properties: { a: { type: "string" } },
    };
    const out = new JsonSchemaStrictAdapter().adapt({
      jsonSchema: real,
      schemaName: "x",
      modelId: "gpt-5.4",
    });
    const { schema, strict } = rootOf(out.requestBodyPatch);
    expect(schema).toEqual(real); // 不动真实 schema
    expect(strict).toBe(true); // 真实 object → 保留 strict
  });

  it("SIMPLE_LOOP_OUTPUT_JSON_SCHEMA 自身现在就是合法 object 根（源头已修）", () => {
    expect(SIMPLE_LOOP_OUTPUT_JSON_SCHEMA.type).toBe("object");
  });
});
