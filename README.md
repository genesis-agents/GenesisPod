# DeepDive Engine

> 企业级 AI 深度研究和内容管理平台 - 从信息到洞察，重构你的知识探索之旅

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-完整文档-green.svg)](docs/readme.md)
[![PRD](https://img.shields.io/badge/产品-PRD-orange.svg)](docs/prd.md)

## 📖 项目简介

DeepDive Engine 是一个 **企业级 AI 深度研究和内容管理平台**，集成了内容聚合、AI分析、知识管理和智能办公功能。

### ⚡ 架构亮点

- **💰 成本优化**: 单一 PostgreSQL 数据库架构，节省 70-75% 数据库成本
- **🔧 技术创新**: JSONB + Recursive CTEs 替代 MongoDB + Neo4j
- **⚡ 高性能**: GIN 索引优化，原生 SQL 查询，零性能损失
- **🛠️ 运维简化**: 单点备份，无需管理多数据库同步
- **📦 模块化设计**: AI Engine (能力层) → AI Apps (应用层) 清晰分层

### 🌟 核心特性

#### 📰 智能Feed流

- **多源数据聚合**: arXiv论文、GitHub项目、HackerNews资讯
- **AI增强**: 自动摘要、洞察生成、难度评估
- **个性化推荐**: 基于用户兴趣和阅读历史

#### 🤖 AI Office

- **智能文档编辑器**: AI辅助写作和内容生成
- **多模态支持**: 文本、表格、图表、代码
- **PPT生成**: AI自动生成演示文稿
- **协作功能**: 实时协作编辑

#### 🎨 AI Image（新增）

- **AI图像生成**: 集成Flux Pro等主流AI绘图模型
- **多种输入模式**: 直接Prompt、URL+描述、多文件分析
- **历史管理**: 完整的生成历史和参数记录
- **宽高比选择**: 支持多种预设尺寸和自定义比例

#### 🔬 AI Studio

- **研究项目管理**: 组织和管理研究任务
- **多文件分析**: 批量处理PDF、Word、网页等资源
- **AI驱动洞察**: 自动生成研究笔记和分析报告
- **知识图谱集成**: 自动构建概念关联网络

#### 👥 AI Teams

- **多AI协作**: 集成多个AI模型进行主题讨论
- **主题管理**: 创建和管理研究主题
- **AI成员管理**: 添加不同专长的AI助手
- **消息历史**: 完整的对话记录和导出功能

#### 💬 AI Ask

- **智能对话**: 与 DeepDive AI 进行智能对话
- **上下文感知**: 支持多轮对话和上下文理解
- **会话管理**: 创建、管理和切换多个对话会话

#### 💻 AI Coding

- **多Agent协作**: PM→架构师→PM Lead→工程师→QA 完整开发流程
- **Kanban看板**: 拖拽式项目管理，参考 vibe-kanban 设计
- **实时进度**: WebSocket 推送项目执行状态
- **断点恢复**: 任务检查点持久化，支持故障恢复
- **代码生成**: AI驱动的完整项目代码生成

#### 🎨 AI Writing

- **长文本创作**: 支持小说、论文、报告等长文本创作
- **章节管理**: 智能章节规划和内容组织
- **多AI协作**: 结合不同AI模型优势，提升创作质量
- **版本控制**: 完整的创作历史和版本管理
- **智能续写**: AI辅助内容扩展和改写

#### 📱 AI Social

- **社交内容生成**: 微信公众号、小红书等平台内容创作
- **多平台适配**: 自动适配不同平台的格式要求
- **内容优化**: AI优化标题、配图、排版
- **定时发布**: 支持内容定时发布和管理

#### 📊 AI报告生成

- **多素材综合**: 选择2-10份资料生成分析报告
- **多种模板**: 对比分析、趋势报告、学习路径、文献综述
- **智能导出**: Markdown、PDF、DOCX格式

#### 🎯 知识管理

- **Workspace**: 组织和管理知识资源
- **智能标签**: AI自动分类和打标签
- **笔记系统**: Markdown笔记，支持AI增强

---

## 🚀 快速开始

### 前置要求

- **Node.js** 20+
- **Python** 3.11+
- **Docker** & Docker Compose
- **数据库**: PostgreSQL 16、Redis 7

### 一键启动（推荐）

#### Windows用户

```bash
# 停止所有服务并清理端口
stop-all.bat

# 启动所有服务
start-all.bat
```

详见: [服务管理指南](docs/guides/service-management.md)

#### 手动启动

**1. 克隆项目**

```bash
git clone https://github.com/JUNJIE-DUAN/ai-teams-engine.git
cd ai-teams-engine
```

**2. 配置环境变量**

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env文件，填入实际配置
# 主要配置项：
# - GROK_API_KEY: Grok AI API密钥（首选）
# - OPENAI_API_KEY: OpenAI API密钥（备用）
# - DATABASE_URL: PostgreSQL连接字符串（单一数据库）
```

**3. 启动数据库**

```bash
docker-compose up -d
```

这将启动：

- PostgreSQL (5432) - 统一数据库（结构化数据 + 原始数据 JSONB + 知识图谱 Recursive CTEs）
- Redis (6379) - 缓存和会话管理
- FlareSolverr (8191) - Cloudflare 绕过代理服务

**4. 安装依赖**

```bash
# Monorepo根目录
npm install

# 前端
cd frontend && npm install

# 后端
cd ../backend && npm install

# AI服务
cd ../ai-service && pip install -r requirements.txt
```

**5. 数据库迁移**

```bash
cd backend
npx prisma migrate dev
npx prisma db seed  # 可选：填充示例数据
```

**6. 启动服务**

```bash
# 终端1 - 前端 (端口3000)
cd frontend
npm run dev

# 终端2 - 后端 (端口4000)
cd backend
npm run dev

# 终端3 - AI服务 (端口5000)
cd ai-service
uvicorn main:app --reload --port 5000
```

**7. 访问应用**

- **前端**: http://localhost:3000
- **后端API**: http://localhost:4000/api/v1
- **AI服务**: http://localhost:5000/docs

详细启动指南: [开发指南](docs/guides/development.md)

---

## 📁 项目结构

```
deepdive-engine/
├── docs/                          # 📚 完整项目文档
│   ├── api/                       # API文档
│   ├── architecture/              # 架构设计
│   │   ├── ai-apps/               # AI应用架构
│   │   ├── ai-engine/             # AI引擎架构
│   │   ├── ai-teams/              # AI Teams架构
│   │   └── system/                # 系统架构
│   ├── features/                  # 功能文档
│   │   ├── ai-apps/               # AI应用功能
│   │   └── ai-teams/              # AI Teams功能
│   ├── guides/                    # 开发指南
│   │   ├── authentication/        # 认证指南
│   │   ├── claude-code/           # Claude Code使用指南
│   │   ├── deployment/            # 部署指南
│   │   ├── development/           # 开发指南
│   │   └── testing/               # 测试指南
│   ├── prd/                       # 产品需求文档
│   │   ├── ai-apps/               # AI应用PRD
│   │   ├── ai-teams/              # AI Teams PRD
│   │   └── infra/                 # 基础设施PRD
│   └── _archive/                  # 历史文档归档
│
├── frontend/                      # Next.js 14前端
│   ├── app/                       # App Router页面
│   │   ├── admin/                 # 管理后台（access, ai, data, system）
│   │   ├── ai-ask/                # AI问答
│   │   ├── ai-coding/             # AI编程
│   │   ├── ai-image/              # AI图像生成
│   │   ├── ai-office/             # AI办公
│   │   ├── ai-research/           # AI研究
│   │   ├── ai-simulation/         # AI模拟
│   │   ├── ai-social/             # AI社交内容生成
│   │   ├── ai-teams/              # AI团队
│   │   ├── ai-writing/            # AI写作
│   │   └── library/               # 资源库
│   ├── components/                # React组件
│   ├── hooks/                     # React Hooks
│   ├── lib/                       # 工具函数
│   └── stores/                    # Zustand状态管理
│
├── backend/                       # NestJS后端
│   ├── src/
│   │   ├── modules/               # 功能模块
│   │   │   ├── ai-engine/         # AI引擎层（核心能力）
│   │   │   │   ├── image/         # 图像引擎
│   │   │   │   ├── long-content/  # 长文本引擎
│   │   │   │   └── teams/         # 团队引擎
│   │   │   ├── ai-app/            # AI应用层
│   │   │   │   ├── ask/           # 问答应用
│   │   │   │   ├── coding/        # 编程应用
│   │   │   │   ├── image/         # 图像应用
│   │   │   │   ├── office/        # 办公应用
│   │   │   │   ├── research/      # 研究应用
│   │   │   │   ├── simulation/    # 模拟应用
│   │   │   │   ├── social/        # 社交应用
│   │   │   │   ├── teams/         # 团队应用
│   │   │   │   └── writing/       # 写作应用
│   │   │   ├── content/           # 内容层
│   │   │   ├── core/              # 核心层
│   │   │   ├── ingestion/         # 采集层
│   │   │   ├── integrations/      # 集成层
│   │   │   └── credits/           # 积分系统
│   │   ├── common/                # 公共模块
│   │   └── config/                # 应用配置
│   └── prisma/                    # Prisma ORM
│
├── ai-service/                    # FastAPI AI服务
│   ├── models/                    # 数据模型
│   ├── routers/                   # API路由
│   ├── services/                  # 业务服务
│   │   ├── ai_orchestrator.py     # AI编排
│   │   ├── grok_client.py         # Grok客户端
│   │   └── openai_client.py       # OpenAI客户端
│   └── utils/                     # 工具函数
│
├── .claude/                       # Claude Code配置
│   ├── CLAUDE.md                  # 全局配置
│   ├── adrs/                      # 架构决策记录
│   ├── agents/                    # Agent配置
│   ├── analysis/                  # 分析报告
│   ├── commands/                  # 快捷命令
│   ├── skills/                    # 技能定义
│   ├── standards/                 # 编码标准
│   └── tools/                     # 工具脚本
│
├── scripts/                       # 运维脚本
├── docker-compose.yml             # Docker配置
├── STRUCTURE.md                   # 项目结构文档（本文件）
└── README.md                      # 项目说明
```

详细结构请参考: [STRUCTURE.md](STRUCTURE.md)

---

## 🛠️ 技术栈

### 前端技术栈

- **框架**: Next.js 14 (App Router) + React 18 + TypeScript
- **样式**: TailwindCSS + shadcn/ui
- **状态管理**: Zustand
- **数据获取**: TanStack Query
- **富文本**: TipTap (AI Office)
- **图表**: D3.js (知识图谱可视化)

### 后端技术栈

- **框架**: NestJS 10 + Node.js 20 + TypeScript
- **API**: RESTful + GraphQL
- **ORM**: Prisma (PostgreSQL)
- **安全**: Helmet + @nestjs/throttler (限流)
- **文档**: Swagger/OpenAPI

### AI服务技术栈

- **框架**: FastAPI (Python 3.11)
- **AI提供商**:
  - **首选**: Grok API (x.AI) - 速度快、成本优
  - **备用**: OpenAI GPT-4 - 质量高、复杂推理
- **向量搜索**: Qdrant
- **Embedding**: sentence-transformers

### 数据库架构（统一 PostgreSQL）

- **PostgreSQL 16** (唯一数据库):
  - 结构化数据（用户、资源、笔记、评论等）
  - 原始数据存储（JSONB 字段，替代 MongoDB）
  - 知识图谱（Recursive CTEs，替代 Neo4j）
  - 全文搜索（内置 ts_vector）
- **Redis 7**: 缓存、会话管理、实时数据
- **FlareSolverr**: Cloudflare 反爬虫绕过

**架构优势**：

- 💰 **成本优化**: 单一数据库，月成本从 $35-40 降至 $10，节省 70-75%
- 🔧 **运维简化**: 单点管理，无需管理多数据库同步和一致性
- ⚡ **性能提升**: JSONB GIN 索引，Recursive CTE 原生图查询，零性能损失
- 🔄 **备份简化**: 单一备份点，pg_dump 一键备份全量数据
- 🎯 **数据一致性**: 单数据库事务，ACID 保证

---

## 📚 核心功能模块

### 1. 数据采集系统 ✅ 已修复

- **多源采集**: arXiv论文、GitHub项目、HackerNews资讯、技术博客
- **智能去重**: 4层去重机制（URL哈希、标题相似度、内容指纹、作者+时间）
- **原始数据完整存储**: PostgreSQL JSONB字段 + rawDataId双向引用
- **质量评分**: 完整性、准确性、时效性、可用性四维评分
- **实时监控**: Dashboard、任务监控、质量管理、历史记录
- **修复状态**: ✅ 用户反馈的4个致命问题已全部修复（详见 [数据采集验证报告](docs/data-management/data-collection-validation-report.md)）

### 2. AI增强服务

- **智能摘要**: 自动生成论文/项目摘要
- **洞察生成**: 提取关键insights
- **翻译服务**: 多语言支持
- **难度评估**: AI评估内容难度（1-10）
- **Fallback机制**: Grok失败自动切换OpenAI
- **多模型支持**: GPT-4、Claude、Gemini、DeepSeek

### 3. AI Office功能

- **文档编辑器**: 富文本编辑（TipTap）
- **AI写作助手**: 智能补全、改写、扩展
- **多格式导出**: Markdown、HTML、DOCX、PDF
- **PPT生成**: AI自动生成演示文稿
- **模板系统**: 预定义文档模板

### 4. AI Studio研究平台

- **研究项目管理**: 创建和组织研究任务
- **多文件分析**: 支持PDF、Word、网页、YouTube等多种资源
- **AI驱动洞察**: 自动提取关键信息和生成研究笔记
- **知识图谱**: 自动构建概念关联和知识网络
- **协作功能**: 团队研究项目支持

### 5. AI Image图像生成

- **AI绘图**: 集成Flux Pro、Stable Diffusion等主流模型
- **多输入模式**:
  - 直接Prompt输入
  - URL + 描述（参考图生成）
  - 多文件分析（从资料中提取Prompt）
- **历史管理**: 完整的生成历史和参数记录
- **尺寸控制**: 多种宽高比预设和自定义尺寸

### 6. AI Teams 多AI协作

- **主题管理**: 创建和管理研究主题
- **多AI成员**: 添加不同专长的AI助手（GPT-4、Claude等）
- **消息系统**: 完整的对话历史和上下文管理
- **资源关联**: 主题可关联相关资源和文档
- **智能摘要**: 自动生成讨论摘要和关键结论

### 7. AI Ask 智能对话

- **智能对话**: 与 DeepDive AI 进行多轮对话
- **上下文感知**: 理解对话上下文，提供连贯回答
- **会话管理**: 支持多会话切换和历史记录

### 8. AI Coding 代码生成平台 🆕

- **多Agent协作流水线**:
  - PM Agent: 需求分析和产品规划
  - Architect Agent: 系统设计和技术选型
  - PM Lead Agent: 任务分解和优先级排序
  - Engineer Agent: 代码实现和模块开发
  - QA Agent: 测试和质量保证
- **Kanban看板**: 可视化项目管理，支持拖拽排序
- **实时进度推送**: WebSocket 实时更新执行状态
- **任务检查点**: 支持断点恢复，故障容错
- **代码下载**: 生成完整可运行的项目代码

### 9. 报告生成系统

- **多素材分析**: 2-10份资料综合分析
- **报告模板**:
  - 📊 对比分析（技术选型）
  - 📈 趋势报告（技术演进）
  - 🗺️ 学习路径（知识依赖）
  - 📝 文献综述（学术风格）
- **智能导出**: Markdown/PDF/DOCX

### 10. Workspace管理

- **资源组织**: 文件夹、标签、收藏
- **协作功能**: 多人协作、权限管理
- **AI报告**: Workspace级别的AI分析报告
- **搜索**: 全文搜索 + 语义搜索

### 11. Feed流系统

- **个性化推荐**: 基于用户兴趣
- **筛选排序**: 类型、时间、难度、热度
- **实时更新**: 增量加载
- **AI摘要**: 每条内容的AI摘要

### 12. 企业集成

- **企业微信集成**: WechatWorkModule支持企业通知和协作
- **API开放**: 完整的RESTful API供第三方集成

---

## 🔐 安全与最佳实践

### 安全措施

- ✅ **API限流**: 60请求/分钟（可配置）
- ✅ **安全Headers**: Helmet.js（CSP、HSTS等）
- ✅ **输入验证**: class-validator + Zod
- ✅ **SQL注入防护**: Prisma ORM参数化查询
- ✅ **密钥管理**: GCP Secret Manager + 环境变量
- ✅ **全局异常处理**: 统一错误响应格式

### 代码质量

- ✅ **TypeScript严格模式**: 类型安全
- ✅ **ESLint + Prettier**: 代码规范
- ✅ **Conventional Commits**: 提交规范
- ✅ **单元测试**: Jest测试框架（目标80%覆盖率）
- ✅ **E2E测试**: Playwright（待完善）

详见: [项目规则 v2.1](project-rules.md)

---

## 🧪 测试

```bash
# 后端单元测试
cd backend
npm test

# 特定测试
npm test -- hackernews.service.spec.ts

# 测试覆盖率
npm run test:cov

# E2E测试（待完善）
npm run test:e2e
```

当前测试状态:

- HackerNews Service: 69.2% (27/39 tests passing)
- Deduplication Service: 85.7% (24/28 tests passing)

---

## 📖 完整文档

### 📂 文档导航

所有文档已整理到 `docs/` 目录，详见: [文档导航](docs/readme.md)

### 🔍 快速链接

- [产品需求文档 (PRD)](docs/prd.md) - 产品愿景、核心功能、商业模式
- [架构总览](docs/architecture/overview.md) - 系统架构设计
- [API参考](docs/api/readme.md) - 完整API文档
- [开发指南](docs/guides/development.md) - 本地开发环境搭建
- [部署指南](docs/guides/deployment.md) - 生产环境部署
- [服务管理](docs/guides/service-management.md) - 服务启停脚本
- [AI Office文档](docs/features/ai-office/) - AI Office功能详细设计
- [项目规则](project-rules.md) - 开发规范 v2.1

### 📝 文档命名规范

从 v2.1 开始，**所有文件名强制使用小写字母**（5个例外：readme.md、LICENSE、CHANGELOG.md、CONTRIBUTING.md、React组件）

详见: [项目规则 - 文件命名规范](project-rules.md#1-文件与目录命名规范-)

---

## 📊 项目状态

**当前版本**: v0.10-alpha
**完成度**: 约90%
**最后更新**: 2026-01-23

### ✅ 已完成

#### 核心架构

- [x] 产品定义和技术架构
- [x] 项目规范制定（v2.1）
- [x] Monorepo 项目初始化
- [x] **数据库整合**: MongoDB + Neo4j → PostgreSQL（节省 70-75% 成本）
- [x] **知识图谱**: PostgreSQL Recursive CTEs 实现
- [x] **模块化架构**: AI Engine (能力层) + AI Apps (应用层) 分层设计
- [x] 安全加固（限流、Helmet、异常处理）
- [x] 测试框架建立

#### 数据采集系统 ✅ 已修复

- [x] 多源数据采集（arXiv、GitHub、HackerNews、Blog）
- [x] **4层智能去重机制**（URL哈希、标题相似度、内容指纹、作者+时间）
- [x] **原始数据完整存储**（PostgreSQL JSONB + rawDataId双向引用）
- [x] **质量评分系统**（完整性、准确性、时效性、可用性）
- [x] **实时监控Dashboard**（任务进度、质量问题、历史记录）
- [x] **用户反馈问题修复**：4个致命问题已全部解决

#### AI 功能矩阵

- [x] AI 服务集成（Grok + OpenAI + Claude + Gemini）
- [x] **AI Coding 代码生成**（多 Agent 协作、Kanban 看板、WebSocket 实时进度、断点恢复）
- [x] **AI Writing 写作助手**（长文本创作、章节管理、多 AI 协作、版本控制）
- [x] **AI Social 社交内容**（多平台适配、内容优化、定时发布）
- [x] **AI Studio 研究平台**（多文件分析、知识图谱、研究项目管理）
- [x] **AI Teams 多 AI 协作**（主题管理、多模型协作、消息系统）
- [x] **AI Ask 智能对话**（多轮对话、会话管理）
- [x] **AI Office 办公套件**（文档编辑、AI 写作、PPT 生成）
- [x] **AI Image 图像生成**（Flux Pro 集成、多输入模式、历史管理）
- [x] **AI Simulation 模拟辩论**（多角色模拟、辩论分析）
- [x] 报告生成系统（多素材分析、多模板）

#### 用户功能

- [x] Feed流展示（个性化推荐、筛选排序）
- [x] Workspace管理（资源组织、协作功能）
- [x] PDF/HTML代理预览
- [x] 笔记与评论系统
- [x] YouTube视频采集和分析

#### 企业功能

- [x] 企业微信集成（WechatWork）
- [x] API开放平台

### 🚧 进行中

- [ ] AI Office完善（PPT生成优化、更多模板）
- [ ] 知识图谱可视化（D3.js交互式展示）
- [ ] 用户认证系统优化（OAuth、SSO）
- [ ] 测试覆盖率提升（目标80%，当前约70%）
- [ ] 性能优化（Redis缓存策略、查询优化）

### 📅 待开始

- [ ] 个性化推荐算法v2.0（基于知识图谱）
- [ ] 移动端适配（响应式设计）
- [ ] 国际化（i18n多语言支持）
- [ ] 生产环境部署（Docker + K8s）
- [ ] Beta测试计划

详细状态: [.claude/PROJECT_STATUS.md](.claude/PROJECT_STATUS.md)

---

## 🤝 贡献指南

### 开发流程

1. **Fork项目**

   ```bash
   git clone https://github.com/YOUR_USERNAME/ai-teams-engine.git
   cd ai-teams-engine
   ```

2. **创建特性分支**

   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **遵循开发规范**
   - 文件命名: 全部小写 + 连字符（kebab-case）
   - 提交信息: Conventional Commits格式
   - 代码风格: ESLint + Prettier

4. **运行测试**

   ```bash
   npm test
   ```

5. **提交代码**

   ```bash
   git commit -m "feat(scope): add amazing feature"
   ```

6. **推送并创建PR**
   ```bash
   git push origin feature/amazing-feature
   # 然后在GitHub上创建Pull Request
   ```

### 开发规范

- **代码规范**: ESLint + Prettier
- **提交规范**: `feat|fix|docs|style|refactor|test|chore(scope): message`
- **分支规范**: `feature/*` | `bugfix/*` | `hotfix/*`
- **文件命名**: 小写 + 连字符（kebab-case）
- **AI使用**: Grok优先，OpenAI备用
- **密钥管理**: 环境变量或GCP Secret Manager，禁止硬编码

详见: [project-rules.md](project-rules.md)

---

## 📄 许可证

[MIT License](LICENSE)

---

## 👥 团队与联系

### 维护者

DeepDive Team

### 联系方式

- **GitHub**: https://github.com/JUNJIE-DUAN/ai-teams-engine
- **Issues**: https://github.com/JUNJIE-DUAN/ai-teams-engine/issues
- **Email**: team@ai-teams-engine.com

### 参考设计

- [AlphaXiv](https://www.alphaxiv.org/) - UI设计参考

---

## 🙏 致谢

- **AI服务提供商**: x.AI (Grok)、OpenAI (GPT-4)
- **开源社区**: Next.js、NestJS、FastAPI、Prisma等优秀项目
- **数据源**: arXiv、GitHub、HackerNews

---

**Built with ❤️ by DeepDive Team**

_让知识获取更智能、更高效_

---

## 🏗️ 架构演进

### v0.10-alpha (2025-12-21) - AI Coding 代码生成平台 🆕

**新增功能**：

- ✅ **AI Coding 多Agent协作平台**
  - PM Agent: 需求分析和 PRD 生成
  - Architect Agent: 系统设计和技术架构
  - PM Lead Agent: 任务分解和优先级管理
  - Engineer Agent: 代码实现和模块开发
  - QA Agent: 测试用例和质量保证
- ✅ **Kanban看板**（参考 vibe-kanban 设计）
  - 拖拽式项目状态管理
  - Agent执行状态可视化
  - 项目进度追踪
- ✅ **WebSocket实时进度推送**
  - Socket.io Gateway 实现
  - 项目执行事件实时推送
  - 前端 Hook 封装（useAiCodingSocket）
- ✅ **任务检查点持久化**
  - 支持断点恢复执行
  - 24小时检查点有效期
  - 自动清理过期检查点

**技术实现**：

- 后端：NestJS WebSocket Gateway + 事件发射器模式
- 前端：React Hook + Socket.io Client
- 数据：PostgreSQL JSONB 存储检查点

### v0.9-alpha (2025-11-30) - AI功能矩阵完善

**新增功能**：

- ✅ AI Image图像生成（Flux Pro集成）
- ✅ AI Studio研究平台（多文件分析、知识图谱）
- ✅ AI Teams多AI协作（主题管理、多模型协作）
- ✅ AI Ask智能对话（多轮对话、会话管理）
- ✅ 企业微信集成（WechatWork模块）

**数据采集系统重大修复**：

- ✅ 修复原始数据不完整问题（完整JSONB存储）
- ✅ 建立资源双向引用（rawDataId字段）
- ✅ 实现4层智能去重机制
- ✅ 完善质量评分体系

**文档更新**：

- ✅ 更新项目README（新功能说明）
- ✅ 创建数据采集验证报告
- ✅ 添加AI功能矩阵文档

### v0.8-alpha (2025-11-25) - 数据库整合

**核心架构变更**：

- ✅ MongoDB → PostgreSQL (JSONB)
- ✅ Neo4j → PostgreSQL (Recursive CTEs)
- ✅ 成本优化：$35-40/月 → $10/月（节省 70-75%）
- ✅ 性能提升：GIN 索引 + 原生 SQL

### v0.7-alpha (2025-11-15) - 五数据库架构

- PostgreSQL + MongoDB + Neo4j + Redis + Qdrant
- 架构复杂度高，运维成本高
