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

export class BillingRuntimeEnvAdapter implements IRuntimeEnvironment {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string | undefined,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
  ) {}

  async getByokStatus(): Promise<ByokStatus> {
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    if (snap.userKeys.hasByok) return "personal";
    if (snap.userKeys.sharedKeyAvailable) return "donated";
    return "platform";
  }

  async getCreditState(): Promise<ICreditState> {
    const acct = await this.credits.getBalance(this.userId);
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
        if (!found.healthy) {
          const fallback = pool.find(
            (m) =>
              m.healthy &&
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
        all.push({ modelId: m.modelId, available: m.healthy });
      }
    }
    return all;
  }

  async getQuotaSnapshot(): Promise<IQuotaSnapshot> {
    const acct = await this.credits.getBalance(this.userId);
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
      const acct = await this.credits.getBalance(this.userId);
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
