/**
 * Adapter Smoke Spec — 各 provider strategy 的 request/response 契约模拟
 *
 * 不打真 LLM（避免计费），用 mock LLM response 验证：
 *   1. adapt() 产生的 request body 符合该 provider 的 OpenAPI 契约
 *   2. postParse() 能从该 provider 典型 response 形态中提取 JSON
 *
 * 覆盖：OpenAI strict / Anthropic tool_use / Gemini / json_mode / GBNF / prompt /
 *       OpenAI o1 reasoning / DeepSeek-reasoner prompt-only
 */

import {
  AnthropicToolUseAdapter,
  GbnfGrammarAdapter,
  GeminiResponseSchemaAdapter,
  JsonModeAdapter,
  JsonSchemaAdapter,
  JsonSchemaStrictAdapter,
  PromptOnlyAdapter,
  NoneAdapter,
} from "../adapters";

const SAMPLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    score: { type: "number" },
  },
  required: ["title", "score"],
  additionalProperties: false,
};

const VALID_RESPONSE = `{"title":"hello","score":0.9}`;
const MARKDOWN_WRAPPED = "```json\n" + VALID_RESPONSE + "\n```";
const PROSE_PREFIX = `Sure, here is the result:\n${VALID_RESPONSE}\nLet me know if you need anything else.`;

describe("JsonSchemaStrictAdapter (OpenAI / Grok strict)", () => {
  const adapter = new JsonSchemaStrictAdapter();

  it("adapt() emits OpenAI strict json_schema format", () => {
    const out = adapter.adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "result",
      modelId: "gpt-4o",
    });
    expect(out.requestBodyPatch).toEqual({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "result",
          schema: SAMPLE_SCHEMA,
          strict: true,
        },
      },
    });
  });

  it("postParse extracts JSON from clean response", () => {
    const out = adapter.postParse({ rawContent: VALID_RESPONSE });
    expect(out?.json).toEqual({ title: "hello", score: 0.9 });
  });

  it("postParse strips markdown wrapper", () => {
    const out = adapter.postParse({ rawContent: MARKDOWN_WRAPPED });
    expect(out?.json).toEqual({ title: "hello", score: 0.9 });
  });

  it("postParse extracts JSON from prose-prefixed response", () => {
    const out = adapter.postParse({ rawContent: PROSE_PREFIX });
    expect(out?.json).toEqual({ title: "hello", score: 0.9 });
  });

  it("postParse returns null on garbage", () => {
    expect(adapter.postParse({ rawContent: "not json at all" })).toBeNull();
  });
});

describe("JsonSchemaAdapter (non-strict)", () => {
  it("adapt() strict=false", () => {
    const out = new JsonSchemaAdapter().adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "result",
      modelId: "deepseek-chat",
    });
    const rf = out.requestBodyPatch.response_format as Record<string, unknown>;
    expect((rf.json_schema as Record<string, unknown>).strict).toBe(false);
  });
});

describe("AnthropicToolUseAdapter", () => {
  const adapter = new AnthropicToolUseAdapter();

  it("adapt() emits tool_use with input_schema and forced tool_choice", () => {
    const out = adapter.adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "extract_result",
      modelId: "claude-3.5-sonnet",
    });
    expect(out.requestBodyPatch).toMatchObject({
      tools: [
        {
          name: "extract_result",
          input_schema: SAMPLE_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "extract_result" },
    });
  });

  it("postParse prefers parsed tool_use block over rawContent", () => {
    const out = adapter.postParse({
      rawContent: "ignored",
      toolUseBlock: { name: "extract_result", input: { title: "x", score: 1 } },
    });
    expect(out?.json).toEqual({ title: "x", score: 1 });
  });

  it("postParse falls back to rawContent JSON when no tool_use block", () => {
    const out = adapter.postParse({ rawContent: VALID_RESPONSE });
    expect(out?.json).toEqual({ title: "hello", score: 0.9 });
  });
});

