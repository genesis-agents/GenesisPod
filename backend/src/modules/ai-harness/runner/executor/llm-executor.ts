/**
 * LlmExecutor â€” L2 Agent è¿è¡Œæ—¶çš„ LLM è°ƒç”¨åŽŸè¯­
 *
 * èŒè´£ï¼š
 * - è°ƒ AiChatService èŽ·å– LLM åŽŸå§‹è¾“å‡º
 * - è‹¥ spec æä¾› outputSchemaï¼Œèµ° Zod safeParseï¼›å¤±è´¥åˆ™ error-fed retryï¼ˆæœ€å¤š N è½®ï¼‰
 * - è‹¥ spec æä¾› validateBusinessRulesï¼ŒZod æˆåŠŸåŽè°ƒç”¨ï¼›æŠ›é”™åŒ Zod å¤±è´¥å¤„ç†
 * - è¿”å›žå¼ºç±»åž‹ TOutput + tokens/cost/model/retries
 *
 * ç›®æ ‡æž¶æž„å®šä½ï¼ˆdocs/design/topic-insights-harness-redesign/11-target-architecture.mdï¼‰ï¼š
 * æœ¬ç±»æ˜¯ L2 Agent è¿è¡Œæ—¶çš„ä¸€ç­‰å…¬æ°‘ï¼Œæ‰€æœ‰ AI App é€šè¿‡ AgentFactory åˆ›å»º Agent æ—¶å…±ç”¨ã€‚
 * åŽŸ L3 ai-app/topic-insights/harness/llm/LlmInvokerService å°†åœ¨ P3 åˆ é™¤ï¼ˆèƒ½åŠ›å…¨éƒ¨ä¸Šæè‡³æ­¤ï¼‰ã€‚
 */

import { Injectable, Logger } from "@nestjs/common";
import type { z } from "zod";
// â˜… ç›´æŽ¥ç›¸å¯¹è·¯å¾„å¯¼å…¥ï¼Œç»•å¼€ facade barrelã€‚
// åŽŸå› ï¼šfacade/index.ts æ˜¯ L3 AI App çš„å•å‘å…¥å£ï¼›L2 harness å†…éƒ¨ä»£ç 
// è‹¥ä¹Ÿä»Ž facade å¯¼å…¥ï¼Œä¼šè§¦å‘ barrel â†’ ä¼—å¤šå­æ¨¡å— â†’ harness çš„å›žçŽ¯åŠ è½½ï¼Œ
// å¯¼è‡´ TypeScript åœ¨ module evaluation é˜¶æ®µäº§ç”Ÿ `undefined` ç±» referenceï¼Œ
// Nest DI éšåŽæŠ¥ "LlmExecutor dependency at index [0]"ã€‚
// å‚è€ƒ 8ac343b98ï¼ˆagent-factory / spec-based-agent å·²åŒæ­¤ä¿®å¤ï¼‰ã€‚
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { AiObservabilityService } from "../../../ai-harness/tracing/observability/ai-observability.service";
import { KernelContext } from "../../../../common/context/kernel-context";
import type { TaskProfile } from "../../../ai-engine/llm/types/task-profile.types";
import { AIModelType } from "@prisma/client";

// ============ å¥‘çº¦ ============

export interface LlmExecutorInput<TOutput> {
  /** Agent id / operation åï¼Œç”¨äºŽæ—¥å¿—å’Œ observability */
  readonly agentId: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;

  /** Zod schemaï¼›æœªæä¾›åˆ™è·³è¿‡æ ¡éªŒï¼Œç›´æŽ¥ JSON parse åŽè¿”å›ž unknown */
  readonly outputSchema?: z.ZodType<TOutput>;
  /** ä¸šåŠ¡è§„åˆ™æ ¡éªŒé’©å­ï¼Œåœ¨ Zod æˆåŠŸåŽè°ƒç”¨ï¼›throw è§¦å‘ retry */
  readonly validateBusinessRules?: (output: TOutput) => void;

  readonly taskProfile: TaskProfile;

