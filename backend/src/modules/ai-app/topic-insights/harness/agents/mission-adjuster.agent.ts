/**
 * AG-16-MA · MissionAdjuster
 *
 * Budget 将耗尽 / 质量过低时，决策是否 continue / extend_budget /
 * downgrade_depth / abort。
 * Access matrix：无工具。
 */

import { Injectable, Optional } from "@nestjs/common";
import type { TaskProfile } from "@/modules/ai-engine/facade";
import { BaseAgentRunner } from "./base-agent-runner";
import { MissionAdjustmentSchema, type MissionAdjustment } from "./schemas";
import type { AccessToolId, AgentRunContext } from "./types";
import { LlmInvokerService } from "../llm";

export interface MissionAdjusterInput {
  readonly budgetUsagePct: number; // 0-1
  readonly currentDepth: "quick" | "standard" | "thorough" | "deep";
  readonly completedStages: ReadonlyArray<string>;
  readonly pendingStages: ReadonlyArray<string>;
  readonly qualityScore?: number; // 0-100（来自 QGATE）
  readonly elapsedMs: number;
}

@Injectable()
export class MissionAdjusterAgent extends BaseAgentRunner<
  MissionAdjusterInput,
  MissionAdjustment
> {
  readonly id = "AG-16-MA";
  readonly name = "Mission Adjuster";
  readonly tools: ReadonlyArray<AccessToolId> = [];
  readonly forbiddenTools: ReadonlyArray<AccessToolId> = ["TL-02-EVSAVE"];
  readonly outputSchema = MissionAdjustmentSchema;
  protected readonly taskProfile: TaskProfile = {
    creativity: "deterministic",
    outputLength: "short",
  };

  constructor(@Optional() llmInvoker?: LlmInvokerService) {
    super(llmInvoker);
  }

  protected buildSystemPrompt(
    _ctx: AgentRunContext<MissionAdjusterInput>,
  ): string {
    return [
      "你是 mission 策略调整员。根据当前进度和预算，决定 4 种动作之一：",
      "- continue: 维持当前路径",
      "- extend_budget: 申请延长 budget（只在质量关键才选）",
      "- downgrade_depth: 降级到更低 depth（thorough→standard 等）",
      "- abort: 终止 mission",
      "",
      "recommendedActions 列出具体的 next steps。严格 JSON 输出。",
    ].join("\n");
  }

  protected buildUserPrompt(
    ctx: AgentRunContext<MissionAdjusterInput>,
  ): string {
    const { input } = ctx;
    return [
      `budgetUsagePct: ${(input.budgetUsagePct * 100).toFixed(1)}%`,
      `currentDepth: ${input.currentDepth}`,
      `elapsedMs: ${input.elapsedMs}`,
      input.qualityScore != null
        ? `qualityScore: ${input.qualityScore}/100`
        : "",
      "",
      `completedStages (${input.completedStages.length}): ${input.completedStages.join(", ")}`,
      `pendingStages (${input.pendingStages.length}): ${input.pendingStages.join(", ")}`,
      "",
      "请输出 MissionAdjustment JSON。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  protected stubOutput(
    ctx: AgentRunContext<MissionAdjusterInput>,
  ): Promise<{ output: unknown; tokensUsed: number; costUsd: number }> {
    const { input } = ctx;
    let decision: MissionAdjustment["decision"] = "continue";
    if (input.budgetUsagePct >= 1) decision = "abort";
    else if (input.budgetUsagePct >= 0.9 && input.currentDepth !== "quick")
      decision = "downgrade_depth";

    return Promise.resolve({
      output: {
        decision,
        reason: `budget usage ${(input.budgetUsagePct * 100).toFixed(0)}% (stub)`,
        recommendedActions: ["monitor budget", "skip optional stages"],
      },
      tokensUsed: 0,
      costUsd: 0,
    });
  }
}
