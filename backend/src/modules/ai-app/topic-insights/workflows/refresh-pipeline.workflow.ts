/**
 * Refresh Pipeline Workflow Definition
 *
 * DAG workflow that orchestrates the 3-phase TI research pipeline:
 * Phase 1: Parallel search (map over dimensions)
 * Phase 2: Global outline planning
 * Phase 3: Parallel writing (map over dimensions)
 * Phase 4: Quality review
 * Phase 5: Revision of failed dimensions (conditional)
 *
 * This replaces the imperative RefreshPipelineService.researchDimensionsInParallel().
 */

import type { Workflow } from "@/modules/ai-engine/facade";

export const REFRESH_PIPELINE_WORKFLOW: Workflow = {
  id: "ti:refresh-pipeline",
  name: "Topic Insights Refresh Pipeline",
  description:
    "3-phase research pipeline: parallel search → global outline → assemble write inputs → parallel writing → quality review → revision",
  mode: "dag",
  config: {
    enableCheckpoints: true,
    enableTracing: true,
    timeout: 10 * 60 * 1000, // 10 minutes global timeout
  },
  steps: [
    // Phase 1: Parallel dimension search
    {
      id: "parallel-search",
      type: "map",
      executor: "ti:search-phase",
      name: "Parallel Dimension Search",
      description: "Search all dimensions in parallel with concurrency limit",
      input: {
        expression: "state.searchInputs",
      },
      output: { toContext: "searchResults" },
      metadata: { concurrency: 4, onItemError: "skip" },
      onError: { strategy: "skip" },
    },

    // Phase 2: Global outline planning
    {
      id: "global-outline",
      type: "handler",
      executor: "ti:global-outline",
      name: "Global Outline Planning",
      description:
        "Leader analyzes all evidence and coordinates cross-dimension outline",
      dependsOn: ["parallel-search"],
      input: {
        fromContext: {
          topic: "topic",
          dimensionSearchSummaries: "searchResults",
        },
      },
      output: { toContext: "globalOutline" },
      onError: { strategy: "skip" },
    },

    // Phase 2.5: Assemble write inputs from search results + global outline
    {
      id: "assemble-write-inputs",
      type: "handler",
      executor: "ti:assemble-write-inputs",
      name: "Assemble Write Inputs",
      description:
        "Combine per-dimension search results with global outline into DimensionWriteInput[]",
      dependsOn: ["global-outline"],
      input: {
        fromContext: {
          topic: "topic",
          dimensions: "dimensions",
          searchResults: "searchResults",
          reportId: "reportId",
          globalOutline: "globalOutline",
          agentAssignments: "agentAssignments",
        },
      },
      output: { toContext: "writeInputs" },
      onError: { strategy: "skip" },
    },

    // Phase 3: Parallel dimension writing
    {
      id: "parallel-write",
      type: "map",
      executor: "ti:dimension-write",
      name: "Parallel Dimension Writing",
      description:
        "Write each dimension based on search results and global outline",
      dependsOn: ["assemble-write-inputs"],
      input: {
        expression: "state.writeInputs",
      },
      output: { toContext: "writeResults" },
      metadata: { concurrency: 4, onItemError: "skip" },
      onError: { strategy: "skip" },
    },

    // Phase 4: Quality review
    {
      id: "quality-review",
      type: "handler",
      executor: "ti:quality-review",
      name: "Research Quality Review",
      description: "Review overall research quality across all dimensions",
      dependsOn: ["parallel-write"],
      input: {
        fromContext: {
          topic: "topic",
          dimensions: "dimensions",
          analysisResults: "writeResults",
        },
      },
      output: { toContext: "reviewResult" },
      onError: { strategy: "skip" },
    },

    // Phase 5: Revision (conditional — only if there are failed dimensions)
    {
      id: "revision",
      type: "handler",
      executor: "ti:revision",
      name: "Failed Dimension Revision",
      description:
        "Critique-refine loop for dimensions that failed quality review",
      dependsOn: ["quality-review"],
      condition: {
        expression:
          "state.reviewResult && state.reviewResult.dimensionsToReresearch && state.reviewResult.dimensionsToReresearch.length > 0",
      },
      input: {
        fromContext: {
          topic: "topic",
          dimensions: "dimensions",
          analysisResults: "writeResults",
          reviewResult: "reviewResult",
          reportId: "reportId",
        },
      },
      output: { toContext: "revisionResult" },
      onError: { strategy: "skip" },
    },
  ],
};
