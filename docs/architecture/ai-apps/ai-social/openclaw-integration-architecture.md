# OpenClaw 集成架构设计

> 版本: 1.1
> 更新时间: 2026-02-05
> 变更: 枚举命名简化 (OPENCLAW_WHATSAPP → WHATSAPP)，与实施方案对齐
> 决策依据: [ADR-004](../../../decisions/004-openclaw-integration-strategy.md)
> 相关文档: [AI Social 架构](./ai-social-architecture.md) | [MCP 重构方案](./plans/ai-social-mcp-refactor.md)

## 1. 产品定位

### 1.1 Raven 定位: AI 内容中台

```
素材/选题 → Raven 内容生产引擎 → 全平台分发

               ┌── 输入层 ──┐        ┌── 生产层（核心）──┐        ┌── 分发层 ──┐
               │            │        │                   │        │           │
               │ Web UI     │        │ 深度研究引擎      │        │ 微信公众号 │ Playwright
               │ API/MCP    │   →    │ AI 写作引擎       │   →    │ 小红书     │ MCP (xhs-toolkit)
               │ OpenClaw   │        │ AI 团队协作       │        │ WhatsApp   │ OpenClaw MCP
               │   消息触发 │        │ AI 办公自动化     │        │ Telegram   │ OpenClaw MCP
               │            │        │ 内容合规审核      │        │ Discord    │ OpenClaw MCP
               └────────────┘        └───────────────────┘        │ Slack      │ OpenClaw MCP
                                                                  │ Moltbook   │ OpenClaw MCP
                                                                  └────────────┘
```

### 1.2 OpenClaw 角色: 分发通道合作伙伴

- OpenClaw 不是 Raven 的功能模块，而是通过 MCP 协议连接的外部分发通道
- 用户在 Raven Admin 中配置 OpenClaw 实例连接，如同配置其他 MCP Server
- Raven 不依赖 OpenClaw — 移除 OpenClaw 不影响核心功能

### 1.3 OpenClaw 核心特征

| 特征       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| 运行位置   | 用户本地设备或私有服务器                                     |
| 消息平台   | WhatsApp, Telegram, Discord, Slack, Signal, Teams, iMessage  |
| 技能系统   | AgentSkills 标准 (SKILL.md + YAML frontmatter)，ClawHub 市场 |
| Agent 网络 | Moltbook (140 万+ AI Agent 社交网络)                         |
| MCP 兼容   | 原生支持 MCP 协议工具调用                                    |
| 安全风险   | ClawHub 已出现恶意技能事件，需严格输入校验                   |

## 2. 现状分析（基于代码实现）

### 2.1 已就绪的基础设施

| 组件                    | 文件                                        | 状态 | 说明                                           |
| ----------------------- | ------------------------------------------- | ---- | ---------------------------------------------- |
| MCP Client Factory      | `mcp/client/mcp-client-factory.ts`          | 完成 | stdio/HTTP/SSE 三种传输                        |
| StreamableHttpMCPClient | `mcp/client/streamable-http-mcp-client.ts`  | 完成 | 368 行，Session 管理，指数退避重连             |
| SSEMCPClient            | `mcp/client/sse-mcp-client.ts`              | 完成 | 213 行，SSE 流解析，endpoint 发现              |
| MCPManager              | `mcp/manager/mcp-manager.ts`                | 完成 | 调用 `createMCPClient(config)` 工厂方法        |
| MCP Server Controller   | `mcp-server/mcp-server.controller.ts`       | 完成 | POST + GET SSE + DELETE 全套端点               |
| MCP Server Service      | `mcp-server/mcp-server.service.ts`          | 完成 | JSON-RPC 2.0，Research/Ask/Teams 工具          |
| A2A Client Service      | `a2a/adapter/a2a-client.service.ts`         | 完成 | discoverAgent/createTask/pollTaskUntilComplete |
| A2A Team Member Adapter | `a2a/adapter/a2a-team-member-adapter.ts`    | 完成 | 实现 ITeamMember 接口                          |
| GuardrailsPipeline      | `guardrails/guardrails-pipeline.service.ts` | 完成 | 4 个 guardrail 已注册                          |
| IPlatformAdapter 接口   | `social/types/platform.types.ts:114-139`    | 完成 | initLogin/publish/saveDraft 等                 |

