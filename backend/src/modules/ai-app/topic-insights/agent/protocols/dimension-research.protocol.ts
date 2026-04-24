/**
 * DimensionResearchProtocol — 单个 dimension 的深度研究协议
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * maxIter=80 对齐 baseline 每 dim 30-80 step 水平。
 * 允许工具：web_search / academic_search / scraper / rag_search / evidence_persist /
 *          figure_extract / memory_lookup
 */

import { Logger } from "@nestjs/common";
import type {
  TaskExecutionProtocol,
  TokenBudget,
  Message,
  JudgeSpec,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";
import { parseActionFromLLM } from "./base-protocol";

const DIMENSION_RESEARCH_SYSTEM_PROMPT = `你是一位资深研究员，正在对指定维度做深度研究。

使命：收集 ≥10 条来源不同、时效新鲜、可信度高的证据，提炼 3-8 条 keyFindings，
识别 2-5 条 trends / challenges / opportunities。

ReAct 工作法：
1. 观察：分析当前已收集到的证据 / 上轮 tool 返回
2. 思考：下一步该做什么？缺哪方面信息？
3. 规划：选择最合适的工具（web_search / academic_search / scraper / rag_search / ...）
4. 行动：调用工具收集
5. 反思：新证据是否解答了疑问？是否有矛盾？
6. 自评：研究深度是否达标？如果达标输出 [DONE]

禁忌：
- 不要引用未见过的来源
- 不要超过 80 轮（硬上限）
- 不要重复同一查询 > 3 次
- 不要虚构数据
`;

export interface DimensionResearchResult {
  readonly dimensionId: string;
  readonly summary: string;
  readonly keyFindings: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly trends: readonly string[];
  readonly challenges: readonly string[];
  readonly opportunities: readonly string[];
  readonly confidenceLevel: "high" | "medium" | "low";
}

export function createDimensionResearchProtocol(
  judges: ReadonlyArray<JudgeSpec<DimensionResearchResult>> = [],
): TaskExecutionProtocol<DimensionResearchResult, ResearchTaskMetadata> {
  const logger = new Logger("DimensionResearchProtocol");
  const budgetCap: TokenBudget = { maxTokens: 80_000, maxCostUsd: 0.5 };

  return {
    taskType: "dimension_research",
    maxIterations: 80,
    convergenceThreshold: 85, // 0-100
    budgetCap,
    allowedTools: [
      "web_search",
      "academic_search",
      "scraper",
      "rag_search",
      "evidence_persist",
      "figure_extract",
      "memory_lookup",
    ],
    judges,

    // eslint-disable-next-line @typescript-eslint/require-await
    async buildInitialMessages(task): Promise<Message[]> {
      const dim = task.metadata.dimensionName ?? task.title;
      return [
        { role: "system", content: DIMENSION_RESEARCH_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `研究维度: ${dim}`,
            `维度 id: ${task.metadata.dimensionId ?? "unknown"}`,
            `描述: ${task.description}`,
            task.metadata.skills && task.metadata.skills.length > 0
              ? `分配技能: ${task.metadata.skills.join(", ")}`
              : "",
            task.metadata.tools && task.metadata.tools.length > 0
              ? `分配工具: ${task.metadata.tools.join(", ")}`
              : "",
            "",
            "请用 ReAct 循环深度研究此维度。目标产出：",
            "  - summary（200-500 字）",
            "  - keyFindings（3-8 条）",
            "  - trends / challenges / opportunities 各 2-5 条",
            "  - 每条 finding 对应 ≥1 个 evidence_id（通过 evidence_persist 工具落库）",
            "",
            "完成后输出 [DONE]。",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];
    },

    parseAction: parseActionFromLLM,

    // eslint-disable-next-line @typescript-eslint/require-await
    async assembleResult(task, history): Promise<DimensionResearchResult> {
      // 从 history 中提取：
      //   evidence_ids ← toolInvocations[tool=evidence_persist].result.data.evidenceIds
      //   summary / keyFindings ← 最后一条 THINK 的内容解析
      const evidenceIds: string[] = [];
      for (const inv of history.toolInvocations) {
        if (inv.tool === "evidence_persist" && inv.result.success) {
          const data = inv.result.data as
            | { evidenceIds?: string[] }
            | undefined;
          if (Array.isArray(data?.evidenceIds))
            evidenceIds.push(...data.evidenceIds);
        }
      }

      const confidence: "high" | "medium" | "low" =
        evidenceIds.length >= 10
          ? "high"
          : evidenceIds.length >= 5
            ? "medium"
            : "low";

      logger.log(
        `[assembleResult] dim=${task.metadata.dimensionId ?? task.id} evidence=${evidenceIds.length} steps=${history.stepCount}`,
      );

      // TODO Phase 5: 从 scratchpad / last-thought 解析 summary/keyFindings/trends/...
      // 当前阶段先产出最小可用结构，Phase 5 接入真实 LLM-extractor
      return {
        dimensionId: task.metadata.dimensionId ?? task.id,
        summary: `（Phase 3 占位 · Phase 5 接入 LLM 抽取器）维度 ${task.metadata.dimensionName ?? task.title} 研究完成，共采集 ${evidenceIds.length} 条证据，执行 ${history.stepCount} 步。`,
        keyFindings: history.scratchpad.keyFindings.slice(0, 8),
        evidenceIds,
        trends: [],
        challenges: [],
        opportunities: [],
        confidenceLevel: confidence,
      };
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async selfEvaluate(_task, history): Promise<number> {
      // dimension 研究的 self-eval：基于 evidence 数 + tool 多样性 + step 数
      const evidenceCount = history.toolInvocations.filter(
        (i) => i.tool === "evidence_persist" && i.result.success,
      ).length;
      const toolDiversity = new Set(history.toolInvocations.map((i) => i.tool))
        .size;

      let score = 0;
      score += Math.min(40, evidenceCount * 4); // 10 条 evidence = 40 分
      score += Math.min(20, toolDiversity * 5); // 用 4+ 种 tool = 20 分
      score += Math.min(25, history.stepCount * 0.8); // 30+ step = 25 分
      score += Math.min(15, history.observations.length * 0.5); // 30 obs = 15 分
      return score;
    },
  };
}
