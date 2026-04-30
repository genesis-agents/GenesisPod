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
  HarnessFailureCode,
  IAgentEvent,
  IAgentLoop,
  IAction,
  IActionResult,
  IContextEnvelope,
  IContextMessage,
  ILoopTerminationCriteria,
  IParallelToolCallAction,
  IToolCallAction,
} from "../../kernel/abstractions";
import { ContextEnvelope } from "../../kernel/core/context-envelope";
import { extractJsonFromAIResponse } from "../../../../common/utils/json-extraction.utils";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import type { ChatMessage } from "../../../ai-engine/llm/types";
import { AIModelType } from "@prisma/client";
import { ToolInvoker } from "../../execution/executor/tool-invoker";
import { ContextManager } from "../../execution/context/context-manager";
import { CacheControlPlanner } from "../../execution/context/cache-control-planner";
import { HookRegistry } from "../../kernel/core/hook-registry";
import { BudgetAccountant } from "../../runtime/budget/budget-accountant";
import { ModelPricingRegistry } from "../../runtime/budget/model-pricing-registry";
import type { IAgent, ISubagentSpawner } from "../../kernel/abstractions";

interface ParsedDecision {
  thinking: string;
  action: IAction;
}

/**
 * 标记 LLM JSON 响应里的 action 字段无法规范化成合法 IAction。
 *
 * subCode 细分：
 *   - missing_action       缺 action 字段或非对象
 *   - unknown_kind         kind 不在合法集合里
 *   - empty_parallel_calls parallel_tool_call.calls 没合法 tool
 *   - empty_actions_array  shorthand actions[] 没合法 tool
 *
 * 由 parseDecision 的 catch 分支接住，转成
 * `thinking="(unparseable LLM output, finalizing with raw text)"` + 把 raw
 * 当 finalize.output。这样：
 *   - thinking 非空 → 不会触发 react-loop 的 empty-finalize 熔断
 *   - loop 走正常 finalize 终止 → ReflexionLoop 看到空/退化 output 后
 *     按"空 output → critique → revise"链路重试，而不是被立即 abort。
 */
class InvalidActionError extends Error {
  readonly subCode:
    | "missing_action"
    | "unknown_kind"
    | "empty_parallel_calls"
    | "empty_actions_array";
  constructor(
    message: string,
    subCode: InvalidActionError["subCode"] = "missing_action",
  ) {
    super(message);
    this.name = "InvalidActionError";
    this.subCode = subCode;
  }
}