  /**
   * æ˜¾å¼æŒ‡å®š modelId è¦†ç›–çŽ¯å¢ƒæ„ŸçŸ¥é€‰ä¸¾ã€‚
   * æ­£å¸¸è·¯å¾„ï¼šSpecBasedAgent è°ƒç”¨ ModelElectionService.elect() æ‹¿åˆ° modelId
   * åŽä»Žè¿™é‡Œä¼ è¿›æ¥ï¼›LlmExecutor å†åŽŸæ ·é€ç»™ AiChatService.chat({ model })ã€‚
   *
   * ä¸ºç©ºæ—¶ï¼šAiChatService èµ°å®ƒè‡ªå·±çš„ modelType â†’ DB é»˜è®¤é“¾è·¯ï¼ˆå•å…ƒæµ‹è¯•å…¼å®¹ï¼‰ã€‚
   */
  readonly model?: string;

  /** Schema å¤±è´¥æœ€å¤§é‡è¯•æ¬¡æ•°ï¼Œé»˜è®¤ 2ï¼ˆé¦–æ¬¡ + 2 æ¬¡ä¿®æ­£ = 3 è½®ï¼‰ */
  readonly maxRetries?: number;

  readonly signal?: AbortSignal;
  readonly userId?: string;
  /** KernelContext è‡ªåŠ¨é€ä¼ ï¼›è‹¥æ˜¾å¼æä¾›è¦†ç›– */
  readonly processId?: string;
  readonly operationName?: string;

  /**
   * â˜… v2 stub æ¨¡å¼ï¼ˆP1-4ï¼‰ï¼š
   * è®¾ç½®æ—¶**ç»•è¿‡ LLM è°ƒç”¨**ï¼Œç›´æŽ¥åŒæ­¥äº§å‡ºå ä½æ•°æ®èµ° Zod + business-rule æ ¡éªŒã€‚
   * ç»“åˆçŽ¯å¢ƒå˜é‡ AI_ENGINE_AGENT_STUB=1 æ¿€æ´»ï¼š
   *   - env è®¾ä¸º "1" + spec æä¾› stubFn â†’ ç»•è¿‡ LLMï¼Œè°ƒ stubFn
   *   - env è®¾ä¸º "1" + æ—  stubFn â†’ æŠ› StubNotConfiguredError
   *   - env æœªè®¾/= "0" â†’ æ­£å¸¸ LLM æµç¨‹ï¼ˆstubFn è¢«å¿½ç•¥ï¼‰
   * ç”¨é€”ï¼šæµ‹è¯•çŽ¯å¢ƒé›¶ LLM æˆæœ¬è·‘å®Œæ•´ pipelineï¼›CI ä¸ flakyã€‚
   */
  readonly stubFn?: () => Promise<TOutput>;
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

export class StubNotConfiguredError extends Error {
  constructor(agentId: string) {
    super(
      `[${agentId}] AI_ENGINE_AGENT_STUB=1 set but spec has no stubFn â€” cannot stub`,
    );
    this.name = "StubNotConfiguredError";
  }
}

/**
 * å…¨å±€ stub æ¨¡å¼å¼€å…³ï¼šenv å˜é‡ AI_ENGINE_AGENT_STUB=1 æ—¶æ‰€æœ‰ spec å¸¦ stubFn çš„ agent
 * ç»•è¿‡ LLMï¼Œç›´æŽ¥èµ° stubã€‚æµ‹è¯•å‹å¥½ï¼›ç¦æ­¢ç”¨äºŽç”Ÿäº§ã€‚
 *
 * ç”Ÿäº§é˜²æŠ¤ï¼šNODE_ENV === "production" æ—¶å¼ºåˆ¶ç¦ç”¨ï¼Œé˜²æ­¢è¿ç»´è¯¯è®¾è¯¥å˜é‡åŽ
 * æ‰€æœ‰ agent é™é»˜è¿”å›ž stub æ•°æ®è€ŒæŠ¥è­¦ç›²åŒºã€‚
 */
export function isStubModeEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AI_ENGINE_AGENT_STUB === "1";
}

// ============ å·¥å…·ï¼šJSON æå– ============

