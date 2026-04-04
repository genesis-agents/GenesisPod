import { Injectable, Logger } from "@nestjs/common";

// ─── Types ───

export type ReplanTriggerType =
  | "task_failed"
  | "quality_low"
  | "new_information"
  | "budget_exceeded";

export interface ReplanTrigger {
  type: ReplanTriggerType;
  taskId: string;
  details: string;
  /** Quality score if applicable (0-100) */
  qualityScore?: number;
  /** Error message if task failed */
  errorMessage?: string;
}

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  output?: unknown;
  duration?: number;
  tokensUsed?: number;
  qualityScore?: number;
}

export interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  assignee?: string;
  dependencies?: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface MissionExecutionPlan {
  steps: ExecutionStep[];
  totalSteps: number;
  completedSteps: number;
}

export interface ReplanResult {
  /** Whether replanning was performed */
  replanned: boolean;
  /** Steps added to the plan */
  addedSteps: ExecutionStep[];
  /** Step IDs removed from the plan */
  removedSteps: string[];
  /** Steps with modifications */
  modifiedSteps: Array<{ stepId: string; changes: string }>;
  /** Reasoning behind the replanning decision */
  reasoning: string;
}

// ─── Service ───

/**
 * AdaptiveReplannerService
 *
 * Evaluates whether a mission execution plan should be adjusted
 * based on step execution results, quality feedback, or resource constraints.
 *
 * Integrates with ReflectionService (which supports decision: 'pivot')
 * to convert pivot decisions into concrete plan adjustments.
 *
 * This is a rule-based replanner (not LLM-driven) for reliability.
 * Can be extended to use LLM for complex replanning decisions.
 */
@Injectable()
export class AdaptiveReplannerService {
  private readonly logger = new Logger(AdaptiveReplannerService.name);

  /**
   * Determine whether replanning is warranted based on a trigger event.
   *
   * Rules:
   * - task_failed: replan if the step has pending dependents
   * - quality_low: replan if score < 40 (below acceptable threshold)
   * - new_information: always replan (information changes scope)
   * - budget_exceeded: replan to reduce remaining steps
   */
  shouldReplan(
    trigger: ReplanTrigger,
    currentPlan: MissionExecutionPlan,
    _executionHistory: StepExecutionResult[],
  ): boolean {
    const { type, qualityScore } = trigger;

    switch (type) {
      case "task_failed": {
        // Replan if the failed step has downstream dependencies
        const failedStep = currentPlan.steps.find(
          (s) => s.id === trigger.taskId,
        );
        if (!failedStep) return false;

        const hasDependents = currentPlan.steps.some(
          (s) =>
            s.dependencies?.includes(trigger.taskId) && s.status === "pending",
        );
        if (hasDependents) {
          this.logger.log(
            `[shouldReplan] task_failed: ${trigger.taskId} has pending dependents`,
          );
          return true;
        }
        return false;
      }

      case "quality_low": {
        const threshold = 40;
        if (qualityScore !== undefined && qualityScore < threshold) {
          this.logger.log(
            `[shouldReplan] quality_low: score=${qualityScore} < ${threshold}`,
          );
          return true;
        }
        return false;
      }

      case "new_information":
        this.logger.log(`[shouldReplan] new_information: always replan`);
        return true;

      case "budget_exceeded": {
        const pendingSteps = currentPlan.steps.filter(
          (s) => s.status === "pending",
        ).length;
        if (pendingSteps > 1) {
          this.logger.log(
            `[shouldReplan] budget_exceeded: ${pendingSteps} pending steps to reduce`,
          );
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * Generate a replanning result based on the trigger.
   */
  replan(
    trigger: ReplanTrigger,
    currentPlan: MissionExecutionPlan,
    _executionHistory: StepExecutionResult[],
  ): ReplanResult {
    switch (trigger.type) {
      case "task_failed":
        return this.replanForFailure(trigger, currentPlan);
      case "quality_low":
        return this.replanForQuality(trigger, currentPlan);
      case "budget_exceeded":
        return this.replanForBudget(trigger, currentPlan);
      case "new_information":
        return this.replanForNewInfo(trigger, currentPlan);
      default:
        return {
          replanned: false,
          addedSteps: [],
          removedSteps: [],
          modifiedSteps: [],
          reasoning: "Unknown trigger type",
        };
    }
  }

  // ─── Private Strategies ───

  private replanForFailure(
    trigger: ReplanTrigger,
    plan: MissionExecutionPlan,
  ): ReplanResult {
    // Skip dependents of the failed step
    const stepsToSkip = plan.steps
      .filter(
        (s) =>
          s.dependencies?.includes(trigger.taskId) && s.status === "pending",
      )
      .map((s) => s.id);

    // Add a retry step for the failed task
    const retryStep: ExecutionStep = {
      id: `retry-${trigger.taskId}-${Date.now()}`,
      name: `Retry: ${trigger.taskId}`,
      description: `Retry after failure: ${trigger.details}`,
      status: "pending",
      dependencies: [],
    };

    return {
      replanned: true,
      addedSteps: [retryStep],
      removedSteps: stepsToSkip,
      modifiedSteps: [],
      reasoning: `Task ${trigger.taskId} failed. Added retry step, skipped ${stepsToSkip.length} dependent steps.`,
    };
  }

  private replanForQuality(
    trigger: ReplanTrigger,
    _plan: MissionExecutionPlan,
  ): ReplanResult {
    // Add a revision step
    const revisionStep: ExecutionStep = {
      id: `revise-${trigger.taskId}-${Date.now()}`,
      name: `Revise: ${trigger.taskId}`,
      description: `Quality too low (${trigger.qualityScore}/100): ${trigger.details}`,
      status: "pending",
      dependencies: [trigger.taskId],
    };

    return {
      replanned: true,
      addedSteps: [revisionStep],
      removedSteps: [],
      modifiedSteps: [],
      reasoning: `Quality score ${trigger.qualityScore}/100 below threshold. Added revision step.`,
    };
  }

  private replanForBudget(
    _trigger: ReplanTrigger,
    plan: MissionExecutionPlan,
  ): ReplanResult {
    // Skip low-priority pending steps
    const pendingSteps = plan.steps.filter((s) => s.status === "pending");

    // Keep at most 2 pending steps (the most important ones)
    const stepsToSkip =
      pendingSteps.length > 2 ? pendingSteps.slice(2).map((s) => s.id) : [];

    return {
      replanned: stepsToSkip.length > 0,
      addedSteps: [],
      removedSteps: stepsToSkip,
      modifiedSteps: [],
      reasoning: `Budget exceeded. Skipped ${stepsToSkip.length} lower-priority pending steps.`,
    };
  }

  private replanForNewInfo(
    trigger: ReplanTrigger,
    plan: MissionExecutionPlan,
  ): ReplanResult {
    // Mark all pending steps as needing re-evaluation
    const modified = plan.steps
      .filter((s) => s.status === "pending")
      .map((s) => ({
        stepId: s.id,
        changes: `Re-evaluate in light of: ${trigger.details}`,
      }));

    return {
      replanned: modified.length > 0,
      addedSteps: [],
      removedSteps: [],
      modifiedSteps: modified,
      reasoning: `New information received. ${modified.length} pending steps flagged for re-evaluation.`,
    };
  }
}
