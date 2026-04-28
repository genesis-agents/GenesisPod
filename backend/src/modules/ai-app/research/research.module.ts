/**
 * AI Research Module - 研究模块
 *
 * 子模块:
 * - Discussion: 讨论驱动研究引擎 (SSE 编排、Agent、搜索、报告合成)
 * - Project: 研究项目管理 (CRUD、Sources、Chat、Notes、Outputs)
 * - Idea: 研究创意管理
 * - Demo: 研究演示管理
 * - Iteration: 自迭代研究 (外层循环编排)
 * - Evaluation: Demo 评估 (DOM分析 + LLM评审)
 * - Memory: 研究记忆 (跨会话经验积累)
 */
import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DiscussionModule } from "./discussion/discussion.module";
import { ResearchProjectModule } from "./project/research-project.module";
import { PromptSkillBridge } from "../../ai-engine/facade";
import { TeamRegistry } from "../../ai-harness/facade";
import { AgentRegistry } from "../../ai-harness/facade";
import { ResearcherAgent } from "./agents";
import { RESEARCH_TEAM_CONFIG } from "./teams";
import { ResearchIdeaService } from "./idea/research-idea.service";
import { ResearchIdeaController } from "./idea/research-idea.controller";
import { ResearchDemoService } from "./demo/research-demo.service";
import { ResearchDemoController } from "./demo/research-demo.controller";
import { ResearchProjectExportService } from "./services/research-project-export.service";
import { ResearchProjectExportAdapter } from "./services/research-project-export.adapter";
import { RESEARCH_PROJECT_DATA_EXPORT } from "../contracts/interfaces/data-export.interface";
// Iterative research services
import {
  TopicClassifierService,
  DemoEvaluatorService,
  ExitDecisionService,
} from "./evaluation";
import {
  IterationRecordService,
  IterationFeedbackService,
  IterationEvaluatorService,
  IterationCoordinatorService,
  IterativeResearchService,
} from "./iteration";
import { ResearchMemoryService } from "./memory/research-memory.service";
import { StrategyLoaderService } from "./memory/strategy-loader.service";
import { DiscussionController } from "./discussion/discussion.controller";

@Module({
  imports: [DiscussionModule, ResearchProjectModule],
  controllers: [
    DiscussionController,
    ResearchIdeaController,
    ResearchDemoController,
  ],
  providers: [
    ResearcherAgent,
    ResearchIdeaService,
    ResearchDemoService,
    ResearchProjectExportService,
    ResearchProjectExportAdapter,
    {
      provide: RESEARCH_PROJECT_DATA_EXPORT,
      useExisting: ResearchProjectExportAdapter,
    },
    // Iterative research
    TopicClassifierService,
    DemoEvaluatorService,
    ExitDecisionService,
    IterationRecordService,
    IterationFeedbackService,
    IterationEvaluatorService,
    IterationCoordinatorService,
    IterativeResearchService,
    ResearchMemoryService,
    StrategyLoaderService,
  ],
  exports: [
    DiscussionModule,
    ResearchProjectModule,
    ResearcherAgent,
    ResearchIdeaService,
    ResearchDemoService,
    ResearchProjectExportService,
    RESEARCH_PROJECT_DATA_EXPORT,
    IterativeResearchService,
  ],
})
export class ResearchModule implements OnModuleInit {
  private readonly logger = new Logger(ResearchModule.name);

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly teamRegistry: TeamRegistry,
    private readonly researcherAgent: ResearcherAgent,
    private readonly promptSkillBridge: PromptSkillBridge,
  ) {}

  async onModuleInit() {
    this.agentRegistry.register(this.researcherAgent);
    this.teamRegistry.registerConfig(RESEARCH_TEAM_CONFIG);

    try {
      const result = await this.promptSkillBridge.registerDomain("research");
      this.logger.log(
        `Registered research skill domain: ${result.registered.length} skills loaded`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to register research skill domain: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.log("Registered ResearcherAgent and RESEARCH_TEAM_CONFIG");
  }
}
