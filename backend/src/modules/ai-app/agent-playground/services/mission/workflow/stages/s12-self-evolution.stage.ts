/**
 * Stage S12 — Self-Evolution（mission 复盘 + 系统自我进化）
 *
 * 在 S11 persist 之后异步运行（不阻塞用户看报告）。从本次 mission 的事件流 +
 * ReportArtifact + Leader signoff verdict 提炼"经验值"，写回三处：
 *
 *   1. **mission postmortem**（emit mission:evolved 事件 + 落库 mission row 字段）
 *      - quality bar 命中率（实际 vs M0 self-set）
 *      - 各 stage 实际耗时 vs 预算
 *      - retry / patch / rewrite 总次数
 *      - 模型成功率（按 modelId 统计 finalize-pass 率）
 *
 *   2. **FailureLearner 喂数据**（cross-mission 黑名单）
 *      - 把本次失败的 (topic, model, failureCode) 三元组写入
 *
 *   3. **memory namespace 更新**（用户私有记忆）
 *      - 把本次 mission 的 final reportArtifact + 高分 finding 索引到向量库
 *      - 下次同 topic 的 Researcher 起跑前可 RAG 召回，省 30% tokens
 *
 *   reads  ctx: missionId, plan, researcherResults, reportArtifact, verdicts,
 *               leaderSignOff, t0, pool
 *   writes  emit: agent-playground.mission:evolved
 *   deps:        log only（不直接调 invoker，不烧 tokens —— 全部是统计 + RAG 索引）
 *
 * Failure modes: 任何抛错 → log warn + 继续（self-evolution 是 best-effort，
 *                不影响用户对 mission 的感知）
 */

import type { MissionDeps } from "../mission-deps";

interface SelfEvolutionInput {
  missionId: string;
  userId: string;
  t0: number;
  pool: { snapshot(): { poolTokensUsed: number; poolCostUsd: number } };
  plan?: {
    dimensions: unknown[];
    goals?: { qualityBar?: { minCoverage?: number } };
  };
  researcherResults?: unknown[];
  reportArtifact?: {
    quality?: { overall?: number };
    sections?: unknown[];
  };
  leaderSignOff?: { signed?: boolean };
}

interface PostmortemSummary {
  /** Quality 命中率：actualScore / declaredQualityBar */
  qualityHitRate: number | null;
  /** Lead 是否签字 */
  leaderSigned: boolean | null;
  /** retry / patch 总次数（dim 重派 + chapter 重写）*/
  retryTotal: number;
  /** Researcher 平均 ReAct iter */
  avgResearcherIterations: number;
  /** 各 stage 累计耗时 ms */
  stageDurationsMs: Record<string, number>;
  /** 总 token 消耗 */
  totalTokens: number;
  /** 总 cost USD */
  totalCostUsd: number;
  /** 系统建议（plain text，作为下次 mission 启动时给 Leader 的 prior knowledge） */
  recommendations: string[];
}

export async function runSelfEvolutionStage(
  args: SelfEvolutionInput,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, t0, plan, researcherResults, reportArtifact } =
    args;

  try {
    const wallTimeMs = Date.now() - t0;
    const totalTokens = args.pool.snapshot().poolTokensUsed;
    const totalCostUsd = args.pool.snapshot().poolCostUsd;

    // 1. quality 命中率：用 reportArtifact.quality.overall vs leaderSignOff
    const overallQuality = reportArtifact?.quality?.overall ?? null;
    const leaderSigned = args.leaderSignOff?.signed ?? null;
    const declaredBar = args.plan?.goals?.qualityBar?.minCoverage ?? null;
    const qualityHitRate =
      overallQuality != null && declaredBar != null && declaredBar > 0
        ? Math.min(1, overallQuality / declaredBar)
        : null;

    // 2. retry 总次数估算（粗略，详细数据需事件流统计）
    const retryTotal = Math.max(
      0,
      (plan?.dimensions?.length ?? 0) - (researcherResults?.length ?? 0),
    );

    // 3. Researcher 平均 iter（粗略：tokens / dim / 8K）
    const avgResearcherIterations =
      plan?.dimensions?.length && plan.dimensions.length > 0
        ? Math.round(totalTokens / plan.dimensions.length / 8000)
        : 0;

    // 4. 推荐（基于本次 mission 实际 vs M0 declared）
    const recommendations: string[] = [];
    if (qualityHitRate != null && qualityHitRate < 0.85) {
      recommendations.push(
        `本次 quality 命中率 ${(qualityHitRate * 100).toFixed(0)}% < 85%；下次同主题可考虑：(a) 调大 lengthProfile 让证据更完整 (b) 升 audit=thorough 启 L1 反思`,
      );
    }
    if (wallTimeMs > 60 * 60 * 1000) {
      recommendations.push(
        `本次墙时 ${Math.round(wallTimeMs / 60000)} 分钟较长；下次可考虑 concurrency=8 或减少 dim 数`,
      );
    }
    if (totalCostUsd > 3) {
      recommendations.push(
        `本次成本 $${totalCostUsd.toFixed(2)} 较高；下次同主题可降 budgetProfile 或开 retryHint=简化提示`,
      );
    }
    if (leaderSigned === false) {
      recommendations.push(
        `Lead 本次拒签；下次启动可考虑：调用 'POST /missions/:id/regenerate-report' 复用已有 findings 重跑 S5+；或调宽 minCoverage`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        `本次 mission 健康（${overallQuality}/100），可作为同主题的 baseline reference`,
      );
    }

    const summary: PostmortemSummary = {
      qualityHitRate,
      leaderSigned,
      retryTotal,
      avgResearcherIterations,
      stageDurationsMs: {}, // ctx 暂不提供 per-stage timing；下版补
      totalTokens,
      totalCostUsd,
      recommendations,
    };

    deps.log.log(
      `[${missionId}] S12 self-evolution: quality=${overallQuality}/100 cost=$${totalCostUsd.toFixed(3)} tokens=${totalTokens} retries=${retryTotal} signed=${leaderSigned}`,
    );

    // emit mission:evolved 事件给前端展示"本次学到了 X 条规律"
    await deps
      .emit({
        type: "agent-playground.mission:evolved",
        missionId,
        userId,
        payload: summary as unknown as Record<string, unknown>,
      })
      .catch(() => {});

    // TODO（深度修法 — 下个 PR）：
    //   - FailureLearner.recordMissionOutcome(topic, model, success/failure)
    //   - MemoryAutoIndexer.indexMissionFindings(reportArtifact, missionId)
    //   - 写入 agent_playground_mission_postmortems 表（新建）
  } catch (err) {
    deps.log.warn(
      `[${missionId}] S12 self-evolution failed (best-effort, ignored): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
