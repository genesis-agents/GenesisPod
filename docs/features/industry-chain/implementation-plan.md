# 产业链分析（Industry Chain Analysis）— 实现方案设计基线

**状态：** 🟡 待评审 v1.0（多路并行评审中）
**日期：** 2026-06-06
**作者：** Claude Code
**分支：** `claude/industrial-chain-analysis-vsNux`
**关联：** [AI 架构分层 CLAUDE.md](../../../.claude/CLAUDE.md) · [标准 16 AI Engine/Harness 结构](../../../.claude/standards/16-ai-engine-harness-structure.md) · [标准 22 前端 UI 组件治理](../../../.claude/standards/22-frontend-ui-component-governance.md)
**评审纪要：** [industry-chain/review-minutes.md](./review-minutes.md)

> **一句话目标**：输入一条产业链主题（如"算力底座"），由 **agent 动态编排** 调用 **SEC EDGAR + Web 搜索** 抽取产业链上中下游环节与参与者公司，结构化落库为 **实体 + 关系图谱**，前端复用 `KnowledgeGraphView` 渲染**可点击**的链路图——点击任一参与者节点即可查看其简介与 SEC 财报引用来源。能力**全部复用现有 ai-harness / ai-engine**，新增能力按下沉判据归位。

---

## 1. 背景与需求

- 用户诉求：构建"产业链分析"能力，能点击产业链看到链上所有相关参与者。
- 关键决策（已与用户确认）：
  1. **数据来源**：从 SEC 等权威外部源取数（不是 AI 凭空生成）。
  2. **落地形态**：动态编排 + 独立模块（非 Topic Insights 固定维度流水线衍生）。
  3. **网络**：远程容器可联外网，SEC / web-search 可真实调用。
  4. **能力约束（硬）**：所有能力必须复用现有 harness/engine；缺失能力构建并审视下沉为通用能力，扩展能力在既有能力上原地扩展。

### 1.1 一个必须对齐的认知

SEC EDGAR 提供的是**单公司权威披露**（10-K/10-Q/8-K 文本），**不直接提供产业链拓扑**。链条结构需 AI 从财报文本 + Web 搜索中抽取组装。SEC 在本方案中的角色是给每个参与者公司提供**可信事实背书与引用来源**，而非产业链骨架本身。

---

## 2. 业界标杆与借鉴点

| 标杆 | 借鉴点 |
| ---- | ------ |
| **Bloomberg SPLC** | 数据源 = SEC + 财报 + 电话会纪要（与本方案一致）；关系带**敞口权重**（营收/成本 %）→ `IndustryRelation.weight` |
| **FactSet Revere** | 关系分类法（客户/供应商/竞争/战略伙伴）；**定期基于 SEC 复核** = 增量刷新节奏 |
| **Microsoft GraphRAG** | LLM 抽主-谓-宾三元组建图；**反面教训**：原生不支持增量、需周期性全量重建、抽取昂贵 → 本方案用 SEC 指纹 delta 触发规避 |
| **Graphiti（Neo4j）** | 增量知识图谱：单节点/单边增量更新、**时序关系（valid_from/valid_to）**、实体去重消歧、不重建整图 |
| **AWS Agentic GraphRAG（资本市场）** | agent 动态编排 + 从 10-K 抽边 + **多跳遍历**发现级联依赖 |
| **REFinD / GPT-FinRE** | 金融关系/实体分类法；LLM in-context 抽取范式 |

**同类产品**（产品形态参考蓝本）：天眼查产业大脑、企查查产业链、启信产业大脑、火石创造、同花顺/Wind 产业链（中国市场，重数据运营）；CB Insights Market Map、PitchBook、Tracxn（西方）。

**差异化定位**：现有玩家重人工数据运营；本方案 = **AI 动态编排（覆盖长尾/新兴产业链）+ SEC 权威背书 + 轻量增量刷新（低 AI 成本保鲜）**。

---

## 3. 能力归位（复用 / 扩展 / 新建下沉）

> **下沉判据**：零 agent/mission 状态 + 多潜在消费方 → 下沉 engine/common；含产业链领域语义 → 留 app。

