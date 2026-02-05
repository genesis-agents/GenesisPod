/**
 * MCP Server - Interface Definitions
 * Raven 作为 MCP Server 对外暴露能力的接口定义
 */

/**
 * JSON-RPC 2.0 请求
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 响应
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Server 暴露的工具定义
 */
export interface ExposedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Server 工具处理器接口
 */
export interface IMCPToolHandler {
  readonly toolName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse>;
}

/**
 * MCP 请求上下文
 */
export interface MCPRequestContext {
  apiKeyId: string;
  sessionId?: string;
  clientInfo?: { name: string; version: string };
}

/**
 * MCP 工具响应
 */
export interface MCPToolResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * JSON-RPC 2.0 错误码
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
} as const;
