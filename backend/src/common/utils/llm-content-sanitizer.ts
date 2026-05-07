// PR-13 v1.5/v1.6 PR13-S1+S5 — LLM 内容 + 用户输入双向 prompt injection 防护
//
// 触发：
//   - PR13-S1 (security R2 P0): chapter-writer multi-call 中 previousContext 是 LLM 输出，
//     直接拼回下一 LLM call prompt 形成 indirect prompt injection 路径（CWE-77）
//   - PR13-S5 (security R3 P1): PROMPT_INJECTION_PATTERNS 仅 4 条 → v1.5 补 6 条
//   - PR13-S3 (security R2 P1): s7-5 planner heading/thesis 用户输入未 sanitize
//
// 设计：用户输入与 LLM 输出信任度同等，共用同一 sanitize 函数。
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 14.2 / § 15.3

const CONTROL_FORMAT_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // v1.4 原有 4 条
  /ignore\s+(previous|all|above|prior)/gi,
  /system\s*:\s*(you\s+are|forget)/gi,
  /\bnow\s+(output|reveal|tell\s+me)\s+your\s+(system|prompt|instructions)/gi,
  /\bact\s+as\s+(a\s+)?(different|new)/gi,

  // v1.5 PR13-S5 新增 6 条
  /\b(DAN|jailbreak|jailbroken|do\s+anything\s+now)\b/gi,
  /\brepeat\s+(the\s+)?above\s+instructions/gi,
  /\bprint\s+(your\s+)?(system\s+prompt|instructions|rules|constraints)/gi,
  /\btranslate\s+(the\s+)?above/gi,
  /\bwhat\s+(are\s+)?your\s+(instructions|rules|constraints|system\s+prompt)/gi,
  // 换行后插角色标签（"\nSystem: ..." / "\nAssistant: ..."）
  /\n\s*(system|assistant|user)\s*:/gi,
];

/**
 * v1.6 PR13-S1 / PR13-S3 共用：
 *
 *   - 用户原始输入（topic / chapter heading / thesis）进 LLM prompt 前
 *   - LLM 自身输出回注下游 LLM prompt 时（previousContext 路径，indirect injection）
 *
 * 两种场景信任度等同；都按 zero-width strip + injection pattern strip + slice 处理。
 */
export function sanitizeUserDerivedField(s: string, maxLen: number): string {
  if (!s) return "";
  // 1. strip 零宽 / 格式控制字符（防 padding）
  let out = s.replace(CONTROL_FORMAT_RE, "");
  // 2. strip 主流 prompt injection patterns
  for (const re of PROMPT_INJECTION_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  // 3. 长度截断
  return out.slice(0, maxLen);
}

/**
 * sanitizeLlmOutput — sanitizeUserDerivedField 的同义 export。
 * 语义清晰：LLM 输出不可信（与用户输入等级），回注下游 prompt 必经此函数。
 */
export const sanitizeLlmOutput = sanitizeUserDerivedField;
