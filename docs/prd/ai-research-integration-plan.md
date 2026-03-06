# AI 洞察 / AI 研究 / AI 报告 三模块联动方案

## 文档信息

- 版本: 1.0
- 作者: PM Agent
- 创建日期: 2026-02-20
- 状态: 草稿

---

## 1. 产品愿景与设计原则

### 1.1 三模块定位重新梳理

| 层级       | 模块                         | 定位                             | 核心价值                     |
| ---------- | ---------------------------- | -------------------------------- | ---------------------------- |
| 情报监控层 | AI 洞察 (Topic Insights)     | 持续监控、结构化维度追踪         | 发现信号、沉淀情报、长期积累 |
| 深度钻探层 | AI 研究 (Research/AI Studio) | 单次深度研究、迭代讨论、多轮搜索 | 深入分析、假设验证、知识生产 |
| 交付输出层 | AI 报告 (Office/Slides)      | 结构化呈现、多 Agent 生成 PPT    | 专业输出、视觉呈现、一键交付 |

三者构成一条完整的**情报价值链**:

```
发现信号 (AI 洞察) → 深入分析 (AI 研究) → 专业交付 (AI 报告)
     ↑                                          |
     └──── 发现沉淀（反向回流）←─────────────────┘
```

### 1.2 联动设计核心原则

**P1: 减少摩擦 (Zero Friction)**

- 跨模块跳转不超过 2 次点击
- 目标模块自动预填上下文，无需用户手动复制粘贴
- 跳转后用户可立即开始工作，而非从零配置

**P2: 上下文不丢失 (Context Preservation)**

- 携带来源模块的关键信息（标题、摘要、证据链、维度结构）
- 目标模块保留对来源的引用链接，支持溯源
- 跳转参数通过 URL query params 传递，支持浏览器前进后退

**P3: 结果可回流 (Result Backflow)**

- 深度研究的成果可以沉淀回洞察系统
- 报告生成的内容可以反向丰富来源数据
- 所有回流操作均为用户主动触发，不自动覆盖

**P4: 架构合规 (Architecture Compliance)**

- AI App 模块之间不直接 import 内部 Service
- 跨模块通信通过 public API 端点 + 事件系统（EventEmitter2）
- 数据模型只增不改，向后兼容

---

## 2. 用户旅程设计

### 场景 1: 情报分析师的日常工作

**Before (当前状态)**

1. 在 AI 洞察中发现「某政策变化」的高信号维度
2. 想深入了解具体影响 → 手动复制报告摘要和证据链接
3. 切换到 AI 研究 → 创建新项目 → 手动粘贴内容作为项目描述
4. 研究完成后 → 手动复制结论 → 回到 AI 洞察没有地方放
5. 想做汇报 PPT → 再次复制研究内容 → 切换到 AI 报告 → 手动粘贴

**After (联动后)**

1. 在 AI 洞察中发现「某政策变化」信号 → 点击「深入研究」按钮
2. 自动跳转到 AI 研究，项目已预填主题、相关摘要和证据来源
3. 完成深度研究后 → 点击「沉淀到洞察」→ 选择目标 Topic/新建维度
4. 研究结论自动回流成为 AI 洞察的新维度内容
5. 在 AI 洞察报告页点击「生成报告」→ 自动跳转 AI 报告并开始生成

### 场景 2: 高管汇报准备

**Before**

1. AI 洞察已有完整的行业分析报告
2. 需要做成 PPT → 手动打开 AI 报告页面
3. 在「选择来源」步骤搜索并找到对应 Topic
4. 导入后手动调整

**After**

1. 在 AI 洞察报告页顶部点击「生成 PPT」
2. 自动跳转到 AI 报告页，跳过来源选择步骤，直接开始生成
3. 生成完成后，报告页标记来源为「关联 Topic: xxx」

### 场景 3: 研究项目交付

**Before**

1. AI 研究完成深度分析，生成了 Briefing Doc 输出
2. 想做成 PPT → 复制 Markdown 内容 → 粘贴到 AI 报告
3. AI 报告从零分析文本，丢失了原有结构信息

**After**

1. AI 研究的 Output 完成后，操作区出现「生成 PPT」按钮
2. 点击后携带 projectId 跳转 AI 报告
3. AI 报告通过已有的 `importFromWriting` 接口导入结构化数据
4. 保留原有章节结构、关键发现、数据图表

---

## 3. 六大联动功能规格说明

### F1: AI 洞察 → AI 研究 (信号深挖)

**用户故事**

> 作为情报分析师，我在 AI 洞察报告中发现了一个值得深入的信号（某维度的高亮发现或某条证据），我想要一键跳转到 AI 研究创建一个预填好上下文的研究项目，以便快速进入深度分析。

**交互入口位置**

