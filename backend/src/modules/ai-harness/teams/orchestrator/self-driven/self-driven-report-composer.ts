/**
 * SelfDrivenReportComposer — thin deliver-phase assembler for the self-driven runner.
 *
 * Responsibility: convert per-step text outputs + plan metadata into a
 * Markdown report string.  Intentionally zero-LLM; rubric scoring and
 * quality evaluation are separate concerns handled by the evaluate layer.
 *
 * Design: §5.4 交付件组装收口 IDeliveryGenerator — v1 report projector.
 * Placement: harness/teams/orchestrator (deliver artefact assembly belongs
 * with orchestration, not evaluation).
 *
 * MECE:
 *   - No import of ai-app/** (spec P5 guard).
 *   - No import of ai-engine internal paths — pure string composition.
 */

import { Injectable } from "@nestjs/common";
import type {
  ExecutionStep,
  MissionExecutionPlan,
} from "../orchestrator.interface";

/** Aggregated input for the report composer. */
export interface ReportComposerInput {
  plan: MissionExecutionPlan;
  /** Map of stepId → text output produced by the role's LLM call. */
  stepOutputs: Map<string, string>;
  /** Original user prompt (repeated in the report header for context). */
  userPrompt: string;
}

/** Slim report output — content is a Markdown string. */
export interface ReportComposerOutput {
  content: string;
  wordCount: number;
}

@Injectable()
export class SelfDrivenReportComposer {
  /**
   * Assemble a Markdown report from per-step LLM outputs + plan metadata.
   *
   * Structure:
   *   # Mission Report
   *   Prompt summary / steps executed / role contributions
   *   ## [Step name] — [Role]
   *   <step output>
   *   ## Acceptance Rubric
   *   rubric dimension table (passLine reference, not scored here)
   */
  compose(input: ReportComposerInput): ReportComposerOutput {
    const { plan, stepOutputs, userPrompt } = input;
    const sections: string[] = [];

    // ── Header ────────────────────────────────────────────────────────────────
    sections.push(`# Mission Report\n`);
    sections.push(`**Objective:** ${userPrompt}\n`);

    const executedCount = stepOutputs.size;
    const totalCount = plan.steps.length;
    sections.push(
      `**Steps executed:** ${executedCount} / ${totalCount}` +
        (executedCount < totalCount
          ? ` (${totalCount - executedCount} step(s) skipped due to errors)`
          : "") +
        `\n`,
    );

    if (plan.roleAssignments && plan.roleAssignments.length > 0) {
      const roleList = plan.roleAssignments
        .map((r) => `${r.roleId}${r.modelId ? ` (${r.modelId})` : ""}`)
        .join(", ");
      sections.push(`**Team:** ${roleList}\n`);
    }

    sections.push(`---\n`);

    // ── Per-step sections ─────────────────────────────────────────────────────
    for (const step of plan.steps) {
      const output = stepOutputs.get(step.id);
      if (!output) {
        // Step was skipped / failed — note it briefly without breaking the report.
        sections.push(
          `## ${step.name} — ${step.executor}\n\n` +
            `_This step did not produce output (execution error or dependency failure)._\n`,
        );
        continue;
      }
      sections.push(
        `## ${step.name} — ${step.executor}\n\n` + `${output.trim()}\n`,
      );
    }

    sections.push(`---\n`);

    // ── Rubric table (reference only, not scored here) ────────────────────────
    if (plan.rubric && plan.rubric.length > 0) {
      sections.push(`## Acceptance Rubric\n`);
      sections.push(`| Dimension | Weight | Pass Line |\n`);
      sections.push(`|-----------|--------|-----------|\n`);
      for (const dim of plan.rubric) {
        const weightPct = `${Math.round(dim.weight * 100)}%`;
        sections.push(
          `| ${dim.dimension} | ${weightPct} | ${dim.passLine} |\n`,
        );
      }
      sections.push(`\n`);
    }

    const content = sections.join("\n");
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

    return { content, wordCount };
  }

  /** Build the system prompt for a given step's executor role. */
  buildStepSystemPrompt(
    step: ExecutionStep,
    roleHint: string,
    userPrompt: string,
    priorContext: string,
  ): string {
    const parts: string[] = [roleHint];

    parts.push(`\nThe overall mission objective is:\n${userPrompt}\n`);

    if (priorContext) {
      parts.push(
        `\nPrevious steps have produced the following context:\n${priorContext}\n`,
      );
    }

    parts.push(
      `\nYour current task is: ${step.name}\n` +
        `Description: ${step.description}\n`,
    );

    parts.push(
      `\nProduce thorough, well-structured content for your task. ` +
        `Do not include meta-commentary about your role — output the content directly.`,
    );

    return parts.join("\n");
  }
}
