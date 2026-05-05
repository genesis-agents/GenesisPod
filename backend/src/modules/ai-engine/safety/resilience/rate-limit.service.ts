/**
 * RateLimitService — ai-engine 核心限速服务（v5.1 R0.5-E 重新归位）
 *
 * 历史：原作为 plugins/resilience/rate-limit；2026-05-04 修正分类后回归 engine
 * （token-bucket 算法标准实现，非可换 backend，不该做成 plugin）。
 *
 * 维度（业务无关）：
 *   - global：所有 LLM/Tool 调用共享 quota
 *   - per-tenant：按 meta.tenantId 分组
 *   - per-agent-type：按 meta.agentType 分组（agent 类型标签）
 *
 * 用法（直接注入）：
 *   constructor(private rateLimit: RateLimitService) {}
 *   const ok = await rateLimit.checkAndConsume("llm", { tenantId, agentType });
 *   if (!ok.allowed) throw new RateLimitedError(ok.scope, ok.retryAfterMs);
 *
 * 接入 ToolPipeline middleware：见 rate-limit.middleware.ts
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  type ITokenBucketStore,
  InMemoryTokenBucketStore,
} from "./token-bucket";

export interface RateLimitConfig {
  /** 全局 RPM（默认 600 req/min = 10 rps） */
  readonly globalRpm?: number;
  /** 每租户 RPM（默认 60 req/min） */
  readonly perTenantRpm?: number;
  /** 按 agentType 限流（业务无关标签） */
  readonly perAgentTypeRpm?: Readonly<Record<string, number>>;
  /** 默认 agentType 限流（未在 perAgentTypeRpm 列出的） */
  readonly defaultAgentTypeRpm?: number;
}

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly scope?: "global" | "tenant" | "agentType";
  readonly retryAfterMs?: number;
  /** 仅在 scope=tenant 时填 */
  readonly tenantId?: string;
  /** 仅在 scope=agentType 时填 */
  readonly agentType?: string;
}

const DEFAULT_GLOBAL_RPM = 600;
const DEFAULT_PER_TENANT_RPM = 60;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private store: ITokenBucketStore = new InMemoryTokenBucketStore();
  private globalRpm = DEFAULT_GLOBAL_RPM;
  private perTenantRpm = DEFAULT_PER_TENANT_RPM;
  private perAgentTypeRpm: Record<string, number> = {};
  private defaultAgentTypeRpm: number | undefined;

  /** 启动期或运行期注入 Redis-backed store（分布式限流） */
  setStore(store: ITokenBucketStore): void {
    this.store = store;
  }

  configure(config: RateLimitConfig): void {
    this.globalRpm = config.globalRpm ?? DEFAULT_GLOBAL_RPM;
    this.perTenantRpm = config.perTenantRpm ?? DEFAULT_PER_TENANT_RPM;
    this.perAgentTypeRpm = { ...(config.perAgentTypeRpm ?? {}) };
    this.defaultAgentTypeRpm = config.defaultAgentTypeRpm;
  }

  /**
   * 三维度检查并消耗 quota（任一超限即拒）。
   *
   * @param domain  业务无关分类（"llm" / "tool" / "embedding" 等）
   * @param keys    分组键
   * @returns       allowed=false 时携带 scope + retryAfterMs
   */
  async checkAndConsume(
    domain: string,
    keys: { tenantId?: string; agentType?: string },
  ): Promise<RateLimitCheckResult> {
    // ① global
    const globalRefill = this.globalRpm / 60;
    const ok1 = await this.store
      .tryConsume(`global:${domain}`, this.globalRpm, globalRefill)
      .catch(() => true); // fail-open（store 故障不阻塞主流程）
    if (!ok1) {
      this.logger.warn(`[RateLimit] global quota exceeded for ${domain}`);
      return { allowed: false, scope: "global", retryAfterMs: 1000 };
    }

    // ② per-tenant
    if (keys.tenantId) {
      const refill = this.perTenantRpm / 60;
      const ok2 = await this.store
        .tryConsume(
          `tenant:${keys.tenantId}:${domain}`,
          this.perTenantRpm,
          refill,
        )
        .catch(() => true);
      if (!ok2) {
        return {
          allowed: false,
          scope: "tenant",
          tenantId: keys.tenantId,
          retryAfterMs: 1000,
        };
      }
    }

    // ③ per-agent-type
    if (keys.agentType) {
      const rpm = this.resolveAgentTypeRpm(keys.agentType);
      if (rpm !== undefined) {
        const refill = rpm / 60;
        const ok3 = await this.store
          .tryConsume(`agentType:${keys.agentType}:${domain}`, rpm, refill)
          .catch(() => true);
        if (!ok3) {
          return {
            allowed: false,
            scope: "agentType",
            agentType: keys.agentType,
            retryAfterMs: 1000,
          };
        }
      }
    }

    return { allowed: true };
  }

  private resolveAgentTypeRpm(agentType: string): number | undefined {
    if (this.perAgentTypeRpm[agentType] !== undefined) {
      return this.perAgentTypeRpm[agentType];
    }
    return this.defaultAgentTypeRpm;
  }
}

/**
 * 限速错误（service 抛 / middleware 捕）
 */
export class RateLimitedError extends Error {
  constructor(
    public readonly scope: "global" | "tenant" | "agentType",
    public readonly retryAfterMs: number,
    public readonly tenantId?: string,
    public readonly agentType?: string,
  ) {
    super(
      `Rate-limited (scope=${scope}${tenantId ? `, tenantId=${tenantId}` : ""}${agentType ? `, agentType=${agentType}` : ""}, retryAfter=${retryAfterMs}ms)`,
    );
    this.name = "RateLimitedError";
  }
}
