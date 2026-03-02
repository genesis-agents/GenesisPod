/**
 * Discussion Module - 讨论式研究模块
 *
 * 提供深度迭代研究能力:
 * - 讨论驱动型研究 (Discussion-driven Research)
 * - 迭代搜索 (Iterative Search)
 * - 报告合成 (Report Synthesis)
 *
 * 保留旧服务用于向后兼容旧 session 和 MCP Server 调用
 */
import { Module, forwardRef, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { AIEngineFacade } from "../../../ai-engine/facade/ai-engine.facade";
import { CreditsModule } from "../../../ai-infra/facade";

import { DiscussionController } from "./discussion.controller";
import { DiscussionResearchService } from "./discussion-research.service";
import { ResearchPlannerService } from "./research-planner.service";
import { IterativeSearchService } from "./iterative-search.service";
import { SelfReflectionService } from "./self-reflection.service";
import { ReportSynthesizerService } from "./report-synthesizer.service";
import { DiscussionAgentService } from "./discussion-agent.service";
import { DiscussionOrchestratorService } from "./discussion-orchestrator.service";
import { ResearchIdeaService } from "../idea/research-idea.service";
import { ResearchReplannerService } from "./research-replanner.service";

const services = [
  DiscussionResearchService,
  ResearchPlannerService,
  IterativeSearchService,
  SelfReflectionService,
  ReportSynthesizerService,
  DiscussionAgentService,
  DiscussionOrchestratorService,
  ResearchIdeaService,
  ResearchReplannerService,
];

@Module({
  imports: [PrismaModule, forwardRef(() => AiEngineModule), CreditsModule],
  controllers: [DiscussionController],
  providers: services,
  exports: services,
})
export class DiscussionModule implements OnModuleInit {
  constructor(
    private readonly aiFacade: AIEngineFacade,
    private readonly researchService: DiscussionResearchService,
  ) {}

  onModuleInit() {
    this.aiFacade.registerResearchExecutor(this.researchService);
  }
}
