# MCP (Model Context Protocol) 适配层

MCP 协议适配层将 DeepDive 工具系统适配到标准的 Model Context Protocol，实现与各种 AI 开发工具和框架的互操作性。

## 概述

MCP 是一个开放协议，用于 AI 应用与外部工具、数据源和服务之间的通信。通过实现 MCP，DeepDive 可以：

- 与支持 MCP 的 AI 框架集成（如 Claude Desktop、LangChain 等）
- 提供标准化的工具调用接口
- 支持资源管理和提示模板
- 实现进度报告和取消机制

## 核心概念

### 1. Tools (工具)

工具是可调用的功能，对应 DeepDive 的 `ITool` 接口：

```typescript
interface MCPTool {
  name: string;              // 工具名称（如 "web_search"）
  description: string;       // 工具描述
  inputSchema: JSONSchema;   // 输入参数 Schema
  outputSchema?: JSONSchema; // 输出结果 Schema（可选）
  category?: string;         // 工具类别（可选）
}
```

### 2. Resources (资源)

资源代表可访问的数据或内容：

```typescript
interface MCPResource {
  uri: string;         // 资源 URI（如 "file:///path/to/file.pdf"）
  name: string;        // 资源名称
  description?: string; // 资源描述
  mimeType?: string;   // MIME 类型
  size?: number;       // 资源大小（字节）
  metadata?: Record<string, unknown>; // 元数据
}
```

### 3. Prompts (提示模板)

预定义的可重用提示：

```typescript
interface MCPPrompt {
  name: string;                    // 提示名称
  description?: string;            // 提示描述
  arguments?: MCPPromptArgument[]; // 参数列表
  template?: string;               // 提示内容模板
}
```

### 4. Progress (进度报告)

支持长时间运行任务的进度报告：

```typescript
interface MCPProgress {
  token: string;    // 进度令牌
  progress: number; // 进度百分比 (0-100)
  total?: number;   // 总数（可选）
  message?: string; // 进度消息
}
```

## 使用示例

### 基础使用

```typescript
import { MCPAdapter } from '@/modules/ai/ai-agents/core/mcp';
import { ToolRegistry } from '@/modules/ai/ai-agents/core/tool.registry';

// 初始化适配器
const toolRegistry = new ToolRegistry();
const mcpAdapter = new MCPAdapter(toolRegistry);

// 列出可用工具
const tools = mcpAdapter.listTools();
console.log('Available tools:', tools);

// 调用工具
const response = await mcpAdapter.callTool('web_search', {
  query: 'AI news 2024',
  limit: 10
});

if (response.error) {
  console.error('Tool execution failed:', response.error.message);
} else {
  console.log('Tool result:', response.result);
}
```

### 资源管理

```typescript
// 注册资源
mcpAdapter.registerResource({
  uri: 'file:///workspace/docs/report.pdf',
  name: '项目报告',
  description: '2024年Q4项目总结报告',
  mimeType: 'application/pdf',
  size: 1024000
});

// 列出所有资源
const resources = mcpAdapter.listResources();

// 读取资源
const response = await mcpAdapter.readResource('file:///workspace/docs/report.pdf');
if (response.result) {
  console.log('Resource:', response.result);
}
```

### 提示模板

```typescript
// 注册提示模板
mcpAdapter.registerPrompt({
  name: 'analyze_data',
  description: '分析数据集并生成报告',
  arguments: [
    { name: 'dataUrl', description: '数据集 URL', required: true },
    { name: 'format', description: '报告格式', required: false, default: 'markdown' }
  ],
  template: '请分析以下数据集：{{dataUrl}}\n生成{{format}}格式的分析报告。'
});

// 获取提示模板
const prompt = mcpAdapter.getPrompt('analyze_data');

// 渲染提示
const rendered = mcpAdapter.renderPrompt('analyze_data', {
  dataUrl: 'https://example.com/data.csv',
  format: 'html'
});
console.log('Rendered prompt:', rendered);
```

### 进度报告

```typescript
// 注册进度回调
const progressToken = 'task_123';
mcpAdapter.onProgress(progressToken, (progress) => {
  console.log(`Progress: ${progress.progress}% - ${progress.message}`);
});

// 在工具执行中报告进度
async function longRunningTask() {
  mcpAdapter.reportProgress(progressToken, 25, 'Fetching data...');
  await fetchData();

  mcpAdapter.reportProgress(progressToken, 50, 'Processing data...');
  await processData();

  mcpAdapter.reportProgress(progressToken, 75, 'Generating report...');
  await generateReport();

  mcpAdapter.reportProgress(progressToken, 100, 'Complete!');
}
```

### 取消执行

```typescript
// 执行工具
const context = { taskId: 'task_123' };
const executionPromise = mcpAdapter.callTool('web_search', { query: 'test' }, context);

// 稍后取消执行
setTimeout(() => {
  const cancelled = mcpAdapter.cancelExecution('task_123', 'User cancelled');
  console.log('Cancelled:', cancelled);
}, 5000);

// 处理结果
const response = await executionPromise;
if (response.error?.code === MCPErrorCode.CANCELLED) {
  console.log('Execution was cancelled');
}
```

### 通用请求处理

```typescript
// 处理 MCP 请求
const request: MCPRequest = {
  id: 1,
  method: 'tools/list'
};

const response = await mcpAdapter.handleRequest(request);
console.log('Response:', response);

// 调用工具
const toolCallRequest: MCPRequest = {
  id: 2,
  method: 'tools/call',
  params: {
    name: 'web_search',
    arguments: { query: 'test' }
  }
};

const toolResponse = await mcpAdapter.handleRequest(toolCallRequest);
```

