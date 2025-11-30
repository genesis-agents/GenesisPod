# AI Studio v3.1 任务跟踪

## 快速导航

- [P0 紧急修复](#p0-紧急修复week-1)
- [P1 核心功能](#p1-核心差异化week-2-3)
- [P2 体验增强](#p2-体验增强week-4-5)

---

## P0 紧急修复（Week 1）

### P0-1 资源去重管道

- [x] **P0-1.1** 创建 `DeduplicationService` 类
  - 文件: `backend/src/modules/resources/deduplication.service.ts`
  - 实现 URL 规范化
  - 实现 SimHash 指纹计算
  - 实现相似度检测

- [x] **P0-1.2** 数据库 Schema 更新
  - 文件: `backend/prisma/schema.prisma`
  - 添加 `normalizedUrl` 字段
  - 添加 `contentFingerprint` 字段
  - 添加质量评估字段

- [x] **P0-1.3** 创建数据库迁移
  - 文件: `backend/prisma/migrations/20251128_add_deduplication_fields/migration.sql`
  - 待执行: 启动 Docker 后运行 `npx prisma migrate deploy`

- [x] **P0-1.4** 单元测试
  - 文件: `backend/src/modules/resources/deduplication.service.spec.ts`
  - 覆盖: URL规范化、指纹计算、相似度计算、去重检测、质量评估

### P0-2 RawData-Resource 关系修复

- [x] **P0-2.1** 检查 Schema 关系定义
  - 确保 `RawData.resourceId` 正确关联
  - 添加反向关系

- [x] **P0-2.2** 创建关系修复脚本
  - 文件: `backend/scripts/fix-rawdata-relations.ts`
  - 功能: 查找孤立RawData、匹配/创建Resource、验证双向关联

### P0-3 资源元数据补全

- [ ] **P0-3.1** 增强 arXiv 爬虫
  - 补全作者、机构、引用数

- [ ] **P0-3.2** 增强 GitHub 爬虫
  - 补全 stars、forks、contributors

- [ ] **P0-3.3** 增强 HackerNews 爬虫
  - 补全评论数、得分

### P0-4 RAG 引用精确化

- [x] **P0-4.1** 创建 `PreciseCitationService`
  - 文件: `ai-service/services/precise_citation.py`

- [ ] **P0-4.2** 修改对话接口返回引用信息

- [x] **P0-4.3** 前端引用预览组件
  - 文件: `frontend/components/ai-studio/CitationPreview.tsx`

### P0-5 数据清洗脚本

- [x] **P0-5.1** 创建清洗脚本
  - 文件: `backend/scripts/clean-duplicate-resources.ts`
  - 合并重复资源
  - 更新关联关系

- [ ] **P0-5.2** 执行数据清洗（生产环境需备份）

---

## P1 核心差异化（Week 2-3）

### P1-1 趋势报告生成

- [x] **P1-1.1** 创建 `TrendAnalysisService`
  - 文件: `ai-service/services/trend_analysis.py`
  - 实现资源收集
  - 实现技术提取
  - 实现趋势分析
  - 实现 Hype Cycle 数据生成

- [x] **P1-1.2** 创建 API 端点
  - 文件: `ai-service/routers/trend.py`
  - `POST /api/v1/trend/report`
  - `POST /api/v1/trend/compare`
  - `POST /api/v1/trend/hype-cycle`

- [x] **P1-1.3** 前端趋势报告组件
  - 文件: `frontend/components/ai-studio/TrendReport.tsx`

### P1-2 技术对比矩阵

- [x] **P1-2.1** 创建 `TechComparisonService`
  - 文件: `ai-service/services/trend_analysis.py` (包含在趋势分析服务中)

- [x] **P1-2.2** 前端对比组件
  - 文件: `frontend/components/ai-studio/ComparisonMatrix.tsx`

### P1-3 Command Palette

- [x] **P1-3.1** 创建 `CommandPalette` 组件
  - 文件: `frontend/components/ai-studio/CommandPalette.tsx`
  - 快捷键 `Cmd+K`
  - 命令分组
  - 搜索过滤
  - 最近使用

- [x] **P1-3.2** 集成到布局
  - 文件: `frontend/components/ai-office/layout/WorkspaceLayout.tsx`

### P1-4 研究计划可视化

- [x] **P1-4.1** 创建 `ResearchPlan` 组件
  - 文件: `frontend/components/ai-studio/ResearchPlan.tsx`

- [x] **P1-4.2** 创建 `aiStudioStore`
  - 文件: `frontend/stores/aiStudioStore.ts`
  - ResearchPlanStore
  - TrendAnalysisStore
  - TechComparisonStore
  - CitationStore
  - FocusModeStore
  - CommandPaletteStore

### P1-5 斜杠命令系统

- [x] **P1-5.1** 实现命令解析器
  - `/trend`, `/compare`, `/graph`, `/summary`, `/ppt`
  - 集成在 CommandPalette 组件中

- [x] **P1-5.2** 集成到聊天输入框
  - 文件: `frontend/components/ai-office/chat/SlashCommandMenu.tsx`
  - 文件: `frontend/components/ai-office/chat/ChatPanel.tsx`
  - 支持 /trend, /compare, /summary, /ppt, /graph, /insights, /hype, /search

---

## P2 体验增强（Week 4-5）

### P2-1 知识图谱可视化

- [x] **P2-1.1** 创建 `KnowledgeGraph` 组件
  - 文件: `frontend/components/ai-studio/KnowledgeGraph.tsx`
  - 力导向图布局
  - 节点交互
  - 搜索高亮

- [x] **P2-1.2** 后端图谱数据服务
  - 文件: `backend/src/common/graph/graph.service.ts`
  - 文件: `backend/src/modules/knowledge-graph/knowledge-graph.service.postgres.ts`
  - 文件: `backend/src/modules/knowledge-graph/knowledge-graph.controller.ts`
  - 功能: 资源/作者/主题图谱、相似资源查找、图谱概览

### P2-2 Focus Modes

- [x] **P2-2.1** 实现 5 种模式 Store
  - Research: Top 85%
  - Analysis: Top 30%
  - Graph: 全屏图谱
  - Report: Gallery 展开
  - Zen: 仅 Chat

- [x] **P2-2.2** 快捷键绑定
  - `Cmd+1` 到 `Cmd+5`
  - 集成在 aiStudioStore 中

### P2-3 Hype Cycle 图表

- [x] **P2-3.1** 创建 `HypeCycleChart` 组件
  - 文件: `frontend/components/ai-studio/HypeCycleChart.tsx`
  - SVG 绘制技术成熟度曲线
  - 交互式技术点
  - 阶段图例

### P2-4 趋势预测

- [ ] **P2-4.1** 实现预测模型
  - 基于历史数据预测未来趋势

---

## 已完成文件清单

### Backend (NestJS)

- `backend/src/modules/resources/deduplication.service.ts` - 资源去重服务
- `backend/src/modules/resources/deduplication.service.spec.ts` - 去重服务单元测试
- `backend/src/modules/resources/resources.module.ts` - 模块更新
- `backend/prisma/schema.prisma` - 更新了去重和质量评估字段
- `backend/prisma/migrations/20251128_add_deduplication_fields/migration.sql` - 数据库迁移
- `backend/scripts/clean-duplicate-resources.ts` - 数据清洗脚本
- `backend/scripts/fix-rawdata-relations.ts` - RawData-Resource关系修复脚本
- `backend/src/common/graph/graph.service.ts` - PostgreSQL图谱服务
- `backend/src/modules/knowledge-graph/knowledge-graph.service.postgres.ts` - 知识图谱服务
- `backend/src/modules/knowledge-graph/knowledge-graph.controller.ts` - 知识图谱API

### AI Service (FastAPI)

- `ai-service/services/precise_citation.py` - 精确引用服务
- `ai-service/services/trend_analysis.py` - 趋势分析和技术对比服务
- `ai-service/routers/trend.py` - 趋势分析 API 路由
- `ai-service/main.py` - 注册趋势路由

### Frontend (Next.js)

- `frontend/components/ai-studio/CommandPalette.tsx` - 命令面板组件
- `frontend/components/ai-studio/ResearchPlan.tsx` - 研究计划组件
- `frontend/components/ai-studio/CitationPreview.tsx` - 引用预览组件
- `frontend/components/ai-studio/TrendReport.tsx` - 趋势报告组件
- `frontend/components/ai-studio/ComparisonMatrix.tsx` - 技术对比矩阵组件
- `frontend/components/ai-studio/HypeCycleChart.tsx` - Hype Cycle 图表组件
- `frontend/components/ai-studio/KnowledgeGraph.tsx` - 知识图谱组件
- `frontend/components/ai-studio/index.ts` - 组件导出索引
- `frontend/components/ai-office/layout/WorkspaceLayout.tsx` - 集成 CommandPalette
- `frontend/components/ai-office/chat/SlashCommandMenu.tsx` - 斜杠命令菜单组件
- `frontend/components/ai-office/chat/ChatPanel.tsx` - 集成斜杠命令
- `frontend/stores/aiStudioStore.ts` - AI Studio 状态管理

---

## 验收检查清单

### P0 验收

- [x] 同一 URL 不会重复入库 (DeduplicationService 实现)
- [ ] 资源信息完整率 > 90%
- [x] RAG 引用可追溯到原文 (PreciseCitationService 实现)
- [x] 历史重复数据清洗脚本 (clean-duplicate-resources.ts)

### P1 验收

- [x] `/trend LLM` 能生成趋势报告 (API + 组件已实现)
- [x] `/compare A vs B` 能生成对比表 (API + 组件已实现)
- [x] `Cmd+K` 能打开命令面板 (组件已集成)
- [x] 研究计划显示执行进度 (组件已实现)
- [x] 聊天输入框支持斜杠命令 (SlashCommandMenu 已集成)

### P2 验收

- [x] 知识图谱组件 (KnowledgeGraph 已实现)
- [x] 知识图谱后端服务 (GraphService + API 已实现)
- [x] Focus Mode Store (aiStudioStore 已实现)
- [x] Hype Cycle 图表 (HypeCycleChart 已实现)

---

## 下一步待办

1. **运行数据库迁移**（需要先启动 Docker）

   ```bash
   cd backend && npx prisma migrate deploy
   ```

2. **执行关系修复脚本**

   ```bash
   cd backend && npx ts-node scripts/fix-rawdata-relations.ts --dry-run  # 预览
   cd backend && npx ts-node scripts/fix-rawdata-relations.ts            # 执行
   ```

3. **执行数据清洗**

   ```bash
   cd backend && npx ts-node scripts/clean-duplicate-resources.ts --dry-run  # 预览
   cd backend && npx ts-node scripts/clean-duplicate-resources.ts            # 执行
   ```

4. **增强爬虫元数据补全** (P0-3)
   - arXiv: 作者、机构、引用数
   - GitHub: stars、forks、contributors
   - HackerNews: 评论数、得分

5. **趋势预测模型** (P2-4)
   - 基于历史数据预测未来趋势

---

## 每日站会模板

```markdown
### 日期: YYYY-MM-DD

#### 昨日完成

-

#### 今日计划

-

#### 阻塞问题

-

#### 需要支持

-
```

---

## 问题记录

| ID  | 问题 | 状态 | 负责人 | 解决方案 |
| --- | ---- | ---- | ------ | -------- |
|     |      |      |        |          |

---

**最后更新**: 2025-11-28 (已完成 P0-1.4, P0-2.2, P1-5.2, P2-1.2)
