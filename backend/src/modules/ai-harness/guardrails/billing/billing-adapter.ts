/**
 * BillingRuntimeEnvAdapter â€” æŠŠ ai-infra/credits + RuntimeEnvironmentService
 * é€‚é…ä¸º Harness çš„ IRuntimeEnvironment æŽ¥å£ã€‚
 *
 * ä¸šåŠ¡æ–¹å‚è€ƒå®žçŽ°ï¼šfork æ”¹æˆè‡ªå·±çš„ BillingContext é€‚é…å™¨å³å¯ã€‚
 *
 * çœŸå®žè·¯å¾„ï¼š
 *   - CreditsService.getBalanceï¼ˆçœŸæ‰£ / çœŸæŸ¥ï¼‰
 *   - RuntimeEnvironmentService.snapshot æ‹¿ BYOK å€™é€‰ model æ±
 *   - suggestFallback æŒ‰ä½™é¢çŠ¶æ€è¿”å›žçœŸå®žé™çº§å»ºè®®
 */

import type {
  ByokStatus,
  ICreditState,
  IFallbackHint,
  IModelAvailability,
  IQuotaSnapshot,
  IRuntimeEnvironment,
} from "../../agents/abstractions";
import type { CreditsService } from "../../../ai-infra/credits/credits.service";
import type { RuntimeEnvironmentService } from "../../../ai-harness/guardrails/runtime/runtime-environment.service";

const LOW_BALANCE_THRESHOLD = 500;
const CRITICAL_BALANCE_THRESHOLD = 100;
/** balance ç¼“å­˜ TTL â€”â€” 30s å†… getCreditState/getQuotaSnapshot/suggestFallback å…±äº«ä¸€æ¬¡ DB æŸ¥è¯¢ */
const BALANCE_CACHE_TTL_MS = 30_000;

type BalanceAcct = Awaited<ReturnType<CreditsService["getBalance"]>>;

export class BillingRuntimeEnvAdapter implements IRuntimeEnvironment {
  /** mission å†… balance ç¼“å­˜ï¼š8+ æ¬¡ runner.run åªæŸ¥ 1 æ¬¡ DB */
  private balanceCache: { acct: BalanceAcct; expiresAt: number } | null = null;

  /**
   * â˜… è·¨ mission å¤±è´¥æ¨¡å¼æŽ¥å…¥ç‚¹ï¼šmission å¯åŠ¨å‰ç”± FailureLearnerService.lookup
   * å–‚å…¥"å·²çŸ¥ä¼šæ’žå¢™çš„ (modelId â†’ å¤‡é€‰ modelId)"æ˜ å°„ã€‚
   * getModelAvailability å‘½ä¸­ disabled set æ—¶è¿”å›ž available=false + fallbackToï¼Œ
   * çŽ°æœ‰ react-loop çš„ tier-model fallback é“¾è·¯è‡ªåŠ¨æŽ¥ä½ã€‚
   */
  private readonly disabledModels = new Map<string, string>();

  constructor(
    public readonly userId: string,
    public readonly workspaceId: string | undefined,
    private readonly credits: CreditsService,
    private readonly runtimeEnv: RuntimeEnvironmentService,
  ) {}

  /**
   * æ ‡è®°æŸ modelId åœ¨æœ¬ mission å†…ç¦ç”¨ï¼ˆpattern å·²çŸ¥ä¼šå¤±è´¥ï¼‰ï¼Œå¹¶æä¾› fallbackã€‚
   * ç”± orchestrator è°ƒç”¨ï¼šlookup å¤±è´¥æ¨¡å¼ â†’ å‘½ä¸­ä¸”æœ‰ lastFallbackModel â†’ æ ‡è®°ã€‚
   */
  markModelDisabled(failedModelId: string, fallbackModelId: string): void {
    this.disabledModels.set(failedModelId, fallbackModelId);
  }

  /** å½“ mission å†…æŸæ¬¡è°ƒç”¨èµ°äº† fallback å¹¶è·‘é€šåŽï¼Œå¤–éƒ¨è°ƒç”¨æ–¹ query ç”¨ */
  getDisabledModels(): ReadonlyMap<string, string> {
    return this.disabledModels;
  }

  /** å¸¦ TTL çš„ balance æŸ¥è¯¢ â€” DB è°ƒç”¨èšåˆåˆ°ä¸€æ¬¡ */
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