### 2.2 需要改造的瓶颈

#### 瓶颈 1: 社交模块 MCP 客户端独立于统一基础设施

存在两套 MCP 实现，互不复用：

| 实现                    | 位置                                | 传输               | 用途                 |
| ----------------------- | ----------------------------------- | ------------------ | -------------------- |
| AI Engine MCPManager    | `ai-engine/mcp/`                    | stdio + HTTP + SSE | 全局 MCP 管理        |
| Social MCPClientService | `social/core/mcp-client.service.ts` | 仅 stdio           | 仅小红书 xhs-toolkit |

Social 的 `MCPClientService`（523 行）是完全独立的 stdio 实现，有自己的进程管理、健康检查、安全校验。无法连接远程 MCP Server。

#### 瓶颈 2: 发布路由硬编码

`publish-executor.service.ts:151-169`:

```typescript
// 当前实现 — 新增平台需改动此文件
switch (connection.platformType) {
  case SocialPlatformType.WECHAT_MP:
    result = await this.wechatAdapter.publish(...);
    break;
  case SocialPlatformType.XIAOHONGSHU:
    result = await this.xiaohongshuAdapter.publish(...);
    break;
  default:
    result = { success: false, errorMessage: `不支持的平台类型` };
}
```

构造函数硬注入两个适配器：

```typescript
constructor(
  private readonly wechatAdapter: WechatAdapter,
  private readonly xiaohongshuAdapter: XiaohongshuAdapter,
) {}
```

#### 瓶颈 3: 平台枚举仅 2 个值

`social/types/index.ts:8-11`:

```typescript
export enum SocialPlatformType {
  WECHAT_MP = "WECHAT_MP",
  XIAOHONGSHU = "XIAOHONGSHU",
}
```

新增平台需要改枚举 → Prisma schema → 数据库迁移 → switch/case → 全链路改动。

#### 瓶颈 4: A2A Controller 入站为占位符

`a2a.controller.ts:119`:

```typescript
// TODO: 实现实际的任务创建逻辑
// 目前返回占位符响应
```

#### 瓶颈 5: Guardrails 未接入调用链

`GuardrailsPipelineService` 完整实现但未在 `AiChatService.chat()` 或任何实际调用中被调用。

## 3. 目标架构

### 3.1 整体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                         Raven AI Content Hub                       │
├──────────────────────────────────────────────────────────────────  ┤
│                                                                    │
│  ┌─────────────┐    ┌─────────────────────┐    ┌───────────────┐  │
│  │  Input Layer │    │  Production Engine   │    │ Distribution  │  │
│  │             │    │                     │    │    Layer       │  │
│  │ Web UI      │───→│ Research Engine     │───→│               │  │
│  │ API         │    │ Writing Engine      │    │ Adapter       │  │
│  │ MCP Server  │    │ Team Collaboration  │    │ Registry      │  │
│  │             │    │ Office Automation   │    │  ├─ WeChat     │  │
│  │             │    │ Content Review      │    │  ├─ XHS        │  │
│  │             │    │                     │    │  ├─ OpenClaw   │──┼──→ WhatsApp
│  │             │    │                     │    │  │  (MCP)      │──┼──→ Telegram
│  │             │    │                     │    │  │             │──┼──→ Discord
│  │             │    │                     │    │  └─ ...future  │──┼──→ Slack
│  └─────────────┘    └─────────────────────┘    └───────────────┘  │
│                                                        │          │
│                                              ┌─────────┴────────┐ │
│                                              │   MCPManager     │ │
│                                              │ (stdio/HTTP/SSE) │ │
│                                              └──────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Cross-Cutting: Guardrails | Observability | Secrets | Auth   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 分发层详细设计

