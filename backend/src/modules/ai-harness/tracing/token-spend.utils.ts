/**
 * Token / cost 抽取与估算 —— 纯函数。
 */

import type { IAgentEvent } from "@/modules/ai-harness/facade";

/**
 * ★ P1-NEW-B (round 2): 容忍字符串数字 —— LLM provider 经 JSON 反序列化后
 * tokensUsed 偶发是 "100"（字符串），严格 typeof 判断会让所有事件被跳过，
 * 累加结果 0 → 预算上限保护失效 + cost UI 显示 $0。
 *
 * ★ P1-R3-A (round 3) + P2-R4-1 (round 4): 大数攻击面 —— 异常 provider 返回
 * "9e99" / "1e10" 等让 pool 瞬间溢出触发 budget exhausted；
 * 上限 5M tokens / call 给 Sonnet 1M context 极端长输出留余量，
 * 同时 reject 真垃圾大数。reject 时 console.warn 留可观测性。
 */
const MAX_TOKENS_PER_CALL = 5_000_000;

function safeNumber(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number" && !isNaN(v) && isFinite(v)) n = v;
  else if (typeof v === "string") {
    const parsed = Number(v);
    if (!isNaN(parsed) && isFinite(parsed)) n = parsed;
  }
  if (n == null) return null;
  if (n < 0 || n > MAX_TOKENS_PER_CALL) {
    // eslint-disable-next-line no-console
    console.warn(
      `[token-spend] rejected out-of-range tokensUsed=${n} (max=${MAX_TOKENS_PER_CALL})`,
    );
    return null;
  }
  return n;
}

export function extractTokenSpend(events: readonly IAgentEvent[]): number {
  let total = 0;
  let lastBudgetTokens = 0;
  for (const ev of events) {
    if (ev.type === "action_executed") {
      const p = ev.payload as { tokensUsed?: unknown } | null;
      const n = safeNumber(p?.tokensUsed);
      if (n != null) total += n;
    } else if (ev.type === "budget_warning") {
      const p = ev.payload as { tokensUsed?: unknown } | null;
      const n = safeNumber(p?.tokensUsed);
      if (n != null) lastBudgetTokens = Math.max(lastBudgetTokens, n);
    }
  }
  return Math.max(total, lastBudgetTokens);
}

/**
 * 粗略 USD 估算 —— demo 用，避免 Cost meter 永远 $0。
 * 真实账单走 CreditsService.consumeCredits（按模型分级算积分）。
 * Sonnet/4o 量级混合估算：~$3 / 1M tokens。
 */
export function estimateUsdFromTokens(tokens: number): number {
  return tokens * 0.000003;
}
