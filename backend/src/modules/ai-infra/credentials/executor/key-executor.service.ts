import { Injectable, Logger } from "@nestjs/common";
import { ClassifiedError, KeyErrorClassifier, KeyHealthStore } from "../health";
import {
  KeyResolverService,
  ResolvedKey,
} from "../key-resolver/key-resolver.service";
import { NoAvailableKeyError } from "../key-resolver/key-resolver.errors";
import {
  AllKeysFailedError,
  ProviderCooldownError,
} from "./key-executor.errors";
import { createConcurrencyLimiter } from "@/common/utils/concurrency.utils";

/**
 * ★ 2026-05-22 per-provider 并发上限（治 429 源头）：单 key/单 provider 部署下，
 *   一个 mission 的并行任务（concurrency × 维度 × 章节）会同时打同一个 key → 自己把
 *   自己打到 429 → cooldown 级联。这里给"每个 provider 同时在飞的调用数"封顶，把
 *   超出的请求排队而非并发轰炸。默认 6，env 可调；设得足够高不影响正常吞吐。
 */
const PROVIDER_MAX_CONCURRENCY = (() => {
  const n = Number.parseInt(
    process.env.LLM_PROVIDER_MAX_CONCURRENCY ?? "",
    10,
  );
  return Number.isFinite(n) && n > 0 ? n : 6;
})();

/**
 * ★ 2026-05-22 单 key/单 provider 时 provider-cooldown 上限（ms）。无 failover 对象时，
 *   长 cooldown 只是徒增停机；缩短让上层 react-loop 的退避重试更快接上。
 */
const SINGLE_KEY_COOLDOWN_CAP_MS = 30_000;

/**
 * KeyExecutor — 统一 key 调用入口（chat / embedding / rerank / tool 全部调用方接入）。
 *
 * 用法：
 *   const result = await keyExecutor.execute(userId, "openai", async (key) => {
 *     const client = openai({ apiKey: key.apiKey, baseURL: key.apiEndpoint });
 *     return await client.chat.completions.create(req);
 *   });
 *
 * 行为：
 * 1. 检查 provider 级 cooldown，若 open 则直接抛 ProviderCooldownError
 * 2. resolveKeyChain：拿到当前 user/provider 下所有可用 key（health 过滤后 + LastGood 顶置）
 * 3. 遍历 chain：成功立即 return；失败 classify 决定 NEXT_KEY / RETHROW + 状态机更新
 * 4. 全失败 → AllKeysFailedError（带 lastError 上下文）
 *
 * 与 KeyResolver.resolveKey 的关系：
 * - resolveKey（旧）：返单 key，不带 failover；保留向后兼容（PR-4 前的 caller 仍可用）
 * - keyExecutor.execute（新）：自动 failover，PR-4+ 全 caller 切到这里
 */
@Injectable()
export class KeyExecutorService {
  private readonly logger = new Logger(KeyExecutorService.name);

  constructor(
    private readonly resolver: KeyResolverService,
    private readonly classifier: KeyErrorClassifier,
    private readonly healthStore: KeyHealthStore,
  ) {}

  /** 每个 provider 一个并发限制器（pod 内单例），抑制单 key 自我 429。 */
  private readonly providerLimiters = new Map<
    string,
    ReturnType<typeof createConcurrencyLimiter>
  >();

  private getProviderLimiter(
    provider: string,
  ): ReturnType<typeof createConcurrencyLimiter> {
    let limiter = this.providerLimiters.get(provider);
    if (!limiter) {
      limiter = createConcurrencyLimiter(PROVIDER_MAX_CONCURRENCY);
      this.providerLimiters.set(provider, limiter);
    }
    return limiter;
  }

  async execute<T>(
    userId: string,
    provider: string,
    callFn: (key: ResolvedKey) => Promise<T>,
  ): Promise<T> {
    const normalizedProvider = provider.toLowerCase();

    // 1. provider-级 cooldown 短路（在并发闸之外，快速失败不占用配额槽）
    if (await this.healthStore.isProviderCooldown(normalizedProvider)) {
      this.logger.debug(
        `[KeyExecutor] provider cooldown active for ${normalizedProvider}, short-circuit`,
      );
      throw new ProviderCooldownError(normalizedProvider);
    }

    // ★ per-provider 并发闸：把同一 provider 同时在飞的调用数封顶，治 429 源头。
    const limit = this.getProviderLimiter(normalizedProvider);
    return limit(() => this.executeChain(userId, normalizedProvider, callFn));
  }

