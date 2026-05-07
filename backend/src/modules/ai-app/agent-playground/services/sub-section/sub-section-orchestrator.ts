// PR-13 wire v1.6 § 13.3 — chapter-writer multi-call orchestrator
//
// 职责：
//   1. 决定路径（subSectionsPerCh === 1 走单 LLM call 兼容路径；≥ 2 走 multi-call 拼接）
//   2. 调 SubSectionPlannerService 规划章内大纲
//   3. 顺序执行 N 个 sub-section LLM call（不并行 — 后一个需读前一个末尾衔接）
//   4. 每 sub-section 入口 atomic budget tryDeduct（PR13-S2/S4）
//   5. previousContext sanitize（PR13-S1 防 indirect injection）
//   6. assembleChapter 拼接 + 写 sub_section_count / sub_section_structure
//   7. emit chapter:sub-section-completed × N（LivenessGuard 看见活迹）

import { countCJKWords } from "@/common/utils/word-count";
import { sanitizeLlmOutput } from "@/common/utils/llm-content-sanitizer";
import {
  SubSectionPlannerService,
  type SubSection,
  type SubSectionPlannerInput,
} from "./sub-section-planner.service";
import type { BudgetGuardService } from "../budget/budget-guard.service";
import type { ScalePreset } from "../../scale-presets";

const PREVIOUS_CONTEXT_MAX_LEN = 500;

export type SubSectionOrchestratorInput = {
  missionId: string;
  userId: string;
  scalePreset: ScalePreset;
  chapterDraft: {
    chapterIndex: number;
    dimension: string;
    heading: string;
    thesis: string;
    targetWordCount: number;
  };
};

export type AssembledChapter = {
  /** 拼接后的全章内容 */
  content: string;
  /** backend 真值（D2 派生 — 各 sub-section wordCount 累加） */
  wordCount: number;
  /** 实际产生的 sub-section 数（v1.6 RV-13.1 必等 scale.subSectionsPerCh） */
  subSectionCount: number;
  /** 写入 chapters 表 sub_section_structure JSONB 列的内容 */
  subSectionStructure: Array<{
    index: number;
    heading: string;
    thesis: string;
    targetWordCount: number;
    actualWordCount: number;
    positionInChapter: SubSection["positionInChapter"];
  }>;
  /** 完成模式 */
  completionMode: "complete" | "partial-budget";
  budgetExhausted: boolean;
};

/** sub-section LLM call invoker（caller 注入；本 util 不直调 LLM 保单元可测） */
export type SubSectionLlmCall = (args: {
  missionId: string;
  userId: string;
  chapterHeading: string;
  chapterThesis: string;
  subSection: SubSection;
  previousContext: string | null;
  maxTokens: number;
}) => Promise<{ content: string }>;

/** emit 函数（caller 注入） */
export type EmitSubSectionEvent = (args: {
  type: string;
  missionId: string;
  userId: string;
  chapterIndex: number;
  subSectionIndex: number;
  subSectionTotal: number;
  wordCount?: number;
}) => Promise<void>;

/**
 * 章内 sub-section LLM call 主路径（v1.6 PR-13 § 13.3）。
 *
 * 关键不变量：
 *   - 顺序写（不并行）— 每 sub-section 入口接前一末尾 500 字 sanitize 后传入 prompt
 *   - 每 sub-section 入口 atomic tryDeduct → budget 不足 fail-soft 拼当前已写部分
 *   - LLM 失败抛 → 不 refund（cost 已付，retry 由总 budget 自然限）
 *   - assembleChapter wordCount = sum(subSectionWordCounts)（D2 真值，不信任 LLM 报）
 *   - emit chapter:sub-section-completed × N（business 前缀，被 LivenessGuard 当活迹）
 */