| 入口         | 组件文件                                                          | 触发元素                      |
| ------------ | ----------------------------------------------------------------- | ----------------------------- |
| 报告高亮条目 | `frontend/components/ai-insights/topics/TopicReportView.tsx`      | 每个 highlight 条目的操作菜单 |
| 证据条目     | `frontend/components/ai-insights/topics/TopicReferencesPanel.tsx` | 每条 evidence 的操作菜单      |
| 维度卡片     | `frontend/components/ai-insights/topics/TopicContentPanel.tsx`    | 维度标题区的「深入研究」按钮  |

**交互流程**

```
1. 用户在 TopicReportView 中，hover 某个 highlight 条目
2. 出现操作菜单，包含「深入研究」选项（Lucide: Search 图标）
3. 点击后，前端构建跳转 URL:
   /ai-studio?action=create
     &fromModule=topic-insights
     &fromTopicId={topicId}
     &fromDimensionId={dimensionId}  // 可选，如果是从维度入口
     &contextTitle={encodeURIComponent(highlight.text || evidence.title)}
     &contextSummary={encodeURIComponent(executiveSummary 前 500 字)}
4. AI 研究页面检测 query params，弹出预填的创建项目对话框:
   - name: "深入研究: {contextTitle}" (可编辑)
   - description: contextSummary + "\n\n---\n来源: AI 洞察 - {topicName}"
5. 用户确认创建后，项目自动添加一个 source:
   - sourceType: "topic-insights"
   - title: topicName
   - sourceUrl: /ai-insights/topic/{topicId}
   - abstract: executiveSummary
```

**参数传递规格**

| 参数            | 类型                          | 必填 | 说明               |
| --------------- | ----------------------------- | ---- | ------------------ |
| action          | `"create"`                    | Y    | 触发创建项目流程   |
| fromModule      | `"topic-insights"`            | Y    | 来源模块标识       |
| fromTopicId     | string (UUID)                 | Y    | 来源 Topic ID      |
| fromDimensionId | string (UUID)                 | N    | 来源维度 ID        |
| contextTitle    | string (URL encoded, max 200) | Y    | 预填的项目名称片段 |
| contextSummary  | string (URL encoded, max 500) | N    | 预填的项目描述     |

---

### F2: AI 研究 → AI 洞察 (发现沉淀)

**用户故事**

> 作为研究员，我在 AI 研究中完成了一次深度分析并生成了 Output，我想要将研究结论沉淀回 AI 洞察系统，创建为指定 Topic 的新维度或新建一个 Topic，以便长期追踪。

**交互入口位置**

| 入口          | 组件文件                                                                   | 触发元素                  |
| ------------- | -------------------------------------------------------------------------- | ------------------------- |
| Output 完成后 | `frontend/components/ai-studio/outputs/OutputCard.tsx`（待确认实际组件名） | Output 内容区底部的操作栏 |
| 项目详情页    | 项目详情页的顶部操作菜单                                                   | 「沉淀到洞察」菜单项      |

> 注: AI 研究的前端组件路径需根据实际项目结构确认。当前代码库中 AI 研究前端入口为 `frontend/app/ai-studio/` 或类似路径，组件可能在 `frontend/components/` 下对应目录中。

**交互流程**

```
1. 用户在 AI 研究的 Output 页面，看到已完成的研究产出
2. 操作区显示「沉淀到洞察」按钮（Lucide: BookOpen 图标）
3. 点击后弹出 Modal:
   a. 选择模式: 「添加到已有 Topic」或「新建 Topic」
   b. 若选择已有 Topic:
      - 调用 GET /api/topic-insights/topics?take=20 获取用户的 Topic 列表
      - 用户选择目标 Topic
      - 输入维度名称 (默认从 Output title 提取)
      - 输入维度描述 (默认从 Output content 前 200 字)
   c. 若选择新建 Topic:
      - 输入 Topic 名称 (默认: Output title)
      - 选择类型 (默认: MACRO_INSIGHT)
      - 自动添加一个维度，内容来自 Output
4. 用户确认后:
   a. 前端调用后端新增 API: POST /api/ai-studio/projects/{projectId}/sediment
   b. 后端通过 HTTP 调用 AI 洞察的 public API 创建维度/Topic
   c. 返回创建结果，前端显示成功提示并附带跳转链接
```

**参数传递规格 (POST body)**

```typescript
interface SedimentToInsightsDto {
  outputId: string; // 要沉淀的 Output ID
  mode: "add_dimension" | "new_topic";
  // mode = add_dimension 时:
  targetTopicId?: string; // 目标 Topic ID
  dimensionName?: string; // 新维度名称
  dimensionDescription?: string; // 新维度描述
  // mode = new_topic 时:
  topicName?: string; // 新 Topic 名称
  topicType?: string; // Topic 类型
  topicDescription?: string; // Topic 描述
}
```

