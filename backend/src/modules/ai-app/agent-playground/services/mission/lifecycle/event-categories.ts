/**
 * Mission events 表 type 字符串前缀分类。
 *
 * 设计来源：rerun-overhaul-design-v1.md §3.3
 *
 * 用途：RerunGuard.getLatestBusinessEventTs 区分"业务真活迹"vs"用户行为/状态机/cleanup"，
 * 防止 c195035f 类因果倒置（用户 emit 的 lifecycle 事件被自己当 mission 活迹读 → 拒绝用户）。
 *
 * 决策（4 路 R1+R2 共识）：
 *   - BUSINESS：全限定前缀 + startsWith 匹配（不能用 includes，防 type="mission:lifecycle-note-dimension:fake" 子串攻击）
 *   - LIFECYCLE：精确字符串集合（Set.has，不会误伤）
 *   - UNKNOWN（既不是 BUSINESS 前缀也不在 LIFECYCLE 列表）→ fail-open 当 BUSINESS：
 *     宁可误算活迹放行用户（用户重试 1 次即可），也不误判 zombie 把跑着的 mission 杀掉
 *     （数据可能不可恢复，对齐 feedback_destructive_op_must_have_rollback）。
 *     UNKNOWN 命中时调用方有责任 Logger.warn（让 prod 观测后续补分类）。
 *
 * PR review checklist：新增 emit 点必须 grep 此文件确认归类（不在 BUSINESS_PREFIXES /
 * LIFECYCLE_TYPES 任一时 categorizeEvent 返回 UNKNOWN —— 不静默落空）。
 */

export const EVENT_CATEGORY = {
  /** 业务进展真活迹（命名空间全限定前缀，startsWith 匹配） */
  BUSINESS_PREFIXES: [
    "agent-playground.dimension:",
    "agent-playground.chapter:",
    "agent-playground.stage:",
    "agent-playground.agent:narrative",
    "agent-playground.tool:",
  ] as const,
  /** 状态机 / 用户行为 / 失败 / 完成标记 / cleanup（精确字符串匹配） */
  LIFECYCLE_TYPES: new Set<string>([
    "agent-playground.mission:rerun-started",
    "agent-playground.mission:rerun-completed",
    "agent-playground.mission:rerun-failed",
    "agent-playground.mission:reopened",
    "agent-playground.mission:failed",
    "agent-playground.mission:completed",
    "agent-playground.mission:cancelled",
    "agent-playground.mission:rejected",
    "agent-playground.mission:warning",
    "agent-playground.mission:budget-warning-hard",
    "agent-playground.mission:manual-rerun-from-todo",
    "agent-playground.mission:zombie-cleanup",
  ]),
} as const;

export type EventCategory = "BUSINESS" | "LIFECYCLE" | "UNKNOWN";

export function categorizeEvent(
  eventType: string | null | undefined,
): EventCategory {
  if (typeof eventType !== "string" || eventType.length === 0) return "UNKNOWN";
  if (EVENT_CATEGORY.LIFECYCLE_TYPES.has(eventType)) return "LIFECYCLE";
  if (EVENT_CATEGORY.BUSINESS_PREFIXES.some((p) => eventType.startsWith(p))) {
    return "BUSINESS";
  }
  return "UNKNOWN";
}

export function isBusinessEventType(
  eventType: string | null | undefined,
): boolean {
  // UNKNOWN = fail-open 当 BUSINESS（宁可误算活迹放行用户）
  const cat = categorizeEvent(eventType);
  return cat === "BUSINESS" || cat === "UNKNOWN";
}

export function isLifecycleEventType(
  eventType: string | null | undefined,
): boolean {
  return categorizeEvent(eventType) === "LIFECYCLE";
}
