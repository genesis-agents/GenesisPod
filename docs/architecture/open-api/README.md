# L4 Open API

> 对外开放接口层。MCP / A2A / Public REST / Webhooks。
> 代码路径：`backend/src/modules/open-api/`

## 子模块清单

| 子模块        | 代码路径               | 职责                                    |
| ------------- | ---------------------- | --------------------------------------- |
| `a2a-api/`    | `open-api/a2a-api/`    | Agent-to-Agent API（REST + JSON-RPC）   |
| `admin/`      | `open-api/admin/`      | 管理后台 API                            |
| `agents-api/` | `open-api/agents-api/` | 对外 Agent 调用 API                     |
| `ai-core/`    | `open-api/ai-core/`    | 公共 AI 调用入口                        |
| `byok-admin/` | `open-api/byok-admin/` | BYOK 管理 API                           |
| `mcp-admin/`  | `open-api/mcp-admin/`  | MCP 服务器管理 API                      |
| `mcp-server/` | `open-api/mcp-server/` | 对外 MCP 协议端点（JSON-RPC 2.0）       |
| `public-api/` | `open-api/public-api/` | REST API for 外部消费者（API Key 认证） |
| `skills-api/` | `open-api/skills-api/` | Skill 调用 API                          |
| `teams-api/`  | `open-api/teams-api/`  | Team 调用 API                           |
| `webhooks/`   | `open-api/webhooks/`   | Webhook 事件分发                        |

## 顶层 controller

代码 root 还有两个顶层文件：

- `a2a-rpc.controller.ts` — A2A JSON-RPC 端点
- `a2a-server.controller.ts` — A2A Server 端点

## 设计原则

- 统一对外接口层，隔离内部实现
- MCP Server 遵循 JSON-RPC 2.0 协议
- Public API 需要 API Key 认证（在 `ai-infra/credentials/`）
- 不承载业务逻辑，只做路由与认证；业务委托给 L3 ai-app
