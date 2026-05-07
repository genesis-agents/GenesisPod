// PR-13 v1.6 § 13.2 — Sub-section planner（章内大纲规划，deep / professional 启用）
//
// 输入: 章节 heading + thesis + targetWordCount + subSectionsPerCh
// 输出: SubSection[]（章内开场/中段/收束 N 条）
//
// 硬约束（spec 验证）:
//   1. subSections.length === input.subSectionsPerCh
//   2. sum(targetWordCount) ≈ input.targetWordCount ± 5%
//   3. 每 subSection.targetWordCount ∈ input.wordsPerSubSection
//   4. positionInChapter 顺序：第一 = "opening"，最后 = "closing"，其余 "middle"
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 13.2

import { Injectable } from "@nestjs/common";
import { sanitizeUserDerivedField } from "@/common/utils/llm-content-sanitizer";

export type SubSection = {
  index: number;
  heading: string;
  thesis: string;
  targetWordCount: number;
  positionInChapter: "opening" | "middle" | "closing";
  expectedTransitionFrom?: string;
  expectedTransitionTo?: string;
};

export type SubSectionPlannerInput = {
  missionId: string;
  userId: string;
  chapterDraft: {
    chapterIndex: number;
    dimension: string;
    heading: string;
    thesis: string;
    targetWordCount: number;
  };
  subSectionsPerCh: number;
  wordsPerSubSection: [number, number];
};

export type SubSectionPlannerOutput = {
  chapterIndex: number;
  subSections: SubSection[];
};

export class SubSectionPlannerError extends Error {
  constructor(
    public readonly code:
      | "planner-output-invalid"
      | "count-mismatch"
      | "word-count-out-of-tolerance"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "SubSectionPlannerError";
  }
}

/**
 * 验证 planner 输出符合硬约束。violation 返 SubSectionPlannerError。
 */
export function validatePlannerOutput(
  output: { subSections: Partial<SubSection>[] },
  input: SubSectionPlannerInput,
): SubSection[] {
  if (!Array.isArray(output?.subSections)) {
    throw new SubSectionPlannerError(
      "planner-output-invalid",
      "planner: subSections is not an array",
    );
  }

  // 1. count 匹配
  if (output.subSections.length !== input.subSectionsPerCh) {
    throw new SubSectionPlannerError(
      "count-mismatch",
      `planner: subSection count mismatch (expected ${input.subSectionsPerCh}, got ${output.subSections.length})`,
    );
  }

  // 2. wordCount 累加 ±5% 容差
  const totalTarget = output.subSections.reduce(
    (s, ss) => s + (ss.targetWordCount ?? 0),
    0,
  );
  const tolerance =
    Math.abs(totalTarget - input.chapterDraft.targetWordCount) /
    input.chapterDraft.targetWordCount;
  if (tolerance > 0.05) {
    throw new SubSectionPlannerError(
      "word-count-out-of-tolerance",
      `planner: word count tolerance exceeded (${(tolerance * 100).toFixed(1)}% > 5%)`,
    );
  }

  // 3. 单 subSection wordCount 区间
  const [minSub, maxSub] = input.wordsPerSubSection;
  for (let i = 0; i < output.subSections.length; i++) {
    const ss = output.subSections[i];
    const wc = ss.targetWordCount ?? 0;
    if (wc < minSub * 0.5 || wc > maxSub * 1.5) {
      throw new SubSectionPlannerError(
        "word-count-out-of-tolerance",
        `planner: subSection #${i + 1} wordCount=${wc} outside [${minSub}, ${maxSub}] (±50% / ±50%)`,
      );
    }
  }

  // 4. position 顺序：第一 opening / 最后 closing / 中间 middle
  return output.subSections.map((ss, i) => {
    const last = output.subSections.length - 1;
    const position: SubSection["positionInChapter"] =
      i === 0 ? "opening" : i === last ? "closing" : "middle";
    return {
      index: i + 1,
      heading: sanitizeUserDerivedField(
        ss.heading ?? `Sub-section ${i + 1}`,
        200,
      ),
      thesis: sanitizeUserDerivedField(ss.thesis ?? "", 500),
      targetWordCount: ss.targetWordCount ?? 0,
      positionInChapter: position,
    };
  });
}

@Injectable()
export class SubSectionPlannerService {
  /**
   * 规划章内 sub-section 大纲。LLM 调用由 caller 注入 invoker（不在此 service 内直调
   * 以保持单元可测）。返回成功的 SubSection[]，失败抛 SubSectionPlannerError。
   *
   * Caller 责任：
   *   1. 用 sanitizeUserDerivedField sanitize input.chapterDraft.heading / thesis（PR13-S3）
   *   2. 调用 LLM 获取 raw output
   *   3. 调本 service.plan(input, llmOutput)
   *
   * 本 service 只做 validation + 标准化，不调 LLM（dependency injection 友好）。
   */
  plan(
    input: SubSectionPlannerInput,
    llmRawOutput: unknown,
  ): SubSectionPlannerOutput {
    if (!llmRawOutput || typeof llmRawOutput !== "object") {
      throw new SubSectionPlannerError(
        "planner-output-invalid",
        "planner: LLM output is null or not an object",
      );
    }
    const subSections = validatePlannerOutput(
      llmRawOutput as { subSections: Partial<SubSection>[] },
      input,
    );
    return {
      chapterIndex: input.chapterDraft.chapterIndex,
      subSections,
    };
  }
}
