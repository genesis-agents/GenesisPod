/**
 * AG-02-DP · DimensionPlanner
 *
 * 对单个 dimension 规划 sections（3-8 个，含 keyPoints + dependsOn 图）。
 * Access matrix：只读 TL-04-DIMMEM + rag-search。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { DimensionOutlineSchema, type DimensionOutline } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface DimensionPlannerInput {
  readonly dimensionId: string;
  readonly dimensionName: string;
  readonly dimensionDescription: string;
  readonly allDimensions: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
  }>;
  readonly researchDepth: "quick" | "standard" | "thorough" | "deep";
}

@Injectable()
export class DimensionPlannerAgent extends BaseAgentRunner<
  DimensionPlannerInput,
  DimensionOutline
> {
  readonly id = "AG-02-DP";
  readonly name = "Dimension Planner";
  readonly tools: ReadonlyArray<AccessToolId> = ["TL-04-DIMMEM", "rag-search"];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = DimensionOutlineSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "low",
    outputLength: "medium",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<DimensionPlannerInput>,
  ): string {
    return [
      "你是维度规划员。给定一个 dimension 和所有兄弟 dimensions 上下文，输出 3-8 个 sections。",
      "约束：",
      "1. 每个 section 有 id / title / description / targetWords (200-1000) / keyPoints (≥1) / dependsOn (数组，可空)",
      "2. section 之间的 dependsOn 不能形成环",
      "3. 避免与其他 dimension 内容重复",
      "",
      "严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<DimensionPlannerInput>,
  ): string {
    const { input } = ctx;
    const others = input.allDimensions
      .filter((d) => d.id !== input.dimensionId)
      .map((d) => `- ${d.name}: ${d.description}`)
      .join("\n");
    return [
      `当前维度: ${input.dimensionName} (id=${input.dimensionId})`,
      `描述: ${input.dimensionDescription}`,
      `研究深度: ${input.researchDepth}`,
      "",
      "兄弟维度（避免内容重叠）:",
      others || "(无)",
      "",
      "请输出 DimensionOutline JSON。",
    ].join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<DimensionPlannerInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    const count = input.researchDepth === "thorough" ? 4 : 2;
    const outline: DimensionOutline = {
      dimensionId: input.dimensionId,
      dimensionName: input.dimensionName,
      sections: Array.from({ length: count }).map((_, idx) => ({
        id: `${input.dimensionId}-s-${idx + 1}`,
        title: `${input.dimensionName} - 子章节 ${idx + 1}`,
        description: `针对 ${input.dimensionName} 的子章节 ${idx + 1}`,
        targetWords: 400,
        keyPoints: [`要点 A${idx + 1}`, `要点 B${idx + 1}`],
        dependsOn: idx === 0 ? [] : [`${input.dimensionId}-s-${idx}`],
      })),
    };
    return Promise.resolve({ output: outline, tokensUsed: 0, costUsd: 0 });
  }
}