const DECISION_SYSTEM_SUFFIX = `

## Decision Protocol

You MUST reply with a single JSON object that has EXACTLY this two-level wrapper:
{
  "thinking": "<short reasoning string>",
  "action": { "kind": "...", ... }
}

DO NOT put the action content at the top level. WRONG:
  {"kind":"tool_call","toolId":"...","input":{...}}     ← missing wrapper
  {"kind":"parallel_tool_call","calls":[...]}           ← missing wrapper
RIGHT:
  {"thinking":"I will search","action":{"kind":"tool_call","toolId":"...","input":{...}}}
  {"thinking":"I will run two searches","action":{"kind":"parallel_tool_call","calls":[...]}}

The "action" field must be EXACTLY one of these 3 kinds:

  1. Single tool call (refer to <available_tools> for real toolId + input shape;
     each tool entry shows an "example:" line — copy that wrapping verbatim):
     { "kind": "tool_call", "toolId": "<exact toolId from available_tools>", "input": { ... } }

  2. Multiple tools in one turn (independent, no result feeds another — much faster):
     { "kind": "parallel_tool_call", "calls": [
         { "toolId": "<id-from-available_tools>", "input": { ... } },
         { "toolId": "<another-id>", "input": { ... } }
       ] }

  3. Finalize with the final answer (use this when no more tool calls are needed):
     { "kind": "finalize", "output": <final answer matching the required output schema> }

Shorthand: you may also send "actions": [<tool_call>, <tool_call>, ...] at the
top level — it will be auto-wrapped to parallel_tool_call.

Rules:
- Respond with raw JSON only, no markdown fences, no prose outside the JSON.
- If all information is sufficient, use "finalize".
- Do not invent tool ids; only use ones listed in <available_tools>. Each
  catalog entry has an "example:" line — copy that shape literally and replace
  placeholders with real values.
- If a tool failed previously, choose a different tool or finalize gracefully.
- Only the 3 action kinds above are supported. Do NOT emit "skill_invoke",
  "subagent_spawn", or "llm_generate" — these are reserved internals.
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
      taskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile;
      /**
       * ★ 内容驱动的退出闸：finalize 时框架先用 outputSchema 校验，
       * 失败则注入 critique reminder 让 LLM 直接补缺（continue loop）。
       * 通过才真正退出。Spec 通过 agent-runner 透传。
       */
      outputSchemaValidator?: (
        output: unknown,
      ) => { ok: true } | { ok: false; issues: string };
      /**
       * 业务级 sanity check（可选，比 schema 更严的语义校验，如 source 必须含 http、
       * findings 数量下限等）。返回非空 issues 字符串就 reject。
       */
      validateBusinessRules?: (output: unknown) => string | null | undefined;
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "unknown-agent";
    const allowedTools = options?.allowedTools;
    const forbiddenTools = options?.forbiddenTools;
    const budget = options?.budget;
    const specTaskProfile = options?.taskProfile;
    const outputSchemaValidator = options?.outputSchemaValidator;
    const validateBusinessRules = options?.validateBusinessRules;
    let currentEnvelope = envelope;
    let iteration = 0;
    let budgetWarned = false;
    /**
     * ★ 防死循环：LLM 反复 finalize 但 schema 总不通过的次数。
     * ≥ MAX_FINALIZE_REJECTS 时强制退出，避免 LLM "我又改了" 死循环。
     */
    let finalizeRejectCount = 0;
    const MAX_FINALIZE_REJECTS = 3;
    /**
     * 连续空 LLM 响应计数器 —— 检测 "model 不存在 / API 拒绝 / 输出被过滤" 场景：
     * LLM 每次返回 completion="" + 立即 finalize 空结果。连续 2 次后 abort。
     */
    let consecutiveEmptyLLM = 0;
    let lastModelId: string | undefined;

    // ─── Phase P0-2: 多重出口闸 ─────────────────────────────────
    /** Wall-time 监控（mission-pipeline-exit-policy.md D9）—— 默认 180s/stage */
    const wallTimeStart = Date.now();
    // ★ 默认 300s（5 min）—— 研究类 agent 需多次 tool_call（每次 web-search/scrape 5-30s），
    //   180s 在 quick+low 档下经常擦边。spec 可显式覆盖 maxWallTimeMs。
    const wallTimeLimitMs = criteria.maxWallTimeMs ?? 300_000;
    /** 同 toolId 连续失败计数（mission-pipeline-tool-failure-circuit.md D7=3）*/
    const TOOL_CIRCUIT_THRESHOLD = 3;
    const toolFailureCounters = new Map<string, number>();

    /**
     * ★ Phase P1 fix (2026-04-29)：记录上一轮 action kind 给 iteration_progress 事件
     * 用，让前端 UI 可视化"researcher 正在第 12/15 轮，还在 search"。
     */
    let lastActionKind: string | undefined;

    while (iteration < criteria.maxIterations) {
      iteration += 1;

      // 0a. signal check
      if (options?.signal?.aborted) {
        yield this.makeEvent(agentId, "terminated", { reason: "cancelled" });
        return;
      }

      // ─── Phase P1 fix (2026-04-29 mission 8c7b4358)：iteration_progress emit ───
      // 让上层（mission 事件流 / 前端 UI）每轮都能感知 ReAct 进度，避免 ReAct 长时间
      // 内部 search 时外部看起来像死掉。approachingLimit=true 时同时在 envelope 里
      // 注入 system reminder 强力提示 LLM finalize（见下方 0d）。
      const approachingLimit =
        criteria.maxIterations - iteration <= 2 && criteria.maxIterations > 3;
      yield this.makeEvent(agentId, "iteration_progress", {
        iteration,
        maxIterations: criteria.maxIterations,
        progress:
          criteria.maxIterations > 0 ? iteration / criteria.maxIterations : 0,
        approachingLimit,
        lastActionKind,
      });

      // 0d. ★ Phase P1 fix：逼近 maxIterations 时强力 nudge LLM finalize
      //   原 case (mission 8c7b4358)：researcher#0 在 retry 阶段跑 60+ ReAct 拍
      //   始终 parallel_tool_call 不 finalize。原因：leader critique 太刚性 + LLM
      //   没拿到"剩余轮数"信号。这里在 envelope 里临时注入 reminder，让 LLM
      //   在剩 ≤ 2 轮时**必须**选 finalize。
      if (approachingLimit && currentEnvelope instanceof ContextEnvelope) {
        const remaining = criteria.maxIterations - iteration + 1;
        const nudge =
          `[ITERATION BUDGET WARNING] You have ${remaining} iteration(s) left out of ${criteria.maxIterations}. ` +
          `On THIS turn, you MUST emit { "kind": "finalize", "output": {...} } using whatever tool results you ` +
          `already have. Do NOT start a new tool_call or parallel_tool_call. ` +
          `If your output is incomplete, finalize anyway and note the gap in the summary field — ` +
          `the framework will accept partial results rather than letting you exhaust the budget.`;
        currentEnvelope = currentEnvelope.append([
          {
            role: "user",
            content: nudge,
            timestamp: Date.now(),
          },
        ]).envelope;
      }

      // 0a'. wall-time check（exit-policy.md ExitReason='wall_time_exceeded'）
      if (wallTimeLimitMs && Date.now() - wallTimeStart >= wallTimeLimitMs) {
        yield this.makeEvent(agentId, "error", {
          message: `ReActLoop wall-time exceeded (${Date.now() - wallTimeStart}ms >= ${wallTimeLimitMs}ms)`,
          recoverable: false,
          failureCode: "RUNNER_WALL_TIME_EXCEEDED",
          diagnostic: {
            elapsedMs: Date.now() - wallTimeStart,
            wallTimeLimitMs,
            iteration,
            modelId: lastModelId,
          },
        });
        yield this.makeEvent(agentId, "output", {
          output: this.extractLastAssistantMessage(currentEnvelope) ?? "",
        });
        yield this.makeEvent(agentId, "terminated", { reason: "budget" });
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
        // ★ emit 结构化 error event：trace 看到 LOOP_BUDGET_EXHAUSTED 而不是
        // 只有终态 reason="budget"，便于跨层因果链统计。
        yield this.makeEvent(agentId, "error", {
          message: `ReActLoop budget exhausted (${budget.snapshot().tokensUsed} tokens used)`,
          recoverable: hint?.action === "retry" || hint?.action === "downgrade",
          failureCode: "LOOP_BUDGET_EXHAUSTED",
          diagnostic: {
            tokensUsed: budget.snapshot().tokensUsed,
            costUsd: budget.snapshot().costUsd,
            currentTier: budget.snapshot().currentTier,
            iteration,
          },
          recoveryHint: hint
            ? {
                action:
                  hint.action === "downgrade"
                    ? "switch_model"
                    : hint.action === "notify_user"
                      ? "abort"
                      : hint.action,
                reason: hint.reason,
                fallbackModelId: hint.fallbackModelId,
                retryAfterMs: hint.retryAfterMs,
              }
            : undefined,
        });
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

          // ★ 失败码分类（按 completion tokens + parseError 区分子类）
          const TINY_COMPLETION_THRESHOLD = 100;
          let failureCode: HarnessFailureCode;
          let fallbackReason:
            | "empty_response"
            | "reasoning_exhaustion"
            | "safety_refusal"
            | "parse_failure";
          if (usage.completionTokens < TINY_COMPLETION_THRESHOLD) {
            // completion≈0 → API 拒绝/model 死了
            failureCode = "LOOP_EMPTY_RESPONSE_IMMEDIATE";
            fallbackReason = "empty_response";
          } else if (reasoned.parseError) {
            // completion≫0 + parser 抛错 → 解析失败
            // InvalidActionError 自带 subCode 4 类细分，对齐 4 个 PARSE_* 码
            if (reasoned.parseError.name === "InvalidActionError") {
              const sub = (reasoned.parseError as { subCode?: string }).subCode;
              failureCode =
                sub === "unknown_kind"
                  ? "PARSE_UNKNOWN_ACTION_KIND"
                  : sub === "empty_parallel_calls" ||
                      sub === "empty_actions_array"
                    ? "PARSE_EMPTY_ACTIONS_ARRAY"
                    : "PARSE_MISSING_ACTION";
            } else {
              failureCode = "PARSE_MALFORMED_JSON";
            }
            fallbackReason = "parse_failure";
          } else {
            // completion≫0 且 parse 成功但 visible 空 → reasoning CoT 撞墙 / safety
            // 优先按 reasoning_exhaustion 处理，让 adapter 切到非 reasoning 模型
            failureCode = "LOOP_REASONING_COT_EXHAUSTION";
            fallbackReason = "reasoning_exhaustion";
          }

          this.logger.error(
            `[${agentId}] iter=${iteration} ${failureCode} — ` +
              `model=${lastModelId ?? "unknown"} ` +
              `completion=${usage.completionTokens}tk prompt=${usage.promptTokens}tk ` +
              `parseErr=${reasoned.parseError ? `${reasoned.parseError.name}:${reasoned.parseError.message}` : "none"} ` +
              `rawContent=${JSON.stringify(rawSnippet)}`,
          );

          // ★ 接通 model fallback：问 runtimeEnv 拿恢复建议
          const recoveryHint = await currentEnvelope.runtimeEnv
            ?.suggestFallback({
              failedModelId: lastModelId,
              reason: fallbackReason,
            })
            .catch(() => null);

          yield this.makeEvent(agentId, "error", {
            message:
              `LLM "${lastModelId ?? "unknown"}" finalize 空结果 [${failureCode}] ` +
              `(completion=${usage.completionTokens}tk, thinking="")。` +
              `证据：rawContent=${JSON.stringify(rawSnippet)}` +
              (reasoned.parseError
                ? ` parseError=${reasoned.parseError.name}:${reasoned.parseError.message}`
                : "") +
              (recoveryHint
                ? `。恢复建议：${recoveryHint.action} (${recoveryHint.reason})`
                : ""),
            recoverable:
              recoveryHint?.action === "retry" ||
              recoveryHint?.action === "downgrade",
            failureCode,
            diagnostic: {
              modelId: lastModelId,
              completionTokens: usage.completionTokens,
              promptTokens: usage.promptTokens,
              rawContent: rawSnippet,
              parseError: reasoned.parseError,
              consecutiveEmptyLLM,
              iteration,
            },
            recoveryHint: recoveryHint
              ? {
                  action:
                    recoveryHint.action === "downgrade"
                      ? "switch_model"
                      : recoveryHint.action === "notify_user"
                        ? "abort"
                        : recoveryHint.action,
                  reason: recoveryHint.reason,
                  fallbackModelId: recoveryHint.fallbackModelId,
                  retryAfterMs: recoveryHint.retryAfterMs,
                }
              : undefined,
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

        // ★ 失败码归类：从异常消息推断 provider 错误类型
        let failureCode: HarnessFailureCode = "PROVIDER_API_ERROR";
        let fallbackReason:
          | "rate_limit"
          | "model_not_found"
          | "context_too_long"
          | "outage" = "outage";
        if (/rate.?limit|429|too many requests/i.test(message)) {
          failureCode = "PROVIDER_RATE_LIMIT";
          fallbackReason = "rate_limit";
        } else if (/model.*not.*found|invalid model|404/i.test(message)) {
          failureCode = "PROVIDER_BYOK_MODEL_NOT_FOUND";
          fallbackReason = "model_not_found";
        } else if (/context.*length|too long|maximum context/i.test(message)) {
          failureCode = "PROVIDER_TRUNCATED";
          fallbackReason = "context_too_long";
        }

        const recoveryHint =
          !aborted && currentEnvelope.runtimeEnv
            ? await currentEnvelope.runtimeEnv
                .suggestFallback({
                  failedModelId: lastModelId,
                  reason: fallbackReason,
                })
                .catch(() => null)
            : null;

        this.logger.error(
          `[${agentId}] iter=${iteration} ${failureCode} — ${message}`,
        );

        yield this.makeEvent(agentId, "error", {
          message,
          recoverable:
            !aborted &&
            (recoveryHint?.action === "retry" ||
              recoveryHint?.action === "downgrade"),
          failureCode: aborted ? "UNKNOWN" : failureCode,
          diagnostic: {
            modelId: lastModelId,
            iteration,
            errorMessage: message,
            errorStack: err instanceof Error ? err.stack : undefined,
          },
          recoveryHint: recoveryHint
            ? {
                action:
                  recoveryHint.action === "downgrade"
                    ? "switch_model"
                    : recoveryHint.action === "notify_user"
                      ? "abort"
                      : recoveryHint.action,
                reason: recoveryHint.reason,
                fallbackModelId: recoveryHint.fallbackModelId,
                retryAfterMs: recoveryHint.retryAfterMs,
              }
            : undefined,
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
      // 记录 action kind 给下一轮 iteration_progress 事件用
      lastActionKind = decision.action.kind;

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

      // ─── Phase P0-2: failed_tool 熔断（D7=3）──
      // tool_call / parallel_tool_call 中任一同 toolId 连续失败 N 次 → exit
      const toolIdsTouched: string[] = [];
      if (decision.action.kind === "tool_call") {
        toolIdsTouched.push(decision.action.toolId);
      } else if (decision.action.kind === "parallel_tool_call") {
        for (const c of decision.action.calls) {
          toolIdsTouched.push(c.toolId);
        }
      }
      if (toolIdsTouched.length > 0) {
        const hasError = !!actionResult.error;
        for (const tid of toolIdsTouched) {
          if (hasError) {
            const c = (toolFailureCounters.get(tid) ?? 0) + 1;
            toolFailureCounters.set(tid, c);
            if (c >= TOOL_CIRCUIT_THRESHOLD) {
              yield this.makeEvent(agentId, "error", {
                message: `Tool '${tid}' failed ${c} times consecutively (circuit broken)`,
                recoverable: false,
                failureCode: "TOOL_RUNTIME_ERROR",
                diagnostic: {
                  toolId: tid,
                  consecutiveFailures: c,
                  iteration,
                  lastError: actionResult.error?.message,
                },
                recoveryHint: {
                  action: "switch_model",
                  reason:
                    "Tool service unavailable; try alternative model or skip this tool",
                },
              });
              yield this.makeEvent(agentId, "output", {
                output: this.extractLastAssistantMessage(currentEnvelope) ?? "",
              });
              yield this.makeEvent(agentId, "terminated", { reason: "error" });
              return;
            }
          } else {
            toolFailureCounters.set(tid, 0);
          }
        }
      }

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

        // ★ 内容驱动的退出闸：finalize 时框架先校验 outputSchema +
        //   validateBusinessRules，不达标就注入精准 critique reminder 让 LLM
        //   "原地补缺"（不重启 ReActLoop，复用已有 envelope 的工具结果）。
        //   这是替代"机械限轮次"的退出机制：让"内容是否符合要求"成为唯一退出
        //   标准，避免 LLM 反复瞎搜或瞎 finalize。
        const issuesParts: string[] = [];
        if (outputSchemaValidator) {
          const schemaResult = outputSchemaValidator(output);
          if (!schemaResult.ok)
            issuesParts.push(`Schema: ${schemaResult.issues}`);
        }
        if (validateBusinessRules) {
          const businessIssue = validateBusinessRules(output);
          if (businessIssue) issuesParts.push(`Business: ${businessIssue}`);
        }
        if (issuesParts.length > 0) {
          finalizeRejectCount += 1;
          // ★ Phase P0-10: emit validation_failed 事件（baseline §1.3）
          yield this.makeEvent(agentId, "validation_failed", {
            rejectCount: finalizeRejectCount,
            maxRejects: MAX_FINALIZE_REJECTS,
            issues: issuesParts.join("; "),
            candidateOutput: output,
          });
          // 防死循环：连续 N 次 finalize 不达标 → 强制退出，不再让 LLM 改
          if (finalizeRejectCount >= MAX_FINALIZE_REJECTS) {
            this.logger.warn(
              `[${agentId}] finalize rejected ${finalizeRejectCount} times in a row, ` +
                `accepting current candidate to avoid infinite loop. issues=${issuesParts.join("; ")}`,
            );
            // ★ Phase P0-2: 标记为 validation_rejected_max（exit-policy.md）
            yield this.makeEvent(agentId, "error", {
              message: `finalize 校验闸 reject 达上限 ${MAX_FINALIZE_REJECTS}，强制接受次优产物`,
              recoverable: false,
              failureCode: "RUNNER_OUTPUT_SCHEMA_MISMATCH",
              diagnostic: {
                rejectCount: finalizeRejectCount,
                lastIssues: issuesParts.join("; "),
              },
            });
            yield this.makeEvent(agentId, "output", { output: output ?? "" });
            yield this.makeEvent(agentId, "terminated", {
              reason: "completed",
            });
            return;
          }
          // 注入精准 critique reminder：告诉 LLM 缺什么，要它**直接补缺**而非重新搜
          const critique =
            `[FINALIZE REJECTED ${finalizeRejectCount}/${MAX_FINALIZE_REJECTS}] Your finalize.output failed validation:\n` +
            issuesParts.map((p) => `  - ${p}`).join("\n") +
            `\n\nDO NOT rerun tools. Use the tool results already in this conversation to ` +
            `produce a corrected finalize that addresses the issues above. ` +
            `If the existing tool results genuinely don't have the needed information, ` +
            `you may emit ONE focused tool_call to fill the specific gap (do not search broadly).`;
          this.logger.log(
            `[${agentId}] finalize rejected (${finalizeRejectCount}/${MAX_FINALIZE_REJECTS}): ${issuesParts.join("; ").slice(0, 200)}`,
          );
          if (currentEnvelope instanceof ContextEnvelope) {
            currentEnvelope = currentEnvelope.append([
              {
                role: "user",
                content: critique,
                timestamp: Date.now(),
              },
            ]).envelope;
          }
          // 不退出，继续 loop —— LLM 看到 critique 后下一轮直接补
          continue;
        }

        // 通过校验 → 真正退出
        yield this.makeEvent(agentId, "output", { output: output ?? "" });
        yield this.makeEvent(agentId, "terminated", { reason: "completed" });
        return;
      }

      if (actionResult.error && !this.isRecoverable(actionResult.error)) {
        const errMsg = actionResult.error.message;
        // ★ 优先用 ToolInvoker 在 IActionResult 上贴的 failureCode；缺省再做文本推断
        const failureCode: HarnessFailureCode =
          (actionResult.failureCode as HarnessFailureCode | undefined) ??
          (/timeout|timed out/i.test(errMsg)
            ? "TOOL_TIMEOUT"
            : /not found|unknown tool/i.test(errMsg)
              ? "TOOL_NOT_FOUND"
              : /invalid input|validation/i.test(errMsg)
                ? "TOOL_INPUT_VALIDATION_FAILED"
                : "TOOL_RUNTIME_ERROR");

        const toolId =
          decision.action.kind === "tool_call"
            ? decision.action.toolId
            : undefined;

        this.logger.error(
          `[${agentId}] iter=${iteration} ${failureCode} ` +
            `tool=${toolId ?? "?"} err=${errMsg}`,
        );

        // ★ 接通 fallback：tool 失败可由 runtimeEnv 给恢复建议
        const recoveryHint = await currentEnvelope.runtimeEnv
          ?.suggestFallback({ reason: "tool_failure" })
          .catch(() => null);

        yield this.makeEvent(agentId, "error", {
          message: errMsg,
          recoverable: recoveryHint?.action === "retry",
          failureCode,
          diagnostic: {
            toolId,
            toolError: errMsg,
            iteration,
            // ★ 把 ToolInvoker 在 IActionResult.diagnostic 上贴的字段冒泡
            ...(actionResult.diagnostic ?? {}),
          },
          recoveryHint: recoveryHint
            ? {
                action:
                  recoveryHint.action === "downgrade"
                    ? "switch_model"
                    : recoveryHint.action === "notify_user"
                      ? "abort"
                      : recoveryHint.action,
                reason: recoveryHint.reason,
                fallbackModelId: recoveryHint.fallbackModelId,
                retryAfterMs: recoveryHint.retryAfterMs,
              }
            : undefined,
        });
        yield this.makeEvent(agentId, "terminated", { reason: "error" });
        return;
      }
    }

    // 走到这里 = 跑完 maxIterations 没 finalize；保险起见 emit 一个 LOOP_MAX_ITERATIONS
    // 错误事件，让上层 trace 能看到为什么以 "error" reason 退出。
    //
    // ★ P0-LIVE-MAX-ITER (2026-04-30): 旧版 emit output=lastAssistantMessage 然后
    //   terminated:budget → runner extractLegacyMetrics 把 reason="budget" 推断成
    //   legacyState="completed" → 上游 stage 看到 state="completed" + output=空字符串
    //   或最后一条 tool_call decision JSON → schema 校验已经过了才发现是垃圾。
    //   实测 mission 79b7de75 researcher#0 run=9 iter 永不 finalize，最后 output 是
    //   parallel_tool_call 的 raw decision JSON 不是 finding[]。
    //   修复：terminated reason="error" 让 runner 落到 legacyState="failed"，
    //   stage 才能正确走 dimension:degraded 兜底而不是把垃圾当 finding。
    this.logger.warn(
      `[${agentId}] reached maxIterations=${criteria.maxIterations} without finalize`,
    );
    yield this.makeEvent(agentId, "error", {
      message: `reached maxIterations=${criteria.maxIterations} without finalize`,
      recoverable: false,
      failureCode: "LOOP_MAX_ITERATIONS",
      diagnostic: {
        modelId: lastModelId,
        iteration,
      },
    });
    yield this.makeEvent(agentId, "terminated", { reason: "error" });
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
    // ★ 删除 envelope.tools 追加的降级版工具列表。
    // catalog block（在 envelope.system 里）已经有完整 <available_tools> 含
    // description + input schema + invocation example。这里再追加只有 id 的
    // 第二份会让 LLM 看到工具列表 2 遍 → 困惑"哪份准？"，可能引用降级版的
    // 不完整信息生成错误 action。
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
    specTaskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile,
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
      // ★ Harness 内部 agent-to-agent 编排，不是用户原始输入；guardrails
      // 对内部系统 prompt 进行内容审查会误杀（特别是含 BUILTIN_TOOL 描述、
      // 评审 prompt 等可能触发敏感词检测的合法系统内容）。
      // TI 在所有 chatFacade.chat 内部调用都加 skipGuardrails: true，对照实践。
      skipGuardrails: true,
      // ★ 让 BillingContext 的 operationName 反映真正业务（不是默认 "llm_call"）
      // 失败 trace 能直接定位 harness 内部调用，区别于业务侧 chat。
      operationName: "harness:react-loop:reason",
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
    // parseDecision 内部 try/catch 自己处理不抛；返回 decision + 可选 parseError
    const parsed = this.parseDecision(rawContent);
    const decision = parsed.decision;
    const parseError = parsed.parseError;
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

  private parseDecision(raw: string): {
    decision: ParsedDecision;
    parseError?: { name: string; message: string; subCode?: string };
  } {
    // ★ 用 TI 已 battle-tested 的 extractJsonFromAIResponse 替代手写
    //   JSON.parse + extractFirstJsonObject。该工具支持：
    //   - markdown 围栏 ```json ... ``` 自动剥离
    //   - 截断 JSON 修复（reasoning 模型常见）
    //   - NDJSON-like 多对象只取首个
    //   - JSON 内嵌闲聊文本时也能找到首个完整对象
    //   原手写逻辑只覆盖部分场景，导致 reasoning 模型的退化输出常被误判。
    const extracted = extractJsonFromAIResponse<{
      thinking?: unknown;
      action?: unknown;
      actions?: unknown;
      // ★ LLM 常见协议偏差：把 action 内容直接放顶层（漏掉 thinking+action 双层包装）
      // e.g. LLM 吐 {"kind":"parallel_tool_call","calls":[...]}
      //      而不是 {"thinking":"...","action":{"kind":"parallel_tool_call","calls":[...]}}
      // 我们容错识别这种情况
      kind?: unknown;
      calls?: unknown;
      toolId?: unknown;
      input?: unknown;
      output?: unknown;
      skillId?: unknown;
      name?: unknown;
      prompt?: unknown;
    }>(raw);

    if (!extracted.success || !extracted.data) {
      const errName = "JsonExtractFailed";
      const errMsg = extracted.error ?? "no JSON found in response";
      this.logger.warn(
        `Failed to extract JSON from LLM decision (${errName}: ${errMsg}); ` +
          `falling back to finalize-raw. ` +
          `text(first 1000)=${JSON.stringify(raw.slice(0, 1000))}`,
      );
      return {
        decision: {
          // ★ JSON 抽取失败 — parser 已把 raw text 当作 finalize.output，
          //   不在 trace 里展示解析器异常 / 中文系统提示。
          thinking: "",
          action: { kind: "finalize", output: raw },
        },
        parseError: { name: errName, message: errMsg },
      };
    }

    try {
      const obj = extracted.data;
      const thinking = typeof obj.thinking === "string" ? obj.thinking : "";

      // ★ LLM 协议容错：检测 action 内容裸放顶层（缺 {thinking, action} 包装）。
      // 生产 trace 显示 reasoning model 经常吐：
      //   {"kind":"parallel_tool_call","calls":[...]}
      //   {"kind":"tool_call","toolId":"web-search","input":{...}}
      //   {"kind":"finalize","output":{...}}
      // 而不是 {"thinking":"...","action":{...}}。这是 LLM 行为偏差，
      // 不是我们 prompt 错了 —— 容错认它。
      if (
        typeof obj.kind === "string" &&
        obj.action === undefined &&
        obj.actions === undefined
      ) {
        // 把整个 obj 当 action（剥掉非 action 字段不需要，normalizeAction 自己挑）
        const action = this.normalizeAction(obj);
        return { decision: { thinking, action } };
      }

      // Shorthand: top-level "actions" array → auto-wrap parallel_tool_call
      if (Array.isArray(obj.actions) && obj.actions.length > 0) {
        const calls = obj.actions
          .map((a) => this.normalizeToolCall(a))
          .filter((a): a is IToolCallAction => a !== null);
        if (calls.length === 0) {
          throw new InvalidActionError(
            "LLM returned 'actions' array with no valid tool calls",
            "empty_actions_array",
          );
        }
        if (calls.length === 1) {
          return { decision: { thinking, action: calls[0] } };
        }
        const action: IParallelToolCallAction = {
          kind: "parallel_tool_call",
          calls,
        };
        return { decision: { thinking, action } };
      }

      const action = this.normalizeAction(obj.action);
      return { decision: { thinking, action } };
    } catch (err) {
      // normalizeAction / normalizeToolCall 抛 InvalidActionError 走这里
      const errName = err instanceof Error ? err.name : "Unknown";
      const errMsg = err instanceof Error ? err.message : String(err);
      const subCode =
        err instanceof InvalidActionError ? err.subCode : undefined;
      this.logger.warn(
        `LLM JSON parsed but action invalid (${errName}: ${errMsg}); ` +
          `via=${extracted.method ?? "?"}; falling back to finalize-raw.`,
      );
      return {
        decision: {
          // ★ 这是 parser fallback 情况：LLM 把结果直接当顶级返回（漏写 envelope）。
          //   parser 已自动 fallback，不显示给用户「驳回 / 异常」字样，让 trace
          //   保持干净 —— action 直接显示 finalize、result 显示结构化产出。
          thinking: "",
          action: { kind: "finalize", output: raw },
        },
        parseError: { name: errName, message: errMsg, subCode },
      };
    }
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
        "missing_action",
      );
    }
    const a = action as Record<string, unknown>;

    // ── tool_call ──────────────────────────────────────
    if (a.kind === "tool_call") {
      if (typeof a.toolId !== "string" || !a.toolId.trim()) {
        // ★ 精准错误：kind 对但 toolId 缺/非 string，之前掉到 unknown_kind 误导
        throw new InvalidActionError(
          `tool_call action requires "toolId" (string), got ${typeof a.toolId}`,
          "missing_action",
        );
      }
      return {
        kind: "tool_call",
        toolId: a.toolId,
        input: (a.input as Record<string, unknown>) ?? {},
      };
    }

    // ── parallel_tool_call ────────────────────────────
    if (a.kind === "parallel_tool_call") {
      if (!Array.isArray(a.calls)) {
        throw new InvalidActionError(
          `parallel_tool_call action requires "calls" (array), got ${typeof a.calls}`,
          "empty_parallel_calls",
        );
      }
      const calls = a.calls
        .map((c) => this.normalizeToolCall(c))
        .filter((c): c is IToolCallAction => c !== null);
      if (calls.length === 0) {
        throw new InvalidActionError(
          "LLM returned parallel_tool_call with no valid tool calls",
          "empty_parallel_calls",
        );
      }
      const max =
        typeof a.maxConcurrency === "number" ? a.maxConcurrency : undefined;
      return { kind: "parallel_tool_call", calls, maxConcurrency: max };
    }

    // ── finalize ──────────────────────────────────────
    if (a.kind === "finalize") {
      // 仅当 LLM 显式声明 kind="finalize" 时才认为是主动 finalize；
      // 此时 output="" 是 LLM 自己的合法决定（少见但允许）。
      return {
        kind: "finalize",
        output: (a.output as string | Record<string, unknown>) ?? "",
      };
    }

    // ── 协议外 kind（subagent_spawn / skill_invoke / llm_generate）─────
    // 这些 kind 不在 DECISION_SYSTEM_SUFFIX 协议里，理论上 LLM 不该吐。
    // 真要支持得在 executeAction 里完整实现 + 在协议里宣传。当前抛错让
    // ReflexionLoop 走 critique 重试，不要让 LLM 用未支持的 action。
    throw new InvalidActionError(
      `LLM returned unsupported action kind: ${JSON.stringify(a.kind)}. ` +
        `Only "tool_call", "parallel_tool_call", "finalize" are accepted.`,
      "unknown_kind",
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
      // ★ 把 finalize.output 归一化为结构化对象（如果是 JSON 字符串就 parse）。
      //   force-finalize fallback 给的是 raw text；不解析的话下游 trace 会拿到一个
      //   超长字符串而非对象，前端结构化卡片渲染就走不进去（fallback 到 raw JSON）。
      let normalizedOutput: unknown = action.output;
      if (typeof normalizedOutput === "string") {
        const trimmed = normalizedOutput.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))
        ) {
          try {
            normalizedOutput = JSON.parse(trimmed);
          } catch {
            /* parse 失败保持 string，后续 schema gate 会处理 */
          }
        }
      }
      return { action, output: normalizedOutput, latencyMs: 0 };
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
