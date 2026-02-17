# 目录结构规范

**版本：** 2.0
**强制级别：** MUST
**更新日期：** 2025-12-13

---

## 核心原则

- Monorepo 结构 - 前端、后端、AI服务统一管理
- 分组模块化 - 按领域分组，组内模块化
- 清晰的分层 - API层、业务层、数据层明确分离
- 一致的命名 - ai-\* 前缀统一AI相关模块
- 易于导航 - 新开发者能快速找到代码

---

## 项目总体结构

```
genesis/
├── frontend/                          <- Next.js 前端服务
├── backend/                           <- NestJS 后端服务
├── ai-service/                        <- Python AI服务
├── .claude/                           <- 规范和配置
│   ├── standards/                     <- 规范文档库
│   ├── tools/                         <- 自动化工具
│   ├── agents/                        <- AI Agent 配置
│   └── config/                        <- 项目配置
└── docs/                              <- 项目文档
```

---

## Backend 目录结构 (NestJS)

### 分组模块架构

后端采用**分组模块化**架构，将模块按业务领域分为5个组：

```
backend/src/
├── main.ts                            <- 应用入口
├── app.module.ts                      <- 根模块
├── app.controller.ts                  <- 健康检查
│
├── common/                            <- 共享代码
│   ├── prisma/                        <- Prisma ORM 服务
│   ├── mongodb/                       <- MongoDB 服务
│   ├── neo4j/                         <- Neo4j 图数据库服务
│   ├── graph/                         <- 知识图谱服务
│   ├── ai-orchestration/              <- AI 调度服务
│   ├── streaming/                     <- SSE 流式响应
│   ├── content-processing/            <- 内容处理服务
│   ├── filters/                       <- 异常过滤器
│   ├── guards/                        <- 守卫
│   ├── interceptors/                  <- 拦截器
│   ├── pipes/                         <- 管道
│   └── decorators/                    <- 装饰器
│
└── modules/                           <- 业务模块（按领域分组）
    ├── ai/                            <- AI 模块组
    ├── content/                       <- 内容模块组
    ├── core/                          <- 核心模块组
    ├── data-services/                 <- 数据服务模块组
    └── integrations/                  <- 集成模块组
```

### AI 模块组 (modules/ai/)

所有AI相关功能，统一使用 ai- 前缀：

```
modules/ai/
├── ai-core/                           <- AI 核心服务
├── ai-agents/                         <- AI Agent 管理
├── ai-ask/                            <- AI 问答会话
├── ai-image/                          <- AI 图像生成
├── ai-office/                         <- AI Office (文档/PPT)
│   ├── ai-office.module.ts
│   ├── ai-office.controller.ts
│   ├── ai-office.service.ts
│   ├── ppt/                           <- PPT 生成子模块
│   └── dto/
├── ai-simulation/                     <- AI 模拟推演
├── ai-studio/                         <- AI Studio 项目
└── ai-teams/                          <- AI 团队协作
```

### Content 模块组 (modules/content/)

```
modules/content/
├── collections/                       <- 收藏集
├── comments/                          <- 评论
├── explore/                           <- 探索 (含 YouTube)
├── feed/                              <- 信息流
├── notes/                             <- 笔记
├── reports/                           <- 报告
├── resources/                         <- 资源管理
└── workspace/                         <- 工作空间
```

### Core 模块组 (modules/core/)

```
modules/core/
├── admin/                             <- 管理后台
├── auth/                              <- 认证授权
└── storage/                           <- 文件存储
```

### Data Services 模块组 (modules/data-services/)

```
modules/data-services/
├── blog-collection/                   <- 博客采集
├── crawler/                           <- 爬虫服务
├── data-collection/                   <- 数据采集
├── data-management/                   <- 数据管理
├── knowledge-graph/                   <- 知识图谱
└── recommendations/                   <- 推荐服务
```

### Integrations 模块组 (modules/integrations/)

```
modules/integrations/
├── proxy/                             <- 代理服务
└── wechat-work/                       <- 企业微信
```

---

## Frontend 目录结构 (Next.js)

### lib 工具库架构

前端 lib 目录采用**按领域分组**的结构：

```
frontend/lib/
├── api/                               <- API 客户端
│   ├── client.ts                      <- 通用 HTTP 客户端
│   ├── ai-teams.ts                    <- AI Teams API
│   ├── workspace.ts                   <- Workspace API
│   ├── data-collection.ts             <- 数据采集 API
│   └── index.ts                       <- 统一导出
│
├── ai-office/                         <- AI Office 业务逻辑
│   ├── agents/                        <- Agent 定义
│   ├── multi-agents/                  <- 多 Agent 协作
│   ├── context-builder.ts             <- 上下文构建
│   ├── markdown-parser.ts             <- Markdown 解析
│   ├── ppt-templates.ts               <- PPT 模板
│   └── ppt-utils.ts                   <- PPT 工具
│
├── ai-simulation/                     <- AI Simulation 业务逻辑
├── explore/                           <- 探索功能
├── templates/                         <- 模板定义
├── cache/                             <- 缓存工具
│
└── utils/                             <- 通用工具函数
    ├── auth.ts                        <- 认证工具
    ├── config.ts                      <- 配置管理
    ├── common.ts                      <- 通用函数
    ├── feature-check.ts               <- 功能检测
    ├── pdf-thumbnail.ts               <- PDF 缩略图
    ├── performance.ts                 <- 性能监控
    └── document-export.service.ts     <- 文档导出
```

