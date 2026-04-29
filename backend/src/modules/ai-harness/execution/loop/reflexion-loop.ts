/**
 * ReflexionLoop — Act → Verify → Critique → Retry 策略
 *
 * 适用：高质量要求任务（报告、代码、关键决策）。
 *
 * 流程：
 *   1. ACT：跑一次 ReActLoop 得到候选输出
 *   2. VERIFY：给 verifiers (self/external/meta) 评分；若 < passThreshold → 进入 CRITIQUE
 *   3. CRITIQUE：让 LLM 基于 verdicts 写改进笔记
 *   4. RETRY：把 critique 注入 envelope reminder，重新 ACT；最多 maxRevisions 轮
 *
 * verifiers 注入由 PR-B 的 JudgeService 提供；本 loop 仅依赖 IVerifier 接口，
 * verifiers 为空时退化为单次 ReAct 调用（无副作用 → 安全 fallback）。
 */

import { Injectable, Optional } from "@nestjs/common";
import type {
  AgentLoopKind,
  IAgentEvent,
  IAgentLoop,
  IContextEnvelope,
  ILoopTerminationCriteria,
  IContextMessage,
} from "../../kernel/abstractions";
import { ContextEnvelope } from "../../kernel/core/context-envelope";
import { ReActLoop } from "./react-loop";
import { BudgetAccountant } from "../../runtime/budget/budget-accountant";

/**
 * Verifier 抽象 — PR-B 的 JudgeService 实现此接口（可为 self/external/meta）。
 */
export interface IVerifier {
  readonly id: string;
  evaluate(input: {
    output: unknown;
    envelope: IContextEnvelope;
    signal?: AbortSignal;
  }): Promise<{ score: number; critique: string }>;
}

export interface ReflexionOptions {
  readonly verifiers?: readonly IVerifier[];
  readonly passThreshold?: number; // 默认 75
  readonly maxRevisions?: number; // 默认 2（首次 + 2 次修订 = 3 次 ACT）
}

/**
 * 必修 #3: 移除静态可变状态（测试隔离 / 多模块场景下不安全）。
 * 默认 verifiers 通过实例字段 + 公开 setter 注入，本实例自管。
 */
@Injectable()
export class ReflexionLoop implements IAgentLoop {
  readonly kind: AgentLoopKind = "reflexion";

  private defaultOptions: ReflexionOptions = {
    verifiers: [],
    passThreshold: 75,
    maxRevisions: 2,
  };

  constructor(
    private readonly reactLoop: ReActLoop,
    @Optional() defaultVerifiers?: readonly IVerifier[],
  ) {
    if (defaultVerifiers && defaultVerifiers.length > 0) {
      this.defaultOptions = {
        ...this.defaultOptions,
        verifiers: defaultVerifiers,
      };
    }
  }

  /**
   * 实例级 setter —— 保持 setDefaultVerifiers 的 backward compat 名称，
   * 但去除了 static 属性的全局副作用。
   */
  setDefaultVerifiers(verifiers: readonly IVerifier[]): void {
    this.defaultOptions = { ...this.defaultOptions, verifiers };
  }

