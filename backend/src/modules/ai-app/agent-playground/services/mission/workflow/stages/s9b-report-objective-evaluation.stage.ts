/**
 * Stage S9B — 10 维客观报告评审 (沉淀消费 v3, 2026-04-29)
 *
 * 在 S9 critic L4 之后、S10 leader signoff 之前，跑一轮基于 EVALUATOR 模型的
 * 结构化 10 维评审：每个 chapter 独立评分（factualAccuracy / analyticalDepth /
 * evidenceCoverage / informationDensity / logicalConsistency / visualQuality /
 * writingQuality / originality / timeliness / actionability），加权平均得到
 * overallScore + grade。
 *
 * 用途：
 *   - 给 leader signoff 提供客观证据（弥补 leader LLM 主观判断）
 *   - 多模型对比：identifies 哪个 writerModel 在哪个维度最强 / 最弱
 *   - 落库到 mission.qualityTrace.evaluation，前端可视化
 *
 * 跳过条件：
 *   - !reportArtifact 或 sections.length < 1
 *   - input.auditLayers === "minimal"
 *   - input.depth === "quick" 且非 executive 受众（节省成本）
 */

import type { MissionContext } from "../mission-context";
import type { MissionDeps } from "../mission-deps";
import type { ChapterInput } from "@/modules/ai-harness/facade";
import { narrate } from "../helpers/narrative.util";

export async function runReportObjectiveEvaluationStage(
  ctx: MissionContext,
  deps: MissionDeps,
): Promise<void> {
  const { reportArtifact, input, missionId, userId } = ctx;
  if (!reportArtifact || reportArtifact.sections.length === 0) return;
  if (input.auditLayers === "minimal") return;
  if (input.depth === "quick" && input.audienceProfile !== "executive") {
    return;
  }

  const language = input.language?.startsWith("en") ? "en" : "zh";
  const topicType =
    typeof (input as { topicType?: string }).topicType === "string"
      ? (input as { topicType?: string }).topicType!
      : "GENERIC";

  const fullMarkdown = reportArtifact.content.fullMarkdown;
  const chapters: ChapterInput[] = reportArtifact.sections
    .map((s) => {
      const body = fullMarkdown.slice(s.startOffset, s.endOffset);
      return { section: s, body };
    })
    .filter(({ body }) => body && body.length >= 200)
    .map(({ section, body }) => ({
      chapterId: section.id,
      chapterTitle: section.title,
      writerModel: reportArtifact.metadata.modelTrail?.[0] ?? "unknown",
      content: body,
      sourcesUsed: section.citations?.length ?? 0,
    }));

  if (chapters.length === 0) return;

  // ★ 2026-04-30: emit stage:started 让前端 todo-ledger 创建 S9B 任务卡
  const s9bStartedAt = Date.now();
  await deps
    .emit({
      type: "agent-playground.stage:started",
      missionId,
      userId,
      payload: {
        stage: "s9b-objective-evaluation",
        startedAtMs: s9bStartedAt,
        chaptersCount: chapters.length,
      },
    })
    .catch(() => {});

  await narrate(deps.emit, missionId, userId, {
    stage: "s9b-objective-evaluation",
    role: "critic",
    tag: "judging",
    text: `10 维客观评审启动（EVALUATOR 模型）：${chapters.length} 个章节，跨模型对比`,
    agentId: "critic",
  });

  try {
    const result = await deps.reportEvaluation.evaluateReport({
      reportTitle: reportArtifact.metadata.topic ?? input.topic,
      topicType,
      chapters,
      language,
    });

    ctx.reportEvaluation = result;
    // ★ 落到 reportArtifact.metadata.pipelineEvaluation，自动随 reportFull JSONB 持久化
    reportArtifact.metadata.pipelineEvaluation = result;

    // 把客观评分推到 reportArtifact.quality 作为附加参考维度
    reportArtifact.quality.warnings.push({
      dimension: "objective_evaluation",
      message: `10 维客观评分：${result.overallScore}/100 (${result.grade})；${result.feedback}`,
    });

    await narrate(deps.emit, missionId, userId, {
      stage: "s9b-objective-evaluation",
      role: "critic",
      tag: "success",
      text: `客观评审完成：${result.overallScore}/100 (${result.grade})；${result.modelComparison.length} 个模型对比`,
      agentId: "critic",
    });
    // ★ 2026-04-30: emit stage:completed 让前端 todo-ledger 把 S9B 任务卡标 done
    await deps
      .emit({
        type: "agent-playground.stage:completed",
        missionId,
        userId,
        payload: {
          stage: "s9b-objective-evaluation",
          durationMs: Date.now() - s9bStartedAt,
          overallScore: result.overallScore,
          grade: result.grade,
        },
      })
      .catch(() => {});
  } catch (err) {
    deps.log.warn(
      `[s9b] Objective evaluation failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    // 失败也 emit completed，避免前端 todo 卡永远 in_progress
    await deps
      .emit({
        type: "agent-playground.stage:completed",
        missionId,
        userId,
        payload: {
          stage: "s9b-objective-evaluation",
          durationMs: Date.now() - s9bStartedAt,
          status: "failed",
        },
      })
      .catch(() => {});
  }
}
