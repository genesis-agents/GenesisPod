/**
 * LlmExecutor — L2 Agent 运行时的 LLM 调用原语
 *
 * 职责：
 * - 调 AiChatService 获取 LLM 原始输出
 * - 若 spec 提供 outputSchema，走 Zod safeParse；失败则 error-fed retry（最多 N 轮）
 * - 若 spec 提供 validateBusinessRules，Zod 成功后调用；抛错同 Zod 失败处理
 * - 返回强类型 TOutput + tokens/cost/model/retries
 *
 * 目标架构定位（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * 本类是 L2 Agent 运行时的一等公民，所有 AI App 通过 AgentFactory 创建 Agent 时共用。
 * 原 L3 ai-app/topic-insights/harness/llm/LlmInvokerService 将在 P3 删除（能力全部上提至此）。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { z } from "zod";
import {
  AiChatService,
  AiObservabilityService,
  KernelContext,
  type TaskProfile,
} from "@/modules/ai-engine/facade";

// ============ 契约 ============

export interface LlmExecutorInput<TOutput> {
  /** Agent id / operation 名，用于日志和 observability */
  readonly agentId: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;

  /** Zod schema；未提供则跳过校验，直接 JSON parse 后返回 unknown */
  readonly outputSchema?: z.ZodType<TOutput>;
  /** 业务规则校验钩子，在 Zod 成功后调用；throw 触发 retry */
  readonly validateBusinessRules?: (output: TOutput) => void;

  readonly taskProfile: TaskProfile;

  /** Schema 失败最大重试次数，默认 2（首次 + 2 次修正 = 3 轮） */
  readonly maxRetries?: number;

  readonly signal?: AbortSignal;
  readonly userId?: string;
  /** KernelContext 自动透传；若显式提供覆盖 */
  readonly processId?: string;
  readonly operationName?: string;
}

export interface LlmExecutorResult<TOutput> {
  readonly output: TOutput;
  readonly tokensUsed: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly costUsd: number;
  readonly retries: number;
}

export class SchemaRetryExhaustedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly attempts: number,
    public readonly lastError: string,
  ) {
    super(
      `[${agentId}] LLM output failed schema validation after ${attempts} attempts. Last error: ${lastError}`,
    );
    this.name = "SchemaRetryExhaustedError";
  }
}

// ============ 工具：JSON 提取 ============

/**
 * 从 LLM 原始 content 提取 JSON object。支持：
 * - 纯 JSON `{...}`
 * - 带 ```json fence 的代码块
 * - 前后有解释文字的混合输出（按第一个 `{...}` 的平衡括号提取）
 */
export function extractJsonFromLlmContent(content: string): unknown {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  const start = trimmed.indexOf("{");
  if (start === -1) {
    throw new Error(
      `LLM output contains no JSON object (preview: ${trimmed.slice(0, 200)})`,
    );
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error(
    `LLM output has unmatched braces (preview: ${trimmed.slice(0, 200)})`,
  );
}

// ============ 服务 ============

@Injectable()
export class LlmExecutor {
  private readonly logger = new Logger(LlmExecutor.name);

  constructor(private readonly aiChatService: AiChatService) {}

  /**
   * 执行一次"prompt → LLM → JSON → Zod → business-rule 校验 → 产出 TOutput"。
   * schema 或 business-rule 失败时自动 retry：把失败原因注入下一轮 prompt 作为 system note。
   */
  async execute<TOutput>(
    input: LlmExecutorInput<TOutput>,
  ): Promise<LlmExecutorResult<TOutput>> {
    const maxRetries = input.maxRetries ?? 2;

    // KernelContext 自动带出 processId / userId（若 caller 未显式传）
    const kctx = KernelContext.get();
    const processId = input.processId ?? kctx?.processId;
    const userId = input.userId ?? kctx?.userId;

    let lastError: string | undefined;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let lastModel = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (input.signal?.aborted) {
        throw new DOMException(
          `[${input.agentId}] Aborted during LLM execute`,
          "AbortError",
        );
      }

      const userPrompt =
        attempt === 0
          ? input.userPrompt
          : [
              input.userPrompt,
              "",
              "⚠️ Your previous response failed validation. Output strict JSON exactly matching the requested schema.",
              `Error: ${lastError ?? "(unknown)"}`,
              "",
              "Return complete JSON only, no extra explanation.",
            ].join("\n");

      let res;
      try {
        res = await this.aiChatService.chat({
          systemPrompt: input.systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          taskProfile: input.taskProfile,
          responseFormat: "json",
          userId,
          processId,
          operationName: input.operationName ?? input.agentId,
          signal: input.signal,
        });
      } catch (err) {
        this.logger.warn(
          `[${input.agentId}] attempt ${attempt + 1}/${maxRetries + 1} chat failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }

      totalInput += res.usage?.inputTokens ?? 0;
      totalOutput += res.usage?.outputTokens ?? 0;
      lastModel = res.model;
      totalCost += AiObservabilityService.estimateCost(
        res.model ?? "default",
        res.usage?.inputTokens ?? 0,
        res.usage?.outputTokens ?? 0,
      );

      if (res.isError) {
        throw new Error(
          `[${input.agentId}] chat returned isError: ${res.content.slice(0, 200)}`,
        );
      }

      // 无 schema：一次成功返回 unknown（caller 保证类型安全）
      if (!input.outputSchema) {
        let parsed: unknown;
        try {
          parsed = extractJsonFromLlmContent(res.content);
        } catch (err) {
          // 无 schema 时依然可能 JSON 失败；走一次 retry
          lastError = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[${input.agentId}] attempt ${attempt + 1}: JSON extract failed: ${lastError}`,
          );
          continue;
        }
        return {
          output: parsed as TOutput,
          tokensUsed: totalInput + totalOutput,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          model: lastModel,
          costUsd: totalCost,
          retries: attempt,
        };
      }

      // 有 schema：JSON extract → Zod safeParse → business-rule
      let jsonObj: unknown;
      try {
        jsonObj = extractJsonFromLlmContent(res.content);
      } catch (err) {
        lastError = `JSON extract failed: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.warn(
          `[${input.agentId}] attempt ${attempt + 1}: ${lastError}`,
        );
        continue;
      }

      const parseResult = input.outputSchema.safeParse(jsonObj);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        lastError = `Zod validation failed: ${issues}`;
        this.logger.warn(
          `[${input.agentId}] attempt ${attempt + 1}: ${lastError}`,
        );
        continue;
      }

      if (input.validateBusinessRules) {
        try {
          input.validateBusinessRules(parseResult.data);
        } catch (err) {
          lastError = `Business-rule failed: ${err instanceof Error ? err.message : String(err)}`;
          this.logger.warn(
            `[${input.agentId}] attempt ${attempt + 1}: ${lastError}`,
          );
          continue;
        }
      }

      return {
        output: parseResult.data,
        tokensUsed: totalInput + totalOutput,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        model: lastModel,
        costUsd: totalCost,
        retries: attempt,
      };
    }

    throw new SchemaRetryExhaustedError(
      input.agentId,
      maxRetries + 1,
      lastError ?? "(no error recorded)",
    );
  }
}
