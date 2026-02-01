/**
 * AI Research Module - 统一导出入口
 *
 * 提供四种研究模式:
 * - Fast Research: 快速问答式研究 (秒级) - TODO
 * - Topic Research: 专题多维度研究 (分钟级)
 * - Deep Research: 深度迭代研究 (分钟-小时级)
 * - Notebook Research: NotebookLM 风格文档研究
 */

// 统一模块
export { ResearchModule } from "./research.module";

// Topic Research - 使用命名空间避免冲突
export { TopicResearchModule } from "./topic-research/topic-research.module";
export { TopicResearchService } from "./topic-research/topic-research.service";
export {
  TopicController,
  MissionController,
  ReportController,
  CollaborationController,
  TodoController,
  ReportReviewController,
} from "./topic-research/controllers";
export { TopicResearchGateway } from "./topic-research/topic-research.gateway";

// Fast Research - 快速问答式研究 (★ P1 任务：待实现)
export { FastResearchModule } from "./fast-research/fast-research.module";

// Deep Research - 使用命名空间避免冲突
export { DeepResearchModule } from "./deep-research/deep-research.module";
export { DeepResearchAgentService } from "./deep-research/deep-research-agent.service";
export { DeepResearchController } from "./deep-research/deep-research.controller";
export { ResearchPlannerService } from "./deep-research/research-planner.service";
export { IterativeSearchService } from "./deep-research/iterative-search.service";
export { SelfReflectionService } from "./deep-research/self-reflection.service";
export { ReportSynthesizerService } from "./deep-research/report-synthesizer.service";

// Notebook Research (原 AI Studio) - NotebookLM 风格研究
export {
  NotebookResearchModule,
  AiStudioModule,
} from "./notebook-research/notebook-research.module";
export { AiStudioService } from "./notebook-research/ai-studio.service";
export { AiStudioController } from "./notebook-research/ai-studio.controller";
export { AiStudioSourceService } from "./notebook-research/ai-studio-source.service";
export { AiStudioChatService } from "./notebook-research/ai-studio-chat.service";
export { AiStudioOutputService } from "./notebook-research/ai-studio-output.service";
export { AiStudioTTSService } from "./notebook-research/ai-studio-tts.service";
