/**
 * AI Agent Tools - 工具导出
 * 统一导出所有工具实现
 */

// ============================================================================
// 1. Information Gathering Tools (信息获取)
// ============================================================================
export { WebSearchTool } from "./web-search.tool";
export { WebScraperTool } from "./web-scraper.tool";
export { DataFetchTool } from "./data-fetch.tool";
export { RAGSearchTool } from "./information/rag-search.tool";
export { DatabaseQueryTool } from "./information/database-query.tool";
export { KnowledgeGraphTool } from "./information/knowledge-graph.tool";

// ============================================================================
// 2. Content Generation Tools (内容生成)
// ============================================================================
export { TextGenerationTool } from "./text-generation.tool";
export { ImageGenerationTool } from "./image-generation.tool";
export { CodeGenerationTool } from "./code-generation.tool";
export { AudioGenerationTool } from "./generation/audio-generation.tool";
export { VideoGenerationTool } from "./generation/video-generation.tool";
export { StructuredOutputTool } from "./generation/structured-output.tool";

// ============================================================================
// 3. Data Processing Tools (数据处理)
// ============================================================================
export { DataAnalysisTool } from "./data-analysis.tool";
export { FileConversionTool } from "./file-conversion.tool";
export { FileParserTool } from "./processing/file-parser.tool";
export { DataValidationTool } from "./processing/data-validation.tool";
export { DataCleaningTool } from "./processing/data-cleaning.tool";
export { DocumentDiffTool } from "./processing/document-diff.tool";
export { TemplateRenderTool } from "./processing/template-render.tool";

// ============================================================================
// 4. Code Execution Tools (代码执行)
// ============================================================================
export { PythonExecutorTool } from "./execution/python-executor.tool";
export { JavaScriptExecutorTool } from "./execution/javascript-executor.tool";
export { SQLExecutorTool } from "./execution/sql-executor.tool";
export { ShellExecutorTool } from "./execution/shell-executor.tool";
export { ContainerExecutorTool } from "./execution/container-executor.tool";
export { OCRRecognitionTool } from "./execution/ocr-recognition.tool";

// ============================================================================
// 5. External Integration Tools (外部集成)
// ============================================================================
export { MessagePushTool } from "./integration/message-push.tool";
export { CloudStorageTool } from "./integration/cloud-storage.tool";
export { GitHubIntegrationTool } from "./integration/github-integration.tool";
export { EmailSenderTool } from "./integration/email-sender.tool";
export { CalendarIntegrationTool } from "./integration/calendar-integration.tool";
export { WebhookTriggerTool } from "./integration/webhook-trigger.tool";

// ============================================================================
// 6. Memory Tools (记忆管理)
// ============================================================================
export { ShortTermMemoryTool } from "./memory/short-term-memory.tool";
export { LongTermMemoryTool } from "./memory/long-term-memory.tool";
export { EntityMemoryTool } from "./memory/entity-memory.tool";
export { KnowledgeBaseTool } from "./memory/knowledge-base.tool";
export { UserPreferencesTool } from "./memory/user-preferences.tool";

// ============================================================================
// 7. Export Tools (导出)
// ============================================================================
export { ExportPPTXTool } from "./export-pptx.tool";
export { ExportDOCXTool } from "./export-docx.tool";
export { ExportPDFTool } from "./export-pdf.tool";
export { ExportImageTool } from "./export-image.tool";

// ============================================================================
// 8. Agent Collaboration Tools (Agent 协作)
// ============================================================================
export { AgentHandoffTool } from "./collaboration/agent-handoff.tool";
export { HumanApprovalTool } from "./collaboration/human-approval.tool";
export { AgentCommunicationTool } from "./collaboration/agent-communication.tool";
export { TaskDelegationTool } from "./collaboration/task-delegation.tool";
export { ConsensusMechanismTool } from "./collaboration/consensus-mechanism.tool";
export { WorkflowOrchestrationTool } from "./collaboration/workflow-orchestration.tool";

// ============================================================================
// Re-export from subdirectories
// ============================================================================
export * from "./information";
export * from "./generation";
export * from "./processing";
export * from "./execution";
export * from "./integration";
export * from "./memory";
export * from "./collaboration";