---

### F3: AI 洞察 → AI 报告 (一键成报)

**用户故事**

> 作为用户，我在查看 AI 洞察的报告时，想要一键将这份报告转化为 PPT 演示文稿，以便直接用于汇报展示。

**交互入口位置**

| 入口           | 组件文件                                                     | 触发元素                     |
| -------------- | ------------------------------------------------------------ | ---------------------------- |
| 报告视图顶部   | `frontend/components/ai-insights/topics/TopicReportView.tsx` | 报告操作栏的「生成 PPT」按钮 |
| 报告视图操作区 | `frontend/components/ai-insights/topics/TopicDetail.tsx`     | 详情页顶部工具栏             |

**交互流程**

```
1. 用户在 TopicReportView 查看报告，顶部操作栏有「生成 PPT」按钮（Lucide: Presentation 图标）
2. 点击后弹出轻量配置面板:
   - 目标页数 (默认: 根据维度数量自动推荐，一般 8-15 页)
   - 风格偏好 (dark/light，默认 dark)
   - 主题选择 (调用 GET /api/ai-office/slides/themes/list)
   - 目标受众 (可选输入)
3. 用户点击「开始生成」
4. 前端构建跳转 URL 并跳转:
   /ai-office/slides?action=generate
     &sourceType=research
     &sourceId={topicId}
     &targetPages={targetPages}
     &stylePreference={style}
     &themeId={themeId}
     &targetAudience={encodeURIComponent(audience)}
5. AI 报告页面检测 query params:
   a. 自动调用 POST /api/ai-office/slides/import/research/{topicId} 获取 SlidesSourceData
   b. 跳过来源选择步骤，直接进入生成流程
   c. 以导入的 sourceText 作为输入，触发 SSE 生成
```

**参数传递规格**

| 参数            | 类型                 | 必填 | 说明         |
| --------------- | -------------------- | ---- | ------------ |
| action          | `"generate"`         | Y    | 直接触发生成 |
| sourceType      | `"research"`         | Y    | 来源类型     |
| sourceId        | string (UUID)        | Y    | Topic ID     |
| targetPages     | number               | N    | 目标页数     |
| stylePreference | `"dark" \| "light"`  | N    | 风格         |
| themeId         | string               | N    | 主题 ID      |
| targetAudience  | string (URL encoded) | N    | 目标受众     |

---

### F4: AI 研究 → AI 报告 (研究成稿)

**用户故事**

> 作为研究员，我完成了一个深度研究项目并生成了研究产出，我想要将研究成果直接转化为演示文稿。

**交互入口位置**

| 入口          | 组件文件                | 触发元素             |
| ------------- | ----------------------- | -------------------- |
| Output 完成后 | AI 研究的 Output 展示区 | 「生成 PPT」按钮     |
| 项目详情页    | 项目详情页操作菜单      | 「导出为 PPT」菜单项 |

**交互流程**

```
1. 用户在 AI 研究的 Output 页面，已完成的 Output 操作区有「生成 PPT」按钮
2. 点击后，前端构建跳转 URL:
   /ai-office/slides?action=generate
     &sourceType=studio
     &sourceId={projectId}
     &outputId={outputId}
3. AI 报告页面检测 query params:
   a. 调用新增 API: POST /api/ai-office/slides/import/studio/{projectId}
      - 请求体: { outputId: string }
      - 后端通过 HTTP 调用 AI 研究的 public API 获取项目和 Output 数据
      - 构建 SlidesSourceData 结构
   b. 跳过来源选择，直接进入生成
```

**参数传递规格**

| 参数       | 类型          | 必填 | 说明                         |
| ---------- | ------------- | ---- | ---------------------------- |
| action     | `"generate"`  | Y    | 直接触发生成                 |
| sourceType | `"studio"`    | Y    | 来源类型                     |
| sourceId   | string (UUID) | Y    | Research Project ID          |
| outputId   | string (UUID) | N    | 指定 Output ID（无则用最新） |

---

### F5: AI 报告订阅来源更新 (持续刷新)

**用户故事**

> 作为用户，我基于 AI 洞察的报告生成了一份 PPT。当洞察的来源 Topic 刷新后，我希望收到通知并能一键更新 PPT 中受影响的页面。

**数据模型扩展**

在 `SlidesMission` 模型新增字段:

```prisma
model SlidesMission {
  // ... 现有字段 ...

  // 来源订阅（新增）
  sourceSubscription Json? @map("source_subscription")
  // 结构: {
  //   type: "topic-insights" | "ai-studio",
  //   sourceId: string,
  //   subscribedAt: string (ISO date),
  //   lastSourceUpdatedAt: string (ISO date),
  //   isStale: boolean
  // }
}
```

**交互流程**

