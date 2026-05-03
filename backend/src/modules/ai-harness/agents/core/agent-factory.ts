/**
 * AgentFactory â€” ä»Ž IAgentSpec æž„é€  HarnessedAgent
 *
 * å¾ªçŽ¯ä¾èµ–å¤„ç†ï¼šAgentFactory â†” SubagentSpawnerã€‚
 * é‡‡ç”¨ setter injectionï¼šHarnessModule onApplicationBootstrap æ—¶æŠŠ spawner wire è¿›æ¥ã€‚
 * è¿™æ¯” forwardRef + @Inject(class) æ›´ç¨³ï¼Œæµ‹è¯•é‡Œä¹Ÿå¯ç›´æŽ¥ factory.setSubagentSpawner(mock)ã€‚
 */

import { Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
// â˜… type-only import â€” ModelElectionService is wired via setter injection
// (HarnessModule.onApplicationBootstrap) to avoid NestJS v10 forwardRef+Optional
// timing issues on sibling providers (LlmExecutor was losing AiChatService
// resolution in prod when this was a constructor @Optional inject).
import type { ModelElectionService } from "../../../ai-engine/llm/selection";
import type { EnvironmentSnapshot } from "../../../ai-harness/guardrails/runtime/runtime-environment.types";
import type {
  IAgent,
  IAgentLoop,
  IAgentSpec,
  IBudgetSnapshot,
  IContextEnvelope,
  IMemoryBinding,
  ISubagentSpawner,
} from "../abstractions";
import { AgentIdentity } from "./agent-identity";
import { ContextEnvelope } from "./context-envelope";
import { HarnessedAgent } from "./harnessed-agent";
import { SpecBasedAgent } from "./spec-based-agent";
import { ReActLoop } from "../../runner/loop/react-loop";
import { LoopRegistry } from "../../runner/loop/loop-registry";
import { MemoryContextBindingService } from "../../memory/indexing/memory-context-binding.service";
import { SkillActivator } from "../builtin-skills/skill-activator";
import { CheckpointService } from "../../memory/checkpoint/checkpoint.service";
import { AgentEventStore } from "../../memory/checkpoint/agent-event-store";
import { LlmExecutor } from "../../runner/executor/llm-executor";
import { AgentRegistry } from "../../handoffs/agent-registry";

@Injectable()
export class AgentFactory {
  private readonly defaultLoop?: IAgentLoop;
  private subagentSpawner?: ISubagentSpawner;
  /**
   * Model election service â€” wired via setter by HarnessModule.onApplicationBootstrap.
   * Same pattern as `subagentSpawner` above. Not using @Optional constructor inject
   * because in Nest v10 that combo with a forwardRef-provided dependency reliably
   * destabilised resolution of sibling providers (LlmExecutor lost AiChatService
   * in prod). Setter injection runs after all constructors, so no timing risk.
   */
  private electionService?: ModelElectionService;

  constructor(
    @Optional() reactLoop?: ReActLoop,
    @Optional()
    private readonly memoryContextBindingService?: MemoryContextBindingService,
    @Optional() private readonly skillActivator?: SkillActivator,
    @Optional() private readonly checkpointService?: CheckpointService,
    @Optional() private readonly llmExecutor?: LlmExecutor,
    /**
     * v2: LoopRegistry â€” æŒ‰ spec.loop é€‰æ‹© loop å®žçŽ°ã€‚
     * ç¼ºçœæ—¶é€€å›ž reactLoopï¼ˆé»˜è®¤ ReActLoopï¼‰ã€‚
     */
    @Optional() private readonly loopRegistry?: LoopRegistry,
    /**
     * PR-C: AgentEventStore â€” äº‹ä»¶æº¯æºæŒä¹…åŒ–ã€‚
     * ä¸æä¾›æ—¶äº‹ä»¶ä¸å…¥åº“ï¼ˆå‘åŽå…¼å®¹ï¼‰ã€‚
     */
    @Optional() private readonly eventStore?: AgentEventStore,
    /**
     * PR-R: AgentRegistry â€” agent å®žä¾‹ä¸­å¤®ç›®å½•ï¼Œhandoff å¿…éœ€ã€‚
     */
    @Optional() private readonly agentRegistry?: AgentRegistry,
  ) {
    this.defaultLoop = reactLoop;
  }

  /**
   * æŒ‰ spec.loop å­—æ®µä»Ž LoopRegistry å–å®žçŽ°ï¼›ç¼ºçœ reactã€‚
   * æ²¡æœ‰ LoopRegistry æ—¶é€€å›ž defaultLoopï¼ˆå‘åŽå…¼å®¹ï¼‰ã€‚
   */
  private pickLoop(spec: IAgentSpec): IAgentLoop | undefined {
    if (this.loopRegistry) {
      const kind = spec.loop ?? "react";
      if (this.loopRegistry.has(kind)) {
        return this.loopRegistry.get(kind);
      }
      // æœªæ³¨å†Œæ—¶é™é»˜ fallback åˆ° react
      if (this.loopRegistry.has("react")) {
        return this.loopRegistry.get("react");
      }
    }
    return this.defaultLoop;
  }

  /** Called by HarnessModule.onApplicationBootstrap to avoid forwardRef timing. */
  setElectionService(election: ModelElectionService): void {
    this.electionService = election;
  }

  /**
   * â˜… ç›®æ ‡æž¶æž„ v2ï¼šä»Žå£°æ˜Žå¼ IAgentSpec åˆ›å»º SpecBasedAgentã€‚
   * Spec å¿…é¡»åŒ…å« outputSchema æˆ– stubFn ä¹‹ä¸€ï¼ˆå¦åˆ™ä½¿ç”¨ createAgent èµ° ReActLoopï¼‰ã€‚
   *
   * @param envSnapshot çŽ¯å¢ƒå¿«ç…§â€”â€”pipeline stage ä»Ž identity.capabilities.env
   *   æ‹¿åˆ°åŽä¼ è¿›æ¥ï¼Œé©±åŠ¨ SpecBasedAgent çš„çŽ¯å¢ƒæ„ŸçŸ¥é€‰ä¸¾ã€‚
   */
  createSpecAgent<TInput, TOutput>(
    spec: IAgentSpec<TInput, TOutput>,
    envSnapshot?: EnvironmentSnapshot,
  ): SpecBasedAgent<TInput, TOutput> {
    if (!this.llmExecutor) {
      throw new Error(
        "LlmExecutor not available â€” cannot create spec agent. Ensure AiEngineHarnessModule is imported.",
      );
    }
    const id = spec.identity.role.id;
    // â˜… Lazy accessor (closure) â€” NOT this.electionService directly.
    // createSpecAgent is called during OnModuleInit (topic-insights.module.ts:346)
    // but setElectionService runs at OnApplicationBootstrap (HarnessModule).
    // Capturing the field ref here would freeze `undefined` forever; the closure
    // defers the read until runtime (executeSpec), by which point the setter has
    // wired the real service. This is the fix for Railway "AG-01-LD chat failed:
    // DEFAULT_AI_MODEL æœªè®¾ç½®" that persisted after DI was fixed.
    return new SpecBasedAgent<TInput, TOutput>(
      id,
      spec,
      this.llmExecutor,
      () => this.electionService,
      envSnapshot,
    );
  }

  /**
   * ä¾› HarnessModule onApplicationBootstrap è°ƒç”¨ï¼Œæ‰“ç ´å¾ªçŽ¯ä¾èµ–ã€‚
   * ä¸æä¾› spawner æ—¶ï¼Œagent.spawnSubagent() ä¼šæŠ›é”™ã€‚
   */
  setSubagentSpawner(spawner: ISubagentSpawner): void {
    this.subagentSpawner = spawner;
  }

  create(spec: IAgentSpec): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const sessionId = spec.sessionId ?? randomUUID();
    const memory: IMemoryBinding = {
      sessionId,
      userId: spec.userId,
      workspaceId: spec.workspaceId,
    };

    const budget: IBudgetSnapshot = {
      tokensUsed: 0,
      tokensRemaining: identity.constraints?.maxTokens ?? 50_000,
      iterationsUsed: 0,
      iterationsRemaining: identity.constraints?.maxIterations ?? 20,
      wallTimeStartMs: Date.now(),
    };

    const systemPrompt = spec.systemPrompt ?? identity.toSystemPrompt();

    const envelope = new ContextEnvelope({
      system: systemPrompt,
      messages: [],
      reminders: [],
      tools: [...identity.tools],
      memory,
      budget,
      runtimeEnv: spec.runtimeEnv, // PR-J
    });

    // â˜… åŒ…è£… spec.outputSchema + validateBusinessRules æˆ ReActLoop æœŸæœ›çš„
    // validator å½¢æ€ï¼ˆ{ok}|{ok:false, issues}ï¼‰ï¼Œé©±åŠ¨ finalize æ—¶çš„å†…å®¹æ ¡éªŒé—¸ï¼š
    // ä¸è¾¾æ ‡ â†’ critique reminder â†’ continue loop â†’ LLM ç›´æŽ¥è¡¥ç¼ºã€‚
    const outputSchemaValidator = spec.outputSchema
      ? (output: unknown) => {
          // ReActLoop.finalize ç»å¸¸æŠŠ LLM è¾“å‡ºåŽŸæ ·å¡žè¿› outputï¼›å¦‚æžœæ˜¯ string
          // å½¢å¼çš„ JSONï¼Œå…ˆå°è¯• parse å†æ ¡éªŒ
          let candidate: unknown = output;
          if (typeof candidate === "string") {
            const trimmed = candidate.trim();
            if (
              (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
              (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
              try {
                candidate = JSON.parse(trimmed);
              } catch {
                /* keep string; schema parse will fail */
              }
            }
          }
          const result = spec.outputSchema!.safeParse(candidate);
          if (result.success) return { ok: true as const };
          const issues = result.error.issues
            .map(
              (iss) =>
                `${iss.path.join(".") || "<root>"}: ${iss.message} (code=${iss.code})`,
            )
            .join("; ");
          return { ok: false as const, issues };
        }
      : undefined;
    const validateBusinessRulesWrapper = spec.validateBusinessRules
      ? (output: unknown, input?: unknown) => {
          try {
            // â˜… outputSchema å­˜åœ¨æ—¶ï¼Œå…ˆ schema-parse å‡ºç»“æž„åŒ–å€¼å†æ ¡éªŒä¸šåŠ¡è§„åˆ™ã€‚
            //   ReActLoop.finalize å¯èƒ½ç›´æŽ¥å¡žè¿› LLM çš„å­—ç¬¦ä¸²/éƒ¨åˆ†å¯¹è±¡ï¼Œæ²¡æœ‰è¿™ä¸€æ­¥
            //   validateBusinessRules ä¼šæ‹¿åˆ° raw å€¼ï¼ˆå¦‚ stringï¼‰ï¼Œå¸¸è§æŠ¥é”™
            //   "X is not iterable" / "Cannot read properties of undefined"ã€‚
            let typed: unknown = output;
            if (spec.outputSchema) {
              let candidate: unknown = output;
              if (typeof candidate === "string") {
                const trimmed = candidate.trim();
                if (
                  (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                  (trimmed.startsWith("[") && trimmed.endsWith("]"))
                ) {
                  try {
                    candidate = JSON.parse(trimmed);
                  } catch {
                    /* schema æ ¡éªŒé—¸ä¼šå…ˆæ‹¦ä¸‹ï¼Œè¿™é‡Œç›´æŽ¥è¿”å›ž null */
                    return null;
                  }
                }
              }
              const parsed = spec.outputSchema.safeParse(candidate);
              if (!parsed.success) {
                // schema é—¸å·²ç»æ‹’ç»äº†ï¼Œbusiness é—¸ä¸å†é‡å¤æŠ¥é”™
                return null;
              }
              typed = parsed.data;
            }
            // â˜… Bug fix (2026-04-28): input ä¹‹å‰ç¡¬ç¼–ç  undefinedï¼Œå¯¼è‡´ spec é‡Œ
            //   `ctx.input.phase` ä¹‹ç±»çš„è®¿é—®å´©æºƒä¸º "Cannot read properties of
            //   undefined (reading 'phase')"ã€‚çŽ°åœ¨ç”± HarnessedAgent.execute()
            //   æŠŠ task.input é€ä¼ è¿‡æ¥ã€‚ä»å…¼å®¹æ—§è°ƒç”¨ç‚¹ï¼ˆinput?=undefined æ—¶é€€åŒ–ï¼‰ã€‚
            spec.validateBusinessRules!(typed as never, {
              input: input as never,
              identity,
            });
            return null;
          } catch (err) {
            return err instanceof Error ? err.message : String(err);
          }
        }
      : undefined;

    return new HarnessedAgent({
      identity,
      envelope,
      loop: this.pickLoop(spec),
      memoryBridge: this.memoryContextBindingService,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
      checkpointService: this.checkpointService,
      checkpointEveryNActions: this.checkpointService ? 3 : 0,
      eventStore: this.eventStore,
      agentRegistry: this.agentRegistry,
      // é€ä¼  spec.taskProfile â€”â€” Loop å†… chat() ç”¨ agent çœŸå®žæ„å›¾
      taskProfile: spec.taskProfile,
      // â˜… å†…å®¹é©±åŠ¨é€€å‡ºé—¸ validator
      outputSchemaValidator,
      validateBusinessRules: validateBusinessRulesWrapper,
    });
  }

  /**
   * ä¾› SubagentSpawner ä½¿ç”¨ï¼šåœ¨å·²æ´¾ç”Ÿçš„ envelope ä¸Šåˆ›å»º agentï¼Œ
   * ä¸é‡æ–°è®¡ç®— memory/budgetï¼ˆisolation policy å·²ç»å‡†å¤‡å¥½äº†ï¼‰ã€‚
   */
  createWithEnvelope(spec: IAgentSpec, envelope: IContextEnvelope): IAgent {
    const identity =
      spec.identity instanceof AgentIdentity
        ? spec.identity
        : new AgentIdentity(spec.identity);

    const env =
      envelope instanceof ContextEnvelope
        ? envelope
        : new ContextEnvelope({
            system: envelope.system,
            messages: [...envelope.messages],
            reminders: [...envelope.reminders],
            tools: [...envelope.tools],
            memory: envelope.memory,
            budget: envelope.budget,
            // PR-J å¿…ä¿®ï¼šplain envelope é‡å»ºæ—¶ä¸èƒ½ä¸¢ runtimeEnvï¼Œ
            // å¦åˆ™ subagent å¤±åŽ»çŽ¯å¢ƒæ„ŸçŸ¥ â†’ credit/quota æ£€æŸ¥å…¨ noop
            runtimeEnv: envelope.runtimeEnv,
            metadata: envelope.metadata,
          });

    return new HarnessedAgent({
      identity,
      envelope: env,
      loop: this.pickLoop(spec),
      memoryBridge: this.memoryContextBindingService,
      skillActivator: this.skillActivator,
      subagentSpawner: this.subagentSpawner,
      checkpointService: this.checkpointService,
      checkpointEveryNActions: this.checkpointService ? 3 : 0,
      eventStore: this.eventStore,
      agentRegistry: this.agentRegistry,
    });
  }

  /**
   * Resumeï¼šä»Ž checkpoint é‡å»º agentï¼ˆenvelope + identity è¿˜åŽŸï¼‰ã€‚
   * é€‚åˆé•¿ä»»åŠ¡å¤±è´¥/ä¸­æ–­åŽç»­è·‘ã€‚
   */
  createFromCheckpoint(checkpoint: {
    identity: IAgentSpec["identity"];
    envelope: IContextEnvelope;
    sessionId?: string;
  }): IAgent {
    return this.createWithEnvelope(
      {
        identity: checkpoint.identity,
        sessionId: checkpoint.sessionId,
      },
      checkpoint.envelope,
    );
  }
}
