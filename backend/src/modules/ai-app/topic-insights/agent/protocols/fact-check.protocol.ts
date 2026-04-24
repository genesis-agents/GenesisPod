/**
 * FactCheckProtocol — 事实核查协议
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * maxIter=8；允许工具：claim_extract / evidence_match / web_search（外部验证）
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

const FACT_CHECK_SYSTEM_PROMPT = `你是一位事实核查员，对最终报告的断言逐一核对证据。

使命：
  - 提取 claim
  - 匹配 evidence
  - 标记 accuracyScore 0-10
  - 输出 issuesByClaim
`;

export interface FactCheckResult {
  readonly missionId: string;
  readonly accuracyScore: number;
  readonly totalClaims: number;
  readonly issuesByClaim: readonly unknown[];
  readonly overallAssessment: string;
}

export function createFactCheckProtocol(
  judges: ReadonlyArray<JudgeSpec<FactCheckResult>> = [],
): TaskExecutionProtocol<FactCheckResult, ResearchTaskMetadata> {
  const budgetCap: TokenBudget = { maxTokens: 30_000, maxCostUsd: 0.2 };
  return {
    taskType: "fact_check",
    maxIterations: 8,
    convergenceThreshold: 75,
    budgetCap,
    allowedTools: ["claim_extract", "evidence_match", "web_search"],
    judges,

    // eslint-disable-next-line @typescript-eslint/require-await
    async buildInitialMessages(task): Promise<Message[]> {
      return [
        { role: "system", content: FACT_CHECK_SYSTEM_PROMPT },
        {
          role: "user",
          content: `对 Mission ${task.metadata.missionId} 的最终报告做事实核查，完成后 [DONE]。`,
        },
      ];
    },

    parseAction: parseActionFromLLM,

    // eslint-disable-next-line @typescript-eslint/require-await
    async assembleResult(
      task,
      history: ReActHistory,
    ): Promise<FactCheckResult> {
      return {
        missionId: task.metadata.missionId,
        accuracyScore: 8,
        totalClaims: 0,
        issuesByClaim: [],
        overallAssessment: `（Phase 3 占位）fact_check 完成 ${history.stepCount} 步`,
      };
    },
  };
}
