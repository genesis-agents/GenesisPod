/**
 * AI Office 共享模块
 *
 * 提供 Slides 和 Docs 模块共用的服务：
 * - 内容分析服务
 * - 模板选择服务
 * - 图文匹配服务
 * - 阅读体验服务
 *
 * 注意：此模块需要与 AiOfficeModule 一起导入使用
 * 依赖的服务由 AiOfficeModule 提供
 */

import { Module } from "@nestjs/common";
import { AiCoreModule } from "../../ai-core/ai-core.module";
import { AIModelService } from "../core/ai-model.service";

// 服务
import { ContentAnalysisService } from "./content-analysis.service";
import { TemplateSelectionService } from "./template-selection.service";
import { ImageMatchingService } from "./image-matching.service";
import { ReadingExperienceService } from "./reading-experience.service";

const services = [
  ContentAnalysisService,
  TemplateSelectionService,
  ImageMatchingService,
  ReadingExperienceService,
];

@Module({
  imports: [AiCoreModule],
  providers: [AIModelService, ...services],
  exports: [...services],
})
export class AIOfficeCommonModule {}
