/**
 * Zod schemas for 6 Core Tier agents
 *
 * 对齐 09-data-contracts.md。
 * 不对外 export 到模块外；Stage 消费 schema 必须通过 AgentRegistry.get 拿到 runner 再读 outputSchema。
 */

import { z } from "zod";

// =========== AG-01-LD · Leader ===========

export const LeaderDimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  purpose: z.string().min(1),
  searchQueries: z.array(z.string()).min(1),
  dataSources: z.array(z.string()).min(1),
  priority: z.number().int().min(1).max(10),
});

/**
 * AgentAssignment schema — 对齐 baseline `types/leader.types.ts:L38-L56`。
 *
 * `agentType` 为粗粒度三分类（3 种），后处理按 agentType 分支；
 * `role` 为细粒度 specialist role（9 种，含 devil_advocate/domain_expert 等），
 * 不用 enum 是因为 baseline 允许 Leader 产出任意角色名，下游 prompt 按 role 注入人设。
 * `assignedDimensions` 是 per-dim 绑定真相 — seedResearchTasks 按此分配。
 */
export const AgentAssignmentSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().optional(),
  agentType: z.enum([
    "dimension_researcher",
    "quality_reviewer",
    "report_writer",
  ]),
  assignedDimensions: z.array(z.string()).optional(),
  role: z.string().min(1),
  /**
   * 模型 ID。允许空字符串作为 fallback（按 CLAUDE.md：空字符串由下游
   * TaskProfile 自动解析；禁止硬编码 "gpt-4" 等具体模型名）。
   */
  modelId: z.string().optional(),
  skills: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  assignmentReason: z
    .object({
      agentReason: z.string().optional(),
      modelReason: z.string().optional(),
    })
    .optional(),
});

/**
 * TaskUnderstanding — baseline `types/leader.types.ts:L10-L16` 原样。
 * Leader 规划前先对任务做结构化理解。
 */
export const TaskUnderstandingSchema = z.object({
  topic: z.string().min(1),
  scope: z.string().min(1),
  objectives: z.array(z.string()).min(1),
  constraints: z.array(z.string()).optional(),
});

/**
 * ExecutionStrategy — baseline `types/leader.types.ts:L19-L24` 原样（object 形）。
 * 与 HEAD 原 enum 形态不同；mission/control/execution.service 已用 object 形。
 */
export const ExecutionStrategySchema = z.object({
  parallelism: z.number().int().positive(),
  priorityOrder: z.array(z.string()),
  estimatedTime: z.string().optional(),
});

export const LeaderPlanSchema = z.object({
  missionId: z.string().min(1),
  taskUnderstanding: TaskUnderstandingSchema,
  dimensions: z.array(LeaderDimensionSchema).min(3).max(8),
  agentAssignments: z.array(AgentAssignmentSchema).min(3),
  executionStrategy: ExecutionStrategySchema,
  /** Leader 自评的复杂度（0-10） */
  complexityScore: z.number().min(0).max(10),
  reasoning: z.string().min(10),
});

export type AgentAssignment = z.infer<typeof AgentAssignmentSchema>;
export type TaskUnderstanding = z.infer<typeof TaskUnderstandingSchema>;
export type ExecutionStrategy = z.infer<typeof ExecutionStrategySchema>;
export type LeaderPlan = z.infer<typeof LeaderPlanSchema>;

// =========== AG-03-SW · SectionWriter ===========