describe("JsonModeAdapter", () => {
  it("adapt() emits json_object response_format + system addon", () => {
    const out = new JsonModeAdapter().adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "r",
      modelId: "gpt-4o-mini",
    });
    expect(out.requestBodyPatch).toEqual({
      response_format: { type: "json_object" },
    });
    expect(out.systemPromptAddon).toContain("JSON object");
  });
});

describe("GeminiResponseSchemaAdapter", () => {
  it("adapt() puts responseSchema under generationConfig", () => {
    const out = new GeminiResponseSchemaAdapter().adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "r",
      modelId: "gemini-2.5-pro",
    });
    expect(out.requestBodyPatch).toMatchObject({
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: expect.any(Object),
      },
    });
  });

  it("strips $schema / additionalProperties (Gemini reject 这些字段)", () => {
    const noisySchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { x: { type: "string", format: "email" } },
      additionalProperties: false,
    };
    const out = new GeminiResponseSchemaAdapter().adapt({
      jsonSchema: noisySchema,
      schemaName: "r",
      modelId: "gemini-2.5-pro",
    });
    const rs = (
      out.requestBodyPatch.generationConfig as Record<string, unknown>
    ).responseSchema as Record<string, unknown>;
    expect(rs.$schema).toBeUndefined();
    expect(rs.additionalProperties).toBeUndefined();
    expect(rs.type).toBe("object");
  });
});

describe("GbnfGrammarAdapter (Llama.cpp / vLLM)", () => {
  it("adapt() includes grammar string + json_object hint", () => {
    const out = new GbnfGrammarAdapter().adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "r",
      modelId: "qwen2.5-7b",
    });
    expect(out.requestBodyPatch).toMatchObject({
      response_format: { type: "json_object" },
      grammar: expect.stringContaining("root"),
    });
  });
});

describe("PromptOnlyAdapter (last resort)", () => {
  const adapter = new PromptOnlyAdapter();

  it("adapt() embeds schema text into systemPromptAddon", () => {
    const out = adapter.adapt({
      jsonSchema: SAMPLE_SCHEMA,
      schemaName: "r",
      modelId: "deepseek-reasoner",
    });
    expect(out.requestBodyPatch).toEqual({});
    expect(out.systemPromptAddon).toContain("CRITICAL OUTPUT FORMAT");
    expect(out.systemPromptAddon).toContain("score");
  });

  it("postParse marks sanitized=true so caller knows it's best-effort", () => {
    const out = adapter.postParse({ rawContent: PROSE_PREFIX });
    expect(out?.json).toEqual({ title: "hello", score: 0.9 });
    expect(out?.sanitized).toBe(true);
  });
});

describe("NoneAdapter (无 structured output)", () => {
  it("adapt() empty patch", () => {
    expect(new NoneAdapter().adapt()).toEqual({ requestBodyPatch: {} });
  });

  it("postParse returns rawContent verbatim", () => {
    expect(new NoneAdapter().postParse({ rawContent: "free text" })?.json).toBe(
      "free text",
    );
  });
});

describe("Cross-adapter: 多种 LLM 异常输出兜底", () => {
  const adapter = new JsonSchemaStrictAdapter();

  it("尾随逗号也能 parse（LLM 输出 bug）", () => {
    expect(
      adapter.postParse({ rawContent: '{"title":"x","score":1,}' })?.json,
    ).toEqual({ title: "x", score: 1 });
  });

  it("数组 root 也能 parse", () => {
    expect(adapter.postParse({ rawContent: '[{"a":1}]' })?.json).toEqual([
      { a: 1 },
    ]);
  });

  it("空对象", () => {
    expect(adapter.postParse({ rawContent: "{}" })?.json).toEqual({});
  });

  it("嵌套对象", () => {
    expect(
      adapter.postParse({ rawContent: '{"a":{"b":{"c":42}}}' })?.json,
    ).toEqual({ a: { b: { c: 42 } } });
  });
});
