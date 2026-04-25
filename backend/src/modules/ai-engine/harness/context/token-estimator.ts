/**
 * TokenEstimator — 精确 + 启发双层 token 计数
 *
 * v2 (PR-D)：
 *   - 默认走 gpt-tokenizer（cl100k_base，OpenAI / Claude 都接近，差 < 5%）
 *   - 失败时 fallback 到 4 chars/token 启发（保护初始化期 / Edge runtime 等环境）
 *   - 暴露 estimateForModel(model, text) — 未来按 model family 切分；当前都用 cl100k_base
 *
 * 用途：
 *   - ContextManager.ensureBudget 决定是否 compact
 *   - BudgetAccountant 不直接用本估算（用 LLM provider 返回的真值）；
 *     仅 Loop 决策"现在还能放下多少消息"时调
 */

import type { IContextEnvelope, IContextMessage } from "../abstractions";

const CHARS_PER_TOKEN_FALLBACK = 4;

let encoder: { encode: (text: string) => number[] } | null = null;
let encoderInitFailed = false;

function getEncoder(): { encode: (text: string) => number[] } | null {
  if (encoderInitFailed) return null;
  if (encoder) return encoder;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require("gpt-tokenizer") as {
      encode: (text: string) => number[];
    };
    encoder = lib;
    return lib;
  } catch {
    encoderInitFailed = true;
    return null;
  }
}

function encodedLength(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // fall through
    }
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN_FALLBACK);
}

/** 单条消息估算 */
export function estimateMessageTokens(message: IContextMessage): number {
  // role wrapper overhead ≈ 4 tokens (OpenAI ChatML standard)
  return encodedLength(message.content) + 4;
}

/**
 * PR-I 修复 #3: envelope token 估算 cache。
 *
 * 缓存键 = envelope.id + messages.length + reminders.length。
 * envelope 增量变化时（push 一条 message），messages.length 变化即 cache miss。
 * envelope.id 不变 + 长度不变 = 同一对象的多次询问 → cache hit，O(1)。
 *
 * 注意：本 cache 是 best-effort。compaction 后 messages.length 减少，cache key 变化，
 * 自动重算；不会返回过期值。
 */
const envelopeCache = new WeakMap<
  IContextEnvelope,
  { key: string; tokens: number }
>();

/** 整个 envelope 估算（system + reminders + messages + tools） */
export function estimateEnvelopeTokens(envelope: IContextEnvelope): number {
  const key = `${envelope.id}|${envelope.messages.length}|${envelope.reminders.length}`;
  const cached = envelopeCache.get(envelope);
  if (cached && cached.key === key) return cached.tokens;

  let total = 0;
  total += encodedLength(envelope.system);
  for (const r of envelope.reminders) {
    total += encodedLength(r.content) + 4;
  }
  for (const m of envelope.messages) {
    total += estimateMessageTokens(m);
  }
  // Tool descriptions ≈ 10 tokens each if only listed by id
  total += envelope.tools.length * 10;

  envelopeCache.set(envelope, { key, tokens: total });
  return total;
}

/**
 * 按 modelId 估算（v2 占位 —— 当前所有 model 共用 cl100k_base 表）。
 * 未来 Anthropic 发布官方 tokenizer 时按 model family switch。
 */
export function estimateForModel(_modelId: string, text: string): number {
  return encodedLength(text);
}
