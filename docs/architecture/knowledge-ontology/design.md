# 知识本体 (Knowledge Ontology) 落地设计方案 v1

> 状态：**待评审**（多路评审 → 共识 → 启动实施 workflow）
> 关联可视化：`docs/demos/knowledge-ontology-explorer.html`（浏览）、`knowledge-ontology-demo.html`（工作台）、`knowledge-ontology-impact.html`（价值与演进）
> 最后更新：2026-06-13

---

## 0. 一句话

把今天散在六处、互不相认的知识（Foresight 卡 / library 图 / entity-memory / Wiki / mission JSONB / 抽取结果），焊成**一根带稳定身份、一等公民关系、受 Action 治理、被技能构建、供所有 Agent 团队共享的本体脊柱**。

---

## 0.5 评审共识与 v2 修订决议（六路评审后，取代下文冲突处）

> 经架构/数据/团队接缝/清理安全/UI/可行性 六路评审，结论：方向与归属正确，但 v1 范围过大 + 两个 BLOCKER。本节为权威决议，与下文冲突时以本节为准。

**范围收敛（分 3 个独立 workflow，每个独立可验证）：**

- **v1 = 纯后端复利闭环（本次 workflow）**：3 张表（`OntologyObject` + `OntologyLink` + `OntologyEdit`，**砍掉** ObjectType/LinkType 元模型表与 embedding 列，留 v1.1）；**2 个** Action 工具（`upsertObject`+`addLink`，**砍掉** mergeObjects/setConfidence/editProperty/dispatchAgent）；`OntologyBuilderSkill`；research 团队**加载** + **mission 完成时一次性回写**。验证 = 两段式集成测：mission A 写本体 → mission B（topic 重叠）读出，断言 `B.contextPackage.entities` 含 A 写入对象，DB 可查三表。**零前端、零清理。**
- **v1.1 = 前端「知识本体」tab**（独立 workflow）：先补 read controller/DTO/HTTP，再做 `OntologyTabContent`。
- **v1.2 = 旧 knowledge-graph 清理**（独立 workflow，最后做，见 §9 修订）。

**BLOCKER 修复（强制）：**

1. **清理安全（§9 作废重写）**：`library/knowledge-graph/` **禁止整目录删**——内含 live 的 `knowledge-admin.{controller,service}.ts`（服务 `/admin/knowledge/*` 控制台），须先**剥离 re-home + 重新注册**；`knowledge-graph.tool.ts` 是 memory-coordinator Layer 4 **活代码**，删除须**先**用 ontology 查询工具替换；`getUserGraphOverview` 与 `getGraphOverview` **成对**处理（后者内部调前者）；保留理由更正——`GraphService` 的真实保护方是 `recommendations.service.postgres.ts`，**不是** foresight/playground/company；补漏 `KnowledgeGraphLinker.tsx` + `next.config.js` rewrite。
2. **UI canonical 不批准（§8.3 修订）**：**不新建** `MasterDetailLayout`/`ThreeColumnLayout`（零用例，复用 `WikiReaderPane` 的内联 `grid + SideDrawer` 模式）；**不新建** `ONTOLOGY_ENTITY_COLORS` 独立文件（改为在现有 `lib/design/tokens.ts` 追加 `entityToken` 导出）；加载态必须用 `<LoadingState/>`；若复用 `KnowledgeGraphView` 须把其 19 处硬编码 hex 提取进 `entityToken`。LibraryTabs 是存量 R7 欠账，沿用不新增违规、本次不修。

**MECE/数据/接缝 修订：**

