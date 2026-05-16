/**
 * 通用 LLM JSON 解析工具：
 *
 * LLM 输出可能是裸 JSON / Markdown 包裹 / 含 leading text。
 * 提取首个看起来像 JSON 对象/数组的子串再 JSON.parse。
 */
export function extractJsonString(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // 去掉 ```json ... ``` 围栏
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // 找首个 { 或 [ 起到对应结束符
  const firstBrace = Math.min(
    ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0),
  );
  if (!Number.isFinite(firstBrace)) return trimmed;
  return trimmed.slice(firstBrace);
}

export function tryParseJson<T = unknown>(text: string): T | null {
  const candidate = extractJsonString(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/**
 * 将原始数组 chunk 化（用于 LLM batch 调用）。
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [arr.slice()];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * 截断字符串，留 N 字符（避免 LLM prompt 过长）。
 */
export function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

/**
 * 将 LLM 整数 score clamp 到 [0, 100]。
 */
export function clampScore(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}