| 能力 | 归类 | 落点 | 复用度 |
| ---- | ---- | ---- | ------ |
| 动态编排 agent | 复用 | `ai-harness/facade`（`MissionPipelineOrchestrator`） | ✅ |
| 增量更新 + 版本化 | 复用 | `ai-harness/memory/{checkpoint,working,consolidation}` | ✅ |
| 关系可信度共识校验 | 复用 | `ai-harness/evaluation/verify/judge.service`（self/external/critical 三评） | ✅ |
| 嵌入向量底座 | 复用 | `ai-engine/rag/embedding` | ✅ |
| 实体/关系三元组抽取 | **复用 + 调 prompt** | `ai-engine/knowledge/extraction/context-evolution.service`（`extractFacts(category:'relationship')`） | ✅（决策：先复用，YAGNI） |
| **N-hop 多跳查询** | **扩展（原地）** | `common/graph/graph.service.ts` 新增 `nHopNeighbors()` | ⚠️ 原地加方法，不新建 service |
| **SEC EDGAR 工具** | **新建 → 天然下沉** | `ai-engine/tools/categories/information/data/sec-edgar.tool.ts` | 🆕 通用数据源，与 finance-api 同层 |
| **实体语义去重/消歧** | **新建 → 下沉 engine/knowledge** | `ai-engine/knowledge/entity-resolution/entity-resolution.service.ts` | 🆕 零 agent 状态、多消费方（决策已确认） |
| 产业链数据模型 | 新建 → 留 app | `ai-app/industry-chain/` Prisma schema | 🆕 领域语义 |
| 编排 pipeline/agent/controller/落库 | 新建 → 留 app | `ai-app/industry-chain/` | 🆕 领域业务 |

---

## 4. 数据模型（手写 SQL 迁移，不用 `prisma migrate dev`）

```prisma
model IndustryChain {
  id        String  @id @default(cuid())
  topic     String
  status    String  // PLANNING | RUNNING | COMPLETED | FAILED
  ownerId   String
  missionId String?
  createdAt DateTime @default(now())
  entities  IndustryEntity[]
  relations IndustryRelation[]
}

model IndustryEntity {
  id                String   @id @default(cuid())
  chainId           String
  name              String
  type              String   // SEGMENT | COMPANY | PRODUCT
  cik               String?  // SEC CIK
  segment           String?  // 所属环节
  description       String?  @db.Text
  sourceRefs        Json?    // SEC 引用 [{accessionNumber, url, reportType, date}]
  sourceFingerprint String?  // 增量 delta 触发依据
  version           Int      @default(1)
  lastRefreshedAt   DateTime?
  chain             IndustryChain @relation(fields: [chainId], references: [id], onDelete: Cascade)
  @@index([chainId])
  @@index([cik])
}

model IndustryRelation {
  id           String   @id @default(cuid())
  chainId      String
  sourceId     String
  targetId     String
  relationType String   // SUPPLIES | CONSUMES | COMPETES_WITH | PARTNERS_WITH | BELONGS_TO
  weight       Float?   // 敞口 %（借 Bloomberg SPLC）
  evidence     String?  @db.Text
  validFrom    DateTime?  // 时序（借 Graphiti）
  validTo      DateTime?  // null = 当前有效；非 null = 已失效（不删，标记）
  chain        IndustryChain @relation(fields: [chainId], references: [id], onDelete: Cascade)
  @@index([chainId])
  @@index([sourceId])
  @@index([targetId])
}
```

---

## 5. 增量更新策略（省 AI 核心）

| 档位 | 触发 | AI 消耗 | 做法 |
| ---- | ---- | ------- | ---- |
| **L0 零 AI** | 节点定期刷新 | 0 token | 拉 SEC `submissions` JSON（纯 HTTP），比对 `sourceFingerprint`，无变化只更新 `lastRefreshedAt` |
| **L1 小 AI** | 指纹变化（出新财报） | 1 次 short 调用 | 只对该节点新文件做摘要，更新该行 + `version++` |
| **L2 局部编排** | 某环节关系可能变 | 1 次 scoped mission | chain-mapper 只跑该 segment 子图，不碰其余 |
| **L3 全量重算** | 链条结构变 | 全量 | 罕见，低频/手动 |

复用 `ai-engine/knowledge/consistency/stale-detector.service` 批量挑出待刷新节点。

---

## 6. 实施阶段（每步附 verify）

### Phase 1 — 下沉 engine 的通用能力（先建，复用价值高 + 风险最高）

- **1.1 SEC EDGAR 工具**：`ai-engine/tools/.../sec-edgar.tool.ts`，`createTool()`，声明性 UA + ≤10 req/s 限速 + 429 退避；CIK 查找用 `data.sec.gov`。注册进 `tools.provider.ts`。
  - **verify**：对 "NVIDIA" 调 `execute()` 真实联网返回 `success && filings.length>0`