export const SectionKeyFindingSchema = z.object({
  statement: z.string().min(10),
  evidenceRefs: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

export const SectionResultSchema = z.object({
  sectionId: z.string().min(1),
  dimensionId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(50),
  wordCount: z.number().int().nonnegative(),
  keyFindings: z.array(SectionKeyFindingSchema).min(1),
  citationCount: z.number().int().nonnegative(),
  evidenceIdsUsed: z.array(z.string()),
});

export type SectionResult = z.infer<typeof SectionResultSchema>;

// =========== AG-04-SR · SectionReviewer ===========

export const SectionReviewScoresSchema = z.object({
  accuracy: z.number().min(0).max(10),
  completeness: z.number().min(0).max(10),
  coherence: z.number().min(0).max(10),
  evidenceQuality: z.number().min(0).max(10),
  depth: z.number().min(0).max(10),
});

export const SectionReviewSchema = z.object({
  sectionId: z.string().min(1),
  overallScore: z.number().min(0).max(10),
  scores: SectionReviewScoresSchema,
  needsRevision: z.boolean(),
  revisionInstructions: z.array(z.string()),
  issues: z.array(z.string()),
  claims: z.array(
    z.object({
      id: z.string().min(1),
      statement: z.string().min(10),
      evidenceRefs: z.array(z.string()),
    }),
  ),
});

export type SectionReview = z.infer<typeof SectionReviewSchema>;

// =========== AG-05-ME · MetaExtractor ===========

export const DimensionMetaSchema = z.object({
  dimensionId: z.string().min(1),
  dimensionName: z.string().min(1),
  summary: z.string().min(30),
  keyFindings: z.array(z.string()).min(1),
  trends: z.array(z.string()),
  challenges: z.array(z.string()),
  opportunities: z.array(z.string()),
  evidenceCount: z.number().int().nonnegative(),
});

export type DimensionMeta = z.infer<typeof DimensionMetaSchema>;

// =========== AG-06-QR · QualityReviewer ===========

/** Discriminated union by scope */
export const QualityReviewDimensionSchema = z.object({
  scope: z.literal("dimension"),
  dimensionId: z.string().min(1),
  overallScore: z.number().min(0).max(10),
  issues: z.array(z.string()),
  recommendations: z.array(z.string()),
  needsReresearch: z.boolean(),
});

export const QualityReviewOverallSchema = z.object({
  scope: z.literal("overall"),
  missionId: z.string().min(1),
  overallScore: z.number().min(0).max(10),
  crossDimensionIssues: z.array(z.string()),
  recommendations: z.array(z.string()),
  needsReresearch: z.boolean(),
  dimensionsToReresearch: z.array(z.string()),
});

export const QualityReviewSchema = z.discriminatedUnion("scope", [
  QualityReviewDimensionSchema,
  QualityReviewOverallSchema,
]);

export type QualityReview = z.infer<typeof QualityReviewSchema>;

// =========== AG-11-SY · Synthesizer ===========

export const RiskItemSchema = z.object({
  level: z.enum(["high", "medium", "low"]),
  description: z.string().min(10),
  relatedDimensions: z.array(z.string()),
});

export const RecommendationSchema = z.object({
  priority: z.enum(["P0", "P1", "P2"]),
  action: z.string().min(10),
  rationale: z.string().min(10),
  relatedDimensions: z.array(z.string()).min(1),
});

// =========== AG-02-DP · DimensionPlanner ===========

export const SectionPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  targetWords: z.number().int().positive(),
  keyPoints: z.array(z.string()).min(1),
  dependsOn: z.array(z.string()),
});

export const DimensionOutlineSchema = z.object({
  dimensionId: z.string().min(1),
  dimensionName: z.string().min(1),
  sections: z.array(SectionPlanSchema).min(1).max(8),
});

export type DimensionOutline = z.infer<typeof DimensionOutlineSchema>;
export type SectionPlan = z.infer<typeof SectionPlanSchema>;

// =========== AG-07-FC · FactChecker ===========

export const FactIssueSchema = z.object({
  claimId: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string().min(10),
  suggestedFix: z.string().optional(),
});

export const FactCheckReportSchema = z.object({
  missionId: z.string().min(1),
  accuracyScore: z.number().min(0).max(10),
  totalClaims: z.number().int().nonnegative(),
  issuesByClaim: z.array(FactIssueSchema),
  overallAssessment: z.string().min(10),
});

export type FactCheckReport = z.infer<typeof FactCheckReportSchema>;

// =========== AG-08-GS · GapSearcher ===========

export const KnowledgeGapSchema = z.object({
  id: z.string().min(1),
  dimensionId: z.string().min(1),
  gapStatement: z.string().min(10),
  suggestedQueries: z.array(z.string()).min(1),
  priority: z.number().min(0).max(10),
});

export const GapSearcherResultSchema = z.object({
  dimensionId: z.string().min(1),
  gaps: z.array(KnowledgeGapSchema),
});

export type KnowledgeGap = z.infer<typeof KnowledgeGapSchema>;
export type GapSearcherResult = z.infer<typeof GapSearcherResultSchema>;

// =========== AG-09-HV · HypothesisVerifier ===========

export const HypothesisSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(10),
  verdict: z.enum(["verified", "refuted", "inconclusive"]),
  supportingEvidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10),
});

