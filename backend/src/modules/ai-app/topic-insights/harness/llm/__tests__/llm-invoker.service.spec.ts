/**
 * LlmInvokerService 单元测试
 *
 * 覆盖：
 * - JSON 提取（3 种 pattern：纯 / fence / 混合）
 * - Zod schema-valid → 返回 parsed
 * - Schema invalid → retry；成功后返回；超限 → StageSchemaError
 * - AbortSignal 生效
 * - 真 tokens / cost 从 chat.usage 累加
 */

import { z } from "zod";
import {
  LlmInvokerService,
  __extractJsonForTests as extractJson,
} from "../llm-invoker.service";
import type { AiChatService } from "@/modules/ai-engine/facade";
import { StageSchemaError } from "../../../pipeline/types";

describe("extractJson", () => {
  it("纯 JSON", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("fenced ```json block", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("混合文本（balanced brace scan）", () => {
    expect(extractJson('前言...\n{"a": {"b": 2}, "c": "x"}\n...结尾')).toEqual({
      a: { b: 2 },
      c: "x",
    });
  });

  it("无 JSON → 抛错", () => {
    expect(() => extractJson("plain text")).toThrow(/no JSON/);
  });

  it("大括号不闭合 → 抛错", () => {
    expect(() => extractJson("text { a: 1")).toThrow(/unmatched braces/);
  });
});

describe("LlmInvokerService", () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int().nonnegative(),
  });

  function makeChat(
    responses: Array<{ content: string; usage?: Record<string, number> }>,
  ): AiChatService {
    let i = 0;
    return {
      chat: jest.fn(() => {
        const r = responses[i++] ?? responses[responses.length - 1];
        return Promise.resolve({
          content: r.content,
          model: "gpt-4o",
          usage: {
            totalTokens: r.usage?.totalTokens ?? 100,
            inputTokens: r.usage?.inputTokens ?? 40,
            outputTokens: r.usage?.outputTokens ?? 60,
          },
          isError: false,
        });
      }),
    } as unknown as AiChatService;
  }

  it("首次就通过 schema → 返回 parsed + tokens", async () => {
    const invoker = new LlmInvokerService(
      makeChat([{ content: '{"name":"A","count":2}' }]),
    );
    const r = await invoker.invoke({
      agentId: "AG-TEST",
      systemPrompt: "sys",
      userPrompt: "user",
      schema,
      taskProfile: { creativity: "low", outputLength: "short" },
    });
    expect(r.output).toEqual({ name: "A", count: 2 });
    expect(r.tokensUsed).toBe(100);
    expect(r.retries).toBe(0);
    expect(r.model).toBe("gpt-4o");
    expect(r.costUsd).toBeGreaterThan(0);
  });

  it("第一次 schema 失败，第二次通过", async () => {
    const invoker = new LlmInvokerService(
      makeChat([
        { content: '{"name":"","count":-1}' }, // invalid
        { content: '{"name":"B","count":3}' }, // valid
      ]),
    );
    const r = await invoker.invoke({
      agentId: "AG-TEST",
      systemPrompt: "sys",
      userPrompt: "user",
      schema,
      taskProfile: { creativity: "low", outputLength: "short" },
    });
    expect(r.output).toEqual({ name: "B", count: 3 });
    expect(r.retries).toBe(1);
    expect(r.tokensUsed).toBe(200); // accumulated
  });

  it("所有 retry 都失败 → StageSchemaError", async () => {
    const invoker = new LlmInvokerService(
      makeChat([
        { content: '{"name":"","count":-1}' },
        { content: '{"name":"","count":-2}' },
        { content: '{"name":"","count":-3}' },
      ]),
    );
    await expect(
      invoker.invoke({
        agentId: "AG-TEST",
        systemPrompt: "sys",
        userPrompt: "user",
        schema,
        taskProfile: { creativity: "low", outputLength: "short" },
        maxRetries: 2,
      }),
    ).rejects.toBeInstanceOf(StageSchemaError);
  });

  it("AbortSignal 触发 → 抛 AbortError", async () => {
    const invoker = new LlmInvokerService(
      makeChat([{ content: '{"name":"A","count":1}' }]),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      invoker.invoke({
        agentId: "AG-TEST",
        systemPrompt: "sys",
        userPrompt: "user",
        schema,
        taskProfile: { creativity: "low", outputLength: "short" },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("JSON extract 失败 → retry 一次，成功", async () => {
    const invoker = new LlmInvokerService(
      makeChat([
        { content: "plain text no json at all" },
        { content: '{"name":"ok","count":5}' },
      ]),
    );
    const r = await invoker.invoke({
      agentId: "AG-TEST",
      systemPrompt: "sys",
      userPrompt: "user",
      schema,
      taskProfile: { creativity: "low", outputLength: "short" },
    });
    expect(r.output.name).toBe("ok");
    expect(r.retries).toBe(1);
  });

  it("chat.isError=true 时抛错，不 retry", async () => {
    const chat = {
      chat: jest.fn().mockResolvedValue({
        content: "network error",
        model: "gpt-4o",
        usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
        isError: true,
      }),
    } as unknown as AiChatService;
    const invoker = new LlmInvokerService(chat);
    await expect(
      invoker.invoke({
        agentId: "AG-TEST",
        systemPrompt: "sys",
        userPrompt: "user",
        schema,
        taskProfile: { creativity: "low", outputLength: "short" },
      }),
    ).rejects.toThrow(/isError/);
  });
});
