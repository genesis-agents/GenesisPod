/**
 * Golden sample test runner — 共享类型
 *
 * Runner 产出的 JudgeReport 聚合每个 tag 的结构对比 + 可选 LLM judge 分数，
 * 方便 CI 对比 harness 落地前后的行为差异。
 */

export interface BaselineFixture {
  baselineTag: string;
  missionId: string;
  topicId: string;
  topicName: string;
  llmCalls: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  dbSnapshot: {
    missionId: string;
    topicId: string;
    status: string;
    report: Record<string, unknown> | null;
    dimensions: Array<Record<string, unknown>>;
    evidenceCount: number;
  };
  metrics: {
    llmCallCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    totalChatLatencyMs: number;
    eventCount: number;
  };
  finalReportMd: string;
}

/** 新 pipeline 产物（和 baseline 同 schema，方便 diff） */
export type CandidateFixture = BaselineFixture;

export interface StructureDiff {
  /** 'warn' = 偏离容忍范围但可接受；'fail' = 违反硬约束 */
  severity: "ok" | "warn" | "fail";
  field: string;
  baseline: unknown;
  candidate: unknown;
  message: string;
}

/** 10 维报告质量评分（对应 08-test-strategy.md 的 rubric） */
export interface QualityRubric {
  contentCompleteness: number;
  analysisDepth: number;
  evidenceUse: number;
  logicCoherence: number;
  wordCount: number;
  planAlignment: number;
  writingQuality: number;
  figuresUse: number;
  sectionTransitions: number;
  independentAnalysis: number;
}

export interface JudgeResult {
  enabled: boolean;
  /** Judge 3 次取中位数的原始分（disabled 时为 undefined） */
  rawRuns?: QualityRubric[];
  median?: QualityRubric;
  /** median 各维度总和（满分 100） */
  totalScore?: number;
  skippedReason?: string;
}

export interface TagResult {
  baselineTag: string;
  structureDiffs: StructureDiff[];
  /** fail 数为 0 视为 PASS */
  passed: boolean;
  judge: JudgeResult;
  /** 新 pipeline 是否实际跑了（false = stub 模式） */
  harnessExecuted: boolean;
  candidate?: CandidateFixture;
}

export interface GoldenReport {
  runAt: string;
  mode: "self-test" | "harness";
  totalTags: number;
  passed: number;
  failed: number;
  warnedOnly: number;
  tagResults: TagResult[];
}

export interface RunnerOptions {
  fixturesDir: string;
  outDir: string;
  /** 'self-test'：candidate = baseline 自比，验证 runner 逻辑；
   * 'harness'：调用真 pipeline（TODO：harness 落地前 candidate=baseline） */
  mode: "self-test" | "harness";
  /** 只跑特定 tag（glob 支持） */
  only?: string[];
  /** 是否启用 LLM judge（默认否，需 env GOLDEN_JUDGE_ENABLED=1） */
  judgeEnabled: boolean;
}
