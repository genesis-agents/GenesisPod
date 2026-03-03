/**
 * AI Orchestration Module
 *
 * 统一的 AI 编排层，提供：
 * 1. 模型选择策略（根据任务类型自动选择最佳模型）
 * 2. 降级机制（主模型失败时自动切换备用模型）
 * 3. 重试逻辑（带指数退避）
 * 4. 统一的错误处理
 * 5. 成本追踪和优化
 * 6. Provider 策略模式（支持动态扩展）
 * 7. 配置外部化（支持环境变量覆盖）
 *
 * 设计原则：
 * - 所有 AI 模块（ai-office, ai-image, ai-studio 等）都应该通过此模块调用 AI
 * - 禁止在业务模块中直接硬编码 AI 调用逻辑
 * - 提供类型安全的接口
 * - 符合 SOLID 原则
 */

import { Module, Global, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { AiOrchestrationService } from "./ai-orchestration.service";
import { ModelSelectorService } from "./model-selector.service";
import { FallbackManagerService } from "./fallback-manager.service";
import { AIErrorClassifier } from "./error-classifier";
import { AIProviderFactory } from "./providers";
import { PrismaModule } from "../prisma/prisma.module";
import { aiOrchestrationConfig } from "./config";
import { AiEngineModule } from "../../modules/ai-engine/ai-engine.module";

@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(aiOrchestrationConfig),
    HttpModule.register({
      timeout: 120000, // 2 分钟超时（图像生成需要较长时间）
      maxRedirects: 5,
    }),
    // 导入 AiEngineModule 以使用 ChatFacade
    forwardRef(() => AiEngineModule),
  ],
  providers: [
    // 核心编排服务
    AiOrchestrationService,
    ModelSelectorService,
    FallbackManagerService,
    // 错误分类器 (注入而非直接实例化)
    AIErrorClassifier,
    // Provider 工厂 (管理所有 AI Provider)
    AIProviderFactory,
  ],
  exports: [
    AiOrchestrationService,
    ModelSelectorService,
    AIProviderFactory,
    AIErrorClassifier,
  ],
})
export class AiOrchestrationModule {}
