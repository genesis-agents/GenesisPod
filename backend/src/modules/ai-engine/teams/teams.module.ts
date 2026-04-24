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
import { ConstraintEngine } from "../runtime/resource/constraint-engine";
import { MissionOrchestrator } from "./orchestrator/mission-orchestrator";
import { TeamFactory } from "./factory/team-factory";
import { TeamsService } from "./services/teams.service";
import { MessageBusService as A2AMessageBusService } from "../runtime/ipc/message-bus.service";
import { TeamsController } from "./controllers/teams.controller";

// AI Engine 核心依赖
import { ToolRegistry } from "../tools/registry/tool-registry";
import { SkillRegistry } from "../skills/registry/skill-registry";
import { LLMFactory } from "../llm/factory/llm-factory";
import { CostController } from "../runtime/resource/cost-controller";
import { ShortTermMemoryService } from "../knowledge/memory/stores/short-term-memory.service";
import { MCPManager } from "../mcp/manager/mcp-manager";
import { AiChatService } from "../llm/services/ai-chat.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { TraceCollectorService } from "../runtime/observability/trace-collector.service";
import { CheckpointManager } from "../runtime/journal/checkpoint-manager";
import { MissionExecutorService } from "../runtime/mission/mission-executor.service";
import { EventJournalService } from "../runtime/journal/event-journal.service";

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
  controllers: [TeamsController],
  providers: [
    RoleRegistry,
    TeamRegistry,
    A2AMessageBusService,
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
