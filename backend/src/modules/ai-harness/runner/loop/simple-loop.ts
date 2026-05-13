/**
 * SimpleLoop — 单步直答型 Loop（无 tool 编排 / 无 self-critique）
 *
 * 适用：
 *   - 评分 / 评判 / 分类 / 数据提取（dimension-quality-judge / verifier 等）
 *   - 任何 outputSchema 是业务结构化 JSON、且不需要工具调用的纯生成型 agent
 *
 * 行为：
 *   1. 一次 LLM chat() 调用（messages + agent outputSchema 强约束）
 *   2. 不强制 LLM 输出 ReAct 协议 (thinking + action)；LLM 直接吐 outputSchema 实例
 *   3. 业务侧用 outputSchemaValidator 验证后 yield "output" + "terminated"
 *   4. 验证失败 → yield "validation_failed" + "terminated" reason="error"，
 *      调用方（AgentRunner / ReflexionLoop）按 RUNNER_OUTPUT_SCHEMA_MISMATCH 处理
 *
 * 与其他 loop 区别：
 *   simple    : 1 次 LLM，无 tool，无重试 ← 本文件
 *   reflexion : N 次 LLM (act + critique + revise)
 *   react     : N 次 LLM + tool 编排 (thinking → action → observation)
 *   plan-execute / leader-worker：复杂多步
 *
 * 沉淀背景：consumer 11 个 agent 误配 loop:"react" 但 outputSchema 是业务 JSON，
 * 导致 ReActLoop parseDecision 抛 InvalidActionError，fallback finalize-raw 救场
 * 浪费 ~3x token + 章节质量降级。SimpleLoop 让纯生成型 agent 一步到位。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  AgentLoopKind,
  IAgentEvent,
  IAgentLoop,
  IContextEnvelope,
  ILoopTerminationCriteria,
  ILoopRunOptions,
} from "../../agents/abstractions";
import {
  AiChatService,
  type ChatMessage,
} from "../../../ai-engine/llm/services/ai-chat.service";
import { AIModelType } from "@prisma/client";
import type { TaskProfile } from "../../../ai-engine/llm/types/task-profile.types";
import { BudgetAccountant } from "../../guardrails/budget/budget-accountant";

export interface SimpleLoopRunOptions extends ILoopRunOptions {
  /** Spec 声明的 TaskProfile（透传给 chat()） */
  taskProfile?: TaskProfile;
  /** outputSchema 校验闸（业务侧通过 AgentSpec 注入） */
  outputSchemaValidator?: (
    output: unknown,
  ) => { ok: true } | { ok: false; issues: string };
  /** 业务规则校验（schema 通过后再校验，如 sectionId 唯一性） */
  validateBusinessRules?: (output: unknown) => string | null | undefined;
  /** 显式 model 覆盖（BudgetAccountant downgrade 透传） */
  modelOverride?: string;
  /** BYOK userId 透传给 chat() */
  userId?: string;
  /** 预算计费 */
  budget?: BudgetAccountant;
}

@Injectable()
export class SimpleLoop implements IAgentLoop {
  readonly kind: AgentLoopKind = "simple";
  private readonly logger = new Logger(SimpleLoop.name);

  constructor(private readonly chatService: AiChatService) {}

