/**
 * PlanActLoop — Plan-then-Execute 策略
 *
 * 适用：中等复杂度任务（多步分解 + 顺序/并行执行）。
 *
 * 流程：
 *   1. PLAN：让 LLM 一次性产出 Plan tree（steps[]）
 *   2. EXEC：按 steps 顺序执行，每个 step 复用 ReActLoop（最多 maxIterPerStep 轮）
 *   3. SYNTHESIZE：把所有 step 结果合成最终 finalize
 *
 * 比纯 ReAct 优势：
 *   - 一次决定整个 plan，避免每步推理 → 节省 token
 *   - Plan 可被 hook 拦截审查（PrePlan hook）
 *   - 失败的 step 可单独 retry，不必重新 plan
 *
 * 不替代 ReAct：短任务（< 3 步）直接用 ReActLoop 更快。
 */

import { Injectable } from "@nestjs/common";
import type {
  AgentLoopKind,
  IAgentEvent,
  IAgentLoop,
  IContextEnvelope,
  ILoopTerminationCriteria,
  IContextMessage,
} from "../abstractions";
import { ContextEnvelope } from "../core/context-envelope";
import { AiChatService } from "../../llm/services/ai-chat.service";
import type { ChatMessage } from "../../llm/types";
import { ReActLoop } from "./react-loop";
import type { BudgetAccountant } from "../runtime/budget-accountant";

interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  /** 依赖的 step id；为空 = 可并行执行 */
  readonly dependsOn?: readonly string[];
}

interface Plan {
  readonly summary: string;
  readonly steps: readonly PlanStep[];
}

const PLAN_PROMPT_SUFFIX = `

## Plan Protocol

You are operating in PLAN mode. Decompose the task into 2-7 concrete steps.
Output strict JSON:
{
  "summary": "one-line plan summary",
  "steps": [
    {
      "id": "s1",
      "title": "short step title",
      "instruction": "what to do this step (will be the user prompt of a sub-agent ReAct loop)",
      "dependsOn": []
    }
  ]
}

Rules:
- Steps with empty dependsOn run in parallel.
- A step depends on another's id only if it truly needs that result.
- Keep steps coarse-grained; sub-agent will use ReAct to internally fan out.
- Output JSON only.
`;

@Injectable()
export class PlanActLoop implements IAgentLoop {
  readonly kind: AgentLoopKind = "plan-execute";

  constructor(
    private readonly chatService: AiChatService,
    private readonly reactLoop: ReActLoop,
  ) {}

