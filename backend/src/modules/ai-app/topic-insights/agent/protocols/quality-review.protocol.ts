/**
 * QualityReviewProtocol — 跨维度质量审核协议
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * maxIter=10；允许工具：consistency_check / fact_verify / cross_dim_compare
 */

import type {
  JudgeSpec,
  TaskExecutionProtocol,
  TokenBudget,
  Message,
  ReActHistory,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";
import { parseActionFromLLM } from "./base-protocol";

const QUALITY_REVIEW_SYSTEM_PROMPT = `你是一位质量审核员（devil_advocate），对已完成的 dimension research 做全面质疑。

使命：
  - 检查各 dim 的 keyFindings 是否被证据支撑
  - 识别跨 dim 矛盾
  - 指出论证薄弱点
  - 给出 overallScore 0-100 + needsReresearch 建议

ReAct 工作法：
1. consistency_check 跨 dim 比对 summary
2. fact_verify 抽样验证高置信 finding 的 evidence
3. 识别需要重研究的 dim，产出 revisionTargets
4. 完成后 [DONE]
`;

export interface QualityReviewResult {
  readonly missionId: string;
  readonly overallScore: number;
  readonly crossDimensionIssues: readonly string[];
  readonly recommendations: readonly string[];
  readonly needsReresearch: boolean;
  readonly dimensionsToReresearch: readonly string[];
}

export function createQualityReviewProtocol(
  judges: ReadonlyArray<JudgeSpec<QualityReviewResult>> = [],
): TaskExecutionProtocol<QualityReviewResult, ResearchTaskMetadata> {
  const budgetCap: TokenBudget = { maxTokens: 40_000, maxCostUsd: 0.3 };
  return {
    taskType: "quality_review",
    maxIterations: 10,
    convergenceThreshold: 70,
    budgetCap,
    allowedTools: ["consistency_check", "fact_verify", "cross_dim_compare"],
    judges,

    // eslint-disable-next-line @typescript-eslint/require-await
    async buildInitialMessages(task): Promise<Message[]> {
      return [
        { role: "system", content: QUALITY_REVIEW_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `审核 Mission: ${task.metadata.missionId}`,
            `Topic: ${task.metadata.topicId}`,
            "",
            `请审核此 Mission 下所有 dimension_research 结果，产出 QualityReviewResult。`,
            "完成后 [DONE]。",
          ].join("\n"),
        },
      ];
    },

    parseAction: parseActionFromLLM,

    // eslint-disable-next-line @typescript-eslint/require-await
    async assembleResult(
      task,
      history: ReActHistory,
    ): Promise<QualityReviewResult> {
      const issueCount = history.toolInvocations.filter(
        (i) => i.tool === "consistency_check" || i.tool === "fact_verify",
      ).length;
      return {
        missionId: task.metadata.missionId,
        overallScore: Math.max(40, 85 - issueCount * 5),
        crossDimensionIssues: [],
        recommendations: [],
        needsReresearch: false,
        dimensionsToReresearch: [],
      };
    },
  };
}
