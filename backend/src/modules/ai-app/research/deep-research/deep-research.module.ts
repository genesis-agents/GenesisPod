/**
 * Deep Research Module - 深度研究模块
 *
 * 提供深度迭代研究能力:
 * - 研究规划 (Research Planning)
 * - 迭代搜索 (Iterative Search)
 * - 自我反思 (Self Reflection)
 * - 报告合成 (Report Synthesis)
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../ai-engine";
import { CreditsModule } from "../../../credits/credits.module";

import { DeepResearchController } from "./deep-research.controller";
import { DeepResearchAgentService } from "./deep-research-agent.service";
import { ResearchPlannerService } from "./research-planner.service";
import { IterativeSearchService } from "./iterative-search.service";
import { SelfReflectionService } from "./self-reflection.service";
import { ReportSynthesizerService } from "./report-synthesizer.service";

const services = [
  DeepResearchAgentService,
  ResearchPlannerService,
  IterativeSearchService,
  SelfReflectionService,
  ReportSynthesizerService,
];

@Module({
  imports: [PrismaModule, AiEngineModule, CreditsModule],
  controllers: [DeepResearchController],
  providers: services,
  exports: services,
})
export class DeepResearchModule {}
