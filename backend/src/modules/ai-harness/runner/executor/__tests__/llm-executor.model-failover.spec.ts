/**
 * stripThinkingSignature — 跨 provider failover 剥离 thinking/signature 单测
 *
 * 反向洞察 #6（query.ts:925-929）：thinking block 的 signature 与模型/provider
 * 绑定，跨 provider 重发会被对端确定性 400。本 spec 锁定 util 行为：
 *   - 跨 provider：剥离顶层 thinking/signature/reasoning/redacted_thinking
 *     + content/contentParts 数组里的 thinking/redacted_thinking 块 + 块内 signature
 *   - 同 provider：原样保留（signature 仍有效）
 *   - 未知 provider（from/to 任一空）：保守不剥离
 *   - 纯函数：不修改入参
 */

import { stripThinkingSignature } from "../strip-thinking-signature.util";

describe("stripThinkingSignature()", () => {
  // Anthropic-style assistant turn carrying a thinking block + signature.
  // ChatMessage 当前不声明 thinking/signature，用宽松形状模拟未来 provider 适配。
  const makeAnthropicAssistant = () => ({
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking: "let me reason step by step…",
        signature: "anthropic-sig-abc123",
      },
      { type: "text", text: "Here is my answer." },
    ],
    // some provider adapters also hang it at top level
    thinking: "duplicate top-level reasoning",
    signature: "anthropic-sig-abc123",
  });

  it("strips top-level thinking/signature/reasoning/redacted_thinking on cross-provider failover", () => {
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "answer",
        thinking: "secret reasoning",
        signature: "sig-xyz",
        reasoning: "more reasoning",
        redacted_thinking: "redacted blob",
      },
    ];

    const result = stripThinkingSignature(messages, "anthropic", "openai");

    const assistant = result[1] as Record<string, unknown>;
    expect(assistant.thinking).toBeUndefined();
    expect(assistant.signature).toBeUndefined();
    expect(assistant.reasoning).toBeUndefined();
    expect(assistant.redacted_thinking).toBeUndefined();
    // non-thinking fields preserved
    expect(assistant.content).toBe("answer");
    expect(assistant.role).toBe("assistant");
    // user turn untouched
    expect(result[0]).toEqual({ role: "user", content: "hi" });
  });

  it("strips thinking/redacted_thinking blocks and inner signature inside content arrays", () => {
    const messages = [makeAnthropicAssistant()];

    const result = stripThinkingSignature(messages, "anthropic", "openai");
    const assistant = result[0] as Record<string, unknown>;

    // top-level stripped
    expect(assistant.thinking).toBeUndefined();
    expect(assistant.signature).toBeUndefined();

    // content array: thinking block removed, text block kept
    const content = assistant.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ type: "text", text: "Here is my answer." });

    // no residual signature anywhere in the serialized message
    expect(JSON.stringify(result)).not.toContain("signature");
    expect(JSON.stringify(result)).not.toContain("anthropic-sig");
  });

  it("strips signature inside non-thinking content blocks but keeps the block", () => {
    const messages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "answer", signature: "leftover-sig" }],
      },
    ];

    const result = stripThinkingSignature(messages, "anthropic", "grok");
    const block = (result[0].content as Array<Record<string, unknown>>)[0];

    expect(block.type).toBe("text");
    expect(block.text).toBe("answer");
    expect(block.signature).toBeUndefined();
  });

  it("strips redacted_thinking blocks inside contentParts arrays", () => {
    const messages = [
      {
        role: "assistant",
        content: "fallback text",
        contentParts: [
          { type: "redacted_thinking", data: "encrypted-blob" },
          { type: "text", text: "visible" },
        ],
      },
    ];

    const result = stripThinkingSignature(messages, "anthropic", "openai");
    const parts = result[0].contentParts as Array<Record<string, unknown>>;

    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: "text", text: "visible" });
  });

  it("does NOT strip when failover stays on the same provider", () => {
    const messages = [makeAnthropicAssistant()];

    const result = stripThinkingSignature(messages, "anthropic", "anthropic");
    const assistant = result[0] as Record<string, unknown>;

    // signature still valid on same provider → preserved
    expect(assistant.signature).toBe("anthropic-sig-abc123");
    expect(assistant.thinking).toBe("duplicate top-level reasoning");
    const content = assistant.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("thinking");
  });

  it("is case-insensitive on provider comparison", () => {
    const messages = [makeAnthropicAssistant()];

    const result = stripThinkingSignature(messages, "Anthropic", "ANTHROPIC");
    expect((result[0] as Record<string, unknown>).signature).toBe(
      "anthropic-sig-abc123",
    );
  });

  it("does NOT strip when either provider is unknown (conservative)", () => {
    const messages = [makeAnthropicAssistant()];

    expect(
      (
        stripThinkingSignature(messages, undefined, "openai")[0] as Record<
          string,
          unknown
        >
      ).signature,
    ).toBe("anthropic-sig-abc123");

    expect(
      (
        stripThinkingSignature(messages, "anthropic", undefined)[0] as Record<
          string,
          unknown
        >
      ).signature,
    ).toBe("anthropic-sig-abc123");

    expect(
      (stripThinkingSignature(messages, "", "")[0] as Record<string, unknown>)
        .signature,
    ).toBe("anthropic-sig-abc123");
  });

  it("is a pure function — does not mutate the input messages", () => {
    const original = makeAnthropicAssistant();
    const messages = [original];
    const snapshot = JSON.parse(JSON.stringify(original));

    stripThinkingSignature(messages, "anthropic", "openai");

    // input untouched
    expect(original).toEqual(snapshot);
    expect(messages[0]).toBe(original);
  });

  it("returns a new array (not the same reference)", () => {
    const messages = [{ role: "user", content: "hi" }];
    const result = stripThinkingSignature(messages, "anthropic", "openai");
    expect(result).not.toBe(messages);
    expect(result).toEqual(messages);
  });
});
