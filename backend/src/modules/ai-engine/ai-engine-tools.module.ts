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
import { PrismaModule } from "../../common/prisma/prisma.module";
import { ExportModule } from "../../common/export/export.module";
import { SecretsModule } from "../ai-infra/facade";

// Registry
import { ToolRegistry } from "./tools/registry/tool-registry";

// Middleware
import { ToolPipeline, ToolExecutor } from "./tools/middleware/tool-pipeline";
import { ValidationMiddleware } from "./tools/middleware/validation.middleware";
import { TimeoutMiddleware } from "./tools/middleware/timeout.middleware";

// Policy Data Service
import { PolicyDataService } from "./tools/categories/information/policy";

// All Tools
import {
  ALL_TOOL_PROVIDERS,
  allToolsProvider,
  ALL_TOOLS_TOKEN,
} from "./tools/tools.provider";

/**
 * 工具管道工厂
 */
const toolPipelineFactory = {
  provide: ToolPipeline,
  useFactory: () => {
    const pipeline = new ToolPipeline();
    pipeline.use(new ValidationMiddleware());
    pipeline.use(new TimeoutMiddleware());
    return pipeline;
  },
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
  ],
})
export class AiEngineToolsModule {}
