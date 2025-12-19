/**
 * Agent Core Module - 导出所有核心组件
 */

// Types
export * from "./agent.types";

// Interfaces
export { IAgent, BaseAgent } from "./agent.interface";
export {
  ITool,
  BaseTool,
  JSONSchema,
  ToolContext,
  ToolResult,
  ToolConfig,
  TOOL_CONFIGS,
  FunctionDefinition,
  ToolCallRequest,
} from "./tool.interface";

// Registries
export { AgentRegistry } from "./agent.registry";
export { ToolRegistry } from "./tool.registry";

// Orchestrator
export {
  AgentOrchestrator,
  AutonomousExecutionInput,
} from "./agent.orchestrator";

// LLM Adapters
export {
  ILLMAdapter,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMProvider,
  OpenAIAdapter,
  AnthropicAdapter,
  LLMAdapterFactory,
} from "./llm-adapter";

// Retry Strategy (旧版 ToolError 为 LegacyToolError)
export {
  RetryStrategy,
  RetryConfig,
  RetryResult,
  ToolError as LegacyToolError,
  ToolErrorType,
  WithRetry,
} from "./retry-strategy";

// Function Calling Executor
export {
  FunctionCallingExecutor,
  ExecutionConfig,
  ExecutionMetrics,
} from "./function-calling-executor";

// Execution Metrics
export {
  ExecutionMetricsCollector,
  ToolExecutionRecord,
  ToolStats,
  AgentExecutionRecord,
  SystemMetrics,
  TrackToolExecution,
} from "./execution-metrics";

// Error System (新版细粒度错误分类)
export {
  ToolError,
  ToolErrorCode,
  ToolErrorDetails,
  ToolErrorCodeMeta,
  TOOL_ERROR_CODES,
  isRetryableError,
  getRetryDelay,
  shouldRetry,
} from "./errors";

// Validation System
export {
  SchemaValidator,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
} from "./validation";

// MCP Adapter
export {
  MCPAdapter,
  MCPResource,
  MCPPrompt,
  MCPPromptArgument,
  MCPTool,
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPErrorCode,
  MCPProgress,
  MCPCancellation,
  MCPAdapterOptions,
  ProgressCallback,
} from "./mcp";

// MCP Server
export {
  MCPServer,
  MCPServerInfo,
  MCPServerCapabilities,
  MCPClientInfo,
  MCPServerOptions,
} from "./mcp";

// MCP Transports
export {
  IMCPTransport,
  BaseTransport,
  TransportState,
  TransportEventType,
  TransportEvent,
  TransportOptions,
  TransportStats,
  StdioTransport,
  HttpSseTransport,
  HttpSseTransportOptions,
} from "./mcp";

// MCP Resources
export {
  IResourceProvider,
  BaseResourceProvider,
  ResourceEvent,
  ResourceEventType,
  ResourceFilter,
  ResourceContent,
  FileResourceProvider,
  FileResourceProviderOptions,
  ResourceManager,
  ResourceManagerOptions,
} from "./mcp";

// Guardrails
export {
  GuardrailService,
  GuardrailConfig,
  GuardrailResult,
  ContentFilterConfig,
  ContentCategory,
  OutputValidationConfig,
  RateLimitConfig,
  RateLimitStrategy,
  CostControlConfig,
  PrivacyConfig,
  SensitiveInfoType,
  ViolationType,
  ValidationResult as GuardrailValidationResult,
} from "./guardrails";