  async *run(
    envelope: IContextEnvelope,
    criteria: ILoopTerminationCriteria,
    options?: {
      agentId?: string;
      signal?: AbortSignal;
      allowedTools?: readonly string[];
      forbiddenTools?: readonly string[];
      budget?: BudgetAccountant;
      reflexion?: ReflexionOptions;
      /** Spec.taskProfile 透传给内层 ReActLoop，让 reason() 用 agent 真实意图 */
      taskProfile?: import("../../../ai-engine/llm/types/task-profile").TaskProfile;
      // ★ 透传给内层 ReActLoop 用作 finalize 时内容校验闸
      outputSchemaValidator?: (
        output: unknown,
      ) => { ok: true } | { ok: false; issues: string };
      validateBusinessRules?: (output: unknown) => string | null | undefined;
      /**
       * ★ Phase P1 fix (2026-04-29)：透传给内层 ReActLoop 启用 OpenAI structured
       * output (json_schema) 模式。
       */
      outputJsonSchema?: Record<string, unknown>;
    },
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "reflexion-agent";
    const merged: ReflexionOptions = {
      ...this.defaultOptions,
      ...(options?.reflexion ?? {}),
    };
    const passThreshold = merged.passThreshold ?? 75;
    const maxRevisions = merged.maxRevisions ?? 2;
    const verifiers = merged.verifiers ?? [];

    let currentEnvelope = envelope;
    let revision = 0;
    // 必修 #6: 跟踪历轮最佳 output，超限时 emit 兜底 output（防止调用方拿空结果）
    let bestOutput: unknown = "";
    let bestScore = -Infinity;
    /**
     * Reflexion 跨 revision 熔断 —— ReActLoop 内的 consecutiveEmpty 计数在
     * 每次 reactLoop.run() 重启时清零，碰不到 finalize+empty 模式（每个
     * revision 只跑 1 次 ReActLoop iteration 就 finalize 了）。
     * 在 Reflexion 层独立计数：连续 2 个 revision 拿到空 output → 模型废，
     * 立即 abort，不浪费后续 revision 的 token。
     */
    let consecutiveEmptyOutput = 0;

    while (revision <= maxRevisions) {
      if (options?.signal?.aborted) {
        yield this.event(agentId, "terminated", { reason: "cancelled" });
        return;
      }

      // Sub-iterations budget per revision
      const subCriteria = {
        ...criteria,
        maxIterations: Math.max(
          3,
          Math.floor(criteria.maxIterations / (maxRevisions + 1)),
        ),
      };

      // ACT
      let lastOutput: unknown = "";
      for await (const ev of this.reactLoop.run(
        currentEnvelope,
        subCriteria,
        options,
      )) {
        // Forward inner events with revision tag
        yield {
          ...ev,
          payload:
            typeof ev.payload === "object" && ev.payload
              ? { ...ev.payload, revision }
              : ev.payload,
        };
        if (ev.type === "output") {
          lastOutput = (ev.payload as { output: unknown }).output;
        }
      }

      // ★ Reflexion 层熔断：empty output 连续 2 个 revision → abort
      const isEmptyOutput =
        lastOutput == null ||
        lastOutput === "" ||
        (typeof lastOutput === "string" && lastOutput.trim() === "") ||
        (typeof lastOutput === "object" &&
          lastOutput !== null &&
          Object.keys(lastOutput as Record<string, unknown>).length === 0);
      if (isEmptyOutput) {
        consecutiveEmptyOutput += 1;
        if (consecutiveEmptyOutput >= 2) {
          // ★ 接通 fallback：问 runtimeEnv 拿恢复建议（reflexion 层连续空 = empty_response）
          const recoveryHint = await currentEnvelope.runtimeEnv
            ?.suggestFallback({ reason: "empty_response" })
            .catch(() => null);
          yield this.event(agentId, "error", {
            message:
              `Reflexion 连续 ${consecutiveEmptyOutput} 个 revision 拿到空 output —— ` +
              `内层 ReActLoop 已发出更精确的 failureCode（PARSE_* / LOOP_REASONING_COT_EXHAUSTION 等），` +
              `查 trace 可见根因证据。` +
              (recoveryHint
                ? ` 恢复建议：${recoveryHint.action} (${recoveryHint.reason})`
                : ""),
            recoverable: recoveryHint?.action === "downgrade",
            failureCode: "REFLEXION_CONSECUTIVE_EMPTY",
            diagnostic: {
              consecutiveEmptyOutput,
              revision,
              bestScore: bestScore === -Infinity ? null : bestScore,
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
          yield this.event(agentId, "output", { output: bestOutput });
          yield this.event(agentId, "terminated", {
            reason: "empty_llm_response",
          });
          return;
        }
      } else {
        consecutiveEmptyOutput = 0;
      }

      // No verifiers → single-shot, return immediately
      if (verifiers.length === 0) {
        return;
      }

      // VERIFY
      const verdicts = await Promise.all(
        verifiers.map((v) =>
          v.evaluate({
            output: lastOutput,
            envelope: currentEnvelope,
            signal: options?.signal,
          }),
        ),
      );
      const avgScore =
        verdicts.reduce((a, b) => a + b.score, 0) / verdicts.length;
      yield this.event(agentId, "reflection", {
        revision,
        score: avgScore,
        verdicts: verdicts.map((v, i) => ({
          judgeId: verifiers[i].id,
          score: v.score,
          critique: v.critique,
        })),
      });

      if (avgScore >= passThreshold) {
        yield this.event(agentId, "output", { output: lastOutput });
        yield this.event(agentId, "terminated", { reason: "completed" });
        return;
      }

      // 必修 #6: 记录"虽然没过线但本轮最高分"的 output，超限时回退到它
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestOutput = lastOutput;
      }

      revision += 1;
      if (revision > maxRevisions) break;

      // CRITIQUE → inject reminder for next ACT
      const critiqueText = verdicts
        .map((v, i) => `- [${verifiers[i].id} score=${v.score}] ${v.critique}`)
        .join("\n");
      const reminderMsg: IContextMessage = {
        role: "user",
        content: `Your previous draft scored ${avgScore.toFixed(1)}/100 (need ${passThreshold}+). Reviewer notes:\n${critiqueText}\n\nProduce a revised answer addressing each critique.`,
        timestamp: Date.now(),
      };
      currentEnvelope =
        currentEnvelope instanceof ContextEnvelope
          ? currentEnvelope.append([reminderMsg]).envelope
          : {
              ...currentEnvelope,
              messages: [...currentEnvelope.messages, reminderMsg],
            };
    }

    // 必修 #6: 超限时返回历轮最佳 output + budget reason
    // ★ 区分语义：terminated reason="budget" 在 reflexion 上下文里不是 token 耗尽，
    // 是 verifier 反复评分未达门槛 + maxRevisions 用尽。emit 显式 error event 带
    // REFLEXION_VERIFIER_LOW_SCORE，让 orchestrator/UI 看到真根因。
    yield this.event(agentId, "error", {
      message:
        `Reflexion 用尽 ${maxRevisions} 个 revision，verifier 评分始终未达 ${passThreshold} 门槛。` +
        `历轮最高分 ${bestScore === -Infinity ? "N/A" : bestScore.toFixed(1)}/100。`,
      recoverable: false,
      failureCode: "REFLEXION_VERIFIER_LOW_SCORE",
      diagnostic: {
        maxRevisions,
        passThreshold,
        bestScore: bestScore === -Infinity ? null : bestScore,
        revisionsUsed: revision,
      },
    });
    yield this.event(agentId, "output", { output: bestOutput });
    yield this.event(agentId, "terminated", { reason: "budget" });
  }

  private event(
    agentId: string,
    type: IAgentEvent["type"],
    payload: unknown,
  ): IAgentEvent {
    return { type, agentId, timestamp: Date.now(), payload };
  }
}