### Components 组织

```
frontend/components/
├── ui/                                <- UI 基础组件 (shadcn)
├── ai-office/                         <- AI Office 组件
├── ai-teams/                          <- AI Teams 组件
├── ai-simulation/                     <- AI Simulation 组件
├── ai-studio/                         <- AI Studio 组件
├── explore/                           <- 探索组件
├── layout/                            <- 布局组件
└── shared/                            <- 共享组件
```

### App Router 结构

```
frontend/app/
├── page.tsx                           <- 首页
├── layout.tsx                         <- 根布局
├── api/                               <- API Routes (BFF 代理)
├── ai-office/                         <- AI Office 页面
├── ai-teams/                          <- AI Teams 页面
├── ai-simulation/                     <- AI Simulation 页面
├── ai-studio/                         <- AI Studio 页面
├── explore/                           <- 探索页面
├── ask/                               <- AI 问答
├── library/                           <- 我的收藏
└── auth/                              <- 认证页面
```

---

## AI Service 目录结构 (Python/FastAPI)

```
ai-service/
├── main.py                            <- FastAPI 应用入口
├── routers/                           <- API 路由
│   ├── ai.py                          <- AI 通用路由
│   ├── report.py                      <- 报告生成
│   ├── trend.py                       <- 趋势分析
│   └── workspace.py                   <- 工作空间
├── services/                          <- 业务逻辑
│   ├── ai_orchestrator.py             <- AI 服务编排
│   ├── grok_client.py                 <- Grok API 客户端
│   ├── openai_client.py               <- OpenAI 客户端
│   └── trend_analysis.py              <- 趋势分析
├── models/                            <- 数据模型
├── configs/                           <- 配置文件
├── utils/                             <- 工具函数
└── requirements.txt                   <- Python 依赖
```

---

## 命名规范

### 模块命名

| 类型     | 规范      | 示例                          |
| -------- | --------- | ----------------------------- |
| AI 模块  | ai-{功能} | ai-office, ai-teams, ai-core  |
| 内容模块 | {功能}    | reports, resources, workspace |
| 数据服务 | {功能}    | crawler, data-collection      |
| 集成模块 | {平台}    | wechat-work, proxy            |

### 文件命名

| 类型          | 规范                 | 示例                      |
| ------------- | -------------------- | ------------------------- |
| NestJS 模块   | {name}.module.ts     | ai-office.module.ts       |
| NestJS 控制器 | {name}.controller.ts | ai-office.controller.ts   |
| NestJS 服务   | {name}.service.ts    | ai-office.service.ts      |
| React 组件    | {Name}.tsx           | SlideEditor.tsx           |
| 工具函数      | {name}.ts            | context-builder.ts        |
| 测试文件      | {name}.spec.ts       | ai-office.service.spec.ts |

---

## 导入路径规范

### Backend 相对路径

```typescript
// 模块内部导入
import { SomeService } from "./some.service";

// 同组模块导入
import { AuthModule } from "../auth/auth.module";

// 跨组模块导入
import { ReportsModule } from "../../content/reports/reports.module";

// 公共模块导入
import { PrismaService } from "../../../common/prisma/prisma.service";
```

### Frontend 路径别名

```typescript
// 使用 @/ 别名
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { config } from "@/lib/utils/config";
import { getAuthTokens } from "@/lib/utils/auth";
```

---

## 添加新功能的规范

### 添加新的 AI 模块

```bash
# 1. 创建模块目录
mkdir -p backend/src/modules/ai/ai-{name}

# 2. 创建必要文件
touch ai-{name}.module.ts
touch ai-{name}.controller.ts
touch ai-{name}.service.ts

# 3. 在 app.module.ts 中导入
# 4. 创建对应前端页面和组件
```

### 添加新的前端业务模块

```bash
# 1. 在 lib/ 下创建业务逻辑目录
mkdir -p frontend/lib/{name}

# 2. 在 components/ 下创建组件目录
mkdir -p frontend/components/{name}

# 3. 在 app/ 下创建页面
mkdir -p frontend/app/{name}
```

---

## 检查清单

提交代码前检查：

- [ ] 模块放在正确的分组目录下
- [ ] AI 相关模块使用 ai- 前缀
- [ ] 导入路径使用正确的相对路径
- [ ] 新模块已在 app.module.ts 中注册
- [ ] 测试文件与源代码在同一目录
- [ ] Python 包目录有 **init**.py
- [ ] 前端使用 @/ 路径别名

---

## 常见问题

### Q: 新功能应该放在哪个分组？

按照这个优先级判断：

1. 是否是 AI 功能？-> modules/ai/
2. 是否是内容管理？-> modules/content/
3. 是否是数据采集/处理？-> modules/data-services/
4. 是否是第三方集成？-> modules/integrations/
5. 是否是核心基础设施？-> modules/core/

### Q: 前端工具函数放哪里？

- 特定业务逻辑 -> lib/{业务名}/
- 通用工具 -> lib/utils/
- API 调用 -> lib/api/

### Q: 跨模块依赖如何处理？

- 尽量减少跨组依赖
- 必要时通过 common/ 共享服务
- 使用事件驱动解耦

---

**记住：** 好的目录结构让项目易于理解和维护。分组模块化设计让代码组织清晰，新开发者能快速上手！