  /** æ˜¾å¼å¤±æ•ˆï¼ˆå¦‚åˆšæ‰£äº†è´¹æƒ³ç«‹åˆ»æŸ¥æœ€æ–°ï¼‰ */
  invalidateBalanceCache(): void {
    this.balanceCache = null;
  }

  async getByokStatus(): Promise<ByokStatus> {
    // RuntimeEnvironmentService.snapshot å·²è‡ªå¸¦ 30s cache
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

  /**
   * â˜… Phase P1-16: ToolACL çœŸå®žæŽ¥å…¥ï¼ˆmission-pipeline-tool-acl.mdï¼‰
   *
   * å½“å‰å®žçŽ°ï¼šä»Ž RuntimeEnvironmentService.snapshot è¯» userKeys æŽ¨ entitlementsã€‚
   *   - ä»»ä½•ç”¨æˆ·éƒ½è§†ä¸ºæœ‰ 'public' entitlement
   *   - æœ‰ BYOK çš„ç”¨æˆ·é¢å¤–å¾— 'image.generation'ï¼ˆç”¨æˆ·è‡ªè´¹ï¼Œå¯å¯å›¾åƒç”Ÿæˆï¼‰
   *   - å¹³å° admin entitlement æš‚ä¸å®žçŽ°ï¼ˆéœ€ user_subscription è¡¨ï¼ŒP2ï¼‰
   */
  async getUserEntitlements(): Promise<{
    keys: string[];
    expiresAt?: Record<string, Date>;
  }> {
    try {
      const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
      const keys = ["public"];
      if (snap.userKeys.hasByok) {
        keys.push("image.generation"); // è‡ªè´¹ BYOK ç”¨æˆ·å¯è°ƒå›¾åƒç”Ÿæˆ
      }
      return { keys };
    } catch {
      // fail-closed
      return { keys: ["public"] };
    }
  }

  async getModelAvailability(modelId: string): Promise<IModelAvailability> {
    // â˜… ä¼˜å…ˆçº§ #1ï¼šæœ¬ mission å†…å·²æ ‡è®°ç¦ç”¨ï¼ˆæ¥è‡ª FailureLearnerService çš„
    // åŽ†å²å¤±è´¥æ¨¡å¼ï¼‰â€”â€” ç›´æŽ¥è¿”å›ž fallback å€™é€‰ï¼Œç»•å¼€æµªè´¹ token é‡è¹ˆè¦†è¾™ã€‚
    const disabledFallback = this.disabledModels.get(modelId);
    if (disabledFallback) {
      return {
        modelId,
        available: false,
        unavailableReason: "outage",
        fallbackTo: [disabledFallback],
      };
    }
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    for (const pool of Object.values(snap.models)) {
      const found = pool.find((m) => m.modelId === modelId);
      if (found) {
        // â˜… ä¸‰æ€è¯­ä¹‰ï¼šunhealthy æ‰æŠ¥ outageï¼›unknown ä¸é˜»æ–­ï¼ˆé¿å…æ–°æŽ¥ BYOK
        //   æ¨¡åž‹ä»Žæœªè°ƒç”¨è¿‡è¢«é”™æ€ï¼‰ï¼Œè®© LLM çœŸåŽ»æ‰“ä¸€æ¬¡ï¼Œå¤±è´¥ç”± ToolCircuitBreaker
        //   / metrics è¡¨åè¿‡æ¥æ›´æ–° healthyã€‚
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
        // available = healthy !== "unhealthy"ï¼ˆunknown ä¹Ÿç®—å¯ç”¨ï¼‰
        all.push({ modelId: m.modelId, available: m.healthy !== "unhealthy" });
      }
    }
    return all;
  }

  /**
   * Phase P3-7: stage é¢„æ£€ï¼ˆmission-pipeline-baseline.md Â§9.3 Q10ï¼‰
   *
   * ä¼°ç®—ç»™å®š budget æ˜¯å¦å¯è´Ÿæ‹…ã€‚è¿”å›ž:
   *   - affordable: å½“å‰ä½™é¢æ˜¯å¦å¤Ÿ
   *   - shortfall: ä¸å¤Ÿæ—¶å·®å¤šå°‘
   *   - suggestion: 'proceed'|'downgrade'|'abort' å†³ç­–å»ºè®®
   */
  async estimateAffordable(budget: { maxTokens?: number }): Promise<{
    affordable: boolean;
    shortfall: number;
    suggestion: "proceed" | "downgrade" | "abort";
    estimatedCredits: number;
    currentBalance: number;
  }> {
    const acct = await this.getCachedBalance();
    // ç²—ä¼°ï¼š1000 tokens â‰ˆ 1 creditï¼ˆä¾æ¨¡åž‹å±‚ä¸åŒä¼šæœ‰å·®å¼‚ï¼‰
    const estimatedCredits = Math.ceil((budget.maxTokens ?? 0) / 1000);
    if (acct.balance >= estimatedCredits) {
      return {
        affordable: true,
        shortfall: 0,
        suggestion: "proceed",
        estimatedCredits,
        currentBalance: acct.balance,
      };
    }
    const shortfall = estimatedCredits - acct.balance;
    if (acct.balance >= estimatedCredits / 2) {
      return {
        affordable: false,
        shortfall,
        suggestion: "downgrade",
        estimatedCredits,
        currentBalance: acct.balance,
      };
    }
    return {
      affordable: false,
      shortfall,
      suggestion: "abort",
      estimatedCredits,
      currentBalance: acct.balance,
    };
  }

  async getQuotaSnapshot(): Promise<IQuotaSnapshot> {
    const acct = await this.getCachedBalance();
    // CreditsService.getBalance åªæš´éœ² balance / todaySpent
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
    // â”€â”€ åŸºç¡€è®¾æ–½çº§ï¼ˆè€ï¼‰â”€â”€
    if (input.reason === "no_credit") {
      const acct = await this.getCachedBalance();
      if (acct.balance <= CRITICAL_BALANCE_THRESHOLD) {
        return {
          action: "notify_user",
          reason: "ä½™é¢å·²è€—å°½ï¼Œè¯·å……å€¼åŽé‡è¯•",
          userMessage: `å½“å‰ç§¯åˆ† ${acct.balance}ï¼Œä¸è¶³ä»¥å®Œæˆæœ¬æ¬¡ä»»åŠ¡ã€‚è¯·å‰å¾€ /credits å……å€¼ã€‚`,
        };
      }
      return {
        action: "downgrade",
        reason: `æœ¬æ¬¡é¢„ç®—è¶…é™ï¼›å»ºè®®é™çº§åˆ°ä¾¿å®œæ¨¡åž‹`,
      };
    }
    if (input.reason === "rate_limit") {
      return { action: "retry", reason: "rate-limit", retryAfterMs: 2000 };
    }
    if (input.reason === "outage" && input.failedModelId) {
      const fb = await this.findSiblingModel(input.failedModelId);
      if (fb) {
        return {
          action: "downgrade",
          reason: `${input.failedModelId} ä¸å¯ç”¨ï¼Œåˆ‡åˆ° ${fb}`,
          fallbackModelId: fb,
        };
      }
    }
    if (input.reason === "context_too_long" || input.reason === "no_quota") {
      return { action: "abort", reason: input.reason };
    }

    // â”€â”€ LLM åè®®çº§ï¼ˆæ–°å¢žï¼‰â”€â”€
    // safety_refusal / reasoning_exhaustion / empty_responseï¼š
    // åˆ‡åˆ°ä¸€ä¸ªéž reasoning modelï¼ˆç»•å¼€ reasoning CoT æ’žå¢™ + safety filter
    // åœ¨ reasoning æ¨¡åž‹ä¸Šæ›´æ¿€è¿›çš„åŒé‡é—®é¢˜ï¼‰ã€‚æ‰¾ä¸åˆ°éž reasoning çš„å°± abortã€‚
    if (
      input.reason === "safety_refusal" ||
      input.reason === "reasoning_exhaustion" ||
      input.reason === "empty_response"
    ) {
      const nonReasoning = await this.findNonReasoningModel(
        input.failedModelId,
      );
      if (nonReasoning) {
        return {
          action: "downgrade",
          reason: `${input.reason} on ${input.failedModelId ?? "?"}ï¼Œåˆ‡åˆ°éž reasoning æ¨¡åž‹ ${nonReasoning}`,
          fallbackModelId: nonReasoning,
        };
      }
      return {
        action: "abort",
        reason: `${input.reason}ï¼šæ— éž reasoning å€™é€‰æ¨¡åž‹å¯åˆ‡æ¢`,
      };
    }
    // truncatedï¼šè°ƒç”¨æ–¹åº”è°ƒé«˜ maxTokens é‡è¯• 1 æ¬¡ï¼›è¿™é‡Œåªç»™ retry ä¿¡å·
    if (input.reason === "truncated") {
      return {
        action: "retry",
        reason: "å¢žå¤§ maxTokens é‡è¯•",
        retryAfterMs: 0,
      };
    }
    // parse_failureï¼šè®© Reflexion è‡ªå·± critique-reviseï¼Œretry ä¿¡å·
    if (input.reason === "parse_failure") {
      return {
        action: "retry",
        reason: "parse å¤±è´¥ç”± Reflexion é‡è¯•",
        retryAfterMs: 0,
      };
    }
    // model_not_foundï¼šèµ°å€™é€‰æ±
    if (input.reason === "model_not_found" && input.failedModelId) {
      const fb = await this.findSiblingModel(input.failedModelId);
      if (fb) {
        return {
          action: "downgrade",
          reason: `${input.failedModelId} ä¸å­˜åœ¨ï¼Œåˆ‡åˆ° ${fb}`,
          fallbackModelId: fb,
        };
      }
      return { action: "abort", reason: "model_not_found æ— å€™é€‰" };
    }

    // â”€â”€ æ‰§è¡Œçº§ï¼ˆæ–°å¢žï¼‰â”€â”€
    if (input.reason === "tool_failure") {
      return {
        action: "retry",
        reason: "tool å¤±è´¥ï¼Œè°ƒç”¨æ–¹å†³å®šæ¢å·¥å…·æˆ–ç»•å¼€",
        retryAfterMs: 0,
      };
    }
    if (
      input.reason === "verifier_low_score" ||
      input.reason === "schema_mismatch"
    ) {
      return {
        action: "retry",
        reason: "ç”± Reflexion critique-revise å¤„ç†",
        retryAfterMs: 0,
      };
    }

    return { action: "abort", reason: `no fallback for ${input.reason}` };
  }

  /**
   * åœ¨åŒ costTier çš„ BYOK å€™é€‰æ± é‡Œæ‰¾ä¸€ä¸ª healthy ä¸”éž input modelId çš„å¤‡é€‰ã€‚
   */
  private async findSiblingModel(
    failedModelId: string,
  ): Promise<string | undefined> {
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    for (const pool of Object.values(snap.models)) {
      const found = pool.find((m) => m.modelId === failedModelId);
      if (!found) continue;
      const sibling = pool.find(
        (m) =>
          m.modelId !== failedModelId &&
          m.healthy !== "unhealthy" &&
          m.costTier === found.costTier,
      );
      if (sibling) return sibling.modelId;
      // æ²¡åŒ tier å¤‡é€‰ â†’ åŒæ± ä»»ä¸€å¥åº·æ¨¡åž‹
      const anyHealthy = pool.find(
        (m) => m.modelId !== failedModelId && m.healthy !== "unhealthy",
      );
      if (anyHealthy) return anyHealthy.modelId;
    }
    return undefined;
  }

  /**
   * åœ¨æ‰€æœ‰ BYOK æ± é‡Œæ‰¾ä¸€ä¸ªéž reasoning çš„ healthy æ¨¡åž‹ã€‚
   * ç”¨äºŽ reasoning model æ’ž safety filter / CoT exhaustion æ—¶ç»•å¼€ã€‚
   *
   * æ³¨ï¼šsnapshot é‡Œçš„ model æè¿°æœªå¿…æœ‰ isReasoning å­—æ®µï¼Œè¿™é‡ŒæŒ‰å‘½åçº¦å®š
   * å…œåº•ï¼ˆo1/o3/o4/deepseek-reasoner/gpt-5 ç³»åˆ—è®¤ä¸ºæ˜¯ reasoningï¼‰ã€‚
   */
  private async findNonReasoningModel(
    excludeModelId?: string,
  ): Promise<string | undefined> {
    const snap = await this.runtimeEnv.snapshot({ userId: this.userId });
    const reasoningPattern =
      /^(o[1-9]|o\d+|deepseek-reasoner|gpt-5|grok-.*reason)/i;
    for (const pool of Object.values(snap.models)) {
      const candidate = pool.find(
        (m) =>
          m.modelId !== excludeModelId &&
          m.healthy !== "unhealthy" &&
          !reasoningPattern.test(m.modelId),
      );
      if (candidate) return candidate.modelId;
    }
    return undefined;
  }

  private tomorrowMidnight(): number {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
}
