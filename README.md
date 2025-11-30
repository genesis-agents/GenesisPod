# DeepDive Engine

> AI驱动的知识发现平台 - 从信息到洞察，重构你的知识探索之旅

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-完整文档-green.svg)](docs/readme.md)
[![PRD](https://img.shields.io/badge/产品-PRD-orange.svg)](docs/prd.md)

## 📖 项目简介

DeepDive Engine 是一个 **AI驱动的知识发现平台**，集成了内容聚合、AI分析、知识管理和智能办公功能。

### ⚡ 架构亮点

- **💰 成本优化**: 单一 PostgreSQL 数据库架构，节省 70-75% 数据库成本
- **🔧 技术创新**: JSONB + Recursive CTEs 替代 MongoDB + Neo4j
- **⚡ 高性能**: GIN 索引优化，原生 SQL 查询，零性能损失
- **🛠️ 运维简化**: 单点备份，无需管理多数据库同步

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

#### 👥 AI Group

- **多AI协作**: 集成多个AI模型进行主题讨论
- **主题管理**: 创建和管理研究主题
- **AI成员管理**: 添加不同专长的AI助手
- **消息历史**: 完整的对话记录和导出功能

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
- **数据库**: PostgreSQL 16、Redis 7、Qdrant

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
git clone https://github.com/JUNJIE-DUAN/deepdive-engine.git
cd deepdive-engine
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

- PostgreSQL (5432) - 统一数据库（结构化数据 + 原始数据 + 知识图谱）
- Redis (6379) - 缓存
- Qdrant (6333) - 向量数据库

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
│   ├── readme.md                  # 文档导航
│   ├── prd.md                     # 产品需求文档
│   ├── architecture/              # 架构设计
│   │   ├── overview.md
│   │   ├── ai-context.md
│   │   └── improvements-summary.md
│   ├── api/                       # API文档
│   │   └── readme.md
│   ├── guides/                    # 开发指南
│   │   ├── development.md
│   │   ├── deployment.md
│   │   ├── testing.md
│   │   ├── access.md
│   │   └── service-management.md
│   ├── features/                  # 功能文档
│   │   ├── ai-office/
│   │   ├── data-collection/
│   │   └── workspace-reporting/
│   └── archive/                   # 历史文档归档
│
├── frontend/                      # Next.js 14前端
│   ├── app/                       # App Router页面
│   │   ├── api/                   # API路由
│   │   ├── ai-office/             # AI Office功能
│   │   └── workspace/             # Workspace功能
│   ├── components/                # React组件
│   │   ├── ai-office/             # AI Office组件
│   │   ├── feed/                  # Feed流组件
│   │   └── workspace/             # Workspace组件
│   ├── lib/                       # 工具函数
│   └── stores/                    # Zustand状态管理
│
├── backend/                       # NestJS后端
│   ├── src/
│   │   ├── modules/               # 功能模块
│   │   │   ├── ai/                # AI服务集成
│   │   │   ├── resources/         # 资源管理
│   │   │   ├── reports/           # 报告生成
│   │   │   ├── notes/             # 笔记系统
│   │   │   ├── comments/          # 评论系统
│   │   │   └── crawler/           # 数据采集
│   │   ├── common/                # 共享代码
│   │   │   ├── filters/           # 全局异常过滤器
│   │   │   └── config/            # 配置（限流等）
│   │   └── proxy/                 # PDF/HTML代理服务
│   ├── prisma/                    # Prisma ORM
│   │   └── schema.prisma          # 数据库Schema
│   └── test/                      # 测试文件
│
├── ai-service/                    # FastAPI AI服务
│   ├── services/                  # AI客户端
│   │   ├── grok_client.py         # Grok API（首选）
│   │   ├── openai_client.py       # OpenAI API（备用）
│   │   └── orchestrator.py        # AI服务编排
│   ├── routers/                   # API路由
│   └── utils/                     # 工具函数
│
├── .claude/                       # Claude Code配置
│   ├── TODO.md                    # 任务追踪
│   └── PROJECT_STATUS.md          # 项目状态
│
├── docker-compose.yml             # 本地开发环境
├── project-rules.md               # 开发规范（v2.1）
├── stop-all.bat                   # 停止所有服务
├── start-all.bat                  # 启动所有服务
└── readme.md                      # 本文件
```

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

- **PostgreSQL 16**:
  - 结构化数据（用户、资源、笔记、评论等）
  - 原始数据存储（JSONB，替代 MongoDB）
  - 知识图谱（Recursive CTEs + JSONB，替代 Neo4j）
- **Redis 7**: 缓存、会话管理
- **Qdrant**: 向量存储、语义搜索

**架构优势**：

- 💰 **成本优化**: 单一数据库，节省 70-75% 数据库成本
- 🔧 **运维简化**: 无需管理多个数据库系统
- ⚡ **性能提升**: JSONB GIN 索引，原生 SQL 查询
- 🔄 **备份简化**: 单一备份点，数据一致性保证

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

### 6. AI Group多AI协作

- **主题管理**: 创建和管理研究主题
- **多AI成员**: 添加不同专长的AI助手（GPT-4、Claude等）
- **消息系统**: 完整的对话历史和上下文管理
- **资源关联**: 主题可关联相关资源和文档
- **智能摘要**: 自动生成讨论摘要和关键结论

### 7. 报告生成系统

- **多素材分析**: 2-10份资料综合分析
- **报告模板**:
  - 📊 对比分析（技术选型）
  - 📈 趋势报告（技术演进）
  - 🗺️ 学习路径（知识依赖）
  - 📝 文献综述（学术风格）
- **智能导出**: Markdown/PDF/DOCX

### 8. Workspace管理

- **资源组织**: 文件夹、标签、收藏
- **协作功能**: 多人协作、权限管理
- **AI报告**: Workspace级别的AI分析报告
- **搜索**: 全文搜索 + 语义搜索

### 9. Feed流系统

- **个性化推荐**: 基于用户兴趣
- **筛选排序**: 类型、时间、难度、热度
- **实时更新**: 增量加载
- **AI摘要**: 每条内容的AI摘要

### 10. 企业集成

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

**当前版本**: v0.9-alpha
**完成度**: 约85%
**最后更新**: 2025-11-30

### ✅ 已完成

#### 核心架构

- [x] 产品定义和技术架构
- [x] 项目规范制定（v2.1）
- [x] Monorepo项目初始化
- [x] **数据库整合**：MongoDB + Neo4j → PostgreSQL（节省 70-75% 成本）
- [x] **知识图谱**：PostgreSQL Recursive CTEs 实现
- [x] 安全加固（限流、Helmet、异常处理）
- [x] 测试框架建立

#### 数据采集系统 ✅ 已修复

- [x] 多源数据采集（arXiv、GitHub、HackerNews、Blog）
- [x] **4层智能去重机制**（URL哈希、标题相似度、内容指纹、作者+时间）
- [x] **原始数据完整存储**（PostgreSQL JSONB + rawDataId双向引用）
- [x] **质量评分系统**（完整性、准确性、时效性、可用性）
- [x] **实时监控Dashboard**（任务进度、质量问题、历史记录）
- [x] **用户反馈问题修复**：4个致命问题已全部解决

#### AI功能矩阵

- [x] AI服务集成（Grok + OpenAI + Claude + Gemini）
- [x] AI Office核心功能（文档编辑、AI写作、导出）
- [x] **AI Studio研究平台**（多文件分析、知识图谱、研究项目管理）
- [x] **AI Image图像生成**（Flux Pro集成、多输入模式、历史管理）
- [x] **AI Group多AI协作**（主题管理、多模型协作、消息系统）
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
   git clone https://github.com/YOUR_USERNAME/deepdive-engine.git
   cd deepdive-engine
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

- **GitHub**: https://github.com/JUNJIE-DUAN/deepdive-engine
- **Issues**: https://github.com/JUNJIE-DUAN/deepdive-engine/issues
- **Email**: team@deepdive-engine.com

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

### v0.9-alpha (2025-11-30) - AI功能矩阵完善

**新增功能**：

- ✅ AI Image图像生成（Flux Pro集成）
- ✅ AI Studio研究平台（多文件分析、知识图谱）
- ✅ AI Group多AI协作（主题管理、多模型协作）
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
