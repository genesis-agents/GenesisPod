/**
 * AI Engine - Mission Orchestrator Implementation
 * ä»»åŠ¡ç¼–æŽ’å™¨å®žçŽ°
 *
 * æ ¸å¿ƒæµç¨‹ï¼šMission Input â†’ Parse â†’ Plan â†’ Execute â†’ Review â†’ Deliver
 *
 * é›†æˆï¼š
 * - ConstraintEngine: çº¦æŸè¯„ä¼°å’Œæˆæœ¬è¿½è¸ª
 * - ToolRegistry: å†…ç½®å·¥å…·è°ƒç”¨
 * - SkillRegistry: æŠ€èƒ½è°ƒç”¨ â˜… æ–°å¢ž
 * - LLMFactory: LLM é€‚é…å™¨
 * - MCPManager: MCP å¤–éƒ¨å·¥å…·
 * - Memory: ä¸Šä¸‹æ–‡ç®¡ç†
 * - HandoffCoordinator: Leaderâ†’Member å§”æ´¾ â˜… æ–°å¢ž
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { ITeam } from "../abstractions/team.interface";
import { RoleId } from "../abstractions/role.interface";
import { ITeamMember } from "../abstractions/member.interface";
import {
  MissionInput,
  MissionResult,
  MissionEvent,
  MissionEventType,
  ParsedIntent,
  MissionDeliverable,
  TaskType,
  ComplexityLevel,
} from "../../agents/abstractions/mission.types";
import {
  ConstraintProfile,
  ResourceUsage,
  mergeConstraintProfiles,
} from "../constraints";
import { ConstraintEngine } from "@/modules/ai-harness/guardrails/constraints/constraint-engine";
import {
  IMissionOrchestrator,
  MissionExecutionPlan,
  MissionExecutionState,
  ExecutionStep,
  StepReviewResult,
  OrchestratorConfig,
  OrchestratorPhase,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from "./orchestrator.interface";

// AI Engine æ ¸å¿ƒä¾èµ–
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool.registry";
import { ToolPipeline } from "@/modules/ai-engine/tools/middleware/tool-pipeline";
import { SkillRegistry } from "@/modules/ai-engine/skills/registry/skill.registry";
import {
  SkillContext,
  SkillResult,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm.factory";
import { LLMToolDefinition } from "@/modules/ai-engine/llm/abstractions/llm-adapter.interface";
import { MCPManager } from "@/modules/ai-engine/tools/adapters/mcp/manager/mcp-manager";
import { ShortTermMemoryService } from "@/modules/ai-harness/memory/stores/short-term-memory.service";
import {
  HandoffCoordinator,
  HandoffContextBuilder,
} from "@/modules/ai-harness/teams/collaboration/patterns/handoff-pattern";
import { CollaborationMessage } from "@/modules/ai-harness/teams/collaboration/abstractions/collaborator.interface";
import { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
import {
  AiChatLLMAdapter,
  ISimpleLLMAdapter,
} from "@/modules/ai-engine/llm/adapters/ai-chat-llm.adapter";
import { PrismaService } from "@/common/prisma/prisma.service";
import { LruMap } from "@/common/utils/lru-map";
import { TraceCollectorService } from "@/modules/ai-harness/tracing/observability/trace-collector.service";
import { CheckpointManager } from "@/modules/ai-harness/protocols/journal/checkpoint-manager";
import { MessageBusService as A2AMessageBusService } from "@/modules/ai-harness/protocols/ipc/message-bus.service";
import {
  ExecutionContext,
  StepResult,
} from "@/modules/ai-harness/teams/orchestrator/workflow-orchestrator.interface";
import { MissionExecutorService } from "@/modules/ai-harness/lifecycle/manager/mission-executor.service";
import { EventJournalService } from "@/modules/ai-harness/protocols/journal/event-journal.service";
import { HierarchicalMemoryCascadeService } from "@/modules/ai-harness/memory/working/hierarchical-memory-cascade.service";
import {
  AgentLifecycleProtocolService,
  type TaskNotificationPayload,
} from "@/modules/ai-harness/protocols/ipc/agent-lifecycle-protocol.service";
import {
  AdaptiveReplannerService,
  type StepExecutionResult as ReplanStepExecutionResult,
} from "./adaptive-replanner.service";
import {
  MissionRuntimeStateStore,
  HEARTBEAT_INTERVAL_MS,
} from "../../lifecycle/mission-lifecycle/runtime-state-store";

/**
 * æ­¥éª¤æ‰§è¡Œç»“æžœï¼ˆå†…éƒ¨ä½¿ç”¨ï¼‰
 */
interface StepExecutionResult {
  stepId: string;
  executor: string;
  output: unknown;
  skillResults?: Array<{ skillId: string; result: SkillResult }>;
  toolResults?: unknown[];
  timestamp: Date;
  tokensUsed: number;
  costUsed: number;
}

/**
 * è¿”å·¥ä¸Šä¸‹æ–‡
 */
interface ReworkContext {
  stepId: string;
  attempt: number;
  previousOutput: unknown;
  reviewFeedback: string;
  issues: string[];
}

/**
 * Mission ç¼–æŽ’å™¨å®žçŽ°
 */
@Injectable()
export class TeamsMissionOrchestrator implements IMissionOrchestrator {
  private readonly logger = new Logger(TeamsMissionOrchestrator.name);
  private readonly states = new Map<string, MissionExecutionState>();
  private readonly config: OrchestratorConfig;
  private readonly handoffCoordinator: HandoffCoordinator;

  // â˜… A2A æ¶ˆæ¯æ€»çº¿ï¼ˆAgent é—´é€šä¿¡ï¼Œå¯é€‰ä¾èµ–ï¼‰
  private readonly a2aBus?: A2AMessageBusService;

  // â˜… å­˜å‚¨åŽŸå§‹è¾“å…¥ï¼Œä¸ä¾èµ– Memory æœåŠ¡ï¼ˆä¿®å¤æ•°æ®ä¸¢å¤±é—®é¢˜ï¼‰
  private readonly originalInputs = new LruMap<string, MissionInput>(500);

  // â˜… å­˜å‚¨ä»»åŠ¡çš„ traceIdï¼ˆç”¨äºŽ cancel æ—¶æ¸…ç†ï¼‰
  private readonly missionTraces = new LruMap<string, string>(500);

  // â˜… LLM é€‚é…å™¨ï¼ˆç”¨äºŽ Skills è°ƒç”¨ LLMï¼‰
  private readonly llmAdapter?: ISimpleLLMAdapter;

  // â˜… Trace æ”¶é›†å™¨ï¼ˆå¯é€‰ï¼Œç”¨äºŽæ‰§è¡Œé“¾è·¯å¯è§†åŒ–ï¼‰
  private readonly traceCollector?: TraceCollectorService;

  // â˜… Checkpoint ç®¡ç†å™¨ï¼ˆå¯é€‰ï¼Œç”¨äºŽè‡ªåŠ¨ä¿å­˜æ£€æŸ¥ç‚¹ï¼‰
  private readonly checkpointManager?: CheckpointManager;

  // â˜… AI Kernel è¿›ç¨‹ç”Ÿå‘½å‘¨æœŸï¼ˆå¯é€‰ï¼Œç”¨äºŽ Durable Executionï¼‰
  private readonly missionExecutor?: MissionExecutorService;
  private readonly kernelJournal?: EventJournalService;
  // â˜… Phase 4: è‡ªé€‚åº”é‡è§„åˆ’ï¼ˆå¯é€‰ï¼‰
  private readonly adaptiveReplanner?: AdaptiveReplannerService;
  // â˜… Phase 6: åˆ†å±‚è®°å¿†çº§è”ï¼ˆå¯é€‰ï¼‰
  private readonly hierarchicalMemory?: HierarchicalMemoryCascadeService;
  // â˜… Phase 8: Agent ç”Ÿå‘½å‘¨æœŸåè®®ï¼ˆå¯é€‰ï¼‰
  private readonly lifecycleProtocol?: AgentLifecycleProtocolService;
  // missionId â†’ kernel processId æ˜ å°„
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  // â˜… å¿ƒè·³å®šæ—¶å™¨ï¼ˆpod-localï¼Œè·Ÿéš mission ç”Ÿå‘½å‘¨æœŸï¼‰
  private readonly heartbeatTimers = new Map<string, NodeJS.Timeout>();

  // â˜… Phase 9 (2026-04-30): è¿è¡Œæ—¶çŠ¶æ€å¤–ç½® â€”â€” Redis æŒä¹…åŒ–ï¼Œè·¨ pod æŽ¥ç®¡
  private readonly runtimeStore?: MissionRuntimeStateStore;

  // 2026-05-01 (PR-X-R): ToolPipeline æ³¨å…¥åˆ°æ”¯æŒ setToolPipeline() çš„ skill
  private readonly toolPipeline?: ToolPipeline;

  constructor(
    private readonly constraintEngine: ConstraintEngine,
    private readonly configService: ConfigService,
    private readonly toolRegistry?: ToolRegistry,
    private readonly skillRegistry?: SkillRegistry,
    private readonly llmFactory?: LLMFactory,
    private readonly memoryService?: ShortTermMemoryService,
    private readonly mcpManager?: MCPManager,
    private readonly aiChatService?: AiChatService,
    private readonly prismaService?: PrismaService,
    traceCollector?: TraceCollectorService,
    checkpointManager?: CheckpointManager,
    a2aBus?: A2AMessageBusService,
    config?: Partial<OrchestratorConfig>,
    missionExecutor?: MissionExecutorService,
    kernelJournal?: EventJournalService,
    @Optional() adaptiveReplanner?: AdaptiveReplannerService,
    @Optional() hierarchicalMemory?: HierarchicalMemoryCascadeService,
    @Optional() lifecycleProtocol?: AgentLifecycleProtocolService,
    @Optional() runtimeStore?: MissionRuntimeStateStore,
    @Optional() toolPipeline?: ToolPipeline,
  ) {
    // 2026-05-01 (PR-X-R): æ³¨å…¥ ToolPipeline åˆ°æ”¯æŒ setToolPipeline() çš„ skill
    this.toolPipeline = toolPipeline;
    // â˜… è¿è¡Œæ—¶çŠ¶æ€å¤–ç½®ï¼ˆå¯é€‰ â€” ä¸å­˜åœ¨æ—¶é€€åŒ–ä¸ºå•å®žä¾‹å†…å­˜ï¼‰
    this.runtimeStore = runtimeStore;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.handoffCoordinator = new HandoffCoordinator({
      timeout: 60000,
      requireConfirmation: false,
      maxRetries: 2,
      autoFallback: true,
    });

    // â˜… åˆ›å»º LLM é€‚é…å™¨ï¼ˆå¦‚æžœ AiChatService å¯ç”¨ï¼‰
    // ä¼ é€’ PrismaService ä»¥ä»Žæ•°æ®åº“èŽ·å–é»˜è®¤æ¨¡åž‹é…ç½®
    if (this.aiChatService) {
      this.llmAdapter = new AiChatLLMAdapter(
        this.aiChatService,
        this.configService,
        this.prismaService,
      );
      this.logger.log(
        "LLM adapter initialized with AiChatService, ConfigService and PrismaService",
      );
    }

    // â˜… å­˜å‚¨ TraceCollector å¼•ç”¨ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.traceCollector = traceCollector;
    if (this.traceCollector) {
      this.logger.log(
        "TraceCollector initialized for execution instrumentation",
      );
    }

    // â˜… å­˜å‚¨ CheckpointManager å¼•ç”¨ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.checkpointManager = checkpointManager;
    if (this.checkpointManager) {
      this.logger.log("CheckpointManager initialized for auto-checkpoint");
    }

    // â˜… å­˜å‚¨ A2A Message Bus å¼•ç”¨ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.a2aBus = a2aBus;
    if (this.a2aBus) {
      this.logger.log(
        "A2AMessageBus initialized for inter-agent communication",
      );
    }

    // â˜… AI Kernel è¿›ç¨‹è¿½è¸ªï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.missionExecutor = missionExecutor;
    this.kernelJournal = kernelJournal;
    if (this.missionExecutor) {
      this.logger.log(
        "AI Kernel MissionExecutor initialized for durable execution",
      );
    }

    // â˜… Phase 4: è‡ªé€‚åº”é‡è§„åˆ’ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.adaptiveReplanner = adaptiveReplanner;
    if (this.adaptiveReplanner) {
      this.logger.log("AdaptiveReplanner initialized for dynamic replanning");
    }

    // â˜… Phase 6: åˆ†å±‚è®°å¿†çº§è”ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.hierarchicalMemory = hierarchicalMemory;
    if (this.hierarchicalMemory) {
      this.logger.log(
        "HierarchicalMemoryCascade initialized for context resolution",
      );
    }

    // â˜… Phase 8: Agent ç”Ÿå‘½å‘¨æœŸåè®®ï¼ˆå¯é€‰ä¾èµ–ï¼‰
    this.lifecycleProtocol = lifecycleProtocol;
    if (this.lifecycleProtocol) {
      this.logger.log(
        "AgentLifecycleProtocol initialized for task completion notifications",
      );
    }

    // â˜… Phase 9: Mission è¿è¡Œæ—¶çŠ¶æ€å¤–ç½®
    if (this.runtimeStore) {
      this.logger.log(
        `MissionRuntimeStateStore initialized (podId=${this.runtimeStore.getPodId()}) â€” harness is now stateless across pods`,
      );
    }
  }

