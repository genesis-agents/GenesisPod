/**
 * ReActLoop — Reason + Act 循环（SOTA v2）
 *
 * 每轮：
 *   1. perceive: 把 envelope 组装成 LLM input
 *   2. reason:   调用 AiChatService 产出 { thinking, action(s) }
 *   3. act:      执行 action（单 tool / parallel tool / finalize / skill / subagent）
 *   4. reflect:  把 action result 写回 envelope
 *
 * 终止条件：
 *   - finalize action
 *   - 达到 maxIterations
 *   - BudgetAccountant.exhausted() === true（v2 新增：Loop 内强制）
 *   - signal.aborted
 *   - 不可恢复错误
 *
 * v2 升级：
 *   - LLM 可输出 action.kind === "parallel_tool_call"，并行调用多个 tool
 *   - LLM 可使用简写 "actions" 数组，Loop 自动包装为 parallel_tool_call
 *   - 集成 BudgetAccountant：每轮 LLM 调用后扣预算；70% 触发 budget_warning；100% abort
 *   - subagent_spawn 接通 SubagentSpawner（可选注入；Phase D）
 *   - 错误自愈：tool 错误注入下轮 prompt，LLM 可调整策略
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
  IParallelToolCallAction,
  IToolCallAction,
} from "../abstractions";
import { ContextEnvelope } from "../core/context-envelope";
import { AiChatService } from "../../llm/services/ai-chat.service";
import type { ChatMessage } from "../../llm/types";
import { AIModelType } from "@prisma/client";
import { ToolInvoker } from "../executor/tool-invoker";
import { ContextManager } from "../context/context-manager";
import { CacheControlPlanner } from "../context/cache-control-planner";
import { HookRegistry } from "../core/hook-registry";
import { BudgetAccountant } from "../runtime/budget-accountant";
import { ModelPricingRegistry } from "../runtime/model-pricing-registry";
import type { IAgent, ISubagentSpawner } from "../abstractions";

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
    { "kind": "parallel_tool_call", "calls": [
        { "toolId": "a", "input": {...} },
        { "toolId": "b", "input": {...} }
      ] }
    { "kind": "finalize", "output": "<final answer or object>" }

Shorthand: you may also send "actions": [<tool_call>, <tool_call>, ...] at the
top level — it will be auto-wrapped to parallel_tool_call. Use parallel calls
when actions are independent (no result feeds another) — this is much faster.

Rules:
- Respond with raw JSON only, no markdown fences, no prose outside the JSON.
- If all information is sufficient, use "finalize".
- Do not invent tool ids; only use tools listed in the available tools.
- If a tool failed previously, choose a different tool or finalize gracefully.
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
    @Optional() private readonly pricingRegistry?: ModelPricingRegistry,
    @Optional() private readonly cachePlanner?: CacheControlPlanner,
  ) {}

  async *run(
    envelope: IContextEnvelope,
    criteria: ILoopTerminationCriteria,
    options?: {
      agentId?: string;
      signal?: AbortSignal;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
      /** v2: 注入 BudgetAccountant 启用 Loop 内预算强制 */
      budget?: BudgetAccountant;
      /** PR-D: 父 Agent + Spawner，启用 subagent_spawn action */
      parent?: IAgent;
      spawner?: ISubagentSpawner;
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "unknown-agent";
    const allowedTools = options?.allowedTools;
    const forbiddenTools = options?.forbiddenTools;
    const budget = options?.budget;
    let currentEnvelope = envelope;
    let iteration = 0;
    let budgetWarned = false;

    while (iteration < criteria.maxIterations) {
      iteration += 1;

      // 0a. signal check
      if (options?.signal?.aborted) {
        yield this.makeEvent(agentId, "terminated", { reason: "cancelled" });
        return;
      }

      // 0b. budget exhausted check (v2)
      if (budget?.exhausted()) {
        // PR-J: 在 abort 前问 RuntimeEnvironment "能不能降级或重试"
        const hint = await currentEnvelope.runtimeEnv
          ?.suggestFallback({
            reason: "no_credit",
          })
          .catch(() => null);

        yield this.makeEvent(agentId, "budget_warning", {
          tokensUsed: budget.snapshot().tokensUsed,
          costUsd: budget.snapshot().costUsd,
          severity: "exhausted",
          fallbackHint: hint,
        });

        // hint=retry → 等待后继续（建议修 #6: 0ms retry 也合法，用 != null 而非 truthy）
        if (hint?.action === "retry" && hint.retryAfterMs != null) {
          await new Promise((r) =>
            setTimeout(r, Math.min(hint.retryAfterMs!, 10_000)),
          );
          continue;
        }
        // TODO 建议修 #7: hint=downgrade 当前未真正承接 —— 下游 tier 选择只看
        // budget.currentTier，而 budget 已 exhausted 不会改变。需要：
        //   1) 用 hint.fallbackModelId 强制覆盖下一轮 reason() 的 modelOverride
        //   2) BudgetAccountant 提供 reset 或 extend 接口
        // 当前简单策略：downgrade 等同 abort（保守，不假装能恢复）
        yield this.makeEvent(agentId, "output", {
          output: this.extractLastAssistantMessage(currentEnvelope) ?? "",
        });
        yield this.makeEvent(agentId, "terminated", { reason: "budget" });
        return;
      }

      // 0c. context engineering
      if (this.contextManager) {
        const result = await this.contextManager.ensureBudget(currentEnvelope);
        if (result.compacted || result.pruned) {
          currentEnvelope = result.envelope;
        }
      }

      // 1. perceive
      const messages = this.buildMessages(currentEnvelope);

      // 2. reason — PR-I: 把 budget tier 转成具体 modelId 注入
      // PR-J: 选 model 后再问 runtimeEnv "能用吗"，不可用则按 fallbackTo 切换
      let decision: ParsedDecision;
      let usage: {
        promptTokens: number;
        completionTokens: number;
        costUsd: number;
        cacheReadTokens: number;
      };
      try {
        let tierModelId =
          budget && this.pricingRegistry
            ? this.pricingRegistry.pickModelForTier(
                budget.snapshot().currentTier,
              )
            : null;
        // PR-J: 环境感知 model 可用性
        if (tierModelId && currentEnvelope.runtimeEnv) {
          const avail = await currentEnvelope.runtimeEnv
            .getModelAvailability(tierModelId)
            .catch(() => null);
          if (avail && !avail.available) {
            const fallback = avail.fallbackTo?.[0];
            if (fallback) {
              this.logger.log(
                `[${agentId}] model=${tierModelId} unavailable (${avail.unavailableReason}), falling back to ${fallback}`,
              );
              tierModelId = fallback;
            }
          }
        }
        // PR-Q: 自动 prompt-cache 规划 —— 重复 prefix 享受 1/10 价
        const cachePrefix = this.cachePlanner?.plan(currentEnvelope) ?? null;
        const reasoned = await this.reason(
          messages,
          currentEnvelope.system,
          options?.signal,
          tierModelId ?? undefined,
          cachePrefix,
          // BYOK 关键：把 envelope.memory.userId 透给 chat()，让
          // findUserDefaultByType(userId, "chat") 命中用户自己的 BYOK 默认模型
          currentEnvelope.memory.userId,
        );
        decision = reasoned.decision;
        usage = reasoned.usage;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const aborted = /aborted/i.test(message);
        yield this.makeEvent(agentId, "error", {
          message,
          recoverable: false,
        });
        yield this.makeEvent(agentId, "terminated", {
          reason: aborted ? "cancelled" : "error",
        });
        return;
      }

      // v2: account budget for the LLM call
      // PR-I 必修 #4: cacheReadTokens 也要计入 tokensUsed（虽然便宜但占 context window）
      if (budget) {
        budget.accountLLM(
          usage.promptTokens,
          usage.completionTokens,
          usage.costUsd,
          usage.cacheReadTokens,
        );
        if (!budgetWarned && budget.shouldDowngrade()) {
          budgetWarned = true;
          // try to downgrade tier silently for the next iteration
          if (budget.canDowngrade()) {
            const newTier = budget.downgrade();
            this.logger.log(
              `[${agentId}] budget pressure → downgraded to tier=${newTier}`,
            );
          }
          yield this.makeEvent(agentId, "budget_warning", {
            tokensUsed: budget.snapshot().tokensUsed,
            costUsd: budget.snapshot().costUsd,
            severity: "pressure",
            tier: budget.snapshot().currentTier,
          });
        }
      }

      yield this.makeEvent(agentId, "thinking", {
        text: decision.thinking,
        tokenCount: decision.thinking.length,
        // 暴露 LLM 调用的真实用量给上游（DX runner / 业务 orchestrator 用来算成本）
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cacheReadTokens: usage.cacheReadTokens,
        costUsd: usage.costUsd,
      });
      yield this.makeEvent(agentId, "action_planned", decision.action);

      // 3. act
      const actionResult = await this.executeAction(
        decision.action,
        currentEnvelope,
        agentId,
        options?.signal,
        allowedTools,
        forbiddenTools,
        options?.parent,
        options?.spawner,
      );
      // 把 LLM reasoning tokens 累加到本轮 action 的 tokensUsed —— 让上游 extractTokenSpend
      // 拿到完整用量；action 自身 tokensUsed（如 tool 运行）也保留累计
      const enrichedActionResult = {
        ...actionResult,
        tokensUsed:
          (actionResult.tokensUsed ?? 0) +
          usage.promptTokens +
          usage.completionTokens,
      };
      yield this.makeEvent(agentId, "action_executed", enrichedActionResult);

      // 4. reflect
      currentEnvelope = this.updateEnvelope(
        currentEnvelope,
        decision,
        actionResult,
      );

      // termination
      if (
        decision.action.kind === "finalize" ||
        (criteria.terminateOn?.includes(decision.action.kind) ?? false)
      ) {
        const output =
          decision.action.kind === "finalize"
            ? decision.action.output
            : actionResult.output;
        yield this.makeEvent(agentId, "output", { output: output ?? "" });
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

    yield this.makeEvent(agentId, "output", {
      output: this.extractLastAssistantMessage(currentEnvelope) ?? "",
    });
    yield this.makeEvent(agentId, "terminated", { reason: "budget" });
  }

  // ─── Helpers ─────────────────────────────────────────────

  private buildMessages(envelope: IContextEnvelope): ChatMessage[] {
    const msgs: ChatMessage[] = [];
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
    modelOverride?: string,
    cachePrefix?:
      | import("../context/cache-control-planner").SharedCachePrefix
      | null,
    /** BYOK：从 envelope.memory.userId 透传，让 chat() 走 user-default 查找链 */
    userId?: string,
  ): Promise<{
    decision: ParsedDecision;
    usage: {
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
      cacheReadTokens: number;
    };
  }> {
    if (signal?.aborted) {
      throw new Error("ReAct loop aborted by signal");
    }
    const systemPrompt = baseSystem + DECISION_SYSTEM_SUFFIX;
    const response = await this.chatService.chat({
      messages,
      systemPrompt,
      // PR-I 修复 #1: 让 BudgetAccountant.downgrade() 真正生效——
      // 把 tier 选出的 modelId 透给 ChatService（缺省走 election）。
      model: modelOverride,
      // 没有 elected/tier model 时 fallback 走系统配置的默认 CHAT 模型
      modelType: modelOverride ? undefined : AIModelType.CHAT,
      // PR-Q: prompt-cache 自动化 —— 重复 prefix 1/10 价
      cachePolicy: "auto",
      sharedCachePrefix: cachePrefix
        ? {
            systemPromptText: cachePrefix.systemPromptText,
            toolDefinitions: cachePrefix.toolDefinitions,
          }
        : undefined,
      taskProfile: { creativity: "low", outputLength: "short" },
      responseFormat: "json",
      // BYOK 环境感知：userId 透给 chat() → 用户的 UserModelConfig 默认值优先
      userId,
      signal,
    });
    if (signal?.aborted) {
      throw new Error("ReAct loop aborted by signal");
    }
    const promptTokens = response.usage?.inputTokens ?? 0;
    const completionTokens = response.usage?.outputTokens ?? 0;
    // PR-I 修复 #5: cacheReadTokens 由 LLM 提供商返回（Anthropic / OpenAI 都支持）
    const cacheReadTokens = response.usage?.cacheReadTokens ?? 0;
    const costUsd = this.pricingRegistry
      ? this.pricingRegistry.estimateCost(
          response.model,
          promptTokens,
          completionTokens,
          cacheReadTokens,
        )
      : 0;
    return {
      decision: this.parseDecision(response.content),
      usage: { promptTokens, completionTokens, costUsd, cacheReadTokens },
    };
  }

  private parseDecision(raw: string): ParsedDecision {
    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    // LLM 偶尔违规返回多个 top-level JSON 对象（NDJSON-like）：
    //   {"thinking":"...", "action":{...}}
    //   {"thinking":"...", "action":{...}}
    // 普通 JSON.parse 会卡在第二个 { 报错。先尝试提取首个完整对象。
    text = this.extractFirstJsonObject(text) ?? text;
    try {
      const obj = JSON.parse(text) as {
        thinking?: unknown;
        action?: unknown;
        actions?: unknown;
      };
      const thinking = typeof obj.thinking === "string" ? obj.thinking : "";

      // Shorthand: top-level "actions" array → auto-wrap parallel_tool_call
      if (Array.isArray(obj.actions) && obj.actions.length > 0) {
        const calls = obj.actions
          .map((a) => this.normalizeToolCall(a))
          .filter((a): a is IToolCallAction => a !== null);
        if (calls.length === 0) {
          return {
            thinking,
            action: { kind: "finalize", output: "" },
          };
        }
        if (calls.length === 1) {
          return { thinking, action: calls[0] };
        }
        const action: IParallelToolCallAction = {
          kind: "parallel_tool_call",
          calls,
        };
        return { thinking, action };
      }

      const action = this.normalizeAction(obj.action);
      return { thinking, action };
    } catch (err) {
      this.logger.warn(
        `Failed to parse LLM decision as JSON; finalizing with raw. raw=${text.slice(0, 120)}...`,
      );
      return {
        thinking: "(unparseable LLM output, finalizing with raw text)",
        action: { kind: "finalize", output: raw },
      };
    }
  }

  /**
   * 扫描 text 找出首个完整的 top-level JSON 对象（平衡 { } 计数，
   * 跳过字符串字面量内的引号 / 转义）。
   * 用于 LLM 输出多个 JSON 对象时只取第一个；也兼容首部带闲聊文本的情况。
   * 返回 null 表示没找到完整对象。
   */
  private extractFirstJsonObject(text: string): string | null {
    let start = text.indexOf("{");
    if (start === -1) return null;
    while (start !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (inString) {
          if (ch === "\\") {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) return text.slice(start, i + 1);
        }
      }
      // 不平衡 → 从下一个 { 重试
      start = text.indexOf("{", start + 1);
    }
    return null;
  }

  private normalizeToolCall(action: unknown): IToolCallAction | null {
    if (!action || typeof action !== "object") return null;
    const a = action as Record<string, unknown>;
    if (typeof a.toolId === "string") {
      return {
        kind: "tool_call",
        toolId: a.toolId,
        input: (a.input as Record<string, unknown>) ?? {},
      };
    }
    return null;
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
    if (a.kind === "parallel_tool_call" && Array.isArray(a.calls)) {
      const calls = a.calls
        .map((c) => this.normalizeToolCall(c))
        .filter((c): c is IToolCallAction => c !== null);
      if (calls.length === 0) {
        return { kind: "finalize", output: "" };
      }
      const max =
        typeof a.maxConcurrency === "number" ? a.maxConcurrency : undefined;
      return { kind: "parallel_tool_call", calls, maxConcurrency: max };
    }
    if (a.kind === "finalize") {
      return {
        kind: "finalize",
        output: (a.output as string | Record<string, unknown>) ?? "",
      };
    }
    return { kind: "finalize", output: JSON.stringify(action) };
  }

  private async executeAction(
    action: IAction,
    envelope: IContextEnvelope,
    agentId: string,
    signal?: AbortSignal,
    allowedTools?: readonly string[],
    forbiddenTools?: readonly string[],
    parent?: IAgent,
    spawner?: ISubagentSpawner,
  ): Promise<IActionResult> {
    if (action.kind === "tool_call") {
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
      await this.hookRegistry.dispatch(
        "PostToolUse",
        { action, result },
        { agentId, envelope },
      );
      return result;
    }

    if (action.kind === "parallel_tool_call") {
      // PreToolUse fires per-call so policies can block individually
      const filteredCalls: IToolCallAction[] = [];
      for (const call of action.calls) {
        const pre = await this.hookRegistry.dispatch(
          "PreToolUse",
          { action: call },
          { agentId, envelope },
        );
        if (!pre.block) filteredCalls.push(call);
      }
      const filtered: IParallelToolCallAction = {
        kind: "parallel_tool_call",
        calls: filteredCalls,
        maxConcurrency: action.maxConcurrency,
      };
      const result = await this.toolInvoker.invokeMany(filtered, envelope, {
        agentId,
        signal,
        allowedTools,
        forbiddenTools,
      });
      // PostToolUse per sub-result for symmetric observability
      for (const sub of result.subResults ?? []) {
        await this.hookRegistry.dispatch(
          "PostToolUse",
          { action: sub.action, result: sub },
          { agentId, envelope },
        );
      }
      return result;
    }

    if (action.kind === "finalize") {
      return { action, output: action.output, latencyMs: 0 };
    }

    if (action.kind === "subagent_spawn") {
      const startMs = Date.now();
      if (!parent || !spawner) {
        return {
          action,
          output: undefined,
          error: new Error(
            "subagent_spawn: parent agent + spawner not wired into Loop options",
          ),
          latencyMs: 0,
        };
      }
      try {
        // Compose minimal ISubagentSpec from action fields. The child inherits
        // parent's identity except role.id is suffixed with the spawn name.
        const childIdentity = {
          ...parent.identity,
          role: {
            ...parent.identity.role,
            id: `${parent.identity.role.id}.${action.name}`,
          },
        };
        const handle = await spawner.spawn(parent, {
          name: action.name,
          identity: childIdentity,
          prompt: action.prompt,
          isolation: action.isolation,
          budget: action.budget
            ? {
                maxTokens: action.budget.tokens,
                maxIterations: action.budget.iterations,
              }
            : undefined,
        });
        // Drain handle.events so the child runs; collect final output.
        // Forwarding events to parent stream would change the loop contract,
        // so we just await result (parent sees subagent_spawn as a single
        // action_executed event with the aggregated output).
        const output = await handle.waitForResult();
        return {
          action,
          output,
          latencyMs: Date.now() - startMs,
        };
      } catch (err) {
        return {
          action,
          output: undefined,
          error: err instanceof Error ? err : new Error(String(err)),
          latencyMs: Date.now() - startMs,
        };
      }
    }

    return {
      action,
      output: undefined,
      error: new Error(`Action kind '${action.kind}' not yet supported`),
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

    const observations: IContextMessage[] = [];

    if (result.action.kind === "tool_call") {
      observations.push({
        role: "tool",
        content: this.stringifyObservation(result),
        name: result.action.toolId,
        timestamp: Date.now(),
      });
    } else if (result.action.kind === "parallel_tool_call") {
      // 每个子结果各自写回，模型下一轮可看到独立的 tool 输出
      for (const sub of result.subResults ?? []) {
        if (sub.action.kind === "tool_call") {
          observations.push({
            role: "tool",
            content: this.stringifyObservation(sub),
            name: sub.action.toolId,
            timestamp: Date.now(),
          });
        }
      }
    }

    if (envelope instanceof ContextEnvelope) {
      let next = envelope.append([assistantMsg]).envelope;
      if (observations.length > 0 && next instanceof ContextEnvelope) {
        next = next.append(observations).envelope;
      }
      return next;
    }

    const nextMessages = [...envelope.messages, assistantMsg, ...observations];
    return { ...envelope, messages: nextMessages };
  }

  private stringifyObservation(result: IActionResult): string {
    if (result.error) return `[tool error] ${result.error.message}`;
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
    return !/aborted/i.test(err.message);
  }

  private makeEvent(
    agentId: string,
    type: IAgentEvent["type"],
    payload: unknown,
  ): IAgentEvent {
    return { type, agentId, timestamp: Date.now(), payload };
  }
}
