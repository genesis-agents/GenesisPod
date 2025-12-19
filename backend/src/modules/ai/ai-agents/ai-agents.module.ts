/**
 * AI Agents Module
 * Agent 矩阵系统的核心模块
 * 包含 48 种工具的完整注册
 */

import { Module, OnModuleInit } from "@nestjs/common";
import { AiAgentsController } from "./ai-agents.controller";
import { AiAgentsService } from "./ai-agents.service";
import { AgentRegistry } from "./core/agent.registry";
import { ToolRegistry } from "./core/tool.registry";
import { AgentOrchestrator } from "./core/agent.orchestrator";
import { LLMAdapterFactory } from "./core/llm-adapter";
import { ExecutionMetricsCollector } from "./core/execution-metrics";

// MCP 和验证器
import { MCPAdapter } from "./core/mcp/mcp-adapter";
import { MCPServer } from "./core/mcp/mcp-server";
import { ResourceManager } from "./core/mcp/resources/resource-manager";
import { SchemaValidator } from "./core/validation/schema-validator";

// Agent 导入
import { SlidesAgent } from "./implementations/slides/slides.agent";
import { DocsAgent } from "./implementations/docs/docs.agent";
import { DesignerAgent } from "./implementations/designer/designer.agent";
import { DeveloperAgent } from "./implementations/developer/developer.agent";

// 工具导入 - 全部 48 种工具
import {
  // 1. Information Gathering (6)
  WebSearchTool,
  WebScraperTool,
  DataFetchTool,
  RAGSearchTool,
  DatabaseQueryTool,
  KnowledgeGraphTool,
  // 2. Content Generation (6)
  TextGenerationTool,
  ImageGenerationTool,
  CodeGenerationTool,
  AudioGenerationTool,
  VideoGenerationTool,
  StructuredOutputTool,
  // 3. Data Processing (7)
  DataAnalysisTool,
  FileConversionTool,
  FileParserTool,
  DataValidationTool,
  DataCleaningTool,
  DocumentDiffTool,
  TemplateRenderTool,
  // 4. Code Execution (6)
  PythonExecutorTool,
  JavaScriptExecutorTool,
  SQLExecutorTool,
  ShellExecutorTool,
  ContainerExecutorTool,
  OCRRecognitionTool,
  // 5. External Integration (6)
  MessagePushTool,
  CloudStorageTool,
  GitHubIntegrationTool,
  EmailSenderTool,
  CalendarIntegrationTool,
  WebhookTriggerTool,
  // 6. Memory Management (5)
  ShortTermMemoryTool,
  LongTermMemoryTool,
  EntityMemoryTool,
  KnowledgeBaseTool,
  UserPreferencesTool,
  // 7. Export (4)
  ExportPPTXTool,
  ExportDOCXTool,
  ExportPDFTool,
  ExportImageTool,
  // 8. Agent Collaboration (6)
  AgentHandoffTool,
  HumanApprovalTool,
  AgentCommunicationTool,
  TaskDelegationTool,
  ConsensusMechanismTool,
  WorkflowOrchestrationTool,
} from "./tools";

// 记忆服务导入
import { ShortTermMemoryService, LongTermMemoryService } from "./core/memory";

// 依赖模块
import { AiOfficeModule } from "../ai-office/ai-office.module";
import { AiImageModule } from "../ai-image/ai-image.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { AiStudioModule } from "../ai-studio/ai-studio.module";

