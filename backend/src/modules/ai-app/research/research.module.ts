/**
 * AI Research Module - Deep Research 模块
 *
 * 专注于深度研究模式:
 * - Deep Research: 深度迭代研究 (分钟-小时级)
 * - Notebook Research: NotebookLM 风格文档研究
 *
 * Note: Topic Research 已拆分为独立的 Topic Insights 模块
 */
import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DeepResearchModule } from "./deep-research/deep-research.module";
import { NotebookResearchModule } from "./notebook-research/notebook-research.module";
import { AgentRegistry } from "../../ai-engine/agents/registry";
import { TeamRegistry } from "../../ai-engine/teams/registry/team-registry";
import { ResearcherAgent } from "./agents";
import { RESEARCH_TEAM_CONFIG } from "./teams";

@Module({
  imports: [DeepResearchModule, NotebookResearchModule],
  providers: [ResearcherAgent],
  exports: [
    DeepResearchModule,
    NotebookResearchModule,
    ResearcherAgent,
  ],
})
export class ResearchModule implements OnModuleInit {
  private readonly logger = new Logger(ResearchModule.name);

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly teamRegistry: TeamRegistry,
    private readonly researcherAgent: ResearcherAgent,
  ) {}

  onModuleInit() {
    this.agentRegistry.register(this.researcherAgent);
    this.teamRegistry.registerConfig(RESEARCH_TEAM_CONFIG);
    this.logger.log("Registered ResearcherAgent and RESEARCH_TEAM_CONFIG");
  }
}
