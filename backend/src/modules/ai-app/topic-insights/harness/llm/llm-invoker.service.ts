/**
 * LlmInvokerService — Tier Core Enhancement
 *
 * 把 `AiChatService.chat` 包装成"JSON-output + Zod-parse + retry-on-schema-fail"的
 * 模板，供 BaseAgentRunner.executeImpl 使用。
 *
 * 为什么需要这层：
 * - 原 chat() 返回字符串 content；agent 需要 structured output
 * - LLM 偶尔会返回不符合 schema 的 JSON，需要 retry
 * - Budget 要从真实 usage.totalTokens 取值，不是假估算
 *
 * 设计约束（CLAUDE.md · 行为红线 · 分层不交叉）：
 * - LlmInvoker 只在 `ai-app/topic-insights/harness` 内部使用
 * - 对外通过 `AiChatService`（facade 已导出）委托
 * - 不硬编码 model，task profile 驱动
 */

import { Injectable, Logger } from "@nestjs/common";
import type { z } from "zod";
import {
  AiChatService,
  AiObservabilityService,
  type TaskProfile,
} from "@/modules/ai-engine/facade";
import { StageSchemaError } from "../../pipeline/types";

export interface LlmInvokerInput<TOutput> {
  readonly agentId: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: z.ZodType<TOutput>;
  readonly taskProfile: TaskProfile;
  /** 最大 schema retry 次数，默认 2（首次 + 2 次修正） */
  readonly maxRetries?: number;
  readonly signal?: AbortSignal;
  readonly userId?: string;
  readonly processId?: string;
  readonly operationName?: string;
}

export interface LlmInvokerResult<TOutput> {
  readonly output: TOutput;
  readonly tokensUsed: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly costUsd: number;
  readonly retries: number;
}

/** 成本估算：复用 AiObservabilityService.estimateCost（唯一定价表维护点） */
function estimateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  return AiObservabilityService.estimateCost(
    model ?? "default",
    inputTokens,
    outputTokens,
  );
}

/**
 * 从 LLM 响应中提取 JSON 对象。
 * 处理 3 种常见输出形式：
 * - 纯 JSON
 * - ```json ... ``` 代码块
 * - 前后带解释文字的混合文本
 */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  // Pattern 1: fenced code block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }
  // Pattern 2: pure JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  // Pattern 3: first {...} block by balanced scan
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
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1));
      }
    }
  }
  throw new Error(
    `LLM output has unmatched braces (preview: ${trimmed.slice(0, 200)})`,
  );
}

@Injectable()
export class LlmInvokerService {
  private readonly logger = new Logger(LlmInvokerService.name);

  constructor(private readonly aiChatService: AiChatService) {}

  async invoke<TOutput>(
    input: LlmInvokerInput<TOutput>,
  ): Promise<LlmInvokerResult<TOutput>> {
    const maxRetries = input.maxRetries ?? 2;
    let lastError: string | undefined;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let lastModel = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (input.signal?.aborted) {
        throw new DOMException(
          `[${input.agentId}] Aborted during LLM invoke`,
          "AbortError",
        );
      }

      const userPrompt =
        attempt === 0
          ? input.userPrompt
          : [
              input.userPrompt,
              "",
              "⚠️ 上一次响应未通过 schema 校验，请严格按要求输出合规 JSON。",
              `错误：${lastError ?? "(unknown schema error)"}`,
              "",
              "再次输出完整 JSON。不要加任何额外解释。",
            ].join("\n");

      let res;
      try {
        res = await this.aiChatService.chat({
          systemPrompt: input.systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          taskProfile: input.taskProfile,
          responseFormat: "json",
          userId: input.userId,
          processId: input.processId,
          operationName: input.operationName ?? input.agentId,
          signal: input.signal, // ★ Group K-3: 端到端 AbortSignal
          // 不传 model → 走 TaskProfile 自动解析
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
      totalCost += estimateCost(
        res.model,
        res.usage?.inputTokens ?? 0,
        res.usage?.outputTokens ?? 0,
      );

      if (res.isError) {
        throw new Error(
          `[${input.agentId}] chat returned isError: ${res.content.slice(0, 200)}`,
        );
      }

      // Extract + parse
      let jsonObj: unknown;
      try {
        jsonObj = extractJson(res.content);
      } catch (err) {
        lastError = `JSON extract failed: ${err instanceof Error ? err.message : String(err)}`;
        this.logger.warn(
          `[${input.agentId}] attempt ${attempt + 1}: ${lastError}`,
        );
        continue;
      }

      const parsed = input.schema.safeParse(jsonObj);
      if (parsed.success) {
        return {
          output: parsed.data,
          tokensUsed: totalInput + totalOutput,
          inputTokens: totalInput,
          outputTokens: totalOutput,
          model: lastModel,
          costUsd: totalCost,
          retries: attempt,
        };
      }

      lastError = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      this.logger.warn(
        `[${input.agentId}] attempt ${attempt + 1} schema fail: ${lastError}`,
      );
    }

    // all attempts exhausted
    throw new StageSchemaError(input.agentId, [
      `LLM invoker exhausted ${maxRetries + 1} attempts. Last: ${lastError}`,
    ]);
  }
}

// Exported for tests
export { extractJson as __extractJsonForTests };
