/**
 * TokenEstimator — 轻量 token 估算（字符近似）
 *
 * 精确计数需要各 provider 的 tokenizer；在 harness 层只做 budget pre-check 和
 * compaction 触发，差 20% 完全可接受。统一用 "4 chars ≈ 1 token" 的保守估算。
 *
 * 如果未来需要精确数值，替换这一个文件的实现即可，其他模块无感知。
 */

import type { IContextEnvelope, IContextMessage } from "../abstractions";

const CHARS_PER_TOKEN = 4;

/** 单条消息估算 */
export function estimateMessageTokens(message: IContextMessage): number {
  // content + role overhead (~4 tokens for "role: " wrapper)
  return Math.ceil(message.content.length / CHARS_PER_TOKEN) + 4;
}

/** 整个 envelope 估算（system + reminders + messages + tools） */
export function estimateEnvelopeTokens(envelope: IContextEnvelope): number {
  let total = 0;
  total += Math.ceil(envelope.system.length / CHARS_PER_TOKEN);
  for (const r of envelope.reminders) {
    total += Math.ceil(r.content.length / CHARS_PER_TOKEN) + 4;
  }
  for (const m of envelope.messages) {
    total += estimateMessageTokens(m);
  }
  // Tool descriptions ≈ 10 tokens each if only listed by id
  total += envelope.tools.length * 10;
  return total;
}