@Module({
  imports: [AiOfficeModule, AiImageModule, AiCoreModule, AiStudioModule],
  controllers: [AiAgentsController],
  providers: [
    // 核心服务
    AiAgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,
    LLMAdapterFactory,
    ExecutionMetricsCollector,

    // MCP 服务
    MCPAdapter,
    MCPServer,
    ResourceManager,

    // 验证服务
    SchemaValidator,

    // 记忆服务
    ShortTermMemoryService,
    LongTermMemoryService,

    // Agents
    SlidesAgent,
    DocsAgent,
    DesignerAgent,
    DeveloperAgent,

    // ========================================================================
    // Tools - 全部 48 种工具
    // ========================================================================

    // 1. Information Gathering (6)
    WebSearchTool,
    WebScraperTool,
    DataFetchTool,
    RAGSearchTool,
    DatabaseQueryTool,
    KnowledgeGraphTool,

    // 2. Content Generation (6)
    TextGenerationTool,
    ImageGenerationTool,
    CodeGenerationTool,
    AudioGenerationTool,
    VideoGenerationTool,
    StructuredOutputTool,

    // 3. Data Processing (7)
    DataAnalysisTool,
    FileConversionTool,
    FileParserTool,
    DataValidationTool,
    DataCleaningTool,
    DocumentDiffTool,
    TemplateRenderTool,

    // 4. Code Execution (6)
    PythonExecutorTool,
    JavaScriptExecutorTool,
    SQLExecutorTool,
    ShellExecutorTool,
    ContainerExecutorTool,
    OCRRecognitionTool,

    // 5. External Integration (6)
    MessagePushTool,
    CloudStorageTool,
    GitHubIntegrationTool,
    EmailSenderTool,
    CalendarIntegrationTool,
    WebhookTriggerTool,

    // 6. Memory Management (5)
    ShortTermMemoryTool,
    LongTermMemoryTool,
    EntityMemoryTool,
    KnowledgeBaseTool,
    UserPreferencesTool,

    // 7. Export (4)
    ExportPPTXTool,
    ExportDOCXTool,
    ExportPDFTool,
    ExportImageTool,

    // 8. Agent Collaboration (6)
    AgentHandoffTool,
    HumanApprovalTool,
    AgentCommunicationTool,
    TaskDelegationTool,
    ConsensusMechanismTool,
    WorkflowOrchestrationTool,
  ],
  exports: [
    AiAgentsService,
    AgentRegistry,
    ToolRegistry,
    AgentOrchestrator,
    LLMAdapterFactory,
    ExecutionMetricsCollector,
    // MCP 服务
    MCPAdapter,
    MCPServer,
    ResourceManager,
    // 验证服务
    SchemaValidator,
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
    // Tools - Information Gathering (6)
    private readonly webSearchTool: WebSearchTool,
    private readonly webScraperTool: WebScraperTool,
    private readonly dataFetchTool: DataFetchTool,
    private readonly ragSearchTool: RAGSearchTool,
    private readonly databaseQueryTool: DatabaseQueryTool,
    private readonly knowledgeGraphTool: KnowledgeGraphTool,
    // Tools - Content Generation (6)
    private readonly textGenerationTool: TextGenerationTool,
    private readonly imageGenerationTool: ImageGenerationTool,
    private readonly codeGenerationTool: CodeGenerationTool,
    private readonly audioGenerationTool: AudioGenerationTool,
    private readonly videoGenerationTool: VideoGenerationTool,
    private readonly structuredOutputTool: StructuredOutputTool,
    // Tools - Data Processing (7)
    private readonly dataAnalysisTool: DataAnalysisTool,
    private readonly fileConversionTool: FileConversionTool,
    private readonly fileParserTool: FileParserTool,
    private readonly dataValidationTool: DataValidationTool,
    private readonly dataCleaningTool: DataCleaningTool,
    private readonly documentDiffTool: DocumentDiffTool,
    private readonly templateRenderTool: TemplateRenderTool,
    // Tools - Code Execution (6)
    private readonly pythonExecutorTool: PythonExecutorTool,
    private readonly javaScriptExecutorTool: JavaScriptExecutorTool,
    private readonly sqlExecutorTool: SQLExecutorTool,
    private readonly shellExecutorTool: ShellExecutorTool,
    private readonly containerExecutorTool: ContainerExecutorTool,
    private readonly ocrRecognitionTool: OCRRecognitionTool,
    // Tools - External Integration (6)
    private readonly messagePushTool: MessagePushTool,
    private readonly cloudStorageTool: CloudStorageTool,
    private readonly gitHubIntegrationTool: GitHubIntegrationTool,
    private readonly emailSenderTool: EmailSenderTool,
    private readonly calendarIntegrationTool: CalendarIntegrationTool,
    private readonly webhookTriggerTool: WebhookTriggerTool,
    // Tools - Memory Management (5)
    private readonly shortTermMemoryTool: ShortTermMemoryTool,
    private readonly longTermMemoryTool: LongTermMemoryTool,
    private readonly entityMemoryTool: EntityMemoryTool,
    private readonly knowledgeBaseTool: KnowledgeBaseTool,
    private readonly userPreferencesTool: UserPreferencesTool,
    // Tools - Export (4)
    private readonly exportPPTXTool: ExportPPTXTool,
    private readonly exportDOCXTool: ExportDOCXTool,
    private readonly exportPDFTool: ExportPDFTool,
    private readonly exportImageTool: ExportImageTool,
    // Tools - Agent Collaboration (6)
    private readonly agentHandoffTool: AgentHandoffTool,
    private readonly humanApprovalTool: HumanApprovalTool,
    private readonly agentCommunicationTool: AgentCommunicationTool,
    private readonly taskDelegationTool: TaskDelegationTool,
    private readonly consensusMechanismTool: ConsensusMechanismTool,
    private readonly workflowOrchestrationTool: WorkflowOrchestrationTool,
  ) {}

  onModuleInit() {
    // 注册 Agents
    this.agentRegistry.register(this.slidesAgent);
    this.agentRegistry.register(this.docsAgent);
    this.agentRegistry.register(this.designerAgent);
    this.agentRegistry.register(this.developerAgent);

    // 注册 Tools - 全部 48 种工具
    this.toolRegistry.registerMany([
      // 1. Information Gathering (6)
      this.webSearchTool,
      this.webScraperTool,
      this.dataFetchTool,
      this.ragSearchTool,
      this.databaseQueryTool,
      this.knowledgeGraphTool,
      // 2. Content Generation (6)
      this.textGenerationTool,
      this.imageGenerationTool,
      this.codeGenerationTool,
      this.audioGenerationTool,
      this.videoGenerationTool,
      this.structuredOutputTool,
      // 3. Data Processing (7)
      this.dataAnalysisTool,
      this.fileConversionTool,
      this.fileParserTool,
      this.dataValidationTool,
      this.dataCleaningTool,
      this.documentDiffTool,
      this.templateRenderTool,
      // 4. Code Execution (6)
      this.pythonExecutorTool,
      this.javaScriptExecutorTool,
      this.sqlExecutorTool,
      this.shellExecutorTool,
      this.containerExecutorTool,
      this.ocrRecognitionTool,
      // 5. External Integration (6)
      this.messagePushTool,
      this.cloudStorageTool,
      this.gitHubIntegrationTool,
      this.emailSenderTool,
      this.calendarIntegrationTool,
      this.webhookTriggerTool,
      // 6. Memory Management (5)
      this.shortTermMemoryTool,
      this.longTermMemoryTool,
      this.entityMemoryTool,
      this.knowledgeBaseTool,
      this.userPreferencesTool,
      // 7. Export (4)
      this.exportPPTXTool,
      this.exportDOCXTool,
      this.exportPDFTool,
      this.exportImageTool,
      // 8. Agent Collaboration (6)
      this.agentHandoffTool,
      this.humanApprovalTool,
      this.agentCommunicationTool,
      this.taskDelegationTool,
      this.consensusMechanismTool,
      this.workflowOrchestrationTool,
    ]);
  }
}
