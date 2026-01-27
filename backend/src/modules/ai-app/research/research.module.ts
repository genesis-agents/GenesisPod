/**
 * AI Research Module - 统一研究模块
 *
 * 整合四种研究模式:
 * - Fast Research: 快速问答式研究 (秒级)
 * - Topic Research: 专题多维度研究 (分钟级)
 * - Deep Research: 深度迭代研究 (分钟-小时级)
 * - Notebook Research: NotebookLM 风格文档研究
 *
 * 以及反馈闭环系统:
 * - Feedback: 反馈收集、分析、知识沉淀
 */
import { Module } from "@nestjs/common";
import { TopicResearchModule } from "./topic-research/topic-research.module";
import { DeepResearchModule } from "./deep-research/deep-research.module";
import { NotebookResearchModule } from "./notebook-research/notebook-research.module";
import { FeedbackModule } from "./feedback/feedback.module";

@Module({
  imports: [
    TopicResearchModule,
    DeepResearchModule,
    NotebookResearchModule,
    FeedbackModule,
  ],
  exports: [
    TopicResearchModule,
    DeepResearchModule,
    NotebookResearchModule,
    FeedbackModule,
  ],
})
export class ResearchModule {}