3. **engine 无状态**：`OntologyObject` **移除** `ownerId/visibility`，只留 `createdBy`（审计）；访问策略在 harness/app 层。`OntologyService` 所有方法以 `auditContext` 参数传入（sourceId/sourceType/actorId），**不读当前登录用户**。`topicId` = 研究议题（domain 分区，类比 ForesightTopic），非 mission，可保留。
4. **主键用 `uuid`**（与 Foresight 系列一致），且须与 entity-resolution canonical id 格式对齐（实施前核实）。
5. **`OntologyEdit.evidence`**：改为 `evidenceId String?`（可空，引用 `engine_evidences.id`）+ 允许内联快照 Json；删除"指向 Evidence 表"的含糊措辞。
6. **`OntologyBuilderSkill` 输入契约**显式化：`{ text|documentId|reportId, topicId, sourceType, sourceId }`，零 mission 注入态；由 harness 在 mission 完成后显式调用。
7. **团队接缝（§6 重写）**：加载在 `team-mission.service` 的 contextPackage **persist 点之前**用既有 `mergeContextPackages(leaderPackage, ontologyPackage)` **合并**（非覆盖）；回写改为 **mission 完成时一次**（非按任务），预填事实打 provenance 标记避免被 `extractFacts` 重抽；不新建 DI service，用「静态 mapper + 既有 merge」。明确 P4 要改 `team-mission.service` + `mission-review.service`。
8. **HITL 非现成**：`tool-invoker` 只有 access-matrix，无审批闸门实现 → v1 用 access-matrix + edit 审计即可，HITL/mergeObjects 留 v1.1 专项。
9. **抽取质量预期**：v1 成功标准为「抽取链路通 + 带 evidence/confidence 落库」，**不承诺**首版召回/精度；结构化 NER+关系分类是已知最大工作量，调参留迭代。

---

## 1. 目标与范围

### 1.1 强成功标准（可验证）

| 目标                 | 验证                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| 同一对象全局唯一身份 | entity-resolution canonical id 成为 `OntologyObject` 主键，跨模块去重                                         |
| 一等公民 Link        | `OntologyLink`（typed 端点 + 属性）落表，ForesightEdge 可投影为其视图                                         |
| 受治理写回           | 所有写回经 Action 工具，复用 tool 中间件链（权限/校验/审计/HITL）                                             |
| 技能构建本体         | `OntologyBuilderSkill` 跑通：文本 → 抽取 → 解析去重 → 写回 ≥1 个真实 mission                                  |
| 团队共享本体         | ≥1 个团队（research）从本体加载 `MissionContextPackage.entities`，产出回写                                    |
| 前端可浏览           | Library「知识本体」tab 上线：搜索 + 类型浏览 + 表格 + 详情，`audit:ui-discipline` 不涨基线                    |
| 旧图谱清理           | library knowledge-graph 模块/页/tab 删除，`verify:arch` + 构建全绿，复用方（产业链/playground/foresight）不破 |

### 1.2 范围内（v1 = L1 地基 + L2 行动接缝）

- 元模型表 + 对象/Link/Edit 存储（L2 engine）
- OntologyBuilderSkill（技能构建）
- Ontology Action 工具集（受治理写回）
- research 团队接入本体（共享事实基 + 回写）—— **第一消费方**
- Library 知识本体 tab（浏览 + 详情，先只读 + 基础 Action）
- 旧 knowledge-graph 外科清理

### 1.3 范围外（v2+，演进阶梯 L3/L4）

- 模拟/影响传播（沿 Link 推演）
- pgvector 原生向量检索（Railway 暂不支持，先 Json）
- 本体分支/提案工作流
- 商业化/私有本体售卖
- Wiki 与本体合并（v1 走"并列 + 互链"，见 §8.4）

### 1.4 第一消费方原则

**不空转**：本体 v1 必须有真实消费方，否则纯成本。锁定 **research 团队 + Library tab 浏览** 为首批消费方；其余团队/模块在 v1 验证后再接。

---

## 2. 架构分层与归属（MECE）

严格遵守"engine 不知 agent/mission；harness 知 agent/mission；tools 只在 engine；SkillRegistry 唯一"。

```
L3 ai-app/library/ontology/         ← 新模块（替代 knowledge-graph）：controller/service/DTO + 前端 tab
                                       业务编排、议题分库、权限、调 engine facade
        │ 只经 facade
        ▼
L2.5 ai-harness/                    ← 复用既有，少量新增
   ├ runner/tool-invoker/           复用：Action 工具的 access-matrix / HITL / 审计（不新增）
   └ teams/collaboration/context/   新增 seam：MissionContextProvider 从本体拉 entities/facts
        │
        ▼
L2 ai-engine/                       ← 本体核心都在这（无 agent/mission 状态）
   ├ knowledge/ontology/            新增：元模型 + 对象/Link/Edit 存储 + OntologyService（facade 导出）
   │    └ 复用 knowledge/entity-resolution（已存在，做对象身份解析）
   ├ tools/categories/.../ontology/ 新增：Action 工具（editProperty/setConfidence/addLink/mergeObjects/dispatchAgent）
   └ skills/                        新增：OntologyBuilderSkill（编排抽取工具 + 解析 + 写回 Action）
        │
        ▼
L1 platform/                        ← 不动
```

