/**
 * ReActLoop — Reason + Act 循环的 Phase 2 实现
 *
 * 每轮：
 *   1. perceive: 把 envelope（system + messages + reminders + tools）组装成 LLM input
 *   2. reason:   调用 AiChatService 产生思考 + 决策
 *   3. act:      解析决策 → tool_call 或 finalize
 *   4. reflect:  把 action result 写回 envelope
 *
 * 终止条件：
 *   - finalize action
 *   - 达到 maxIterations
 *   - 达到 maxTokens / maxWallTimeMs（由 facade 外层 budget 控制，loop 只检查 iterations）
 *   - 抛错且不可恢复
 *
 * LLM 协议（Phase 2 简化版）：
 *   - 要求模型输出严格 JSON：{ "thinking": "...", "action": { "kind": "tool_call" | "finalize", ... } }
 *   - 后续 Phase 3 可替换为 native function calling
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AgentLoopKind,
  IAgentEvent,
  IAgentLoop,
  IAction,
  IActionResult,
  IContextEnvelope,
  IContextMessage,
  ILoopTerminationCriteria,
} from "../abstractions";
import { ContextEnvelope } from "../core/context-envelope";
import { AiChatService } from "../../llm/services/ai-chat.service";
import type { ChatMessage } from "../../llm/types";
import { ToolInvoker } from "../executor/tool-invoker";
import { ContextManager } from "../context/context-manager";
import { HookRegistry } from "../core/hook-registry";

export interface ReActLoopOptions {
  agentId: string;
  envelope: IContextEnvelope;
  criteria: ILoopTerminationCriteria;
  signal?: AbortSignal;
}

interface ParsedDecision {
  thinking: string;
  action: IAction;
}

const DECISION_SYSTEM_SUFFIX = `

## Decision Protocol

You MUST reply with a single JSON object with exactly two top-level keys:
- "thinking": a short string explaining your current reasoning.
- "action": one of:
    { "kind": "tool_call", "toolId": "...", "input": { ... } }
    { "kind": "finalize", "output": "<final answer or object>" }

Rules:
- Respond with raw JSON only, no markdown fences, no prose outside the JSON.
- If all information is sufficient, use "finalize".
- Do not invent tool ids; only use tools listed in the available tools.
`;

@Injectable()
export class ReActLoop implements IAgentLoop {
  readonly kind: AgentLoopKind = "react";
  private readonly logger = new Logger(ReActLoop.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly toolInvoker: ToolInvoker,
    private readonly hookRegistry: HookRegistry,
    @Optional() private readonly contextManager?: ContextManager,
  ) {}

  async *run(
    envelope: IContextEnvelope,
    criteria: ILoopTerminationCriteria,
    options?: {
      agentId?: string;
      signal?: AbortSignal;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "unknown-agent";
    const allowedTools = options?.allowedTools;
    const forbiddenTools = options?.forbiddenTools;
    let currentEnvelope = envelope;
    let iteration = 0;

    while (iteration < criteria.maxIterations) {
      iteration += 1;

      // 0. context engineering: compact + prune if needed
      if (this.contextManager) {
        const result = await this.contextManager.ensureBudget(currentEnvelope);
        if (result.compacted || result.pruned) {
          currentEnvelope = result.envelope;
        }
      }

      // 1. perceive: build messages
      const messages = this.buildMessages(currentEnvelope);

      // 2. reason: call LLM
      let decision: ParsedDecision;
      try {
        decision = await this.reason(
          messages,
          currentEnvelope.system,
          options?.signal,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield this.makeEvent(agentId, "error", {
          message,
          recoverable: false,
        });
        yield this.makeEvent(agentId, "terminated", { reason: "error" });
        return;
      }

      // Emit thinking
      yield this.makeEvent(agentId, "thinking", {
        text: decision.thinking,
        tokenCount: decision.thinking.length,
      });

      // Emit action planned
      yield this.makeEvent(agentId, "action_planned", decision.action);

      // 3. act: execute action
      const actionResult = await this.executeAction(
        decision.action,
        currentEnvelope,
        agentId,
        options?.signal,
        allowedTools,
        forbiddenTools,
      );

      yield this.makeEvent(agentId, "action_executed", actionResult);

      // 4. reflect: write back to envelope (assistant's thinking + observation)
      currentEnvelope = this.updateEnvelope(
        currentEnvelope,
        decision,
        actionResult,
      );

      // Check termination
      if (
        decision.action.kind === "finalize" ||
        (criteria.terminateOn?.includes(decision.action.kind) ?? false)
      ) {
        const output =
          decision.action.kind === "finalize"
            ? decision.action.output
            : actionResult.output;
        yield this.makeEvent(agentId, "output", {
          output: output ?? "",
        });
        yield this.makeEvent(agentId, "terminated", { reason: "completed" });
        return;
      }

      if (actionResult.error && !this.isRecoverable(actionResult.error)) {
        yield this.makeEvent(agentId, "error", {
          message: actionResult.error.message,
          recoverable: false,
        });
        yield this.makeEvent(agentId, "terminated", { reason: "error" });
        return;
      }
    }

    // Exceeded iterations
    yield this.makeEvent(agentId, "output", {
      output: this.extractLastAssistantMessage(currentEnvelope) ?? "",
    });
    yield this.makeEvent(agentId, "terminated", { reason: "budget" });
  }

  // ─── Helpers ─────────────────────────────────────────────

  private buildMessages(envelope: IContextEnvelope): ChatMessage[] {
    const msgs: ChatMessage[] = [];
    // Reminders merged into assistant-visible context as additional system content
    for (const r of envelope.reminders) {
      msgs.push({
        role: "system",
        content: `[reminder:${r.priority}] ${r.content}`,
      });
    }
    for (const m of envelope.messages) {
      msgs.push({
        role: m.role === "tool" ? "user" : m.role,
        content: m.content,
      });
    }
    // Append available tools as inline description
    if (envelope.tools.length) {
      msgs.push({
        role: "system",
        content: `## Available tools\n${envelope.tools.map((t) => `- ${t}`).join("\n")}`,
      });
    }
    return msgs;
  }

  private async reason(
    messages: ChatMessage[],
    baseSystem: string,
    signal?: AbortSignal,
  ): Promise<ParsedDecision> {
    // Fail-fast: 进入 LLM 前先检查取消，避免发起一次注定浪费 token 的请求
    if (signal?.aborted) {
      throw new Error("ReAct loop aborted by signal");
    }
    const systemPrompt = baseSystem + DECISION_SYSTEM_SUFFIX;
    const response = await this.chatService.chat({
      messages,
      systemPrompt,
      taskProfile: { creativity: "low", outputLength: "short" },
      // signal 必须向下传给 AiChatService，推理模型 30-60s 调用期间
      // 如果用户/外层 budget 取消，底层 HTTP 请求能立即中断
      signal,
    });
    if (signal?.aborted) {
      throw new Error("ReAct loop aborted by signal");
    }
    return this.parseDecision(response.content);
  }

  private parseDecision(raw: string): ParsedDecision {
    // Strip common markdown fences
    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    try {
      const obj = JSON.parse(text) as {
        thinking?: unknown;
        action?: unknown;
      };
      const thinking = typeof obj.thinking === "string" ? obj.thinking : "";
      const action = this.normalizeAction(obj.action);
      return { thinking, action };
    } catch (err) {
      this.logger.warn(
        `Failed to parse LLM decision as JSON; treating as finalize. raw=${text.slice(0, 120)}...`,
      );
      return {
        thinking: "(unparseable LLM output, finalizing with raw text)",
        action: { kind: "finalize", output: raw },
      };
    }
  }

  private normalizeAction(action: unknown): IAction {
    if (!action || typeof action !== "object") {
      return { kind: "finalize", output: "" };
    }
    const a = action as Record<string, unknown>;
    if (a.kind === "tool_call" && typeof a.toolId === "string") {
      return {
        kind: "tool_call",
        toolId: a.toolId,
        input: (a.input as Record<string, unknown>) ?? {},
      };
    }
    if (a.kind === "finalize") {
      return {
        kind: "finalize",
        output: (a.output as string | Record<string, unknown>) ?? "",
      };
    }
    // Unknown shape → finalize with original for observability
    return { kind: "finalize", output: JSON.stringify(action) };
  }

  private async executeAction(
    action: IAction,
    envelope: IContextEnvelope,
    agentId: string,
    signal?: AbortSignal,
    allowedTools?: readonly string[],
    forbiddenTools?: readonly string[],
  ): Promise<IActionResult> {
    if (action.kind === "tool_call") {
      // PreToolUse hook (may block)
      const pre = await this.hookRegistry.dispatch(
        "PreToolUse",
        { action },
        { agentId, envelope },
      );
      if (pre.block) {
        return {
          action,
          output: undefined,
          error: new Error(`blocked: ${pre.reason ?? "policy"}`),
          latencyMs: 0,
        };
      }

      const result = await this.toolInvoker.invoke(action, envelope, {
        agentId,
        signal,
        allowedTools,
        forbiddenTools,
      });

      // PostToolUse hook (fire-and-forget, not blocking)
      await this.hookRegistry.dispatch(
        "PostToolUse",
        { action, result },
        { agentId, envelope },
      );

      return result;
    }

    if (action.kind === "finalize") {
      return {
        action,
        output: action.output,
        latencyMs: 0,
      };
    }

    // Other kinds are not supported in Phase 2
    return {
      action,
      output: undefined,
      error: new Error(
        `Action kind '${action.kind}' not supported in Phase 2 ReAct loop`,
      ),
      latencyMs: 0,
    };
  }

  private updateEnvelope(
    envelope: IContextEnvelope,
    decision: ParsedDecision,
    result: IActionResult,
  ): IContextEnvelope {
    const assistantMsg: IContextMessage = {
      role: "assistant",
      content: JSON.stringify({
        thinking: decision.thinking,
        action: decision.action,
      }),
      timestamp: Date.now(),
    };

    const observation: IContextMessage | null =
      result.action.kind === "tool_call"
        ? {
            role: "tool",
            content: this.stringifyObservation(result),
            name: result.action.toolId,
            timestamp: Date.now(),
          }
        : null;

    if (envelope instanceof ContextEnvelope) {
      const { envelope: afterAssistant } = envelope.append([assistantMsg]);
      if (observation && afterAssistant instanceof ContextEnvelope) {
        return afterAssistant.append([observation]).envelope;
      }
      return afterAssistant;
    }

    const nextMessages = [...envelope.messages, assistantMsg];
    if (observation) nextMessages.push(observation);
    return { ...envelope, messages: nextMessages };
  }

  private stringifyObservation(result: IActionResult): string {
    if (result.error) {
      return `[tool error] ${result.error.message}`;
    }
    if (typeof result.output === "string") return result.output;
    try {
      return JSON.stringify(result.output);
    } catch {
      return String(result.output);
    }
  }

  private extractLastAssistantMessage(
    envelope: IContextEnvelope,
  ): string | null {
    for (let i = envelope.messages.length - 1; i >= 0; i -= 1) {
      const m = envelope.messages[i];
      if (m.role === "assistant") return m.content;
    }
    return null;
  }

  private isRecoverable(err: Error): boolean {
    // Tool errors are recoverable by default; LLM errors handled at top of loop.
    return !/aborted/i.test(err.message);
  }

  private makeEvent(
    agentId: string,
    type: IAgentEvent["type"],
    payload: unknown,
  ): IAgentEvent {
    return {
      type,
      agentId,
      timestamp: Date.now(),
      payload,
    };
  }
}
