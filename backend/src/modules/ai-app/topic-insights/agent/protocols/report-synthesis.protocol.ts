/**
 * ReportSynthesisProtocol — 最终报告合成协议
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * maxIter=15；允许工具：dimension_result_lookup / cross_dim_themes / markdown_assemble
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

const REPORT_SYNTHESIS_SYSTEM_PROMPT = `你是一位首席研究编辑，整合多维度研究成果为最终报告。

使命：
  - 读取所有 dimension_research 的 task.result
  - 识别跨维度主题（globalThemes）
  - 产出 executiveSummary / preface / fullMarkdown / highlights /
    crossDimensionAnalysis / riskMatrix / recommendations

ReAct 工作法：
1. dimension_result_lookup 拉各维度 task.result
2. cross_dim_themes 识别共性主题
3. markdown_assemble 组装最终 markdown
4. [DONE]
`;

export interface ReportSynthesisResult {
  readonly missionId: string;
  readonly executiveSummary: string;
  readonly preface: string;
  readonly fullMarkdown: string;
  readonly highlights: readonly { type: "KEY_FINDING"; text: string }[];
  readonly crossDimensionAnalysis: string;
  readonly riskMatrix: readonly unknown[];
  readonly recommendations: readonly unknown[];
}

export function createReportSynthesisProtocol(
  judges: ReadonlyArray<JudgeSpec<ReportSynthesisResult>> = [],
): TaskExecutionProtocol<ReportSynthesisResult, ResearchTaskMetadata> {
  const budgetCap: TokenBudget = { maxTokens: 80_000, maxCostUsd: 0.6 };
  return {
    taskType: "report_synthesis",
    maxIterations: 15,
    convergenceThreshold: 80,
    budgetCap,
    allowedTools: [
      "dimension_result_lookup",
      "cross_dim_themes",
      "markdown_assemble",
    ],
    judges,

    // eslint-disable-next-line @typescript-eslint/require-await
    async buildInitialMessages(task): Promise<Message[]> {
      return [
        { role: "system", content: REPORT_SYNTHESIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `合成报告 Mission: ${task.metadata.missionId}`,
            `Topic: ${task.metadata.topicId}`,
            "",
            `请基于所有 dimension_research 的 task.result 产出 ReportSynthesisResult。`,
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
    ): Promise<ReportSynthesisResult> {
      return {
        missionId: task.metadata.missionId,
        executiveSummary: `（Phase 3 占位 · Phase 5 接入真实合成）`,
        preface: "",
        fullMarkdown: `# 报告\n\n（Phase 3 占位，已执行 ${history.stepCount} 步）`,
        highlights: [],
        crossDimensionAnalysis: "",
        riskMatrix: [],
        recommendations: [],
      };
    },
  };
}
