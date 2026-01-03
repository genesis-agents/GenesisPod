/**
 * Slides Engine - Orchestrator Module
 *
 * Note: Core orchestration logic has been moved to AI Engine.
 * This module now only contains the API controller.
 */

export * from "./slides.controller";

// Deprecated: Kept for backward compatibility during skill migration
export * from "./multi-model.service";