```
1. 当 F3/F4 生成 PPT 时，自动创建 sourceSubscription 记录
2. AI 洞察刷新完成后，通过 EventEmitter2 发布事件:
   eventEmitter.emit('topic-insights.report.refreshed', {
     topicId: string,
     reportId: string,
     refreshedAt: Date
   })
3. AI 报告模块监听此事件（通过 @OnEvent 装饰器）:
   - 查询所有 sourceSubscription.sourceId === topicId 的 SlidesMission
   - 将这些 mission 的 sourceSubscription.isStale 设为 true
4. 前端在 AI 报告的 session 列表 / 详情页:
   - 检测 isStale 字段
   - 显示「来源已更新」提示徽标
   - 提供「刷新报告」按钮
5. 用户点击「刷新报告」:
   - 重新调用 import API 获取最新数据
   - 对比差异，仅重新生成受影响的页面
   - 更新 sourceSubscription.lastSourceUpdatedAt，isStale 设为 false
```

**事件规格**

```typescript
// 事件名: topic-insights.report.refreshed
interface TopicReportRefreshedEvent {
  topicId: string;
  reportId: string;
  reportVersion: number;
  refreshedAt: Date;
  changedDimensions: string[]; // 变化的维度 ID 列表
}

// 事件名: ai-studio.output.completed
interface StudioOutputCompletedEvent {
  projectId: string;
  outputId: string;
  outputType: string;
  completedAt: Date;
}
```

---

### F6: 跨模块「相关内容」推荐

**用户故事**

> 作为用户，当我在 AI 研究中创建新项目时，系统推荐与研究主题相关的 AI 洞察 Topic，帮助我了解是否已有相关情报积累。反之，在 AI 洞察的 Topic 详情页，我也能看到相关的研究项目。

**交互入口位置**

| 入口               | 组件文件                                                 | 位置                       |
| ------------------ | -------------------------------------------------------- | -------------------------- |
| AI 研究创建项目    | 创建项目对话框                                           | 输入名称后，底部显示推荐区 |
| AI 洞察 Topic 详情 | `frontend/components/ai-insights/topics/TopicDetail.tsx` | 侧边栏新增「相关研究」Tab  |

**交互流程**

```
A. AI 研究 → 推荐相关 AI 洞察 Topic:
   1. 用户在创建项目对话框输入名称
   2. debounce 300ms 后，调用 GET /api/topic-insights/topics?search={keyword}&take=5
   3. 返回匹配的 Topic 列表
   4. 显示在创建对话框底部: "已有相关洞察专题:"
   5. 点击 Topic 名称可在新标签页打开

B. AI 洞察 → 展示相关研究项目:
   1. Topic 详情页的侧边 Tab 区新增「相关研究」
   2. 加载时调用 GET /api/ai-studio/projects?search={topicName}&take=5
   3. 展示匹配的研究项目列表
   4. 点击项目名称可在新标签页打开
```

**推荐算法 (Phase 1: 简单文本匹配)**

Phase 1 使用关键词搜索，不需要额外模型:

- 取 Topic/Project 的 name 进行分词
- 搜索对方模块的 name + description 字段
- 按更新时间排序，返回 Top 5

Phase 2（未来）可引入 Embedding 相似度匹配。

---

## 4. 数据模型变更

### 4.1 `SlidesMission` 新增字段

文件: `backend/prisma/schema/models.prisma`

```prisma
model SlidesMission {
  // ... 现有字段保持不变 ...

  // ========== 来源订阅（新增） ==========
  sourceSubscription Json? @map("source_subscription")
  // JSON 结构:
  // {
  //   type: "topic-insights" | "ai-studio",
  //   sourceId: string,           // Topic ID 或 Project ID
  //   sourceName: string,         // 来源名称快照
  //   subscribedAt: string,       // ISO date
  //   lastSourceUpdatedAt: string, // ISO date
  //   isStale: boolean            // 来源是否有更新
  // }
}
```

### 4.2 `ResearchProject` 新增字段

文件: `backend/prisma/schema/models.prisma`

```prisma
model ResearchProject {
  // ... 现有字段保持不变 ...

  // ========== 跨模块来源引用（新增） ==========
  crossModuleSource Json? @map("cross_module_source")
  // JSON 结构:
  // {
  //   module: "topic-insights",
  //   sourceId: string,           // Topic ID
  //   dimensionId?: string,       // 可选维度 ID
  //   contextTitle: string,       // 来源上下文标题
  //   contextSummary: string,     // 来源上下文摘要
  //   linkedAt: string            // ISO date
  // }
}
```

### 4.3 `ResearchTopic` 新增字段

文件: `backend/prisma/schema/models.prisma`

