/**
 * AI Engine - Teams Module
 * å›¢é˜Ÿç³»ç»Ÿ NestJS æ¨¡å—
 *
 * é›†æˆåˆ° AI Engine æ ¸å¿ƒæ¨¡å—ï¼Œä¾èµ–ï¼š
 * - ToolRegistry: å·¥å…·æ³¨å†Œè¡¨
 * - SkillRegistry: æŠ€èƒ½æ³¨å†Œè¡¨
 * - LLMFactory: LLM é€‚é…å™¨å·¥åŽ‚
 * - CostController: æˆæœ¬æŽ§åˆ¶å™¨
 * - Memory: è®°å¿†ç³»ç»Ÿ
 * - MCPManager: MCP å¤–éƒ¨å·¥å…·ç®¡ç†
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoleRegistry } from "./registry/role-registry";
import { TeamRegistry } from "./registry/team-registry";
// â˜… L2 internal â€” direct relative paths (ç¦ facade barrel)
import { ConstraintEngine } from "@/modules/ai-harness/guardrails/constraints/constraint-engine";
import { TeamsMissionOrchestrator as MissionOrchestrator } from "./orchestrator/teams-mission-orchestrator";
import { MissionRuntimeStateStore } from "../lifecycle/mission-lifecycle/runtime-state-store";
import { MissionOrphanDetectorService } from "../lifecycle/mission-lifecycle/orphan-detector.service";
import { MissionAbortRegistry } from "../lifecycle/mission-lifecycle/abort-registry";
import { MissionOwnershipRegistry } from "../lifecycle/mission-lifecycle/ownership-registry";
import { RerunLockRegistry } from "../lifecycle/mission-lifecycle/rerun-lock.registry";
import { AdaptiveReplannerService } from "./orchestrator/adaptive-replanner.service";
import { TeamFactory } from "./factory/team-factory";
import { TeamsService } from "./services/teams.service";
import { MessageBusService as A2AMessageBusService } from "@/modules/ai-harness/protocols/ipc/message-bus.service";
// PR-X16: TeamsController å·²è¿ç§»è‡³ open-api/teams-apiï¼ˆHTTP Controller ä¸Šæï¼‰

// AI Engine æ ¸å¿ƒä¾èµ–
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool.registry";
import { ToolPipeline } from "@/modules/ai-engine/tools/middleware/tool-pipeline";
import { SkillRegistry } from "@/modules/ai-engine/skills/registry/skill.registry";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm.factory";
import { CostController } from "@/modules/ai-harness/guardrails/resources/cost-controller";
import { ShortTermMemoryService } from "@/modules/ai-harness/memory/stores/short-term-memory.service";
import { MCPManager } from "@/modules/ai-engine/tools/adapters/mcp/manager/mcp-manager";
import { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { TraceCollectorService } from "@/modules/ai-harness/tracing/observability/trace-collector.service";
import { CheckpointManager } from "@/modules/ai-harness/protocols/journal/checkpoint-manager";
import { MissionExecutorService } from "@/modules/ai-harness/lifecycle/manager/mission-executor.service";
import { EventJournalService } from "@/modules/ai-harness/protocols/journal/event-journal.service";

/**
 * Teams æ¨¡å—
 *
 * æä¾›å®Œæ•´çš„å›¢é˜Ÿåä½œèƒ½åŠ›ï¼š
 * - Role ç®¡ç†ï¼ˆé¢„å®šä¹‰è§’è‰²ï¼‰
 * - Team ç®¡ç†ï¼ˆé¢„å®šä¹‰å’Œè‡ªå®šä¹‰å›¢é˜Ÿï¼‰
 * - Constraint çº¦æŸå¼•æ“Žï¼ˆé›†æˆ CostControllerï¼‰
 * - Mission ç¼–æŽ’å™¨ï¼ˆé›†æˆ LLM/Tools/Skills/Memoryï¼‰
 */
