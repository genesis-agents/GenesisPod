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
import { ValidationMiddleware } from "./middleware/validation.middleware";
import { TimeoutMiddleware } from "./middleware/timeout.middleware";

// Policy Data Service
import { PolicyDataService } from "./categories/information/policy";
// ★ Phase 3: 工具并发 + 中间件
import { ToolConcurrencyService } from "./concurrency/tool-concurrency.service";
import { PermissionMiddleware } from "./middleware/permission.middleware";
import { ProgressMiddleware } from "./middleware/progress.middleware";
// ★ L2-7: Tool result cache
import { ToolResultCacheService } from "./cache/tool-result-cache.service";

// All Tools
import {
  ALL_TOOL_PROVIDERS,
  allToolsProvider,
  ALL_TOOLS_TOKEN,
} from "./tools.provider";

/**
 * 工具管道工厂
 */
const toolPipelineFactory = {
  provide: ToolPipeline,
  useFactory: (
    permissionMiddleware: PermissionMiddleware,
    progressMiddleware: ProgressMiddleware,
    toolResultCacheService: ToolResultCacheService,
  ) => {
    const pipeline = new ToolPipeline(toolResultCacheService);
    pipeline.use(permissionMiddleware); // ★ Phase 3: permission check (priority 5, runs first)
    pipeline.use(new ValidationMiddleware()); // existing
    pipeline.use(new TimeoutMiddleware()); // existing
    pipeline.use(progressMiddleware); // ★ Phase 3: progress tracking (priority 90, runs last)
    return pipeline;
  },
  inject: [PermissionMiddleware, ProgressMiddleware, ToolResultCacheService],
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