```prisma
model ResearchTopic {
  // ... 现有字段保持不变 ...

  // ========== 关联研究项目引用（新增） ==========
  linkedResearchIds Json? @default("[]") @map("linked_research_ids")
  // JSON 结构: string[] - 关联的 Research Project ID 列表
}
```

### 4.4 迁移脚本

文件: `backend/prisma/migrations/20260220_cross_module_linking/migration.sql`

```sql
-- 为 SlidesMission 添加来源订阅字段
ALTER TABLE "slides_missions" ADD COLUMN IF NOT EXISTS "source_subscription" JSONB;

-- 为 ResearchProject 添加跨模块来源引用字段
ALTER TABLE "research_projects" ADD COLUMN IF NOT EXISTS "cross_module_source" JSONB;

-- 为 ResearchTopic 添加关联研究项目 ID 列表
ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "linked_research_ids" JSONB DEFAULT '[]';
```

---

## 5. API 变更清单

### 5.1 新增 API 端点

#### A. AI 研究模块新增

**1. 沉淀到洞察**

```
POST /api/ai-studio/projects/:projectId/sediment
```

请求体:

```json
{
  "outputId": "uuid",
  "mode": "add_dimension | new_topic",
  "targetTopicId": "uuid",
  "dimensionName": "string",
  "dimensionDescription": "string",
  "topicName": "string",
  "topicType": "MACRO_INSIGHT | INDUSTRY_RESEARCH | ...",
  "topicDescription": "string"
}
```

响应体:

```json
{
  "success": true,
  "result": {
    "mode": "add_dimension",
    "topicId": "uuid",
    "dimensionId": "uuid",
    "topicName": "string",
    "dimensionName": "string",
    "viewUrl": "/ai-insights/topic/{topicId}"
  }
}
```

实现方式: 后端通过 HTTP 调用 AI 洞察的 public API (`POST /api/topic-insights/topics` 或 `POST /api/topic-insights/topics/:id/dimensions`)，不直接 import Topic Insights 的 Service。

**2. 获取带跨模块来源的项目详情**

无需新增端点，修改现有 `GET /api/ai-studio/projects/:id` 响应中包含 `crossModuleSource` 字段即可。

#### B. AI 报告 (Slides) 模块新增

**3. 从 AI 研究项目导入**

```
POST /api/ai-office/slides/import/studio/:projectId
```

请求体:

```json
{
  "outputId": "uuid" // 可选，指定导入哪个 Output
}
```

响应体:

```json
{
  "data": {
    "sourceText": "string",
    "sourceType": "studio",
    "sourceId": "uuid",
    "sections": [...],
    "keyFindings": [...],
    "references": [...],
    "metadata": {
      "title": "string",
      "createdAt": "ISO date"
    }
  }
}
```

实现方式: 新增 `IStudioDataExport` 接口和 DI Token（参照现有 `IResearchDataExport` 模式），由 AI 研究模块注册 provider。

**4. 更新来源订阅状态**

```
PATCH /api/ai-office/slides/sessions/:sessionId/subscription
```

请求体:

```json
{
  "action": "refresh | unsubscribe"
}
```

响应体:

```json
{
  "success": true,
  "subscription": {
    "isStale": false,
    "lastSourceUpdatedAt": "ISO date"
  }
}
```

**5. 获取 Session 的订阅状态**

无需新增端点，修改现有 `GET /api/ai-office/slides/sessions/:sessionId` 响应中包含 `sourceSubscription` 字段即可。

#### C. AI 洞察模块新增

**6. 从外部来源创建维度**

已有: `POST /api/topic-insights/topics/:id/dimensions` (AddDimensionDto)

需要在 `AddDimensionDto` 中扩展可选字段:

```typescript
class AddDimensionDto {
  // ... 现有字段 ...

  // 新增: 外部来源信息（可选）
  @IsOptional()
  @IsObject()
  externalSource?: {
    module: string; // "ai-studio"
    sourceId: string; // Project ID
    outputId?: string; // Output ID
    linkedAt: string; // ISO date
  };
}
```

### 5.2 现有 API 修改

| API                                             | 修改内容                                                 |
| ----------------------------------------------- | -------------------------------------------------------- |
| `GET /api/ai-studio/projects/:id`               | 响应中增加 `crossModuleSource` 字段                      |
| `POST /api/ai-studio/projects`                  | CreateStudioProjectDto 增加 `crossModuleSource` 可选字段 |
| `GET /api/ai-office/slides/sessions/:sessionId` | 响应中增加 `sourceSubscription` 字段                     |
| `GET /api/ai-office/slides/sessions`            | 列表响应中增加 `sourceSubscription.isStale` 字段         |

---

## 6. 前端变更清单

### 6.1 AI 洞察模块

