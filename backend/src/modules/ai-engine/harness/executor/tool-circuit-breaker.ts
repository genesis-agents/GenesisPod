/**
 * ToolCircuitBreaker — PR-I 修复 #6
 *
 * 当一个 tool 在窗口内连续失败 N 次，自动 trip（短路），后续调用直接 fail
 * 不再真正触发 tool。窗口冷却后自动 half-open，允许 1 次试探。
 *
 * 状态：
 *   closed   · 正常工作
 *   open     · 短路；所有调用直接 fail
 *   half-open · 冷却结束后允许 1 次试探调用
 *
 * 默认参数（可注入）：
 *   failureThreshold = 3
 *   recoveryWindowMs = 60_000
 *
 * 与 LLM retry 的区别：
 *   - retry 是单次请求重试（处理瞬时网络抖动）
 *   - circuit breaker 是跨请求保护（处理 tool 持续坏掉，如 API 配额耗尽）
 */

import { Injectable } from "@nestjs/common";

type State = "closed" | "open" | "half-open";

interface ToolStat {
  consecutiveFailures: number;
  state: State;
  openedAt?: number;
}

@Injectable()
export class ToolCircuitBreaker {
  private readonly stats = new Map<string, ToolStat>();
  private readonly failureThreshold: number;
  private readonly recoveryWindowMs: number;

  constructor(
    opts: { failureThreshold?: number; recoveryWindowMs?: number } = {},
  ) {
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.recoveryWindowMs = opts.recoveryWindowMs ?? 60_000;
  }

  /** Returns true if the tool call should be allowed. */
  allow(toolId: string): boolean {
    const s = this.stats.get(toolId);
    if (!s || s.state === "closed") return true;
    if (s.state === "half-open") return true;
    // open: check whether cool-down expired → half-open
    if (s.openedAt && Date.now() - s.openedAt >= this.recoveryWindowMs) {
      s.state = "half-open";
      return true;
    }
    return false;
  }

  recordSuccess(toolId: string): void {
    const s = this.stats.get(toolId);
    if (!s) return;
    s.consecutiveFailures = 0;
    s.state = "closed";
    s.openedAt = undefined;
  }

  recordFailure(toolId: string): void {
    const s = this.stats.get(toolId) ?? {
      consecutiveFailures: 0,
      state: "closed" as State,
    };
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= this.failureThreshold) {
      s.state = "open";
      s.openedAt = Date.now();
    }
    this.stats.set(toolId, s);
  }

  /** Test introspection */
  getState(toolId: string): State {
    return this.stats.get(toolId)?.state ?? "closed";
  }

  reset(toolId?: string): void {
    if (toolId) this.stats.delete(toolId);
    else this.stats.clear();
  }
}
