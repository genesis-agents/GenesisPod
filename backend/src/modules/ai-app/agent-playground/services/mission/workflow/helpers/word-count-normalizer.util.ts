/**
 * 字数均衡化工具 —— 移植自 TI leader-planning.service.ts:859-880
 *
 * 背景：MissionOutlinePlannerAgent 让 LLM 自由分配 targetWordsPerChapter，
 * 但 LLM 偶发返回极度不均的分配（如 500 / 500 / 500 / 7000），导致：
 *   - 极小章节凑字数空话连篇
 *   - 极大章节超出 ChapterWriter budget.maxTokens 触发死循环（round 4 已观测）
 *
 * TI 在 200+ 报告生产环境验证的策略：
 *   1. 取所有 targetWords 的中位数 median
 *   2. 动态允许范围 [median × 0.5, median × 2]，但有绝对下限 (MIN) 与最低上限 (MAX_FLOOR)
 *   3. 超出范围的章节拉回中位数（下限）或 maxAllowed（上限）
 *
 * 与 TI 差异：
 *   - TI 的 MIN_ALLOWED=500 / MAX_FLOOR=2000（更小颗粒度，800-2K/section 策略）
 *   - playground epic 档位单章可达 12K（chapter 而非 section），故 MAX_FLOOR 提高到 8000
 *     但仍以 ChapterWriter schema max=12000 为硬上限
 */

const MIN_ALLOWED = 500;
const MAX_FLOOR = 8000;
const ABSOLUTE_MAX = 12000; // 与 chapter-writer.agent.ts targetWords schema 对齐

export interface NormalizedRecord {
  targetWords: Record<string, number>;
  /** 是否实际归一化过（值有变更） */
  normalized: boolean;
  /** 调试用：归一化后参数 */
  stats: {
    median: number;
    minAllowed: number;
    maxAllowed: number;
    countClampedDown: number;
    countClampedUp: number;
  };
}

/**
 * 对 targetWordsPerChapter 做中位数归一化。
 *
 * @param raw 原始 sectionId → targetWords 映射
 * @param fallbackMedian 当输入为空 / 全 0 时使用的兜底中位数
 * @returns 归一化后的映射 + 统计
 */
export function normalizeTargetWords(
  raw: Record<string, number>,
  fallbackMedian = 1000,
): NormalizedRecord {
  const entries = Object.entries(raw);
  if (entries.length === 0) {
    return {
      targetWords: {},
      normalized: false,
      stats: {
        median: fallbackMedian,
        minAllowed: MIN_ALLOWED,
        maxAllowed: MAX_FLOOR,
        countClampedDown: 0,
        countClampedUp: 0,
      },
    };
  }
  const values = entries.map(([, v]) => v).filter((v) => v > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : fallbackMedian;
  const minAllowed = Math.max(MIN_ALLOWED, Math.round(median * 0.5));
  const maxAllowed = Math.min(
    ABSOLUTE_MAX,
    Math.max(MAX_FLOOR, Math.round(median * 2)),
  );

  let countClampedDown = 0;
  let countClampedUp = 0;
  let normalized = false;
  const out: Record<string, number> = {};
  for (const [k, v] of entries) {
    let next = v;
    if (!next || next < minAllowed) {
      next = Math.max(800, median);
      countClampedDown++;
      normalized = next !== v;
    } else if (next > maxAllowed) {
      next = maxAllowed;
      countClampedUp++;
      normalized = true;
    }
    out[k] = next;
  }

  return {
    targetWords: out,
    normalized,
    stats: {
      median,
      minAllowed,
      maxAllowed,
      countClampedDown,
      countClampedUp,
    },
  };
}
