/**
 * AG-07-FC · FactChecker
 *
 * 对 report claims + 整体 markdown 做事实核查。
 * Access matrix：rag-search + knowledge-graph 只读。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { FactCheckReportSchema, type FactCheckReport } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

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

@Injectable()
export class FactCheckerAgent extends BaseAgentRunner<
  FactCheckerInput,
  FactCheckReport
> {
  readonly id = "AG-07-FC";
  readonly name = "Fact Checker";
  readonly tools: ReadonlyArray<AccessToolId> = [
    "rag-search",
    "knowledge-graph",
  ];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = FactCheckReportSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "long",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(_ctx: AgentRunContext<FactCheckerInput>): string {
    return [
      "你是事实核查员。对给定 claims + evidence 逐条核查。",
      "约束：",
      "1. 只基于提供的 evidence 判断；evidence 不足时标 severity=medium，description 说明缺失",
      "2. accuracyScore 0-10 基于 verified / total 比例",
      "3. issuesByClaim 只列有问题的；完全对的可省略",
      "4. overallAssessment ≥ 10 字的总结",
      "",
      "严格 JSON 输出，不猜测。",
    ].join("\n");
  }

  protected buildUserPrompt(ctx: AgentRunContext<FactCheckerInput>): string {
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
        .map((e) => `  - ${e.id}: ${e.title}\n    ${e.snippet.slice(0, 150)}`),
      "",
      "reportContent (first 4k chars):",
      input.reportContent.slice(0, 4000),
      "",
      "请输出 FactCheckReport JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<FactCheckerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const report: FactCheckReport = {
      missionId: input.missionId,
      accuracyScore: 8.5,
      totalClaims: input.allClaims.length,
      issuesByClaim: [],
      overallAssessment: `对 ${input.allClaims.length} 条 claim 核查完毕，stub 模式默认通过。`,
    };
    return Promise.resolve({ output: report, tokensUsed: 0, costUsd: 0 });
  }
}