  /** chain 解析 + 遍历 failover（被 per-provider 并发闸包裹）。 */
  private async executeChain<T>(
    userId: string,
    normalizedProvider: string,
    callFn: (key: ResolvedKey) => Promise<T>,
  ): Promise<T> {
    // 2. 解析 chain
    const chain = await this.resolver.resolveKeyChain(
      userId,
      normalizedProvider,
    );
    if (chain.size === 0) {
      throw new NoAvailableKeyError(normalizedProvider);
    }

    // 3. 遍历
    let lastError: ClassifiedError | null = null;
    let lastRawError: unknown = null;

    while (true) {
      const key = await chain.next();
      if (!key) break;

      try {
        const result = await callFn(key);
        await chain.reportSuccess(key);
        if (chain.triedCount > 1) {
          this.logger.log(
            `[KeyExecutor] failover succeeded for ${normalizedProvider} on attempt ${chain.triedCount}/${chain.size}`,
          );
        }
        return result;
      } catch (err) {
        lastRawError = err;
        const classified = this.classifier.classify(err);
        await chain.reportFailure(key, classified);
        lastError = classified;

        this.logger.warn(
          `[KeyExecutor] key ${this.maskKeyId(key.healthKeyId)} failed (${classified.reason}): ${classified.originalMessage}`,
        );

        if (classified.action === "RETHROW" || classified.shouldStopChain) {
          // provider-级故障 / 未知错误 → 终止链路 + 设 provider cooldown
          if (
            classified.shouldStopChain &&
            Number.isFinite(classified.cooldownMs) &&
            classified.cooldownMs > 0
          ) {
            // ★ 2026-05-22：单 key（chain.size<=1）无 failover 对象，长 cooldown 只是
            //   徒增停机 → 缩短到上限，让上层 react-loop 退避重试更快接上。
            const cooldownMs =
              chain.size <= 1
                ? Math.min(classified.cooldownMs, SINGLE_KEY_COOLDOWN_CAP_MS)
                : classified.cooldownMs;
            await this.healthStore.setProviderCooldown(
              normalizedProvider,
              cooldownMs,
            );
          }
          break;
        }
        // NEXT_KEY → 继续循环
      }
    }

    // 4. 全部失败
    if (chain.triedCount === 0) {
      throw new NoAvailableKeyError(normalizedProvider);
    }
    // RETHROW 类（5xx / unknown）：直接抛原始 error 以便上层 handler 看到完整 status / stack
    if (lastError?.action === "RETHROW" && lastRawError !== null) {
      throw lastRawError as Error;
    }
    throw new AllKeysFailedError(
      normalizedProvider,
      chain.triedCount,
      lastError,
    );
  }

  /**
   * PR-4b (2026-05-05) 流式调用辅助：当 caller 不能用 execute() 包裹（比如 generator
   * 流式响应），手动在流完成 / 流出错时调此方法上报健康状态。
   * 与 execute() 路径互补：execute = 自动 failover；track = 仅记账（无 failover）。
   *
   * 2026-05-10：补 DB 持久化（user_api_keys.usage_count++ / lastUsedAt /
   * testStatus）—— 之前 trackSuccess 只更新 in-memory KeyHealthStore，
   * DB 永远 0 → AI Ask 流式调用 + 任何流式 caller 都没命中统计。
   * 现行行为与 KeyExecutor.execute() 路径（KeyChain.reportSuccess）完全对齐。
   */
  async trackSuccess(
    healthKeyId: string,
    provider: string,
    userId: string,
  ): Promise<void> {
    await this.healthStore.markSuccess(healthKeyId, provider, userId);
    await this.resolver.persistOutcome(healthKeyId, { ok: true });
  }

  async trackFailure(
    healthKeyId: string,
    provider: string,
    error: unknown,
  ): Promise<void> {
    const classified = this.classifier.classify(error);
    await this.healthStore.markFailure(healthKeyId, classified, provider);
    await this.resolver.persistOutcome(healthKeyId, {
      ok: false,
      classified,
    });
    if (
      classified.shouldStopChain &&
      Number.isFinite(classified.cooldownMs) &&
      classified.cooldownMs > 0
    ) {
      await this.healthStore.setProviderCooldown(
        provider,
        classified.cooldownMs,
      );
    }
  }

  /** 脱敏 keyId（用于 log）：personal:user-uuid:openai:default → personal:***:openai:default */
  private maskKeyId(keyId: string): string {
    return keyId.replace(/^(personal):([^:]+):/, "$1:***:");
  }
}
