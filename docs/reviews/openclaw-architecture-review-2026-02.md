# OpenClaw 架构对标审查 - Raven MCP Server 改进方案

> **审查范围**: 对标 OpenClaw 架构，审视 Raven AI Engine 对外能力开放（MCP Server）的架构差距与改进路径
> **日期**: 2026-02-10

---

## 1. 架构对比总览

### 1.1 OpenClaw 四层架构

```
┌─────────────────────────────────────────────────────┐
│  Interfaces (Web Admin UI, CLI, WebSocket)          │
├─────────────────────────────────────────────────────┤
│  Gateway Daemon (WebSocket Server, Port 18789)      │
│  - 消息路由、Session 管理、Agent 协调              │
│  - Channel 插件（WhatsApp/Slack/Discord/iMessage）  │
├─────────────────────────────────────────────────────┤
│  Agent Runtime (推理循环 + 工具执行)                │
│  - Pi Agent Core 封装                               │
│  - Session 状态、Memory、Context Window             │
│  - 三种执行上下文: Sandbox/Host/Node               │
├─────────────────────────────────────────────────────┤
│  Skills / Plugin System                             │
│  - Skills: SKILL.md 声明式扩展（注入 System Prompt）│
│  - Plugins: 代码级扩展（Channel/Provider/Active）   │
│  - MCP Adapter: 外部 MCP Server → 原生 Tool        │
│  - Tool Policy: 分层权限过滤                        │
└─────────────────────────────────────────────────────┘
```

**核心设计理念**: Gateway 是消息路由器，Agent Runtime 是执行引擎，Skills 是声明式知识注入，Plugins 是代码级能力扩展。MCP 是一等公民，外部 MCP 工具自动桥接为原生 Tool。