- **1.2 实体消歧服务**：`ai-engine/knowledge/entity-resolution/entity-resolution.service.ts`，复用 `EmbeddingService`，cosine > 0.85 合并同一实体。
  - **verify**：单测 "NVIDIA"/"英伟达"/"Nvidia Corp" 归并为 1 实体

### Phase 2 — 原地扩展既有能力

- **2.1 N-hop 多跳查询**：`common/graph/graph.service.ts` 原地新增 `nHopNeighbors(nodeId, depth, relTypes?)` 通用递归 CTE。
  - **verify**：单测 3 跳子图返回正确 nodes/edges

### Phase 3 — 数据模型（留 app）

- **3.1** `models.prisma` 新增 3 model（见 §4）+ 手写迁移 `prisma/migrations/20260606_industry_chain/migration.sql`；`prisma generate`。
  - **verify**：`prisma generate` 无错；迁移 `migrate deploy` 本地成功

### Phase 4 — 产业链业务编排（留 app）

- **4.1** `agents/chain-mapper/SKILL.md`：ReAct loop，白名单 `[web_search, web_scraper, sec_edgar_search]`，复用 `extractFacts(category:'relationship')` + 产业链 prompt。
- **4.2** `pipeline/industry-chain.config.ts`：`defineMissionPipeline()`，step：map(抽取) → resolve(实体消歧) → verify(JudgeService 共识校验) → persist。
- **4.3** `industry-chain.service.ts`：经 `ai-harness/facade` 发起编排；落库；`getGraph()` 输出 `{nodes,edges,stats}`。
- **4.4** controller：`POST /analyze`、`GET /:id`、`GET /:id/graph`、`GET /entity/:id`、`POST /:id/entity/:eid/refresh`（L0/L1 阶梯）。
- ⚠️ `.module.ts` 与 `app.module.ts` 接入由主 Agent 手动完成（Sub-Agent 禁建模块/改入口）。
  - **verify**：`/analyze` 返回 missionId；mission 完成后 DB 有 entity/relation 行；`/graph` 满足成功标准；`verify:arch` 通过

### Phase 5 — 前端（复用 KnowledgeGraphView，不自写图谱）

- **5.1** `app/industry-chain/[chainId]/page.tsx` + service hook；复用 `components/common/views/KnowledgeGraphView.tsx`；节点配色走 design tokens；入口用 canonical 组件（Modal/Button/EmptyState/LoadingState）。
- **5.2** 点击节点 → 右侧面板显示 `description` + SEC 引用链接。
  - **verify**：`audit:ui-discipline` 基线不上涨；类型检查 0 error；远程 URL 实点验证

### Phase 6 — 交付前自检 + 提交

- 交付清单全过（DB 配套 / 前后端协议 / 错误路径 / 资源清理 / 安全边界 / 旧码清理 / 规范）。
- `verify:full` + `verify:arch` 全绿 → commit → push 到 `claude/industrial-chain-analysis-vsNux`（不建 PR 除非用户要）。

---

## 7. 成功标准（强标准）

1. `POST /industry-chain/analyze {topic:"算力底座"}` 返回 `missionId`，WebSocket 收到 stage 事件
2. mission 完成后 `GET /industry-chain/:id/graph` 返回 `{nodes,edges,stats}`，`nodes.length>0 && edges.length>0`
3. ≥1 个 COMPANY 节点带非空 `sourceRefs`（SEC 引用）
4. 前端点击节点 → 右侧详情面板出现；`npm run verify:full` + `verify:arch` 全绿

---

## 8. 风险

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| 抽取质量（agent 编关系/幻觉） | 高 | JudgeService 共识校验入库前拦截；先固定"算力底座"单例调通再泛化 |
| SEC 限速/UA 要求 | 中 | 内置限速 + 退避 + 声明性 UA |
| 财报正文超长 | 中 | 抽取走 web-search 摘要 + 关键段落，不全文解析 |
| 实体消歧误并/漏并 | 中 | 阈值可调（0.85）+ 保留人工校正入口（后续） |
| 手写迁移失败 | 低 | 禁用 `DO $$ EXCEPTION` 包 ALTER TYPE |

---

## 9. 评审结论

> 见 [review-minutes.md](./review-minutes.md)。评审通过后状态转 ✅，方可进入 Phase 1。
