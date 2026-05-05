/**
 * Token bucket 限流算法（v5.1 R0.5-E 重新归位 ai-engine 核心 service）
 *
 * 历史：原作为 plugins/resilience/rate-limit 实现；2026-05-04 修正分类后
 * 回归 ai-engine —— token-bucket 是一个标准算法，非 swappable backend，
 * 不该是 plugin。
 *
 * 设计：
 * - 每个 key 一个 bucket（capacity / refillPerSec）
 * - tryConsume(n=1) 成功返回 true；不够返回 false
 * - 内存版（单 pod）；分布式版可后续加 Redis Lua 实现
 */
export interface ITokenBucketStore {
  /** 试图消耗 n 个 token；成功 true，失败 false */
  tryConsume(
    key: string,
    capacity: number,
    refillPerSec: number,
    n?: number,
  ): Promise<boolean>;
}

interface BucketState {
  tokens: number;
  lastRefill: number;
}

export class InMemoryTokenBucketStore implements ITokenBucketStore {
  private readonly buckets = new Map<string, BucketState>();

  async tryConsume(
    key: string,
    capacity: number,
    refillPerSec: number,
    n = 1,
  ): Promise<boolean> {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // 按经过时间补充 token
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    const refilled = Math.min(
      capacity,
      bucket.tokens + elapsedSec * refillPerSec,
    );
    bucket.tokens = refilled;
    bucket.lastRefill = now;

    if (bucket.tokens < n) return false;
    bucket.tokens -= n;
    return true;
  }

  /** 测试用：手动设置 token */
  setForTest(key: string, tokens: number): void {
    this.buckets.set(key, { tokens, lastRefill: Date.now() });
  }

  /** 测试用：清空 */
  clearForTest(): void {
    this.buckets.clear();
  }
}
