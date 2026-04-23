/**
 * AG-07-FC · FactChecker spec
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import {
  FactCheckReportSchema,
  type FactCheckReport,
} from "../harness/agents/schemas";

export interface FactCheckerInput {
  readonly missionId: string;
  readonly reportContent: string;
  readonly allClaims: ReadonlyArray<{
    id: string;
    statement: string;
    evidenceIds: ReadonlyArray<string>;
  }>;
  readonly evidenceSummaries: ReadonlyArray<{
    id: string;
    title: string;
    snippet: string;
  }>;
}

export const FACT_CHECKER_SPEC: IAgentSpec<FactCheckerInput, FactCheckReport> =
  {
    identity: {
      role: {
        id: "AG-07-FC",
        name: "Fact Checker",
        description: "核查 claims 与 evidence 的一致性。",
        workStyle: "structured",
      },
      persona: { tone: "formal", language: "zh-CN", style: "严谨核查员" },
      goal: {
        summary: "产出 FactCheckReport（accuracyScore + issuesByClaim）",
      },
      constraints: {
        maxIterations: 3,
        maxTokens: 40_000,
        maxWallTimeMs: 120_000,
        safetyLevel: "standard",
      },
      tools: ["rag-search", "knowledge-graph"],
      forbiddenTools: ["TL-02-EVSAVE"],
    },
    taskProfile: { creativity: "deterministic", outputLength: "long" },
    outputSchema: FactCheckReportSchema,

    buildSystemPrompt: () =>
      [
        "你是事实核查员。对给定 claims + evidence 逐条核查。",
        "约束：",
        "1. 只基于提供的 evidence 判断；evidence 不足时标 severity=medium，description 说明缺失",
        "2. accuracyScore 0-10 基于 verified / total 比例",
        "3. issuesByClaim 只列有问题的；完全对的可省略",
        "4. overallAssessment ≥ 10 字的总结",
        "",
        "严格 JSON 输出，不猜测。",
      ].join("\n"),

    buildUserPrompt: (ctx) => {
      const { input } = ctx;
      return [
        `missionId: ${input.missionId}`,
        `totalClaims: ${input.allClaims.length}`,
        "",
        "claims:",
        ...input.allClaims.map(
          (c) =>
            `  - ${c.id}: ${c.statement.slice(0, 200)} (evidenceIds=${c.evidenceIds.join(",")})`,
        ),
        "",
        "evidenceSummaries:",
        ...input.evidenceSummaries
          .slice(0, 20)
          .map(
            (e) => `  - ${e.id}: ${e.title}\n    ${e.snippet.slice(0, 150)}`,
          ),
        "",
        "reportContent (first 4k chars):",
        input.reportContent.slice(0, 4000),
        "",
        "请输出 FactCheckReport JSON。",
      ].join("\n");
    },

    stubFn: async (ctx) => {
      const { input } = ctx;
      return {
        missionId: input.missionId,
        accuracyScore: 8.5,
        totalClaims: input.allClaims.length,
        issuesByClaim: [],
        overallAssessment: `对 ${input.allClaims.length} 条 claim 核查完毕，stub 模式默认通过。`,
      };
    },
  };
