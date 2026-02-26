/**
 * Content Analysis Types - Re-export from AI Engine Facade
 *
 * Migrated to AI Engine for cross-module reuse.
 * This file re-exports for backward compatibility.
 */
// ★ Named re-exports from facade (NOT export * to avoid leaking 330+ unrelated symbols)
export {
  ContentComplexity,
  ContentCategory,
  DataDensity,
  TemporalDimension,
  HierarchyType,
} from "../../../ai-engine/facade";
export type {
  ContentFeatures,
  ExtractedEntity,
  VisualizationOpportunity,
  ContentAnalysisInput,
  ContentAnalysisResult,
  SuggestedStructure,
  ParagraphFeatures,
  SectionFeatures,
  DocumentAnalysisResult,
  MECEValidation,
  SegmentationStrategy,
  ContentSegment,
} from "../../../ai-engine/facade";