export async function orchestrateSubSectionWriting(args: {
  input: SubSectionOrchestratorInput;
  planner: SubSectionPlannerService;
  budgetGuard: BudgetGuardService;
  llmCall: SubSectionLlmCall;
  emit: EmitSubSectionEvent;
  /** 由 caller 跑 LLM 调 planner（s7-5 stage 已跑过；这里接收输出） */
  plannerOutput: { subSections: Partial<SubSection>[] };
}): Promise<AssembledChapter> {
  const { input, planner, budgetGuard, llmCall, emit, plannerOutput } = args;
  const preset = input.scalePreset;

  // 1. validate planner output（v1.6 RV-13.1 / 13.2 / 13.6 硬约束）
  const plannerInput: SubSectionPlannerInput = {
    missionId: input.missionId,
    userId: input.userId,
    chapterDraft: input.chapterDraft,
    subSectionsPerCh: preset.subSectionsPerCh ?? 1,
    wordsPerSubSection: preset.wordsPerSubSection ?? [4_000, 5_000],
  };
  const plan = planner.plan(plannerInput, plannerOutput);

  // 2. 顺序写 sub-section（不并行）
  const written: Array<{
    subSection: SubSection;
    content: string;
    wordCount: number;
  }> = [];

  const writerCost = preset.stageRetryCost["s8-writer-draft-report"] ?? 0;

  for (const subSection of plan.subSections) {
    // 2a. atomic budget check + deduct（PR13-S2 / S4 v1.6）
    const budget = budgetGuard.tryDeduct(input.missionId, writerCost);
    if (!budget.success) {
      // budget 耗尽 → 拼当前已写部分 + 标 partial-budget
      return assembleChapter(written, "partial-budget", true);
    }

    // 2b. previousContext sanitize（PR13-S1 防 indirect injection）
    const previousContext =
      written.length > 0
        ? sanitizeLlmOutput(
            written[written.length - 1].content.slice(
              -PREVIOUS_CONTEXT_MAX_LEN,
            ),
            PREVIOUS_CONTEXT_MAX_LEN,
          )
        : null;

    // 2c. LLM 调用（失败抛 — 不 refund，cost 已付，PR13-S4）
    const result = await llmCall({
      missionId: input.missionId,
      userId: input.userId,
      chapterHeading: input.chapterDraft.heading,
      chapterThesis: input.chapterDraft.thesis,
      subSection,
      previousContext,
      maxTokens: preset.maxTokenPerCh,
    });

    const cleanedContent = result.content;
    const subWordCount = countCJKWords(cleanedContent);

    written.push({
      subSection,
      content: cleanedContent,
      wordCount: subWordCount,
    });

    // 2d. emit business event（被 LivenessGuard 当活迹 — 防 mission 卡 #11 复发）
    await emit({
      type: "chapter:sub-section-completed",
      missionId: input.missionId,
      userId: input.userId,
      chapterIndex: input.chapterDraft.chapterIndex,
      subSectionIndex: subSection.index,
      subSectionTotal: plan.subSections.length,
      wordCount: subWordCount,
    });
  }

  return assembleChapter(written, "complete", false);
}

/** 拼接 sub-section → AssembledChapter；wordCount 累加 D2 真值不信 LLM */
function assembleChapter(
  written: Array<{
    subSection: SubSection;
    content: string;
    wordCount: number;
  }>,
  completionMode: AssembledChapter["completionMode"],
  budgetExhausted: boolean,
): AssembledChapter {
  const content = written.map((w) => w.content).join("\n\n");
  const wordCount = written.reduce((s, w) => s + w.wordCount, 0);
  return {
    content,
    wordCount,
    subSectionCount: written.length,
    subSectionStructure: written.map((w) => ({
      index: w.subSection.index,
      heading: w.subSection.heading,
      thesis: w.subSection.thesis,
      targetWordCount: w.subSection.targetWordCount,
      actualWordCount: w.wordCount,
      positionInChapter: w.subSection.positionInChapter,
    })),
    completionMode,
    budgetExhausted,
  };
}