@Module({
  controllers: [], // TeamsController moved to open-api/teams-api (PR-X16)
  providers: [
    RoleRegistry,
    TeamRegistry,
    A2AMessageBusService,
    // â˜… Phase 9 (2026-04-30): Mission è¿è¡Œæ—¶çŠ¶æ€å¤–ç½® â†’ Redisï¼ˆCacheService globalï¼‰
    MissionRuntimeStateStore,
    // â˜… Phase 9: åŸºäºŽ heartbeat çš„å¿«é€Ÿ orphan æ£€æµ‹ï¼ˆcallback ç”± ai-app æ³¨å…¥ï¼‰
    MissionOrphanDetectorService,
    // â˜… 2026-05-01 (PR-X-E): é€šç”¨ mission registry primitiveï¼ˆä»Ž playground ä¸Šæï¼‰
    MissionAbortRegistry,
    MissionOwnershipRegistry,
    RerunLockRegistry,
    // â˜… 2026-04-30: AdaptiveReplannerService ä»Ž ai-engine/planning æ¬æ¥ (è·¨å±‚æ¬è¿)
    AdaptiveReplannerService,
    // ConstraintEngine ä¾èµ– CostController
    {
      provide: ConstraintEngine,
      useFactory: (costController: CostController) => {
        return new ConstraintEngine(costController);
      },
      inject: [CostController],
    },
    // TeamFactory ä¾èµ– RoleRegistryã€TeamRegistry å’Œ LLMFactory
    {
      provide: TeamFactory,
      useFactory: (
        roleRegistry: RoleRegistry,
        teamRegistry: TeamRegistry,
        llmFactory: LLMFactory,
      ) => {
        return new TeamFactory(roleRegistry, teamRegistry, llmFactory);
      },
      inject: [RoleRegistry, TeamRegistry, LLMFactory],
    },
    // CheckpointManager (å¯é€‰ä¾èµ–ï¼Œç”¨äºŽè‡ªåŠ¨ä¿å­˜æ£€æŸ¥ç‚¹)
    {
      provide: CheckpointManager,
      useFactory: () => {
        return new CheckpointManager();
      },
    },
    // MissionOrchestrator é›†æˆæ‰€æœ‰æ ¸å¿ƒæœåŠ¡
    {
      provide: MissionOrchestrator,
      useFactory: (
        constraintEngine: ConstraintEngine,
        configService: ConfigService,
        toolRegistry: ToolRegistry,
        skillRegistry: SkillRegistry,
        llmFactory: LLMFactory,
        memoryService: ShortTermMemoryService,
        mcpManager: MCPManager,
        aiChatService: AiChatService,
        prismaService: PrismaService,
        traceCollector: TraceCollectorService,
        checkpointManager: CheckpointManager,
        a2aBus: A2AMessageBusService,
        missionExecutor?: MissionExecutorService,
        kernelJournal?: EventJournalService,
        runtimeStore?: MissionRuntimeStateStore,
        toolPipeline?: ToolPipeline,
      ) => {
        return new MissionOrchestrator(
          constraintEngine,
          configService,
          toolRegistry,
          skillRegistry,
          llmFactory,
          memoryService,
          mcpManager,
          aiChatService, // â˜… ç”¨äºŽåˆ›å»º LLM é€‚é…å™¨ç»™ Skills ä½¿ç”¨
          prismaService, // â˜… ç”¨äºŽä»Žæ•°æ®åº“èŽ·å–é»˜è®¤ AI æ¨¡åž‹é…ç½®
          traceCollector, // â˜… ç”¨äºŽæ‰§è¡Œé“¾è·¯å¯è§†åŒ–
          checkpointManager, // â˜… ç”¨äºŽè‡ªåŠ¨ä¿å­˜æ£€æŸ¥ç‚¹
          a2aBus, // â˜… ç”¨äºŽ Agent é—´æ¶ˆæ¯é€šä¿¡
          undefined, // config override (use defaults)
          missionExecutor, // â˜… AI Kernel è¿›ç¨‹è¿½è¸ª
          kernelJournal, // â˜… AI Kernel äº‹ä»¶æ—¥å¿—
          undefined, // adaptiveReplanner (Phase 4, å½“å‰æœªæ³¨å…¥)
          undefined, // hierarchicalMemory (Phase 6, å½“å‰æœªæ³¨å…¥)
          undefined, // lifecycleProtocol (Phase 8, å½“å‰æœªæ³¨å…¥)
          runtimeStore, // â˜… Phase 9: è·¨ pod çŠ¶æ€å¤–ç½®
          toolPipeline, // â˜… 2026-05-01 (PR-X-R): skill å·¥å…·è°ƒç”¨ç®¡çº¿
        );
      },
      inject: [
        ConstraintEngine,
        ConfigService,
        ToolRegistry,
        SkillRegistry,
        LLMFactory,
        ShortTermMemoryService,
        MCPManager,
        AiChatService,
        PrismaService,
        TraceCollectorService,
        CheckpointManager,
        A2AMessageBusService,
        { token: MissionExecutorService, optional: true },
        { token: EventJournalService, optional: true },
        { token: MissionRuntimeStateStore, optional: true },
        { token: ToolPipeline, optional: true },
      ],
    },
    // TeamsService ä¾èµ–æ‰€æœ‰ä¸Šå±‚æœåŠ¡
    {
      provide: TeamsService,
      useFactory: (
        teamFactory: TeamFactory,
        teamRegistry: TeamRegistry,
        roleRegistry: RoleRegistry,
        missionOrchestrator: MissionOrchestrator,
        constraintEngine: ConstraintEngine,
      ) => {
        return new TeamsService(
          teamFactory,
          teamRegistry,
          roleRegistry,
          missionOrchestrator,
          constraintEngine,
        );
      },
      inject: [
        TeamFactory,
        TeamRegistry,
        RoleRegistry,
        MissionOrchestrator,
        ConstraintEngine,
      ],
    },
  ],
  exports: [
    RoleRegistry,
    TeamRegistry,
    ConstraintEngine,
    TeamFactory,
    MissionOrchestrator,
    TeamsService,
    CheckpointManager,
    A2AMessageBusService,
    MissionRuntimeStateStore,
    MissionOrphanDetectorService,
    MissionAbortRegistry,
    MissionOwnershipRegistry,
    RerunLockRegistry,
    AdaptiveReplannerService,
  ],
})
export class TeamsModule implements OnModuleInit {
  private readonly logger = new Logger(TeamsModule.name);

  constructor(
    private readonly roleRegistry: RoleRegistry,
    private readonly teamRegistry: TeamRegistry,
  ) {}

  /**
   * æ¨¡å—åˆå§‹åŒ–
   * å›¢é˜Ÿé…ç½®ç”±å„ AI App æ¨¡å—åœ¨å…¶ onModuleInit ä¸­æ³¨å†Œ
   */
  onModuleInit() {
    this.logger.log(`TeamsModule initialized:`);
    this.logger.log(`  - Roles: ${this.roleRegistry.size()}`);
    this.logger.log(`  - Teams: ${this.teamRegistry.size()}`);
  }
}
