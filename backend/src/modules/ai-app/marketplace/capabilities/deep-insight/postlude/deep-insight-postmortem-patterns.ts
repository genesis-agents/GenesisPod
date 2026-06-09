/**
 * deep-insight 能力专属 postmortem patterns
 *
 * 注入到 harness PostmortemClassifierService（PostmortemPatterns caller-inject 设计）。
 * 含 deep-insight 业务概念：能力内核的 stage 事件类型 substring，与 playground 私有
 * PLAYGROUND_POSTMORTEM_PATTERNS 完全独立。
 *
 * 铁律（R1）：本文件零 app import，只依赖 harness facade 类型。
 */
import type { PostmortemPatterns } from "@/modules/ai-harness/facade";

export const DEEP_INSIGHT_POSTMORTEM_PATTERNS: PostmortemPatterns = {
  userCancel: ["user-cancel"],
  toolTruncation: {
    substrings: ["tool:truncated"],
    threshold: 5,
  },
  llmTimeout: {
    substrings: ["llm:timeout", "timeout"],
    threshold: 3,
  },
  schemaReject: {
    substrings: ["validation:failed", "schema_reject"],
    threshold: 3,
  },
  reviewerLoop: {
    // deep-insight 业务概念：researcher 重试 / writer 重写卡死
    substrings: ["revision:stuck", "researcher:retry"],
    threshold: 5,
  },
};
