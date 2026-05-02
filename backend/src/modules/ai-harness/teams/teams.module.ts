/**
 * AI Engine - Teams Module
 * 团队系统 NestJS 模块
 *
 * 集成到 AI Engine 核心模块，依赖：
 * - ToolRegistry: 工具注册表
 * - SkillRegistry: 技能注册表
 * - LLMFactory: LLM 适配器工厂
 * - CostController: 成本控制器
 * - Memory: 记忆系统
 * - MCPManager: MCP 外部工具管理
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoleRegistry } from "./registry/role-registry";
import { TeamRegistry } from "./registry/team-registry";
// ★ L2 internal — direct relative paths (禁 facade barrel)
import { ConstraintEngine } from "@/modules/ai-harness/governance/resource/constraint-engine";
import { TeamsMissionOrchestrator as MissionOrchestrator } from "./orchestrator/teams-mission-orchestrator";
import { MissionRuntimeStateStore } from "./orchestrator/mission-runtime-state.store";
import { MissionOrphanDetectorService } from "./orchestrator/mission-orphan-detector.service";
import { MissionAbortRegistry } from "./orchestrator/mission-abort.registry";
import { MissionOwnershipRegistry } from "./orchestrator/mission-ownership.registry";
import { AdaptiveReplannerService } from "./orchestrator/adaptive-replanner.service";
import { TeamFactory } from "./factory/team-factory";
import { TeamsService } from "./services/teams.service";
import { MessageBusService as A2AMessageBusService } from "@/modules/ai-harness/protocol/ipc/message-bus.service";
// PR-X16: TeamsController 已迁移至 open-api/teams-api（HTTP Controller 上提）

// AI Engine 核心依赖
import { ToolRegistry } from "@/modules/ai-engine/tools/registry/tool-registry";
import { ToolPipeline } from "@/modules/ai-engine/tools/middleware/tool-pipeline";
import { SkillRegistry } from "@/modules/ai-engine/skills/registry/skill-registry";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm-factory";
import { CostController } from "@/modules/ai-harness/governance/resource/cost-controller";
import { ShortTermMemoryService } from "@/modules/ai-harness/memory/stores/short-term-memory.service";
import { MCPManager } from "@/modules/ai-harness/protocol/mcp/manager/mcp-manager";
import { AiChatService } from "@/modules/ai-engine/llm/services/ai-chat.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { TraceCollectorService } from "@/modules/ai-harness/governance/observability/trace-collector.service";
import { CheckpointManager } from "@/modules/ai-harness/protocol/journal/checkpoint-manager";
import { MissionExecutorService } from "@/modules/ai-harness/runtime/mission/mission-executor.service";
import { EventJournalService } from "@/modules/ai-harness/protocol/journal/event-journal.service";

/**
 * Teams 模块
 *
 * 提供完整的团队协作能力：
 * - Role 管理（预定义角色）
 * - Team 管理（预定义和自定义团队）
 * - Constraint 约束引擎（集成 CostController）
 * - Mission 编排器（集成 LLM/Tools/Skills/Memory）
 */
@Module({
  controllers: [], // TeamsController moved to open-api/teams-api (PR-X16)
  providers: [
    RoleRegistry,
    TeamRegistry,
    A2AMessageBusService,
    // ★ Phase 9 (2026-04-30): Mission 运行时状态外置 → Redis（CacheService global）
    MissionRuntimeStateStore,
    // ★ Phase 9: 基于 heartbeat 的快速 orphan 检测（callback 由 ai-app 注入）
    MissionOrphanDetectorService,
    // ★ 2026-05-01 (PR-X-E): 通用 mission registry primitive（从 playground 上提）
    MissionAbortRegistry,
    MissionOwnershipRegistry,
    // ★ 2026-04-30: AdaptiveReplannerService 从 ai-engine/planning 搬来 (跨层搬迁)
    AdaptiveReplannerService,
    // ConstraintEngine 依赖 CostController
    {
      provide: ConstraintEngine,
      useFactory: (costController: CostController) => {
        return new ConstraintEngine(costController);
      },
      inject: [CostController],
    },
    // TeamFactory 依赖 RoleRegistry、TeamRegistry 和 LLMFactory
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
    // CheckpointManager (可选依赖，用于自动保存检查点)
    {
      provide: CheckpointManager,
      useFactory: () => {
        return new CheckpointManager();
      },
    },
    // MissionOrchestrator 集成所有核心服务
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
          aiChatService, // ★ 用于创建 LLM 适配器给 Skills 使用
          prismaService, // ★ 用于从数据库获取默认 AI 模型配置
          traceCollector, // ★ 用于执行链路可视化
          checkpointManager, // ★ 用于自动保存检查点
          a2aBus, // ★ 用于 Agent 间消息通信
          undefined, // config override (use defaults)
          missionExecutor, // ★ AI Kernel 进程追踪
          kernelJournal, // ★ AI Kernel 事件日志
          undefined, // adaptiveReplanner (Phase 4, 当前未注入)
          undefined, // hierarchicalMemory (Phase 6, 当前未注入)
          undefined, // lifecycleProtocol (Phase 8, 当前未注入)
          runtimeStore, // ★ Phase 9: 跨 pod 状态外置
          toolPipeline, // ★ 2026-05-01 (PR-X-R): skill 工具调用管线
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
    // TeamsService 依赖所有上层服务
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
   * 模块初始化
   * 团队配置由各 AI App 模块在其 onModuleInit 中注册
   */
  onModuleInit() {
    this.logger.log(`TeamsModule initialized:`);
    this.logger.log(`  - Roles: ${this.roleRegistry.size()}`);
    this.logger.log(`  - Teams: ${this.teamRegistry.size()}`);
  }
}