  // ==================== Runtime Store åŒæ­¥è¾…åŠ© ====================

  /** state å†™å…¥åŽåŒæ­¥åˆ° storeï¼ˆfire-and-forgetï¼Œå¤±è´¥ä¸å½±å“ä¸»æµç¨‹ï¼‰ */
  private syncStateToStore(
    missionId: string,
    state: MissionExecutionState,
  ): void {
    if (!this.runtimeStore) return;
    void this.runtimeStore
      .setState(missionId, state)
      .catch((err) =>
        this.logger.debug(
          `[runtimeStore] setState(${missionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /** å¯åŠ¨ mission æ—¶è°ƒç”¨ â€”â€” claim å¿ƒè·³ + èµ· 30s ç»­æœŸå®šæ—¶å™¨ */
  private startHeartbeat(missionId: string): void {
    if (!this.runtimeStore) return;
    // ç«‹å³ claim ä¸€æ¬¡
    void this.runtimeStore
      .claimOrBeat(missionId)
      .catch((err) =>
        this.logger.debug(
          `[runtimeStore] claimOrBeat(${missionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    // èµ·å®šæ—¶å™¨ï¼ˆæ¸…æŽ‰æ—§çš„é˜²æ³„æ¼ï¼‰
    const old = this.heartbeatTimers.get(missionId);
    if (old) clearInterval(old);
    const timer = setInterval(() => {
      void this.runtimeStore?.claimOrBeat(missionId).catch(() => {
        /* swallow â€” å¿ƒè·³å¤±è´¥ä¸é˜»å¡žæ‰§è¡Œ */
      });
    }, HEARTBEAT_INTERVAL_MS);
    // Node è¿›ç¨‹é€€å‡ºæ—¶ä¸é˜»å¡ž
    if (typeof timer.unref === "function") timer.unref();
    this.heartbeatTimers.set(missionId, timer);
  }

  /** mission ç»ˆæ€æ—¶è°ƒç”¨ â€”â€” åœå¿ƒè·³ + æ¸… store key */
  private stopHeartbeat(missionId: string): void {
    const timer = this.heartbeatTimers.get(missionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(missionId);
    }
    if (!this.runtimeStore) return;
    void this.runtimeStore
      .clearAll(missionId)
      .catch((err) =>
        this.logger.debug(
          `[runtimeStore] clearAll(${missionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /**
   * æ‰§è¡Œ Missionï¼ˆå®Œæ•´æµç¨‹ï¼‰
   */
  async *execute(
    input: MissionInput,
    team: ITeam,
    constraintOverrides?: Partial<ConstraintProfile>,
  ): AsyncGenerator<MissionEvent, MissionResult> {
    const missionId = uuidv4();
    const startTime = Date.now();

    // åˆå¹¶çº¦æŸé…ç½®
    const constraints = mergeConstraintProfiles(
      team.constraintProfile,
      constraintOverrides || {},
    );

    // åˆå§‹åŒ–çŠ¶æ€
    const state = this.initializeState(missionId);
    this.states.set(missionId, state);
    this.syncStateToStore(missionId, state);

    // â˜… ç›´æŽ¥å­˜å‚¨åŽŸå§‹è¾“å…¥ï¼ˆä¸ä¾èµ– Memory æœåŠ¡ï¼‰
    this.originalInputs.set(missionId, input);
    if (this.runtimeStore) {
      void this.runtimeStore.setInput(missionId, input).catch(() => undefined);
    }

    // â˜… å¯åŠ¨å¿ƒè·³ï¼ˆæ ‡è¯†å½“å‰ pod æŒæœ‰ missionï¼Œè·¨ pod æŽ¥ç®¡çš„ä¾æ®ï¼‰
    this.startHeartbeat(missionId);

    // â˜… AI Kernel: åˆ›å»ºè¿›ç¨‹è®°å½•ï¼ˆDurable Executionï¼‰
    if (this.missionExecutor) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId: "system",
          agentId: team.leader.role.id,
          teamSessionId: missionId,
          input: { prompt: input.prompt, requirements: input.requirements },
        });
        this.kernelProcessIds.set(missionId, kernelResult.processId);
        if (this.runtimeStore) {
          void this.runtimeStore
            .setKernelProcessId(missionId, kernelResult.processId)
            .catch(() => undefined);
        }
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process for mission ${missionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // å­˜å‚¨ä¸Šä¸‹æ–‡åˆ° Memoryï¼ˆå¯é€‰ï¼Œç”¨äºŽæŒä¹…åŒ–ï¼‰
    await this.storeContext(missionId, "input", input);

    // â˜… å¼€å§‹ Traceï¼ˆç”¨äºŽæ‰§è¡Œé“¾è·¯å¯è§†åŒ–ï¼‰
    const traceId = this.traceCollector?.startTrace({
      name: `Mission: ${input.prompt.slice(0, 50)}...`,
      type: "team_execution",
      metadata: {
        missionId,
        teamId: team.id,
        teamName: team.name,
        prompt: input.prompt,
        constraintProfile: constraints,
      },
    });

    if (traceId) {
      this.missionTraces.set(missionId, traceId);
      if (this.runtimeStore) {
        void this.runtimeStore
          .setTraceId(missionId, traceId)
          .catch(() => undefined);
      }
    }

    try {
      // å‘é€å¼€å§‹äº‹ä»¶
      yield this.createEvent("mission_started", missionId, { input });

      // Phase 1: Parse - è§£æžæ„å›¾
      yield this.createEvent("parsing_started", missionId);
      state.phase = "parsing";

      // â˜… å¼€å§‹ Parse span
      let parseSpanId: string | undefined;
      if (traceId) {
        parseSpanId = this.traceCollector?.addSpan(traceId, {
          name: "Parse Intent",
          type: "planning",
          metadata: { phase: "parsing" },
        });
      }

      const intent = await this.parse(input);
      // â˜… å…³é”®ä¿®å¤ï¼šç¡®ä¿ intent.missionId ä¸Žå½“å‰ missionId ä¸€è‡´
      // parse() è¿”å›žçš„ intent.missionId å¯èƒ½æ˜¯ç©ºå­—ç¬¦ä¸²ï¼Œéœ€è¦è¦†ç›–
      intent.missionId = missionId;
      await this.storeContext(missionId, "intent", intent);

      // â˜… Phase 6: HierarchicalMemoryCascade â€” resolve project/team context
      if (this.hierarchicalMemory) {
        const meta = input.metadata ?? {};
        const userId =
          typeof meta["userId"] === "string" ? meta["userId"] : undefined;
        const projectId =
          typeof meta["projectId"] === "string" ? meta["projectId"] : undefined;
        const teamId =
          typeof meta["teamId"] === "string" ? meta["teamId"] : undefined;
        if (userId) {
          const memContext = this.hierarchicalMemory.resolve({
            sessionId: missionId,
            projectId,
            teamId,
            orgId: userId,
            key: "research-context",
          });
          if (memContext) {
            this.logger.debug(
              `[execute] Loaded memory context from ${memContext.resolvedFrom} scope`,
            );
            // â˜… F6 Fix: Inject resolved memory into mission context so agents can use it
            if (typeof memContext.value === "string") {
              input.prompt = `[Context from ${memContext.resolvedFrom} memory]\n${memContext.value}\n\n${input.prompt}`;
            } else if (
              memContext.value &&
              typeof memContext.value === "object"
            ) {
              if (!input.metadata) input.metadata = {};
              input.metadata["resolvedMemoryContext"] = memContext.value;
            }
          }
        }
      }

      // â˜… ç»“æŸ Parse span
      if (parseSpanId) {
        this.traceCollector?.endSpan(parseSpanId, {
          status: "success",
          output: {
            taskType: intent.taskType,
            complexity: intent.complexity.overall,
          },
        });
      }

      // â˜… ä¿å­˜ checkpointï¼šè§£æžå®Œæˆ
      void this.saveCheckpoint(missionId, team.workflow.id, "parse_complete", {
        taskType: intent.taskType,
        complexity: intent.complexity.overall,
        primaryGoal: intent.primaryGoal,
      });

      // â˜… AI Kernel: è®°å½•è§£æžå®Œæˆäº‹ä»¶
      void this.recordKernelEvent(missionId, "phase:parse_complete", {
        taskType: intent.taskType,
        complexity: intent.complexity.overall,
      });

      yield this.createEvent("parsing_completed", missionId, { intent });
      this.syncStateToStore(missionId, state);

      // Phase 2: Plan - ç”Ÿæˆæ‰§è¡Œè®¡åˆ’
      yield this.createEvent("planning_started", missionId);
      state.phase = "planning";

      // â˜… å¼€å§‹ Planning span
      let planSpanId: string | undefined;
      if (traceId) {
        planSpanId = this.traceCollector?.addSpan(traceId, {
          name: "Generate Execution Plan",
          type: "planning",
          metadata: { phase: "planning", teamWorkflow: team.workflow.type },
        });
      }

      const plan = await this.plan(intent, team, constraints);
      await this.storeContext(missionId, "plan", plan);

      // â˜… ç»“æŸ Planning span
      if (planSpanId) {
        this.traceCollector?.endSpan(planSpanId, {
          status: "success",
          output: {
            stepCount: plan.steps.length,
            estimatedDuration: plan.estimatedDuration,
          },
        });
      }

      // â˜… ä¿å­˜ checkpointï¼šè®¡åˆ’ç”Ÿæˆå®Œæˆ
      void this.saveCheckpoint(missionId, team.workflow.id, "plan_complete", {
        stepCount: plan.steps.length,
        estimatedDuration: plan.estimatedDuration,
        estimatedCost: plan.estimatedCost,
      });

      // â˜… AI Kernel: è®°å½•è®¡åˆ’å®Œæˆäº‹ä»¶
      void this.recordKernelEvent(missionId, "phase:plan_complete", {
        stepCount: plan.steps.length,
        estimatedDuration: plan.estimatedDuration,
      });

      yield this.createEvent("planning_completed", missionId, { plan });
      this.syncStateToStore(missionId, state);

      // Phase 3: Execute - æ‰§è¡Œè®¡åˆ’ï¼ˆå«å§”æ´¾å’Œåä½œï¼‰
      state.phase = "executing";

      // â˜… å¼€å§‹ Execution span
      let execSpanId: string | undefined;
      if (traceId) {
        execSpanId = this.traceCollector?.addSpan(traceId, {
          name: "Execute Plan",
          type: "synthesis",
          metadata: { phase: "execution", taskCount: plan.steps.length },
        });
      }

      for await (const event of this.executePlan(plan, team, constraints)) {
        yield event;

        // æ›´æ–°çŠ¶æ€
        if (event.type === "step_completed") {
          state.completedSteps.push(event.data?.stepId as string);
          state.intermediateOutputs.set(
            event.data?.stepId as string,
            event.data?.output,
          );

          // â˜… åŒæ­¥æŠ€èƒ½ç»“æžœåˆ° intermediateOutputsï¼ˆä»¥æŠ€èƒ½ ID ä¸ºé”®ï¼‰
          const stepOutput = event.data?.output as StepExecutionResult;
          if (stepOutput?.skillResults) {
            for (const { skillId, result } of stepOutput.skillResults) {
              if (result.success && result.data) {
                state.intermediateOutputs.set(skillId, result.data);
              }
            }
          }

          // â˜… Phase 8: AgentLifecycleProtocol â€” notify task completion
          if (this.lifecycleProtocol) {
            const stepId = event.data?.stepId as string | undefined;
            const notifPayload: TaskNotificationPayload = {
              taskId: stepId ?? "",
              status: "completed",
              summary: `Step completed: ${stepId ?? "unknown"}`,
              tokensUsed: (stepOutput as unknown as { tokensUsed?: number })
                ?.tokensUsed,
            };
            void this.lifecycleProtocol.notifyTaskComplete(
              missionId,
              "mission-orchestrator",
              "leader",
              notifPayload,
            );
          }
        }
        if (event.type === "step_failed") {
          state.failedSteps.push(event.data?.stepId as string);
        }

        // æ›´æ–°èµ„æºä½¿ç”¨
        state.resourceUsage = this.updateResourceUsage(state, startTime);

        // â˜… Phase 9: æ¯ä¸ª step å®ŒæˆåŽåŒæ­¥åˆ° runtime storeï¼ˆæ–­ç‚¹ç»­è·‘ç”¨ï¼‰
        this.syncStateToStore(missionId, state);

        // æ£€æŸ¥çº¦æŸ
        const canContinue = this.constraintEngine.canContinue(
          constraints,
          state.resourceUsage,
        );
        if (!canContinue.canContinue) {
          throw new Error(canContinue.reason);
        }
      }

      // â˜… ç»“æŸ Execution span
      if (execSpanId) {
        this.traceCollector?.endSpan(execSpanId, {
          status: "success",
          output: {
            completedSteps: state.completedSteps.length,
            failedSteps: state.failedSteps.length,
          },
        });
      }

      // Phase 4: Review - å®¡æ ¸ï¼ˆå«è¿”å·¥å¾ªçŽ¯ï¼‰
      if (constraints.quality.reviewRequired) {
        yield this.createEvent("review_started", missionId);
        state.phase = "reviewing";

        // â˜… å¼€å§‹ Review span
        let reviewSpanId: string | undefined;
        if (traceId) {
          reviewSpanId = this.traceCollector?.addSpan(traceId, {
            name: "Review & Rework",
            type: "review",
            metadata: {
              phase: "reviewing",
              stepsToReview: state.intermediateOutputs.size,
            },
          });
        }

        for (const [stepId, output] of state.intermediateOutputs) {
          // è·³è¿‡ delivery æ­¥éª¤çš„å®¡æ ¸
          if (stepId === "delivery") continue;

          let currentOutput = output;
          let attempt = 0;
          let reviewResult: StepReviewResult;

          // è¿”å·¥å¾ªçŽ¯
          do {
            reviewResult = await this.review(stepId, currentOutput, team);
            state.reviewResults.push(reviewResult);
            yield this.createEvent("review_completed", missionId, {
              reviewResult,
            });

            if (
              !reviewResult.passed &&
              attempt < constraints.quality.maxReworks
            ) {
              // â˜… çœŸæ­£çš„è¿”å·¥ï¼šé‡æ–°æ‰§è¡Œæ­¥éª¤
              yield this.createEvent("rework_requested", missionId, {
                stepId,
                attempt: attempt + 1,
                reason: reviewResult.feedback,
              });

              const plan = (await this.getContext(missionId))
                .plan as MissionExecutionPlan;
              const step = plan.steps.find((s) => s.id === stepId);
              if (step) {
                const executor =
                  team.getMemberById(step.executor) || team.leader;
                const reworkContext: ReworkContext = {
                  stepId,
                  attempt: attempt + 1,
                  previousOutput: currentOutput,
                  reviewFeedback: reviewResult.feedback,
                  issues: [],
                };

                // é‡æ–°æ‰§è¡Œæ­¥éª¤
                const reworkResult = await this.executeStepWithRework(
                  step,
                  executor,
                  missionId,
                  state,
                  reworkContext,
                );
                currentOutput = reworkResult;
                state.intermediateOutputs.set(stepId, currentOutput);

                yield this.createEvent("rework_completed", missionId, {
                  stepId,
                  attempt: attempt + 1,
                  output: currentOutput,
                });
              }

              state.resourceUsage.reworkCount++;
              attempt++;
            }
          } while (
            !reviewResult.passed &&
            attempt < constraints.quality.maxReworks
          );
        }

        // â˜… ç»“æŸ Review span
        if (reviewSpanId) {
          this.traceCollector?.endSpan(reviewSpanId, {
            status: "success",
            output: {
              reviewCount: state.reviewResults.length,
              reworkCount: state.resourceUsage.reworkCount,
            },
          });
        }

        // â˜… ä¿å­˜ checkpointï¼šå®¡æ ¸å®Œæˆ
        void this.saveCheckpoint(
          missionId,
          team.workflow.id,
          "review_complete",
          {
            reviewCount: state.reviewResults.length,
            passedCount: state.reviewResults.filter((r) => r.passed).length,
            reworkCount: state.resourceUsage.reworkCount,
          },
        );

        // â˜… AI Kernel: è®°å½•å®¡æ ¸å®Œæˆäº‹ä»¶
        void this.recordKernelEvent(missionId, "phase:review_complete", {
          reviewCount: state.reviewResults.length,
          reworkCount: state.resourceUsage.reworkCount,
        });
      }

      // Phase 5: Deliver - ç”Ÿæˆäº¤ä»˜ç‰©ï¼ˆä½¿ç”¨å¯¼å‡ºå·¥å…·ï¼‰
      yield this.createEvent("delivering_started", missionId);
      state.phase = "delivering";

      // â˜… å¼€å§‹ Delivery span
      let deliverSpanId: string | undefined;
      if (traceId) {
        deliverSpanId = this.traceCollector?.addSpan(traceId, {
          name: "Generate Deliverables",
          type: "synthesis",
          metadata: { phase: "delivering" },
        });
      }

      const deliverables = await this.deliver(state, team);
      state.deliverables = deliverables;

      // â˜… ç»“æŸ Delivery span
      if (deliverSpanId) {
        this.traceCollector?.endSpan(deliverSpanId, {
          status: "success",
          output: { deliverableCount: deliverables.length },
        });
      }

      for (const deliverable of deliverables) {
        yield this.createEvent("deliverable_ready", missionId, { deliverable });
      }

      // å®Œæˆ
      state.phase = "completed";
      const result = this.createResult(state, startTime, true);

      // â˜… ç»“æŸ Traceï¼ˆæˆåŠŸï¼‰
      if (traceId) {
        this.traceCollector?.endTrace(traceId, {
          status: "success",
        });
      }

      // â˜… AI Kernel: æ ‡è®°è¿›ç¨‹å®Œæˆ
      void this.completeKernelProcess(missionId, {
        completedSteps: state.completedSteps.length,
        failedSteps: state.failedSteps.length,
        durationMs: Date.now() - startTime,
      });

      yield this.createEvent("mission_completed", missionId, { result });

      // â˜… æ¸…ç†åŽŸå§‹è¾“å…¥ï¼Œé˜²æ­¢å†…å­˜æ³„æ¼
      this.originalInputs.delete(missionId);
      // â˜… åœå¿ƒè·³ + æ¸… runtime store
      this.stopHeartbeat(missionId);

      return result;
    } catch (error) {
      state.phase = "failed";
      const errorMessage = (error as Error).message;

      // â˜… ç»“æŸ Traceï¼ˆå¤±è´¥ï¼‰
      if (traceId) {
        this.traceCollector?.endTrace(traceId, {
          status: "error",
        });
      }

      // â˜… AI Kernel: æ ‡è®°è¿›ç¨‹å¤±è´¥
      void this.failKernelProcess(missionId, errorMessage);

      yield this.createEvent("mission_failed", missionId, {
        error: errorMessage,
      });

      // â˜… æ¸…ç†åŽŸå§‹è¾“å…¥ï¼Œé˜²æ­¢å†…å­˜æ³„æ¼
      this.originalInputs.delete(missionId);
      // â˜… åœå¿ƒè·³ + æ¸… runtime store
      this.stopHeartbeat(missionId);

      return this.createResult(state, startTime, false, errorMessage);
    }
  }

  /**
   * è§£æž Mission æ„å›¾
   */
  async parse(input: MissionInput): Promise<ParsedIntent> {
    this.logger.log("Parsing mission intent...");

    // ä½¿ç”¨ LLM è¿›è¡Œæ„å›¾è§£æžï¼ˆå¦‚æžœå¯ç”¨ï¼‰
    const parsedByLLM = await this.parseWithLLM(input);
    if (parsedByLLM) {
      return parsedByLLM;
    }

    // é™çº§ï¼šä½¿ç”¨è§„åˆ™è§£æž
    const taskType = this.inferTaskType(input.prompt);
    const complexity = this.assessComplexity(input);

    return {
      id: uuidv4(),
      missionId: "",
      primaryGoal: input.prompt.slice(0, 100),
      secondaryGoals: input.requirements || [],
      extractedInfo: {
        topics: this.extractTopics(input.prompt),
        entities: [],
        language: "zh",
      },
      taskType,
      complexity,
      suggestedStrategy: {
        workflowType: complexity.overall === "high" ? "hybrid" : "sequential",
        memberConfig: [],
        needsIteration: complexity.overall !== "low",
        needsHumanReview: false,
        riskFactors: [],
      },
      confidence: 0.8,
    };
  }

  /**
   * ä½¿ç”¨ LLM è§£æžæ„å›¾
   * â˜… æ·»åŠ  30 ç§’è¶…æ—¶ï¼Œé˜²æ­¢ parse é˜¶æ®µæ— é™æŒ‚èµ·
   */
  private async parseWithLLM(
    input: MissionInput,
  ): Promise<ParsedIntent | null> {
    if (!this.llmFactory) return null;

    const adapter = this.llmFactory.getAdapter();
    if (!adapter) return null;

    // â˜… 30 ç§’è¶…æ—¶ç”¨äºŽ parse é˜¶æ®µ
    const PARSE_TIMEOUT = 30000;

    try {
      const systemPrompt = `你是一个任务分析专家。分析用户输入，提取：
1. 主要目标
2. 次要目标
3. 任务类型（research/analysis/creation/design/debate/review/mixed）
4. 复杂度评估
5. 建议的执行策略

以 JSON 格式输出。
CRITICAL: Your entire response MUST be valid JSON only. No explanation, no markdown, no code blocks. Start with { and end with }.`;

      // â˜… ä½¿ç”¨ Promise.race å¼ºåˆ¶è¶…æ—¶
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Parse timeout")), PARSE_TIMEOUT);
      });

      const response = await Promise.race([
        adapter.chat({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.prompt },
          ],
          model: this.llmFactory.getDefaultModel(),
          taskProfile: { creativity: "low", outputLength: "short" },
          responseFormat: "json",
        }),
        timeoutPromise,
      ]);

      // è®°å½•æˆæœ¬
      if (response.usage) {
        this.constraintEngine.recordCost(
          "parse_intent",
          response.model || "unknown",
          response.usage.promptTokens || 0,
          response.usage.completionTokens || 0,
        );
      }

      // è§£æž LLM å“åº”
      if (response.content) {
        const parsed = this.parseLLMResponse(response.content, input);
        if (parsed) {
          return parsed;
        }
      }
    } catch (error) {
      this.logger.warn(
        `LLM parsing failed: ${(error as Error).message}, falling back to rules`,
      );
    }

    return null;
  }

  /**
   * è§£æž LLM å“åº”
   */
  private parseLLMResponse(
    content: string,
    input: MissionInput,
  ): ParsedIntent | null {
    try {
      // Try direct parse first (JSON mode response), then fall back to extraction
      let parsed: ReturnType<typeof JSON.parse>;
      try {
        parsed = JSON.parse(content.trim());
      } catch {
        parsed = JSON.parse(this.extractFirstJsonObject(content) ?? "null");
      }
      const taskType = this.inferTaskType(input.prompt);
      const complexity = this.assessComplexity(input);

      return {
        id: uuidv4(),
        missionId: "",
        primaryGoal: parsed.primaryGoal || input.prompt.slice(0, 100),
        secondaryGoals: parsed.secondaryGoals || input.requirements || [],
        extractedInfo: {
          topics: parsed.topics || this.extractTopics(input.prompt),
          entities: parsed.entities || [],
          language: parsed.language || "zh",
        },
        taskType: parsed.taskType || taskType,
        complexity: {
          overall: parsed.complexity?.overall || complexity.overall,
          informational: complexity.informational,
          logical: complexity.logical,
          creative: complexity.creative,
          estimatedSubTasks:
            parsed.estimatedSubTasks || complexity.estimatedSubTasks,
          estimatedDuration: complexity.estimatedDuration,
          estimatedCost: complexity.estimatedCost,
        },
        suggestedStrategy: {
          workflowType: parsed.workflowType || "sequential",
          memberConfig: [],
          needsIteration: parsed.needsIteration ?? true,
          needsHumanReview: parsed.needsHumanReview ?? false,
          riskFactors: parsed.riskFactors || [],
        },
        confidence: 0.9,
      };
    } catch {
      return null;
    }
  }

  /**
   * ç”Ÿæˆæ‰§è¡Œè®¡åˆ’
   */
  async plan(
    intent: ParsedIntent,
    team: ITeam,
    constraints: ConstraintProfile,
  ): Promise<MissionExecutionPlan> {
    this.logger.log("Generating execution plan...");

    const steps: ExecutionStep[] = [];
    const workflow = team.workflow;

    // åŸºäºŽå·¥ä½œæµç”Ÿæˆæ­¥éª¤
    for (const workflowStep of workflow.steps) {
      const executors = workflowStep.executorRoles.map((roleId: RoleId) => {
        const members = team.getMembersByRole(roleId);
        return members[0]?.id || roleId;
      });

      const stepDuration = this.estimateStepDuration(
        workflowStep.type,
        constraints.quality.depth,
      );
      const stepCost = this.estimateStepCost(
        stepDuration,
        constraints.cost.modelPreference,
      );

      steps.push({
        id: workflowStep.id,
        name: workflowStep.name,
        description: workflowStep.description,
        executor: executors[0],
        type: this.mapStepType(workflowStep.type),
        dependencies: workflowStep.dependsOn,
        estimatedDuration: stepDuration,
        estimatedCost: stepCost,
        // â˜… åŒ…å«å·¥ä½œæµé…ç½®çš„è¶…æ—¶æ—¶é—´ï¼Œç”¨äºŽå¼ºåˆ¶æ‰§è¡Œè¶…æ—¶
        timeout: workflowStep.timeout,
      });
    }

    // æ·»åŠ å®¡æ ¸æ­¥éª¤
    if (constraints.quality.reviewRequired) {
      const lastStep = steps[steps.length - 1];
      steps.push({
        id: "review",
        name: "è´¨é‡å®¡æ ¸",
        description: "Leader å®¡æ ¸æ‰€æœ‰è¾“å‡º",
        executor: team.leader.id,
        type: "review",
        dependencies: [lastStep.id],
        estimatedDuration: 60000,
        estimatedCost: 10,
      });
    }

    // æ·»åŠ äº¤ä»˜æ­¥éª¤
    steps.push({
      id: "delivery",
      name: "ç”Ÿæˆäº¤ä»˜ç‰©",
      description: "æ•´åˆç»“æžœå¹¶ç”Ÿæˆæœ€ç»ˆäº¤ä»˜ç‰©",
      executor: team.leader.id,
      type: "delivery",
      dependencies: constraints.quality.reviewRequired
        ? ["review"]
        : [steps[steps.length - 1].id],
      estimatedDuration: 30000,
      estimatedCost: 5,
    });

    const totalCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0);
    const totalDuration = this.calculateTotalDuration(steps);

    return {
      id: uuidv4(),
      missionId: intent.missionId,
      parsedIntent: intent,
      steps,
      estimatedCost: totalCost,
      estimatedDuration: totalDuration,
      createdAt: new Date(),
    };
  }

  /**
   * æ‰§è¡Œè®¡åˆ’ - â˜… æ”¯æŒçœŸæ­£å¹¶è¡Œæ‰§è¡Œ
   */
  async *executePlan(
    plan: MissionExecutionPlan,
    team: ITeam,
    constraints: ConstraintProfile,
  ): AsyncGenerator<MissionEvent, MissionExecutionState> {
    const missionId = plan.missionId;
    const state = this.states.get(missionId) || this.initializeState(missionId);
    const completedSteps = new Set<string>();
    const iterationStartTime = Date.now();

    // æŒ‰æ‹“æ‰‘é¡ºåºæ‰§è¡Œæ­¥éª¤
    while (completedSteps.size < plan.steps.length) {
      // â˜… Constraint Profile: Budget checks at iteration boundaries
      const elapsed = Date.now() - iterationStartTime;
      const timeLimit = constraints.efficiency?.maxDuration || Infinity;

      if (elapsed > timeLimit * 0.8) {
        this.logger.warn(
          `[executePlan] Approaching time limit: ${elapsed}ms / ${timeLimit}ms (${Math.round((elapsed / timeLimit) * 100)}%)`,
        );
      }

      if (elapsed > timeLimit) {
        this.logger.error(
          `[executePlan] Time limit exceeded (${elapsed}ms > ${timeLimit}ms), stopping execution`,
        );
        throw new Error(
          `Mission execution time limit exceeded: ${elapsed}ms > ${timeLimit}ms`,
        );
      }

      // Check cost budget if available
      const costBudget = constraints.cost?.budget || Infinity;
      if (state.resourceUsage.costUsed > costBudget * 0.8) {
        this.logger.warn(
          `[executePlan] Approaching cost budget: ${state.resourceUsage.costUsed} / ${costBudget}`,
        );
      }

      if (state.resourceUsage.costUsed > costBudget) {
        this.logger.error(
          `[executePlan] Cost budget exceeded, stopping execution`,
        );
        throw new Error(
          `Mission cost budget exceeded: ${state.resourceUsage.costUsed} > ${costBudget}`,
        );
      }
      // æ‰¾å‡ºå¯æ‰§è¡Œçš„æ­¥éª¤ï¼ˆä¾èµ–å·²å®Œæˆï¼‰
      const executableSteps = plan.steps.filter((step) => {
        if (completedSteps.has(step.id)) return false;
        return step.dependencies.every((dep) => completedSteps.has(dep));
      });

      if (
        executableSteps.length === 0 &&
        completedSteps.size < plan.steps.length
      ) {
        throw new Error("Deadlock detected: no executable steps available");
      }

      // â˜… çœŸæ­£å¹¶è¡Œæ‰§è¡Œï¼šä½¿ç”¨ Promise.all
      if (this.config.enableParallel && executableSteps.length > 1) {
        // å‘é€æ‰€æœ‰æ­¥éª¤å¼€å§‹äº‹ä»¶
        for (const step of executableSteps) {
          state.currentSteps.push(step.id);
          yield this.createEvent("step_started", missionId, {
            stepId: step.id,
            message: `å¼€å§‹æ‰§è¡Œ: ${step.name}`,
            parallel: true,
          });
        }

        // å¹¶è¡Œæ‰§è¡Œæ‰€æœ‰æ­¥éª¤
        const executionPromises = executableSteps.map(async (step) => {
          const executor = team.getMemberById(step.executor) || team.leader;

          // â˜… ä½¿ç”¨ HandoffCoordinator è¿›è¡Œå§”æ´¾
          if (!executor.isLeader()) {
            await this.delegateToMember(team.leader, executor, step, missionId);
          }

          // â˜… ä½¿ç”¨è¶…æ—¶åŒ…è£…å™¨ï¼Œé˜²æ­¢ LLM è°ƒç”¨æ— é™æŒ‚èµ·
          return this.executeStepWithTimeout(
            step,
            executor,
            missionId,
            state,
            constraints,
          );
        });

        const results = await Promise.allSettled(executionPromises);

        // å¤„ç†ç»“æžœ
        for (let i = 0; i < results.length; i++) {
          const step = executableSteps[i];
          const result = results[i];

          state.currentSteps = state.currentSteps.filter(
            (id) => id !== step.id,
          );

          if (result.status === "fulfilled") {
            completedSteps.add(step.id);
            state.completedSteps.push(step.id);
            state.intermediateOutputs.set(step.id, result.value);

            // â˜… å…³é”®ä¿®å¤ï¼šåŒæ—¶ä»¥æŠ€èƒ½ ID ä¸ºé”®å­˜å‚¨æŠ€èƒ½ç»“æžœ
            // æŠ€èƒ½çš„ normalizeInput éœ€è¦é€šè¿‡ skillId æŸ¥æ‰¾å‰ç½®æŠ€èƒ½çš„è¾“å‡º
            const stepResult = result.value;
            if (stepResult.skillResults) {
              for (const {
                skillId,
                result: skillResult,
              } of stepResult.skillResults) {
                if (skillResult.success && skillResult.data) {
                  state.intermediateOutputs.set(skillId, skillResult.data);
                  this.logger.debug(
                    `[executePlan] Stored skill output for ${skillId}`,
                  );
                }
              }
            }

            yield this.createEvent("step_completed", missionId, {
              stepId: step.id,
              output: result.value,
            });

            // â˜… ä¿å­˜ checkpointï¼šæ­¥éª¤å®Œæˆ
            const context = await this.getContext(missionId);
            const plan = context.plan as MissionExecutionPlan;
            void this.saveCheckpoint(
              missionId,
              team.workflow.id,
              `step_${step.id}_complete`,
              {
                stepId: step.id,
                stepName: step.name,
                completedSteps: state.completedSteps.length,
                totalSteps: plan.steps.length,
                progress: state.completedSteps.length / plan.steps.length,
              },
            );
          } else {
            state.failedSteps.push(step.id);
            yield this.createEvent("step_failed", missionId, {
              stepId: step.id,
              error: result.reason?.message || "Unknown error",
            });

            if (!this.config.enableAutoRetry) {
              throw result.reason;
            }
          }
        }
      } else {
        // é¡ºåºæ‰§è¡Œ
        const step = executableSteps[0];
        state.currentSteps.push(step.id);
        yield this.createEvent("step_started", missionId, {
          stepId: step.id,
          message: `å¼€å§‹æ‰§è¡Œ: ${step.name}`,
        });

        try {
          const executor = team.getMemberById(step.executor) || team.leader;

          // â˜… ä½¿ç”¨ HandoffCoordinator è¿›è¡Œå§”æ´¾
          if (!executor.isLeader()) {
            await this.delegateToMember(team.leader, executor, step, missionId);
          }

          // â˜… ä½¿ç”¨è¶…æ—¶åŒ…è£…å™¨ï¼Œé˜²æ­¢ LLM è°ƒç”¨æ— é™æŒ‚èµ·
          const output = await this.executeStepWithTimeout(
            step,
            executor,
            missionId,
            state,
            constraints,
          );

          completedSteps.add(step.id);
          state.currentSteps = state.currentSteps.filter(
            (id) => id !== step.id,
          );
          state.completedSteps.push(step.id);
          state.intermediateOutputs.set(step.id, output);

          // â˜… å…³é”®ä¿®å¤ï¼šåŒæ—¶ä»¥æŠ€èƒ½ ID ä¸ºé”®å­˜å‚¨æŠ€èƒ½ç»“æžœ
          if (output.skillResults) {
            for (const {
              skillId,
              result: skillResult,
            } of output.skillResults) {
              if (skillResult.success && skillResult.data) {
                state.intermediateOutputs.set(skillId, skillResult.data);
                this.logger.debug(
                  `[executePlan] Stored skill output for ${skillId}`,
                );
              }
            }
          }

          yield this.createEvent("step_completed", missionId, {
            stepId: step.id,
            output,
          });

          // â˜… ä¿å­˜ checkpointï¼šæ­¥éª¤å®Œæˆï¼ˆé¡ºåºæ‰§è¡Œï¼‰
          const context = await this.getContext(missionId);
          const plan = context.plan as MissionExecutionPlan;
          void this.saveCheckpoint(
            missionId,
            team.workflow.id,
            `step_${step.id}_complete`,
            {
              stepId: step.id,
              stepName: step.name,
              completedSteps: state.completedSteps.length,
              totalSteps: plan.steps.length,
              progress: state.completedSteps.length / plan.steps.length,
            },
          );
        } catch (error) {
          state.failedSteps.push(step.id);
          state.currentSteps = state.currentSteps.filter(
            (id) => id !== step.id,
          );

          yield this.createEvent("step_failed", missionId, {
            stepId: step.id,
            error: (error as Error).message,
          });

          // â˜… Phase 4: Check if replanning is needed after step failure
          if (this.adaptiveReplanner) {
            const trigger = {
              type: "task_failed" as const,
              taskId: step.id,
              details: (error as Error).message ?? "Step failed",
            };
            // Map local ExecutionStep[] to AdaptiveReplanner's ExecutionStep[] by
            // adding the required `status` field (steps here are either pending or failed).
            const replanSteps = plan.steps.map((s) => ({
              ...s,
              status: (state.failedSteps.includes(s.id)
                ? "failed"
                : state.completedSteps.includes(s.id)
                  ? "completed"
                  : "pending") as
                | "pending"
                | "running"
                | "completed"
                | "failed"
                | "skipped",
            }));
            const currentPlan = {
              steps: replanSteps,
              totalSteps: plan.steps.length,
              completedSteps: completedSteps.size,
            };
            const executionHistory: ReplanStepExecutionResult[] =
              state.completedSteps.map((id) => ({
                stepId: id,
                success: true,
              }));
            const shouldReplan = this.adaptiveReplanner.shouldReplan(
              trigger,
              currentPlan,
              executionHistory,
            );
            if (shouldReplan) {
              const replanResult = this.adaptiveReplanner.replan(
                trigger,
                currentPlan,
                executionHistory,
              );
              this.logger.log(
                `[MissionOrchestrator] Replanned: ${replanResult.reasoning}`,
              );
              // TODO(Phase 4): Apply replanResult to plan:
              // - plan.steps.push(...replanResult.addedSteps)
              // - plan.steps = plan.steps.filter(s => !replanResult.removedSteps.includes(s.id))
              // - replanResult.modifiedSteps.forEach(m => { /* update step */ })
            }
          }

          if (!this.config.enableAutoRetry) {
            throw error;
          }
        }
      }
    }

    return state;
  }

  /**
   * â˜… å§”æ´¾ä»»åŠ¡ç»™æˆå‘˜ï¼ˆä½¿ç”¨ HandoffCoordinatorï¼‰
   */
  private async delegateToMember(
    leader: ITeamMember,
    member: ITeamMember,
    step: ExecutionStep,
    missionId: string,
  ): Promise<void> {
    const context = new HandoffContextBuilder()
      .withTask({
        id: step.id,
        description: step.description,
        progress: 0,
      })
      .withConstraints([
        `æ‰§è¡Œè€…è§’è‰²: ${member.role.name}`,
        `å¯ç”¨æŠ€èƒ½: ${member.skills.join(", ")}`,
      ])
      .build();

    const handoffResponse = await this.handoffCoordinator.initiateHandoff(
      {
        fromAgentId: leader.id,
        toAgentId: member.id,
        reason: `æ‰§è¡Œæ­¥éª¤: ${step.name}`,
        context,
      },
      // å‘é€æ¶ˆæ¯å›žè°ƒï¼šé€šè¿‡ A2A Bus å¹¿æ’­ handoff æ¶ˆæ¯
      async (msg: CollaborationMessage) => {
        this.logger.debug(`Handoff message: ${leader.id} â†’ ${member.id}`);
        void this.a2aBus?.publish({
          sessionId: missionId,
          fromAgentId: leader.id,
          toAgentId: member.id,
          type: "task_request",
          payload: msg,
        });
      },
      // ç­‰å¾…å“åº”å›žè°ƒ
      async (_fromAgentId: string, _timeout: number) => {
        // æ¨¡æ‹Ÿæˆå‘˜æŽ¥å—ä»»åŠ¡
        return { accepted: true, message: "ä»»åŠ¡å·²æŽ¥å—" };
      },
    );

    if (!handoffResponse.accepted) {
      this.logger.warn(
        `Member ${member.id} rejected task: ${handoffResponse.message}`,
      );
    }
  }

  /**
   * â˜… æ­¥éª¤æ‰§è¡Œè¶…æ—¶åŒ…è£…å™¨
   * ä½¿ç”¨ Promise.race å¼ºåˆ¶æ‰§è¡Œè¶…æ—¶ï¼Œé˜²æ­¢ LLM è°ƒç”¨æ— é™æŒ‚èµ·
   */
  private async executeStepWithTimeout(
    step: ExecutionStep,
    executor: ITeamMember,
    missionId: string,
    state: MissionExecutionState,
    constraints: ConstraintProfile,
  ): Promise<StepExecutionResult> {
    // èŽ·å–è¶…æ—¶æ—¶é—´ï¼šæ­¥éª¤é…ç½® > é»˜è®¤ 60 ç§’
    const timeout = step.timeout || 60000;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `æ­¥éª¤ "${step.name}" æ‰§è¡Œè¶…æ—¶ (${timeout / 1000}s)ã€‚è¿™å¯èƒ½æ˜¯å› ä¸º AI æ¨¡åž‹å“åº”ç¼“æ…¢æˆ–ç½‘ç»œé—®é¢˜ã€‚`,
          ),
        );
      }, timeout);
    });

    try {
      // ä½¿ç”¨ Promise.race å¼ºåˆ¶è¶…æ—¶
      return await Promise.race([
        this.executeStepFull(step, executor, missionId, state, constraints),
        timeoutPromise,
      ]);
    } catch (error) {
      // è¶…æ—¶æˆ–å…¶ä»–é”™è¯¯ï¼Œè¿”å›žå¤±è´¥ç»“æžœï¼ˆç¬¦åˆ StepExecutionResult æŽ¥å£ï¼‰
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[executeStepWithTimeout] ${step.id} failed: ${errorMessage}`,
      );

      return {
        stepId: step.id,
        executor: executor.id,
        output: `æ‰§è¡Œå¤±è´¥: ${errorMessage}`,
        timestamp: new Date(),
        tokensUsed: 0,
        costUsed: 0,
      };
    }
  }

  /**
   * â˜… å®Œæ•´æ‰§è¡Œæ­¥éª¤ï¼ˆé›†æˆ Skills + Tools + LLMï¼‰
   */
  private async executeStepFull(
    step: ExecutionStep,
    executor: ITeamMember,
    missionId: string,
    state: MissionExecutionState,
    constraints: ConstraintProfile,
  ): Promise<StepExecutionResult> {
    const context = await this.getContext(missionId);
    let totalTokens = 0;
    let totalCost = 0;

    // â˜… ä¼˜å…ˆä½¿ç”¨ç›´æŽ¥å­˜å‚¨çš„åŽŸå§‹è¾“å…¥ï¼ˆä¸ä¾èµ– Memory æœåŠ¡ï¼‰
    const originalInput = this.originalInputs.get(missionId);
    const missionInput =
      originalInput || (context.input as MissionInput | undefined);

    // â˜… è°ƒè¯•æ—¥å¿—ï¼šç¡®è®¤æ•°æ®æ¥æº
    if (!missionInput) {
      this.logger.warn(
        `[executeStepFull] No MissionInput found for ${missionId}. originalInput: ${!!originalInput}, context.input: ${!!context.input}`,
      );
    } else {
      this.logger.debug(
        `[executeStepFull] MissionInput found. sourceText length: ${(missionInput.metadata?.context as string)?.length || 0}`,
      );
    }

    // â˜… 1. æ‰§è¡Œ Member çš„æŠ€èƒ½
    const skillResults: Array<{ skillId: string; result: SkillResult }> = [];
    if (this.skillRegistry && executor.skills.length > 0) {
      for (const skillId of executor.skills) {
        const skill = this.skillRegistry.tryGet(skillId);
        if (skill) {
          // â˜… å…³é”®ä¿®å¤ï¼šä¸ºæŠ€èƒ½è®¾ç½® LLM é€‚é…å™¨
          // Skills é€šè¿‡ callLLM() è°ƒç”¨ LLMï¼Œéœ€è¦å…ˆè®¾ç½® adapter
          if (this.llmAdapter && "setLLMAdapter" in skill) {
            (
              skill as { setLLMAdapter: (adapter: ISimpleLLMAdapter) => void }
            ).setLLMAdapter(this.llmAdapter);
            this.logger.debug(
              `[executeStepFull] Set LLM adapter for skill ${skillId}`,
            );
          } else if (!this.llmAdapter) {
            this.logger.warn(
              `[executeStepFull] No LLM adapter available for skill ${skillId}`,
            );
          }
          // 2026-05-01 (PR-X-R): inject ToolPipeline if skill supports it
          if (this.toolPipeline && "setToolPipeline" in skill) {
            (
              skill as { setToolPipeline: (p: ToolPipeline) => void }
            ).setToolPipeline(this.toolPipeline);
          }

          try {
            // â˜… ä¼˜å…ˆä½¿ç”¨ missionInput.metadata.sessionIdï¼ˆSlides ç­‰åº”ç”¨ä¼ å…¥çš„å®žé™…ä¼šè¯ IDï¼‰
            // å¦åˆ™å›žé€€åˆ° missionIdï¼ˆé»˜è®¤è¡Œä¸ºï¼‰
            const actualSessionId =
              (missionInput?.metadata?.sessionId as string) || missionId;

            const skillContext: SkillContext = {
              executionId: uuidv4(),
              skillId: skill.id,
              domain: skill.domain,
              callerId: executor.id,
              sessionId: actualSessionId,
              createdAt: new Date(),
            };

            // â˜… æž„å»ºæŠ€èƒ½è¾“å…¥ - ä»Ž metadata.context æå– sourceText
            // æ•°æ®æµï¼šSlidesEngineService çš„ context: input.sourceText
            //        â†’ TeamsService çš„ metadata.context
            //        â†’ è¿™é‡Œæå–åˆ° skillInput.context.input.sourceText
            const sourceText =
              (missionInput?.metadata?.context as string) || "";
            const userRequirement = missionInput?.prompt || "";

            if (!sourceText) {
              this.logger.warn(
                `[executeStepFull] sourceText is empty! metadata: ${JSON.stringify(missionInput?.metadata || {})}`,
              );
            }

            const skillInput = {
              task: step.description,
              context: {
                ...context,
                input: {
                  // â˜… å°† metadata ä¸­çš„å­—æ®µæå‡åˆ° input å±‚çº§ï¼Œä¾¿äºŽæŠ€èƒ½è®¿é—®
                  sourceText,
                  userRequirement,
                  targetPages: missionInput?.metadata?.targetPages as
                    | number
                    | undefined,
                  stylePreference: missionInput?.metadata?.stylePreference as
                    | string
                    | undefined,
                  targetAudience: missionInput?.metadata?.targetAudience as
                    | string
                    | undefined,
                  themeId: missionInput?.metadata?.themeId as
                    | string
                    | undefined,
                  sessionId: missionInput?.metadata?.sessionId as
                    | string
                    | undefined,
                  // ä¿ç•™åŽŸå§‹ input ä½œä¸º _raw
                  _raw: missionInput,
                },
              },
              previousOutputs: Object.fromEntries(state.intermediateOutputs),
            };

            this.logger.debug(`Executing skill ${skillId} for step ${step.id}`);
            const result = await skill.execute(skillInput, skillContext);
            skillResults.push({ skillId, result });

            if (result.metadata.tokensUsed) {
              totalTokens += result.metadata.tokensUsed;
            }
          } catch (error) {
            this.logger.warn(
              `Skill ${skillId} execution failed: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    // â˜… 2. ä½¿ç”¨ LLM æ‰§è¡Œï¼ˆèžåˆæŠ€èƒ½ç»“æžœå’Œäººè®¾ï¼‰
    let llmOutput: string | undefined;
    let toolResults: unknown[] = [];

    if (this.llmFactory) {
      const adapter = this.llmFactory.getAdapter();
      if (adapter) {
        try {
          // â˜… æž„å»ºèžåˆäººè®¾çš„ç³»ç»Ÿæç¤ºè¯
          const systemPrompt = this.buildSystemPromptWithPersona(executor);

          // â˜… æž„å»ºèžåˆæŠ€èƒ½ç»“æžœçš„ç”¨æˆ·æç¤ºè¯
          const userPrompt = this.buildStepPromptWithSkills(
            step,
            context,
            skillResults,
          );

          // æ”¶é›†å¯ç”¨å·¥å…·
          const tools = await this.collectAvailableTools(executor);

          const response = await adapter.chat({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            model: executor.model,
            taskProfile: {
              creativity: this.mapWorkStyleToCreativity(executor.workStyle),
              outputLength: this.mapDepthToOutputLength(
                constraints.quality.depth,
                executor.workStyle,
              ),
            },
            tools: tools.length > 0 ? tools : undefined,
          });

          llmOutput = response.content ?? undefined;

          // è®°å½•æˆæœ¬
          if (response.usage) {
            const cost = this.constraintEngine.recordCost(
              `step_${step.id}`,
              response.model || executor.model,
              response.usage.promptTokens || 0,
              response.usage.completionTokens || 0,
              missionId,
            );
            totalCost += cost;
            totalTokens +=
              (response.usage.promptTokens || 0) +
              (response.usage.completionTokens || 0);
          }

          // å¤„ç†å·¥å…·è°ƒç”¨
          if (response.toolCalls && response.toolCalls.length > 0) {
            toolResults = await this.handleToolCalls(response.toolCalls);
          }
        } catch (error) {
          this.logger.error(
            `LLM execution failed for step ${step.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    // æ›´æ–°çŠ¶æ€
    state.resourceUsage.tokensUsed += totalTokens;
    state.resourceUsage.costUsed += totalCost;

    // å¦‚æžœæ²¡æœ‰ LLM è¾“å‡ºï¼Œä½¿ç”¨æŠ€èƒ½ç»“æžœæˆ–æ¨¡æ‹Ÿ
    if (!llmOutput) {
      if (skillResults.length > 0) {
        llmOutput = skillResults
          .map((r) => JSON.stringify(r.result.data))
          .join("\n");
      } else {
        llmOutput = `Step ${step.name} completed by ${executor.name} (simulated)`;
      }
    }

    return {
      stepId: step.id,
      executor: executor.id,
      output: llmOutput,
      skillResults: skillResults.length > 0 ? skillResults : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      timestamp: new Date(),
      tokensUsed: totalTokens,
      costUsed: totalCost,
    };
  }

  /**
   * â˜… å¸¦è¿”å·¥ä¸Šä¸‹æ–‡æ‰§è¡Œæ­¥éª¤
   */
  private async executeStepWithRework(
    step: ExecutionStep,
    executor: ITeamMember,
    missionId: string,
    state: MissionExecutionState,
    reworkContext: ReworkContext,
  ): Promise<StepExecutionResult> {
    const context = await this.getContext(missionId);
    let totalTokens = 0;
    let totalCost = 0;

    if (this.llmFactory) {
      const adapter = this.llmFactory.getAdapter();
      if (adapter) {
        try {
          const systemPrompt = this.buildSystemPromptWithPersona(executor);

          // â˜… æž„å»ºè¿”å·¥æç¤ºè¯ï¼ˆåŒ…å«å®¡æ ¸åé¦ˆï¼‰
          const userPrompt = this.buildReworkPrompt(
            step,
            context,
            reworkContext,
          );

          const response = await adapter.chat({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            model: executor.model,
            taskProfile: { creativity: "low", outputLength: "medium" },
          });

          if (response.usage) {
            const cost = this.constraintEngine.recordCost(
              `rework_${step.id}_${reworkContext.attempt}`,
              response.model || executor.model,
              response.usage.promptTokens || 0,
              response.usage.completionTokens || 0,
              missionId,
            );
            totalCost += cost;
            totalTokens +=
              (response.usage.promptTokens || 0) +
              (response.usage.completionTokens || 0);
          }

          state.resourceUsage.tokensUsed += totalTokens;
          state.resourceUsage.costUsed += totalCost;

          return {
            stepId: step.id,
            executor: executor.id,
            output: response.content,
            timestamp: new Date(),
            tokensUsed: totalTokens,
            costUsed: totalCost,
          };
        } catch (error) {
          this.logger.error(
            `Rework failed for step ${step.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    // é™çº§
    return {
      stepId: step.id,
      executor: executor.id,
      output: `Rework for step ${step.name} (simulated)`,
      timestamp: new Date(),
      tokensUsed: 0,
      costUsed: 0,
    };
  }

  /**
   * â˜… æž„å»ºèžåˆäººè®¾çš„ç³»ç»Ÿæç¤ºè¯
   */
  private buildSystemPromptWithPersona(executor: ITeamMember): string {
    let prompt = executor.getSystemPrompt();

    // â˜… èžåˆäººè®¾
    if (executor.persona) {
      prompt = `${executor.persona}\n\n${prompt}`;
    }

    // â˜… èžåˆå·¥ä½œé£Žæ ¼
    const workStyle = executor.workStyle;
    if (workStyle) {
      const styleHints: string[] = [];

      // outputStyle maps to response length/detail
      if (workStyle.outputStyle === "detailed") {
        styleHints.push("请提供详尽、全面的分析和输出");
      } else if (workStyle.outputStyle === "concise") {
        styleHints.push("请保持简洁明了，突出重点");
      }

      // thinkingDepth affects depth of analysis
      if (workStyle.thinkingDepth === "deep") {
        styleHints.push("进行深入分析，考虑多种角度");
      } else if (workStyle.thinkingDepth === "quick") {
        styleHints.push("快速响应，聚焦核心问题");
      }

      // riskTolerance affects creativity level
      if (workStyle.riskTolerance === "aggressive") {
        styleHints.push("鼓励创新思维和独特见解");
      } else if (workStyle.riskTolerance === "conservative") {
        styleHints.push("保持严谨，基于事实和证据");
      }

      if (styleHints.length > 0) {
        prompt += `\n\n## 工作风格\n${styleHints.join("\n")}`;
      }
    }

    return prompt;
  }

  /**
   * â˜… æž„å»ºèžåˆæŠ€èƒ½ç»“æžœçš„ç”¨æˆ·æç¤ºè¯
   */
  private buildStepPromptWithSkills(
    step: ExecutionStep,
    context: Record<string, unknown>,
    skillResults: Array<{ skillId: string; result: SkillResult }>,
  ): string {
    let prompt = `## 当前任务\n${step.description}\n\n`;

    if (context.intent) {
      prompt += `## 任务目标\n${JSON.stringify(context.intent, null, 2)}\n\n`;
    }

    if (
      context.previousOutputs &&
      Object.keys(context.previousOutputs as object).length > 0
    ) {
      prompt += `## 前序步骤输出\n${JSON.stringify(context.previousOutputs, null, 2)}\n\n`;
    }

    // â˜… èžåˆæŠ€èƒ½æ‰§è¡Œç»“æžœ
    if (skillResults.length > 0) {
      prompt += `## 技能分析结果\n`;
      for (const { skillId, result } of skillResults) {
        if (result.success && result.data) {
          prompt += `### ${skillId}\n${JSON.stringify(result.data, null, 2)}\n\n`;
        }
      }
    }

    prompt += `请根据上述信息完成任务，输出高质量的结果。`;

    return prompt;
  }

  /**
   * â˜… æž„å»ºè¿”å·¥æç¤ºè¯
   */
  private buildReworkPrompt(
    step: ExecutionStep,
    _context: Record<string, unknown>,
    reworkContext: ReworkContext,
  ): string {
    let prompt = `## 任务返工（第 ${reworkContext.attempt} 次）\n\n`;
    prompt += `### 原任务\n${step.description}\n\n`;
    prompt += `### 上次输出\n${JSON.stringify(reworkContext.previousOutput, null, 2)}\n\n`;
    prompt += `### 审核反馈\n${reworkContext.reviewFeedback}\n\n`;

    if (reworkContext.issues.length > 0) {
      prompt += `### 需要修正的问题\n`;
      for (const issue of reworkContext.issues) {
        prompt += `- ${issue}\n`;
      }
      prompt += `\n`;
    }

    prompt += `请根据审核反馈修正输出，解决上述问题。`;

    return prompt;
  }

  /**
   * æ ¹æ®å·¥ä½œé£Žæ ¼æ˜ å°„ creativity ç­‰çº§ï¼ˆç”¨äºŽ taskProfileï¼‰
   */
  private mapWorkStyleToCreativity(
    workStyle: ITeamMember["workStyle"],
  ): "low" | "medium" | "high" {
    if (!workStyle) return "medium";
    if (workStyle.riskTolerance === "aggressive") return "high";
    if (workStyle.riskTolerance === "conservative") return "low";
    return "medium";
  }

  /**
   * ä»Ž LLM è¾“å‡ºä¸­æå–ç¬¬ä¸€ä¸ªå®Œæ•´ JSON å¯¹è±¡ï¼ˆbalanced-brace ç®—æ³•ï¼‰
   * è§£å†³ firstBrace/lastBrace åœ¨å¤š JSON å¯¹è±¡æ—¶æˆªå–é”™è¯¯çš„é—®é¢˜
   */
  private extractFirstJsonObject(content: string): string | null {
    const start = content.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
    return null;
  }

  /**
   * æ ¹æ®è´¨é‡æ·±åº¦æ˜ å°„ outputLengthï¼ˆç”¨äºŽ taskProfileï¼‰
   * depth ä¸ºä¸»ä¿¡å·ï¼›standard æ—¶ç”¨ workStyle.outputStyle ä½œä¸º tiebreaker
   */
  private mapDepthToOutputLength(
    depth: ConstraintProfile["quality"]["depth"],
    workStyle?: ITeamMember["workStyle"],
  ): "short" | "medium" | "long" {
    if (depth === "comprehensive") return "long";
    if (depth === "quick") return "short";
    // standard â†’ ç”¨ outputStyle ç»†åŒ–
    if (workStyle?.outputStyle === "detailed") return "long";
    if (workStyle?.outputStyle === "concise") return "short";
    return "medium";
  }

  /**
   * æ”¶é›†å¯ç”¨å·¥å…·
   */
  private async collectAvailableTools(
    executor: ITeamMember,
  ): Promise<LLMToolDefinition[]> {
    const tools: LLMToolDefinition[] = [];

    // ä»Ž ToolRegistry èŽ·å–å·¥å…·
    if (this.toolRegistry) {
      for (const toolId of executor.tools) {
        const tool = this.toolRegistry.tryGet(toolId);
        if (tool) {
          tools.push({
            type: "function",
            function: {
              name: tool.id,
              description: tool.description,
              parameters: tool.inputSchema as unknown as Record<
                string,
                unknown
              >,
            },
          });
        }
      }
    }

    // ä»Ž MCP èŽ·å–å·¥å…·
    if (this.mcpManager) {
      try {
        const mcpTools = await this.mcpManager.getAllToolsFlat();
        for (const { tool } of mcpTools) {
          tools.push({
            type: "function",
            function: {
              name: `mcp_${tool.name}`,
              description: tool.description,
              parameters: tool.inputSchema as unknown as Record<
                string,
                unknown
              >,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get MCP tools: ${(error as Error).message}`,
        );
      }
    }

    return tools;
  }

  /**
   * å¤„ç†å·¥å…·è°ƒç”¨
   */
  private async handleToolCalls(
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  ): Promise<unknown[]> {
    const results: unknown[] = [];

    for (const call of toolCalls) {
      try {
        // MCP å·¥å…·
        if (call.name.startsWith("mcp_") && this.mcpManager) {
          const toolName = call.name.replace("mcp_", "");
          const result = await this.mcpManager.callToolAuto(
            toolName,
            call.arguments,
          );
          results.push({ tool: call.name, result });
          continue;
        }

        // å†…ç½®å·¥å…·
        if (this.toolRegistry) {
          const tool = this.toolRegistry.tryGet(call.name);
          if (tool) {
            const toolContext = {
              executionId: uuidv4(),
              toolId: call.name,
              callerType: "orchestrator" as const,
              createdAt: new Date(),
            };
            const result = await tool.execute(call.arguments, toolContext);
            results.push({ tool: call.name, result });
            continue;
          }
        }

        results.push({ tool: call.name, error: "Tool not found" });
      } catch (error) {
        results.push({ tool: call.name, error: (error as Error).message });
      }
    }

    return results;
  }

  /**
   * å®¡æ ¸æ­¥éª¤è¾“å‡º
   */
  async review(
    stepId: string,
    output: unknown,
    team: ITeam,
  ): Promise<StepReviewResult> {
    this.logger.log(`Reviewing step ${stepId}...`);

    if (this.llmFactory) {
      const adapter = this.llmFactory.getAdapter();
      if (adapter) {
        try {
          const systemPrompt = `你是一个质量审核专家。请审核以下输出，评估其质量、准确性和完整性。
给出 1-10 的分数，以及详细反馈。

输出 JSON 格式：
{
  "score": number,
  "passed": boolean,
  "feedback": string,
  "issues": []
}
CRITICAL: Your entire response MUST be valid JSON only. No explanation, no markdown, no code blocks. Start with { and end with }.`;

          const response = await adapter.chat({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(output) },
            ],
            model: team.leader.model,
            taskProfile: { creativity: "low", outputLength: "short" },
            responseFormat: "json",
          });

          if (response.usage) {
            this.constraintEngine.recordCost(
              `review_${stepId}`,
              response.model || "unknown",
              response.usage.promptTokens || 0,
              response.usage.completionTokens || 0,
            );
          }

          const reviewContent = response.content || "";
          // Try direct parse first (JSON mode response), then fall back to extraction
          let parsed: ReturnType<typeof JSON.parse> | null = null;
          try {
            parsed = JSON.parse(reviewContent.trim());
          } catch {
            try {
              const extracted = this.extractFirstJsonObject(reviewContent);
              if (extracted) parsed = JSON.parse(extracted);
            } catch {
              // Both parse attempts failed; parsed remains null, falls through to degraded score
            }
          }
          if (parsed) {
            return {
              stepId,
              passed: parsed.passed ?? parsed.score >= 7,
              score: parsed.score,
              feedback: parsed.feedback,
              reviewedAt: new Date(),
            };
          }
        } catch (error) {
          this.logger.warn(`LLM review failed: ${(error as Error).message}`);
        }
      }
    }

    // é™çº§ï¼šLLM å®¡æ ¸ä¸å¯ç”¨ï¼Œè¿”å›žå›ºå®šé€šè¿‡ï¼ˆscore 7ï¼Œä¸è§¦å‘è¿”å·¥ï¼‰
    return {
      stepId,
      passed: true,
      score: 7,
      feedback: "LLM 审核不可用，降级通过",
      reviewedAt: new Date(),
    };
  }

  /**
   * â˜… ç”Ÿæˆäº¤ä»˜ç‰©ï¼ˆé›†æˆå¯¼å‡ºå·¥å…·ï¼‰
   */
  async deliver(
    state: MissionExecutionState,
    _team: ITeam,
  ): Promise<MissionDeliverable[]> {
    this.logger.log("Generating deliverables...");

    const deliverables: MissionDeliverable[] = [];
    const allOutputs = Array.from(state.intermediateOutputs.values());

    // â˜… å°è¯•ä½¿ç”¨å¯¼å‡ºå·¥å…·ç”Ÿæˆæ–‡æ¡£
    const exportTools = ["export-docx", "export-pdf"];
    let documentGenerated = false;

    if (this.toolRegistry) {
      for (const toolId of exportTools) {
        const tool = this.toolRegistry.tryGet(toolId);
        if (tool) {
          try {
            // æ•´åˆå†…å®¹
            const content = this.integrateOutputsForExport(allOutputs);

            const toolContext = {
              executionId: uuidv4(),
              toolId,
              callerType: "orchestrator" as const,
              createdAt: new Date(),
            };
            const result = await tool.execute(
              {
                title: "ä»»åŠ¡æŠ¥å‘Š",
                content,
                format: toolId.replace("export-", ""),
              },
              toolContext,
            );

            if (result) {
              deliverables.push({
                id: uuidv4(),
                missionId: state.missionId,
                type: toolId.replace("export-", "") as "report",
                name: `ä»»åŠ¡æŠ¥å‘Š.${toolId.replace("export-", "")}`,
                description: "è‡ªåŠ¨ç”Ÿæˆçš„ä»»åŠ¡æŠ¥å‘Šæ–‡æ¡£",
                mimeType:
                  toolId === "export-pdf"
                    ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: 0,
                content: result,
                createdAt: new Date(),
              });
              documentGenerated = true;
              break;
            }
          } catch (error) {
            this.logger.warn(
              `Export tool ${toolId} failed: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    // å§‹ç»ˆç”Ÿæˆ JSON æŠ¥å‘Š
    deliverables.push({
      id: uuidv4(),
      missionId: state.missionId,
      type: "report",
      name: "ä»»åŠ¡æŠ¥å‘Š",
      description: documentGenerated
        ? "ä»»åŠ¡æ‰§è¡Œç»“æžœè¯¦ç»†æ•°æ®"
        : "ä»»åŠ¡æ‰§è¡Œç»“æžœæ±‡æ€»æŠ¥å‘Š",
      mimeType: "application/json",
      size: JSON.stringify(allOutputs).length,
      content: {
        summary: "ä»»åŠ¡æ‰§è¡Œå®Œæˆ",
        outputs: allOutputs,
        statistics: {
          totalSteps: state.completedSteps.length + state.failedSteps.length,
          completedSteps: state.completedSteps.length,
          failedSteps: state.failedSteps.length,
          reworkCount: state.resourceUsage.reworkCount,
          reviewResults: state.reviewResults,
        },
      },
      createdAt: new Date(),
    });

    return deliverables;
  }

  /**
   * â˜… æ•´åˆè¾“å‡ºç”¨äºŽå¯¼å‡º
   */
  private integrateOutputsForExport(outputs: unknown[]): string {
    const sections: string[] = [];

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];
      if (typeof output === "string") {
        sections.push(output);
      } else if (output && typeof output === "object") {
        const obj = output as Record<string, unknown>;
        if (obj.output) {
          sections.push(String(obj.output));
        } else {
          sections.push(JSON.stringify(output, null, 2));
        }
      }
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * å–æ¶ˆæ‰§è¡Œ
   */
  async cancel(missionId: string): Promise<void> {
    const state = this.states.get(missionId);
    if (state) {
      state.phase = "failed";
      this.logger.log(`Mission ${missionId} cancelled`);
    }
    const traceId = this.missionTraces.get(missionId);
    if (traceId) {
      this.traceCollector?.endTrace(traceId, {
        status: "error",
      });
      this.missionTraces.delete(missionId);
    }
    this.a2aBus?.clearSession(missionId);
    this.originalInputs.delete(missionId);
    // â˜… åœå¿ƒè·³ + æ¸… runtime store
    this.stopHeartbeat(missionId);
  }

  /**
   * èŽ·å–æ‰§è¡ŒçŠ¶æ€ï¼ˆåŒæ­¥è·¯å¾„ â€”â€” ä»… in-memoryï¼›è·¨ pod è¯·ç”¨ getStateAsyncï¼‰
   */
  getState(missionId: string): MissionExecutionState | undefined {
    return this.states.get(missionId);
  }

  /**
   * â˜… Phase 9 (2026-04-30): è·¨ pod å– state â€”â€” in-memory miss æ—¶é™çº§åˆ° runtime storeã€‚
   * ç”¨äºŽ admin / recovery åœºæ™¯ï¼Œæ™®é€š mission æ‰§è¡Œå¾ªçŽ¯ä»èµ°åŒæ­¥ getStateã€‚
   */
  async getStateAsync(
    missionId: string,
  ): Promise<MissionExecutionState | undefined> {
    const local = this.states.get(missionId);
    if (local) return local;
    if (!this.runtimeStore) return undefined;
    const remote = await this.runtimeStore.getState(missionId);
    if (remote) {
      // å›žå¡« in-memoryï¼ˆé¿å…é‡å¤è¯» Redisï¼‰
      this.states.set(missionId, remote);
    }
    return remote;
  }

  /**
   * æ›´æ–°æ‰§è¡ŒçŠ¶æ€ï¼ˆä¾›å¤–éƒ¨æµç¨‹ä½¿ç”¨ï¼‰
   * ç”¨äºŽéžæ ‡å‡†æµç¨‹ï¼ˆå¦‚ generateFullStoryï¼‰åŒæ­¥çŠ¶æ€åˆ° orchestrator
   */
  updateState(
    missionId: string,
    updates: {
      phase?: OrchestratorPhase;
      currentSteps?: string[];
      completedSteps?: string[];
      progress?: number;
    },
  ): void {
    let state = this.states.get(missionId);
    if (!state) {
      state = this.initializeState(missionId);
      this.states.set(missionId, state);
    }

    if (updates.phase !== undefined) {
      state.phase = updates.phase;
    }
    if (updates.currentSteps !== undefined) {
      state.currentSteps = updates.currentSteps;
    }
    if (updates.completedSteps !== undefined) {
      state.completedSteps = updates.completedSteps;
    }
    if (updates.progress !== undefined) {
      state.resourceUsage.progress = updates.progress;
    }

    this.logger.debug(
      `[${missionId}] State updated: phase=${state.phase}, current=${state.currentSteps.join(",")}, completed=${state.completedSteps.join(",")}`,
    );
  }

  /**
   * èŽ·å–èµ„æºä½¿ç”¨æƒ…å†µ
   */
  getResourceUsage(missionId: string): ResourceUsage | undefined {
    return this.states.get(missionId)?.resourceUsage;
  }

  // ==================== Memory é›†æˆ ====================

  private async storeContext(
    missionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    if (!this.memoryService) return;
    try {
      await this.memoryService.setWithSession(missionId, key, value);
    } catch (error) {
      this.logger.warn(`Failed to store context: ${(error as Error).message}`);
    }
  }

  private async getContext(
    missionId: string,
  ): Promise<Record<string, unknown>> {
    if (!this.memoryService) return {};
    try {
      const input = await this.memoryService.getWithSession(missionId, "input");
      const intent = await this.memoryService.getWithSession(
        missionId,
        "intent",
      );
      const plan = await this.memoryService.getWithSession(missionId, "plan");
      return { input, intent, plan };
    } catch {
      return {};
    }
  }

  // ==================== ç§æœ‰æ–¹æ³• ====================

  private initializeState(missionId: string): MissionExecutionState {
    return {
      missionId,
      phase: "idle",
      resourceUsage: {
        tokensUsed: 0,
        costUsed: 0,
        timeElapsed: 0,
        reviewCount: 0,
        reworkCount: 0,
        progress: 0,
      },
      completedSteps: [],
      currentSteps: [],
      failedSteps: [],
      reviewResults: [],
      intermediateOutputs: new Map(),
      deliverables: [],
    };
  }

  private createEvent(
    type: MissionEventType,
    missionId: string,
    data?: Record<string, unknown>,
  ): MissionEvent {
    return {
      type,
      missionId,
      timestamp: new Date(),
      data,
    };
  }

  private createResult(
    state: MissionExecutionState,
    startTime: number,
    success: boolean,
    errorMessage?: string,
  ): MissionResult {
    const duration = Date.now() - startTime;

    return {
      missionId: state.missionId,
      success,
      deliverables: state.deliverables,
      summary: success ? "任务执行成功" : `任务执行失败: ${errorMessage}`,
      tokensUsed: state.resourceUsage.tokensUsed,
      costUsed: state.resourceUsage.costUsed,
      duration,
      error: errorMessage
        ? {
            code: "EXECUTION_ERROR",
            message: errorMessage,
            retryable: true,
          }
        : undefined,
      statistics: {
        totalSteps: state.completedSteps.length + state.failedSteps.length,
        completedSteps: state.completedSteps.length,
        failedSteps: state.failedSteps.length,
        skippedSteps: 0,
        reworkCount: state.resourceUsage.reworkCount,
        membersInvolved: 0,
        toolCalls: 0,
        skillCalls: 0,
        reviewCount: state.reviewResults.length,
        reviewPassRate:
          state.reviewResults.length > 0
            ? state.reviewResults.filter((r) => r.passed).length /
              state.reviewResults.length
            : 1,
      },
    };
  }

  private updateResourceUsage(
    state: MissionExecutionState,
    startTime: number,
  ): ResourceUsage {
    const totalSteps =
      state.completedSteps.length +
      state.failedSteps.length +
      state.currentSteps.length;
    const progress =
      totalSteps > 0 ? state.completedSteps.length / totalSteps : 0;

    return {
      ...state.resourceUsage,
      timeElapsed: Date.now() - startTime,
      progress,
    };
  }

  private inferTaskType(prompt: string): TaskType {
    const keywords: Record<TaskType, string[]> = {
      research: ["研究", "调研", "分析", "报告"],
      analysis: ["分析", "评估", "对比", "趋势"],
      creation: ["写", "创作", "生成", "撰写"],
      design: ["设计", "UI", "界面", "视觉"],
      debate: ["辩论", "讨论", "对抗", "观点"],
      review: ["审核", "检查", "验证", "评审"],
      mixed: [],
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some((word) => prompt.includes(word))) {
        return type as TaskType;
      }
    }

    return "mixed";
  }

  private assessComplexity(input: MissionInput): ParsedIntent["complexity"] {
    const promptLength = input.prompt.length;
    const hasFiles = (input.files?.length || 0) > 0;
    const hasUrls = (input.urls?.length || 0) > 0;
    const hasRequirements = (input.requirements?.length || 0) > 0;

    let score = 0;
    if (promptLength > 500) score += 2;
    else if (promptLength > 200) score += 1;
    if (hasFiles) score += 1;
    if (hasUrls) score += 1;
    if (hasRequirements) score += 1;

    const overall: ComplexityLevel =
      score >= 4
        ? "very_high"
        : score >= 3
          ? "high"
          : score >= 2
            ? "medium"
            : "low";

    return {
      overall,
      informational: overall,
      logical: overall,
      creative: overall,
      estimatedSubTasks: Math.max(3, score + 2),
      estimatedDuration: (score + 1) * 60000,
      estimatedCost: (score + 1) * 50,
    };
  }

  private extractTopics(prompt: string): string[] {
    const words = prompt
      .split(/[ï¼Œã€‚ï¼ï¼Ÿã€\s]+/)
      .filter((w) => w.length > 2);
    return words.slice(0, 5);
  }

  private mapStepType(workflowType: string): ExecutionStep["type"] {
    if (workflowType === "review") return "review";
    if (workflowType === "decision") return "task";
    return "task";
  }

  private estimateStepDuration(_stepType: string, depth: string): number {
    const base = 30000;
    const multiplier =
      depth === "comprehensive" ? 3 : depth === "standard" ? 2 : 1;
    return base * multiplier;
  }

  private estimateStepCost(duration: number, modelPreference: string): number {
    const base = duration / 10000;
    const multiplier =
      modelPreference === "premium"
        ? 3
        : modelPreference === "balanced"
          ? 2
          : 1;
    return Math.ceil(base * multiplier);
  }

  private calculateTotalDuration(steps: ExecutionStep[]): number {
    return steps.reduce((sum, s) => sum + s.estimatedDuration, 0);
  }

  /**
   * â˜… ä¿å­˜æ£€æŸ¥ç‚¹ï¼ˆéžé˜»å¡žï¼Œå¤±è´¥æ—¶è®°å½•è­¦å‘Šï¼‰
   */
  private async saveCheckpoint(
    executionId: string,
    workflowId: string,
    phase: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.checkpointManager) return;

    try {
      const state = this.states.get(executionId);
      const stepResults = new Map<string, StepResult>();
      if (state?.intermediateOutputs) {
        for (const [key, value] of state.intermediateOutputs.entries()) {
          stepResults.set(key, {
            stepId: key,
            status: "completed" as const,
            output: value,
            startTime: new Date(),
          });
        }
      }

      const context: ExecutionContext = {
        executionId,
        workflowId,
        input: JSON.parse(JSON.stringify(data)),
        state: {},
        stepResults,
        startTime: new Date(),
      };

      await this.checkpointManager.createCheckpoint(
        executionId,
        workflowId,
        phase,
        context,
      );
      this.logger.debug(`[${executionId}] Checkpoint saved: ${phase}`);
    } catch (error) {
      this.logger.warn(
        `[${executionId}] Failed to save checkpoint at ${phase}: ${(error as Error).message}`,
      );
    }
  }

  // â”€â”€â”€ AI Kernel Helpers â”€â”€â”€

  /**
   * â˜… è®°å½• Kernel äº‹ä»¶ï¼ˆfire-and-forgetï¼Œä¸é˜»å¡žä¸»æµç¨‹ï¼‰
   */
  private recordKernelEvent(
    missionId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.kernelJournal) return;

    this.kernelJournal
      .record(processId, type, payload)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to record event ${type}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /**
   * â˜… æ ‡è®° Kernel è¿›ç¨‹å®Œæˆï¼ˆfire-and-forgetï¼‰
   */
  private completeKernelProcess(
    missionId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.missionExecutor) return;

    this.missionExecutor
      .complete(processId, output)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => this.kernelProcessIds.delete(missionId));
  }

  /**
   * â˜… æ ‡è®° Kernel è¿›ç¨‹å¤±è´¥ï¼ˆfire-and-forgetï¼‰
   */
  private failKernelProcess(missionId: string, error: string): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.missionExecutor) return;

    this.missionExecutor
      .fail(processId, error)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to mark process as failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => this.kernelProcessIds.delete(missionId));
  }
}