### 1.2 Raven AI Engine 现有架构

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Next.js 14)                               │
│  MCP Clients (Claude Code, Cursor 等外部 AI 工具)    │
├──────────────────────────────────────────────────────┤
│  REST API + MCP Server (JSON-RPC 2.0)                │
│  - NestJS Controllers                                │
│  - 5 个手写 MCP Tool Handler                         │
├──────────────────────────────────────────────────────┤
│  AIEngineFacade (统一入口)                           │
│  - Feature-Based DI (6 个特性模块)                   │
│  - AICapabilityResolver (运行时能力发现)             │
├──────────────────────────────────────────────────────┤
│  AI Engine Core (29 个子系统)                        │
│  - ToolRegistry (50+ 内置工具)                       │
│  - SkillRegistry (TypeScript 类)                     │
│  - AgentRegistry + TeamRegistry                      │
│  - LLM Factory + Orchestration + Memory              │
│  - MCPManager (作为 MCP Client 消费外部工具)         │
├──────────────────────────────────────────────────────┤
│  AI App Layer (12+ 应用模块)                         │
│  - Research, Teams, Writing, Office, Ask...          │
│  - 通过 onModuleInit() 注册 Agent/Team              │
└──────────────────────────────────────────────────────┘
```

**核心设计理念**: Facade 统一入口，Registry 动态注册，Feature-Based DI 分组注入，单向依赖 (App → Engine)。

---

## 2. Raven 的架构优势（相对于 OpenClaw）

在开始讨论差距之前，需要明确 Raven 已有的架构优势：

| 维度 | Raven | OpenClaw |
|------|-------|----------|
| **Facade 统一入口** | AIEngineFacade 严格管控所有能力访问 | 无统一 Facade，工具直接注入 Agent |
| **能力上下文解析** | AICapabilityResolver 根据 Agent/Team/Role/Domain 动态解析 | Tool Policy 较简单（全局 → Agent → Sandbox） |
| **计费集成** | Credits + BillingContext 贯穿执行链路 | 无内置计费 |
| **Guardrails** | 输入/输出双向安全管道 | 依赖外部安全工具 |
| **团队协作** | TeamRegistry + Mission 机制成熟 | 多 Agent 是隔离的，无协作机制 |
| **编排引擎** | 断路器 + 状态机 + Checkpoint | 简单的推理循环 |
| **模型抽象** | LLMFactory + TaskProfile + ModelFallback | 直接调 Provider API |

**结论**: Raven 的核心引擎在企业级能力（计费、安全、编排、协作）上远强于 OpenClaw。差距主要在**对外能力开放的架构设计**上。

---

## 3. 关键架构差距

### 3.1 MCP Server 仅暴露 5 个硬编码工具

**现状** (`mcp-server/mcp-server.module.ts:45-52`):
```typescript
onModuleInit() {
  this.mcpServerService.registerToolHandler(this.researchToolHandler);
  this.mcpServerService.registerToolHandler(this.askToolHandler);
  this.mcpServerService.registerToolHandler(this.teamsDebateToolHandler);
  this.mcpServerService.registerToolHandler(this.contentAnalysisToolHandler);
  this.mcpServerService.registerToolHandler(this.writingAssistToolHandler);
}
```

**问题**: AI Engine 内部有 50+ 注册工具、多个 Skill、多个 Agent，但 MCP Server 只暴露了 5 个手写 Handler。每增加一个能力都需要手写一个新的 Tool Handler 类。

**OpenClaw 做法**: MCP Adapter 自动发现外部 MCP Server 的工具并注册为原生 Tool。反过来，OpenClaw 的所有 Tool 也自动通过 `tools/list` 暴露。

**改进方向**: 从 Registry 自动生成 MCP Tool 定义，而非手写 Handler。

### 3.2 无动态能力发现协议

**现状**: `handleToolsList()` 返回的是硬编码注册的 5 个 Handler 列表。

**问题**: 外部 AI 工具（如 Claude Code）调用 `tools/list` 只能看到 5 个工具，无法发现 Engine 内部的 50+ 工具、Skills、Agents。

**OpenClaw 做法**: 所有注册的 Tool 自动出现在 `tools/list` 响应中。技能通过 `skill/list` 发现。

**改进方向**: `tools/list` 应从 ToolRegistry + SkillRegistry + AgentRegistry 动态聚合。

### 3.3 缺少 MCP Resources / Prompts 原语

**现状**: MCP Server 只实现了 `tools/list` 和 `tools/call`。

**问题**: MCP 协议定义了三类原语:
- **Tools**: 可执行的操作 (已实现)
- **Resources**: 可读取的数据源 (未实现)
- **Prompts**: 可复用的提示模板 (未实现)

Raven 有丰富的知识库（Library/Resources）和 Skill Prompt 模板，但未通过 MCP 暴露。

**OpenClaw 做法**: MCP Client 支持 `listResources`、`readResource`、`listPrompts`、`getPrompt`。

**改进方向**: 将 Library/RAG 暴露为 MCP Resources，将 SkillPromptBuilder 暴露为 MCP Prompts。

### 3.4 SSE/Streaming 仅有 Keepalive

**现状** (`mcp-server.controller.ts:94-114`):
```typescript
@Get()
async sseStream(@Headers("mcp-session-id") _sessionId, @Res() res) {
  res.setHeader("Content-Type", "text/event-stream");
  // ... 只有 keepalive，无实际事件推送
}
```

**问题**: Deep Research（最多 8 轮迭代）、Team Debate（多轮辩论）等长时间任务无法推送进度。外部 AI 工具只能轮询或等待超时。

**改进方向**: 将 RealtimeFeature (EngineEventEmitter + ProgressTracker) 接入 SSE 端点，推送任务进度事件。

### 3.5 Session 管理过于简单

**现状**: Session 仅是一个 LRU Map 条目（clientInfo + createdAt），无状态、无隔离。

**OpenClaw 做法**:
- 每个 Session 有独立 Workspace
- Session 内有 Skill Snapshot 缓存
- Session 级别的工具权限隔离
- Session 生命周期管理（创建、暂停、恢复、终止）

**改进方向**: Session 应关联用户上下文、权限策略、Memory Scope、执行历史。

### 3.6 缺少外部扩展机制

**现状**: 所有能力都是 NestJS 模块，无法由外部开发者扩展。

**OpenClaw 做法**:
- **Skills**: SKILL.md 声明式扩展，从文件系统自动发现
- **Plugins**: Plugin SDK，代码级扩展（Channel/Provider）
- **ClawHub**: 社区技能市场（5700+ Skills）

**改进方向**: 考虑支持声明式 Skill 格式（SKILL.md 或类似），允许通过 MCP 协议动态注册外部工具。

### 3.7 无执行隔离 / 沙箱

**现状**: 所有 MCP 工具调用在同一个 NestJS 进程中执行，无隔离。

**OpenClaw 做法**: Docker 沙箱隔离，工具在容器内执行。三种执行上下文：
- **Sandbox**: Docker 容器（安全隔离）
- **Host**: Gateway 进程（本地执行）
- **Node**: 远程设备（跨设备执行）

**改进方向**: 对外开放时需要执行隔离，至少需要进程级隔离 + 资源限制。

---

## 4. 改进方案

### Phase 1: Dynamic MCP Tool Bridge（动态工具桥接）

**目标**: MCP Server 自动暴露 Registry 中的所有能力，无需手写 Handler。

**架构变更**:

```
现有:
  MCPServerModule → 5 个 HandWritten ToolHandler → AIEngineFacade

