/**
 * ModelElectionService · 环境感知选举
 *
 * 输入：RuntimeEnvironmentService 产出的候选池 + 本次调用需求
 * 输出：唯一 modelId 以及打分明细（可观测）
 *
 * 打分维度（v1，可演进）：
 *   [硬过滤]   isEnabled · modelType 匹配 · healthy · BYOK · 黑名单
 *   [Tier]     根据 TaskProfile 目标 tier（STRONG / STANDARD / BASIC）加权
 *   [Role]     leader → reasoning; writer/reviewer → STRONG; extractor → BASIC
 *   [Cost]     costBias cheap/balanced/quality
 *   [Health]   recentErrorRate 越低越好；> 0.5 直接 reject
 *   [Tie-break] priority DESC → isDefault → stable
 *
 * 与 AiChatService.chat 的关系：
 *   chat() 的 else 分支（没 model / 没 modelType）之前直接读 DEFAULT_AI_MODEL env 抛错。
 *   现在 harness/LlmExecutor 会先 elect(...) 拿到 modelId，再用 model= 显式调 chat，
 *   不会触发 else 分支。保留 chat 的旧兜底作为"纯 adapter 遗留调用"的最后一道防线。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { KeyResolverService } from "@/modules/ai-infra/credentials/key-resolver/key-resolver.service";
import { AiModelConfigService } from "../services/ai-model-config.service";
import type { AIModelConfig } from "../services/ai-chat.service";
import { classifyModelTier, ModelTier } from "../types/model-tier.types";
import type { TaskProfile } from "../types";
import {
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRequest,
  type ElectionResult,
  type ElectionRoleHint,
  type ElectionScore,
} from "./model-election.types";

interface ScoredCandidate {
  readonly config: AIModelConfig;
  readonly score: ElectionScore;
}

@Injectable()
export class ModelElectionService {
  private readonly logger = new Logger(ModelElectionService.name);

  constructor(
    private readonly modelConfigService: AiModelConfigService,
    @Optional() private readonly keyResolver?: KeyResolverService,
  ) {}

  /**
   * 执行一次选举。
   * 注意：本方法对调用方完全纯粹——不触发 DB 写入，不缓存结果（每次重算）。
   */
  async elect(request: ElectionRequest): Promise<ElectionResult> {
    const {
      modelType,
      candidates,
      taskProfile,
      role = "default",
      userId,
      costBias = "balanced",
      excludeModelIds = [],
    } = request;

    // ============ Step 1 · 候选池归一化 ============
    // 候选池可能来自 RuntimeEnvironmentService（推荐路径），也可能为空
    // （纯单元测试 / runtime 未注入）。空时退化到 DB 全表查询，保证不会因
    // 环境感知模块缺失而无法选举。
    const pool =
      candidates.length > 0
        ? candidates
        : await this.loadCandidatesFromDb(modelType);

    // ============ Step 2 · 硬过滤 ============
    const excluded = new Set(excludeModelIds);
    const typeMatched = pool.filter((c) =>
      this.isTypeCompatible(c.modelType, modelType),
    );
    // ★ healthy 三态语义：unhealthy 一定排除；unknown/undefined 容忍（避免新接 BYOK 模型
    //   全被淘汰）。仍用 recentErrorRate < 0.5 作为最后一道兜底。
    const healthy = typeMatched.filter(
      (c) => c.healthy !== "unhealthy" && (c.recentErrorRate ?? 0) < 0.5,
    );
    const notBlacklisted = healthy.filter((c) => !excluded.has(c.modelId));

    if (notBlacklisted.length === 0) {
      throw new NoEligibleModelError(
        modelType,
        `pool=${pool.length} typeMatched=${typeMatched.length} ` +
          `healthy=${healthy.length} afterBlacklist=${notBlacklisted.length}`,
      );
    }

    // ============ Step 3 · BYOK 过滤 ============
    let byokFiltered = notBlacklisted;
    if (userId && this.keyResolver) {
      try {
        const providers = await this.keyResolver.getAvailableProviders(userId);
        const providerSet = new Set(providers.map((p) => p.toLowerCase()));
        // providers 空 == 用户没配任何 key；这种情况交给 chat() 的 BYOK 预检抛
        // NoAvailableKeyError，election 这里不强制过滤（否则报错信息不对）。
        if (providerSet.size > 0) {
          byokFiltered = notBlacklisted.filter((c) =>
            providerSet.has(c.provider.toLowerCase()),
          );
          if (byokFiltered.length === 0) {
            // BYOK 过滤空了 —— 用户没任何命中 provider 的模型。退回到全量，
            // 让下游 AiChatService 抛 BYOK 错误（有清晰错误码），比 election
            // 自己抛"没候选"更利于排查。
            this.logger.warn(
              `[elect] userId=${userId} has providers=[${[...providerSet]}] ` +
                `but no candidate matches; falling back to unfiltered pool`,
            );
            byokFiltered = notBlacklisted;
          }
        }
      } catch (err) {
        this.logger.warn(
          `[elect] BYOK provider lookup failed for userId=${userId}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ============ Step 4 · 为每个候选查 DB config 并打分 ============
    const scored: ScoredCandidate[] = [];
    const targetTier = this.resolveTargetTier(taskProfile, role);

    for (const cand of byokFiltered) {
      const cfg = await this.modelConfigService.getModelConfig(cand.modelId);
      if (!cfg) {
        // 候选池里有但 DB 查不到（刚被禁用 / 脏数据）—— 跳过
        continue;
      }
      const score = this.score({
        candidate: cand,
        config: cfg,
        targetTier,
        role,
        costBias,
      });
      scored.push({ config: cfg, score });
    }

    if (scored.length === 0) {
      throw new NoEligibleModelError(
        modelType,
        `all ${byokFiltered.length} candidates missing DB config`,
      );
    }

    // ============ Step 5 · 排序 + tie-break ============
    scored.sort((a, b) => {
      const diff = b.score.total - a.score.total;
      if (diff !== 0) return diff;
      // tie-break #1: priority DESC
      const prioDiff = (b.config.priority ?? 50) - (a.config.priority ?? 50);
      if (prioDiff !== 0) return prioDiff;
      // tie-break #2: isDefault first
      if (a.config.isDefault !== b.config.isDefault) {
        return b.config.isDefault ? 1 : -1;
      }
      // tie-break #3: stable modelId lex order（确定性）
      return a.config.modelId.localeCompare(b.config.modelId);
    });

    const winner = scored[0];
    const reason = this.buildReason(winner, targetTier, role, costBias);

    this.logger.debug(
      `[elect] modelType=${modelType} role=${role} tier=${targetTier} ` +
        `candidates=${pool.length} → ${winner.config.modelId} (score=${winner.score.total})`,
    );

    return {
      elected: winner.config,
      scores: scored.map((s) => s.score),
      reason,
    };
  }

  // ============================================================
  // 打分内部实现
  // ============================================================

  private score(args: {
    candidate: ElectionCandidate;
    config: AIModelConfig;
    targetTier: ModelTier;
    role: ElectionRoleHint;
    costBias: "cheap" | "balanced" | "quality";
  }): ElectionScore {
    const { candidate, config, targetTier, role, costBias } = args;
    const tier = classifyModelTier(config.modelId);

    const tierScore = this.scoreTier(tier, targetTier);
    const roleScore = this.scoreRole(role, config, tier);
    const costScore = this.scoreCost(costBias, candidate.costTier, tier);
    const healthScore = this.scoreHealth(candidate.recentErrorRate);
    const priorityScore = (config.priority ?? 50) / 10; // 0-10
    const isDefaultScore = config.isDefault ? 5 : 0;

    const total =
      tierScore +
      roleScore +
      costScore +
      healthScore +
      priorityScore +
      isDefaultScore;

    return {
      modelId: config.modelId,
      total: Math.round(total * 100) / 100,
      breakdown: {
        tier: tierScore,
        role: roleScore,
        cost: costScore,
        health: healthScore,
        priority: priorityScore,
        isDefault: isDefaultScore,
      },
    };
  }

  /** tier 匹配：目标命中 +25；相邻 +10；更远 0 */
  private scoreTier(actual: ModelTier, target: ModelTier): number {
    if (actual === target) return 25;
    const order = [ModelTier.BASIC, ModelTier.STANDARD, ModelTier.STRONG];
    const distance = Math.abs(order.indexOf(actual) - order.indexOf(target));
    return distance === 1 ? 10 : 0;
  }

  /** role 偏好 */
  private scoreRole(
    role: ElectionRoleHint,
    config: AIModelConfig,
    tier: ModelTier,
  ): number {
    switch (role) {
      case "leader":
        // 规划/分配任务：reasoning 模型最佳
        return config.isReasoning ? 20 : tier === ModelTier.STRONG ? 10 : 0;
      case "writer":
      case "reviewer":
        return tier === ModelTier.STRONG
          ? 15
          : tier === ModelTier.STANDARD
            ? 5
            : 0;
      case "extractor":
      case "classifier":
        // 结构化抽取：BASIC 够用，不浪费 STRONG
        return tier === ModelTier.BASIC
          ? 10
          : tier === ModelTier.STANDARD
            ? 5
            : 0;
      case "default":
      default:
        return 0;
    }
  }

  /** 成本策略 */
  private scoreCost(
    bias: "cheap" | "balanced" | "quality",
    costTier: "basic" | "standard" | "strong" | "unknown" | undefined,
    tier: ModelTier,
  ): number {
    // unknown / undefined 都退到 tier 派生值
    const effective =
      costTier && costTier !== "unknown" ? costTier : this.tierToCost(tier);
    if (bias === "cheap") {
      return effective === "basic" ? 15 : effective === "standard" ? 5 : 0;
    }
    if (bias === "quality") {
      return effective === "strong" ? 15 : effective === "standard" ? 5 : 0;
    }
    return effective === "standard" ? 10 : 5; // balanced
  }

  /** 健康评分：recentErrorRate 0 → 20；0.1 → 10；0.3 → 0；>0.3 → -20（仍通过硬过滤则说明 < 0.5） */
  private scoreHealth(rate: number | undefined): number {
    if (rate === undefined) return 15; // 未知 = 默认中位
    if (rate <= 0.01) return 20;
    if (rate <= 0.1) return 10;
    if (rate <= 0.3) return 0;
    return -20;
  }

  // ============================================================
  // 辅助
  // ============================================================

  private resolveTargetTier(
    profile: TaskProfile | undefined,
    role: ElectionRoleHint,
  ): ModelTier {
    // Profile 强信号优先
    if (profile) {
      const isHighCreativity =
        profile.creativity === "high" || profile.creativity === "medium";
      const isLongOutput =
        profile.outputLength === "long" || profile.outputLength === "extended";
      const isMinimalOutput = profile.outputLength === "minimal";
      const isDeterministic = profile.creativity === "deterministic";

      if (isHighCreativity && isLongOutput) return ModelTier.STRONG;
      if (isDeterministic && isMinimalOutput) return ModelTier.BASIC;
    }

    // Role 兜底
    switch (role) {
      case "leader":
      case "writer":
      case "reviewer":
        return ModelTier.STRONG;
      case "extractor":
      case "classifier":
        return ModelTier.BASIC;
      default:
        return ModelTier.STANDARD;
    }
  }

  private tierToCost(tier: ModelTier): "basic" | "standard" | "strong" {
    if (tier === ModelTier.STRONG) return "strong";
    if (tier === ModelTier.BASIC) return "basic";
    return "standard";
  }

  /**
   * Type 兼容性：
   *   REASONING 候选（来自 discoverModels 的 additive REASONING 桶）对
   *   modelType=CHAT 的请求也兼容——它们底层也是 CHAT API。
   */
  private isTypeCompatible(
    candidateType: ElectionCandidate["modelType"],
    requested: AIModelType,
  ): boolean {
    if (candidateType === requested) return true;
    if (requested === AIModelType.CHAT && candidateType === "REASONING")
      return true;
    return false;
  }

  private async loadCandidatesFromDb(
    modelType: AIModelType,
  ): Promise<ElectionCandidate[]> {
    const configs =
      await this.modelConfigService.getAllEnabledModelsByType(modelType);
    return configs.map((c) => ({
      modelId: c.modelId,
      provider: c.provider,
      modelType,
      // DB 全表 fallback 场景没有 metrics 输入，标 unknown 让评分逻辑走中位
      healthy: "unknown" as const,
    }));
  }

  private buildReason(
    winner: ScoredCandidate,
    tier: ModelTier,
    role: ElectionRoleHint,
    bias: string,
  ): string {
    const b = winner.score.breakdown;
    return (
      `elected=${winner.config.modelId} tier=${tier} role=${role} ` +
      `costBias=${bias} score=${winner.score.total} ` +
      `[tier=${b.tier} role=${b.role} cost=${b.cost} health=${b.health} ` +
      `prio=${b.priority} default=${b.isDefault}]`
    );
  }
}

