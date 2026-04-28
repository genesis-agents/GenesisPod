/**
 * Report Template - Shared Report Formatting Standards
 *
 * Shared across all AI App modules (Topic Insights, Research, Writing, etc.).
 * Contains 13 content type rules enforced via:
 *   L1 Prompt constants → L2 Post-processing pipeline → L3 Frontend rendering
 *
 * Usage: import { getWritingStandards, splitEnumerationToList } from "@/modules/ai-app/contracts/report-template";
 */
export * from "./constants/report-writing-standards";
export * from "./pipeline/report-formatting.utils";
export * from "./pipeline/formatting-pipeline";