改进:
  MCPServerModule → MCPToolBridge → ToolRegistry    (自动桥接所有 Tool)
                                  → SkillRegistry   (Skill 作为 Tool 暴露)
                                  → AgentRegistry   (Agent 作为复合 Tool 暴露)
```

**关键设计**:

```typescript
// 新增: MCP Tool Bridge Service
@Injectable()
export class MCPToolBridgeService implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly skillRegistry: SkillRegistry,
    private readonly agentRegistry: AgentRegistry,
    private readonly facade: AIEngineFacade,
  ) {}

  onModuleInit() {
    // 从 Registry 自动生成 MCP Tool 定义
  }

  /**
   * 动态聚合所有 Registry 中的工具
   * 返回 MCP tools/list 格式
   */
  listTools(context: MCPRequestContext): ExposedTool[] {
    const tools: ExposedTool[] = [];

    // 1. ToolRegistry 中的工具 → 直接映射
    for (const tool of this.toolRegistry.getAll()) {
      if (!tool.enabled) continue;
      tools.push({
        name: `tool_${tool.id}`,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }

    // 2. SkillRegistry 中的技能 → 作为高级工具暴露
    for (const skill of this.skillRegistry.getAll()) {
      tools.push({
        name: `skill_${skill.id}`,
        description: `[Skill] ${skill.description}`,
        inputSchema: skill.inputSchema || this.buildDefaultSkillSchema(skill),
      });
    }

    // 3. AgentRegistry 中的 Agent → 作为复合工具暴露
    for (const agent of this.agentRegistry.getAll()) {
      tools.push({
        name: `agent_${agent.id}`,
        description: `[Agent] ${agent.description}`,
        inputSchema: this.buildAgentSchema(agent),
      });
    }

    return tools;
  }

  /**
   * 统一执行路由
   */
  async callTool(name: string, args: Record<string, unknown>, context: MCPRequestContext) {
    if (name.startsWith('tool_'))  return this.executeTool(name.slice(5), args, context);
    if (name.startsWith('skill_')) return this.executeSkill(name.slice(6), args, context);
    if (name.startsWith('agent_')) return this.executeAgent(name.slice(6), args, context);
    // 兼容: 保留原有的高级 Tool Handler
    return this.executeLegacyHandler(name, args, context);
  }
}
```

**兼容策略**: 保留现有 5 个高级 Tool Handler 作为 "curated tools"（精选工具），同时新增动态桥接。MCP `tools/list` 返回两者的并集。

### Phase 2: Capability Gateway（能力网关层）

**目标**: 在 MCP Server 和 AI Engine 之间增加一个能力网关层，统一管理权限、配额、审计。

```
                     ┌─────────────────────────────┐
                     │    Capability Gateway        │
External Consumers → │  - Permission Policy Engine  │ → AIEngineFacade
(MCP / REST / WS)    │  - Rate Limiter (per key)    │
                     │  - Audit Logger              │
                     │  - Streaming Bridge          │
                     │  - Session Context Manager   │
                     └─────────────────────────────┘
```

**核心组件**:

1. **Permission Policy Engine** - 基于 API Key 的分级权限
   ```typescript
   interface MCPPermissionPolicy {
     apiKeyId: string;
     allowedTools: string[] | '*';      // 允许的工具
     allowedSkills: string[] | '*';     // 允许的技能
     allowedAgents: string[] | '*';     // 允许的 Agent
     maxConcurrency: number;            // 最大并发
     dailyQuota: number;               // 每日配额
     allowStreaming: boolean;           // 是否允许流式
     allowResources: boolean;          // 是否允许读取资源
   }
   ```

2. **Streaming Bridge** - 将 RealtimeFeature 事件桥接到 SSE
   ```typescript
   // 长任务执行时推送进度
   eventEmitter.on('progress', (event) => {
     sseResponse.write(`data: ${JSON.stringify(event)}\n\n`);
   });
   ```

3. **Session Context Manager** - 关联 Session 到用户上下文
   ```typescript
   interface MCPSession {
     sessionId: string;
     apiKeyId: string;
     clientInfo: { name: string; version: string };
     permissionPolicy: MCPPermissionPolicy;
     memoryScope: string;              // Session 级 Memory 隔离
     executionHistory: ToolCallRecord[];
     createdAt: Date;
     lastActiveAt: Date;
   }
   ```

### Phase 3: MCP Resources & Prompts（资源与提示原语）

**目标**: 暴露知识库和提示模板，让外部 AI 工具能读取 Raven 的数据。

**Resources（暴露知识库）**:
```typescript
// resources/list → 从 Library/RAG 模块聚合
{
  resources: [
    {
      uri: "raven://library/{resourceId}",
      name: "用户文档库",
      mimeType: "text/markdown",
    },
    {
      uri: "raven://rag/{collectionId}",
      name: "RAG 知识库",
      mimeType: "application/json",
    }
  ]
}
```

**Prompts（暴露提示模板）**:
```typescript
// prompts/list → 从 SkillPromptBuilder 聚合
{
  prompts: [
    {
      name: "research-report",
      description: "深度研究报告模板",
      arguments: [
        { name: "topic", description: "研究主题", required: true },
        { name: "depth", description: "深度: quick/standard/deep" },
      ],
    },
    {
      name: "content-analysis",
      description: "多维度内容分析模板",
      arguments: [
        { name: "content", required: true },
        { name: "analysisType", description: "分析类型" },
      ],
    }
  ]
}
```

### Phase 4: 声明式 Skill 支持

**目标**: 支持 SKILL.md 格式，与 OpenClaw / Claude Code / Cursor 生态互通。

```yaml
# SKILL.md Example
---
name: data-visualization
description: 数据可视化分析技能
version: 1.0.0
domain: analysis
requiredTools:
  - data-analysis
  - python-executor
triggers:
  - pattern: "visualize|chart|graph|plot"
metadata:
  openclaw:
    env:
      MATPLOTLIB_BACKEND: Agg
---

# Data Visualization Skill

当用户需要数据可视化时，按以下步骤执行:

1. 分析数据结构和类型
2. 选择合适的图表类型
3. 使用 python-executor 工具生成图表
...
```

**实现**: 新增 `SkillFileLoader`，从指定目录扫描 SKILL.md 文件，解析 frontmatter，注册到 SkillRegistry。

### Phase 5: 执行隔离（长期）

**目标**: 对外暴露的工具调用在隔离环境中执行。

**方案选择**:
- **进程级隔离**: 使用 Node.js Worker Threads + 资源限制（短期可行）
- **容器级隔离**: Docker 容器执行（长期目标，参考 OpenClaw Sandbox）

**优先级**: 先在 Guardrails 管道中增强输入验证和输出过滤，后续再引入进程/容器隔离。

---

## 5. 实施优先级

| 优先级 | Phase | 改进项 | 影响 | 复杂度 |
|--------|-------|--------|------|--------|
| P0 | Phase 1 | Dynamic MCP Tool Bridge | 从 5 个工具扩展到 50+ | 中 |
| P0 | Phase 2a | Streaming Bridge (SSE 进度推送) | 长任务可用性 | 低 |
| P1 | Phase 2b | Permission Policy Engine | 安全开放能力 | 中 |
| P1 | Phase 2c | Session Context Manager | 状态化会话 | 中 |
| P1 | Phase 3 | MCP Resources & Prompts | 知识库 + 模板开放 | 中 |
| P2 | Phase 4 | 声明式 Skill (SKILL.md) | 生态互通 | 高 |
| P2 | Phase 5 | 执行隔离 | 安全性 | 高 |

---

## 6. 架构目标

改进后的目标架构:

```
┌──────────────────────────────────────────────────────────────┐
│  External Consumers                                          │
│  (Claude Code, Cursor, OpenClaw, 自定义 AI Agent)            │
├──────────────────────────────────────────────────────────────┤
│  MCP Server (Streamable HTTP)                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ tools/list  → Dynamic Tool Bridge (50+ tools)        │    │
│  │ tools/call  → Unified Execution Router               │    │
│  │ resources/* → Library + RAG Resource Provider         │    │
│  │ prompts/*   → Skill Prompt Template Provider          │    │
│  │ SSE Stream  → Realtime Progress Events                │    │
│  └──────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│  Capability Gateway                                          │
│  ┌────────────┬────────────┬──────────┬──────────────────┐   │
│  │ Permission │ Rate       │ Audit    │ Session Context   │   │
│  │ Policy     │ Limiter    │ Logger   │ Manager           │   │
│  └────────────┴────────────┴──────────┴──────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  AIEngineFacade + AICapabilityResolver                       │
├──────────────────────────────────────────────────────────────┤
│  AI Engine Core (Tool/Skill/Agent/Team Registry)             │
├──────────────────────────────────────────────────────────────┤
│  AI App Layer (Research, Teams, Writing, Office...)          │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. 安全考量

参考 OpenClaw 的安全事件（CVE-2026-25253 WebSocket 劫持、ClawHub 12% 恶意 Skill），Raven 在对外开放时必须:

1. **输入验证**: 现有 Guardrails 管道已覆盖，需确保覆盖所有新暴露的工具
2. **输出过滤**: 防止敏感数据通过 MCP 响应泄露
3. **权限隔离**: 每个 API Key 有独立的权限策略，最小权限原则
4. **速率限制**: 防止资源耗尽攻击
5. **Skill 签名**: 如果引入 SKILL.md，需要签名验证机制，避免 OpenClaw ClawHub 式的供应链攻击
6. **无远程代码执行**: MCP 工具定义不应允许注入任意代码

---

## 8. 总结

Raven AI Engine 的核心引擎能力（Facade、Registry、Orchestration、Guardrails、Billing）远超 OpenClaw 这类轻量级 Agent 框架。但在**对外能力开放**的架构上，存在明显的"内强外弱"问题:

- **内部**: 50+ 工具、多层 Registry、Capability Resolver、Feature DI → 架构成熟
- **外部**: 5 个硬编码 MCP Handler、无 Resources/Prompts、无 Streaming、简陋 Session → 能力未释放

核心改进思路是**从手工暴露转向自动桥接**——利用已有的 Registry 体系自动生成 MCP 能力定义，在 Facade 和 MCP Server 之间插入 Capability Gateway 层管理权限和配额，并补齐 MCP 协议的 Resources/Prompts 原语。

这不是推翻现有架构，而是在现有的 Facade + Registry 基础上增加一个**对外投影层**，让内部的丰富能力通过标准协议（MCP）自然流出。
