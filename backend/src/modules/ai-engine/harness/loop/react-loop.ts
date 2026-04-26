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

/**
 * 标记 LLM JSON 响应里的 action 字段无法规范化成合法 IAction
 * （缺字段 / kind 不识别 / parallel_tool_call 无 calls 等）。
 *
 * 由 parseDecision 的 catch 分支接住，转成
 * `thinking="(unparseable LLM output, finalizing with raw text)"` + 把 raw
 * 当 finalize.output。这样：
 *   - thinking 非空 → 不会触发 react-loop 的 empty-finalize 熔断
 *   - loop 走正常 finalize 终止 → ReflexionLoop 看到空/退化 output 后
 *     按"空 output → critique → revise"链路重试，而不是被立即 abort。
 *
 * 历史 bug：normalizeAction 把这些退化情况硬合成 `{kind:"finalize", output:""}`，
 * 让 LLM 一次 safety-filter refusal / 输出截断 / 字段缺失都被熔断秒杀，
 * 失去 ReflexionLoop 重试和上层 model fallback 的机会。
 */
class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
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
      /** Spec 声明的 TaskProfile —— reason() 内 chat() 用 agent 真实意图 */
      taskProfile?: import("../../llm/types/task-profile").TaskProfile;
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "unknown-agent";
    const allowedTools = options?.allowedTools;
    const forbiddenTools = options?.forbiddenTools;
    const budget = options?.budget;
    const specTaskProfile = options?.taskProfile;
    let currentEnvelope = envelope;
    let iteration = 0;
    let budgetWarned = false;
    /**
     * 连续空 LLM 响应计数器 —— 检测 "model 不存在 / API 拒绝 / 输出被过滤" 场景：
     * LLM 每次返回 completion="" + 立即 finalize 空结果。连续 2 次后 abort。
     */
    let consecutiveEmptyLLM = 0;
    let lastModelId: string | undefined;

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
        /** null = 模型未在 ModelPricingRegistry 注册（DB 缺 costTier/价格），无法计算 */
        costUsd: number | null;
        cacheReadTokens: number;
        modelId?: string;
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
          // Spec 声明的 TaskProfile（如 researcher='long' / leader='medium'）
          specTaskProfile,
        );
        decision = reasoned.decision;
        usage = reasoned.usage;
        if (usage.modelId) lastModelId = usage.modelId;

        // ★ 诊断：解析层兜底抛错（正常情况 parseDecision 会 catch JSON.parse /
        // InvalidActionError 自己包装。如果走到这条说明 catch 之外的异常）
        if (reasoned.parseError) {
          this.logger.error(
            `[${agentId}] iter=${iteration} parseDecision threw: ` +
              `${reasoned.parseError.name}: ${reasoned.parseError.message}; ` +
              `rawContent=${reasoned.rawContent.slice(0, 500)}`,
          );
        }

        // 熔断：检测「LLM 立即 finalize 空结果 + thinking 也空」——
        //   (a) BYOK model id 不存在 / API 拒绝 → 返回最简 fallback JSON
        //   (b) reasoning model 内部 CoT 吃光 max_completion_tokens
        //   (c) response_format=json_object 强制下，model 憋出最简空 JSON 假装完成
        //
        // 防 false-positive：thinking 非空说明 LLM 在思考，可能合理 finalize；
        // 只有 thinking="" + output 空 + 连续 2 次 才 abort。
        let isEmptyResponse = false;
        if (
          decision.action.kind === "finalize" &&
          decision.thinking.trim() === ""
        ) {
          const out = decision.action.output;
          isEmptyResponse =
            !out ||
            (typeof out === "string" && out.trim() === "") ||
            (typeof out === "object" && Object.keys(out).length === 0);
        }
        if (isEmptyResponse) {
          consecutiveEmptyLLM += 1;

          // ★ 诊断关键：把 LLM 实际吐回的 raw content 写到日志和 error payload，
          // 让上层 / DB / 前端都能看到根因证据，不再靠"应该是 (a)/(b)/(c)"猜。
          const rawSnippet = reasoned.rawContent.slice(0, 1000);
          this.logger.error(
            `[${agentId}] iter=${iteration} EMPTY_LLM_RESPONSE — ` +
              `model=${lastModelId ?? "unknown"} ` +
              `completion=${usage.completionTokens}tk prompt=${usage.promptTokens}tk ` +
              `parseErr=${reasoned.parseError ? `${reasoned.parseError.name}:${reasoned.parseError.message}` : "none"} ` +
              `rawContent=${JSON.stringify(rawSnippet)}`,
          );

          yield this.makeEvent(agentId, "error", {
            message:
              `LLM "${lastModelId ?? "unknown"}" finalize 空结果 ` +
              `(completion=${usage.completionTokens}tk, thinking="")。` +
              `根因证据：rawContent=${JSON.stringify(rawSnippet)}` +
              (reasoned.parseError
                ? ` parseError=${reasoned.parseError.name}:${reasoned.parseError.message}`
                : "") +
              `。常见模式：(a) completion≈0 → model id 不存在/API 返错被吞；` +
              `(b) completion≫0 但 visible 空 → reasoning CoT 撞 max_completion_tokens；` +
              `(c) safety filter 拦截 → 退化 JSON {} 假装合规。`,
            recoverable: false,
            // 诊断字段：上游 trace event 持久化后可在 DB 直接查到
            diagnostic: {
              modelId: lastModelId,
              completionTokens: usage.completionTokens,
              promptTokens: usage.promptTokens,
              rawContent: rawSnippet,
              parseError: reasoned.parseError,
              consecutiveEmptyLLM,
              iteration,
            },
          });
          yield this.makeEvent(agentId, "terminated", {
            reason: "empty_llm_response",
          });
          return;
        } else {
          // 重置连续空响应计数：跨非连续 empty 不累计（empty / good / empty 应记 1，不是 2）
          consecutiveEmptyLLM = 0;
        }
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
        // 真实模型 id（供 UI 展示「这个 agent 在用什么模型」）
        modelId: usage.modelId,
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
    /** Spec 声明的 TaskProfile —— 优先用 agent 真实意图，缺省走 medium */
    specTaskProfile?: import("../../llm/types/task-profile").TaskProfile,
  ): Promise<{
    decision: ParsedDecision;
    /** ★ LLM 实际吐回的 raw content（response.content），诊断关键 */
    rawContent: string;
    /** parseDecision 兜底层抛错时的诊断信息（正常 catch 转 finalize 时为 undefined） */
    parseError?: { name: string; message: string };
    usage: {
      promptTokens: number;
      completionTokens: number;
      /** null = 模型未在 ModelPricingRegistry 注册（DB 缺 costTier/价格） */
      costUsd: number | null;
      cacheReadTokens: number;
      modelId?: string;
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
      // 优先用 agent spec 声明的 TaskProfile —— researcher="long" / leader="medium"
      // 等都按业务方意图走，不再被 Loop 硬编码覆盖。
      // 缺省走 medium（≥16k tokens），避免 reasoning 模型 CoT 撑爆 visible output。
      taskProfile: specTaskProfile ?? {
        creativity: "low",
        outputLength: "medium",
      },
      // ★ Harness 调用必须 strict —— LLM 出错就抛 exception，让 ReActLoop catch
      // 后明确发 error 事件 + terminated reason="error"。
      // 否则 AiChatService 会把 throw 转成 "**API 调用失败**..." fake content，
      // ReActLoop 收到非空 content 误以为成功，进 parseDecision 失败 → finalize
      // raw text → 误导 trace。
      strictMode: true,
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
    // estimateCost 未注册 modelId 返回 null —— 不假装 0（会让 BudgetAccountant 假账）
    // null 透给 caller，BudgetAccountant.accountLLM 内部决定如何处理（仍计 token，cost 不增）
    const costUsd =
      this.pricingRegistry?.estimateCost(
        response.model,
        promptTokens,
        completionTokens,
        cacheReadTokens,
      ) ?? null;
    // ★ 诊断关键：把 LLM 原始 content 一并返回，让上层在所有 error / empty 路径
    // 都能把 "LLM 实际吐了啥" 带进 event payload 和日志，避免再靠代码反推。
    const rawContent = response.content ?? "";
    let parseError: { name: string; message: string } | undefined;
    let decision: ParsedDecision;
    try {
      decision = this.parseDecision(rawContent);
    } catch (err) {
      // parseDecision 自身不抛，但保险兜底
      parseError = {
        name: err instanceof Error ? err.name : "Unknown",
        message: err instanceof Error ? err.message : String(err),
      };
      decision = {
        thinking: "(parser threw — see parseError)",
        action: { kind: "finalize", output: rawContent },
      };
    }
    return {
      decision,
      rawContent,
      parseError,
      usage: {
        promptTokens,
        completionTokens,
        costUsd,
        cacheReadTokens,
        modelId: response.model,
      },
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
          // ★ 不再硬合成假 finalize —— actions 数组里没合法 tool 调用属于
          // LLM 输出格式异常，应走 catch 分支让 ReflexionLoop 有机会重试。
          throw new InvalidActionError(
            "LLM returned 'actions' array with no valid tool calls",
          );
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
      // ★ 诊断：完整记录 raw content（最多 1000 字符）+ 错误类型，
      // 让 InvalidActionError vs SyntaxError 一目了然。
      const errName = err instanceof Error ? err.name : "Unknown";
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to parse LLM decision (${errName}: ${errMsg}); ` +
          `falling back to finalize-raw. ` +
          `text(first 1000)=${JSON.stringify(text.slice(0, 1000))}`,
      );
      return {
        thinking: `(unparseable LLM output, finalizing with raw text — ${errName}: ${errMsg})`,
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

  /**
   * 把 LLM JSON 里的 action 字段规范化为 IAction。
   *
   * ★ 设计原则：**只接受 LLM 主动声明的合法 action**（kind = tool_call /
   * parallel_tool_call / finalize）。所有"格式不对 / 缺字段 / kind 不识别"
   * 的退化情况一律抛 InvalidActionError，由 parseDecision 的 catch 分支接住。
   *
   * 不再把退化情况偷偷合成 `{kind:"finalize", output:""}` —— 那样会让
   * react-loop 的 empty-finalize 熔断把"LLM 一次 safety refusal / 截断"
   * 误判成"LLM 主动选 finalize 空"，立即 abort，绕过 ReflexionLoop 重试链。
   */
  private normalizeAction(action: unknown): IAction {
    if (!action || typeof action !== "object") {
      throw new InvalidActionError(
        `LLM response missing valid 'action' field (got ${typeof action})`,
      );
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
        throw new InvalidActionError(
          "LLM returned parallel_tool_call with no valid tool calls",
        );
      }
      const max =
        typeof a.maxConcurrency === "number" ? a.maxConcurrency : undefined;
      return { kind: "parallel_tool_call", calls, maxConcurrency: max };
    }
    if (a.kind === "finalize") {
      // 仅当 LLM 显式声明 kind="finalize" 时才认为是主动 finalize；
      // 此时 output="" 是 LLM 自己的合法决定（少见但允许）。
      return {
        kind: "finalize",
        output: (a.output as string | Record<string, unknown>) ?? "",
      };
    }
    throw new InvalidActionError(
      `LLM returned unknown action kind: ${JSON.stringify(a.kind)}`,
    );
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
