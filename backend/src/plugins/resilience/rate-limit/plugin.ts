/**
 * rate-limit plugin 实现（v5.1 R0.5 PR-9）
 *
 * 维度（按 standards/19 §四 业务无关，严禁 appName）：
 *   - global：所有 LLM/Tool 调用共享 quota
 *   - per-tenant：按 meta.tenantId 分组
 *   - per-agent-type：按 meta.agentType 分组（agent 类型标签，非 ai-app 名）
 *
 * 触发：超限 → ctx.abort('rate-limited')；abort 携带 reason + retryAfterMs。
 * ToolPipeline / AiChatService 在 abort 路径仍 fire _AFTER（HIGH-3）。
 */
import type {
  IPlugin,
  IPluginContext,
  HookHandler,
  PluginHealth,
  LlmRequestPayload,
  ToolBeforePayload,
} from "@/plugins/core/abstractions";
import { CORE_HOOKS } from "@/plugins/core/abstractions";
import { RATE_LIMIT_MANIFEST } from "./manifest";
import {
  type ITokenBucketStore,
  InMemoryTokenBucketStore,
} from "./token-bucket";

export interface RateLimitConfig {
  /** 全局 RPM（默认 600 req/min = 10 rps）*/
  readonly globalRpm?: number;
  /** 每租户 RPM（默认 60 req/min）*/
  readonly perTenantRpm?: number;
  /** 按 agentType 标签限流（业务无关，例：research-style/write-style）*/
  readonly perAgentTypeRpm?: Readonly<Record<string, number>>;
  /** 默认 agentType 限流（未在 perAgentTypeRpm 列出的 agentType 用此值）*/
  readonly defaultAgentTypeRpm?: number;
}

export class RateLimitPlugin implements IPlugin<RateLimitConfig> {
  readonly manifest = RATE_LIMIT_MANIFEST;

  private store: ITokenBucketStore;
  private globalRpm = 600;
  private perTenantRpm = 60;
  private perAgentTypeRpm: Record<string, number> = {};
  private defaultAgentTypeRpm: number | undefined;
  private logger?: IPluginContext["logger"];

  constructor(store?: ITokenBucketStore) {
    this.store = store ?? new InMemoryTokenBucketStore();
  }

  setStore(store: ITokenBucketStore): void {
    this.store = store;
  }

  async init(ctx: IPluginContext, config: RateLimitConfig): Promise<void> {
    this.logger = ctx.logger;
    this.globalRpm = config.globalRpm ?? 600;
    this.perTenantRpm = config.perTenantRpm ?? 60;
    this.perAgentTypeRpm = { ...(config.perAgentTypeRpm ?? {}) };
    this.defaultAgentTypeRpm = config.defaultAgentTypeRpm;

    ctx.hooks.register(CORE_HOOKS.LLM_REQUEST, this.onLlmRequest, {
      priority: 90, // 高 priority 先于 cache：限流先生效，cache 不消耗 quota
    });
    ctx.hooks.register(CORE_HOOKS.TOOL_BEFORE, this.onToolBefore, {
      priority: 90,
    });
  }

  async healthCheck(): Promise<PluginHealth> {
    return { status: "healthy" };
  }

  // ── hook handlers ──

  private onLlmRequest: HookHandler<LlmRequestPayload> = async (ctx) => {
    const meta = ctx.payload.meta;
    return this.checkAndAdvance(ctx, "llm", {
      tenantId: meta.tenantId,
      agentType: meta.agentType,
    });
  };

  private onToolBefore: HookHandler<ToolBeforePayload> = async (ctx) => {
    const meta = ctx.payload.meta;
    return this.checkAndAdvance(ctx, "tool", {
      tenantId: meta.tenantId,
      agentType: meta.agentType,
    });
  };

  /** 检查 3 个维度（global / per-tenant / per-agent-type），任一超限 → abort */
  private async checkAndAdvance(
    ctx: {
      abort: (reason: string, payload?: unknown) => never;
      next: () => Promise<unknown>;
    },
    domain: "llm" | "tool",
    keys: { tenantId?: string; agentType?: string },
  ): Promise<unknown> {
    // ① global
    const globalRefillPerSec = this.globalRpm / 60;
    const ok1 = await this.store
      .tryConsume(`global:${domain}`, this.globalRpm, globalRefillPerSec)
      .catch(() => true); // fail-open
    if (!ok1) {
      this.logger?.warn(`[rate-limit] global quota exceeded for ${domain}`);
      return ctx.abort("rate-limited", {
        scope: "global",
        domain,
        retryAfterMs: 1000,
      });
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
        return ctx.abort("rate-limited", {
          scope: "tenant",
          tenantId: keys.tenantId,
          domain,
          retryAfterMs: 1000,
        });
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
          return ctx.abort("rate-limited", {
            scope: "agentType",
            agentType: keys.agentType,
            domain,
            retryAfterMs: 1000,
          });
        }
      }
    }

    return ctx.next();
  }

  private resolveAgentTypeRpm(agentType: string): number | undefined {
    if (this.perAgentTypeRpm[agentType] !== undefined) {
      return this.perAgentTypeRpm[agentType];
    }
    return this.defaultAgentTypeRpm;
  }
}