```
PublishExecutorService
    │
    ▼
PlatformAdapterRegistry.get(platformType)
    │
    ├── WechatAdapter (Playwright)          — 现有
    ├── XhsMcpAdapter (MCPManager → stdio)  — 迁移到 MCPManager
    ├── OpenClawAdapter (MCPManager → HTTP)  — 新增
    └── ...FutureAdapter                    — 可扩展
```

### 3.3 OpenClaw 通信流

```
Raven 发布内容到 WhatsApp:

PublishExecutorService
  → PlatformAdapterRegistry.get("WHATSAPP")
  → OpenClawChannelAdapter.publish(content, session, options)
  → MCPManager.callTool("openclaw-instance", "send-message", {
      platform: "whatsapp",
      recipient: options.targetChannel,
      content: { title, body, images }
    })
  → HTTP POST → OpenClaw MCP Server → WhatsApp API
  → 返回 PublishResult
```

```
Raven 接收 OpenClaw 触发的研究请求:

OpenClaw 用户在 WhatsApp: "帮我研究一下 AI 芯片行业"
  → OpenClaw Agent
  → MCP Client → HTTP POST → Raven MCP Server (/mcp endpoint)
  → MCPServerService.handleRequest()
  → ResearchToolHandler.execute({ topic: "AI 芯片行业" })
  → GuardrailsPipeline.processInput() ← 安全校验
  → Research Engine 执行
  → 结果返回 OpenClaw → WhatsApp
```

## 4. 改造计划

### Phase 0: 统一 MCP 基础设施（P0, 1-2 天）

**目标**: 社交模块复用 AI Engine 的 MCPManager，消除重复实现。

**改动清单**:

| 文件                                             | 改动                                            |
| ------------------------------------------------ | ----------------------------------------------- |
| `social/ai-social.module.ts`                     | 注入 `MCPManager` 替代 `MCPClientService`       |
| `social/adapters/xiaohongshu/xhs-mcp.adapter.ts` | 依赖从 `MCPClientService` 改为 `MCPManager`     |
| `social/config/platforms.config.ts`              | MCP_SERVER_CONFIGS 迁移到 Admin MCP Server 管理 |
| `social/core/mcp-client.service.ts`              | 标记 deprecated，后续移除                       |

**核心变更示例**:

```typescript
// xhs-mcp.adapter.ts 改造前
constructor(private readonly mcpClient: MCPClientService) {}

async publish(...) {
  await this.mcpClient.callTool(this.MCP_SERVER_ID, toolName, args);
}

// xhs-mcp.adapter.ts 改造后
constructor(private readonly mcpManager: MCPManager) {}

async publish(...) {
  await this.mcpManager.callTool(this.MCP_SERVER_ID, toolName, args);
}
```

**验证**: 小红书 MCP 发布功能不受影响（接口签名一致）。

### Phase 1: 平台适配器注册表（P1, 1 天）

**目标**: 消除 `PublishExecutorService` 的硬编码路由。

**新增文件**:

```
social/core/platform-adapter-registry.ts
```

**设计**:

```typescript
@Injectable()
export class PlatformAdapterRegistry {
  private readonly logger = new Logger(PlatformAdapterRegistry.name);
  private readonly adapters = new Map<SocialPlatformType, IPlatformAdapter>();

  register(adapter: IPlatformAdapter): void {
    this.adapters.set(adapter.platformType, adapter);
    this.logger.log(
      `Registered adapter: ${adapter.name} (${adapter.platformType})`,
    );
  }

  get(type: SocialPlatformType): IPlatformAdapter | undefined {
    return this.adapters.get(type);
  }

  getAll(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  getSupportedPlatforms(): SocialPlatformType[] {
    return Array.from(this.adapters.keys());
  }
}
```

**改造 PublishExecutorService**:

```typescript
// 改造前
constructor(
  private readonly wechatAdapter: WechatAdapter,
  private readonly xiaohongshuAdapter: XiaohongshuAdapter,
) {}

// 改造后
constructor(
  private readonly adapterRegistry: PlatformAdapterRegistry,
) {}

async execute(contentId: string): Promise<PublishResult> {
  // ...existing validation logic...

  const adapter = this.adapterRegistry.get(connection.platformType);
  if (!adapter) {
    return { success: false, errorMessage: `不支持的平台类型: ${connection.platformType}` };
  }

  const result = await adapter.publish(publishContent, sessionData, options);
  // ...existing result handling...
}
```

