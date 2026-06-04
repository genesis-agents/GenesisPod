/**
 * AI Harness — DynamicTeamBuilder
 *
 * Converts planner-produced RoleAssignments into a live ITeam by:
 *   1. Validating every roleId against RoleInventory (safety-10).
 *   2. Assembling a minimal TeamConfig with role-declared coreTools (safety-05).
 *   3. Delegating instantiation to TeamFactory.createFromConfig().
 *
 * Design: docs/architecture/ai-harness/self-driven-team/
 *   self-driven-agent-team-design-2026-06-04.md §5.3 / §9
 *
 * MECE: one DynamicTeamBuilder per project
 *   (capability-singleton.spec.ts, modules/ai-harness/teams/dynamic-team/).
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  IRoleInventory,
  ROLE_INVENTORY,
} from "../abstractions/role-inventory.interface";
import { ROLE_INVENTORY_IDS } from "../role-inventory/role-inventory";
import type {
  ITeam,
  TeamConfig,
  MemberRoleConfig,
} from "../abstractions/team.interface";
import type { RoleAssignment } from "../orchestrator/orchestrator.interface";
import { TeamFactory } from "../factory/team-factory";
import { getDefaultConstraintProfile } from "../profile/mission-execution-profile";
import type { WorkflowConfig } from "../abstractions/workflow.interface";

// ==================== Error ====================

/**
 * Thrown when a roleId in a RoleAssignment is not present in RoleInventory.
 * Enforces safety-10: LLM-generated free-form role ids are not permitted.
 */
export class AgentAccessDeniedError extends Error {
  constructor(roleId: string) {
    super(
      `AgentAccessDeniedError: roleId "${roleId}" is not registered in ` +
        `RoleInventory. LLM-generated free-form role ids are not permitted ` +
        `(safety-10). Add the role to RoleInventory or correct the planner output.`,
    );
    this.name = "AgentAccessDeniedError";
  }
}

// ==================== DynamicTeamBuilder ====================

/**
 * DynamicTeamBuilder — assembles a live ITeam from planner-produced
 * RoleAssignments.
 *
 * Injection:
 *   - IRoleInventory via ROLE_INVENTORY token (provided by SelfDrivenTeamModule).
 *   - TeamFactory — globally available via @Global HarnessApiModule → TeamsModule.
 */
@Injectable()
export class DynamicTeamBuilder {
  private readonly logger = new Logger(DynamicTeamBuilder.name);

  constructor(
    @Inject(ROLE_INVENTORY) private readonly roleInventory: IRoleInventory,
    private readonly teamFactory: TeamFactory,
  ) {}

  /**
   * Build a live ITeam from planner-produced role assignments.
   *
   * @param missionId   Caller-generated mission id for team namespacing.
   * @param assignments Role+model pairs produced by SelfDrivenMissionPlanner.
   *
   * @throws AgentAccessDeniedError if any roleId is absent from RoleInventory.
   * @throws Error if assignments is empty.
   */
  build(missionId: string, assignments: RoleAssignment[]): ITeam {
    if (assignments.length === 0) {
      throw new Error(
        `DynamicTeamBuilder: assignments must not be empty (mission="${missionId}").`,
      );
    }

    // safety-10: validate ALL roleIds against inventory before any instantiation.
    for (const { roleId } of assignments) {
      if (!this.roleInventory.has(roleId)) {
        throw new AgentAccessDeniedError(roleId);
      }
    }

    // Derive leaderRoleId: first assignment that maps to a LEADER prototype,
    // falling back to the first assignment.
    const leaderRoleId = this.pickLeaderRoleId(assignments);

    // Member role configs — one slot per assignment (leader role included;
    // TeamFactory creates the leader member separately from leaderRoleId).
    const memberRoles: MemberRoleConfig[] = assignments.map(({ roleId }) => ({
      roleId,
      minCount: 1,
      maxCount: 1,
      required: true,
    }));

    // Build a minimal sequential WorkflowConfig (TeamFactory requires >= 1 step).
    const workflow = this.buildWorkflow(missionId, assignments);

    // Collect the union of coreTools declared by each assigned role (safety-05).
    const availableTools = this.collectCoreTools(assignments);

    const teamId = `dynamic-team-${missionId}`;

    const config: TeamConfig = {
      id: teamId,
      name: `Self-Driven Team (${missionId})`,
      description: `Dynamically assembled team for mission ${missionId}.`,
      type: "custom",
      leaderRoleId,
      memberRoles,
      workflow,
      availableSkills: [],
      availableTools,
      constraintProfile: getDefaultConstraintProfile(),
      deliverableTypes: ["report"],
    };

    this.logger.log(
      `[DynamicTeamBuilder] mission=${missionId} leaderRole=${leaderRoleId} ` +
        `members=${assignments.length} tools=[${availableTools.join(", ")}]`,
    );

    try {
      return this.teamFactory.createFromConfig(config, {
        defaultModel: this.pickDefaultModel(assignments),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[DynamicTeamBuilder] TeamFactory failed for mission=${missionId}: ${message}`,
      );
      throw err;
    }
  }

  // ── private helpers ────────────────────────────────────────────────────────

  /**
   * Elect the leader role: prefer the LEADER prototype if present in assignments,
   * otherwise use the first assignment. This is deterministic and independent
   * of LLM output ordering (safety-10).
   */
  private pickLeaderRoleId(assignments: RoleAssignment[]): string {
    const leaderEntry = assignments.find(
      (a) => a.roleId === ROLE_INVENTORY_IDS.LEADER,
    );
    return leaderEntry?.roleId ?? assignments[0].roleId;
  }

  /**
   * Collect the union of coreTools for all assigned roles (safety-05).
   * De-duplicated; order is stable (first-occurrence insertion order).
   */
  private collectCoreTools(assignments: RoleAssignment[]): string[] {
    const seen = new Set<string>();
    const tools: string[] = [];
    for (const { roleId } of assignments) {
      const proto = this.roleInventory.getRole(roleId);
      if (!proto) continue;
      for (const tool of proto.coreTools) {
        if (!seen.has(tool)) {
          seen.add(tool);
          tools.push(tool);
        }
      }
    }
    return tools;
  }

  /**
   * Pick a default model: use the leader assignment's modelId if non-empty,
   * otherwise fall back to "" (LLMFactory default, no hardcoding — red-line).
   */
  private pickDefaultModel(assignments: RoleAssignment[]): string {
    const leader = assignments.find(
      (a) => a.roleId === ROLE_INVENTORY_IDS.LEADER,
    );
    return leader?.modelId ?? assignments[0]?.modelId ?? "";
  }

  /**
   * Build a minimal sequential WorkflowConfig from the assignments.
   * Each assignment becomes one task step; later steps depend on the prior.
   * TeamFactory validates that at least one step is present.
   */
  private buildWorkflow(
    missionId: string,
    assignments: RoleAssignment[],
  ): WorkflowConfig {
    const steps = assignments.map(({ roleId }, index) => ({
      id: `step-${index + 1}`,
      name: `Step ${index + 1} — ${roleId}`,
      description: `Execution step for role "${roleId}" in mission "${missionId}".`,
      type: "task" as const,
      executorRoles: [roleId],
      parallel: false,
      dependsOn: index > 0 ? [`step-${index}`] : ([] as string[]),
    }));

    return {
      id: `workflow-${missionId}`,
      name: `Self-Driven Workflow for ${missionId}`,
      type: "sequential",
      steps,
      entryStepId: "step-1",
    };
  }
}
