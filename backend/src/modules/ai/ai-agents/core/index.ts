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

// Retry Strategy
export {
  RetryStrategy,
  RetryConfig,
  RetryResult,
  ToolError,
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
  ValidationResult,
} from "./guardrails";
