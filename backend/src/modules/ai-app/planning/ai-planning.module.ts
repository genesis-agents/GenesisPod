/**
 * AI Planning Module
 * AI 策划模块 — 独立 AI App
 *
 * 依赖：
 * - AiTeamsModule: 复用 Topic/Mission/Debate 基础设施
 * - AiEngineModule: TeamRegistry 注册策划团队配置
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { AiTeamsModule } from "../teams/ai-teams.module";
import { PlanningController } from "./controllers";
import {
  PlanningOrchestratorService,
  PlanningTemplateService,
} from "./services";
import { PLANNING_TEAM_CONFIG } from "./config";
import { TeamRegistry } from "../../ai-engine/teams/registry/team-registry";

@Module({
  imports: [PrismaModule, AiEngineModule, AiTeamsModule],
  controllers: [PlanningController],
  providers: [PlanningOrchestratorService, PlanningTemplateService],
  exports: [PlanningOrchestratorService, PlanningTemplateService],
})
export class AiPlanningModule implements OnModuleInit {
  private readonly logger = new Logger(AiPlanningModule.name);

  constructor(private readonly teamRegistry: TeamRegistry) {}

  onModuleInit() {
    this.teamRegistry.registerConfig(PLANNING_TEAM_CONFIG);
    this.logger.log("Registered PLANNING team config");
  }
}