  async *run(
    envelope: IContextEnvelope,
    criteria: ILoopTerminationCriteria,
    options?: {
      agentId?: string;
      signal?: AbortSignal;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
      budget?: BudgetAccountant;
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "plan-act-agent";

    // === Phase 1: PLAN ===
    let plan: Plan;
    try {
      plan = await this.generatePlan(envelope, options?.signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield this.event(agentId, "error", { message, recoverable: false });
      yield this.event(agentId, "terminated", { reason: "error" });
      return;
    }

    yield this.event(agentId, "thinking", {
      text: `Plan: ${plan.summary}\nSteps: ${plan.steps.map((s) => s.title).join(" → ")}`,
      tokenCount: plan.summary.length,
    });

    // === Phase 2: EXECUTE steps in dependency order ===
    const stepResults = new Map<string, string>();
    const remaining = [...plan.steps];
    const completed = new Set<string>();
    const maxIterPerStep = Math.max(
      3,
      Math.floor(criteria.maxIterations / Math.max(1, plan.steps.length)),
    );

    while (remaining.length > 0) {
      if (options?.signal?.aborted) {
        yield this.event(agentId, "terminated", { reason: "cancelled" });
        return;
      }
      if (options?.budget?.exhausted()) {
        yield this.event(agentId, "budget_warning", { severity: "exhausted" });
        yield this.event(agentId, "terminated", { reason: "budget" });
        return;
      }

      // Pick steps whose dependencies are all completed → execute in parallel
      const ready = remaining.filter((s) =>
        (s.dependsOn ?? []).every((d) => completed.has(d)),
      );
      if (ready.length === 0) {
        yield this.event(agentId, "error", {
          message: "Plan has unsatisfiable dependencies",
          recoverable: false,
        });
        yield this.event(agentId, "terminated", { reason: "error" });
        return;
      }

      const batch = ready;
      const batchOutputs = await Promise.all(
        batch.map((step) =>
          this.runStep(step, envelope, stepResults, maxIterPerStep, {
            ...options,
            agentId: `${agentId}/${step.id}`,
          }),
        ),
      );

      for (let i = 0; i < batch.length; i += 1) {
        stepResults.set(batch[i].id, batchOutputs[i]);
        completed.add(batch[i].id);
        // Forward step events as a coarse "action_executed" — caller can introspect
        yield this.event(agentId, "action_executed", {
          action: {
            kind: "tool_call",
            toolId: `step:${batch[i].id}`,
            input: {},
          },
          output: batchOutputs[i],
          latencyMs: 0,
        });
      }

      for (const s of batch) {
        const idx = remaining.indexOf(s);
        if (idx >= 0) remaining.splice(idx, 1);
      }
    }

    // === Phase 3: SYNTHESIZE ===
    const final = await this.synthesize(envelope, plan, stepResults);
    yield this.event(agentId, "output", { output: final });
    yield this.event(agentId, "terminated", { reason: "completed" });
  }

  private async generatePlan(
    envelope: IContextEnvelope,
    signal?: AbortSignal,
  ): Promise<Plan> {
    const messages: ChatMessage[] = envelope.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: m.content,
    }));
    const res = await this.chatService.chat({
      messages,
      systemPrompt: envelope.system + PLAN_PROMPT_SUFFIX,
      taskProfile: { creativity: "low", outputLength: "medium" },
      responseFormat: "json",
      signal,
    });
    const raw = JSON.parse(this.stripFences(res.content));
    // 建议修：strict shape 验证（防 LLM 返回 {steps:[{id:null}]} 等异常）
    return this.validatePlan(raw);
  }

  /** 验证 LLM 返回的 plan 结构。失败抛错，外层会把它转成 error event。 */
  private validatePlan(raw: unknown): Plan {
    if (!raw || typeof raw !== "object") {
      throw new Error("Plan: response is not an object");
    }
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
      throw new Error("Plan: 'steps' must be a non-empty array");
    }
    const steps: PlanStep[] = obj.steps.map((s, i) => {
      if (!s || typeof s !== "object") {
        throw new Error(`Plan: step[${i}] is not an object`);
      }
      const st = s as Record<string, unknown>;
      const id = typeof st.id === "string" && st.id ? st.id : `s${i + 1}`;
      const title = typeof st.title === "string" && st.title ? st.title : id;
      const instruction =
        typeof st.instruction === "string" && st.instruction
          ? st.instruction
          : "";
      if (!instruction) {
        throw new Error(`Plan: step[${i}].instruction missing`);
      }
      const dependsOn = Array.isArray(st.dependsOn)
        ? st.dependsOn.filter((d): d is string => typeof d === "string")
        : [];
      return { id, title, instruction, dependsOn };
    });
    return {
      summary: typeof obj.summary === "string" ? obj.summary : "(no summary)",
      steps,
    };
  }

  private async runStep(
    step: PlanStep,
    parentEnvelope: IContextEnvelope,
    priorResults: ReadonlyMap<string, string>,
    maxIter: number,
    options: {
      agentId?: string;
      signal?: AbortSignal;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
      budget?: BudgetAccountant;
    },
  ): Promise<string> {
    // 必修 #7: 进入 step 前先看共享 budget，已耗尽就直接 short-circuit
    if (options.budget?.exhausted()) {
      return "";
    }
    if (options.signal?.aborted) return "";

    // Compose step envelope: parent system + a step-specific user message
    const depContext = (step.dependsOn ?? [])
      .map((d) => `## Result of ${d}\n${priorResults.get(d) ?? ""}`)
      .join("\n\n");

    const stepMessage: IContextMessage = {
      role: "user",
      content: `${step.instruction}${depContext ? `\n\n# Prior step outputs\n${depContext}` : ""}`,
      timestamp: Date.now(),
    };

    const stepEnvelope =
      parentEnvelope instanceof ContextEnvelope
        ? parentEnvelope.append([stepMessage]).envelope
        : {
            ...parentEnvelope,
            messages: [...parentEnvelope.messages, stepMessage],
          };

    let lastOutput = "";
    for await (const ev of this.reactLoop.run(
      stepEnvelope,
      { maxIterations: maxIter },
      options,
    )) {
      if (ev.type === "output") {
        const out = (ev.payload as { output: unknown }).output;
        lastOutput = typeof out === "string" ? out : JSON.stringify(out);
      }
    }
    return lastOutput;
  }

  private async synthesize(
    envelope: IContextEnvelope,
    plan: Plan,
    results: ReadonlyMap<string, string>,
  ): Promise<string> {
    const summaryBlock = plan.steps
      .map(
        (s) => `## ${s.title} (${s.id})\n${results.get(s.id) ?? "(no result)"}`,
      )
      .join("\n\n");

    const res = await this.chatService.chat({
      systemPrompt:
        envelope.system +
        "\n\nYou are now in SYNTHESIZE mode. Combine the step outputs below into a single coherent answer for the original task.",
      messages: [
        ...envelope.messages.map((m) => ({
          role:
            m.role === "tool"
              ? ("user" as const)
              : (m.role as ChatMessage["role"]),
          content: m.content,
        })),
        { role: "user", content: `# Plan results\n\n${summaryBlock}` },
      ],
      taskProfile: { creativity: "low", outputLength: "long" },
    });
    return res.content;
  }

  private stripFences(s: string): string {
    let t = s.trim();
    if (t.startsWith("```")) {
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    return t;
  }

  private event(
    agentId: string,
    type: IAgentEvent["type"],
    payload: unknown,
  ): IAgentEvent {
    return { type, agentId, timestamp: Date.now(), payload };
  }
}
