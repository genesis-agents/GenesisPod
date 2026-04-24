/**
 * ST-02B-OUTLINE · 每维度章节规划（Leader-driven）
 *
 * 对每个 dimension 调 AG-02-DP (DimensionPlanner spec)，产出
 * DimensionOutline { sections[] with dependsOn DAG }，驱动 ST-03-WRITE
 * 按 Leader 规划的 sections 写作（而非硬编码 "子章节 1/2"）。
 *
 * baseline 对齐：dimension-mission.service.ts + leader-planning.planDimensionOutline
 *   - 每 dim 独立一个 outline
 *   - 研究深度决定 section 数量（thorough ≥ 4, standard ≈ 2-3）
 *   - sections[].dependsOn 组成 DAG（写作阶段按依赖拓扑批量跑）
 *
 * 故意放在 ST-02-RESEARCH 之后（有 evidence 后 outline 会更扎实），
 * 但 ST-03-WRITE 之前（sections 驱动写作）。
 */

import { Injectable, Logger } from "@nestjs/common";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import type { DimensionPlannerInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { DimensionOutline } from "@/modules/ai-app/topic-insights/agents/specs/schemas";
import type { PipelineIdentityContext, Stage, StageResults } from "../types";
import type {
  OutlineStageOutput,
  PlanStageOutput,
  ResearchStageOutput,
} from "./stage-context";

export interface OutlineStageInput {
  readonly plan: PlanStageOutput["plan"];
  readonly research: ResearchStageOutput;
}

@Injectable()
export class OutlineStage implements Stage<
  OutlineStageInput,
  OutlineStageOutput
> {
  readonly id = "ST-02B-OUTLINE" as const;
  readonly name = "Dimension section planning";
  readonly dependsOn = ["ST-02-RESEARCH" as const];
  readonly runsWhen = "always" as const;
  readonly slo = {
    p95Ms: 120_000,
    tokenBudget: 30_000,
    targetSuccessRate: 0.9,
  };
  readonly emitsEvents = [
    "dimension:outline_started",
    "dimension:outline_completed",
  ];

  private readonly logger = new Logger(OutlineStage.name);

  constructor(private readonly agentRegistry: SpecAgentRegistry) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    upstream: StageResults,
  ): Promise<OutlineStageInput> {
    return {
      plan: upstream.get<PlanStageOutput>("ST-01-PLAN").plan,
      research: upstream.get<ResearchStageOutput>("ST-02-RESEARCH"),
    };
  }

  async execute(
    identity: PipelineIdentityContext,
    input: OutlineStageInput,
    signal: AbortSignal,
  ): Promise<OutlineStageOutput> {
    const runner = this.agentRegistry.get<
      DimensionPlannerInput,
      DimensionOutline
    >("AG-02-DP");
    if (!runner) {
      this.logger.warn(
        `[${identity.missionId}] AG-02-DP not registered — skipping dimension outlining`,
      );
      return { outlinesByDimension: {} };
    }

    const researchDepth = identity.depth;
    const allDimensions = input.plan.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
    }));

    const outlinesByDimension: Record<string, DimensionOutline> = {};

    for (const dim of input.plan.dimensions) {
      if (signal.aborted) {
        throw new DOMException(`[${this.id}] aborted`, "AbortError");
      }

      const res = await runner.executeSpec(
        {
          dimensionId: dim.id,
          dimensionName: dim.name,
          dimensionDescription: dim.description,
          allDimensions,
          researchDepth,
        },
        identity.capabilities?.env,
      );

      if (res.state !== "completed") {
        // ★ 单 dim outline 失败不影响整体 — ST-03-WRITE 会 fallback 到
        //   硬编码 "子章节 1/2" 保持可用性
        this.logger.warn(
          `[${identity.missionId}] AG-02-DP failed for dim=${dim.id}: ${res.errors?.join("; ") ?? "unknown"} — skipping outline`,
        );
        continue;
      }
      outlinesByDimension[dim.id] = res.output;
    }

    this.logger.log(
      `[${identity.missionId}] Outlined ${Object.keys(outlinesByDimension).length}/${input.plan.dimensions.length} dimensions`,
    );

    return { outlinesByDimension };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: OutlineStageOutput,
  ): Promise<void> {
    // outline 暂不落 DB — section 结果会在 st-13-persist 统一落 TopicReportSection
  }
}
