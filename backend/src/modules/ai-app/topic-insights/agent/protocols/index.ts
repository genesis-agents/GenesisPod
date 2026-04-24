/**
 * topic-insights agent protocols barrel
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 * 业务特定（含业务 prompt / 业务 tool 白名单），不沉淀到 harness。
 */

export { ProtocolRegistry } from "./protocol-registry";

export {
  createDimensionResearchProtocol,
  type DimensionResearchResult,
} from "./dimension-research.protocol";

export {
  createSectionWriteProtocol,
  type SectionWriteResult,
} from "./section-write.protocol";

export {
  createQualityReviewProtocol,
  type QualityReviewResult,
} from "./quality-review.protocol";

export {
  createReportSynthesisProtocol,
  type ReportSynthesisResult,
} from "./report-synthesis.protocol";

export {
  createFactCheckProtocol,
  type FactCheckResult,
} from "./fact-check.protocol";

export {
  parseActionFromLLM,
  buildStandardInitialMessage,
} from "./base-protocol";
