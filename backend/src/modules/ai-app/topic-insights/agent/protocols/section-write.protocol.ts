/**
 * SectionWriteProtocol — 单个 section 的写作协议
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * maxIter=20（单章节无需深挖 80 轮）；
 * 允许工具：rag_search / evidence_lookup / figure_select / markdown_validator
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

const SECTION_WRITE_SYSTEM_PROMPT = `你是一位专业研究写作员，正在撰写单个 section。

使命：基于已有 evidence，写出 600-900 字的 markdown section，包含：
  - 核心判断（> **核心判断**：... 开头的 blockquote）
  - 详细论证段落 2-4 段
  - 关键证据引用 [n] 标记
  - keyFindings 3-5 条

ReAct 工作法：
1. 先调 evidence_lookup 获取本 section 的证据
2. 思考论证结构
3. 调 rag_search 补充上下文（可选）
4. 调 markdown_validator 校验格式
5. 完成后 [DONE]

禁忌：
- 不低于 500 字
- 不超过 1200 字
- 不虚构 evidence 引用
- 不写英文段落（除非 language=en）
`;

export interface SectionWriteResult {
  readonly sectionId: string;
  readonly content: string;
  readonly wordCount: number;
  readonly keyFindings: readonly {
    statement: string;
    evidenceRefs: string[];
  }[];
  readonly citationCount: number;
}

export function createSectionWriteProtocol(
  judges: ReadonlyArray<JudgeSpec<SectionWriteResult>> = [],
): TaskExecutionProtocol<SectionWriteResult, ResearchTaskMetadata> {
  const budgetCap: TokenBudget = { maxTokens: 30_000, maxCostUsd: 0.2 };
  return {
    taskType: "section_write",
    maxIterations: 20,
    convergenceThreshold: 80,
    budgetCap,
    allowedTools: [
      "rag_search",
      "evidence_lookup",
      "figure_select",
      "markdown_validator",
    ],
    judges,

    // eslint-disable-next-line @typescript-eslint/require-await
    async buildInitialMessages(task): Promise<Message[]> {
      return [
        { role: "system", content: SECTION_WRITE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Section 任务: ${task.title}`,
            `描述: ${task.description}`,
            `关联维度: ${task.metadata.dimensionName ?? "(独立)"}`,
            "",
            "请按 ReAct 循环：先 evidence_lookup 拉证据，再写作，再 markdown_validator 校验。",
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
    ): Promise<SectionWriteResult> {
      // 从 history 中抽出 final assistant message（content 就是 markdown）
      const lastThought = [...history.observations]
        .reverse()
        .find((o) => o.source === "initial" || typeof o.data === "string");
      const content =
        typeof lastThought?.data === "string"
          ? lastThought.data
          : `（Phase 3 占位 · Phase 5 接入 markdown 抽取）section ${task.title} 已完成 ${history.stepCount} 步`;
      const citationMatches = content.match(/\[\d+\]/g) ?? [];
      return {
        sectionId: task.id,
        content,
        wordCount: content.length,
        keyFindings: [],
        citationCount: citationMatches.length,
      };
    },
  };
}
