/**
 * AI Research Module - 研究模块
 *
 * 子模块:
 * - Discussion: 讨论驱动研究引擎 (SSE 编排、Agent、搜索、报告合成)
 * - Project: 研究项目管理 (CRUD、Sources、Chat、Notes、Outputs)
 * - Idea: 研究创意管理
 * - Demo: 研究演示管理
 */
import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DiscussionModule } from "./discussion/discussion.module";
import { ResearchProjectModule } from "./project/research-project.module";
import { AgentRegistry } from "../../ai-engine/agents/registry";
import { TeamRegistry } from "../../ai-engine/teams/registry/team-registry";
import { ResearcherAgent } from "./agents";
import { RESEARCH_TEAM_CONFIG } from "./teams";
import { ResearchIdeaService } from "./idea/research-idea.service";
import { ResearchIdeaController } from "./idea/research-idea.controller";
import { ResearchDemoService } from "./demo/research-demo.service";
import { ResearchDemoController } from "./demo/research-demo.controller";
import { ResearchDataExportService } from "./services/research-data-export.service";
import { ResearchDataExportAdapter } from "./services/research-data-export.adapter";
import { RESEARCH_DATA_EXPORT } from "../office/interfaces/data-export.interface";

@Module({
  imports: [DiscussionModule, ResearchProjectModule],
  controllers: [ResearchIdeaController, ResearchDemoController],
  providers: [
    ResearcherAgent,
    ResearchIdeaService,
    ResearchDemoService,
    ResearchDataExportService,
    ResearchDataExportAdapter,
    {
      provide: RESEARCH_DATA_EXPORT,
      useExisting: ResearchDataExportAdapter,
    },
  ],
  exports: [
    DiscussionModule,
    ResearchProjectModule,
    ResearcherAgent,
    ResearchIdeaService,
    ResearchDemoService,
    ResearchDataExportService,
    RESEARCH_DATA_EXPORT,
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