export const HypothesisVerifierResultSchema = z.object({
  hypotheses: z.array(HypothesisSchema),
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type HypothesisVerifierResult = z.infer<
  typeof HypothesisVerifierResultSchema
>;

// =========== AG-10-FX · FactExtractor ===========

export const ExtractedFactSchema = z.object({
  id: z.string().min(1),
  dimensionId: z.string().min(1),
  statement: z.string().min(5),
  evidenceIds: z.array(z.string()),
  category: z.enum(["trend", "data_point", "insight", "risk"]),
});

export const FactExtractorResultSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;
export type FactExtractorResult = z.infer<typeof FactExtractorResultSchema>;

// =========== AG-12-SREM · SectionRemediator ===========

export const RemediatedSectionSchema = z.object({
  sectionId: z.string().min(1),
  newContent: z.string().min(50),
  wordCount: z.number().int().nonnegative(),
  resolvedIssues: z.array(z.string()),
});

export type RemediatedSection = z.infer<typeof RemediatedSectionSchema>;

// =========== AG-13-RE · ReportEvaluator (LLM judge) ===========

export const ReportEvalRubricSchema = z.object({
  contentCompleteness: z.number().min(0).max(10),
  analysisDepth: z.number().min(0).max(10),
  evidenceUse: z.number().min(0).max(10),
  logicCoherence: z.number().min(0).max(10),
  wordCount: z.number().min(0).max(10),
  planAlignment: z.number().min(0).max(10),
  writingQuality: z.number().min(0).max(10),
  figuresUse: z.number().min(0).max(10),
  sectionTransitions: z.number().min(0).max(10),
  independentAnalysis: z.number().min(0).max(10),
});

export const ReportEvalResultSchema = z.object({
  rubric: ReportEvalRubricSchema,
  totalScore: z.number().min(0).max(100),
  verdict: z.enum(["excellent", "good", "acceptable", "poor"]),
  reasoning: z.string().min(10),
});

export type ReportEvalResult = z.infer<typeof ReportEvalResultSchema>;

// =========== AG-14-LX · LatexRepair ===========

export const LatexRepairResultSchema = z.object({
  repairedMarkdown: z.string().min(50),
  issuesFixed: z.array(z.string()),
});

export type LatexRepairResult = z.infer<typeof LatexRepairResultSchema>;

// =========== AG-16-MA · MissionAdjuster ===========

export const MissionAdjustmentSchema = z.object({
  decision: z.enum(["continue", "extend_budget", "downgrade_depth", "abort"]),
  reason: z.string().min(10),
  recommendedActions: z.array(z.string()),
});

export type MissionAdjustment = z.infer<typeof MissionAdjustmentSchema>;

// =========== AG-17-LDP · LeaderDispatcher ===========

export const LeaderDispatchDecisionSchema = z.object({
  intent: z.enum([
    "new_research",
    "refine_report",
    "answer_followup",
    "restart_mission",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5),
});

export type LeaderDispatchDecision = z.infer<
  typeof LeaderDispatchDecisionSchema
>;

// =========== AG-18-LI · LeaderIntent (F2) ===========

export const LeaderIntentDecisionSchema = z.object({
  decisionType: z.enum([
    "DIRECT_ANSWER",
    "CREATE_TODO",
    "CLARIFY",
    "ACKNOWLEDGE",
  ]),
  understanding: z.string().min(5),
  response: z.string().nullable(),
  todoCandidate: z
    .object({
      title: z.string().min(2).max(200),
      description: z.string().min(5),
      priority: z.enum(["low", "medium", "high"]),
    })
    .nullable(),
  clarifyQuestion: z.string().nullable(),
  clarifyOptions: z.array(z.string()).nullable(),
});

export type LeaderIntentDecision = z.infer<typeof LeaderIntentDecisionSchema>;

// =========== AG-19-LAS · LeaderAgenticSearcher (F6.3) ===========

export const LeaderAgenticSearchResultSchema = z.object({
  missionId: z.string().min(1),
  dimensionId: z.string().min(1),
  suggestedQueries: z.array(z.string().min(2)).min(1),
  shortlistSummaries: z
    .array(
      z.object({
        title: z.string().min(2),
        url: z.string().min(4),
        rationale: z.string().min(10),
      }),
    )
    .min(0),
  nextIteration: z.enum(["stop", "refine", "expand"]),
  reasoning: z.string().min(10),
});

export type LeaderAgenticSearchResult = z.infer<
  typeof LeaderAgenticSearchResultSchema
>;

// =========== AG-15-RED · ReportEditor ===========

export const EditedReportSchema = z.object({
  fullMarkdown: z.string().min(100),
  editsApplied: z.array(z.string()),
  wordCount: z.number().int().nonnegative(),
});

export type EditedReport = z.infer<typeof EditedReportSchema>;

// =========== AG-11-SY · Synthesizer ===========

export const SynthesisResultSchema = z.object({
  missionId: z.string().min(1),
  executiveSummary: z.string().min(100).max(4000),
  preface: z.string().min(50),
  fullMarkdown: z.string().min(500),
  highlights: z
    .array(
      z.object({
        type: z.literal("KEY_FINDING"),
        text: z.string().min(10),
      }),
    )
    .min(3),
  crossDimensionAnalysis: z.string().min(50),
  riskMatrix: z.array(RiskItemSchema).min(1),
  recommendations: z.array(RecommendationSchema).min(1),
});

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;
