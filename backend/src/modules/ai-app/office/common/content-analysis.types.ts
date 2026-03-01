/**
 * Content Analysis Types - Re-export from content-analysis module
 *
 * Phase 3: Moved from ai-engine/content/analysis/ to ai-app/office/content-analysis/
 * This file re-exports for backward compatibility within office/common/.
 */
export {
  ContentComplexity,
  ContentCategory,
  DataDensity,
  TemporalDimension,
  HierarchyType,
} from "../content-analysis/content-analysis.types";
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
} from "../content-analysis/content-analysis.types";
