/**
 * leader-decision-parser —— LLM 决策 JSON 解析（纯函数）
 *
 * 拆自 leader-chat.service.ts（2026-05-04 单文件超 500 行违反 standards/16 §六，
 * 提取为独立模块）。
 *
 * 设计：
 *   • 纯函数：(raw: string) => { response, decision }
 *   • 输入：LLM 原始输出（含 ```json fence / 裸 JSON / 纯文本三种形态）
 *   • 输出：response 文本 + LeaderDecision 结构化决策
 *   • 容错：fence 解析失败 / JSON 不全 / 字段缺失 → 降级 DIRECT_ANSWER
 *
 * 注：parser 本身（fence 提取 + JSON.parse + 字段白名单）是通用模式，
 * W22 评估时可考虑下沉到 engine/content/json-fence-parser 作为"LLM 输出
 * structured decision 解析"通用基元，让其他 ai-app 复用。当前留 app 是因为：
 *   1. LeaderDecisionType 4 个值是 playground 产品 DSL（不通用）
 *   2. 字段名 todo / clarifyOptions / understanding 也是产品命名
 * 真正可下沉的部分需先抽接口 + 定义 generic schema 才能跨 ai-app 复用。
 */

export type LeaderDecisionType =
  | "DIRECT_ANSWER" // 直接回答（讨论 / 解释）
  | "CREATE_TODO" // 用户提了新任务 → 追加 dimension
  | "CLARIFY" // 信息不足 → 提供选项让用户选
  | "ACKNOWLEDGE"; // 致谢 / 闲聊

export interface LeaderDecision {
  type: LeaderDecisionType;
  /** 一句话理解："我理解你想要…" — chip 显示 */
  understanding?: string;
  /** CREATE_TODO 时真任务列表 */
  todo?: { name: string; rationale: string }[];
  /** CLARIFY 时按钮选项 */
  clarifyOptions?: string[];
}

const VALID_TYPES: LeaderDecisionType[] = [
  "DIRECT_ANSWER",
  "CREATE_TODO",
  "CLARIFY",
  "ACKNOWLEDGE",
];

/**
 * 解析 LLM 输出 —— 期望 JSON {response, decisionType, understanding, todo, clarifyOptions}
 * 容错：
 *   - 没找到 fence 也试试整段当 JSON
 *   - JSON 格式不全 → 降级为 DIRECT_ANSWER + 原文（剥离 fence）
 *   - response 字段缺失 → 回退到 understanding / fence-外的文字 / 原文
 */
export function parseLeaderDecisionResponse(raw: string): {
  response: string;
  decision: LeaderDecision | null;
} {
  const trimmed = raw.trim();
  // 找 JSON 块（```json fence 或裸 JSON）
  let jsonStr = trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  // 取 fence 外的纯文字作为 fallback（如果 LLM 在 JSON 之外还写了开场白）
  const outsideFenceText = fenceMatch
    ? trimmed.replace(fenceMatch[0], "").trim()
    : "";

  if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
    // 不是 JSON → 整段当 DIRECT_ANSWER
    return {
      response: raw,
      decision: { type: "DIRECT_ANSWER" },
    };
  }
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const decisionType = (parsed.decisionType ?? parsed.type) as
      | string
      | undefined;
    // response 优先级：parsed.response > parsed.message > understanding > fence外文字 > raw
    const response =
      (typeof parsed.response === "string" && parsed.response.trim()) ||
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof parsed.understanding === "string" &&
        parsed.understanding.trim()) ||
      (outsideFenceText.length > 0 ? outsideFenceText : null) ||
      raw;
    const safeType: LeaderDecisionType = VALID_TYPES.includes(
      decisionType as LeaderDecisionType,
    )
      ? (decisionType as LeaderDecisionType)
      : "DIRECT_ANSWER";
    const todoRaw = parsed.todo ?? parsed.tasks;
    const todo = Array.isArray(todoRaw)
      ? (todoRaw as { name?: unknown; rationale?: unknown }[])
          .filter(
            (t) =>
              t &&
              typeof t === "object" &&
              typeof (t as { name?: unknown }).name === "string",
          )
          .map((t) => ({
            name: (t as { name: string }).name,
            rationale:
              typeof (t as { rationale?: unknown }).rationale === "string"
                ? (t as { rationale: string }).rationale
                : "(no rationale)",
          }))
      : undefined;
    const clarifyOptions = Array.isArray(parsed.clarifyOptions)
      ? (parsed.clarifyOptions as unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : undefined;
    return {
      response,
      decision: {
        type: safeType,
        understanding:
          typeof parsed.understanding === "string"
            ? parsed.understanding
            : undefined,
        todo,
        clarifyOptions,
      },
    };
  } catch {
    return { response: raw, decision: { type: "DIRECT_ANSWER" } };
  }
}

/** 持久化的 decision JSON 字段 → 安全 LeaderDecision（旧消息 / 解析失败 → null） */
export function safeParseStoredDecision(raw: unknown): LeaderDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  return {
    type: o.type as LeaderDecisionType,
    understanding:
      typeof o.understanding === "string" ? o.understanding : undefined,
    todo: Array.isArray(o.todo)
      ? (o.todo as { name?: unknown; rationale?: unknown }[])
          .filter(
            (t) =>
              t &&
              typeof t.name === "string" &&
              typeof t.rationale === "string",
          )
          .map((t) => ({
            name: t.name as string,
            rationale: t.rationale as string,
          }))
      : undefined,
    clarifyOptions: Array.isArray(o.clarifyOptions)
      ? (o.clarifyOptions as unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : undefined,
  };
}
