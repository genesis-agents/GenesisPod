/**
 * AI Agents Module
 * Agent 矩阵系统的核心模块
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { AiAgentsController } from "./ai-agents.controller";
import { AiAgentsService } from "./ai-agents.service";
import { AgentRegistry } from "./core/agent.registry";
import { ToolRegistry } from "./core/tool.registry";
import { AgentOrchestrator } from "./core/agent.orchestrator";
import { LLMAdapterFactory } from "./core/llm-adapter";
import { ExecutionMetricsCollector } from "./core/execution-metrics";

// Agent 导入
import { SlidesAgent } from "./implementations/slides/slides.agent";
import { DocsAgent } from "./implementations/docs/docs.agent";
import { DesignerAgent } from "./implementations/designer/designer.agent";
import { DeveloperAgent } from "./implementations/developer/developer.agent";

// 工具导入
import {
  WebSearchTool,
  WebScraperTool,
  DataFetchTool,
  TextGenerationTool,
  ImageGenerationTool,
  CodeGenerationTool,
  DataAnalysisTool,
  FileConversionTool,
  ExportPPTXTool,
  ExportDOCXTool,
  ExportPDFTool,
  ExportImageTool,
} from "./tools";

// 依赖模块
import { AiOfficeModule } from "../ai-office/ai-office.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { AiCoreModule } from "../ai-core/ai-core.module";

@Module({
  imports: [AiOfficeModule, AiImageModule, AiCoreModule],
  controllers: [AiAgentsController],
  providers: [
    // 核心服务
    AiAgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,
    LLMAdapterFactory,
    ExecutionMetricsCollector,

    // Agents
    SlidesAgent,
    DocsAgent,
    DesignerAgent,
    DeveloperAgent,

    // Tools - Information Gathering
    WebSearchTool,
    WebScraperTool,
    DataFetchTool,

    // Tools - Content Generation
    TextGenerationTool,
    ImageGenerationTool,
    CodeGenerationTool,

    // Tools - Data Processing
    DataAnalysisTool,
    FileConversionTool,

    // Tools - Export
    ExportPPTXTool,
    ExportDOCXTool,
    ExportPDFTool,
    ExportImageTool,
  ],
  exports: [
    AiAgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,
    LLMAdapterFactory,
    ExecutionMetricsCollector,
  ],
})
export class AiAgentsModule implements OnModuleInit {
  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly toolRegistry: ToolRegistry,
    // Agents
    private readonly slidesAgent: SlidesAgent,
    private readonly docsAgent: DocsAgent,
    private readonly designerAgent: DesignerAgent,
    private readonly developerAgent: DeveloperAgent,
    // Tools - Information Gathering
    private readonly webSearchTool: WebSearchTool,
    private readonly webScraperTool: WebScraperTool,
    private readonly dataFetchTool: DataFetchTool,
    // Tools - Content Generation
    private readonly textGenerationTool: TextGenerationTool,
    private readonly imageGenerationTool: ImageGenerationTool,
    private readonly codeGenerationTool: CodeGenerationTool,
    // Tools - Data Processing
    private readonly dataAnalysisTool: DataAnalysisTool,
    private readonly fileConversionTool: FileConversionTool,
    // Tools - Export
    private readonly exportPPTXTool: ExportPPTXTool,
    private readonly exportDOCXTool: ExportDOCXTool,
    private readonly exportPDFTool: ExportPDFTool,
    private readonly exportImageTool: ExportImageTool,
  ) {}

  onModuleInit() {
    // 注册 Agents
    this.agentRegistry.register(this.slidesAgent);
    this.agentRegistry.register(this.docsAgent);
    this.agentRegistry.register(this.designerAgent);
    this.agentRegistry.register(this.developerAgent);

    // 注册 Tools
    this.toolRegistry.registerMany([
      // Information Gathering
      this.webSearchTool,
      this.webScraperTool,
      this.dataFetchTool,
      // Content Generation
      this.textGenerationTool,
      this.imageGenerationTool,
      this.codeGenerationTool,
      // Data Processing
      this.dataAnalysisTool,
      this.fileConversionTool,
      // Export
      this.exportPPTXTool,
      this.exportDOCXTool,
      this.exportPDFTool,
      this.exportImageTool,
    ]);
  }
}