**归属判定依据**：

- 对象/Link/Edit 是**无 agent 状态的知识数据** → engine。
- Action 是 **tool**（写回入口），tools 只在 engine → `ai-engine/tools`。
- Action 的**权限/HITL/审计**是 agent 运行时关注点 → 复用 harness 既有 `tool-invoker`（不重造）。
- 技能在 engine skills 定义层（代码型 ISkill），编排能力。
- 团队共享是 mission 关注点 → harness teams 接缝。

---

## 3. 数据模型（`backend/prisma/schema/ontology.prisma` 新建）

> 手写迁移：`backend/prisma/migrations/YYYYMMDDHHMMSS_create_ontology_tables/migration.sql`，用 `IF NOT EXISTS` 幂等。**禁用 `prisma migrate dev`**（CLAUDE.md）。

### 3.1 元模型（声明式 single source of truth）

```prisma
model OntologyObjectType {           // 对象类型：组织/人物/技术/产品/事件…
  id            String   @id @default(cuid())
  topicId       String?  @map("topic_id")   // 可选议题分库；null=全局
  key           String                       // 'org' | 'person' | ...
  label         String
  propertySchema Json    @map("property_schema") // [{field,type,required}]
  color         String?                      // 实体类型色 token key
  createdAt     DateTime @default(now()) @map("created_at")
  @@unique([topicId, key])
  @@map("ontology_object_types")
}

model OntologyLinkType {             // 关系类型：supplies/dependsOn/worksFor…
  id            String   @id @default(cuid())
  topicId       String?  @map("topic_id")
  key           String
  label         String
  fromTypeKey   String   @map("from_type_key")  // 端点类型约束
  toTypeKey     String   @map("to_type_key")
  directed      Boolean  @default(true)
  propertySchema Json    @map("property_schema")
  @@unique([topicId, key])
  @@map("ontology_link_types")
}
```

### 3.2 实例 + 身份

```prisma
model OntologyObject {
  id            String   @id @default(cuid())   // 稳定全局身份（来自 entity-resolution canonical）
  topicId       String?  @map("topic_id")
  typeKey       String   @map("type_key")
  label         String
  aliases       Json     @default("[]")          // 合并来源名
  properties    Json     @default("{}")
  confidence    Float    @default(0.8)
  embedding     Json?                            // 初期 Json，待 pgvector 迁移
  // 治理（复用项目既有模式）
  ownerId       String   @map("owner_id")
  visibility    ContentVisibility @default(PRIVATE)  // 复用既有 enum
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  outgoing      OntologyLink[] @relation("LinkFrom")
  incoming      OntologyLink[] @relation("LinkTo")
  edits         OntologyEdit[]
  @@index([topicId, typeKey])
  @@index([ownerId])
  @@map("ontology_objects")
}

model OntologyLink {                 // 一等公民关系
  id            String   @id @default(cuid())
  topicId       String?  @map("topic_id")
  linkTypeKey   String   @map("link_type_key")
  fromId        String   @map("from_id")
  toId          String   @map("to_id")
  properties    Json     @default("{}")          // 边属性（关键程度/权重/起止…）
  confidence    Float    @default(0.8)
  from          OntologyObject @relation("LinkFrom", fields: [fromId], references: [id], onDelete: Cascade)
  to            OntologyObject @relation("LinkTo",   fields: [toId],   references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now()) @map("created_at")
  @@unique([fromId, toId, linkTypeKey])
  @@index([fromId]) @@index([toId]) @@index([linkTypeKey])
  @@map("ontology_links")
}
```

### 3.3 统一 Edit 流 + 溯源（泛化 `ForesightConfLog` 模式）

