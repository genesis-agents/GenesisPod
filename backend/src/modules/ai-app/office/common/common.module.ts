/**
 * AI Office 共享模块
 *
 * 提供 Slides 和 Docs 模块共用的服务：
 * - 模板选择服务
 * - 图文匹配服务（Phase 3 后也会迁移到 Engine）
 * - 阅读体验服务
 *
 * ContentAnalysisService 已迁移到 AI Engine（通过 @Global 自动可用）
 * ImageMatchingService 将在 Phase 3 迁移到 AI Engine
 *
 * 注意：此模块需要与 AiOfficeModule 一起导入使用
 * 依赖的服务由 AiOfficeModule 提供
 */

import { Module } from "@nestjs/common";
import { AIModelService } from "../core/ai-model.service";

// 服务
import { TemplateSelectionService } from "./template-selection.service";
import { ReadingExperienceService } from "./reading-experience.service";

// ImageMatchingService 已迁移到 AI Engine（通过 @Global ImageModule 自动可用）
const services = [TemplateSelectionService, ReadingExperienceService];

@Module({
  providers: [AIModelService, ...services],
  exports: [...services],
})
export class AIOfficeCommonModule {}
