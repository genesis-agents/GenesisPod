/**
 * AI Engine Tools Module
 * 工具系统子模块
 *
 * 提供:
 * - Tool Registry
 * - Tool Pipeline & Executor
 * - All 46 Built-in Tools
 */

import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { ExportModule } from "../../../common/export/export.module";
import { BrowserModule } from "../../../common/browser/browser.module";
import { SecretsModule } from "../../ai-infra/secrets/secrets.module";

// Registry
import { ToolRegistry } from "./registry/tool.registry";

// Middleware
import { ToolPipeline, ToolExecutor } from "./middleware/tool-pipeline";

// Policy Data Service
import { PolicyDataService } from "./categories/information/policy";
// ★ Phase 3: 工具并发 + 中间件
import { ToolConcurrencyService } from "./concurrency/tool-concurrency.service";
import { PermissionMiddleware } from "./middleware/permission.middleware";
import { ProgressMiddleware } from "./middleware/progress.middleware";
// ★ L2-7: Tool result cache
import { ToolResultCacheService } from "./cache/tool-result-cache.service";
// ★ R0.5-E W1-a: HookBus 注入（plugin 路径替代 timeout/validation 中间件）
import { HookBus } from "@/plugins/core/hook-bus";

// All Tools
import {
  ALL_TOOL_PROVIDERS,
  allToolsProvider,
  ALL_TOOLS_TOKEN,
} from "./tools.provider";

/**
 * 工具管道工厂
 *
 * v5.1 R0.5-E W1-a 单轨化（2026-05-04）：
 *   - validation/timeout 由 plugin（tool-validation-zod / tool-timeout）通过 HookBus 接管
 *   - 不再 pipeline.use(new ValidationMiddleware()) / new TimeoutMiddleware()
 *   - HookBus 注入 → ToolPipeline.executeWithHooks 路径生效（fire TOOL_BEFORE/WRAP/AFTER）
 */
const toolPipelineFactory = {
  provide: ToolPipeline,
  useFactory: (
    permissionMiddleware: PermissionMiddleware,
    progressMiddleware: ProgressMiddleware,
    toolResultCacheService: ToolResultCacheService,
    hookBus: HookBus,
  ) => {
    const pipeline = new ToolPipeline(toolResultCacheService, hookBus);
    pipeline.use(permissionMiddleware); // ★ Phase 3: permission check (priority 5, runs first)
    pipeline.use(progressMiddleware); // ★ Phase 3: progress tracking (priority 90, runs last)
    return pipeline;
  },
  inject: [
    PermissionMiddleware,
    ProgressMiddleware,
    ToolResultCacheService,
    HookBus,
  ],
};

/**
 * 工具执行器工厂
 */
const toolExecutorFactory = {
  provide: ToolExecutor,
  useFactory: (pipeline: ToolPipeline) => {
    return new ToolExecutor(pipeline);
  },
  inject: [ToolPipeline],
};

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    BrowserModule,
    ExportModule, // FileConversionTool needs ExportOrchestratorService
    SecretsModule,
  ],
  providers: [
    // Registry
    ToolRegistry,

    // Pipeline & Executor
    toolPipelineFactory,
    toolExecutorFactory,

    // Policy Data Service
    PolicyDataService,
    // ★ Phase 3: 工具并发 + 中间件
    ToolConcurrencyService,
    PermissionMiddleware,
    ProgressMiddleware,
    // ★ L2-7: Tool result cache
    ToolResultCacheService,

    // All 46 Built-in Tools
    ...ALL_TOOL_PROVIDERS,
    allToolsProvider,
  ],
  exports: [
    ToolRegistry,
    ToolPipeline,
    ToolExecutor,
    PolicyDataService,
    ...ALL_TOOL_PROVIDERS,
    ALL_TOOLS_TOKEN, // Export token for AiEngineModule injection
    // ★ Phase 3
    ToolConcurrencyService,
    PermissionMiddleware,
    ProgressMiddleware,
    // ★ L2-7
    ToolResultCacheService,
  ],
})
export class AiEngineToolsModule {}
