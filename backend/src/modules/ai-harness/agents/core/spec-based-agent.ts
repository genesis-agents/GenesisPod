/**
 * SpecBasedAgent â€” å£°æ˜Žå¼ spec é©±åŠ¨çš„ IAgent å®žçŽ°
 *
 * ç›®æ ‡æž¶æž„ v2ï¼ˆdocs/design/topic-insights-harness-redesign/11-target-architecture.mdï¼‰ï¼š
 * L3 App åªå†™ IAgentSpecï¼Œæœ¬ç±»æŠŠ spec è½¬æˆå¯æ‰§è¡Œçš„ IAgentï¼š
 *   - buildSystemPrompt / buildUserPrompt â†’ æž„é€  LLM è¾“å…¥
 *   - LlmExecutor.execute â†’ Zod æ ¡éªŒ + error-fed retry + stub æ¨¡å¼
 *   - validateBusinessRules â†’ ä¸šåŠ¡è§„åˆ™æ ¡éªŒ
 *   - forbiddenTools â†’ access matrix å¼ºæ ¡éªŒï¼ˆé€šè¿‡ agentIdentity é€å‡ºç»™ ToolInvokerï¼‰
 *
 * ä¸ºä»€ä¹ˆæ–°å»ºç±»è€Œä¸æ‰©å±• HarnessedAgentï¼š
 *   HarnessedAgent è®¾è®¡ä¸º ReActLoop å¤šæ­¥ agentï¼ˆtool calling / multi-iterationï¼‰ã€‚
 *   spec-based agent æ˜¯ single-shot LLM call with schema â€” è¯­ä¹‰ä¸åŒï¼Œç»§æ‰¿å…³ç³»ç‰µå¼ºã€‚
 *
 * å¯¹å¤–æš´éœ²ä¸¤ç§è°ƒç”¨æ–¹å¼ï¼š
 *   - executeSpec(input) â†’ Promise<IAgentResult<TOutput>>ï¼ˆæŽ¨èï¼špipeline stage ç”¨è¿™ä¸ªï¼Œæ‹¿ typed outputï¼‰
 *   - execute(task) â†’ AsyncIterable<IAgentEvent>ï¼ˆå…¼å®¹ IAgent æŽ¥å£ï¼Œyields thinking + finalize event pairï¼‰
 */

import { Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
// â˜… ç›´æŽ¥ç›¸å¯¹è·¯å¾„å¯¼å…¥ï¼Œç»•å¼€ facade barrelã€‚
// åŽŸå› ï¼šfacade/index.ts æ˜¯ L3 AI App çš„å•å‘å…¥å£ï¼›L2 harness å†…éƒ¨ä»£ç 
// è‹¥ä¹Ÿä»Ž facade å¯¼å…¥ï¼Œä¼šè§¦å‘ barrel â†’ ä¼—å¤šå­æ¨¡å— â†’ harness çš„å›žçŽ¯åŠ è½½ï¼Œ
// å¯¼è‡´ TypeScript åœ¨ module evaluation é˜¶æ®µäº§ç”Ÿ `undefined` ç±» referenceï¼Œ
// Nest DI éšåŽæŠ¥ "Cannot resolve dependency at index [0]"ã€‚
import { KernelContext } from "../../../../common/context/kernel-context";
import {
  ModelElectionService,
  NoEligibleModelError,
  type ElectionCandidate,
  type ElectionRoleHint,
} from "../../../ai-engine/llm/selection";
import type { EnvironmentSnapshot } from "../../../ai-harness/guardrails/runtime/runtime-environment.types";
import type {
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentSpec,
  IAgentTask,
  AgentId,
  AgentState,
  IContextEnvelope,
  ISubagentHandle,
  ISubagentSpec,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { LlmExecutor } from "../../runner/executor/llm-executor";

/**
 * SpecBasedAgent çš„å¼ºç±»åž‹ç»“æžœï¼ˆä¸Ž IAgentResult ç›¸ä¼¼ä½†å¸¦æ³›åž‹ TOutputï¼‰
 */
export interface SpecAgentResult<TOutput> {
  readonly output: TOutput;
  readonly state: "completed" | "failed" | "cancelled";
  readonly iterations: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly model: string;
  readonly wallTimeMs: number;
  readonly errors?: readonly string[];
}

export class SpecBasedAgent<
  TInput = unknown,
  TOutput = unknown,
> implements IAgent {
  private readonly logger: Logger;
  private _state: AgentState = "idle";
  private readonly abortController = new AbortController();
  private readonly _identity: AgentIdentity;
  private envelope: ContextEnvelope;

  constructor(
    public readonly id: AgentId,
    private readonly spec: IAgentSpec<TInput, TOutput>,
    private readonly llmExecutor: LlmExecutor,
    /**
     * Lazy election accessor â€” ç”± AgentFactory ä¼ å…¥çš„é—­åŒ… `() => factory.electionService`ã€‚
     * å¿…é¡» lazyï¼šæœ¬ agent åœ¨ OnModuleInit é˜¶æ®µåˆ›å»ºï¼ŒAgentFactory.electionService
     * åœ¨ OnApplicationBootstrap é˜¶æ®µæ‰è¢« wireï¼ˆsetter injection ç»•å¼€ Nest v10
     * forwardRef+Optional DI æ—¶åºå‘ï¼Œè§ docs/16-facade-barrel-rule.mdï¼‰ã€‚
     * æž„é€ æ—¶æ•èŽ· ref = æ°¸è¿œ undefinedï¼›å¿…é¡»è¿è¡Œæ—¶æ‹‰å–ã€‚
     */
    private readonly electionProvider?: () => ModelElectionService | undefined,
    /**
     * è¿è¡Œæ—¶çŽ¯å¢ƒå¿«ç…§ã€‚é€šå¸¸ç”± pipeline orchestrator åœ¨ executeSpec å‰æ³¨å…¥ï¼ˆæ¥è‡ª
     * identity.capabilities.envï¼‰ã€‚æ²¡æœ‰ snapshot æ—¶ï¼Œelection é€€åŒ–åˆ° DB å…¨è¡¨ã€‚
     */
    private readonly envSnapshot?: EnvironmentSnapshot,
  ) {
    this.logger = new Logger(`SpecBasedAgent:${id}`);
    this._identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);
    this.envelope = new ContextEnvelope({
      system: spec.systemPrompt ?? this._identity.toSystemPrompt(),
      messages: [],
      reminders: [],
      tools: [...this._identity.tools],
      memory: { sessionId: spec.sessionId ?? id, userId: spec.userId },
      budget: {
        tokensUsed: 0,
        tokensRemaining: this._identity.constraints?.maxTokens ?? 50_000,
        iterationsUsed: 0,
        iterationsRemaining: this._identity.constraints?.maxIterations ?? 5,
        wallTimeStartMs: Date.now(),
      },
    });
  }

  get identity(): IAgentIdentity {
    return this._identity;
  }

  get state(): AgentState {
    return this._state;
  }

  /**
   * â˜… ç›®æ ‡æž¶æž„ä¸»å…¥å£ï¼šspec â†’ LLM â†’ typed output
   * Pipeline stages ç”¨è¿™ä¸ªæ–¹æ³•ï¼Œå¾—åˆ°å¼ºç±»åž‹ç»“æžœã€‚
   *
   * @param envOverride è°ƒç”¨æ—¶ä¼ å…¥çš„çŽ¯å¢ƒå¿«ç…§â€”â€”é€šå¸¸æ¥è‡ª pipeline
   *   `identity.capabilities.env`ï¼›ç¼ºçœæ—¶ä½¿ç”¨æž„é€ æ—¶æ³¨å…¥çš„ envSnapshotï¼Œ
   *   ä¸¤è€…éƒ½ç¼ºå°±è®© election é€€åˆ° DB å…¨è¡¨æŸ¥è¯¢ã€‚
   */
  async executeSpec(
    input: TInput,
    envOverride?: EnvironmentSnapshot,
  ): Promise<SpecAgentResult<TOutput>> {
    this._state = "running";
    const startMs = Date.now();
    const ctx = { input, identity: this._identity };

    const systemPrompt = this.spec.buildSystemPrompt
      ? this.spec.buildSystemPrompt(ctx)
      : (this.spec.systemPrompt ?? this._identity.toSystemPrompt());
    const userPrompt = this.spec.buildUserPrompt
      ? this.spec.buildUserPrompt(ctx)
      : typeof input === "string"
        ? input
        : JSON.stringify(input);

    const kctx = KernelContext.get();
    const effectiveUserId = this.spec.userId ?? kctx?.userId;

    // ============================================================
    // çŽ¯å¢ƒæ„ŸçŸ¥é€‰ä¸¾ï¼šspec æ²¡å£°æ˜Žæ˜¾å¼ model â†’ æ ¹æ® role + TaskProfile åŠ¨æ€é€‰
    // ============================================================
    const taskProfile = this.spec.taskProfile ?? {
      creativity: "low",
      outputLength: "medium",
    };
    const effectiveEnv = envOverride ?? this.envSnapshot;
    const electedModelId = await this.electModelOrNull(
      taskProfile,
      effectiveUserId,
      effectiveEnv,
    );

    try {
      const result = await this.llmExecutor.execute<TOutput>({
        agentId: this.id,
        systemPrompt,
        userPrompt,
        model: electedModelId,
        outputSchema: this.spec.outputSchema,
        validateBusinessRules: this.spec.validateBusinessRules
          ? (output) => this.spec.validateBusinessRules!(output, ctx)
          : undefined,
        taskProfile,
        signal: this.abortController.signal,
        userId: effectiveUserId,
        operationName: this.id,
        stubFn: this.spec.stubFn ? () => this.spec.stubFn!(ctx) : undefined,
      });
      this._state = "completed";
      return {
        output: result.output,
        state: "completed",
        iterations: result.retries + 1,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        model: result.model,
        wallTimeMs: Date.now() - startMs,
      };
    } catch (err) {
      this._state = "failed";
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`executeSpec failed: ${msg}`);
      return {
        output: undefined as unknown as TOutput,
        state: "failed",
        iterations: 0,
        tokensUsed: 0,
        costUsd: 0,
        model: "",
        wallTimeMs: Date.now() - startMs,
        errors: [msg],
      };
    }
  }

  /**
   * å…¼å®¹ IAgent æŽ¥å£çš„æµå¼ executeã€‚
   * spec-based agent æ˜¯ single-shotï¼šyield ä¸€æ¡ "thinking" + ä¸€æ¡ "output" äº‹ä»¶ã€‚
   */
  async *execute(task: IAgentTask): AsyncIterable<IAgentEvent> {
    const input = task.input as TInput;
    yield {
      type: "thinking",
      payload: { text: `spec agent ${this.id} starting`, tokenCount: 0 },
    } as IAgentEvent;

    const result = await this.executeSpec(input);

    if (result.state === "completed") {
      yield {
        type: "output",
        payload: {
          output: result.output as string | Record<string, unknown>,
        },
      } as IAgentEvent;
    } else {
      yield {
        type: "error",
        payload: {
          message: result.errors?.join("; ") ?? "spec agent failed",
          recoverable: false,
        },
      } as IAgentEvent;
    }
  }

  spawnSubagent(_spec: ISubagentSpec): Promise<ISubagentHandle> {
    return Promise.reject(
      new Error(
        `[${this.id}] SpecBasedAgent does not support subagent spawning`,
      ),
    );
  }

  getEnvelope(): IContextEnvelope {
    return this.envelope;
  }

  cancel(reason?: string): Promise<void> {
    this.abortController.abort(reason);
    this._state = "cancelled";
    return Promise.resolve();
  }

  /**
   * æ‰§è¡ŒçŽ¯å¢ƒæ„ŸçŸ¥é€‰ä¸¾ã€‚å¤±è´¥æ—¶è¿”å›ž undefinedï¼ˆè®©ä¸‹æ¸¸ LlmExecutor èµ° AiChatService
   * çš„æ—§å…œåº•é“¾è·¯ï¼Œä¿æŒå‘åŽå…¼å®¹ï¼‰ã€‚æŠ› NoEligibleModelError æ—¶ upstream è¦çœ‹åˆ°
   * æ¸…æ™°æŠ¥é”™ï¼Œæ‰€ä»¥è¿™é‡Œç›´æŽ¥ throwï¼Œè®© executeSpec çš„ catch æŽ¥ä½ã€‚
   */
  private async electModelOrNull(
    taskProfile: IAgentSpec<TInput, TOutput>["taskProfile"],
    userId: string | undefined,
    env: EnvironmentSnapshot | undefined,
  ): Promise<string | undefined> {
    // Lazy resolve â€” æ­¤æ—¶ OnApplicationBootstrap å·²è·‘è¿‡ï¼Œfactory.electionService å·² wire
    const electionService = this.electionProvider?.();
    if (!electionService) return undefined;

    const role = this.resolveRoleHint(this._identity.role.id);
    const requestedModelType = AIModelType.CHAT;
    const candidates = this.buildCandidatesFromSnapshot(
      env,
      requestedModelType,
    );

    try {
      const res = await electionService.elect({
        modelType: requestedModelType,
        candidates,
        taskProfile,
        role,
        userId,
      });
      this.logger.debug(
        `[electModel] ${this.id} â†’ ${res.elected.modelId} (${res.reason})`,
      );
      return res.elected.modelId;
    } catch (err) {
      if (err instanceof NoEligibleModelError) throw err;
      this.logger.warn(
        `[electModel] ${this.id} election failed (non-fatal, falling back to AiChatService default): ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  /**
   * ä»Ž spec.identity.role.id æ˜ å°„åˆ° ElectionRoleHintã€‚
   * è§„åˆ™ï¼šåå­—é‡Œå‡ºçŽ° planner/leader/dispatch â†’ leaderï¼›writer/section â†’ writerï¼›
   * reviewer/evaluator/checker â†’ reviewerï¼›extractor/miner â†’ extractorï¼›
   * classifier/intent â†’ classifierï¼›å…¶ä½™ defaultã€‚
   */
  private resolveRoleHint(roleId: string): ElectionRoleHint {
    const lc = roleId.toLowerCase();
    if (/leader|planner|dispatch|adjust/.test(lc)) return "leader";
    if (/writer|section|synthes|editor|report/.test(lc)) return "writer";
    if (/review|evaluat|check|verif|repair/.test(lc)) return "reviewer";
    if (/extract|miner|meta/.test(lc)) return "extractor";
    if (/classif|intent/.test(lc)) return "classifier";
    return "default";
  }

  /** ä»ŽçŽ¯å¢ƒå¿«ç…§æž„é€ å€™é€‰æ± ï¼›æ—  snapshot æ—¶è¿”å›žç©ºæ•°ç»„ï¼ˆelection é€€åˆ° DB å…¨è¡¨ï¼‰ */
  private buildCandidatesFromSnapshot(
    env: EnvironmentSnapshot | undefined,
    requestedType: AIModelType,
  ): ElectionCandidate[] {
    if (!env) return [];
    const rows = [
      ...env.models.CHAT,
      ...env.models.REASONING,
      ...(requestedType === AIModelType.EMBEDDING ? env.models.EMBEDDING : []),
    ];
    return rows.map((m) => ({
      modelId: m.modelId,
      provider: m.provider,
      modelType: m.modelType,
      healthy: m.healthy,
      recentErrorRate: m.recentErrorRate,
      costTier: m.costTier,
    }));
  }
}
