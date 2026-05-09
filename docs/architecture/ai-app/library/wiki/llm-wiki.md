# Library - LLM Wiki 设计方案

> 在现有 `ai-app/library` 之上引入 Karpathy 在 2026-04-04 提出的 LLM Wiki 模式，让知识库从"每次 query 重 derive"升级为"持续编译的 markdown wiki"，与现有 `KnowledgeBase` / `KnowledgeBaseDocument` / RAG 共存且不双源。

**最后更新**：2026-05-09
**版本**：v1.4（吸收 R5 architect NEEDS-CHANGES：砍过度抽象 + 消除 consistency↔synthesis 重叠）
**状态**：待 R6 评审（仅 architect 一路复评；reviewer/security/tester R5 已 APPROVED 不复评）
**对应代码区域**：`backend/src/modules/ai-app/library/wiki/`、`backend/src/modules/ai-engine/content/markdown/`、`backend/src/modules/ai-engine/knowledge/synthesis/`（增低级 API）、`backend/src/modules/ai-engine/knowledge/consistency/`（新建仅 stale-detector）、`frontend/app/library/wiki/`
**外部参考**：

- Karpathy 原 gist：<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
- 引用实现 1：<https://github.com/lucasastorian/llmwiki>（FastAPI + Next.js + MCP，文件 SoT + SQLite FTS5）
- 引用实现 2：<https://github.com/Astro-Han/karpathy-llm-wiki>（Agent Skill 形态）
- R1 评审纪要：[llm-wiki-review-r1.md](./llm-wiki-review-r1.md)
- R2 评审纪要：[llm-wiki-review-r2.md](./llm-wiki-review-r2.md)

