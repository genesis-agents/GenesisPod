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

export const AgentAssignmentSchema = z.object({
  role: z.enum([
    "dimension_researcher",
    "section_writer",
    "quality_reviewer",
    "report_writer",
  ]),
  /**
   * 模型 ID。允许空字符串作为 fallback（按 CLAUDE.md：空字符串由下游
   * TaskProfile 自动解析；禁止硬编码 "gpt-4" 等具体模型名）。
   */
  modelId: z.string(),
  skills: z.array(z.string()).optional(),
});

export const LeaderPlanSchema = z.object({
  missionId: z.string().min(1),
  dimensions: z.array(LeaderDimensionSchema).min(3).max(8),
  agentAssignments: z.array(AgentAssignmentSchema).min(3),
  executionStrategy: z.enum(["sequential", "parallel", "hybrid"]),
  /** Leader 自评的复杂度（0-10） */
  complexityScore: z.number().min(0).max(10),
  reasoning: z.string().min(10),
});

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