## 错误处理

MCP 使用标准错误代码：

```typescript
enum MCPErrorCode {
  PARSE_ERROR = -32700,           // 解析错误
  INVALID_REQUEST = -32600,       // 无效请求
  METHOD_NOT_FOUND = -32601,      // 方法不存在
  INVALID_PARAMS = -32602,        // 无效参数
  INTERNAL_ERROR = -32603,        // 内部错误
  TOOL_NOT_FOUND = -32001,        // 工具不存在
  TOOL_EXECUTION_ERROR = -32002,  // 工具执行错误
  RESOURCE_NOT_FOUND = -32003,    // 资源不存在
  CANCELLED = -32004              // 已取消
}
```

错误响应示例：

```typescript
{
  error: {
    code: MCPErrorCode.TOOL_NOT_FOUND,
    message: "Tool 'unknown_tool' not found",
    data: { /* 可选的额外信息 */ }
  }
}
```

## 与现有系统集成

### 工具注册

MCP 适配器自动从 `ToolRegistry` 获取已注册的工具：

```typescript
// 注册工具（现有方式）
toolRegistry.register(new WebSearchTool());
toolRegistry.register(new WebScraperTool());

// MCP 自动识别
const mcpTools = mcpAdapter.listTools();
// 返回所有已注册工具的 MCP 格式
```

### Function Calling 兼容

MCP 工具定义与 OpenAI Function Calling 格式兼容：

```typescript
// DeepDive 工具
class WebSearchTool extends BaseTool {
  toFunctionDefinition(): FunctionDefinition {
    return {
      name: this.type,
      description: this.description,
      parameters: this.inputSchema
    };
  }
}

// MCP 格式（自动转换）
const mcpTool: MCPTool = {
  name: tool.type,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema
};
```

## 配置选项

```typescript
interface MCPAdapterOptions {
  enableResources?: boolean;      // 启用资源管理（默认 true）
  enablePrompts?: boolean;        // 启用提示模板（默认 true）
  enableProgress?: boolean;       // 启用进度报告（默认 true）
  enableCancellation?: boolean;   // 启用取消机制（默认 true）
}
```

## 统计信息

获取适配器统计：

```typescript
const stats = mcpAdapter.getStats();
console.log(stats);
// {
//   tools: 15,
//   resources: 5,
//   prompts: 3,
//   activeExecutions: 2,
//   activeProgressCallbacks: 1
// }
```

## 最佳实践

### 1. 资源 URI 规范

使用标准 URI 格式：

```typescript
// 文件资源
uri: 'file:///path/to/file.pdf'

// HTTP 资源
uri: 'https://example.com/api/data'

// 数据库资源
uri: 'postgres://localhost:5432/mydb/table'

// 自定义 Schema
uri: 'deepdive://workspace/123/document/456'
```

### 2. 提示模板变量

使用双花括号语法：

```typescript
template: '请分析 {{dataType}} 类型的数据，生成 {{format}} 格式的报告。'
```

### 3. 进度粒度

合理设置进度报告粒度：

```typescript
// 推荐：主要阶段
reportProgress(token, 0, '开始任务');
reportProgress(token, 25, '数据获取完成');
reportProgress(token, 50, '数据处理完成');
reportProgress(token, 75, '报告生成完成');
reportProgress(token, 100, '任务完成');

// 不推荐：过于频繁
for (let i = 0; i <= 100; i++) {
  reportProgress(token, i, `处理中 ${i}%`);
}
```

### 4. 错误处理

始终检查响应中的错误：

```typescript
const response = await mcpAdapter.callTool('web_search', args);

if (response.error) {
  switch (response.error.code) {
    case MCPErrorCode.TOOL_NOT_FOUND:
      // 处理工具不存在
      break;
    case MCPErrorCode.TOOL_EXECUTION_ERROR:
      // 处理执行错误
      break;
    case MCPErrorCode.CANCELLED:
      // 处理取消
      break;
    default:
      // 其他错误
  }
} else {
  // 处理成功结果
  const result = response.result;
}
```

## 测试

### 单元测试示例

```typescript
import { Test } from '@nestjs/testing';
import { MCPAdapter } from './mcp-adapter';
import { ToolRegistry } from '../tool.registry';

describe('MCPAdapter', () => {
  let adapter: MCPAdapter;
  let registry: ToolRegistry;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MCPAdapter, ToolRegistry],
    }).compile();

    adapter = module.get<MCPAdapter>(MCPAdapter);
    registry = module.get<ToolRegistry>(ToolRegistry);
  });

  it('should list tools', () => {
    const tools = adapter.listTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should handle tool not found', async () => {
    const response = await adapter.callTool('nonexistent_tool', {});
    expect(response.error?.code).toBe(MCPErrorCode.TOOL_NOT_FOUND);
  });

  it('should register and list resources', () => {
    adapter.registerResource({
      uri: 'file:///test.pdf',
      name: 'Test File'
    });

    const resources = adapter.listResources();
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('file:///test.pdf');
  });
});
```

## 参考资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP GitHub 仓库](https://github.com/modelcontextprotocol)
- [DeepDive 工具接口文档](../tool.interface.ts)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)

## 版本历史

- **v1.0.0** (2024-12): 初始版本
  - 实现核心 MCP 协议
  - 支持工具调用
  - 支持资源管理
  - 支持提示模板
  - 支持进度报告和取消机制

## 许可证

MIT License
