/**
 * DomainEventBus — 业务事件中央枢纽
 *
 * 职责：
 *   1. emit() 时按 DomainEventRegistry 校验 type + payload schema
 *   2. 应用 throttle（每 source 每 window 最多 N 条）
 *   3. 应用 idempotency（idempotencyKey 在 60s 内重复直接 drop）
 *   4. 分发到所有 accept 的 IBroadcastAdapter
 *   5. adapter 失败只 logger.warn，永不抛
 *
 * 与 IAgentEvent 的桥接：
 *   - 业务方在 hook 里把 IAgentEvent 翻译成 DomainEvent
 *   - 例：PostToolUse hook → emit('{app}.evidence:found', {...})
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { DomainEventRegistry } from "./domain-event-registry";
import { IBroadcastAdapter, LoggerBroadcastAdapter } from "./broadcast-adapter";
import type { DomainEvent } from "./domain-event.types";

interface ThrottleState {
  windowStart: number;
  count: number;
}

@Injectable()
export class DomainEventBus {
  private readonly log = new Logger(DomainEventBus.name);
  private readonly adapters: IBroadcastAdapter[] = [];
  /** key = type|sourceKey, value = throttle state */
  private readonly throttle = new Map<string, ThrottleState>();
  /** 幂等去重 LRU（key = idempotencyKey, value = expiresAt） */
  private readonly idempotency = new Map<string, number>();
  private readonly idempotencyTtlMs = 60_000;
  private readonly idempotencyCap = 10_000;
  /**
   * 建议修 #3: throttle 计数器；每 N 次 emit 扫一次 throttle Map 删过期条目。
   * 防止长跑服务里大量不同 (type, agentId) 组合无限累积。
   */
  private throttleEmitCounter = 0;
  private readonly throttleGcEvery = 500;

  constructor(
    private readonly registry: DomainEventRegistry,
    @Optional() defaultAdapter?: LoggerBroadcastAdapter,
  ) {
    if (defaultAdapter) this.adapters.push(defaultAdapter);
  }

  registerAdapter(adapter: IBroadcastAdapter): void {
    if (!this.adapters.find((a) => a.id === adapter.id)) {
      this.adapters.push(adapter);
    }
  }

  unregisterAdapter(id: string): void {
    const i = this.adapters.findIndex((a) => a.id === id);
    if (i >= 0) this.adapters.splice(i, 1);
  }

  /**
   * 发出业务事件。
   * 返回 true 表示事件被广播；false 表示被 throttle/dedupe drop 或 schema 失败。
   */
  async emit<TPayload>(event: DomainEvent<TPayload>): Promise<boolean> {
    const spec = this.registry.get(event.type);
    if (!spec) {
      this.log.warn(
        `Domain event "${event.type}" not registered — dropping. ` +
          `Use DomainEventRegistry.register() at module init.`,
      );
      return false;
    }

    // 1. Schema validation
    if (spec.schema) {
      const parsed = spec.schema.safeParse(event.payload);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ");
        const msg = `Domain event "${event.type}" payload validation failed: ${detail}`;
        // 默认行为：log.error + return false（不阻断业务，避免单事件挂全 mission）。
        // Railway stderr 会捕获 .error 便于事后溯源。
        // STRICT_DOMAIN_EVENT_VALIDATION=true 时 throw（dev 期排查 contract drift
        // 用，让 backend 自己炸而不是污染前端 ErrorBoundary）。
        this.log.error(msg);
        if (process.env.STRICT_DOMAIN_EVENT_VALIDATION === "true") {
          throw new Error(msg);
        }
        return false;
      }
    }

    // 2. Idempotency dedupe
    if (event.idempotencyKey) {
      const now = Date.now();
      this.gcIdempotency(now);
      const expires = this.idempotency.get(event.idempotencyKey);
      if (expires && expires > now) {
        return false;
      }
      this.idempotency.set(event.idempotencyKey, now + this.idempotencyTtlMs);
    }

    // 3. Throttle per (type, agentId|*) — 建议修 #3+#5: agentId 缺失时用 type 做全局 throttle
    if (spec.throttle) {
      this.throttleEmitCounter += 1;
      if (this.throttleEmitCounter >= this.throttleGcEvery) {
        this.gcThrottle();
        this.throttleEmitCounter = 0;
      }
      const sourceKey = event.agentId ?? "__global__";
      const key = `${event.type}|${sourceKey}`;
      const state = this.throttle.get(key);
      const now = Date.now();
      if (!state || now - state.windowStart > spec.throttle.windowMs) {
        this.throttle.set(key, { windowStart: now, count: 1 });
      } else if (state.count >= spec.throttle.maxEvents) {
        return false; // throttled
      } else {
        state.count += 1;
      }
    }

    // 4. Broadcast
    await Promise.all(
      this.adapters
        .filter((a) => a.accepts(event))
        .map((a) =>
          a.broadcast(event).catch((err) => {
            this.log.warn(
              `Adapter ${a.id} failed for ${event.type}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }),
        ),
    );
    return true;
  }

  private gcIdempotency(now: number): void {
    if (this.idempotency.size < this.idempotencyCap) return;
    for (const [k, exp] of this.idempotency.entries()) {
      if (exp <= now) this.idempotency.delete(k);
    }
  }

  /** 建议修 #3: 删 windowStart 超过 2×最大 windowMs 的过期条目 */
  private gcThrottle(): void {
    const now = Date.now();
    // 用所有 spec 中最大 windowMs 的 2 倍当 stale 阈值（保守，不会误删）
    let maxWindow = 60_000;
    for (const spec of this.registry.list()) {
      if (spec.throttle && spec.throttle.windowMs > maxWindow) {
        maxWindow = spec.throttle.windowMs;
      }
    }
    const stale = now - 2 * maxWindow;
    for (const [k, state] of this.throttle.entries()) {
      if (state.windowStart < stale) this.throttle.delete(k);
    }
  }
}
