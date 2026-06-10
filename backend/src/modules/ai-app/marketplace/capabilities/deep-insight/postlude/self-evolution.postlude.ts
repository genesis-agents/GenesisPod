/**
 * deep-insight 能力 S12 自进化 postlude（fire-and-forget）
 *
 * mission completed 后异步跑，不阻塞 run() 返回。
 * 行为：
 *   1. PostmortemClassifierService 扫描事件流 → FailureMode 分类
 *   2. 拼 postmortem summary（含 quality / cost / 经验建议）
 *   3. 经 MissionPersistencePort.recordPostmortem?（optional hook）写
 *      harness_vector_memory（消费方实现，能力层零直连 app DB）
 *
 * 铁律（R1）：本文件零 app import，只依赖 harness facade + capability 端口。
 * 异常只 log warn，沉淀失败不破坏 mission 终态。
 */
import type { Logger } from "@nestjs/common";
import type { PostmortemClassifierService } from "@/modules/ai-harness/facade";
import type { MissionPersistencePort } from "../../../capability/capability-runner.port";
import { DEEP_INSIGHT_POSTMORTEM_PATTERNS } from "./deep-insight-postmortem-patterns";

/** postlude 所需的 harness 服务依赖（runner 构造器注入后透传）。 */
export interface SelfEvolutionPostludeDeps {
  readonly postmortemClassifier: PostmortemClassifierService;
  readonly log: Logger;
}

/** postlude 输入（runner assembleCompleted 完成后传入）。 */
export interface SelfEvolutionPostludeInput {
  readonly missionId: string;
  readonly userId: string;
  readonly topic: string;
  /** 从 crossStageState 取出的终态产物。 */
  readonly leaderSignOff?: { signed?: boolean } | null;
  readonly reportArtifact?: {
    quality?: { overall?: number };
  } | null;
  readonly plan?: {
    dimensions?: unknown[];
    goals?: { qualityBar?: { minCoverage?: number } };
  } | null;
  readonly finalScore?: number;
  readonly tokensUsed: number;
  readonly costCents: number;
  /** run() 起始时间戳（用于 wallTimeMs 计算）。 */
  readonly startedAt: number;
  /** 持久化端口（来自 ctx.persistence；optional.recordPostmortem 由消费方实现）。 */
  readonly persistence: MissionPersistencePort;
  /**
   * ★ env3：runner 在 run() 期间缓冲的 mission/agent 事件（ring buffer 快照）。
   * 传给 postmortemClassifier.classify 让 DEEP_INSIGHT_POSTMORTEM_PATTERNS substring
   * patterns 真正命中（之前传 [] 导致 pattern 永不命中——死代码修复）。
   * 缺省传空数组 → 退化到原行为（仅 status 路径）。
   */
  readonly bufferedEvents?: ReadonlyArray<{
    type: string;
    payload?: unknown;
    ts: number;
  }>;
}

/**
 * fireSelfEvolutionPostlude — fire-and-forget 入口。
 *
 * 调用方 void 调用（不 await），让终态返回不被阻塞；
 * postlude 内部任何异常仅 warn，不向上抛。
 */
export function fireSelfEvolutionPostlude(
  input: SelfEvolutionPostludeInput,
  deps: SelfEvolutionPostludeDeps,
): void {
  void runPostlude(input, deps);
}