**Module 注册**:

```typescript
// ai-social.module.ts
@Module({
  providers: [
    PlatformAdapterRegistry,
    {
      provide: 'REGISTER_ADAPTERS',
      useFactory: (registry, wechat, xhs) => {
        registry.register(wechat);
        registry.register(xhs);
      },
      inject: [PlatformAdapterRegistry, WechatAdapter, XhsMcpAdapter],
    },
  ],
})
```

### Phase 2: SocialPlatformType 扩展 + Prisma（P2, 0.5 天）

**扩展枚举**:

```typescript
// social/types/index.ts
export enum SocialPlatformType {
  WECHAT_MP = "WECHAT_MP",
  XIAOHONGSHU = "XIAOHONGSHU",
  // OpenClaw 通道（简洁命名，通过 OPENCLAW_PLATFORMS 常量标识哪些是 OpenClaw 平台）
  WHATSAPP = "WHATSAPP",
  TELEGRAM = "TELEGRAM",
  DISCORD = "DISCORD",
  SLACK = "SLACK",
}

// 辅助常量
export const OPENCLAW_PLATFORMS = [
  SocialPlatformType.WHATSAPP,
  SocialPlatformType.TELEGRAM,
  SocialPlatformType.DISCORD,
  SocialPlatformType.SLACK,
] as const;

export function isOpenClawPlatform(type: SocialPlatformType): boolean {
  return (OPENCLAW_PLATFORMS as readonly SocialPlatformType[]).includes(type);
}
```

**Prisma 迁移**: 扩展 `platformType` 枚举。

**命名决策**: 使用简洁名称（`WHATSAPP` 而非 `OPENCLAW_WHATSAPP`），原因:

- 枚举名代表平台本身，不绑定传输方式（未来可能不通过 OpenClaw）
- 通过 `OPENCLAW_PLATFORMS` 常量和 `isOpenClawPlatform()` 辅助函数判断传输通道
- 数据库存储更简洁

**每个目标平台独立枚举而非统一 `OPENCLAW`，原因**:

- 每个平台的频率限制不同
- 每个平台的内容格式要求不同
- 用户可能只连接部分平台
- 连接状态独立管理

### Phase 3: OpenClaw 通道适配器（P3, 2-3 天）

**新增文件**:

```
social/adapters/openclaw/
├── openclaw-channel.adapter.ts    # 主适配器
├── openclaw-content-formatter.ts  # 内容格式转换
└── index.ts
```

**核心实现**:

```typescript
@Injectable()
export class OpenClawChannelAdapter implements IPlatformAdapter {
  readonly platformType: SocialPlatformType; // 由构造参数决定
  readonly name: string;
  readonly supportsMcp = true;

  constructor(
    private readonly mcpManager: MCPManager,
    private readonly formatter: OpenClawContentFormatter,
    platformType: SocialPlatformType,
    private readonly targetPlatform: string, // "whatsapp" | "telegram" | ...
    private readonly mcpServerId: string, // Admin 中配置的 OpenClaw MCP Server ID
  ) {
    this.platformType = platformType;
    this.name = `OpenClaw (${targetPlatform})`;
  }

  async initLogin(): Promise<LoginSession> {
    // OpenClaw 的认证由用户在 OpenClaw 侧完成
    // Raven 只需要验证 MCP 连接可用
    const isAvailable = this.mcpManager.getClient(this.mcpServerId)?.connected;
    return {
      sessionKey: this.mcpServerId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: isAvailable ? "confirmed" : "expired",
    };
  }

  async publish(
    content: SocialContent,
    sessionData: SessionData,
    options: PublishOptions,
  ): Promise<PublishResult> {
    const formatted = this.formatter.format(content, this.targetPlatform);

    const result = await this.mcpManager.callTool(
      this.mcpServerId,
      "send-message",
      {
        platform: this.targetPlatform,
        content: formatted,
      },
    );

    return {
      success: !result.isError,
      type: options.mode === "draft" ? "draft" : "published",
      externalId: result.content?.[0]?.text,
    };
  }

  // ...其他 IPlatformAdapter 方法
}
```

