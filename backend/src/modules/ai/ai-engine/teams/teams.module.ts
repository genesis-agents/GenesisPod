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
import { RoleRegistry } from "./registry/role-registry";
import { TeamRegistry } from "./registry/team-registry";
import { ConstraintEngine } from "./constraints/constraint-engine";
import { MissionOrchestrator } from "./orchestrator/mission-orchestrator";
import { TeamFactory } from "./factory/team-factory";
import { TeamsService } from "./services/teams.service";
import { TeamsController } from "./controllers/teams.controller";
import { PREDEFINED_TEAM_CONFIGS } from "./templates";

// AI Engine 核心依赖
import { ToolRegistry } from "../tools/registry/tool-registry";
import { SkillRegistry } from "../skills/registry/skill-registry";
import { LLMFactory } from "../llm/factory/llm-factory";
import { CostController } from "../constraint/guardrails/cost-controller";
import { ShortTermMemoryService } from "../memory/stores/short-term-memory.service";
import { MCPManager } from "../mcp/manager/mcp-manager";

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
    // MissionOrchestrator 集成所有核心服务
    {
      provide: MissionOrchestrator,
      useFactory: (
        constraintEngine: ConstraintEngine,
        toolRegistry: ToolRegistry,
        skillRegistry: SkillRegistry,
        llmFactory: LLMFactory,
        memoryService: ShortTermMemoryService,
        mcpManager: MCPManager,
      ) => {
        return new MissionOrchestrator(
          constraintEngine,
          toolRegistry,
          skillRegistry,
          llmFactory,
          memoryService,
          mcpManager,
        );
      },
      inject: [
        ConstraintEngine,
        ToolRegistry,
        SkillRegistry,
        LLMFactory,
        ShortTermMemoryService,
        MCPManager,
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
   */
  onModuleInit() {
    this.registerPredefinedTeams();
    this.logModuleStatus();
  }

  /**
   * 注册预定义团队
   */
  private registerPredefinedTeams() {
    for (const config of Object.values(PREDEFINED_TEAM_CONFIGS)) {
      this.teamRegistry.registerConfig(config);
    }
    this.logger.log(
      `Registered ${Object.keys(PREDEFINED_TEAM_CONFIGS).length} predefined teams`,
    );
  }

  /**
   * 记录模块状态
   */
  private logModuleStatus() {
    this.logger.log(`TeamsModule initialized:`);
    this.logger.log(`  - Roles: ${this.roleRegistry.size()}`);
    this.logger.log(`  - Teams: ${this.teamRegistry.size()}`);
  }
}
