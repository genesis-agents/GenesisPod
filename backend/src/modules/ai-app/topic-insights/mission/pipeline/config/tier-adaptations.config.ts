/**
 * Tier Adaptations · 模型能力层级自适应配置
 *
 * Restored from Apr 21 baseline (`config/prompt-adaptation.config.ts`).
 * 每个 ModelTier 对应一组 prompt 修饰 + 证据截断 + taskProfile 覆盖，
 * 让弱模型也能产出结构化内容，让强模型释放分析深度。
 *
 * 消费方：ST-03-WRITE (SectionWriter)。未来可拓展到 ST-04-REVIEW /
 * ST-07-POLISH 等写入向 stage。
 */

import type { TaskProfile } from "@/modules/ai-engine/facade";
import { ModelTier } from "@/modules/ai-engine/facade";

export interface TierAdaptation {
  /** 追加到 userPrompt 末尾的额外指令（空字符串=不修改基线 prompt） */
  readonly promptSuffix: string;
  /** 最大证据条目数（0 = 不限制） */
  readonly maxEvidenceItems: number;
  /** 覆盖的 taskProfile 片段 */
  readonly taskProfile: Pick<TaskProfile, "creativity" | "outputLength">;
  /**
   * ★ baseline section-writer.service.ts L196/L307/L492：
   * 每个 section 的目标字数。STRONG 模型允许更长，BASIC 模型缩紧；
   * MIN_CONTENT_LENGTH_RATIO * targetWords 作为下限供 quality gate 校验。
   */
  readonly targetWordsPerSection: number;
}

export const TIER_ADAPTATIONS: Readonly<Record<ModelTier, TierAdaptation>> = {
  [ModelTier.STRONG]: {
    promptSuffix: [
      "",
      "【高级分析模式】",
      "- 鼓励跨来源综合推理，揭示不同数据源之间的关联和矛盾",
      "- 可以做出大胆但有证据支撑的预测和趋势判断",
      "- 注重洞察的原创性：避免仅重复来源观点，要提出独立分析",
      "- 对数据背后的因果关系进行深层解读",
    ].join("\n"),
    maxEvidenceItems: 0,
    taskProfile: { creativity: "medium", outputLength: "long" },
    targetWordsPerSection: 900,
  },

  [ModelTier.STANDARD]: {
    promptSuffix: "",
    maxEvidenceItems: 0,
    taskProfile: { creativity: "medium", outputLength: "long" },
    targetWordsPerSection: 700,
  },

  [ModelTier.BASIC]: {
    promptSuffix: [
      "",
      "【结构化写作模式】",
      "- 严格按要点顺序逐一展开，每段只阐述一个核心观点",
      "- 每段末尾用一句话小结该段要点",
      "- 优先引用直接相关的证据，避免过度推理",
      "- 使用清晰的过渡句连接段落",
      "- 确保每个论点都有明确的证据支撑",
    ].join("\n"),
    maxEvidenceItems: 8,
    taskProfile: { creativity: "low", outputLength: "long" },
    targetWordsPerSection: 500,
  },
};
