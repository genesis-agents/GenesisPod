/**
 * AI Agent Tools - 工具导出
 * 统一导出所有工具实现
 */

// ============================================================================
// 1. Information Gathering Tools (信息获取)
// ============================================================================
export {
  WebSearchTool,
  WebScraperTool,
  DataFetchTool,
  RAGSearchTool,
  DatabaseQueryTool,
  KnowledgeGraphTool,
} from "./information";

export type {
  WebSearchInput,
  WebSearchOutput,
  WebScraperInput,
  WebScraperOutput,
  DataFetchInput,
  DataFetchOutput,
  RAGSearchInput,
  RAGSearchResultItem,
  RAGSearchOutput,
  DatabaseQueryInput,
  ColumnInfo,
  DatabaseQueryOutput,
  QueryType,
  KnowledgeGraphInput,
  GraphNode,
  GraphEdge,
  GraphPath,
  KnowledgeGraphOutput,
} from "./information";

// ============================================================================
// 2. Content Generation Tools (内容生成)
// ============================================================================
export {
  TextGenerationTool,
  ImageGenerationTool,
  CodeGenerationTool,
  AudioGenerationTool,
  VideoGenerationTool,
  StructuredOutputTool,
} from "./generation";

export type {
  TextGenerationInput,
  TextGenerationOutput,
  ImageGenerationInput,
  ImageGenerationOutput,
  CodeGenerationInput,
  CodeGenerationOutput,
  AudioGenerationInput,
  AudioGenerationOutput,
  VideoSourceType,
  VideoResolution,
  VideoStyle,
  VideoEditOperation,
  VideoGenerationInput,
  VideoGenerationOutput,
  StructuredOutputInput,
  StructuredOutputOutput,
} from "./generation";

// ============================================================================
// 3. Data Processing Tools (数据处理)
// ============================================================================
export {
  DataAnalysisTool,
  FileConversionTool,
  FileParserTool,
  DataValidationTool,
  DataCleaningTool,
  DocumentDiffTool,
  TemplateRenderTool,
} from "./processing";

export type {
  DataAnalysisInput,
  DataAnalysisOutput,
  SourceFormat,
  TargetFormat,
  FileConversionInput,
  FileConversionOutput,
  FileParserInput,
  FileParserOutput,
  ValidationRule,
  DataValidationInput,
  ValidationError,
  DataValidationOutput,
  CleaningRule,
  DataCleaningInput,
  CleaningStatistics,
  DataCleaningOutput,
  DocumentDiffInput,
  DiffChange,
  DiffStatistics,
  DocumentDiffOutput,
  TemplateRenderInput,
  TemplateRenderOutput,
} from "./processing";

// ============================================================================
// 4. Code Execution Tools (代码执行)
// ============================================================================
export {
  PythonExecutorTool,
  JavaScriptExecutorTool,
  SQLExecutorTool,
  ShellExecutorTool,
  ContainerExecutorTool,
  OCRRecognitionTool,
} from "./execution";

export type {
  PythonExecutorInput,
  PythonExecutorOutput,
  JavaScriptExecutorInput,
  JavaScriptExecutorOutput,
  SQLExecutorInput,
  SQLExecutorOutput,
  ShellExecutorInput,
  ShellExecutorOutput,
  SupportedLanguage,
  LanguageRuntime,
  ResourceUsage,
  ContainerExecutorInput,
  ContainerExecutorOutput,
  OCRRecognitionInput,
  OCRRecognitionOutput,
} from "./execution";

// ============================================================================
// 5. External Integration Tools (外部集成)
// ============================================================================
export {
  MessagePushTool,
  CloudStorageTool,
  GitHubIntegrationTool,
  EmailSenderTool,
  CalendarIntegrationTool,
  WebhookTriggerTool,
} from "./integration";

export type {
  MessagePushInput,
  MessagePushOutput,
  MessagePlatform,
  MessageFormat,
  MessageAttachment,
  SlackConfig,
  DiscordConfig,
  EmailConfig,
  WebhookConfig,
  DeliveryStatus,
  CloudStorageInput,
  CloudStorageOutput,
  StorageProvider,
  StorageOperation,
  FilePermission,
  S3Config,
  GCSConfig,
  AzureConfig,
  MinIOConfig,
  UploadFileInfo,
  ListOptions,
  FileObject,
  GitHubIntegrationInput,
  GitHubIntegrationOutput,
  GitHubOperation,
  EmailSenderInput,
  EmailSenderOutput,
  EmailAttachment,
  CalendarIntegrationInput,
  CalendarIntegrationOutput,
  CalendarOperation,
  CalendarProvider,
  CalendarEvent,
  CalendarEventAttendee,
  WebhookTriggerInput,
  WebhookTriggerOutput,
  HttpMethod,
} from "./integration";

// ============================================================================
// 6. Memory Tools (记忆管理)
// ============================================================================
export {
  ShortTermMemoryTool,
  LongTermMemoryTool,
  EntityMemoryTool,
  KnowledgeBaseTool,
  UserPreferencesTool,
} from "./memory";

export type {
  MemoryOperation,
  ShortTermMemoryInput,
  ShortTermMemoryOutput,
  LongTermMemoryOperation,
  LongTermMemoryInput,
  LongTermMemoryOutput,
  EntityType,
  RelationType,
  Entity,
  EntityRelation,
  EntityOperation,
  EntityMemoryInput,
  EntityMemoryOutput,
  KnowledgeEntry,
  KnowledgeOperation,
  KnowledgeBaseInput,
  KnowledgeBaseOutput,
  PreferenceOperation,
  UserPreferencesInput,
  UserPreferencesOutput,
} from "./memory";

// ============================================================================
// 7. Export Tools (导出)
// ============================================================================
export {
  ExportPPTXTool,
  ExportDOCXTool,
  ExportPDFTool,
  ExportImageTool,
} from "./export";

export type {
  ExportPPTXInput,
  ExportPPTXOutput,
  ExportDOCXInput,
  ExportDOCXOutput,
  ExportPDFInput,
  ExportPDFOutput,
  ExportImageInput,
  ExportImageOutput,
} from "./export";

// ============================================================================
// 8. Agent Collaboration Tools (Agent 协作)
// ============================================================================
export {
  AgentHandoffTool,
  HumanApprovalTool,
  AgentCommunicationTool,
  TaskDelegationTool,
  ConsensusMechanismTool,
  WorkflowOrchestrationTool,
} from "./collaboration";

export type {
  TaskDefinition,
  HandoffOptions,
  AgentHandoffInput,
  HandoffStatus,
  AgentHandoffOutput,
  ApprovalType,
  ChoiceOption,
  ApprovalContext,
  ApprovalOptions,
  HumanApprovalInput,
  ApprovalResponse,
  HumanApprovalOutput,
  MessageType,
  MessagePriority,
  MessageStatus,
  Message,
  CommunicationOperation,
  AgentCommunicationInput,
  AgentCommunicationOutput,
  DelegationStatus,
  TaskPriority,
  DelegatedTask,
  TaskDelegationInput,
  TaskDelegationOutput,
  ConsensusStrategy,
  VoteValue,
  Voter,
  Vote,
  ConsensusProposal,
  ConsensusMechanismInput,
  ConsensusMechanismOutput,
  WorkflowStatus,
  StepStatus,
  ExecutionMode,
  WorkflowStep,
  Workflow,
  WorkflowOrchestrationInput,
  WorkflowOrchestrationOutput,
} from "./collaboration";