```prisma
model OntologyEdit {                 // append-only，以对象身份为中心
  id            String   @id @default(cuid())
  objectId      String?  @map("object_id")
  linkId        String?  @map("link_id")
  action        String                           // editProperty/setConfidence/addLink/mergeObjects…
  actorType     String   @map("actor_type")      // human | agent | system
  actorId       String   @map("actor_id")
  before        Json?
  after         Json?
  reason        String?
  evidence      Json?                            // [{sourceId, span, cred}] 复用 Evidence 结构
  createdAt     DateTime @default(now()) @map("created_at")
  object        OntologyObject? @relation(fields: [objectId], references: [id], onDelete: Cascade)
  @@index([objectId]) @@index([createdAt])
  @@map("ontology_edits")
}
```

> 溯源不另起炉灶：`OntologyEdit.evidence` 与对象属性的来源都指向既有 `Evidence` 表（`engine_evidences`），保持单一证据源。

---

## 4. 与现有资产的映射（投影，不强迁数据）

| 现有                                   | 与本体关系                        | v1 动作                                                                 |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `knowledge/entity-resolution`          | 给对象算 canonical 身份           | **直接复用**，其 canonical id = `OntologyObject.id` 生成依据            |
| `ForesightCard / ForesightEdge`        | 卡=对象的判断视图；边=Link 的一种 | v1 建**双向引用**（Foresight 卡 claim 关联 objectId）；不迁移           |
| `Evidence`(engine_evidences)           | 溯源单一源                        | 本体对象/边/edit 的 evidence 指向它                                     |
| `Wiki`(ENTITY/CONCEPT 页)              | 人读叙述 vs 结构对象（表亲）      | **并列 + 互链**（见 §8.4），不合并                                      |
| `MissionContextPackage.entities/facts` | 团队共享接缝                      | 本体**喂入**这里 + 团队产出**回写**本体（§6）                           |
| `common/graph/graph.service.ts`        | 通用图遍历原语                    | **保留**（产业链/playground/foresight 在用），本体查询可复用其 CTE 能力 |

---

## 5. 技能构建本体（producers）

### 5.1 `OntologyBuilderSkill`（engine 代码型 ISkill）

位置：`ai-engine/skills/`（或就近 `knowledge/ontology/skills/`，注册到唯一 SkillRegistry）。

```
输入：{ text | documentId | reportId, topicId }
流程（编排，复用既有能力）：
  1. callTool 抽取实体/关系（复用 knowledge/extraction + 现有抽取工具）
  2. EntityResolutionService.resolve(names) → canonical 簇         ← 复用
  3. 对每个 canonical：upsert OntologyObject（带 evidence span）
  4. 对每条关系：addLink Action（带端点类型校验）
  5. 每步产出 OntologyEdit（actorType=agent/system）
输出：{ created, merged, linked, edits }
requiredTools: ['ontology.upsertObject','ontology.addLink', <抽取工具>]
```

### 5.2 触发场景（谁来构建）

- **Research/Insight mission 完成** → 自动跑 OntologyBuilderSkill 把报告沉淀进本体（复用 §6 的 `extractFacts` 钩子位置）。
- **Library 文档入库 / Wiki ingest** → 增量构建。
- **手动**：前端 tab 里"派 Agent 深挖"动作触发。

---

## 6. 本体供 Agent 团队使用（consumers）—— 核心

利用既有 `MissionContextPackage` 接缝，**零侵入**接入：

### 6.1 加载（本体 → 团队）

在 `ai-harness/teams/collaboration/context/mission-context.service.ts` 的上下文构建处新增 `MissionContextProvider`：

- 团队规划阶段，按 mission topic 从本体拉取相关子图：
  - `OntologyObject` → 填充 `MissionContextPackage.entities`（映射 CoreEntity）
  - 高置信 `OntologyEdit`/事实 → 填充 `establishedFacts`
  - 对象别名 → `glossary`
- 这些已经会被 `buildAgentSystemPromptWithContext()` 注入**所有成员** prompt → 团队天然共享同一份带溯源的事实基。

### 6.2 回写（团队 → 本体）

在 `mission-review.service.ts` 现有 `extractFacts()` 之后挂钩：