| 文件路径                                                          | 修改内容                                     |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `frontend/components/ai-insights/topics/TopicReportView.tsx`      | 报告操作栏新增「深入研究」和「生成 PPT」按钮 |
| `frontend/components/ai-insights/topics/TopicReferencesPanel.tsx` | 每条证据的操作菜单增加「深入研究」选项       |
| `frontend/components/ai-insights/topics/TopicContentPanel.tsx`    | 维度卡片增加「深入研究」入口                 |
| `frontend/components/ai-insights/topics/TopicDetail.tsx`          | 侧边栏新增「相关研究」Tab                    |

**新增组件:**

| 组件                   | 路径                                                              | 说明                                    |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| `DeepDiveButton`       | `frontend/components/ai-insights/topics/DeepDiveButton.tsx`       | 「深入研究」跳转按钮，封装 URL 构建逻辑 |
| `GenerateSlidesButton` | `frontend/components/ai-insights/topics/GenerateSlidesButton.tsx` | 「生成 PPT」按钮，含轻量配置面板        |
| `RelatedResearchTab`   | `frontend/components/ai-insights/topics/RelatedResearchTab.tsx`   | 相关研究项目列表                        |

### 6.2 AI 研究模块

> 注: 以下组件路径需根据实际前端结构确认。AI 研究的前端页面入口路径待确认。

| 文件路径              | 修改内容                                   |
| --------------------- | ------------------------------------------ |
| AI 研究项目创建对话框 | 支持从 URL query params 读取预填数据       |
| AI 研究项目创建对话框 | 底部新增「相关洞察推荐」区域               |
| AI 研究 Output 展示区 | 操作栏新增「沉淀到洞察」和「生成 PPT」按钮 |

**新增组件:**

| 组件                      | 路径              | 说明                                   |
| ------------------------- | ----------------- | -------------------------------------- |
| `SedimentToInsightsModal` | AI 研究组件目录下 | 沉淀到洞察的 Modal，含 Topic 选择/新建 |
| `RelatedTopicsHint`       | AI 研究组件目录下 | 创建项目时的相关 Topic 推荐提示        |

### 6.3 AI 报告模块

| 文件路径                                                     | 修改内容                                     |
| ------------------------------------------------------------ | -------------------------------------------- |
| `frontend/app/ai-office/slides/page.tsx`                     | 检测 URL query params，支持自动导入+生成流程 |
| `frontend/components/ai-office/slides/SourceImportModal.tsx` | Tab 列表增加「AI Studio」来源类型            |
| `frontend/components/ai-office/slides/SlidesWorkspace.tsx`   | session 详情显示来源订阅状态                 |
| `frontend/components/ai-office/slides/SlidesGallery.tsx`     | session 列表卡片显示「来源已更新」徽标       |

**新增组件:**

| 组件                | 路径                                                         | 说明                                       |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `SourceUpdateBadge` | `frontend/components/ai-office/slides/SourceUpdateBadge.tsx` | 来源更新提示徽标                           |
| `AutoImportFlow`    | `frontend/components/ai-office/slides/AutoImportFlow.tsx`    | 从 URL params 自动导入并触发生成的流程组件 |

### 6.4 公共 Hooks

| Hook                       | 路径                                                  | 说明                                |
| -------------------------- | ----------------------------------------------------- | ----------------------------------- |
| `useCrossModuleNavigation` | `frontend/hooks/features/useCrossModuleNavigation.ts` | 封装跨模块跳转逻辑，构建 URL params |

---

## 7. 分阶段实施计划

### Phase 1: P0 - 最小可见联动 (1 周)

**目标**: 实现 F3 + F4，让用户从 AI 洞察和 AI 研究一键跳转到 AI 报告生成 PPT。

**选择理由**: 这两个功能复用已有的 `importFromResearch` 和 `importFromWriting` 接口，后端改动最小，主要是前端的入口按钮和自动跳转逻辑。

| 任务                                                    | 类型 | 预估 | 依赖      |
| ------------------------------------------------------- | ---- | ---- | --------- |
| T1.1 前端: `useCrossModuleNavigation` hook              | 前端 | 0.5d | -         |
| T1.2 前端: AI 报告 `AutoImportFlow` 组件                | 前端 | 1d   | T1.1      |
| T1.3 前端: `GenerateSlidesButton` (AI 洞察入口)         | 前端 | 0.5d | T1.1      |
| T1.4 前端: AI 研究 Output 区「生成 PPT」按钮            | 前端 | 0.5d | T1.1      |
| T1.5 后端: 新增 `POST /slides/import/studio/:projectId` | 后端 | 1d   | -         |
| T1.6 后端: 新增 `IStudioDataExport` 接口 + adapter      | 后端 | 0.5d | T1.5      |
| T1.7 前端: `SourceImportModal` 增加 AI Studio Tab       | 前端 | 0.5d | T1.5      |
| T1.8 联调 + 测试                                        | 全栈 | 1d   | T1.2-T1.7 |