/**
 * ä»Ž LLM åŽŸå§‹ content æå– JSON objectã€‚æ”¯æŒï¼š
 * - çº¯ JSON `{...}`
 * - å¸¦ ```json fence çš„ä»£ç å—
 * - å‰åŽæœ‰è§£é‡Šæ–‡å­—çš„æ··åˆè¾“å‡ºï¼ˆæŒ‰ç¬¬ä¸€ä¸ª `{...}` çš„å¹³è¡¡æ‹¬å·æå–ï¼‰
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

// ============ æœåŠ¡ ============

@Injectable()
export class LlmExecutor {
  private readonly logger = new Logger(LlmExecutor.name);

  constructor(private readonly aiChatService: AiChatService) {}

  /**
   * æ‰§è¡Œä¸€æ¬¡"prompt â†’ LLM â†’ JSON â†’ Zod â†’ business-rule æ ¡éªŒ â†’ äº§å‡º TOutput"ã€‚
   * schema æˆ– business-rule å¤±è´¥æ—¶è‡ªåŠ¨ retryï¼šæŠŠå¤±è´¥åŽŸå› æ³¨å…¥ä¸‹ä¸€è½® prompt ä½œä¸º system noteã€‚
   */
  async execute<TOutput>(
    input: LlmExecutorInput<TOutput>,
  ): Promise<LlmExecutorResult<TOutput>> {
    // â˜… Stub æ¨¡å¼ï¼šenv + spec.stubFn åŒæ—¶å­˜åœ¨æ‰ç”Ÿæ•ˆ
    if (isStubModeEnabled()) {
      if (!input.stubFn) {
        throw new StubNotConfiguredError(input.agentId);
      }
      const output = await input.stubFn();
      // ä»ç„¶èµ° schema + business-rule æ ¡éªŒï¼ˆä¿è¯ stub å¥‘çº¦ï¼‰
      if (input.outputSchema) {
        const parsed = input.outputSchema.safeParse(output);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          throw new Error(
            `[${input.agentId}] stubFn output failed schema: ${issues}`,
          );
        }
        if (input.validateBusinessRules) {
          input.validateBusinessRules(parsed.data);
        }
        return {
          output: parsed.data,
          tokensUsed: 0,
          inputTokens: 0,
          outputTokens: 0,
          model: "stub",
          costUsd: 0,
          retries: 0,
        };
      }
      return {
        output,
        tokensUsed: 0,
        inputTokens: 0,
        outputTokens: 0,
        model: "stub",
        costUsd: 0,
        retries: 0,
      };
    }

    const maxRetries = input.maxRetries ?? 2;

    // KernelContext è‡ªåŠ¨å¸¦å‡º processId / userIdï¼ˆè‹¥ caller æœªæ˜¾å¼ä¼ ï¼‰
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
              "âš ï¸ Your previous response failed validation. Output strict JSON exactly matching the requested schema.",
              `Error: ${lastError ?? "(unknown)"}`,
              "",
              "Return complete JSON only, no extra explanation.",
            ].join("\n");

      let res;
      try {
        res = await this.aiChatService.chat({
          systemPrompt: input.systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          // Election é€‰å‡ºçš„ modelIdï¼ˆSpecBasedAgent å·²å®ŒæˆçŽ¯å¢ƒæ„ŸçŸ¥é€‰ä¸¾ï¼‰
          model: input.model,
          // æ²¡æœ‰ elected model æ—¶ fallback èµ°ç³»ç»Ÿé…ç½®çš„é»˜è®¤ CHAT æ¨¡åž‹
          // ï¼ˆAiChatService ä¼˜å…ˆç”¨ modelï¼Œmodel ç©ºæ—¶èµ° modelType â†’ DB é»˜è®¤ï¼‰
          modelType: input.model ? undefined : AIModelType.CHAT,
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

      // æ—  schemaï¼šä¸€æ¬¡æˆåŠŸè¿”å›ž unknownï¼ˆcaller ä¿è¯ç±»åž‹å®‰å…¨ï¼‰
      if (!input.outputSchema) {
        let parsed: unknown;
        try {
          parsed = extractJsonFromLlmContent(res.content);
        } catch (err) {
          // æ—  schema æ—¶ä¾ç„¶å¯èƒ½ JSON å¤±è´¥ï¼›èµ°ä¸€æ¬¡ retry
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

      // æœ‰ schemaï¼šJSON extract â†’ Zod safeParse â†’ business-rule
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