async function runPostlude(
  input: SelfEvolutionPostludeInput,
  deps: SelfEvolutionPostludeDeps,
): Promise<void> {
  const { missionId, userId, topic, persistence } = input;
  try {
    const wallTimeMs = Date.now() - input.startedAt;
    const totalTokens = input.tokensUsed;
    const totalCostUsd = input.costCents / 100;
    const leaderSigned = input.leaderSignOff?.signed ?? null;
    const overallQuality =
      input.reportArtifact?.quality?.overall ?? input.finalScore ?? null;
    const declaredBar = input.plan?.goals?.qualityBar?.minCoverage ?? null;
    const qualityHitRate =
      overallQuality != null && declaredBar != null && declaredBar > 0
        ? Math.min(1, overallQuality / declaredBar)
        : null;

    // ── 经验建议 ──────────────────────────────────────────────────────────
    const recommendations: string[] = [];
    if (qualityHitRate != null && qualityHitRate < 0.85) {
      recommendations.push(
        `本次 quality 命中率 ${(qualityHitRate * 100).toFixed(0)}% < 85%；` +
          `下次同主题可考虑：(a) 升 depth=deep (b) 调宽 minCoverage`,
      );
    }
    if (wallTimeMs > 60 * 60 * 1000) {
      recommendations.push(
        `本次墙时 ${Math.round(wallTimeMs / 60000)} 分钟较长；下次可减少维度数或用 depth=quick`,
      );
    }
    if (totalCostUsd > 3) {
      recommendations.push(
        `本次成本 $${totalCostUsd.toFixed(2)} 较高；下次同主题可降 depth 或减少维度`,
      );
    }
    if (leaderSigned === false) {
      recommendations.push(
        `Leader 本次拒签；下次启动可考虑调宽 minCoverage 或升级 depth`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        `本次 mission 健康（${overallQuality}/100），可作为同主题的 baseline reference`,
      );
    }

    // ── PostmortemClassifier 分类 ─────────────────────────────────────────
    // ★ env3 修复：使用 runner 缓冲的真实事件流（非空时 pattern 才能命中）。
    // 把内部事件形状适配成 classifier 期望的 { type: string } 形状。
    const classifyEvents: Array<{
      type: string;
      ts: number;
      payload?: unknown;
    }> = (input.bufferedEvents ?? []).map((e) => ({
      type: e.type,
      ts: e.ts,
      payload: e.payload,
    }));
    const missionStatus = leaderSigned === true ? "completed" : "failed";
    const classification = deps.postmortemClassifier.classify(
      {
        status: missionStatus,
        events: classifyEvents,
        metrics: { totalTokens, wallTimeMs },
      },
      DEEP_INSIGHT_POSTMORTEM_PATTERNS,
    );

    deps.log.log(
      `[deep-insight ${missionId}] S12-postlude: quality=${overallQuality}/100 ` +
        `cost=$${totalCostUsd.toFixed(3)} tokens=${totalTokens} ` +
        `signed=${leaderSigned} mode=${classification.mode}`,
    );

    // ── postmortem summary 文本 ──────────────────────────────────────────
    const postmortemSummary = [
      `Mission "${topic}" — ${leaderSigned === true ? "签字交付" : leaderSigned === false ? "Leader 拒签" : "未签字"}`,
      `质量 ${overallQuality ?? "-"}/100，命中率 ${qualityHitRate != null ? (qualityHitRate * 100).toFixed(0) + "%" : "n/a"}`,
      `Token ${totalTokens}，cost $${totalCostUsd.toFixed(2)}，墙时 ${Math.round(wallTimeMs / 60000)}min`,
      `失败模式：${classification.mode}（confidence=${classification.confidence.toFixed(2)}）`,
      `经验：`,
      ...recommendations.map((r) => `- ${r}`),
    ].join("\n");

    // ── 写 harness_vector_memory（经 persistence 端口，消费方实现；optional）──
    if (persistence.recordPostmortem) {
      await persistence
        .recordPostmortem({
          missionId,
          userId,
          topic,
          summary: postmortemSummary,
          recommendations,
          leaderSigned,
          qualityScore: overallQuality,
          tokensUsed: totalTokens,
          costUsd: totalCostUsd,
          source: "deep-insight:mission",
          tags: [
            "deep-insight",
            "mission-postmortem",
            leaderSigned === true ? "signed" : "unsigned",
          ],
          failureClassification: classification,
        })
        .catch((err: unknown) => {
          deps.log.warn(
            `[deep-insight ${missionId}] S12-postlude recordPostmortem failed (non-fatal): ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        });
      deps.log.log(
        `[deep-insight ${missionId}] S12-postlude sediment recorded → harness_vector_memory` +
          `${leaderSigned === false ? " + failure mode" : ""}`,
      );
    } else {
      deps.log.log(
        `[deep-insight ${missionId}] S12-postlude: recordPostmortem not provided by consumer, skip write`,
      );
    }
  } catch (err) {
    deps.log.warn(
      `[deep-insight ${missionId}] S12-postlude failed (best-effort, ignored): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
