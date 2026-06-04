/**
 * SelfDrivenMissionPlannerService — harness-level mission planner.
 *
 * Placement: harness/teams/orchestrator (ADR-009).
 * Produces the extended MissionExecutionPlan (roleAssignments / rubric /
 * deliverableType / loopKind per step).
 *
 * Internal chain:
 *   1. engine StepDecompositionService  → role-agnostic step skeleton (loopKind included)
 *   2. harness RubricGeneratorService   → LLM acceptance rubric (passLine clamped [60,90])
 *   3. per-role model election          → modelId from AiChatService.getAvailableModelsAsync()
 *   4. cost + duration estimation       → summed from step estimatedDurationMs
 *
 * LLM call pattern (rubric step) mirrors JudgeService:
 *   - injected AiChatService, TaskProfile, no hard-coded model names/temperatures
 *   - fallback modelId = "" (resolved downstream by AiChatService via TaskProfile)
 *
 * Prompt-cache safety (reverse-insights #3/#7):
 *   - system prompts in RubricGeneratorService are static (no timestamps/random ids)
 *   - dynamic content (prompt, deliverableType) goes into user-role messages only
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { StepDecompositionService } from "../../../../ai-engine/planning/decomposition/step-decomposition.service";
import { RubricGeneratorService } from "../../../evaluation/rubric/rubric-generator.service";
import { AiChatService } from "../../../../ai-engine/llm/chat/ai-chat.service";
import type {
  ISelfDrivenMissionPlanner,
  SelfDrivenPlannerInput,
} from "../abstractions/self-driven-mission-planner.interface";
import type {
  ExecutionStep,
  MissionExecutionPlan,
  RoleAssignment,
} from "../orchestrator.interface";
import type { RawExecutionStep } from "../../../../ai-engine/planning/decomposition/abstractions/step-decomposition.interface";
import type { ParsedIntent } from "../../../agents/abstractions/mission.types";

// ---------------------------------------------------------------------------
// Role-to-modelType mapping for per-role election (P1 lite).
// Leader / critic roles get the stronger CHAT model; parallel workers default
// to CHAT (CHAT_FAST wiring arrives in P2 with full ScoredRouter election).
// ---------------------------------------------------------------------------

/** Known role ids the planner recognises for slot extraction. */
const KNOWN_ROLES = [
  "researcher",
  "analyst",
  "writer",
  "critic",
  "leader",
  "domain-expert",
  "reviewer",
  "integrator",
] as const;

type KnownRole = (typeof KNOWN_ROLES)[number];

/** How many unique roles the planner may assign per plan (safety cap). */
const MAX_ROLES = 5;

/** Fallback single role when LLM decomposition yields no useful role hints. */
const FALLBACK_ROLE: KnownRole = "researcher";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer a role from a RawExecutionStep's type/name/description.
 * Rule: delivery → writer; review → reviewer; integration → integrator;
 * task → researcher (default parallel worker role).
 */
function inferRole(step: RawExecutionStep, index: number): KnownRole {
  if (step.type === "delivery") return "writer";
  if (step.type === "review") return "reviewer";
  if (step.type === "integration") return "integrator";
  // "task" steps: use index 0 as analyst (planning / scoping), rest as researcher
  return index === 0 ? "analyst" : "researcher";
}

/**
 * Estimate a flat USD cost proxy from step duration.
 * Very rough heuristic: 1 s ≈ $0.0001 (token budget at $1/1M tokens × ~100 tok/s).
 * The planner is intentionally imprecise here; a real billing projection is P2.
 */
