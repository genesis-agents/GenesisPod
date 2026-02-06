/**
 * AI Research Module - 统一研究模块
 *
 * 整合四种研究模式:
 * - Fast Research: 快速问答式研究 (秒级)
 * - Topic Research: 专题多维度研究 (分钟级)
 * - Deep Research: 深度迭代研究 (分钟-小时级)
 * - Notebook Research: NotebookLM 风格文档研究
 */
import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { TopicResearchModule } from "./topic-research/topic-research.module";
import { DeepResearchModule } from "./deep-research/deep-research.module";
import { NotebookResearchModule } from "./notebook-research/notebook-research.module";
import { AgentRegistry } from "../../ai-engine/agents/registry";
import { TeamRegistry } from "../../ai-engine/teams/registry/team-registry";
import { ResearcherAgent } from "./agents";
import { RESEARCH_TEAM_CONFIG } from "./teams";

@Module({
  imports: [TopicResearchModule, DeepResearchModule, NotebookResearchModule],
  providers: [ResearcherAgent],
  exports: [
    TopicResearchModule,
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