**内容格式转换**:

```typescript
@Injectable()
export class OpenClawContentFormatter {
  format(content: SocialContent, platform: string): Record<string, unknown> {
    switch (platform) {
      case "whatsapp":
        return this.formatWhatsApp(content);
      case "telegram":
        return this.formatTelegram(content);
      case "discord":
        return this.formatDiscord(content);
      case "slack":
        return this.formatSlack(content);
      default:
        return this.formatGeneric(content);
    }
  }

  private formatWhatsApp(content: SocialContent) {
    // WhatsApp: 纯文本 + 图片链接，无 HTML
    return {
      text: `*${content.title}*\n\n${this.stripHtml(content.content)}`,
      images: content.images,
    };
  }

  private formatTelegram(content: SocialContent) {
    // Telegram: 支持 Markdown
    return {
      text: `**${content.title}**\n\n${this.htmlToMarkdown(content.content)}`,
      images: content.images,
      parseMode: "Markdown",
    };
  }

  private formatDiscord(content: SocialContent) {
    // Discord: Embed 格式
    return {
      embed: {
        title: content.title,
        description: this.truncate(this.stripHtml(content.content), 4096),
        image: content.coverImageUrl,
      },
    };
  }

  private formatSlack(content: SocialContent) {
    // Slack: Block Kit 格式
    return {
      blocks: [
        { type: "header", text: { type: "plain_text", text: content.title } },
        {
          type: "section",
          text: { type: "mrkdwn", text: this.htmlToMarkdown(content.content) },
        },
      ],
    };
  }
}
```

### Phase 4: Guardrails 接入（P4, 1 天）

**目标**: 所有来自外部 MCP 的输入经过安全校验。

**改动点**:

1. `mcp-server/mcp-server.service.ts` 的 `handleToolsCall` 中调用 `GuardrailsPipelineService.processInput()`
2. `social/services/content-checker.service.ts` 复用 guardrails 的 `content-safety-filter`

### Phase 5: Admin UI 配置（P5, 1-2 天）

**目标**: 用户在 Admin 中管理 OpenClaw 连接。

利用现有基础设施:

- Admin MCP Server 管理页面（`/admin/ai/mcp-servers`）已支持添加远程 MCP Server
- 用户添加 OpenClaw 实例的 URL 和 API Key 即可
- 不需要新建管理页面

**额外配置项**（在 Social 设置页面添加）:

- OpenClaw MCP Server 关联（从已注册的 MCP Server 中选择）
- 目标平台启用/禁用
- 每个平台的频率限制

## 5. 技能生态互通（后期规划）

### 5.1 Raven 技能发布到 ClawHub

Raven 的深度研究、写作等能力可以作为 OpenClaw 技能发布:

```yaml
# SKILL.md (AgentSkills 格式)
---
name: raven-deep-research
description: Deep multi-dimensional research powered by Raven AI Engine
user-invocable: true
metadata: {"openclaw": {"emoji": "magnifying_glass", "primaryEnv": "RAVEN_API_KEY"}}
---

This skill connects to a Raven AI Engine instance to perform deep research.

## Usage
/raven-deep-research <topic>

## Configuration
Set RAVEN_API_KEY in your OpenClaw settings.
The skill will call Raven's MCP Server at the configured URL.
```

### 5.2 字段映射

| Raven ISkill    | AgentSkills SKILL.md                  |
| --------------- | ------------------------------------- |
| `id`            | `name`                                |
| `description`   | `description`                         |
| `layer`         | `metadata.openclaw.category` (自定义) |
| `domain`        | `metadata.openclaw.domain` (自定义)   |
| `requiredTools` | `metadata.openclaw.requires.bins`     |
| `execute()`     | MCP 工具调用指令（Markdown 正文）     |

### 5.3 Moltbook Agent 注册

通过 A2A Client（已实现）将 Raven Agent 注册到 Moltbook:

```
A2AClientService.discoverAgent(moltbook-registry-url)
→ 获取 Moltbook Agent 注册 API
→ 提交 Raven Agent Card (/.well-known/agent.json)
→ Raven Agent 出现在 Moltbook 网络
```

## 6. 安全设计

### 6.1 输入校验

所有来自 OpenClaw 的输入必须经过:

1. **Guardrails Pipeline** (`processInput`):
   - `prompt-injection-detector` — 防 prompt 注入
   - `content-safety-filter` — 内容安全过滤
   - `input-complexity-check` — 复杂度限制

2. **MCP API Key Guard** (`mcp-api-key.guard.ts`):
   - 每个 OpenClaw 实例使用独立 API Key
   - 通过 Admin Secrets 管理（category: MCP）

### 6.2 输出过滤

发送到外部平台前经过:

1. **Content Compliance Check** — `content-compliance-check` guardrail
2. **Content Checker Service** — 社交模块的合规检测
3. **Human Review** — 可配置的人工审核流程（已有 ReviewService）

### 6.3 凭证隔离

- OpenClaw MCP Server 的 URL 和 API Key 存储在 Secrets 模块（AES-256 加密）
- OpenClaw 通道的会话数据不包含用户社交平台密码（OpenClaw 在本地管理平台认证）
- MCP 通信中不传输明文密钥

## 7. 实施路线

```
Phase 0 (1-2 天) ─── 统一 MCP 基础设施
  │                    Social MCPClientService → MCPManager
  │
Phase 1 (1 天) ────── 平台适配器注册表
  │                    PlatformAdapterRegistry + PublishExecutorService 重构
  │
Phase 2 (0.5 天) ──── 平台枚举扩展
  │                    SocialPlatformType + Prisma 迁移
  │
Phase 3 (2-3 天) ──── OpenClaw 通道适配器
  │                    OpenClawChannelAdapter + ContentFormatter
  │
Phase 4 (1 天) ────── Guardrails 接入
  │                    MCP Server + Social 调用链
  │
Phase 5 (1-2 天) ──── Admin UI 配置
  │                    Social 设置页面扩展
  │
  ▼
后期规划 ────────────── 技能生态互通
                        ClawHub 发布 + Moltbook 注册
```

**总工作量**: 7-10 天（Phase 0-5），后期规划另计

## 8. 验收标准

### Phase 0-1 验收

- [ ] 小红书 MCP 发布功能不受影响（回归测试）
- [ ] `MCPClientService` 标记 deprecated
- [ ] `PublishExecutorService` 无平台硬编码

### Phase 2-3 验收

- [ ] 通过 OpenClaw 成功发送消息到至少 1 个平台（如 Telegram）
- [ ] Admin MCP Server 页面可添加 OpenClaw 实例
- [ ] 内容格式正确转换（HTML → 平台原生格式）

### Phase 4-5 验收

- [ ] 恶意输入被 Guardrails 拦截（测试 prompt injection）
- [ ] Social 设置页面可配置 OpenClaw 平台启用/禁用
- [ ] 频率限制对 OpenClaw 通道生效

## 9. 相关文档

| 文档                     | 路径                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| ADR-004 集成策略决策     | `docs/decisions/004-openclaw-integration-strategy.md`                 |
| AI Social 架构           | `docs/architecture/ai-apps/ai-social/ai-social-architecture.md`       |
| Social MCP 重构方案      | `docs/architecture/ai-apps/ai-social/plans/ai-social-mcp-refactor.md` |
| ADR-001 MCP 传输扩展     | `docs/decisions/001-mcp-transport-extension.md`                       |
| ADR-002 Raven MCP Server | `docs/decisions/002-raven-as-mcp-server.md`                           |
| ADR-003 A2A 协议         | `docs/decisions/003-a2a-protocol-adoption.md`                         |
| OpenClaw 技能文档        | https://docs.openclaw.ai/tools/skills                                 |

---

**维护者**: AI Platform Team
**代码位置**: `backend/src/modules/ai-app/social/`, `backend/src/modules/ai-engine/mcp/`
