/**
 * SubSectionPlannerAgent —— 章内 sub-section 大纲规划（PR-13 v1.6 § 13.2）
 *
 * 接收 chapter heading + thesis + targetWordCount + subSectionsPerCh + wordsPerSubSection，
 * 产出 N 个 sub-section（每章 deep=3 / professional=4）的大纲。
 * 仅在 deep / professional scale（subSectionsPerCh ≥ 2）启用。
 *
 * 配套：services/sub-section/sub-section-planner.service.ts validatePlannerOutput 校验输出。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "@/modules/ai-harness/facade";
import { sanitizeUserDerivedField } from "@/common/utils/llm-content-sanitizer";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  chapter: z.object({
    chapterIndex: z.number().int(),
    heading: z.string(),
    thesis: z.string(),
    targetWordCount: z.number().int().min(2_000).max(50_000),
  }),
  subSectionsPerCh: z.number().int().min(2).max(8),
  wordsPerSubSection: z.tuple([z.number().int(), z.number().int()]),
});

const SubSectionSchema = z.object({
  index: z.number().int().min(1),
  heading: z.string(),
  thesis: z.string(),
  targetWordCount: z.number().int(),
});

const Output = z.object({
  subSections: z.array(SubSectionSchema).min(2).max(8),
});

@DefineAgent({
  id: "playground.sub-section-planner",
  identity: {
    role: "sub-section-planner",
    description:
      "Plan N sub-sections inside one chapter (deep / professional scale)",
  },
  loop: "reflexion",
  // 规划任务用低 creativity 高确定性 + 短输出
  taskProfile: {
    creativity: "low",
    outputLength: "short",
    taskKind: "summarize",
  },
  inputSchema: Input,
  outputSchema: Output,
  // budget 小（仅规划，不写正文）
  budget: { maxTokens: 4_000, maxIterations: 2 },
})
export class SubSectionPlannerAgent extends AgentSpec<
  typeof Input,
  typeof Output
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    const N = input.subSectionsPerCh;
    const targetTotal = input.chapter.targetWordCount;
    const perSub = Math.round(targetTotal / N);
    const [minSub, maxSub] = input.wordsPerSubSection;

    // PR13-S3 sanitize 用户 / LLM 上游内容
    const safeHeading = sanitizeUserDerivedField(input.chapter.heading, 200);
    const safeThesis = sanitizeUserDerivedField(input.chapter.thesis, 500);

    return [
      `You are a sub-section planner for chapter "${safeHeading}" of dimension "${input.dimension}".`,
      `Language: ${input.language}.`,
      ``,
      `## 任务`,
      `为本章节设计 ${N} 个 sub-section 的章内大纲，让每个 sub-section 独立可读但合起来支撑章核心命题。`,
      ``,
      `## 章节信息`,
      `- 章标题: ${safeHeading}`,
      `- 章核心命题: ${safeThesis}`,
      `- 章总目标字数: ${targetTotal}`,
      `- sub-section 数量: ${N}`,
      `- 每 sub-section 目标字数: ≈ ${perSub}（区间 [${minSub}, ${maxSub}]）`,
      ``,
      `## 硬约束（必须满足）`,
      `1. 输出 sub-section 数量必须 = ${N}`,
      `2. ∑ sub-section[i].targetWordCount 必须 ∈ [${Math.round(targetTotal * 0.95)}, ${Math.round(targetTotal * 1.05)}]（±5% 容差）`,
      `3. 每 sub-section.targetWordCount 必须 ∈ [${Math.round(minSub * 0.5)}, ${Math.round(maxSub * 1.5)}]（区间 ±50%）`,
      `4. 第 1 个 sub-section 做章节开场，引出后续论证脉络`,
      `5. 中间 sub-section 必须前后衔接（开头承接前一节，结尾铺垫下一节）`,
      `6. 最后一个 sub-section 必须收束章节，呼应章核心命题`,
      ``,
      `## 输出 JSON shape (字段名必须完全匹配)`,
      `{`,
      `  "subSections": [`,
      `    {`,
      `      "index": 1,`,
      `      "heading": "<sub-section 标题，具体不空泛>",`,
      `      "thesis": "<1-2 句论点>",`,
      `      "targetWordCount": ${perSub}`,
      `    }`,
      `    // 共 ${N} 个`,
      `  ]`,
      `}`,
    ].join("\n");
  }
}
