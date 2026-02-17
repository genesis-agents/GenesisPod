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
import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../../credits/credits.module";

import { DiscussionController } from "./discussion.controller";
import { DiscussionResearchService } from "./discussion-research.service";
import { ResearchPlannerService } from "./research-planner.service";
import { IterativeSearchService } from "./iterative-search.service";
import { SelfReflectionService } from "./self-reflection.service";
import { ReportSynthesizerService } from "./report-synthesizer.service";
import { DiscussionAgentService } from "./discussion-agent.service";
import { DiscussionOrchestratorService } from "./discussion-orchestrator.service";
import { ResearchIdeaService } from "../idea/research-idea.service";

const services = [
  DiscussionResearchService,
  ResearchPlannerService,
  IterativeSearchService,
  SelfReflectionService,
  ReportSynthesizerService,
  DiscussionAgentService,
  DiscussionOrchestratorService,
  ResearchIdeaService,
];

@Module({
  imports: [PrismaModule, forwardRef(() => AiEngineModule), CreditsModule],
  controllers: [DiscussionController],
  providers: services,
  exports: services,
})
export class DiscussionModule {}