  async *run(
    envelope: IContextEnvelope,
    _criteria: ILoopTerminationCriteria,
    options?: SimpleLoopRunOptions,
  ): AsyncIterable<IAgentEvent> {
    const agentId = options?.agentId ?? "simple-agent";
    const signal = options?.signal;

    if (signal?.aborted) {
      yield this.makeEvent(agentId, "terminated", { reason: "cancelled" });
      return;
    }

    yield this.makeEvent(agentId, "iteration_progress", {
      iteration: 1,
      maxIterations: 1,
      progress: 1.0,
      approachingLimit: false,
      lastActionKind: undefined,
    });

    // 1) 装配 messages（envelope.reminders 优先 + envelope.messages）
    const messages = this.buildMessages(envelope);
    const systemPrompt = envelope.system ?? "";

    // 2) 一次 LLM 调用（不带 ReAct DECISION_SYSTEM_SUFFIX，让 LLM 按 outputSchema 直答）
    let response: Awaited<ReturnType<AiChatService["chat"]>>;
    const startMs = Date.now();
    try {
      response = await this.chatService.chat({
        messages,
        systemPrompt,
        model: options?.modelOverride,
        modelType: options?.modelOverride ? undefined : AIModelType.CHAT,
        cachePolicy: "auto",
        taskProfile: options?.taskProfile ?? {
          creativity: "low",
          outputLength: "medium",
        },
        strictMode: true,
        responseFormat: "json",
        skipGuardrails: true,
        operationName: "harness:simple-loop:chat",
        userId: options?.userId,
        signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 2026-05-13: chat() 抛 abort 时必须当作 "cancelled" 而不是 "error"，否则
      // 上层 drainEvents 把 state 推成 "failed" → per-dim-pipeline 误报
      // "grade 阶段失败 state=failed"。真因是 mission-wide abort（如 budget_exhausted），
      // 不是 simple-loop 自己出错。
      const aborted = signal?.aborted || /abort/i.test(message);
      if (aborted) {
        yield this.makeEvent(agentId, "terminated", { reason: "cancelled" });
        return;
      }
      yield this.makeEvent(agentId, "error", {
        message,
        failureCode: this.classifyFailureCode(message),
      });
      yield this.makeEvent(agentId, "terminated", { reason: "error" });
      return;
    }

    if (signal?.aborted) {
      yield this.makeEvent(agentId, "terminated", { reason: "cancelled" });
      return;
    }

    const promptTokens = response.usage?.inputTokens ?? 0;
    const completionTokens = response.usage?.outputTokens ?? 0;
    const cacheReadTokens = response.usage?.cacheReadTokens ?? 0;

    // 3) parse JSON output
    const rawContent = response.content ?? "";
    let parsedOutput: unknown;
    try {
      parsedOutput = this.extractJson(rawContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield this.makeEvent(agentId, "validation_failed", {
        rejectCount: 1,
        maxRejects: 1,
        issues: `LLM output is not valid JSON: ${message}`,
        candidateOutput: rawContent.slice(0, 500),
      });
      yield this.makeEvent(agentId, "error", {
        message: "RUNNER_OUTPUT_SCHEMA_MISMATCH: not JSON",
        failureCode: "RUNNER_OUTPUT_SCHEMA_MISMATCH",
      });
      yield this.makeEvent(agentId, "terminated", { reason: "error" });
      return;
    }

    // 4) outputSchema 校验
    if (options?.outputSchemaValidator) {
      const verdict = options.outputSchemaValidator(parsedOutput);
      if (!verdict.ok) {
        yield this.makeEvent(agentId, "validation_failed", {
          rejectCount: 1,
          maxRejects: 1,
          issues: verdict.issues,
          candidateOutput: parsedOutput,
        });
        yield this.makeEvent(agentId, "error", {
          message: `RUNNER_OUTPUT_SCHEMA_MISMATCH: ${verdict.issues.slice(0, 200)}`,
          failureCode: "RUNNER_OUTPUT_SCHEMA_MISMATCH",
        });
        yield this.makeEvent(agentId, "terminated", { reason: "error" });
        return;
      }
    }

    // 5) businessRules 校验（schema 通过后才查）
    if (options?.validateBusinessRules) {
      const issue = options.validateBusinessRules(parsedOutput);
      if (issue) {
        yield this.makeEvent(agentId, "validation_failed", {
          rejectCount: 1,
          maxRejects: 1,
          issues: issue,
          candidateOutput: parsedOutput,
        });
        yield this.makeEvent(agentId, "error", {
          message: `BUSINESS_RULE_VIOLATION: ${issue.slice(0, 200)}`,
          failureCode: "BUSINESS_RULE_VIOLATION",
        });
        yield this.makeEvent(agentId, "terminated", { reason: "error" });
        return;
      }
    }

    // 6) Budget 计费 — accountLLM 签名: (promptTokens, completionTokens, costUsd, cacheReadTokens?)
    if (options?.budget) {
      try {
        // costUsd=null 让 BudgetAccountant 内部计 uncostedLLMCalls（pricing registry 在
        // ReActLoop 层注入；SimpleLoop 不强制依赖 pricing → 透传 null 保持账目诚实）
        options.budget.accountLLM(
          promptTokens,
          completionTokens,
          null,
          cacheReadTokens,
        );
      } catch (err) {
        // budget 故障不阻断；记 warn
        this.logger.warn(
          `[simple-loop] budget account failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 7) 成功路径：emit thinking（让 trace 看到原文）+ output + terminated
    if (rawContent && rawContent.length < 5000) {
      yield this.makeEvent(agentId, "thinking", {
        text: `(simple-loop output ${Date.now() - startMs}ms)`,
        tokenCount: completionTokens,
      });
    }
    yield this.makeEvent(agentId, "output", {
      output: parsedOutput as string | Record<string, unknown>,
    });
    yield this.makeEvent(agentId, "terminated", { reason: "completed" });
  }

  // ── Helpers ─────────────────────────────────────────────────

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
    return msgs;
  }

  /**
   * 容错抽 JSON：先尝试整体 parse，失败则找首个 { ... } / [ ... ] 块。
   * 兼容 LLM 在 JSON 前后加 ```json fence 或注释的情况。
   */
  private extractJson(content: string): unknown {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("empty content");
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      // fence 剥离
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        return JSON.parse(fenceMatch[1].trim());
      }
      // 找最外层 {...} 或 [...]
      const objMatch = trimmed.match(/\{[\s\S]*\}/);
      if (objMatch) return JSON.parse(objMatch[0]);
      const arrMatch = trimmed.match(/\[[\s\S]*\]/);
      if (arrMatch) return JSON.parse(arrMatch[0]);
      throw new Error("no parseable JSON block found");
    }
  }

  private classifyFailureCode(message: string): string {
    if (/rate.?limit|429/i.test(message)) return "PROVIDER_RATE_LIMIT";
    if (/safety|content filter|refusal/i.test(message))
      return "PROVIDER_SAFETY_REFUSAL";
    if (/byok|model not found/i.test(message))
      return "PROVIDER_BYOK_MODEL_NOT_FOUND";
    if (/timeout|timed out/i.test(message)) return "RUNNER_WALL_TIME_EXCEEDED";
    return "PROVIDER_API_ERROR";
  }

  private makeEvent(
    agentId: string,
    type: IAgentEvent["type"],
    payload: unknown,
  ): IAgentEvent {
    return { type, agentId, timestamp: Date.now(), payload };
  }
}