- 团队产出的新事实/实体/关系 → 经 **Ontology Action 工具**写回（受治理，非裸写）。
- 破坏性（mergeObjects）→ 自动落 HITL 闸门（复用既有 human-approval）。

### 6.3 团队配置接入

`TeamConfig.availableTools` 增加 ontology Action 工具；`availableSkills` 可加 OntologyBuilderSkill。research 团队先接，验证后扩 debate/insight/planning。

---

## 7. Action 层（受治理写回，复用既有 tool 底座）

新增工具（`ai-engine/tools/categories/.../ontology/`），全部实现既有 `ITool`，复用中间件链：

| Action                   | sideEffect      | 权限    | 备注                      |
| ------------------------ | --------------- | ------- | ------------------------- |
| `ontology.upsertObject`  | idempotent      | EDITOR  | 创建/更新对象 + edit      |
| `ontology.editProperty`  | idempotent      | EDITOR  |                           |
| `ontology.setConfidence` | idempotent      | ANALYST | before→after + reason     |
| `ontology.addLink`       | none            | EDITOR  | 端点类型校验              |
| `ontology.mergeObjects`  | **destructive** | ADMIN   | **需 HITL**，重指向入边   |
| `ontology.dispatchAgent` | none            | EDITOR  | 触发 OntologyBuilderSkill |

> 不重造权限/审计/HITL：`requiredEntitlements` + `tool-invoker` access-matrix + `human-approval` 全部复用。

---

## 8. 前端（Library「知识本体」tab）

### 8.1 接入点

`frontend/app/library/page.tsx`：

- `activeTab` union 加 `'knowledge-ontology'`
- `libraryTabs` 数组加 `{ id:'knowledge-ontology', label:'知识本体', icon: Network }`（Lucide）
- 渲染分支 `{activeTab==='knowledge-ontology' && <OntologyTabContent/>}`（懒加载，对标 WikiTab）

### 8.2 组件（`frontend/components/library/ontology/`）

对标 explorer demo：左菜单（搜索 + 类型树 + 议题 + 我的关注 + 最近变更）→ 中表格/卡片/图谱 → 右详情。

### 8.3 canonical 复用 + 缺口贡献（遵标准 22）

**复用**：`Tabs`（内部 sub-tab）、`DataTable`（实体/关系表）、`Modal`/`SideDrawer`（编辑）、`EmptyState`/`ErrorState`/`LoadingState`、`Tag`、`Button`、`Alert`；图谱视图复用既有 `KnowledgeGraphView`。色走 `MODULE_THEMES.library`（teal）+ tokens。

**缺口 → 按要求"贡献规则再统一"**（需评审确认）：

1. **`MasterDetailLayout`/`ThreeColumnLayout`** canonical（`components/ui/layout/`）—— 本体浏览器、WikiTab 都需要，提为公共组件。
2. **`ONTOLOGY_ENTITY_COLORS`** token（`lib/design/` 或 library `_design/tokens.ts`）—— 五类实体配色，禁散落硬编码。
3. 顺带把 `SearchBar`/`SectionHeader` 缺口登记（标准 22 §4.2 已列 P1），本次可只贡献布局 + 实体色,其余登记不强做。

**纪律**：改动前后跑 `npm run audit:ui-discipline`，**不得让违规基线上涨**；新 canonical 经评审批准后建，不擅自新建。

### 8.4 与 Wiki 的关系（v1 决策：并列 + 互链）

Wiki = 人读叙述百科；知识本体 = 结构化对象 + 关系 + Action。WikiPage ↔ OntologyObject 一一对应、互相跳转。**v1 不动 Wiki 主形态**，仅加互链。

---

## 9. 旧知识图谱清理（外科手术）

### 9.1 删除

- 后端：`ai-app/library/knowledge-graph/`（整目录）、`ai-engine/tools/categories/information/knowledge/knowledge-graph.tool.ts`（+ index 导出）、`ai-app/insight/services/data/knowledge-graph.{service,types}.ts`（+ index/module 注册）、`app.module.ts` 的 `KnowledgeGraphModule` 注册。
- 前端：`app/library/knowledge-graph/page.tsx`、`library/page.tsx` 内 `activeTab==='graph'` 全部相关代码（懒加载/状态/loadGraphData/分支）。

### 9.2 必须保留（删了会爆）