> **v1.4 vs v1.3 主要变更**（吸收 R5 architect 真问题）：
>
> | 类型                       | 修订点                                                                                                                                                                                                                                                                                                   |
> | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 砍过度抽象（BLOCKER）      | 删除 `MultiResolutionSearchService`（单一消费方 + 现有 `EmbeddingService` + `VectorService.similaritySearch({filter, topK})` 两步直接表达）；wiki-query 直调                                                                                                                                             |
> | 消除概念双源（BLOCKER）    | `consistency/` 子目录只留 `StaleDetectorService`（quote vs raw hash 是独有语义）；CONTRADICTION/DATA_GAP **折叠为 `CrossCuttingSynthesisService` 低级 API** —— 给现有 service 加 `detectContradictions(documents)` / `detectDataGaps(documents, opts)` 两个公共方法（既不重抄 LLM 编排也不另起 service） |
> | 上提同时清旧双源（非阻塞） | `slug-normalize` 上提同时把现有 5+ 处 ad-hoc slugify（report-artifact-assembler / structural-report-assembler / ai-model-discovery / secret-name.catalog / custom-agent.dto）替换为单一 source；P0a 落地必须包含此清理                                                                                   |
> | facade export 简化         | 砍至 3 项（去 token，与 facade 现有 class 直接 export 模式一致）：`parseMarkdownWikiLinks` (function) / `normalizeMarkdownSlug` (function) / `StaleDetectorService` (class)                                                                                                                              |
> | 加复用 sanitizer           | wiki-page service body 入库前一律走 engine `sanitizeMarkdownBody`（§5.1 Step G + §11 checklist 加项），与 frontend rehype-sanitize 双层防护                                                                                                                                                              |
>
> **R5 元教训（双倍打脸）**：上一轮（v1.3）我说"4 路 reviewer 漏能力归属维度"，本轮 architect 立即把 v1.3 的"上提"找出 1 项 OVER-LIFTED + 1 项 UNDER-LIFTED 与既有 service 重叠。**架构归属审查应该 3 维度问：①是否穿透 facade ②是否过度集中 app（漏上提）③是否过度抽象/与既有重叠（错上提）**，下次设计任务的 architect prompt 必须明文列三项。
>
> **v1.3 vs v1.2.1 主要变更**（按 CLAUDE.md 能力归属判断："能复用 → AI Engine"）：
>
> | 上提项                                                                                                                                        | 旧位置                                 | 新位置                                                                                    | 复用场景                                                          |
> | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
> | `link-parser.ts`（remark AST 抽 [[slug]]）                                                                                                    | ai-app/library/wiki/                   | **ai-engine/content/markdown/wiki-link-parser.util.ts**                                   | writing/research/topic-insights 长文都可能用 wiki-style 跨引用    |
> | `slug-normalize.ts`（title→kebab-case）                                                                                                       | ai-app/library/wiki/                   | **ai-engine/content/markdown/slug-normalize.util.ts**                                     | 通用 slug 规范化（office/research 文档锚点也用）                  |
> | 多分辨率 page embedding 检索能力                                                                                                              | ai-app/library/wiki/wiki-query.service | **ai-engine/rag/multi-resolution-search.service.ts**（新增）                              | 任何"对同一 entity 多 resolution 检索"场景；本 wiki 仅是消费方    |
> | wiki-lint 三类（CONTRADICTION/STALE/DATA_GAP）                                                                                                | ai-app/library/wiki/wiki-lint.service  | **ai-engine/knowledge/consistency/**（新建子目录，与 evidence/extraction/synthesis 同层） | research 报告 / writing 长文跨段落一致性检测                      |
> | wiki-lint 两类（ORPHAN/MISSING_XREF）                                                                                                         | 留 ai-app/library/wiki/                | 留 ai-app/library/wiki/                                                                   | 依赖 `WikiPageLink` 表，wiki 专属，**不上提**                     |
> | `WikiPageEmbedding` 表 + 写入侧                                                                                                               | 留 ai-app/library/wiki/                | 留 ai-app/library/wiki/                                                                   | 表结构是 wiki-specific schema；写入复用 `EmbeddingService` 已合规 |
> | wiki-ingest / wiki-diff / wiki-page / wiki-revision / WikiDiffItemsSchema / baselineHash + affectedSlugs / WikiPageLink 解析后的 service 处理 | 留 ai-app/library/wiki/                | 留 ai-app/library/wiki/                                                                   | wiki 专属业务，无复用                                             |
>
> **facade 影响**：`ai-engine/facade/index.ts` 新增 4 个 export（2 markdown util + 1 rag service token + 1 consistency service token）；wiki 子模块通过 `import { ... } from '@/modules/ai-engine/facade'` 消费，单向依赖 L3→L2 不变。
>
> **元教训**：v1.0/v1.1/v1.2 设计审查时 4 路 reviewer 全部漏掉了"能力归属"维度——架构师 R1/R2 关注分层合规但只查"是否穿透 facade"，没查"是否过度集中在 app 层"。**架构原则审查的两个独立维度（依赖方向 / 能力归属）应该分别提问**，下次设计任务必须明文列入 architect prompt。
>
> **v1.2.1 vs v1.2 主要变更**（对应 R3 reviewer + security 共 8 项）：
>
> | 类型                                 | 修订点                                                                                                                       |
> | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
> | 安全 P1（security R3）               | §5.1 Step B `affectedSlugs` 重算公式补 `∪ items.deletes[]`；Step D SELECT FOR UPDATE 锁全集；Step G2 补 delete WikiPage 流程 |
> | 安全 P2（security R3）               | §5.1 Step C 对其他 PENDING diff 也实时重算 `affectedSlugs`，不读 DB 预存值                                                   |
> | 安全 P2（security R3）               | §5.1 加 Prisma `P2034` (serialization_failure) 1 次重试 → 仍失败 409；§11 checklist 同步登记                                 |
> | 安全 P2（security R3）               | §11.1 新增 `WikiDiffItemsSchema` 完整 zod 骨架（slug 正则 / body 上限 200K / creates/updates ≤100 / deletes ≤20）            |
> | Doc drift（reviewer + architect R3） | §3.1 "7 张" → "10 张"；§6 标题 "12 个" → "13 个"；§14 评审索引补 R2 已完成                                                   |
> | 实施细节（architect R3）             | §11 加 "WikiPageEmbedding.model 写入侧必须填非空 model 名" 约束（避免 query 维度漂移）                                       |
>
> **v1.2 vs v1.1 主要变更**（对应 R2 必修 21 条）：
>
> | 类型        | 修订点                                                                                                                                         |
> | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
> | Schema 关系 | `WikiPageRevision.opId` / `WikiLintFinding.pageId` / `WikiOperationLogPage.pageId` 三处补 Prisma `@relation` 声明（onDelete: SetNull/Cascade） |
> | Schema 关系 | `WikiPageEmbedding.model` 改 `@default("")` 不再硬编码 `text-embedding-3-small`（CLAUDE.md 反硬编码模型规则）                                  |
> | Schema 简化 | 砍 `WikiPageSource.weight`（YAGNI 无消费方）                                                                                                   |
> | 安全 P1     | `revert` 子动作 service 层强制校验 `revision.pageId === page.id`（防跨页 IDOR）                                                                |
> | 安全 P1     | apply 时**实时从 `diff.items` 重算 `affectedSlugs`**，不信任预存值（防恶意 ingest 写空数组绕过冲突判定）                                       |
> | 安全 P1     | apply 进事务前 `WikiDiff.items` 必须 zod parse（防 LLM 输出非法字段进库）                                                                      |
> | 安全 P2     | `wrapExternalContent` 按"剩余 token budget"显式传 maxLength；`baselineHash` 事务用 `SELECT FOR UPDATE` 防 TOCTOU；export VIEWER 边界明示       |
> | 文档对齐    | §4.1 标题"7 张新表" → "10 张新表"；§2.2 "12 个 endpoint" → "13 个"；§1.2 KB 行号 4150 → 4098                                                   |
> | 文档对齐    | WikiDiff schema 注释清掉废弃 partial unique index 文字                                                                                         |
> | 阶段对齐    | `WikiKnowledgeBaseConfig` 提到 P0 一起建（含 `ingestMaxTokens=80_000`），P1 即可读取，避免 P1/P2 hardcode→Config 切换歧义                      |
> | 反硬编码    | 80K token 上限改为从 `WikiKnowledgeBaseConfig.ingestMaxTokens` 读取                                                                            |
> | 测试补充    | P1 spec 加 wikiEnabled=false API gate / PATCH edit 写 revision / baselineHash 确定性 / revert 跨页 IDOR 共 4 项                                |
> | Migration   | P0 SQL 加 `WikiDiff.affectedSlugs` GIN 索引（partial WHERE status='PENDING'）                                                                  |
> | ADR         | P0 落盘 `docs/architecture/decisions/ADR-XXX-wiki-vs-graph-coexistence.md`（KG 冻结边界）                                                      |
>
> **v1.1 vs v1.0 主要变更**（对应 R1 P0/BLOCKER）：
>
> | 类型     | 修订点                                                                                                                                            |
> | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 现实校准 | raw 改为 `KnowledgeBaseDocument`（不是 Note）；删 `WikiSkillTokens` / `fact-extraction.service` / `KnowledgeBaseGuard` 虚构提及                   |
> | 现实校准 | 大库分支 RAG 不复用 `ChildEmbedding`，新建独立 `WikiPageEmbedding` 表（embedding 字段为 Json，与 `ChildEmbedding` 一致——Railway 不支持 pgvector） |
> | 数据完整 | 新建 `WikiDiff` 表（v1.0 漏建）+ `WikiPageRevision` 历史快照表（解决 revert + stale lint）                                                        |
> | 数据完整 | `sourceRefs` JSON 拆为 `WikiPageSource` 关系表（FK to `KnowledgeBaseDocument`）                                                                   |
> | 数据完整 | `WikiOperationLog.pageIds` 数组拆为 `WikiOperationLogPage` 关系表                                                                                 |
> | 安全     | slug DTO `@Matches` + export 二次校验 + wiki-ingest 强制走 `wrapExternalContent` + diffId IDOR 校验                                               |
> | 验收     | P2 "≥20% precision" 撤掉，所有 Phase gate 改为 `npm test --testPathPattern=wiki` 命令级                                                           |
> | 简化     | 砍 `WikiOp.QUERY` / 合并 `PATCH /diffs/:id` 与 `PATCH /lint-findings/:id` / export 走 `ExportJob` 复用                                            |
> | 实现细节 | propose_update_page 选定为**全量替换**；link-parser 用 **remark AST** 不用正则                                                                    |
> | 自洽     | 删除"不做版本史"非目标（与 stale lint 矛盾），明示 `WikiPageRevision` 是版本史最小化形式                                                          |

---

## 1. 背景与目标

### 1.1 Karpathy 原文要点（不是我们的发挥）

3 层结构：

```
raw/                # 不可变源材料（PDF / URL / 文章），LLM 只读不改
wiki/               # LLM 编译产物：summary / entity / concept 页，markdown
  index.md          # 全局目录：entities / concepts / sources，每条带 one-line + 元数据
  log.md            # append-only：## [2026-04-02] ingest | Article Title
```

3 个核心操作：

- **Ingest**：LLM 读 raw → 与用户讨论要点 → 写 summary page → 更新 index → 跨页刷新相关 entity / concept → append log
- **Query**：检索 wiki 而不是 raw，合成带引用的回答；好答案能反向 file 回 wiki
- **Lint**（健康检查）：找 contradictions / stale claims / orphan pages / 缺 cross-ref / data gaps

哲学要点：

- "the wiki is a persistent, compounding artifact" — 预编译 > 每次重 derive
- ≤ 100 文章 / ≤ 400K 字时直接长 context 喂；fancy RAG 只增加 latency 和 retrieval noise
- 文件是 source of truth，索引是派生
- markdown + `[[wiki-link]]`，不是 vector + frontmatter

### 1.2 现状（已经过 schema/代码核对）

| 模块                                                       | 角色                                                                     | 真实文件                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Prisma `KnowledgeBase`                                     | 知识库 scope（含 `KnowledgeBaseMember` 角色：OWNER/ADMIN/EDITOR/VIEWER） | `models.prisma` l.4098                                                      |
| Prisma `KnowledgeBaseDocument`                             | KB 内的 raw 文档（含 `rawContent` / `sourceType` / chunking 状态）       | `models.prisma` l.4181                                                      |
| Prisma `ParentChunk` / `ChildChunk` / `ChildEmbedding`     | 现有 RAG 5 层管道（embedding 字段 = Json，Railway 不支持 pgvector）      | `models.prisma` l.4218 / 4247 / 4273                                        |
| Prisma `Note`                                              | **用户笔记**（`userId` + 可选 `resourceId`，**没挂 KB**）                | `models.prisma` l.599                                                       |
| `KnowledgeBaseService.hasAccess()`                         | KB 角色访问校验（service 层，无独立 Guard）                              | `library/rag/services/knowledge-base.service.ts` l.874                      |
| `PromptSkillBridge.registerDomain()`                       | 域级 prompt skill 注册（writing/research/topic-insights 都用）           | `ai-engine/skills/runtime/registration/...service.ts` l.83                  |
| `wrapExternalContent()` + `EXTERNAL_CONTENT_SYSTEM_NOTICE` | prompt injection 防护基础设施                                            | `ai-engine/safety/security/llm-injection/external-content-wrapper.utils.ts` |
| Prisma `ExportJob` + `ExportSourceType` enum               | 异步导出系统（已支持 RESEARCH/MISSION/WRITING 等）                       | `models.prisma` l.3803 / 3841                                               |

> **关键概念校准**（v1.0 错位）：
>
> - `Note` ≠ raw。Note 是用户笔记，raw 在 KB 上下文里是 `KnowledgeBaseDocument`。本设计 v1.1 把 raw 全部对齐为 `KnowledgeBaseDocument`。
> - `EmbeddingChunk` 表不存在，真实表是 `ChildEmbedding`。wiki 的 embedding 走**新建独立表**，不侵入现有 5 层 chunking。
> - `KnowledgeBaseGuard` 不存在；本期沿用 service 层 `hasAccess()` 模式，不创新 Guard，避免 scope 蔓延。
> - `fact-extraction.service.ts` 不存在；wiki-ingest 自己编排 LLM。

### 1.3 用户需求

> "Karpathy 提出来的 LLM WIKI，我想用在我的知识库上面，请帮我设计系统的方案"

### 1.4 设计目标

| 目标           | 说明                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| **忠实**       | 3 层 / 3 操作 / markdown-as-truth / `[[link]]` 语法 / index + log，与 Karpathy gist 同形               |
| **不双源**     | wiki 直接挂 `KnowledgeBase`；raw 直接复用 `KnowledgeBaseDocument`，不新建一套                          |
| **多租户**     | 多租户 SaaS 上文件 SoT 不可行，DB 是 SoT 但保留一键 export 成 raw/+wiki/ 目录的 portability            |
| **默认无 RAG** | 体量 ≤ 阈值直接长 context；> 阈值仅对 oneLiner+index 检索选页，选中页仍长 context 喂                   |
| **可逃生**     | 现有 RAG / chunking 不删，作为大体量兜底；用户也能在大库上手动启 RAG 模式                              |
| **可控**       | ingest 走 diff 模式：LLM 提议要改的页 + diff，用户逐项 accept/dismiss，不允许 LLM 直写入库             |
| **可回溯**     | 每次 apply 写 `WikiPageRevision` 快照；revert + stale lint 都依赖快照，不再"无历史 lint stale"自相矛盾 |
| **合规**       | 单向依赖 L3 → L2 → L1；所有 ai-engine 调用经 facade；`verify:arch` 全绿                                |

### 1.5 非目标

- 不替换 `Note` / `Collection` / `KnowledgeGraph` / 现有 RAG 路径：保留全部现有数据与路径
- 不做协作编辑（多人同时编同一 wiki page，OT/CRDT）：本期单写者 + diff 列队
- 不做"自我推进"：所有 ingest / lint 由用户触发，cron 仅做轻量 lint 巡检
- 不实现 Obsidian 兼容（dataview 查询、graph view）：本期纯 markdown + 我们自己的 backlink 视图
- 不做"完整版本史"：仅保留 `WikiPageRevision` 最小快照（pageId + body + opId），不做 diff 链 / branch / merge

---

## 2. 核心设计决策

### 2.1 用户已选定（v1.0 即定）

| 决策              | 选项                                                           | 选定  |
| ----------------- | -------------------------------------------------------------- | ----- |
| **Wiki 范围归属** | A 复用 KnowledgeBase / B 平行起 Wiki 资源                      | **A** |
| **RAG 态度**      | A 默认不走 RAG (Karpathy 原意) / B RAG 主 wiki 辅 / C 用户可选 | **A** |
| **Ingest 自主度** | A LLM 提议 diff 用户接受 / B LLM 直写 / C 混合                 | **A** |
| **交付顺序**      | A 按序 P0→P1→P2→P3 / B P0+P1+UI 同步 / C 只先 P0+P1            | **A** |

### 2.2 R1 评审后新增决策

| 决策                                   | 选项                                                  | 选定 + 理由                                                                                                    |
| -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **raw 实体的本体**                     | Note / KnowledgeBaseDocument                          | **KnowledgeBaseDocument**（架构师 P0：Note 没挂 KB；KBD 才是 KB 内 raw 单位且自带 chunking）                   |
| **大库分支的 embedding 表**            | 复用 ChildEmbedding 加多态列 / 新建 WikiPageEmbedding | **新建 WikiPageEmbedding**（架构师 P0：ChildEmbedding 强 FK 挂 ChildChunk，wiki 不要 chunk 要整页 embed）      |
| **propose_update_page 的 diff 格式**   | 全量替换 newBody / unified diff / 块替换              | **全量替换 newBody**（reviewer P0：apply 简单 + 客户端可算 git-style diff 视图，LLM 友好）                     |
| **apply 的原子性**                     | 全选项一个事务 / 逐项独立                             | **全选项一个 Prisma `$transaction`**（reviewer + tester P0：避免部分写入；invariant lint 在事务外）            |
| **revert 数据存储**                    | WikiDiff.previousBodies JSON / WikiPageRevision 表    | **WikiPageRevision 表**（架构师 P1 + reviewer P0：兼容 stale lint 历史比对，且为未来扩展留口）                 |
| **link-parser 实现**                   | 正则 / remark AST                                     | **remark AST**（reviewer + tester P1：正则在代码块/转义/反引号失效，前端已用 remark/rehype 系列）              |
| **slug 规范化**                        | 严格小写连字符 / 允许大小写空格 / 自由                | **lowercase + kebab-case**：`Machine Learning` → `machine-learning`；DTO 加 `@Matches`，详见 §4.4              |
| **markdown 外链限制**                  | 严禁 / 允许标准 `[text](url)` 仅强约束跨 wiki         | **允许标准外链**（架构师 P1：Karpathy 原意未禁；只强约束 wiki-internal 必须 `[[slug]]`）                       |
| **diff 并发**                          | 全 KB 单 PENDING / 按 slug 集合冲突                   | **slug 集合冲突**（架构师 P1：团队 KB 多人协作，全局单 PENDING 串行化太严）                                    |
| **lint 时机**                          | 每次 ingest 后自动 / 用户主动触发 / 后台 cron / 三者  | **用户主动 + 后台 cron 每日（可关）+ ingest 后跑 invariant**：前两者跑 5 类全量；后者只跑 ORPHAN/MISSING_XREF  |
| **export 实现路径**                    | 自己起 endpoint / 复用 ExportJob                      | **复用 ExportJob**（架构师 P1：扩 `ExportSourceType.WIKI` + `ExportFormat.TARBALL`，沿用进度/下载/过期协议）   |
| **体量阈值持久化**                     | hardcode + env / WikiKnowledgeBaseConfig 表           | **WikiKnowledgeBaseConfig 表**（架构师 P1：每 KB 独立配，admin UI 后期可暴露）                                 |
| **WikiOp.QUERY**                       | 保留 / 砍掉                                           | **砍掉**（reviewer 简化建议：无消费方，每 query 写 DB 是纯开销）                                               |
| **API endpoint 合并**                  | 保留 14 / 合并 PATCH                                  | **合并到 13**（含 export）：`PATCH /diffs/:id` 含 apply/dismiss；`PATCH /lint-findings/:id` 含 resolve/dismiss |
| **`WikiLintFinding.resolvedByUserId`** | 保留 / 砍                                             | **砍**（reviewer 简化：本期单写者，无消费方，YAGNI）                                                           |

### 2.3 R2 评审后追加决策

| 决策                                   | 选项                                                   | 选定 + 理由                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WikiPageRevision 写时机**            | 仅 apply / apply+edit / apply+edit+revert              | **三处都写**（reviewer R2 P1 #3 + tester R2 边缘 #3）：apply 前快照、用户 edit 前快照、revert 时把目标快照"复活"也写一条新 revision 标记                          |
| **affectedSlugs 信任**                 | 信任 ingest 写入值 / apply 时实时重算                  | **apply 实时重算**（security R2 P1）：从 `diff.items.creates[].slug ∪ updates[].slug` 重新计算，不读 DB 字段做冲突判定                                            |
| **`WikiDiff.items` apply 前 zod 校验** | 信任 / 强制 zod parse                                  | **强制 zod parse**（security R2 P2，提到 P1 必须）：apply 入事务前用 `WikiDiffItemsSchema` 校验，失败 400                                                         |
| **revert 跨页归属校验**                | 默认信任 toRevisionId / service 强校验                 | **强校验**（security R2 P1）：service 层 `if (revision.pageId !== page.id) throw ForbiddenException()`                                                            |
| **`baselineHash` 事务隔离**            | 默认 read-committed / SELECT FOR UPDATE / SERIALIZABLE | **`SELECT ... FOR UPDATE` 锁所有 affectedSlugs 对应 page 行**（security R2 P2）：apply 事务首步对涉及页加行锁，再校验 baselineHash                                |
| **`wrapExternalContent.maxLength`**    | 默认 2000 / 显式按 budget 传                           | **按"剩余 token budget / N 篇 doc"显式传**（security R2 P2）：避免默认 2000 字符截断与 80K tokens 矛盾                                                            |
| **VIEWER 触发 export 边界**            | VIEWER 看不到 export / 与 EDITOR 看到内容相同          | **与 EDITOR 看到内容相同**（security R2 P2）：KB 设计本意 VIEWER 可读全部内容，export 不另设权限墙；文档明示                                                      |
| **`ingestMaxTokens` 配置位置**         | hardcode / `WikiKnowledgeBaseConfig` 字段              | **`WikiKnowledgeBaseConfig.ingestMaxTokens` 默认 80_000**（reviewer R2 P1 #9）：避免 P1 hardcode→P2 切 Config 的实施歧义；P0 一起建表                             |
| **架构师 R2 后续待办**（非阻塞）       | -                                                      | (1) Migration 加 `wiki_diffs(affected_slugs) GIN partial index`；(2) ADR-XXX-wiki-vs-graph-coexistence 落盘；(3) WikiDiff schema 注释清掉废弃 partial unique 文字 |

---

## 3. 架构总览

### 3.1 分层定位（v1.3 按能力归属重构）

```
L3 ai-app/library                              ★ wiki 业务专属
  ├─ wiki/                                     ★ 新增子模块（瘦身后）
  │   ├─ wiki-page.service.ts                  CRUD + body 解析（engine link-parser）+ body 入库前调 engine sanitizeMarkdownBody + export tarball
  │   ├─ wiki-page.controller.ts               REST
  │   ├─ wiki-ingest.service.ts                ingest LLM 编排（产 diff）
  │   ├─ wiki-diff.service.ts                  diff apply / revert + zod parse + 乐观锁
  │   ├─ wiki-query.service.ts                 query 路由（消费 engine MultiResolutionSearchService）
  │   ├─ wiki-lint.service.ts                  lint 编排：ORPHAN/MISSING_XREF 自做（依赖 WikiPageLink）+
  │   │                                          调 engine ConsistencyChecker 跑 CONTRADICTION/STALE/DATA_GAP
  │   ├─ wiki-revision.service.ts              快照写入（apply/edit/revert 三处）
  │   ├─ skills/                               LLM prompt skills（domain="library"）
  │   │   ├─ wiki-ingest.skill.md
  │   │   ├─ wiki-stale-check.skill.md         ← 调 engine consistency primitive
  │   │   └─ wiki-contradiction.skill.md       ← 同上
  │   ├─ dto/                                  WikiDiffItemsSchema (zod)
  │   ├─ wiki.module.ts                        onModuleInit 调 PromptSkillBridge.registerDomain("library")
  │   └─ __tests__/
  └─ library.module.ts                         imports WikiModule

L2 ai-engine                                   ★ v1.4 通用能力（精简后）
  ├─ content/markdown/                         （已存在 markdown-sanitizer）
  │   ├─ wiki-link-parser.util.ts              ★ 新增：remark AST 抽 [[slug]]，纯函数
  │   ├─ slug-normalize.util.ts                ★ 新增：title → kebab-case，纯函数
  │   │                                           + 同 PR 替换现有 5+ 处 ad-hoc slugify 实现
  │   └─ __tests__/                            10 条 link-parser 边界 + slug 规范化用例
  ├─ rag/                                      ★ v1.4 不新增任何 service
  │                                              （wiki-query Branch B 直调 EmbeddingService.embed +
  │                                               VectorService.similaritySearch({filter, topK})
  │                                               两步组合，不抽象 MultiResolutionSearchService）
  ├─ knowledge/synthesis/                      （已有 cross-cutting-synthesis.service.ts）
  │   └─ cross-cutting-synthesis.service.ts    ★ 加 2 个低级 public API：
  │                                                - detectContradictions(documents): Contradiction[]
  │                                                - detectDataGaps(documents, opts): DataGap[]
  │                                              （wiki-lint + topic-insights 两路调用方共用单一源）
  ├─ knowledge/consistency/                    ★ v1.4 新建子目录（仅 1 个 service）
  │   ├─ stale-detector.service.ts             对每条文档的 source quote vs 当前 raw hash 跑 LLM 判陈旧
  │   │                                          （quote-vs-current-text 语义独有，无既有对应物）
  │   ├─ abstractions/stale-detector.interface.ts
  │   ├─ consistency.module.ts                 仅注册 StaleDetectorService
  │   └─ __tests__/                            stale-detector fixture（mock ChatFacade）
  └─ facade/                                   ★ 新增 3 个 export（v1.4 砍至 3，与既有 class export 模式一致）：
                                                   - parseMarkdownWikiLinks (function)
                                                   - normalizeMarkdownSlug (function)
                                                   - StaleDetectorService (class)
                                                  现有 CrossCuttingSynthesisService export 不变（其新增的两个 public API 通过同一类访问）。

L1 Prisma                                      schema 不变（v1.2.1 的 10 张表保留）
  └─ schema/models.prisma                      ★ 10 张新表 + KnowledgeBase.wikiEnabled +
                                                       ExportSourceType +1 + ExportFormat +1
```

> **依赖方向**：wiki 子模块 `imports: [PrismaModule, AiEngineModule]`，沿用 NotesModule / RAGModule pattern。所有上提到 ai-engine 的能力通过 `@/modules/ai-engine/facade` 消费，单向依赖 L3 → L2 不变。
>
> **能力归属判断**（CLAUDE.md `.claude/rules/ai-engine.md`）：**"如果明天做一个完全不同的 AI App，这个能力还能复用吗？"** — 上提的 4 项均答 YES（writing 长文跨引用 / office 文档锚点 / research 报告内一致性检测 / 任何多分辨率检索）。留在 wiki/ 的 6 项（wiki-page/ingest/diff/revision/query 路由/ORPHAN+MISSING_XREF lint）均答 NO（依赖 WikiPage / WikiDiff / WikiPageLink 等 wiki-specific schema）。

### 3.2 与现有模块的边界（避免双源）

| 现有概念                                                                     | 在 LLM Wiki 中的角色                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KnowledgeBase`                                                              | wiki 的 scope 单位（即 Karpathy 的 "a wiki"）；加 `wikiEnabled` 布尔字段开启                                                                        |
| `KnowledgeBaseDocument`                                                      | **raw 的本体**；wiki ingest 的输入；`WikiPageSource.documentId` 指它                                                                                |
| `ParentChunk` / `ChildChunk` / `ChildEmbedding`                              | 现有 RAG 5 层管道——**wiki 不复用**，wiki 走自己的 `WikiPageEmbedding`（独立表）                                                                     |
| `Note`                                                                       | 用户笔记，**与 wiki 无关**；本期 wiki 不读 Note                                                                                                     |
| `Collection`                                                                 | 笔记分组——**与 wiki 无关**                                                                                                                          |
| `KnowledgeGraph` (Note.graphNodes JSON / Resource graph JSON / GraphService) | **冻结状态**：wiki 不写 graphNodes 也不读；wiki entity 关系仅用 `[[slug]]` 表达。配套 ADR：[ADR-XXX-wiki-vs-graph-coexistence](../../../decisions/) |
| `library-rag.service`                                                        | 仅服务旧 chunk-search 路径；wiki query 不复用，避免逻辑混叠                                                                                         |
| `ExportJob` / `ExportSourceType` / `ExportFormat`                            | wiki 导出复用本系统：扩 `ExportSourceType.WIKI` + `ExportFormat.TARBALL`                                                                            |
| **(v1.4) `ai-engine/content/markdown/wiki-link-parser`**                     | wiki body `[[slug]]` 解析消费方；writing/research/office 跨引用解析也复用                                                                           |
| **(v1.4) `ai-engine/content/markdown/slug-normalize`**                       | wiki title→slug 规范化消费方；同 PR 替换全项目 5+ 处 ad-hoc slugify（消除既有双源）                                                                 |
| **(v1.4) `ai-engine/content/markdown/markdown-sanitizer`**                   | wiki-page.service body 入库前必调；与 frontend rehype-sanitize 形成双层防护                                                                         |
| **(v1.4) `ai-engine/rag/{EmbeddingService, VectorService}`**                 | wiki-query Branch B 直调（v1.4 砍掉 MultiResolutionSearchService 过度抽象，wiki 用现有 RAG 基元两步组合）                                           |
| **(v1.4) `ai-engine/knowledge/synthesis/CrossCuttingSynthesisService`**      | wiki-lint CONTRADICTION + DATA_GAP 调用方（消费新加的 `detectContradictions` / `detectDataGaps` 公共 API，与 topic-insights 共用单源）              |
| **(v1.4) `ai-engine/knowledge/consistency/StaleDetectorService`**            | wiki-lint STALE 调用方（quote vs raw hash 是 wiki+research+writing 共需的独有语义，无既有对应物）                                                   |

---

## 4. 数据模型（已修正 v1.0 错误）

### 4.1 Prisma 新增表（10 张）

> 10 张：`WikiPage` / `WikiPageSource` / `WikiPageLink` / `WikiPageRevision` / `WikiPageEmbedding` / `WikiDiff` / `WikiOperationLog` / `WikiOperationLogPage` / `WikiLintFinding` / `WikiKnowledgeBaseConfig`

```prisma
// 在 KnowledgeBase 上加开关
model KnowledgeBase {
  // ... existing fields ...
  wikiEnabled Boolean              @default(false) @map("wiki_enabled")
  wikiPages   WikiPage[]
  wikiDiffs   WikiDiff[]
  wikiOps     WikiOperationLog[]
  wikiFinds   WikiLintFinding[]
  wikiConfig  WikiKnowledgeBaseConfig?
}

// 一页 wiki：markdown 是唯一权威
model WikiPage {
  id              String   @id @default(uuid())
  knowledgeBaseId String   @map("knowledge_base_id")
  slug            String   @db.VarChar(200)              // canonical-name (DTO 强约束 a-z0-9-)
  title           String   @db.VarChar(500)
  category        WikiPageCategory
  body            String   @db.Text                      // 完整 markdown
  oneLiner        String   @db.VarChar(280)              // index.md 用；<= 280 char
  contentHash     String   @db.VarChar(64) @map("content_hash") // sha256(body)
  lastEditedBy    WikiPageEditedBy @map("last_edited_by")  // USER | LLM | IMPORT

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  knowledgeBase   KnowledgeBase    @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  outboundLinks   WikiPageLink[]   @relation("FromPage")
  sources         WikiPageSource[]
  revisions       WikiPageRevision[]
  embeddings      WikiPageEmbedding[]
  opLogPages      WikiOperationLogPage[]
  lintFindings    WikiLintFinding[]

  @@unique([knowledgeBaseId, slug])
  @@index([knowledgeBaseId, category])
  @@index([knowledgeBaseId, updatedAt])
  @@map("wiki_pages")
}

enum WikiPageCategory {
  ENTITY
  CONCEPT
  SUMMARY
  SOURCE
}

enum WikiPageEditedBy {
  USER
  LLM
  IMPORT
}

// page → KnowledgeBaseDocument 的可验证 citation
// （v1.0 嵌在 sourceRefs JSON 里，引用完整性丢失，已拆出）
// v1.2: 砍 weight 字段（reviewer R2 P1 #8：YAGNI 无消费方）
model WikiPageSource {
  id          String   @id @default(uuid())
  pageId      String   @map("page_id")
  documentId  String   @map("document_id")              // → KnowledgeBaseDocument
  spanStart   Int      @map("span_start")
  spanEnd     Int      @map("span_end")
  quote       String   @db.Text                          // 冗余存原文片段（防 doc rawContent 改导致溯源失效）

  page        WikiPage              @relation(fields: [pageId], references: [id], onDelete: Cascade)
  document    KnowledgeBaseDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([pageId, documentId, spanStart])
  @@index([documentId])
  @@map("wiki_page_sources")
}

// [[slug]] 解析结果。toSlug 软引用，目标可能尚不存在 → lint 报 missing_xref
model WikiPageLink {
  fromPageId String  @map("from_page_id")
  toSlug     String  @map("to_slug") @db.VarChar(200)

  fromPage   WikiPage @relation("FromPage", fields: [fromPageId], references: [id], onDelete: Cascade)

  @@id([fromPageId, toSlug])
  @@index([toSlug])  // backlinks 反查
  @@map("wiki_page_links")
}

// apply 前的 body 快照（解决 revert + stale lint 历史比对）
// 简化版本史：只 (pageId, body, contentHash, opId)，不存 diff 链
// v1.2: opId 补 Prisma @relation 声明（reviewer R2 P1 #3）
model WikiPageRevision {
  id          String   @id @default(uuid())
  pageId      String   @map("page_id")
  body        String   @db.Text                          // 快照时刻的完整 markdown
  contentHash String   @db.VarChar(64) @map("content_hash")
  opId        String?  @map("op_id")                     // 关联 WikiOperationLog（nullable for backfill）
  createdAt   DateTime @default(now()) @map("created_at")

  page        WikiPage          @relation(fields: [pageId], references: [id], onDelete: Cascade)
  op          WikiOperationLog? @relation(fields: [opId], references: [id], onDelete: SetNull)

  @@index([pageId, createdAt(sort: Desc)])
  @@index([opId])
  @@map("wiki_page_revisions")
}

// 大库分支：wiki page 整页 embedding（独立于 ChildEmbedding，不走 chunk 管道）
// 一个 page 至多两条：oneLiner + body
// v1.2: model `@default("")` 不再硬编码 provider 模型名（reviewer R2 P1 #2 + CLAUDE.md 反硬编码）
//       写入时由 EmbeddingService 提供实际 model 名（与 query 时使用的 model 一致避免维度漂移）
model WikiPageEmbedding {
  id         String   @id @default(uuid())
  pageId     String   @map("page_id")
  resolution WikiPageEmbedResolution                      // ONELINER | BODY
  embedding  Json                                         // Railway 不支持 pgvector，与 ChildEmbedding 一致用 Json
  model      String   @default("")                        // 由 EmbeddingService 写入时填实际 model
  dimensions Int      @default(1536)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  page       WikiPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@unique([pageId, resolution])
  @@map("wiki_page_embeddings")
}

enum WikiPageEmbedResolution {
  ONELINER
  BODY
}

// ingest 提出的 diff（用户审阅后 apply 或 dismiss）
// 整个 ingest 管线靠它存活
model WikiDiff {
  id              String   @id @default(uuid())
  knowledgeBaseId String   @map("knowledge_base_id")
  status          WikiDiffStatus @default(PENDING)
  // items: { creates: [{slug, title, category, body, oneLiner, sources}], updates: [{slug, newBody, newOneLiner?, sources?}], deletes: [slug] }
  items           Json
  // ingest 时 LLM 看到的现有 wiki 状态指纹（apply 时用于乐观锁：现有 wiki 已变即冲突）
  baselineHash    String   @db.VarChar(64) @map("baseline_hash")
  // diff 涉及的 slug 集合（用于"slug 集合冲突"并发判定）
  affectedSlugs   String[] @map("affected_slugs")
  createdByUserId String   @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  appliedAt       DateTime? @map("applied_at")
  dismissedAt     DateTime? @map("dismissed_at")

  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  @@index([knowledgeBaseId, status])
  @@map("wiki_diffs")
  // 多 PENDING diff 允许并存，service 层用 affectedSlugs 交集判冲突（§2.2 决策）
  // 配套 GIN partial index 在手写 SQL migration 中追加（不在 Prisma schema DSL 内可声明）：
  //   CREATE INDEX wiki_diffs_affected_slugs_gin
  //     ON wiki_diffs USING GIN (affected_slugs)
  //     WHERE status = 'PENDING';
}

enum WikiDiffStatus {
  PENDING
  APPLIED
  DISMISSED
  CONFLICTED   // 提交 apply 时检测到 baselineHash 不匹配
}

// log.md 的 DB 形态（append-only）
// pageIds 改为 WikiOperationLogPage 关系表，便于 join 查询
// v1.2: 加 revisions 反向关系（WikiPageRevision.opId 补 FK）
model WikiOperationLog {
  id              String   @id @default(uuid())
  knowledgeBaseId String   @map("knowledge_base_id")
  op              WikiOp
  title           String   @db.VarChar(500)
  meta            Json     @default("{}")
  actorUserId     String?  @map("actor_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  knowledgeBase   KnowledgeBase           @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  pages           WikiOperationLogPage[]
  revisions       WikiPageRevision[]

  @@index([knowledgeBaseId, createdAt(sort: Desc)])
  @@map("wiki_operation_logs")
}

enum WikiOp {
  INGEST
  LINT
  EDIT
  REVERT
  // QUERY 砍掉（reviewer 简化建议：无消费方）
}

// v1.2: pageId 补 Prisma @relation（reviewer R2 P1 #5）
//       onDelete: SetNull + nullable pageId — 页面删除后 log 条目保留历史，pageId 置空
//       Prisma 复合主键不允许 nullable 字段 → 用独立 id PK + partial unique 兼容
model WikiOperationLogPage {
  id     String  @id @default(uuid())
  opId   String  @map("op_id")
  pageId String? @map("page_id")
  role   WikiOpPageRole              // CREATED | UPDATED | DELETED | AFFECTED

  op     WikiOperationLog @relation(fields: [opId], references: [id], onDelete: Cascade)
  page   WikiPage?        @relation(fields: [pageId], references: [id], onDelete: SetNull)

  @@unique([opId, pageId, role])  // 仅当 pageId 非空时（pageId=null 行罕见，是 page 删除后的孤立历史）
  @@index([pageId, opId])
  @@map("wiki_operation_log_pages")
}

enum WikiOpPageRole {
  CREATED
  UPDATED
  DELETED
  AFFECTED
}

// lint 找到的问题（5 类 + 解决标记）
// v1.2: pageId 补 Prisma @relation（reviewer R2 P1 #4）
//       onDelete: SetNull — page 删除后 finding 不连带删（保留历史），pageId 置空
//       service 层查询时按需过滤 pageId IS NOT NULL（ORPHAN/MISSING_XREF 类本来就允许 null）
model WikiLintFinding {
  id              String   @id @default(uuid())
  knowledgeBaseId String   @map("knowledge_base_id")
  type            WikiLintType
  pageId          String?  @map("page_id")
  detail          Json
  resolvedAt      DateTime? @map("resolved_at")
  // resolvedByUserId 已砍（reviewer 简化：YAGNI，单写者无消费方）
  createdAt       DateTime @default(now()) @map("created_at")

  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  page            WikiPage?     @relation(fields: [pageId], references: [id], onDelete: SetNull)

  @@index([knowledgeBaseId, resolvedAt, type])
  @@index([pageId])
  @@map("wiki_lint_findings")
}

enum WikiLintType {
  CONTRADICTION
  STALE
  ORPHAN
  MISSING_XREF
  DATA_GAP
}

// 阈值持久化（每 KB 独立配，admin UI 后期可暴露）
// v1.2: 加 ingestMaxTokens（reviewer R2 P1 #9：避免 P1 hardcode→P2 切 Config 歧义）
//       表 P0 一起建，P1 即可读取
model WikiKnowledgeBaseConfig {
  knowledgeBaseId    String  @id @map("knowledge_base_id")
  inlinePageCount    Int     @default(200) @map("inline_page_count")
  inlineTokenBudget  Int     @default(500_000) @map("inline_token_budget")
  ingestMaxTokens    Int     @default(80_000) @map("ingest_max_tokens")        // ingest 单批 raw 输入上限
  cronLintEnabled    Boolean @default(true) @map("cron_lint_enabled")
  cronLintDailyBudgetCalls Int @default(50) @map("cron_lint_daily_budget_calls")  // CONTRADICTION/DATA_GAP LLM 调用上限
  updatedAt          DateTime @updatedAt @map("updated_at")

  knowledgeBase      KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  @@map("wiki_knowledge_base_configs")
}

// 修改 ExportSourceType + ExportFormat
enum ExportSourceType {
  // ... existing ...
  WIKI            // ★ 新增
}
enum ExportFormat {
  // ... existing ...
  TARBALL         // ★ 新增（可命名为 TAR_GZ）
}
```

### 4.2 schema 关键约束

- **partial unique**：v1.0 想要"同 KB 同时只一个 PENDING diff"，v1.1 改为 service 层 affectedSlugs 交集判定（架构师 P1）
- **FK onDelete: Cascade**：KB 删 → wiki 全链清；page 删 → revision/source/embedding/link 全清
- **`WikiPageSource` 改 FK to `KnowledgeBaseDocument`**：document 删除 → source 自动清，引用完整性
- **partial unique 仍要：`@@unique([pageId, resolution])`**：每页每 resolution 至多一条 embedding

### 4.3 体量阈值

```
DEFAULT (写在 WikiKnowledgeBaseConfig.default 行 / WikiConfig consts):
  inlinePageCount        = 200
  inlineTokenBudget      = 500_000  // 约等于 GPT-5 / Claude 4 半窗
```

KB 超过任一阈值时 query 路由切"RAG 选页 + 长 context"分支。每 KB 可独立调（写入 `WikiKnowledgeBaseConfig` 行），无 config 行的 KB 用全局默认。

### 4.4 slug 规范化（reviewer + tester P0）

**纯函数 `normalizeSlug(title)`**：

```typescript
function normalizeSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD") // unicode 拆解
    .replace(/[̀-ͯ]/g, "") // 删变音符
    .replace(/[^a-z0-9]+/g, "-") // 非 ascii alnum → -
    .replace(/^-+|-+$/g, "") // 头尾 -
    .slice(0, 200);
}
```

**DTO 校验**：

```typescript
@IsString()
@Matches(/^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/, {
  message: 'slug must be kebab-case (a-z, 0-9, hyphens), 2-200 chars, no leading/trailing hyphens',
})
slug: string;
```

**例**：

| 输入               | 输出                              |
| ------------------ | --------------------------------- |
| `Machine Learning` | `machine-learning`                |
| `OpenAI's GPT-4`   | `openai-s-gpt-4`                  |
| `   spaces   `     | `spaces`                          |
| `数据科学`         | `数据科学` → DTO 拒（必须 ascii） |
| `[[evil]]`         | `evil`                            |
| `../etc/passwd`    | `etc-passwd`（不会有路径穿越）    |

> **本期 slug 仅 ASCII**；i18n（中文/日文等 non-ASCII slug 渲染）后续单独 ADR。

---

## 5. 关键管线

### 5.1 Ingest（用户主动触发，产出 diff）

```
Trigger:    POST /api/v1/library/wiki/:kbId/ingest
Input:      { documentIds: string[] }   // 必须是 KnowledgeBaseDocument id
↓
Step 1:     load documents (验证 documentId 属于 kbId) →
            读 WikiKnowledgeBaseConfig(kbId).ingestMaxTokens (默认 80_000) →
            assemble raw context（按 token counter 截断到 ingestMaxTokens 上限）
            ↓ 安全：每篇 doc rawContent 经 wrapExternalContent({
                       source: 'kb_document',
                       title,
                       maxLength: Math.floor((remainingTokenBudget × 4) / docCount),  // ★ 显式按剩余预算分配
                     }) 包裹（v1.2 security R2 P2：避免默认 maxLength=2000 与 ingestMaxTokens 矛盾）
Step 2:     load 当前 KB 全 wiki index 视图（pageId/slug/oneLiner/category/contentHash）→
            计算 baselineHash = sha256(JSON.stringify(index sorted))
Step 3:     skill `wiki-ingest` (PromptSkillBridge.registerDomain("library") 注册)
              system: gist 节选 + 当前 wiki shape + EXTERNAL_CONTENT_SYSTEM_NOTICE_ZH
              user:   wrapExternalContent(raw) + 当前 index
              tools:  [propose_create_page, propose_update_page, propose_link]
              输出:  WikiDiff.items = { creates, updates }
                       creates: [{slug, title, category, body, oneLiner, sources}]
                       updates: [{slug, newBody, newOneLiner?, sources?}]    ← 全量替换
Step 4:     parse [[slug]] in proposed bodies (remark AST) → 检查目标存在性
Step 5:     persist WikiDiff (status=PENDING, baselineHash, affectedSlugs, createdByUserId)
            → 返回 diffId
↓
User UI:    /library/wiki/[kbId]/diff/[diffId] 列出 N 项变更，用户 accept/dismiss/edit
↓
On accept:  PATCH /diffs/:diffId  body={action:'apply', selectedItemIds?:[]}
            ↓
            ★ Step A: zod parse `WikiDiff.items`（v1.2 security R2 P2：LLM 输出可能含
                      非法字段；用 WikiDiffItemsSchema 强校验失败 400 - schema 定义见 §11）
            ★ Step B: 实时重算 affectedSlugs =
                        items.creates[].slug ∪ items.updates[].slug ∪ items.deletes[]
                      （v1.2 security R2 P1 + v1.2.1 security R3 P1：不信任 DB 预存值，
                      且必须包含 deletes 否则删除路径无 TOCTOU / 冲突防护）
            Step C:   并发判定：扫其他 status=PENDING 的 diff，对每个 other_diff
                      **同样实时重算 other_affectedSlugs from other_diff.items**
                      （v1.2.1 security R3 P2：不读其他 diff 的 DB 预存 affectedSlugs
                      字段，避免恶意/有缺陷 ingest 写空数组让本 diff 的冲突判定失效）
                      若交集非空 → 409 + 提示冲突 diffId
            ↓
            atomic Prisma $transaction(isolationLevel: 'Serializable'):
              ★ Step D: SELECT ... FROM wiki_pages WHERE knowledgeBaseId=$1
                        AND slug IN ($affectedSlugs) FOR UPDATE
                        （含 creates/updates/deletes 三类全部 slug；creates 的 slug
                        命中 0 行行锁是正常的，事务内 INSERT 后由 baselineHash 兜底）
              Step E:   重算锁定后的 baselineHash → 与 diff.baselineHash 比；
                        不一致：rollback + status=CONFLICTED + 返回 409
              Step F:   for each WikiPage to be updated OR deleted:
                          insert WikiPageRevision (snapshot before, opId=null 占位)
              Step G:   upsert WikiPage × creates+updates
              Step G2:  delete WikiPage WHERE slug IN items.deletes[]
                        （v1.2.1：补 v1.2 漏写的 delete 操作；Cascade 自动清
                        WikiPageRevision/Source/Embedding/Link 等）
              Step H:   delete + insert WikiPageLink (重 parse [[slug]])
              Step I:   upsert WikiPageEmbedding × 2N (oneLiner + body)
                        ★ 必须在事务内（v1.2 修正 v1.1 注释"异步排队也可"的矛盾）
              Step J:   insert WikiOperationLog (op=INGEST) → 拿到 opId
              Step K:   update WikiPageRevision.opId for 本次新写的 revision
              Step L:   insert WikiOperationLogPage × N
                        (role=CREATED|UPDATED|DELETED)
              Step M:   update WikiDiff.status = APPLIED, appliedAt
            ↓
            事务异常处理（v1.2.1 security R3 + architect R3）：
              - 捕获 Prisma `P2034` (serialization_failure)：
                自动重试 1 次（Serializable + 高并发下常见）；
                第 2 次仍失败 → 返回 409 CONFLICTED + 提示用户重跑 ingest
              - 其他错误 → 5xx + 完整 rollback
            ↓
            after commit (best-effort, 不回滚):
              run invariant lint (ORPHAN + MISSING_XREF only) → insert WikiLintFinding
              如失败：append WikiOperationLog (op=LINT, meta={error}) 不影响 apply 结果
```

> **关键不变**：
>
> - Skill 输出的 markdown 中**跨 wiki 链接必须用 `[[slug]]`**；外部 URL 用标准 `[text](url)` 允许（Karpathy 原意未禁，架构师 P1 修正 v1.0 过严）
> - `[[slug]]` 的 slug 必须经 `normalizeSlug` 校验；不合法 slug 的 diff 项整体被 apply 服务层拒
> - 同一时刻**允许多个 PENDING diff 并存**，但 affectedSlugs 有交集时第二个 apply 必败

### 5.2 Query（默认长 context；超阈值切 RAG 选页）

```
Trigger:    POST /api/v1/library/wiki/:kbId/query
Input:      { question, history?, mode?: 'inline'|'rag'|'auto' }   // mode 默认 'auto'
↓
Resolve config: load WikiKnowledgeBaseConfig(kbId) || DEFAULTS
              → inlinePageCount, inlineTokenBudget
↓
Branch resolution:
  - mode='inline' or (mode='auto' && pageCount ≤ inlinePageCount && totalTokens ≤ inlineTokenBudget)
    → Branch A
  - mode='rag' or 阈值超
    → Branch B

Branch A (inline 长 context):
  Step 1:   load all WikiPage where kbId（slug + oneLiner 全量 + body 后续按需）
  Step 2:   组装 context：
              先 index 视图（slug + oneLiner，~60 tok/page × pageCount）
              然后 body：先按 BM25 / pg_trgm 对 question 排序（不需要 embedding），
                         按相关性顺序装直到 totalTokens 上限
                         （reviewer P1：避免"按 updatedAt desc 装"造成旧知识盲区）
  Step 3:   skill `wiki-query`：合成回答 + citation slug 数组
  Step 4:   不写 WikiOperationLog（QUERY op 已砍）

Branch B (RAG 选页，v1.4 直调 engine 基元两步组合，不抽象 service):
  Step 1:   const qVec = await engineFacade.embeddingService.embed(question);
            const hits = await engineFacade.vectorService.similaritySearch(qVec, {
              filter: { sourceTable: 'wiki_page_embeddings', kbId, resolution: 'ONELINER' },
              topK: 15,
            });   // → [{ pageId, score }]
            （v1.4：撤回 v1.3 MultiResolutionSearchService 过度抽象，wiki 单消费方
            不构成抽象触发条件——CLAUDE.md "3 处使用再考虑抽象"）
  Step 2:   load 选中页全文 → 按 totalTokens 装 context
  Step 3-4: 同 A
↓
Output:   { answer: string, citations: [{slug}], usedPageIds: string[] }
```

### 5.3 Lint（v1.4 修订：CONTRADICTION/DATA_GAP 折叠到现有 CrossCuttingSynthesisService）

```
ORPHAN          (纯 SQL，wiki 专属):  WikiPage 没有 inbound WikiPageLink + category != SOURCE
MISSING_XREF    (纯 SQL，wiki 专属):  WikiPageLink.toSlug 不存在于 WikiPage

下三类 wiki-lint.service 装好数据后调 engine 既有/新增 primitives：

STALE           (LLM):  调 engine `StaleDetectorService.detect({
                          entries: pages.map(p => ({
                            id: p.id,
                            sources: p.sources.map(s => ({
                              referenceText: s.quote,                       // 旧 quote
                              currentText: s.document.rawContent.slice(s.spanStart, s.spanEnd),  // 当前 raw
                            })),
                          })),
                          taskProfile: { creativity: 'deterministic' },
                        })` → 每条 entry 是否 stale + 偏移度
                        wiki-lint 把 stale=true 的 entry 写入 WikiLintFinding (type=STALE)

CONTRADICTION   (LLM):  调 engine `CrossCuttingSynthesisService.detectContradictions({
                          documents: pagesGroupedByCategory.flatMap(...),  // 按 category 分组的 markdown 数组
                          samplingLimit: config.cronLintDailyBudgetCalls,   // 抽样上限
                          preferRecent: { sinceHours: 168 },                // 7d 内变动页优先
                          taskProfile: { creativity: 'deterministic' },
                        })` → Contradiction[]（与 topic-insights 共用同一服务+同一类型）
                        wiki-lint 写入 WikiLintFinding (type=CONTRADICTION, detail={pageA, pageB, reason})

DATA_GAP        (LLM):  调 engine `CrossCuttingSynthesisService.detectDataGaps({
                          documents: pages,
                          minMentions: 3,
                          existingEntityIds: pages.filter(p => p.category=='ENTITY').map(p => p.slug),
                          taskProfile: { creativity: 'deterministic' },
                        })` → DataGap[]（与 ResearchGap 复用同概念）
                        wiki-lint 写入 WikiLintFinding (type=DATA_GAP)
```

> **能力归属（v1.4 修订）**：CONTRADICTION/DATA_GAP 不另起 service——`CrossCuttingSynthesisService` 已在 topic-insights 跑同概念检测（已 export Contradiction/ResearchGap 类型），违反"同名概念全项目唯一"红线；改为给现有 service **加 2 个公共低级 API**，wiki/topic-insights/research/writing 都用同一个服务的不同方法。STALE 是独有语义（quote vs current text），单独留 `StaleDetectorService` 在新建 `consistency/` 子目录。

**触发时机**：

| 触发                           | 范围                                             |
| ------------------------------ | ------------------------------------------------ |
| ingest apply 后（事务外）      | ORPHAN + MISSING_XREF（纯 SQL，零 LLM 成本）     |
| 用户主动 `POST /lint`          | 5 类全跑                                         |
| cron daily（KB 级开关 + 预算） | 5 类全跑，但 LLM 类 ≤ `cronLintDailyBudgetCalls` |

**并发**：cron 与用户主动同时触发时——service 层用 `WikiOperationLog where op=LINT and createdAt > now-1m` 探测是否在跑，跑中则第二个直接返回最近 finding 集（不重跑）。

> **TaskProfile**: STALE / CONTRADICTION 用 `creativity=deterministic` (T=0.1) 避免幻觉过 lint。

### 5.4 Export（复用 ExportJob）

```
Trigger:    POST /api/v1/library/wiki/:kbId/export
            body: { format: 'TARBALL' }
↓
Service:    创建 ExportJob 行 (sourceType=WIKI, sourceId=kbId, format=TARBALL, status=QUEUED)
            返回 jobId（同 office/research export 协议）
↓
Worker:     for await page of streamPages(kbId):
              tar.entry({name: `wiki/${page.category.toLowerCase()}/${safeSlug(page.slug)}.md`}, page.body)
            tar.entry({name: 'wiki/index.md'}, generateIndex(pages))
            tar.entry({name: 'wiki/log.md'}, generateLog(opLogs))
            for await doc of streamDocuments(kbId):
              tar.entry({name: `raw/${doc.id}.md`}, doc.rawContent)
            ↓
            上传到对象存储 → 生成签名 URL → ExportJob.status=COMPLETED + downloadUrl
↓
Frontend:   轮询 ExportJob 状态（同现有模式）
```

> **安全**：tarball 路径生成时 slug 做二次过滤 `safeSlug(s) = s.replace(/[^a-z0-9-]/g, '_')`，即使 DB 里有非法字符（理论不会，DTO + normalizeSlug 兜底）也阻断路径穿越。

---

## 6. API 设计（13 个 endpoint，含 export）

| Method | Path                                    | 用途                                          | 鉴权             |
| ------ | --------------------------------------- | --------------------------------------------- | ---------------- |
| GET    | `/library/wiki/:kbId/pages`             | 列页（可 ?category= ）                        | KB VIEWER 及以上 |
| GET    | `/library/wiki/:kbId/pages/:slug`       | 单页 body + outboundLinks + backlinks         | KB VIEWER 及以上 |
| POST   | `/library/wiki/:kbId/pages`             | 用户手动建页                                  | KB EDITOR 及以上 |
| PATCH  | `/library/wiki/:kbId/pages/:slug`       | 用户手动改页（写 revision）                   | KB EDITOR 及以上 |
| DELETE | `/library/wiki/:kbId/pages/:slug`       | 用户删页                                      | KB EDITOR 及以上 |
| POST   | `/library/wiki/:kbId/ingest`            | 触发 ingest，返回 diffId                      | KB EDITOR 及以上 |
| GET    | `/library/wiki/:kbId/diffs/:diffId`     | 取 diff 详情                                  | KB EDITOR 及以上 |
| PATCH  | `/library/wiki/:kbId/diffs/:diffId`     | apply 或 dismiss（合并 v1.0 两个 endpoint）   | KB EDITOR 及以上 |
| POST   | `/library/wiki/:kbId/query`             | 提问（带路由）                                | KB VIEWER 及以上 |
| POST   | `/library/wiki/:kbId/lint`              | 触发 lint                                     | KB EDITOR 及以上 |
| GET    | `/library/wiki/:kbId/lint-findings`     | 列 lint 发现                                  | KB VIEWER 及以上 |
| PATCH  | `/library/wiki/:kbId/lint-findings/:id` | resolve 或 dismiss（合并 v1.0 两个 endpoint） | KB EDITOR 及以上 |
| POST   | `/library/wiki/:kbId/export`            | 触发 export job（走 ExportJob）               | KB VIEWER 及以上 |

**鉴权实现**：所有路由 `@UseGuards(JwtAuthGuard)` + service 层第一行 `await this.kbService.hasAccess(userId, kbId, RequiredRole)` 校验，与 `RAGController` / `NotesController` 一致。**不创新 KnowledgeBaseGuard**（v1.0 虚构）。

**`wikiEnabled=false` 守门**（tester R2 边缘 #1）：所有写操作 endpoint（POST/PATCH/DELETE）service 层 hasAccess 后第二步：

```typescript
const kb = await this.prisma.knowledgeBase.findUnique({ where: { id: kbId } });
if (!kb.wikiEnabled)
  throw new BadRequestException("Wiki not enabled for this KB");
```

读操作（GET）允许在 `wikiEnabled=false` 的 KB 上调用以查看历史数据，但前端 UI 隐藏入口（§7）。

**diffId IDOR 防护**（security R1 P1）：所有 `/diffs/:diffId/...` service 层第一行 `if (diff.knowledgeBaseId !== kbId) throw new ForbiddenException()`。

**revert**：作为 `PATCH /pages/:slug` 的子动作 `body={action:'revert', toRevisionId}`，不单独 endpoint；写 `WikiOp.REVERT` log。

**revert 跨页 IDOR 防护**（v1.2 security R2 P1）：service 层强制校验 `revision.pageId === currentPage.id`：

```typescript
const revision = await this.prisma.wikiPageRevision.findUnique({
  where: { id: toRevisionId },
});
if (!revision || revision.pageId !== currentPage.id) {
  throw new ForbiddenException("Revision does not belong to this page");
}
```

防 EDITOR 用别页面的 revisionId 替换当前页内容。

---

## 7. UI 设计（P3）

```
/library/wiki/[kbId]
├─ 顶部 Toolbar：[Ingest] [Lint] [Export] [Query] [创建页] | log.md 时间线下拉
├─ 左 Sidebar（30%）
│   ├─ 树形导航：Entities / Concepts / Summaries / Sources
│   └─ 搜索框（对 slug + oneLiner full-text）
├─ 中 Main（50%）
│   ├─ 当前 page markdown 渲染（rehype-sanitize 复用前端既有）
│   ├─ [[link]] 可点击跳转
│   ├─ 编辑模式（markdown 编辑器，保存时写 WikiPageRevision + lastEditedBy=USER）
│   └─ 页面历史 timeline（WikiPageRevision，可点击 revert）
└─ 右 Inspector（20%）
    ├─ oneLiner（可编辑）
    ├─ Sources（链回 KnowledgeBaseDocument 详情）
    ├─ Backlinks（toSlug 索引反查）
    └─ 当前页相关 lint findings（PATCH resolve/dismiss）

/library/wiki/[kbId]/diff/[diffId]
├─ 列 N 项变更（creates 蓝 / updates 黄）
├─ 每项展开：
│   - creates: 新页预览（slug, title, category, body markdown 渲染）
│   - updates: 客户端 diff 视图（用 npm `diff` 或 `react-diff-viewer-continued`，
│              对比当前 body vs proposed newBody）
├─ 全选 / 反选 / [Apply selected] [Dismiss all]
└─ 顶部提示：baselineHash 已变 → 全 diff 失效，请重跑 ingest（CONFLICTED 状态时）

入口位置（reviewer P1 漏点）：
  - 主 Agent 在 frontend/app/library/page.tsx 加 LibraryTabs 项（条件 wikiEnabled=true 才展示）
  - 这个改动在 P3，**禁 Sub-Agent 修改**（CLAUDE.md 入口文件红线），主 Agent 手动加
```

---

## 8. 落地路径

| Phase                                | 范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 周期   | 验证标准（命令级，可独立循环）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0a engine 通用能力（v1.4 精简）** | (1) `ai-engine/content/markdown/wiki-link-parser.util.ts` + `slug-normalize.util.ts`，**同 PR 替换全项目 5+ 处 ad-hoc slugify**（report-artifact-assembler / structural-report-assembler / ai-model-discovery / secret-name.catalog / custom-agent.dto）<br>(2) `ai-engine/knowledge/synthesis/cross-cutting-synthesis.service.ts` 加 2 个低级 public API：`detectContradictions(documents)` / `detectDataGaps(documents, opts)`（既不复制 prompt 也不另起 service）<br>(3) `ai-engine/knowledge/consistency/stale-detector.service.ts` + `consistency.module.ts`（**仅** 1 个 service）<br>(4) facade 加 3 export：`parseMarkdownWikiLinks` / `normalizeMarkdownSlug` / `StaleDetectorService` | 1.5 天 | `npm test --testPathPattern='ai-engine/(content/markdown\|knowledge/(synthesis\|consistency))'` 全绿；`verify:arch` 全绿；现有 5+ 处 ad-hoc slugify 替换后所有原调用方测试仍绿                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **P0b schema + ADR**                 | 10 张新表（含 `WikiKnowledgeBaseConfig`，从 P2 提到 P0）+ `KnowledgeBase.wikiEnabled` + `ExportSourceType.WIKI` + `ExportFormat.TARBALL` + 手写 SQL migration（IF NOT EXISTS 幂等 + `wiki_diffs.affected_slugs` GIN partial index + 5 处 SetNull onDelete）+ `docs/architecture/decisions/ADR-XXX-wiki-vs-graph-coexistence.md` 落盘                                                                                                                                                                                                                                                                                                                                                            | 1 天   | `npm test --testPathPattern=wiki/__tests__/schema` 全绿（CRUD + uniq + FK cascade + SetNull 行为）<br>migration 在 Railway 跑两次第二次不报错                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **P1 ingest + edit + log**           | 全部 wiki service + DTO + controller + skills/wiki-ingest.skill.md + WikiPageRevision 写入 + invariant lint + diff apply 事务（消费 P0a 的 engine 能力）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 4 天   | engine 侧（P0a 已建）：<br>- `wiki-link-parser.util.spec.ts` 10 条边界用例（见 §10）<br>- `slug-normalize.util.spec.ts`<br>wiki app 侧：<br>- `wiki-page.service.spec.ts`（CRUD + slug uniq + **PATCH edit 路径写 WikiPageRevision** + **revert 跨页 revisionId 返回 403**；调 engine `parseMarkdownWikiLinks` + `sanitizeMarkdownBody` mock）<br>- `wiki-diff.service.spec.ts`（事务：第 N+1 项失败前 N 不提交；CONFLICTED 路径；revert 写 revision；**WikiDiffItemsSchema zod parse 失败 400**；**affectedSlugs 实时重算（DB 字段被改空仍能挡冲突）**；**SELECT FOR UPDATE 串行化两并发 apply 测试**）<br>- `wiki-ingest.service.spec.ts`（mock ChatFacade，验证 wrapExternalContent 调用含显式 maxLength + diff 持久化 + **baselineHash 计算确定性：相同 index 两次 hash 相等**）<br>- `wiki.controller.spec.ts`（diffId IDOR：跨 KB diff 返回 403；**wikiEnabled=false 时 POST/PATCH/DELETE 返回 400**） |
| **P2 query + lint（v1.4 修订）**     | wiki-query 双分支（Branch B 直调 engine `EmbeddingService.embed` + `VectorService.similaritySearch`）+ WikiPageEmbedding 写入 + ORPHAN/MISSING_XREF wiki 自做（纯 SQL）+ STALE 调 `StaleDetectorService` + CONTRADICTION/DATA_GAP 调 `CrossCuttingSynthesisService.{detectContradictions, detectDataGaps}` + cron 读 `WikiKnowledgeBaseConfig`                                                                                                                                                                                                                                                                                                                                                  | 3 天   | engine 侧（P0a 已建，P2 补集成测）：<br>- `cross-cutting-synthesis.service.spec.ts` 加 2 项：`detectContradictions` / `detectDataGaps` 各 ≥1 fixture（mock ChatFacade）<br>- `stale-detector.service.spec.ts` ≥1 fixture<br>wiki app 侧：<br>- `wiki-query.service.spec.ts`：阈值边界 pageCount=200/201、Branch B mock `embeddingService.embed` + `vectorService.similaritySearch` 调用断言（filter 含 `sourceTable: 'wiki_page_embeddings'` + `kbId` + `resolution: 'ONELINER'`）、BM25 排序（Branch A）生效<br>- `wiki-lint.service.spec.ts`：ORPHAN/MISSING_XREF 纯 SQL 不调 LLM；STALE/CONTRADICTION/DATA_GAP 调 engine 服务 mock 验证传参（samplingLimit / preferRecent / minMentions）<br>- cron 与手动并发 spec：第二次返回最近 finding 不重跑<br>- 把首个真实 KB query 结果存到 `eval-baseline.md`（不作为 Phase gate）                                                                              |
| **P3 UI + export**                   | tree nav + markdown 渲染 + [[link]] 跳转 + diff 视图 + lint 面板 + LibraryTabs 入口 + ExportJob 集成（WIKI / TARBALL）+ 现场试用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 4 天   | `npm test --testPathPattern=wiki` (后端 + 前端组件) 全绿<br>`verify:arch` 全绿（wiki 不穿透 ai-engine 内部）<br>e2e 手测：导入 5 篇 doc → ingest → apply → query → lint → resolve → export tarball 解压可读                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **合计**                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 12 天  | 每 Phase 落地后 4 路集体评审到 4/4 共识再进下一 Phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

> **覆盖率守门**（tester P1）：`backend/jest.config.js` 加：
>
> ```js
> "./src/modules/ai-app/library/wiki/": {
>   branches: 70,
>   functions: 80,
>   lines: 80,
>   statements: 80,
> },
> ```

---

## 9. 风险与缓解

| 风险                                              | 缓解                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| LLM 写出语义重合的两个 page 导致双源              | ingest skill 先列现有 index 给 LLM，prompt 强约束"prefer update over create"；diff UI 显式展示 create/update 比例    |
| `[[slug]]` 失锚（链到不存在的页）                 | 不阻塞保存，写 missing_xref finding；UI 高亮链可点"建空页"快速建占位                                                 |
| 大库 query 走 RAG 分支后 retrieval noise 又回来   | RAG 只在 oneLiner 上跑（不在 body 上），oneLiner 是高度浓缩文本（≤280 char），噪声远低于原始 chunk                   |
| document 改了导致大量 page 过期                   | sources 表存 `quote` 冗余字段；STALE lint 用 LLM 判 quote 上下文偏移而非字符 diff，且 LLM 调用按 KB 日预算限速       |
| import documents 速度跟不上 ingest skill          | ingest 异步队列化（NestJS Bull），diffId 立即返回，前端用 WebSocket 拿进度                                           |
| 多用户同 KB 同时 ingest 触发互相覆盖              | apply 时 `baselineHash` 乐观锁 + `affectedSlugs` 集合冲突判定；空交集允许并存                                        |
| export tarball 大库内存爆                         | 流式 `tar-stream`；Page body 按页流出而不是全聚合；超过 200MB 切 multipart 提示用户分 KB 导出；走 ExportJob 异步系统 |
| 架构边界违规                                      | wiki 子模块只 import `AiEngineModule` facade；`verify:arch` + `layer-boundaries.spec.ts` 守门                        |
| KG 数据被无意废弃                                 | KG 表/字段保留只读；本期不删；ADR-XXX 明示 wiki entity ≠ Note.graphNodes 不互相同步                                  |
| Karpathy 阈值假设放在 Claude/GPT 不一定够         | 阈值进 `WikiKnowledgeBaseConfig` 每 KB 可调；进 context 前 token counter 截断兜底                                    |
| **prompt injection**（用户在 doc 里写"忽略指令"） | wiki-ingest 强制 `wrapExternalContent` + `EXTERNAL_CONTENT_SYSTEM_NOTICE`；安全审计日志（`prompt-sanitizer` 已集成） |
| **slug 路径穿越 / XSS**                           | DTO `@Matches` + export 二次校验 `safeSlug` + 前端 `rehype-sanitize`                                                 |
| **diffId IDOR**                                   | service 层第一行验 `diff.knowledgeBaseId === kbId`；spec 强制覆盖跨 KB 场景                                          |
| **PII 数据泄露给 BYOK 第三方模型**                | 在 wiki query / ingest 入口加一次性合规告知（GDPR Art.13/14）；UI 提示"内容会发送给您配置的 AI 模型提供商"           |
| **cron lint 资源滥用**                            | KB 级开关 `cronLintEnabled` + 每日预算 `cronLintDailyBudgetCalls=50`；超额标"待复查"不再调 LLM                       |
| **大 note 输入压垮 ingest**                       | controller 层 token counter 80K 上限强制截断 + 显式告知用户                                                          |
| **dirty write**（apply 时另一用户在改）           | apply 用 `baselineHash` 乐观锁 + `WikiPage.contentHash` 行级比对；冲突 → CONFLICTED + 409，要求重跑 ingest           |

---

## 10. link-parser 测试用例（tester P0 锁定）

`link-parser.spec.ts` 必须覆盖以下 10 条（用 remark AST 实现）：

| #   | 输入 markdown            | 期望 slugs             | 备注                                |
| --- | ------------------------ | ---------------------- | ----------------------------------- |
| 1   | `[[machine-learning]]`   | `['machine-learning']` | 基本                                |
| 2   | `[[Machine Learning]]`   | `['machine-learning']` | 调 normalizeSlug 后                 |
| 3   | `` `[[code-block]]` ``   | `[]`                   | 行内代码不解析                      |
| 4   | ` ```\n[[fenced]]\n``` ` | `[]`                   | 代码围栏内不解析（remark AST 跳过） |
| 5   | `\[\[escaped\]\]`        | `[]`                   | 反斜杠转义                          |
| 6   | `[[a]] and [[b]]`        | `['a', 'b']`           | 同行多个                            |
| 7   | `[[]]`                   | `[]`                   | 空 slug 不合法                      |
| 8   | `[[slug-with-123]]`      | `['slug-with-123']`    | 数字混合                            |
| 9   | `[[a/b/c]]`              | `[]`                   | 路径斜杠不允许（路径穿越防护）      |
| 10  | `<!-- [[comment]] -->`   | `[]`                   | HTML 注释内不解析                   |

> 用例 9 / 10 在 v1.0 是开放问题，v1.1 锁定。

---

## 11. 安全 checklist（security P0/P1 全部覆盖）

| 位置                                                            | 措施                                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dto/*.dto.ts` 所有 slug 字段                                   | `@Matches(/^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/)`                                                                                                   |
| `wiki-ingest.service.ts` 进入 LLM 前                            | `wrapExternalContent(docRawContent, {source:'kb_document'})` + 系统 prompt 末附 `EXTERNAL_CONTENT_SYSTEM_NOTICE_ZH`                                |
| `wiki-page.service.ts` export tarball                           | `safeSlug = slug.replace(/[^a-z0-9-]/g, '_')` 二次校验                                                                                             |
| `wiki-diff.service.ts` apply/dismiss 入口                       | `if (diff.knowledgeBaseId !== kbId) throw ForbiddenException()`                                                                                    |
| `wiki-page.service.ts` sourceRef 写入                           | 校验 `0 ≤ spanStart ≤ spanEnd ≤ document.rawContent.length`                                                                                        |
| controller 层所有路由                                           | `@UseGuards(JwtAuthGuard)` + service 层 `kbService.hasAccess(userId, kbId, RequiredRole)`                                                          |
| 写操作 service 层（v1.2 tester R2 边缘）                        | hasAccess 后校验 `kb.wikiEnabled === true`，否则 `BadRequestException`                                                                             |
| ingest controller                                               | `payloadTokenCount > config.ingestMaxTokens` → `BadRequestException` + 明示用户                                                                    |
| `WikiKnowledgeBaseConfig.cronLintDailyBudgetCalls = 50`         | cron lint 超额时 STALE/CONTRADICTION/DATA_GAP 跳过，标 finding type=DATA_GAP detail={budget_exceeded}                                              |
| frontend 渲染 page body                                         | 复用 `frontend/lib/utils/sanitize.ts` 的 `rehype-sanitize` + `katexAwareSchema`                                                                    |
| frontend `[[slug]]` href 拼接                                   | `encodeURIComponent(slug)` 兜底（DTO 已校验，但前端独立兜底）                                                                                      |
| ingest / query 入口（前端）                                     | 一次性合规告知："内容会发送给您配置的 AI 模型提供商"                                                                                               |
| **(v1.2 新增)** `wiki-diff.service.ts` apply 入口               | 进事务前 `WikiDiffItemsSchema.parse(diff.items)`，失败 400（防 LLM 输出非法字段进库）                                                              |
| **(v1.2 新增)** `wiki-diff.service.ts` apply 并发               | 实时从 `diff.items` 重算 affectedSlugs，不读 DB 字段（防恶意/有缺陷 ingest 写空数组绕过冲突）                                                      |
| **(v1.2 新增)** `wiki-diff.service.ts` apply 事务               | `isolationLevel: 'Serializable'` + apply 首步 `SELECT ... FOR UPDATE` 锁所有涉及 page（防 TOCTOU）                                                 |
| **(v1.2 新增)** `wiki-page.service.ts` revert                   | 校验 `revision.pageId === currentPage.id`，否则 `ForbiddenException`（防跨页 IDOR）                                                                |
| **(v1.2 新增)** `wiki-ingest.service.ts` 包裹                   | `wrapExternalContent(content, { source, title, maxLength: 按剩余 budget/N 计算 })`，不依赖默认 maxLength=2000                                      |
| **(v1.2 新增)** export endpoint 鉴权语义                        | VIEWER 与 EDITOR 看到 export 内容**完全相同**（KB 设计本意：VIEWER 可读全部内容，export 不另设权限墙）；前端 UI 加 export 按钮提示词，明示导出范围 |
| **(v1.2.1 新增)** `wiki-ingest.service.ts` 写 WikiPageEmbedding | EmbeddingService 写入侧必须填非空 model 名（与 query 时一致避免维度漂移）；spec 加 "model 字段为空时拒写" 断言（architect R3 P2）                  |
| **(v1.2.1 新增)** `wiki-diff.service.ts` 异常处理               | 捕获 Prisma `P2034` (serialization_failure)：1 次重试；仍失败 → 409 CONFLICTED（security R3 P2）                                                   |
| **(v1.2.1 新增)** `wiki-diff.service.ts` Step C                 | 对其他 PENDING diff 也实时重算 affectedSlugs（不读 DB 预存值），防止 affectedSlugs 字段被写坏让冲突判定失效（security R3 P2）                      |
| **(v1.4 新增)** `wiki-page.service.ts` body 入库                | 入库前必调 engine `sanitizeMarkdownBody(body)`；与 frontend `rehype-sanitize` 形成双层防护（architect R5 非阻塞建议）                              |

### 11.1 `WikiDiffItemsSchema` zod 定义骨架（v1.2.1 security R3 P2）

```typescript
import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/;

const WikiPageSourceItemSchema = z
  .object({
    documentId: z.string().uuid(),
    spanStart: z.number().int().min(0),
    spanEnd: z.number().int().min(0),
    quote: z.string().min(1).max(2000),
  })
  .refine((s) => s.spanStart <= s.spanEnd, "spanStart must <= spanEnd");

export const WikiDiffItemsSchema = z.object({
  creates: z
    .array(
      z.object({
        slug: z.string().regex(SLUG_REGEX),
        title: z.string().min(1).max(500),
        category: z.enum(["ENTITY", "CONCEPT", "SUMMARY", "SOURCE"]),
        body: z.string().min(1).max(200_000), // 单页 body 上限 ~200K char
        oneLiner: z.string().min(1).max(280),
        sources: z.array(WikiPageSourceItemSchema).max(50),
      }),
    )
    .max(100), // 单 diff creates 上限 100
  updates: z
    .array(
      z.object({
        slug: z.string().regex(SLUG_REGEX),
        newBody: z.string().min(1).max(200_000),
        newOneLiner: z.string().min(1).max(280).optional(),
        sources: z.array(WikiPageSourceItemSchema).max(50).optional(),
      }),
    )
    .max(100), // 单 diff updates 上限 100
  deletes: z.array(z.string().regex(SLUG_REGEX)).max(20), // delete 谨慎用
});
```

apply 入事务前 `WikiDiffItemsSchema.parse(diff.items)` 强校验失败 400。span 越界 / body 超长 / slug 非法 / deletes 滥删都在此层挡。

---

## 12. 可观测性（NestJS Logger 关键路径）

| 操作                   | 日志结构                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| ingest skill 调用失败  | `{ op:'ingest', kbId, documentIds, error, durationMs }`               |
| lint LLM 类调用        | `{ op:'lint', kbId, type, durationMs, llmCalls, budgetRemaining }`    |
| apply diff 部分失败    | `{ op:'apply', diffId, succeeded:[], failed:[{slug, reason}] }`       |
| 阈值切换发生           | `{ op:'query', branch:'A'\|'B', kbId, pageCount, totalTokens, mode }` |
| baselineHash 冲突      | `{ op:'apply', diffId, kbId, expected, actual }`                      |
| affectedSlugs 集合冲突 | `{ op:'apply', diffId, conflictWithDiffId, overlappingSlugs }`        |
| cron lint 超额跳过     | `{ op:'cron-lint', kbId, type, budgetSpent, skipped:true }`           |
| export job 进度        | （沿用现有 ExportJob 日志结构，不另起）                               |

每个 service spec 用 `jest.spyOn(logger, 'log'\|'warn'\|'error')` 验证关键路径有日志。

---

## 13. 与项目规范的对齐

- **无双源**（feedback_no_dual_sources）：复用 KnowledgeBase / KnowledgeBaseDocument；KG 冻结 ADR；ChildEmbedding 不侵入
- **simplest-first**（CLAUDE.md §简洁优先）：单一 page 状态 / 不引入 draft-curated-canonical / 默认不 RAG / API 合并 / 砍 QUERY log / 砍 resolvedByUserId
- **暴露多义性**：所有重大决策已让用户选定，新增决策（§2.2 共 15 条）有理由
- **手写 SQL migration**（CLAUDE.md §数据库变更）：P0 提供 `2026MMDD_llm_wiki_init/migration.sql` + IF NOT EXISTS 幂等
- **不破坏现有 RAG**：library-rag.service 不动，只是 query 路由分支增加；wiki 走独立 `WikiPageEmbedding`
- **Ingest 走 diff 不直写**（feedback_destructive_op_must_have_rollback）
- **citation 必带 quote span**：`WikiPageSource` 表带 spanStart / spanEnd / quote 三字段
- **强成功标准**（Karpathy 原则）：所有 Phase gate 改为 `npm test --testPathPattern=wiki` 命令级
- **分析先行禁止猜测**（CLAUDE.md 红线）：v1.0 → v1.1 修订主要原因；本版前已 grep 验证 KnowledgeBaseDocument / ChildEmbedding / KnowledgeBaseGuard / fact-extraction / PromptSkillBridge.registerDomain 真实存在性
- **能力归属判断**（CLAUDE.md `.claude/rules/ai-engine.md`，**v1.3 引入、v1.4 校准**）："如果明天做一个完全不同的 AI App，这个能力还能复用吗？" 答 YES → AI Engine。**v1.4 终态**上提 3 项到 engine（link-parser / slug-normalize / StaleDetector）+ 复用 2 项既有（CrossCuttingSynthesisService 加 2 个低级 API / sanitizeMarkdownBody）+ 直调 2 项基元（EmbeddingService / VectorService）；留 wiki/ 7 项均答 NO（依赖 wiki-specific schema）。**v1.3 v1.4 双轮纠正确立"3 维度归属审查"原则**：①是否穿透 facade ②是否过度集中 app（漏上提）③是否过度抽象/与既有重叠（错上提）
- **不说谎断言**（feedback_no_lying_assertion）：从 `WikiDiff.items` Json 取数据前必须 zod parse，禁止 `as WikiDiffItems` 强断言（v1.2 §11 已强制）
- **反硬编码模型**（CLAUDE.md / feedback_no_hardcoded_pricing 同类原则）：`WikiPageEmbedding.model @default("")`，由 EmbeddingService 写入实际 model 名（v1.2）

---

## 14. 评审纪要索引

- R1 评审纪要：[llm-wiki-review-r1.md](./llm-wiki-review-r1.md)（v1.0，4/4 NEEDS-CHANGES → v1.1）
- R2 评审纪要：[llm-wiki-review-r2.md](./llm-wiki-review-r2.md)（v1.1，2 APPROVED + 2 NEEDS-CHANGES → v1.2）
- R3 + R4 评审纪要：[llm-wiki-review-r3-r4.md](./llm-wiki-review-r3-r4.md)（v1.2 → v1.2.1，跨轮整合达 4/4 APPROVED）
- R5 评审：v1.3 → reviewer/security/tester APPROVED；architect NEEDS-CHANGES（找出 MultiResolutionSearchService 过度抽象 + consistency↔synthesis 重叠两个真问题）→ v1.4
- R6 评审：v1.4，仅 architect 一路复评（其余 3 路 R5 已 APPROVED 不复评）

---

## 15. 仍开放的问题（不阻塞 R2）

1. **wiki-ingest skill 用什么模型？** 默认 reasoning 强的（Opus 4.7 / GPT-5）；BYOK 强制？
2. **export 是否包含 PENDING diff 预览？** 默认不含。
3. **cron lint 整体 KB 还是抽样 KB？** 大量 KB 时是否随机轮询而非每个 KB 每天？
4. **`wikiEnabled=false` 的 KB UI**：tab 隐藏 vs 显示"启用"CTA？
5. **ingest 上下文窗口**：80K tokens 是否够实际？需要在 P1 实施时实测调整。
