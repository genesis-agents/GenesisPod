/**
 * AI Orchestration Module
 *
 * 统一的 AI 编排层，提供：
 * 1. 模型选择策略（根据任务类型自动选择最佳模型）
 * 2. 降级机制（主模型失败时自动切换备用模型）
 * 3. 重试逻辑（带指数退避）
 * 4. 统一的错误处理
 * 5. 成本追踪和优化
 *
 * 设计原则：
 * - 所有 AI 模块（ai-office, ai-image, ai-studio 等）都应该通过此模块调用 AI
 * - 禁止在业务模块中直接硬编码 AI 调用逻辑
 * - 提供类型安全的接口
 */

import { Module, Global } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AiOrchestrationService } from "./ai-orchestration.service";
import { ModelSelectorService } from "./model-selector.service";
import { FallbackManagerService } from "./fallback-manager.service";
import { PrismaModule } from "../prisma/prisma.module";

@Global()
@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 120000, // 2 分钟超时（图像生成需要较长时间）
      maxRedirects: 5,
    }),
  ],
  providers: [
    AiOrchestrationService,
    ModelSelectorService,
    FallbackManagerService,
  ],
  exports: [AiOrchestrationService, ModelSelectorService],
})
export class AiOrchestrationModule {}
