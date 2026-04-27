/**
 * MissionStateService —— stage 间上下文管理 + Summarize-on-Handoff
 *
 * 上游：mission-pipeline-baseline.md §9.1 / Q8
 *
 * 职责：
 *   - 内存维护 mission 级 state（plan / researcherResults / reconciliation / analyst / writer / reviewer）
 *   - 估算每个 stage handoff payload 的 token 数
 *   - 超 50K tokens（baseline §9.1）自动 summarize 后再传下游
 *   - 全程不进 LLM context，只供 orchestrator 编排用
 */

import { Injectable, Logger } from "@nestjs/common";

const HANDOFF_TOKEN_LIMIT = 50_000;
const CHARS_PER_TOKEN = 3.5; // 中英混合粗估

@Injectable()
export class MissionStateService {
  private readonly log = new Logger(MissionStateService.name);

  /** Phase P17-1: 上限暴露给上层调用（如 stage 预检） */
  readonly handoffTokenLimit = HANDOFF_TOKEN_LIMIT;

  /**
   * 估算 payload tokens（粗估：JSON 序列化字符数 / 3.5）
   */
  estimateTokens(payload: unknown): number {
    if (payload == null) return 0;
    if (typeof payload === "string") {
      return Math.ceil(payload.length / CHARS_PER_TOKEN);
    }
    return Math.ceil(JSON.stringify(payload).length / CHARS_PER_TOKEN);
  }

  /**
   * 检查 handoff payload 是否超限。超限时返回压缩后的版本。
   *
   * 当前压缩策略（简化）：
   *   - researcherResults：每个 finding 的 evidence 截到 200 字符
   *   - findings 数组限制每 dim 前 6 个
   *   - 单 dim summary 截到 500 字符
   *
   * 未来 P2 升级：用 LLM 真做 summarize（多花 ~5K tokens 但能压成 1/5）
   */
  compressIfNeeded<T>(payload: T, label: string): T {
    const tokens = this.estimateTokens(payload);
    if (tokens <= HANDOFF_TOKEN_LIMIT) return payload;
    this.log.warn(
      `[MissionState] ${label} handoff size ${tokens} > ${HANDOFF_TOKEN_LIMIT} tokens — compressing`,
    );
    return this.compress(payload) as T;
  }

  private compress(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      // researcherResults 类
      return obj.map((item) => this.compressItem(item)).slice(0, 12);
    }
    if (obj && typeof obj === "object") {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        r[k] = this.compressItem(v);
      }
      return r;
    }
    if (typeof obj === "string" && obj.length > 1500) {
      return obj.slice(0, 1500) + "…(truncated)";
    }
    return obj;
  }

  private compressItem(item: unknown): unknown {
    if (Array.isArray(item)) {
      // findings / 列表 → 截前 6 个 + 每条压
      return item.slice(0, 6).map((x) => this.compressItem(x));
    }
    if (item && typeof item === "object") {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 500) {
          r[k] = v.slice(0, 500) + "…";
        } else {
          r[k] = v;
        }
      }
      return r;
    }
    if (typeof item === "string" && item.length > 1500) {
      return item.slice(0, 1500) + "…";
    }
    return item;
  }
}
