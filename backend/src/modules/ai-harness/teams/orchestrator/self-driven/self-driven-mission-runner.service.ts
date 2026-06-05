import { Injectable, Logger, Inject } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import type {
  SelfDrivenMissionEvent,
  SelfDrivenMissionInput,
} from "../abstractions/self-driven-mission.types";
import { SelfDrivenMissionPlannerService } from "./self-driven-mission-planner.service";
import { SelfDrivenReportComposer } from "./self-driven-report-composer";
import type {
  ExecutionStep,
  MissionExecutionPlan,
} from "../orchestrator.interface";
import { DynamicTeamBuilder } from "../../dynamic-team/dynamic-team-builder";
import { AiChatService } from "../../../../ai-engine/llm/chat/ai-chat.service";
import {
  IRoleInventory,
  ROLE_INVENTORY,
} from "../../abstractions/role-inventory.interface";
import type { TaskProfile } from "../../../facade";
import { SelfDrivenHitlGateService } from "./self-driven-hitl-gate";
import { AgentFactory } from "../../../agents/core/agent-factory";
import { AgentIdentity } from "../../../agents/core/agent-identity";
import type {
  IThinkingEvent,
  IActionExecutedEvent,
  IOutputEvent,
  IErrorEvent,
} from "../../../agents/abstractions/agent-event.interface";

/**
 * Self-Driven Agent Team runner.
 *
 * Lifecycle:
 *   clarify  — placeholder (P1: interactive clarification loop)
 *   plan     — calls SelfDrivenMissionPlannerService; streams a `plan` event
 *   execute  — builds the dynamic team via DynamicTeamBuilder; emits `team_built`;
 *              then drives each plan step in dependency order, calling the role's
 *              LLM via AiChatService to produce real content; emits
 *              step_started / chunk / step_completed per step.
 *   deliver  — assembles per-step outputs into a Markdown report via
 *              SelfDrivenReportComposer; emits `deliverable`.
 *
 * LLM call pattern: AiChatService.chat() + TaskProfile, no hard-coded model
 * names or temperatures (fallback modelId = "" per red-line rules).
 *
 * Resilience: a single step failure does not abort the mission — the step is
 * logged and marked as degraded, execution continues with remaining steps.
 * The final report notes which steps did not produce output.
 *
 * Event contract (SelfDrivenMissionEvent) is stable; unknown types are
 * silently ignored by existing consumers.
 */
@Injectable()
export class SelfDrivenMissionRunner {
  private readonly logger = new Logger(SelfDrivenMissionRunner.name);

  constructor(
    private readonly planner: SelfDrivenMissionPlannerService,
    private readonly teamBuilder: DynamicTeamBuilder,
    private readonly chat: AiChatService,
    private readonly composer: SelfDrivenReportComposer,
    private readonly hitlGate: SelfDrivenHitlGateService,
    private readonly agentFactory: AgentFactory,
    @Inject(ROLE_INVENTORY) private readonly roleInventory: IRoleInventory,
  ) {}

