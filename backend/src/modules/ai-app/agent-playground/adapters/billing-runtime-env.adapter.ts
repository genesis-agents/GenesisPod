/**
 * BillingRuntimeEnvAdapter — 把 ai-infra/credits + RuntimeEnvironmentService
 * 适配为 Harness 的 IRuntimeEnvironment 接口。
 *
 * 业务方参考实现：fork 改成自己的 BillingContext 适配器即可。
 *
 * 真实路径：
 *   - CreditsService.getBalance（真扣 / 真查）
 *   - RuntimeEnvironmentService.snapshot 拿 BYOK 候选 model 池
 *   - suggestFallback 按余额状态返回真实降级建议
 */

import type {
  ByokStatus,
  ICreditState,
  IFallbackHint,
  IModelAvailability,
  IQuotaSnapshot,
  IRuntimeEnvironment,
} from "../../../ai-engine/facade";
import type { CreditsService } from "../../../ai-infra/credits/credits.service";
import type { RuntimeEnvironmentService } from "../../../ai-engine/runtime/resource/runtime-environment.service";

const LOW_BALANCE_THRESHOLD = 500;
const CRITICAL_BALANCE_THRESHOLD = 100;
/** balance 缓存 TTL —— 30s 内 getCreditState/getQuotaSnapshot/suggestFallback 共享一次 DB 查询 */
const BALANCE_CACHE_TTL_MS = 30_000;

type BalanceAcct = Awaited<ReturnType<CreditsService["getBalance"]>>;

export class BillingRuntimeEnvAdapter implements IRuntimeEnvironment {
  /** mission 内 balance 缓存：8+ 次 runner.run 只查 1 次 DB */
  private balanceCache: { acct: BalanceAcct; expiresAt: number } | null = null;

  constructor(
    public readonly userId: string,
    public readonly workspaceId: string | undefined,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
  ) {}

  /** 带 TTL 的 balance 查询 — DB 调用聚合到一次 */
  private async getCachedBalance(): Promise<BalanceAcct> {
    const now = Date.now();
    if (this.balanceCache && this.balanceCache.expiresAt > now) {
      return this.balanceCache.acct;
    }
    const acct = await this.credits.getBalance(this.userId);
    this.balanceCache = {
      acct,
      expiresAt: now + BALANCE_CACHE_TTL_MS,
    };
    return acct;
  }

  /** 显式失效（如刚扣了费想立刻查最新） */
  invalidateBalanceCache(): void {
    this.balanceCache = null;
  }

  async getByokStatus(): Promise<ByokStatus> {
    // RuntimeEnvironmentService.snapshot 已自带 30s cache
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    if (snap.userKeys.hasByok) return "personal";
    if (snap.userKeys.sharedKeyAvailable) return "donated";
    return "platform";
  }

  async getCreditState(): Promise<ICreditState> {
    const acct = await this.getCachedBalance();
    return {
      balance: acct.balance,
      softLimit: LOW_BALANCE_THRESHOLD,
      hardLimit: CRITICAL_BALANCE_THRESHOLD,
      currency: "credit",
    };
  }

  async getModelAvailability(modelId: string): Promise<IModelAvailability> {
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    for (const pool of Object.values(snap.models)) {
      const found = pool.find((m) => m.modelId === modelId);
      if (found) {
        // ★ 三态语义：unhealthy 才报 outage；unknown 不阻断（避免新接 BYOK
        //   模型从未调用过被错杀），让 LLM 真去打一次，失败由 ToolCircuitBreaker
        //   / metrics 表反过来更新 healthy。
        if (found.healthy === "unhealthy") {
          const fallback = pool.find(
            (m) =>
              m.healthy !== "unhealthy" &&
              m.costTier === found.costTier &&
              m.modelId !== modelId,
          );
          return {
            modelId,
            available: false,
            unavailableReason: "outage",
            fallbackTo: fallback ? [fallback.modelId] : undefined,
          };
        }
        return { modelId, available: true };
      }
    }
    return {
      modelId,
      available: false,
      unavailableReason: "not_subscribed",
    };
  }

  async listAvailableModels(): Promise<readonly IModelAvailability[]> {
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    const all: IModelAvailability[] = [];
    for (const pool of Object.values(snap.models)) {
      for (const m of pool) {
        // available = healthy !== "unhealthy"（unknown 也算可用）
        all.push({ modelId: m.modelId, available: m.healthy !== "unhealthy" });
      }
    }
    return all;
  }

  async getQuotaSnapshot(): Promise<IQuotaSnapshot> {
    const acct = await this.getCachedBalance();
    // CreditsService.getBalance 只暴露 balance / todaySpent
    return {
      balance: { used: 0, limit: acct.balance },
      daily_credit: {
        used: acct.todaySpent,
        limit: acct.balance + acct.todaySpent,
        resetAt: this.tomorrowMidnight(),
      },
    };
  }

  async suggestFallback(input: {
    failedModelId?: string;
    reason: string;
  }): Promise<IFallbackHint> {
    if (input.reason === "no_credit") {
      const acct = await this.getCachedBalance();
      if (acct.balance <= CRITICAL_BALANCE_THRESHOLD) {
        return {
          action: "notify_user",
          reason: "余额已耗尽，请充值后重试",
          userMessage: `当前积分 ${acct.balance}，不足以完成本次任务。请前往 /credits 充值。`,
        };
      }
      return {
        action: "downgrade",
        reason: `本次预算超限；建议降级到便宜模型`,
      };
    }
    if (input.reason === "rate_limit") {
      return { action: "retry", reason: "rate-limit", retryAfterMs: 2000 };
    }
    if (input.reason === "outage" && input.failedModelId) {
      const avail = await this.getModelAvailability(input.failedModelId);
      if (avail.fallbackTo?.[0]) {
        return {
          action: "downgrade",
          reason: `${input.failedModelId} 不可用，切到 ${avail.fallbackTo[0]}`,
          fallbackModelId: avail.fallbackTo[0],
        };
      }
    }
    return { action: "abort", reason: `no fallback for ${input.reason}` };
  }

  private tomorrowMidnight(): number {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
}