- `common/graph/graph.service.ts` —— 产业链(`company-mission-graph`)/playground(`mission-graph`)/foresight(`foresight-graph`) 在用。仅可移除 knowledge-graph 专用方法 `getUserGraphOverview`/`buildGraphFromResource`（先确认无其他调用）。
- `components/common/views/KnowledgeGraphView.tsx` —— agent-playground `MissionGraphTab` 在用。**不删**，本体 tab 复用它。

### 9.3 需核实

- `ai-harness/memory/coordinator/memory-coordinator.service.ts` 对 `KnowledgeGraphTool` 的引用是否死代码 → 死则删，活则替换为 ontology 查询工具。

---

## 10. 迁移与数据层约定

- Prisma：新建 `ontology.prisma`，纳入 schema include。
- 迁移：手写 `migration.sql`，`IF NOT EXISTS` 幂等，**不用** `prisma migrate dev`；`npx prisma generate` 更新 client。
- facade：`OntologyService` 经 `ai-engine/facade` 导出，ai-app 只从 facade 导入。
- 向量：embedding 先存 `Json`，应用层算相似度；待 Railway 支持 pgvector 再迁（v2）。

---

## 11. 分阶段实施（Workflow 拆分，每阶段独立可验证）

| 阶段               | 内容                                                   | verify                                         |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| **P0 数据层**      | ontology.prisma + 手写迁移 + generate                  | `prisma validate` + 迁移幂等跑通               |
| **P1 engine 核心** | OntologyService + facade 导出 + entity-resolution 接线 | 单测：upsert/resolve/link；`verify:arch`       |
| **P2 Action 工具** | 6 个 ontology 工具 + 注册 + 复用中间件                 | 单测：权限/HITL/edit 产出                      |
| **P3 技能构建**    | OntologyBuilderSkill + 跑通真实报告                    | 集成测：报告→对象/边落库                       |
| **P4 团队接入**    | MissionContextProvider + research 回写钩子             | 集成测：research mission 加载本体 + 回写       |
| **P5 前端 tab**    | OntologyTabContent + canonical/布局贡献                | `audit:ui-discipline` 不涨 + 构建绿            |
| **P6 旧图谱清理**  | §9 删除/保留/核实                                      | `verify:arch` + `verify:full` 全绿，复用方不破 |

> 依赖：P0→P1→P2→P3，P4 依赖 P2/P3，P5 依赖 P1（可与 P2-4 并行），P6 最后（依赖前面替代到位）。

---

## 12. 验收标准（强成功标准）

- `npm run verify:arch` 绿（分层无违规，engine 不依赖 harness）。
- `npm run verify:full` 绿（lint/type/test/build）。
- `npm run audit:ui-discipline` 违规基线不上涨。
- research mission 跑通：本体加载 → 团队共享 → 产出回写，DB 可查 `OntologyObject/Link/Edit`。
- 旧 knowledge-graph URL/tab 下线，产业链/playground/foresight 图谱功能不破。

---

## 13. 风险与止损

1. **空转**：若 P4/P5 后无真实消费，停止扩张，先打磨 research + 浏览闭环。
2. **抽取质量天花板**：OntologyBuilderSkill 写回必须带 evidence + confidence 门槛，低置信不自动 merge。
3. **清理误删**：§9.2 列表是红线，删除前每个文件 `git diff` + 搜调用方，逐文件回退不用全局命令。
4. **MECE 漂移**：engine 内禁出现 agent/mission 概念；Action 权限在 harness 不在 engine 工具自身。
5. **UI 基线**：缺口组件未经评审批准不擅自建；基线上涨需留痕审批。

---

## 附：评审关注点（供多路评审）

- 架构：分层归属是否违反 MECE / facade 边界？
- 数据：表设计是否合理？迁移是否幂等安全？与 Foresight/Evidence 是否重复造表？
- 团队接缝：MissionContextPackage 复用是否成立？回写是否会污染？
- 清理：删除清单是否会爆 production（产业链/playground/foresight/agent-playground）？
- UI：canonical 复用是否充分？新增组件/ token 是否必要、是否最小？
- 可行性：P0-P6 拆分与依赖是否正确？范围是否过大？