  /**
   * Run one self-driven mission, streaming lifecycle events.
   *
   * @param missionId Caller-generated id (ownership already assigned app-side).
   * @param input     The user's request + context.
   * @param signal    Cooperative cancellation (stage-boundary).
   */
  async *run(
    missionId: string,
    input: SelfDrivenMissionInput,
    signal?: AbortSignal,
  ): AsyncGenerator<SelfDrivenMissionEvent, void, unknown> {
    this.logger.log(
      `[SelfDriven] mission ${missionId} started for user ${input.userId}`,
    );
    yield { type: "mission_started", missionId };

    // NB: no "clarify" phase is emitted today — interactive clarification is P2+.
    // A phase that does nothing must not announce itself in the UI (it showed as a
    // misleading instant "Clarify Running → Done"). Real clarify events land in P2.

    // ── Phase: plan ───────────────────────────────────────────────────────────
    if (signal?.aborted) {
      yield { type: "error", missionId, message: "aborted" };
      return;
    }
    yield { type: "phase", missionId, phase: "plan", status: "started" };

    let plan: MissionExecutionPlan;
    try {
      plan = await this.planner.plan({
        prompt: input.prompt,
        userId: input.userId,
        context: input.clarifications
          ? (input.clarifications as Record<string, unknown>)
          : undefined,
        signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[SelfDriven] mission ${missionId} plan phase failed: ${message}`,
      );
      yield { type: "error", missionId, message: `plan failed: ${message}` };
      return;
    }

    yield { type: "phase", missionId, phase: "plan", status: "completed" };

    // Stream the plan as a structured event so app-side and UI can display it.
    yield { type: "plan", missionId, plan };

    // ── HITL gate: plan_confirm ───────────────────────────────────────────────
    // Block until the user approves the plan, rejects it, or the 10-minute
    // timeout elapses (auto-approve per ADR-010).  Any append instruction is
    // stored in `appendContext` and injected into every subsequent step prompt.
    if (signal?.aborted) {
      yield { type: "error", missionId, message: "aborted" };
      return;
    }
    let appendContext: string | undefined;
    {
      const planGatePrompt =
        `Mission "${input.prompt.slice(0, 120)}" — plan ready.\n` +
        `Steps: ${plan.steps.length}. ` +
        `Roles: ${[...new Set(plan.steps.map((s) => s.executor))].join(", ")}.\n` +
        `Approve to proceed, reject to cancel, or provide feedback to adjust.`;

      yield {
        type: "awaiting_approval",
        missionId,
        requestId: "", // filled after gate opens
        gate: "plan_confirm",
        prompt: planGatePrompt,
      };

      const planGate = await this.hitlGate.open(
        missionId,
        "plan_confirm",
        planGatePrompt,
        signal,
      );

      yield {
        type: "approval_resolved",
        missionId,
        requestId: planGate.requestId,
        gate: "plan_confirm",
        approved: planGate.approved,
        timedOut: planGate.timedOut,
        appendInstruction: planGate.appendInstruction,
      };

      if (!planGate.approved) {
        this.logger.log(
          `[SelfDriven] mission ${missionId} plan rejected by human`,
        );
        yield {
          type: "error",
          missionId,
          message: "plan rejected by human",
        };
        return;
      }

      if (planGate.timedOut) {
        yield {
          type: "phase",
          missionId,
          phase: "plan",
          status: "completed",
          detail: "plan_confirm gate timed out — auto-approved after 10 min",
        };
      }

      appendContext = planGate.appendInstruction;
    }

    // ── Phase: execute ────────────────────────────────────────────────────────
    if (signal?.aborted) {
      yield { type: "error", missionId, message: "aborted" };
      return;
    }
    yield { type: "phase", missionId, phase: "execute", status: "started" };
    this.logger.log(
      `[SelfDriven] mission ${missionId} → execute phase: ${plan.steps.length} steps, ` +
        `roles=[${(plan.roleAssignments ?? []).map((a) => `${a.roleId}:${a.modelId || "EMPTY"}`).join(", ")}]`,
    );

    // Build the dynamic team from the planner's role assignments.
    // safety-10: DynamicTeamBuilder validates every roleId against RoleInventory
    //            and throws AgentAccessDeniedError for unknown ids.
    // safety-05: member tools are scoped to role.coreTools declared in RoleInventory.
    const assignments = plan.roleAssignments ?? [];
    if (assignments.length === 0) {
      this.logger.warn(
        `[SelfDriven] mission ${missionId} has no roleAssignments — skipping team build`,
      );
      yield {
        type: "error",
        missionId,
        message: "execute failed: plan contains no roleAssignments",
      };
      return;
    }

    try {
      const team = this.teamBuilder.build(missionId, assignments);
      this.logger.log(
        `[SelfDriven] mission ${missionId} team built: ` +
          `leader=${team.leader.role.id} members=${team.members.length}`,
      );

      // Emit team_built event (additive — unknown types silently ignored by
      // consumers that have not yet adopted this event).
      //
      // Source of truth = the planner's per-role elected assignments, NOT the
      // built team's members: the team is created with a single uniform
      // defaultModel (TeamFactory.createFromConfig has no per-role model slot),
      // so team.getAllMembers() would advertise the same model for every role
      // while each step actually executes on its own elected modelId
      // (plan.roleAssignments). Emitting the elected assignments keeps the UI's
      // model attribution consistent with what each step really runs on.
      void team; // built for role validation (safety-10) + registry bridging.
      const roles = assignments.map((a) => ({
        roleId: a.roleId,
        modelId: a.modelId,
      }));
      yield { type: "team_built", missionId, roles };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[SelfDriven] mission ${missionId} execute phase — team build failed: ${message}`,
      );
      yield {
        type: "error",
        missionId,
        message: `execute failed: ${message}`,
      };
      return;
    }

    // ── Per-step execution in dependency order ────────────────────────────────
    // stepOutputs accumulates role outputs for cross-step context and final report.
    const stepOutputs = new Map<string, string>();
    const sortedSteps = this.topologicalSort(plan.steps);

    for (let i = 0; i < sortedSteps.length; i++) {
      if (signal?.aborted) {
        yield { type: "error", missionId, message: "aborted" };
        return;
      }

      const step = sortedSteps[i];
      yield {
        type: "step_started",
        missionId,
        stepId: step.id,
        stepName: step.name,
        executor: step.executor,
        stepIndex: i,
        totalSteps: sortedSteps.length,
      };

      const stepStart = Date.now();
      this.logger.log(
        `[SelfDriven] mission ${missionId} step ${i + 1}/${sortedSteps.length} started: ` +
          `"${step.name}" (executor=${step.executor}, loopKind=${step.loopKind ?? "default"})`,
      );

      try {
        let output = "";
        // Drive the step generator — it yields real-time chunk/tool_call events
        // and returns the accumulated text as the generator's return value.
        // Because AsyncGenerator<Y, R> return value is only accessible after
        // the generator is exhausted, we capture it from the final IteratorResult.
        const stepGen = this.executeStep(
          step,
          plan,
          input,
          stepOutputs,
          signal,
          appendContext,
        );
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = await stepGen.next();
          if (result.done) {
            output = result.value ?? "";
            break;
          }
          yield result.value;
        }

        stepOutputs.set(step.id, output);

        this.logger.log(
          `[SelfDriven] mission ${missionId} step ${i + 1}/${sortedSteps.length} completed: ` +
            `"${step.name}" ok=true durationMs=${Date.now() - stepStart} outputChars=${output.length}` +
            (output.length === 0
              ? " (EMPTY OUTPUT — step produced nothing)"
              : ""),
        );

        yield {
          type: "step_completed",
          missionId,
          stepId: step.id,
          stepName: step.name,
          ok: true,
          durationMs: Date.now() - stepStart,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[SelfDriven] mission ${missionId} step "${step.name}" (${step.executor}) failed: ${message}`,
        );
        // Single-step failure: degrade gracefully, continue with remaining steps.
        yield {
          type: "step_completed",
          missionId,
          stepId: step.id,
          stepName: step.name,
          ok: false,
          durationMs: Date.now() - stepStart,
        };
        // stepOutputs intentionally left empty for this step so the report
        // marks it as skipped rather than crashing.
      }
    }

    yield { type: "phase", missionId, phase: "execute", status: "completed" };
    this.logger.log(
      `[SelfDriven] mission ${missionId} execute phase done: ` +
        `${stepOutputs.size}/${sortedSteps.length} steps produced output`,
    );

    // ── HITL gate: deliver_confirm ────────────────────────────────────────────
    // Block before the report is assembled so the user can append final
    // instructions (e.g. "add an executive summary") or reject the output.
    if (signal?.aborted) {
      yield { type: "error", missionId, message: "aborted" };
      return;
    }
    {
      const deliverGatePrompt =
        `Mission "${input.prompt.slice(0, 120)}" — execution complete ` +
        `(${stepOutputs.size}/${plan.steps.length} steps succeeded).\n` +
        `Approve to assemble the final report, reject to cancel, or provide ` +
        `feedback to adjust before assembly.`;

      yield {
        type: "awaiting_approval",
        missionId,
        requestId: "",
        gate: "deliver_confirm",
        prompt: deliverGatePrompt,
      };

      const deliverGate = await this.hitlGate.open(
        missionId,
        "deliver_confirm",
        deliverGatePrompt,
        signal,
      );

      yield {
        type: "approval_resolved",
        missionId,
        requestId: deliverGate.requestId,
        gate: "deliver_confirm",
        approved: deliverGate.approved,
        timedOut: deliverGate.timedOut,
        appendInstruction: deliverGate.appendInstruction,
      };

      if (!deliverGate.approved) {
        this.logger.log(
          `[SelfDriven] mission ${missionId} deliver rejected by human`,
        );
        yield {
          type: "error",
          missionId,
          message: "deliver rejected by human",
        };
        return;
      }

      if (deliverGate.timedOut) {
        yield {
          type: "phase",
          missionId,
          phase: "deliver",
          status: "started",
          detail: "deliver_confirm gate timed out — auto-approved after 10 min",
        };
      }

      // Merge any deliver-gate append instruction with the plan-gate one.
      if (deliverGate.appendInstruction) {
        appendContext = appendContext
          ? `${appendContext}\n\n${deliverGate.appendInstruction}`
          : deliverGate.appendInstruction;
      }
    }

    // ── Phase: deliver ────────────────────────────────────────────────────────
    if (signal?.aborted) {
      yield { type: "error", missionId, message: "aborted" };
      return;
    }
    yield { type: "phase", missionId, phase: "deliver", status: "started" };

    try {
      const report = this.composer.compose({
        plan,
        stepOutputs,
        userPrompt: input.prompt,
      });

      this.logger.log(
        `[SelfDriven] mission ${missionId} report assembled: ` +
          `${report.wordCount} words, ` +
          `${stepOutputs.size}/${plan.steps.length} steps contributed`,
      );

      yield {
        type: "deliverable",
        missionId,
        deliverableType: "report",
        content: report.content,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[SelfDriven] mission ${missionId} deliver phase failed: ${message}`,
      );
      // Fallback: emit whatever partial content we have as the deliverable
      // rather than failing the whole mission silently.
      const fallback =
        `# Mission Report\n\n**Objective:** ${input.prompt}\n\n` +
        `_Report assembly encountered an error: ${message}._\n\n` +
        this.buildFallbackContent(plan, stepOutputs);
      yield {
        type: "deliverable",
        missionId,
        deliverableType: "report",
        content: fallback,
      };
    }

    yield { type: "phase", missionId, phase: "deliver", status: "completed" };

    this.logger.log(`[SelfDriven] mission ${missionId} done`);
    yield { type: "done", missionId };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Execute a single plan step, yielding real-time events and returning the
   * accumulated text as the generator's return value.
   *
   * Routing logic (per survey降级方案 — ITeamMember has no execute() method,
   * so ReActLoop path is deferred to a follow-up specialist task):
   *
   *   • Tool-capable path (role has coreTools AND step.loopKind is react or
   *     leader-worker): DEFERRED — falls through to chatStream identical to
   *     delivery path. When ITeamMember gains execute(), this branch will drive
   *     the ReActLoop and emit tool_call events per tool invocation.
   *
   *   • Generation / delivery path: AiChatService.chatStream(), yielding one
   *     SelfDrivenMissionEvent `chunk` per token-chunk for true per-token UI
   *     streaming. Final accumulated text is returned as generator return value.
   *
   *   • Fallback on any streaming error: falls back to this.chat.chat() (single
   *     blocking call) so a single step never crashes the mission.
   *
   * System prompt is built from:
   *   1. Role prototype systemPromptHint (from RoleInventory).
   *   2. Overall mission objective.
   *   3. Condensed prior-step outputs for cross-step context.
   *
   * TaskProfile (no hard-coded temperatures — all via TaskProfile):
   *   - delivery/writing → creativity="medium", outputLength="long"
   *   - review/critique  → creativity="low",    outputLength="medium"
   *   - task/research    → creativity="low",    outputLength="long"
   *
   * modelId: assignment's modelId if non-empty; "" = LLMFactory default
   * (red-line compliant, no hard-coded model names).
   */
  private async *executeStep(
    step: ExecutionStep,
    plan: MissionExecutionPlan,
    input: SelfDrivenMissionInput,
    priorOutputs: Map<string, string>,
    signal?: AbortSignal,
    appendContext?: string,
  ): AsyncGenerator<SelfDrivenMissionEvent, string, unknown> {
    const missionId = plan.missionId;

    // Resolve role prototype for systemPromptHint and coreTools.
    const proto = this.roleInventory.getRole(step.executor);
    const roleHint =
      proto?.systemPromptHint ??
      `You are a ${step.executor}. Complete the assigned task thoroughly.`;

    // Build condensed prior context from dependency outputs only (avoid
    // ballooning context with all prior steps unconditionally).
    const priorContext = this.buildPriorContext(step, priorOutputs, plan);

    // Incorporate any sanitized HITL append instruction into the system prompt
    // so the executing role can honour user refinements for this step.
    const effectivePrompt = appendContext
      ? `${input.prompt}\n\n[User refinement]: ${appendContext}`
      : input.prompt;

    const systemPrompt = this.composer.buildStepSystemPrompt(
      step,
      roleHint,
      effectivePrompt,
      priorContext,
    );

    // Select TaskProfile based on step type / loopKind.
    const taskProfile = this.resolveTaskProfile(step);

    // Resolve modelId from the role assignment; "" = LLMFactory default.
    const assignment = plan.roleAssignments?.find(
      (a) => a.roleId === step.executor,
    );
    const modelId = assignment?.modelId ?? "";

    const userMessage = {
      role: "user" as const,
      content:
        `Task: ${step.name}\n\n${step.description}` +
        (step.input
          ? `\n\nAdditional context: ${JSON.stringify(step.input)}`
          : ""),
    };

    // ── Determine routing ────────────────────────────────────────────────────
    // Tool-capable path: role has coreTools AND step loopKind is react or
    // leader-worker → run a real ReActLoop via AgentFactory.create().execute().
    // Generation path: chatStream for delivery / review / integration steps.
    const isToolCapable =
      (proto?.coreTools.length ?? 0) > 0 &&
      (step.loopKind === "react" || step.loopKind === "leader-worker");

    if (isToolCapable) {
      this.logger.debug(
        `[SelfDriven] step "${step.name}" is tool-capable (role=${step.executor}, ` +
          `loopKind=${step.loopKind}) — running ReActLoop via AgentFactory`,
      );

      // Build AgentIdentity from the role prototype and current mission context.
      // The merged systemPrompt (roleHint + mission objective + prior step outputs +
      // appendContext) is passed as spec.systemPrompt so the agent has full situational
      // awareness without requiring a separate user message for context.
      const identity = new AgentIdentity({
        role: {
          id: proto!.roleId,
          name: proto!.title,
          description: proto!.systemPromptHint,
        },
        tools: [...proto!.coreTools],
        constraints: {
          maxIterations: proto!.maxIterations,
          maxTokens: taskProfile.outputLength === "long" ? 8_000 : 4_000,
        },
      });

      const agent = this.agentFactory.create(
        {
          identity,
          loop: "react",
          systemPrompt,
          userId: input.userId,
        },
        modelId || undefined,
      );

      const agentInput =
        step.description +
        (step.input
          ? `\n\nAdditional context: ${JSON.stringify(step.input)}`
          : "") +
        (priorContext ? `\n\n[Prior step context]\n${priorContext}` : "");

      let agentOutput = "";
      try {
        for await (const ev of agent.execute({
          goal: step.name,
          input: agentInput,
          signal,
        })) {
          if (signal?.aborted) {
            throw new Error("aborted");
          }

          if (ev.type === "thinking") {
            const thinkingEv = ev as IThinkingEvent;
            if (thinkingEv.payload.text) {
              yield {
                type: "chunk",
                missionId,
                content: thinkingEv.payload.text,
              } satisfies SelfDrivenMissionEvent;
            }
          } else if (ev.type === "action_executed") {
            const actionEv = ev as IActionExecutedEvent;
            const action = actionEv.payload.action;
            if (action.kind === "tool_call") {
              yield {
                type: "tool_call",
                missionId,
                stepId: step.id,
                toolId: action.toolId,
                label: `${action.toolId}: ${step.name}`,
              } satisfies SelfDrivenMissionEvent;
            } else if (action.kind === "parallel_tool_call") {
              for (const call of action.calls) {
                yield {
                  type: "tool_call",
                  missionId,
                  stepId: step.id,
                  toolId: call.toolId,
                  label: `${call.toolId}: ${step.name}`,
                } satisfies SelfDrivenMissionEvent;
              }
            }
          } else if (ev.type === "output") {
            const outputEv = ev as IOutputEvent;
            const rawOutput = outputEv.payload.output;
            agentOutput =
              typeof rawOutput === "string"
                ? rawOutput
                : JSON.stringify(rawOutput);
          } else if (ev.type === "error") {
            const errorEv = ev as IErrorEvent;
            throw new Error(
              `Agent error for step "${step.name}": ${errorEv.payload.message}`,
            );
          } else if (ev.type === "validation_failed") {
            // Previously swallowed silently — surface it: the agent's output did
            // not satisfy the role's output schema and is being retried/forced.
            this.logger.warn(
              `[SelfDriven] mission ${missionId} step "${step.name}" — agent output failed schema validation (retry/force-finalize)`,
            );
          } else if (ev.type === "terminated") {
            const reason = (ev as { payload?: { reason?: string } }).payload
              ?.reason;
            if (reason && reason !== "completed" && reason !== "final_answer") {
              this.logger.warn(
                `[SelfDriven] mission ${missionId} step "${step.name}" — agent terminated early: reason=${reason}`,
              );
            }
          }
          // budget_warning / iteration_progress / action_planned / reflection /
          // tools_recalled are intentionally not surfaced (non-diagnostic noise).
        }

        // Emit the final agent output as a chunk so the report composer
        // has content to include for this step.
        if (agentOutput) {
          yield {
            type: "chunk",
            missionId,
            content: agentOutput,
          } satisfies SelfDrivenMissionEvent;
        } else {
          this.logger.warn(
            `[SelfDriven] mission ${missionId} step "${step.name}" (executor=${step.executor}, model=${modelId || "default"}) — agent produced NO output; report will mark this step empty`,
          );
        }

        return agentOutput;
      } catch (agentErr) {
        // ── Fallback tier 1: chatStream (then chat() inside) ─────────────────
        const agentMessage =
          agentErr instanceof Error ? agentErr.message : String(agentErr);
        this.logger.warn(
          `[SelfDriven] step "${step.name}" ReActLoop failed (${agentMessage}), ` +
            `falling back to chatStream`,
        );
        return yield* this.executeStepViaChatStream(
          step,
          missionId,
          systemPrompt,
          userMessage,
          taskProfile,
          modelId,
          input,
          signal,
        );
      }
    }

    // ── chatStream path (generation / delivery / review steps) ───────────────
    return yield* this.executeStepViaChatStream(
      step,
      missionId,
      systemPrompt,
      userMessage,
      taskProfile,
      modelId,
      input,
      signal,
    );
  }

  /**
   * Execute a step via AiChatService.chatStream() with a blocking chat() fallback.
   * Shared by the generation path and the ReActLoop fallback path.
   */
  private async *executeStepViaChatStream(
    step: ExecutionStep,
    missionId: string,
    systemPrompt: string,
    userMessage: { role: "user"; content: string },
    taskProfile: TaskProfile,
    modelId: string,
    input: SelfDrivenMissionInput,
    signal?: AbortSignal,
  ): AsyncGenerator<SelfDrivenMissionEvent, string, unknown> {
    let accumulated = "";
    try {
      for await (const chunk of this.chat.chatStream({
        systemPrompt,
        messages: [userMessage],
        taskProfile,
        modelType: AIModelType.CHAT,
        model: modelId || undefined,
        userId: input.userId,
        operationName: `self_driven_step_${step.id}`,
      })) {
        if (signal?.aborted) {
          throw new Error("aborted");
        }

        if (chunk.error) {
          throw new Error(
            `chatStream error for step "${step.name}": ${chunk.error}`,
          );
        }

        if (chunk.content) {
          accumulated += chunk.content;
          yield {
            type: "chunk",
            missionId,
            content: chunk.content,
          } satisfies SelfDrivenMissionEvent;
        }
      }

      return accumulated;
    } catch (streamErr) {
      // ── Fallback: blocking chat() with ENGINE model-level failover ───────
      // The streaming attempt above pinned the elected model explicitly. When
      // it fails (e.g. the diversity-elected model is unhealthy at call time),
      // we DROP the explicit model on the retry: AiChatService.chat() only
      // engages its built-in model-level failover (runChatWithModelFailover)
      // when no explicit `model` is passed — passing one short-circuits to a
      // single chatOnce with no recovery (ai-chat.service.ts §统一 chat 入口).
      // Dropping it lets the engine fail over to a healthy default, so one bad
      // per-role election no longer fails the whole step. (Reuses the existing
      // engine failover capability — no hand-rolled retry loop.)
      const streamMessage =
        streamErr instanceof Error ? streamErr.message : String(streamErr);
      this.logger.warn(
        `[SelfDriven] step "${step.name}" chatStream failed on model ` +
          `"${modelId || "default"}" (${streamMessage}) — retrying via chat() ` +
          `with engine model-level failover (dropping the elected model)`,
      );

      const result = await this.chat.chat({
        systemPrompt,
        messages: [userMessage],
        taskProfile,
        modelType: AIModelType.CHAT,
        // model intentionally omitted → engine model-level failover engages.
        userId: input.userId,
        signal,
      });

      if ((result as { isError?: boolean }).isError) {
        throw new Error(
          `LLM returned error for step "${step.name}": ${result.content}`,
        );
      }

      const fallbackContent = result.content ?? "";
      if (fallbackContent) {
        yield {
          type: "chunk",
          missionId,
          content: fallbackContent,
        } satisfies SelfDrivenMissionEvent;
      }

      return fallbackContent;
    }
  }

  /**
   * Resolve TaskProfile based on step type and loopKind.
   * No hard-coded temperatures — all creativity/length choices go through TaskProfile.
   */
  private resolveTaskProfile(step: ExecutionStep): TaskProfile {
    if (step.type === "delivery") {
      return { creativity: "medium", outputLength: "long" };
    }
    if (step.type === "review") {
      return { creativity: "low", outputLength: "medium" };
    }
    // task / integration / default → research-style output
    return { creativity: "low", outputLength: "long" };
  }

  /**
   * Build condensed prior context for the current step, drawing only from
   * the outputs of declared dependency steps.  Falls back to the most recent
   * completed step if no dependencies are declared (makes single-chain plans
   * naturally flow without explicit dependency wiring in the plan).
   *
   * Context is capped at ~2 000 chars per dependency to stay within LLM
   * context budgets for long missions.
   */
  private buildPriorContext(
    step: ExecutionStep,
    priorOutputs: Map<string, string>,
    plan: MissionExecutionPlan,
  ): string {
    const DEP_CAP = 2_000;
    const parts: string[] = [];

    if (step.dependencies.length > 0) {
      for (const depId of step.dependencies) {
        const depStep = plan.steps.find((s) => s.id === depId);
        const depOutput = priorOutputs.get(depId);
        if (!depOutput || !depStep) continue;
        const snippet =
          depOutput.length > DEP_CAP
            ? depOutput.slice(0, DEP_CAP) + "…"
            : depOutput;
        parts.push(`[${depStep.name}]\n${snippet}`);
      }
    } else if (priorOutputs.size > 0) {
      // No explicit deps: take the most recently completed step as context.
      const lastKey = [...priorOutputs.keys()].at(-1);
      if (lastKey) {
        const lastOutput = priorOutputs.get(lastKey) ?? "";
        const snippet =
          lastOutput.length > DEP_CAP
            ? lastOutput.slice(0, DEP_CAP) + "…"
            : lastOutput;
        const lastStep = plan.steps.find((s) => s.id === lastKey);
        parts.push(`[${lastStep?.name ?? lastKey}]\n${snippet}`);
      }
    }

    return parts.join("\n\n");
  }

  /**
   * Topological sort of plan steps by their declared dependencies.
   *
   * Uses Kahn's algorithm (BFS on zero-in-degree nodes) for O(V+E).
   * Steps with no dependencies are processed first, maintaining planner
   * ordering within a tier for determinism.
   *
   * Falls back to the original planner order if a cycle is detected
   * (cycle detection is a safety net; the planner is expected to produce
   * a valid DAG).
   */
  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    const idToStep = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>(steps.map((s) => [s.id, 0]));
    const dependents = new Map<string, string[]>(steps.map((s) => [s.id, []]));

    for (const step of steps) {
      for (const dep of step.dependencies) {
        if (!idToStep.has(dep)) continue; // external dep — skip
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        dependents.get(dep)?.push(step.id);
      }
    }

    const queue: string[] = steps
      .filter((s) => (inDegree.get(s.id) ?? 0) === 0)
      .map((s) => s.id);

    const sorted: ExecutionStep[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = idToStep.get(id);
      if (!step) continue;
      sorted.push(step);
      for (const dep of dependents.get(id) ?? []) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          queue.push(dep);
        }
      }
    }

    if (sorted.length !== steps.length) {
      // Cycle detected — fall back to planner order and log a warning.
      this.logger.warn(
        `[SelfDriven] topological sort detected a cycle in plan steps — ` +
          `falling back to planner order.`,
      );
      return [...steps];
    }

    return sorted;
  }

  /**
   * Fallback content builder for the deliver phase error path.
   * Concatenates whatever partial outputs were collected.
   */
  private buildFallbackContent(
    plan: MissionExecutionPlan,
    stepOutputs: Map<string, string>,
  ): string {
    const parts: string[] = [];
    for (const step of plan.steps) {
      const output = stepOutputs.get(step.id);
      if (output) {
        parts.push(`## ${step.name}\n\n${output.trim()}`);
      }
    }
    return parts.join("\n\n---\n\n");
  }
}
