/**
 * Writing Task Executor Interface
 *
 * Defines the contract for all writing task executors.
 * Each executor handles a specific WritingMissionType.
 *
 * Pattern follows Topic Insights' ITaskExecutor:
 * - executorMap in WritingMissionExecutionService routes by taskType
 * - Each executor is an @Injectable() NestJS provider
 * - Context carries all needed state; result is standardized
 */

import type {
  WritingMissionType,
  WritingMissionInput,
} from "../mission/writing-mission.service";

/**
 * Context passed to every task executor
 */
export interface WritingTaskContext {
  /** Unique mission ID */
  missionId: string;
  /** Original user input */
  input: WritingMissionInput;
  /** Resolved model ID for content generation */
  modelId: string;
  /** Project metadata */
  project: {
    id: string;
    name: string;
    description: string | null;
    targetWords: number;
  };
  /** Existing content state (for continuation mode) */
  existingContent?: ExistingContentState;
  /** AI Kernel process ID (for trace correlation) */
  kernelProcessId?: string;
  /** Role-model assignments for multi-agent coordination */
  roleModelAssignments?: RoleModelAssignment[];
}

/**
 * Existing content state for continuation scenarios
 */
export interface ExistingContentState {
  hasContent: boolean;
  currentWords: number;
  totalChapters: number;
  writtenChapters: number;
  unwrittenChapters: Array<{
    id: string;
    chapterNumber: number;
    title: string;
    volumeId: string;
  }>;
  storyBible: {
    worldType?: string;
    theme?: string;
    premise?: string;
    characters?: Array<{
      name: string;
      role?: string;
      background?: string;
      personality?: string;
    }>;
  } | null;
  projectDescription: string | null;
}

/**
 * Role-model assignment result
 */
export interface RoleModelAssignment {
  roleId: string;
  modelId: string;
  isActive: boolean;
}

/**
 * Standardized result from any task executor
 */
export interface WritingTaskResult {
  /** Generated content (null if executor handles persistence internally) */
  content: string | null;
  /** Total word count of generated content */
  wordCount: number;
  /** Whether the execution service should persist content (false if executor already did) */
  shouldPersist: boolean;
  /** Quality metrics from quality pipeline */
  qualityMetrics?: QualityMetrics;
  /** Story Bible updates to apply after execution */
  bibleUpdates?: BibleUpdate[];
  /** Human-readable summary of what was done */
  summary: string;
}

/**
 * Quality metrics attached to generated content
 */
export interface QualityMetrics {
  overall: number;
  wordCount: number;
  coherence: number;
  completeness: number;
  consistency: number;
}

/**
 * Story Bible update instruction
 */
export interface BibleUpdate {
  type: "character_state" | "timeline_event" | "new_fact";
  data: Record<string, unknown>;
}

/**
 * Core executor interface - all task executors implement this
 */
export interface IWritingTaskExecutor {
  /** The mission type this executor handles */
  readonly taskType: WritingMissionType;
  /** Execute the writing task */
  execute(context: WritingTaskContext): Promise<WritingTaskResult>;
}