function estimateCostFromDuration(durationMs: number): number {
  return Math.round((durationMs / 1000) * 0.0001 * 100_000) / 100_000;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SelfDrivenMissionPlannerService implements ISelfDrivenMissionPlanner {
  private readonly logger = new Logger(SelfDrivenMissionPlannerService.name);

  constructor(
    private readonly decomposition: StepDecompositionService,
    private readonly rubricGenerator: RubricGeneratorService,
    private readonly chat: AiChatService,
  ) {}

  /**
   * Plan a self-driven mission.
   *
   * @param input  Clarified user request + userId for BYOK key resolution.
   * @returns      Extended MissionExecutionPlan (roleAssignments / rubric /
   *               deliverableType / loopKind per step all populated).
   */
  async plan(input: SelfDrivenPlannerInput): Promise<MissionExecutionPlan> {
    const planId = uuidv4();
    const missionId = uuidv4();

    this.logger.log(
      `[SelfDrivenPlanner] planning mission ${missionId} for user ${input.userId}: "${input.prompt.slice(0, 60)}..."`,
    );

    // ── Step 1: role-agnostic step decomposition (engine primitive) ──────────
    const rawSteps = await this.decomposeSteps(input);

    // ── Step 2: LLM rubric generation (harness/evaluation) ──────────────────
    const rubric = await this.generateRubric(input);

    // ── Step 3: per-role model election (lite, P1) ───────────────────────────
    const roleAssignments = await this.electRoles(rawSteps, input.userId);

    // ── Step 4: assemble ExecutionStep[] (with loopKind + dependencies) ──────
    const stepIds = rawSteps.map(() => uuidv4());
    const steps: ExecutionStep[] = rawSteps.map((raw, i) =>
      this.assembleStep(raw, i, stepIds, roleAssignments),
    );

    // ── Step 5: aggregate timing + cost estimates ─────────────────────────────
    const estimatedDuration = steps.reduce(
      (sum, s) => sum + s.estimatedDuration,
      0,
    );
    const estimatedCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0);

    const parsedIntent: ParsedIntent = {
      id: uuidv4(),
      missionId,
      primaryGoal: input.prompt,
      secondaryGoals: [],
      extractedInfo: {
        topics: [],
        entities: [],
      },
      taskType: "mixed",
      complexity: {
        overall: "medium",
        informational: "medium",
        logical: "medium",
        creative: "low",
        estimatedSubTasks: steps.length,
        estimatedDuration: estimatedDuration,
        estimatedCost: estimatedCost,
      },
      suggestedStrategy: {
        workflowType: steps.some((s) => s.loopKind === "leader-worker")
          ? "parallel"
          : "sequential",
        memberConfig: roleAssignments.map((ra) => ({
          roleId: ra.roleId,
          count: 1,
          modelSuggestion: ra.modelId,
          reason: "elected by SelfDrivenMissionPlanner",
        })),
        needsIteration: false,
        needsHumanReview: false,
        riskFactors: [],
      },
      confidence: 0.8,
    };

    const plan: MissionExecutionPlan = {
      id: planId,
      missionId,
      parsedIntent,
      steps,
      estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
      estimatedDuration,
      createdAt: new Date(),
      roleAssignments,
      rubric,
      deliverableType: "report",
    };

    this.logger.log(
      `[SelfDrivenPlanner] plan ${planId}: ${steps.length} steps, ` +
        `${roleAssignments.length} roles, duration≈${estimatedDuration}ms, cost≈$${plan.estimatedCost}`,
    );

    return plan;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async decomposeSteps(
    input: SelfDrivenPlannerInput,
  ): Promise<RawExecutionStep[]> {
    try {
      const result = await this.decomposition.decompose({
        goal: input.prompt,
        context: input.context,
      });
      this.logger.debug(
        `[SelfDrivenPlanner] decomposed → ${result.steps.length} raw steps`,
      );
      return result.steps;
    } catch (err) {
      this.logger.warn(
        `[SelfDrivenPlanner] decomposition failed, using single-step fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [
        {
          id: "0",
          name: "Execute",
          description: input.prompt,
          type: "task",
          loopKind: "react",
          dependencyIndices: [],
          estimatedDurationMs: 120_000,
        },
      ];
    }
  }

  private async generateRubric(
    input: SelfDrivenPlannerInput,
  ): Promise<Array<{ dimension: string; weight: number; passLine: number }>> {
    try {
      const dims = await this.rubricGenerator.generate({
        prompt: input.prompt,
        deliverableType: "report",
        userId: input.userId,
        signal: input.signal,
      });
      return dims;
    } catch (err) {
      this.logger.warn(
        `[SelfDrivenPlanner] rubric generation failed, using defaults: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Sensible defaults (passLine already within [60,90] range).
      return [
        { dimension: "accuracy", weight: 0.35, passLine: 75 },
        { dimension: "completeness", weight: 0.3, passLine: 70 },
        { dimension: "clarity", weight: 0.2, passLine: 65 },
        { dimension: "actionability", weight: 0.15, passLine: 65 },
      ];
    }
  }

  /**
   * Lite per-role election (P1).
   *
   * Derives unique roles from the step skeleton, then resolves a modelId for
   * each role from the list of available models returned by AiChatService.
   * The first available model is used for all roles (uniform assignment).
   * Full ScoredRouter election with per-role modelType routing lands in P2.
   */
  private async electRoles(
    rawSteps: RawExecutionStep[],
    userId: string,
  ): Promise<RoleAssignment[]> {
    // Derive up to MAX_ROLES unique roles from the step skeleton.
    const roleSet = new Set<string>();
    rawSteps.forEach((step, i) => {
      if (roleSet.size >= MAX_ROLES) return;
      roleSet.add(inferRole(step, i));
    });
    if (roleSet.size === 0) roleSet.add(FALLBACK_ROLE);

    // Resolve available model ids (returns [] on error — AiChatService logs internally).
    // userId is passed for observability; AiChatService resolves via RequestContext internally.
    let availableModels: string[] = [];
    try {
      availableModels = await this.chat.getAvailableModelsAsync();
    } catch (err) {
      this.logger.warn(
        `[SelfDrivenPlanner] getAvailableModelsAsync failed for user ${userId}, modelId will be "": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // Fallback: "" lets AiChatService resolve via TaskProfile downstream.
    const primaryModel = availableModels[0] ?? "";

    const assignments: RoleAssignment[] = [];
    for (const roleId of roleSet) {
      assignments.push({ roleId, modelId: primaryModel });
    }

    this.logger.debug(
      `[SelfDrivenPlanner] elected ${assignments.length} roles → modelId="${primaryModel}"`,
    );
    return assignments;
  }

  private assembleStep(
    raw: RawExecutionStep,
    index: number,
    stepIds: string[],
    roleAssignments: RoleAssignment[],
  ): ExecutionStep {
    // Resolve dependency IDs from 0-based indices.
    const dependencies = raw.dependencyIndices
      .filter((di) => di >= 0 && di < stepIds.length)
      .map((di) => stepIds[di]);

    // Pick executor: infer role then resolve to its assigned modelId.
    const roleId = inferRole(raw, index);
    const assignment = roleAssignments.find((a) => a.roleId === roleId);
    const executor = assignment?.roleId ?? roleId;

    return {
      id: stepIds[index],
      name: raw.name,
      description: raw.description,
      executor,
      type: raw.type,
      loopKind: raw.loopKind,
      dependencies,
      estimatedDuration: raw.estimatedDurationMs,
      estimatedCost: estimateCostFromDuration(raw.estimatedDurationMs),
    };
  }
}