**里程碑**: M1 - 用户可以从 AI 洞察报告页和 AI 研究 Output 页一键跳转生成 PPT

---

### Phase 2: P1 - 核心旅程打通 (2 周)

**目标**: 实现 F1 + F2，打通「信号深挖」和「发现沉淀」的双向链路。

| 任务                                                    | 类型 | 预估 | 依赖      |
| ------------------------------------------------------- | ---- | ---- | --------- |
| T2.1 后端: Prisma schema 新增 `crossModuleSource` 字段  | 后端 | 0.5d | -         |
| T2.2 后端: 手写迁移脚本                                 | 后端 | 0.5d | T2.1      |
| T2.3 后端: `CreateStudioProjectDto` 扩展                | 后端 | 0.5d | T2.1      |
| T2.4 前端: `DeepDiveButton` 组件                        | 前端 | 0.5d | Phase 1   |
| T2.5 前端: AI 洞察三个入口位置接入 `DeepDiveButton`     | 前端 | 1d   | T2.4      |
| T2.6 前端: AI 研究创建对话框支持 URL params 预填        | 前端 | 1d   | T2.3      |
| T2.7 后端: `POST /ai-studio/projects/:id/sediment` API  | 后端 | 1.5d | T2.1      |
| T2.8 后端: `AddDimensionDto` 扩展 `externalSource`      | 后端 | 0.5d | -         |
| T2.9 前端: `SedimentToInsightsModal` 组件               | 前端 | 1.5d | T2.7      |
| T2.10 后端: Prisma schema 新增 `linkedResearchIds` 字段 | 后端 | 0.5d | -         |
| T2.11 联调 + 测试                                       | 全栈 | 1.5d | T2.5-T2.9 |

**里程碑**: M2 - 完整的「发现信号 → 深度分析 → 结论沉淀」闭环

---

### Phase 3: P2 - 持续价值放大 (1 个月)

**目标**: 实现 F5 + F6，建立持续关联和智能推荐能力。

| 任务                                                     | 类型 | 预估 | 依赖       |
| -------------------------------------------------------- | ---- | ---- | ---------- |
| T3.1 后端: Prisma schema 新增 `sourceSubscription` 字段  | 后端 | 0.5d | Phase 2    |
| T3.2 后端: 手写迁移脚本                                  | 后端 | 0.5d | T3.1       |
| T3.3 后端: AI 报告生成时自动创建 subscription            | 后端 | 1d   | T3.1       |
| T3.4 后端: AI 洞察刷新完成后发布事件                     | 后端 | 1d   | -          |
| T3.5 后端: AI 报告模块监听事件、更新 isStale             | 后端 | 1d   | T3.3, T3.4 |
| T3.6 后端: `PATCH /slides/sessions/:id/subscription` API | 后端 | 1d   | T3.5       |
| T3.7 前端: `SourceUpdateBadge` 组件                      | 前端 | 0.5d | T3.5       |
| T3.8 前端: session 列表和详情页接入订阅状态              | 前端 | 1d   | T3.7       |
| T3.9 前端: 「刷新报告」流程（重新导入+差量更新）         | 前端 | 2d   | T3.6       |
| T3.10 前端: AI 研究创建对话框「相关洞察推荐」            | 前端 | 1d   | -          |
| T3.11 前端: AI 洞察 Topic 详情「相关研究」Tab            | 前端 | 1d   | -          |
| T3.12 后端: 搜索 API 适配（确保 search 参数有效）        | 后端 | 0.5d | -          |
| T3.13 集成测试 + 边界场景测试                            | 全栈 | 2d   | 全部       |

**里程碑**: M3 - 来源订阅+更新通知上线; M4 - 跨模块推荐上线

---

## 8. 技术风险与依赖

### 8.1 架构约束遵守

| 约束                                                  | 应对措施                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AI App 模块不能直接 import 其他 AI App 的内部 Service | F1/F2/F4 的跨模块数据获取均通过 public API 端点（HTTP 调用）；F3 复用已有的 `IResearchDataExport` 接口模式 |
| 跨模块通信不能直接依赖                                | F5 使用 EventEmitter2 事件系统（已在项目中使用），发布者和订阅者通过事件名松耦合                           |
| 数据模型只能新增字段                                  | 所有变更均为新增 nullable JSON 字段，不修改现有字段，完全向后兼容                                          |
| 前端跨页面跳转不通过全局 store                        | 统一使用 URL query params 传递上下文，支持浏览器前进后退和链接分享                                         |

### 8.2 技术风险

