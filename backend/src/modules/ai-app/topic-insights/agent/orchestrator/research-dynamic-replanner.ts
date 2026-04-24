/**
 * ResearchDynamicReplanner — topic-insights Leader 动态 replan 策略
 *
 * 归属：L3 ai-app/topic-insights/agent/orchestrator/
 * 实现 L2 harness DynamicReplanner<ResearchTaskMetadata> 接口。
 *
 * 每当 mission 内一个 task COMPLETED 时触发，Leader 根据观察：
 *   - 是否需要 spawn 新维度研究（keyFindings 发现 gap）
 *   - 是否需要 merge 相似 dimension（duplicate)
 *   - 是否需要 add_judge（低分任务加强审核）
 *   - 是否 extend_budget
 *   - 默认 no_op
 *
 * Phase 5 第一版：启发式规则；Phase 6+ 升级为 LLM-驱动 leader reflection。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  DynamicReplanner,
  ReplanDecision,
  ReplanObservations,
  ReplanOperation,
  AgentTask,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";

@Injectable()
export class ResearchDynamicReplanner implements DynamicReplanner<ResearchTaskMetadata> {
  private readonly logger = new Logger(ResearchDynamicReplanner.name);

  async onTaskCompleted(
    completedTask: AgentTask<ResearchTaskMetadata>,
    observations: ReplanObservations<ResearchTaskMetadata>,
  ): Promise<ReplanDecision<ResearchTaskMetadata>> {
    const ops: ReplanOperation<ResearchTaskMetadata>[] = [];
    const { completedTasks, failedTasks, runningTasks } = observations;

    // 启发式 1：若失败任务 ≥ 2，extend_budget 给所有 running 任务
    if (failedTasks.length >= 2) {
      for (const running of runningTasks) {
        ops.push({
          kind: "extend_budget",
          taskId: running.id,
          extraTokens: 10_000,
        });
      }
    }

    // 启发式 2：若 dimension_research 完成率 < 50%，给剩余 running 维度研究加 external judge
    const dimResearchCompleted = completedTasks.filter(
      (t) => t.type === "dimension_research",
    ).length;
    const dimResearchRunning = runningTasks.filter(
      (t) => t.type === "dimension_research",
    );
    if (
      completedTasks.length > 0 &&
      dimResearchCompleted /
        (dimResearchCompleted + dimResearchRunning.length) <
        0.5
    ) {
      for (const t of dimResearchRunning) {
        ops.push({
          kind: "add_judge",
          taskId: t.id,
          judgeId: "external-judge-standard",
        });
      }
    }

    const rationale =
      ops.length > 0
        ? `auto-replan: ${ops.length} ops (completed=${completedTasks.length}, failed=${failedTasks.length}, running=${runningTasks.length})`
        : "no-op: mission on track";

    this.logger.debug(
      `[replan] task=${completedTask.id} type=${completedTask.type} → ${rationale}`,
    );

    return {
      operations: ops.length > 0 ? ops : [{ kind: "no_op" }],
      rationale,
    };
  }
}