| 风险                                             | 级别 | 影响                            | 缓解措施                                                                |
| ------------------------------------------------ | ---- | ------------------------------- | ----------------------------------------------------------------------- |
| URL query params 长度限制                        | 中   | contextSummary 过长时可能被截断 | 限制 contextSummary 最大 500 字符；超长内容改用 sessionStorage 临时存储 |
| AI 洞察 API 响应缓慢导致 F2 沉淀超时             | 低   | 用户等待时间长                  | 沉淀操作改为异步（返回 202），前端轮询状态                              |
| EventEmitter2 事件丢失（F5）                     | 中   | 报告无法感知来源更新            | 1. 事件发布后写入数据库作为回退；2. 用户手动检查来源更新的按钮作为兜底  |
| `importFromResearch` 现有接口导入 Topic 数据量大 | 低   | F3 生成 PPT 延迟                | 导入接口已有内容长度限制 (100KB)，现有实现已可用                        |
| 前端组件路径变更                                 | 低   | 文档中引用的组件路径可能需调整  | AI 研究的前端组件路径需在实施前重新确认                                 |

### 8.3 依赖项

| 依赖项                                       | 状态 | 说明                                          |
| -------------------------------------------- | ---- | --------------------------------------------- |
| `IResearchDataExport` 接口                   | 已有 | F3 直接复用，无需修改                         |
| `SlidesDataImportService`                    | 已有 | F3/F4 基础，F4 需新增 `importFromStudio` 方法 |
| EventEmitter2                                | 已有 | NestJS 项目已集成，F5 直接使用                |
| `POST /topic-insights/topics/:id/dimensions` | 已有 | F2 的沉淀操作调用此接口                       |
| `GET /topic-insights/topics` (含 search)     | 已有 | F6 的推荐功能调用此接口                       |
| `GET /ai-studio/projects` (含 search)        | 已有 | F6 的推荐功能调用此接口                       |

---

## 9. 验收标准

### F1 验收 (AI 洞察 → AI 研究)

- [ ] 从 TopicReportView 的 highlight 点击「深入研究」可跳转
- [ ] 跳转后 AI 研究创建对话框预填标题和描述
- [ ] 创建后项目 sources 中包含来源 Topic 引用
- [ ] 浏览器后退可返回 AI 洞察原位置

### F2 验收 (AI 研究 → AI 洞察)

- [ ] Output 完成后显示「沉淀到洞察」按钮
- [ ] 点击后可选择已有 Topic 或新建 Topic
- [ ] 选择已有 Topic 时，维度成功创建
- [ ] 新建 Topic 时，Topic 和维度同时创建
- [ ] 创建成功后显示跳转链接

### F3 验收 (AI 洞察 → AI 报告)

- [ ] TopicReportView 顶部显示「生成 PPT」按钮
- [ ] 点击后弹出配置面板（页数、风格、主题）
- [ ] 确认后跳转 AI 报告页，自动开始生成
- [ ] 生成过程中不需要用户选择来源
- [ ] 生成结果包含 Topic 报告的完整内容

### F4 验收 (AI 研究 → AI 报告)

- [ ] Output 完成后显示「生成 PPT」按钮
- [ ] 点击后跳转 AI 报告页，自动导入并生成
- [ ] 生成结果保留研究的章节结构和关键发现

### F5 验收 (来源订阅)

- [ ] F3/F4 生成后，session 自动建立来源订阅
- [ ] AI 洞察刷新后，关联 session 显示「来源已更新」
- [ ] 点击「刷新报告」可更新受影响的页面
- [ ] 取消订阅后不再收到更新通知

### F6 验收 (相关推荐)

- [ ] AI 研究创建项目时，输入名称后显示相关 Topic
- [ ] AI 洞察 Topic 详情显示相关研究项目
- [ ] 点击推荐项可跳转到对应页面

---

## 10. 附录

### 参考文件

| 文件                                                                         | 说明                   |
| ---------------------------------------------------------------------------- | ---------------------- |
| `backend/src/modules/ai-app/office/interfaces/data-export.interface.ts`      | 现有跨模块导入接口定义 |
| `backend/src/modules/ai-app/office/slides/services/data-import.service.ts`   | 现有数据导入服务实现   |
| `backend/src/modules/ai-app/office/slides/orchestrator/slides.controller.ts` | Slides API 控制器      |
| `backend/src/modules/ai-app/research/project/research-project.controller.ts` | AI 研究 API 控制器     |
| `backend/src/modules/ai-app/topic-insights/controllers/topic.controller.ts`  | AI 洞察 API 控制器     |
| `frontend/components/ai-insights/topics/TopicReportView.tsx`                 | 报告视图组件           |
| `frontend/components/ai-office/slides/SourceImportModal.tsx`                 | 来源导入 Modal         |

### 变更记录

| 版本 | 日期       | 变更内容 | 作者     |
| ---- | ---------- | -------- | -------- |
| 1.0  | 2026-02-20 | 初始版本 | PM Agent |
