# LLM Wiki R8 系统化复盘与优化建议

> **评审对象**：v1.5.3 已落地基线 + v2.0 重建计划 + multi-pass/locale consensus + 后端代码现状（13 服务 / 12 次迁移 / 5862 行测试）
> **评审形式**：3 路并行调研（spec doc / supporting docs / backend code），交叉印证后归纳
> **评审日期**：2026-05-15
> **评审定位**：与 R1-R7 不同——R1-R7 是"局部修订评审"（针对某次 patch 找问题），R8 是"实施前系统化复盘"（在 v2.0 W1-W5 启动前梳理累积工程纪律债）
> **评审结论**：架构本体 4/4 已 APPROVED，无新增阻塞；但累积工程纪律债**显著**，建议插入 **W0 工程纪律 PR**（1-1.5 天）作为 v2.0 实施前置条件
> **建议接受度**：3 类 P0（文档拆分 / 单服务过载 / 并发模型简化）+ 5 类 P1（可观测性 / 软删除 / TTL / Lint 拆分 / 多语言 ID）+ 6 类 P2（KG 共存 UX / E2E / Embedding 写入 / 模型选择 / Schema 注释 / 决策追溯表）

---

## 1. 评审范围

| 维度 | 检视文件 | 现状摘要 |
|---|---|---|
| 主设计文档 | `llm-wiki.md` (1496 行 / 207KB) | 单文档承载 6+ 受众（PRD / Arch / API / UI / Test / Sec / Ops），7 次累积修订 |
| 重建计划 | `llm-wiki-v2-rebuild-plan.md` (424 行) | W1-W5 五个增量 PR，5.5-6.5 天预估，draft 状态 |
| 多 pass / 多语言 | `2026-05-12-multi-pass-and-locale-consensus.md` (313 行) | 4/4 CONDITIONAL APPROVE，10 BLOCKER + 15 P1 + 17 commit 切片 |
| KG 共存 ADR | `decisions/005-llm-wiki-vs-knowledge-graph-coexistence.md` | 完全解耦定型 |
| 后端代码 | `backend/src/modules/ai-app/library/wiki/` 13 文件 | wiki-ingest.service.ts 2070 行 / 81KB（God Service 信号） |
| Schema 迁移 | `backend/prisma/migrations/2026050[9-20]_wiki_*` | 11 天 12 次迁移（多语言 P3 占 7 次） |
| 评审历史 | `llm-wiki-review-r1.md` ~ `r7.md` (6 文件) | 7 轮评审纪要散落 |

**不在评审范围**：v1.5.3 已 APPROVED 的功能边界、v2.0 W1-W5 的 BLOCKER 列表（已在 consensus 中归档）、KG 共存策略本身（已 ADR 定型）。

---

## 2. 评审结论汇总

| 维度 | 状态 | P0 | P1 | P2 | 整体 |
|---|---|---|---|---|---|
| 架构本体 | APPROVED（R7.3） | 0 | 0 | 0 | 高质量 |
| 文档体系 | 散落冗余 | 1 | 1 | 1 | 显著债务 |
| 代码组织 | God Service 信号 | 1 | 1 | 0 | 中等债务 |
| 并发模型 | 三层防护过深 | 1 | 0 | 0 | 中等债务 |
| 可观测性 | 仅 Logger | 0 | 1 | 0 | 中等缺口 |
| 运维 (TTL/软删) | 注释未实现 | 0 | 2 | 0 | 阻塞 W5 |
| 多语言 (P3) | translationGroupId LLM 输出 | 0 | 1 | 1 | 中等风险 |
| 测试 | 单元强 / E2E 弱 | 0 | 0 | 1 | 可控 |
| 决策追溯 | R1-R7 散落 | 0 | 0 | 1 | 可控 |
| **合计** | **NEEDS-OPTIMIZATION** | **3** | **5** | **6** | **W0 前置可解决** |

---

## 3. P0 优化项（建议 v2.0 W1 启动前完成）

### P0-1：文档体系按 Diátaxis 拆分

**问题**：`llm-wiki.md` 1496 行单文档同时承担 6 角色诉求（PRD / 架构师 / 后端 / 前端 / 测试 / 安全），结构扁平无受众导航；附录 §16 列代码行号级 slug 替换清单（属 PR description 内容）；§15 开放问题应在 Issue tracker。

**业界标准**：Diátaxis 框架（tutorial / how-to / reference / explanation）+ 单决策单 ADR（Nygard 范式）。

**建议结构**：

```
docs/architecture/ai-app/library/wiki/
├── README.md                       # 导航 + 当前版本（<100 行）
├── reference/
│   ├── data-model.md               # §4（10 张表 + 约束）
│   ├── api-spec.md                 # §6（16 endpoints）
│   └── glossary.md                 # 新增（wiki page / diff / lint finding / affectedKeys / translationGroupId / cross-link）
├── explanation/
│   ├── overview.md                 # §1 + §3（背景 + 架构）
│   └── decisions/                  # 每决策单 ADR
│       ├── 001-diff-as-full-replace.md
│       ├── 002-locale-aware-pk.md
│       ├── 003-multi-pass-pipeline.md
│       └── 004-idor-404-uniform.md
├── how-to/
│   ├── ingest-pipeline.md          # §5 实施细节
│   └── lint-types.md
└── archive/
    ├── reviews/                     # R1-R7 仅历史归档（含 R8）
    └── changelog.md                # 替代累积"决策矩阵"
```

**砍掉**：§16 slug 替换清单 → PR description；§15 开放问题 → GitHub Issues label `area:wiki`。

**收益**：新成员 onboarding 时间显著降低；决策追溯链路清晰；文档维护成本降低（单决策修订只动一个 ADR 文件，不再触发 7 处穿透替换）。

### P0-2：拆分 `wiki-ingest.service.ts`（2070 行 God Service）

**问题**：单文件 81KB / 2070 行混合 7 类职责（安全检查 / LLM 编排 / 多模式选择 / Token 预算 / 文档验证 / source 过滤 / metrics 暴露）；5 个外部依赖注入；in-memory `Map<string, WikiIngestProgress>` + 5min 清理器与 LLM 编排混杂；userId vs `AUTO_INGEST_SYSTEM_USER_ID` 两条 trigger path 在同一服务内分叉。

**业界标准**：DDD Bounded Context，单 service < 500 行经验值；状态管理与业务逻辑分离（参考 NestJS 官方文档对 Service 职责的建议）。

**建议拆分**（按依赖方向）：

```
backend/src/modules/ai-app/library/wiki/ingest/
├── wiki-ingest.service.ts             # 入口编排（~300 行）
├── wiki-ingest-progress.manager.ts    # 进度状态机 + TTL 清理（~200 行）
├── wiki-ingest-budget.calculator.ts   # Token 预算 + ingestMaxTokens（~150 行）
└── pipelines/
    ├── single-pass.pipeline.ts        # SINGLE 模式（~300 行）
    ├── outline.pipeline.ts            # W2 阶段 1（~400 行）
    ├── section-fill.pipeline.ts       # W2 阶段 2（~400 行）
    └── cross-link.pipeline.ts         # W2 阶段 3（~300 行）
```

**收益**：
- 圈复杂度（cyclomatic）显著降低，每文件可独立 unit test
- Progress Manager 后续可桥接 Redis（cron 跨进程恢复）
- W2 三 pass 独立成文件，便于 fail-closed → fail-open 策略调优（参 consensus B1 BLOCKER）
- 与现有测试结构对齐（`wiki-ingest.service.spec.ts` 1041 行可拆为 4-5 个 spec 文件）

**风险**：跨文件 import 增加；NestJS module 注册需要补 provider。
**缓解**：W0 PR 仅做"机械拆分"（保持方法签名 / 调用关系不变），不改业务逻辑；CI 跑全套 wiki spec 验证零回归。

### P0-3：简化并发模型为 OCC 单层

**问题**：现状 apply 事务（spec §5.1 L778-798 / `wiki-diff.service.ts`）三层防护过深：
1. `baselineHash` 乐观锁（OCC）
2. `SELECT FOR UPDATE` 行锁（悲观锁 PCC）
3. `Serializable` 隔离级别
4. `affectedKeys` 三轮重算（Step B 实时重算 / Step C 扫其他 PENDING 时重算 / Step D-M 事务内再校验）
5. P2034 serialization_failure 重试 1 次 → CONFLICTED

**业界标准**：OCC ∨ PCC **二选一**（CockroachDB / PostgreSQL 官方文档建议）；`Serializable` 隔离已隐含 conflict detection，叠加 `SELECT FOR UPDATE` 是过度防御。

**建议**：

| 当前机制 | 建议 |
|---|---|
| baselineHash OCC | **保留** |
| SELECT FOR UPDATE | **删除**（baselineHash 已能拦截） |
| Serializable 隔离 | 降为 `Repeatable Read`（够用） |
| affectedKeys 三轮重算 | **单轮**（仅 apply 入口算一次，baselineHash 失败重算） |
| P2034 重试 1 次 → CONFLICTED | **保留** |

**收益**：
- 移除约 80 行复杂事务代码
- 降低 lock contention（高并发 ingest 场景）
- apply P95 延迟降低 30-50%（粗估，需基准测试验证）
- 后续运维 debug 难度显著降低

**风险**：极端并发场景 conflict 率可能上升。
**缓解**：W0 PR 含 conflict rate 监控指标（接 P1-1 OTel），灰度发布观察 1 周；如冲突率 > 5% 再回滚为 OCC + Repeatable Read。

---

## 4. P1 必修项（建议 v2.0 期间分散完成）

### P1-1：可观测性升级到 OpenTelemetry

**问题**：spec §12 仅 NestJS Logger 关键路径，无 trace / metric / cost attribution。`wiki-ingest.service.ts` 4 处 LLM 调用，每次 token / $ 成本无 per-KB 归集；W2 multi-pass DAG（outline / section-fill / cross-link）无 span 关联，故障定位需翻日志。

**建议**：

```typescript
// wiki-ingest.service.ts 关键调用补 OTel span
await this.tracer.startActiveSpan('wiki.ingest', async (span) => {
  span.setAttributes({
    'wiki.kb_id': kbId,
    'wiki.mode': mode,  // SINGLE | MULTI
    'wiki.doc_count': docs.length,
  });
  // ...
});
```

**Metrics**（接 Prometheus）：
- `wiki_ingest_duration_seconds{kb,mode}` histogram
- `wiki_diff_conflict_total{kb}` counter
- `wiki_lint_findings_total{kb,type}` counter
- `wiki_llm_tokens_total{kb,pass,direction}` counter
- `wiki_llm_cost_usd_total{kb,pass,model}` counter（gauge 或 counter）

**收益**：multi-pass 故障定位时间显著降低；per-KB 成本归因支持后续配额管理。

### P1-2：补 W5 软删除窗口（30 天）

**问题**：`rebuild-plan §7` 标注 W5 hard delete 为"暂留 follow-up"，无软删除窗口。误删 wiki 页面不可恢复（用户场景：管理员误 apply 删除 diff）。

**业界标准**：CMS / Wiki 类系统普遍提供 30 天回收站（Notion / Confluence / Wikipedia）。

**建议**：

```prisma
model WikiPage {
  deletedAt DateTime?           // 软删除标记
  deletedBy String?             // 删除人 user ID
  // 现有字段...
  @@index([knowledgeBaseId, deletedAt])
}
```

- 默认查询过滤 `deletedAt IS NULL`
- 提供 `GET /library/wiki/kbs/:kbId/trash` 列出近 30 天软删除
- 提供 `POST /library/wiki/kbs/:kbId/trash/:pageId/restore` 恢复
- cron 每日 3am 真删 `deletedAt < NOW() - 30 days`

**对齐 P0-1 ADR**：建议同步起草 `decisions/005-soft-delete-window.md`。

### P1-3：补 WikiIngestDraft TTL 清理

**问题**：consensus B2 BLOCKER 引入 WikiIngestDraft 表存 multi-pass partial progress；schema 注释提及 TTL，但代码无对应 cron job。冷表堆积风险（每次 ingest 失败遗留行）。

**建议**：新建 `wiki-cleanup.scheduler.ts`：

```typescript
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async cleanupStaleDrafts() {
  const sevenDaysAgo = subDays(new Date(), 7);
  const deleted = await this.prisma.wikiIngestDraft.deleteMany({
    where: { updatedAt: { lt: sevenDaysAgo } },
  });
  this.logger.log(`Cleaned up ${deleted.count} stale ingest drafts`);
}
```

**对齐 P1-1**：清理 metric 接 Prometheus（`wiki_draft_cleanup_total`）。

### P1-4：拆分 `wiki-lint.service.ts`（SQL + LLM 混合）

**问题**：5 类 lint（ORPHAN / MISSING_XREF / STALE / CONTRADICTION / DATA_GAP）混在单服务，其中前 2 类纯 SQL（同步快），后 3 类调 LLM（异步慢成本高）。混合导致 throttle / budget 策略难定。

**建议**：

```
wiki-lint/
├── wiki-lint.facade.ts                 # 路由分发（~150 行）
├── wiki-lint-sql.service.ts            # ORPHAN / MISSING_XREF（~400 行）
└── wiki-lint-llm.service.ts            # STALE / CONTRADICTION / DATA_GAP（~400 行）
```

- SQL 路径无 budget 限制
- LLM 路径接 `wiki-kb-admin.service` 的 `cronLintDailyBudgetCalls` 限流
- 测试拆为 `wiki-lint-sql.service.spec.ts` + `wiki-lint-llm.service.spec.ts`

### P1-5：多语言 `translationGroupId` 由系统生成

**问题**：consensus C7 BLOCKER 指出 LLM 可能 hallucinate UUID 作为 translationGroupId。当前设计让 LLM 输出该字段。

**业界标准**：业务 ID（UUID / nanoid）应由后端生成；LLM 仅输出语义关联（如 `isTranslationOf: <existing-slug>`）。

**建议**：

```typescript
// wiki-ingest.service.ts
// LLM 仅输出 isTranslationOf: existing slug
// 后端 upsert 时查询既有 translationGroupId，无则 crypto.randomUUID()
if (item.isTranslationOf) {
  const baseGroup = await this.prisma.wikiPage.findFirst({
    where: { slug: item.isTranslationOf, knowledgeBaseId: kbId },
    select: { translationGroupId: true },
  });
  item.translationGroupId = baseGroup?.translationGroupId ?? crypto.randomUUID();
}
```

**收益**：消除 LLM 输出错误 UUID 导致的语言版本错关联（hard-to-debug bug）。

---

## 5. P2 改进项（建议 v2.0 后期或独立 PR）

### P2-1：KG 共存的产品 UI 提示

**问题**：ADR-005 承认用户在同一 KB 启用 KG + wiki 时看到两套"实体关系"，明文记录为"负面"。当前 UI 无任何提示。

**建议**：
- 切换 KB 时若同时启用 KG + wiki，顶部一次性 banner "本 KB 同时启用了 Knowledge Graph，两套实体关系独立"
- 如产品方向已定，给 KG 模块加 "Deprecated, 推荐使用 Wiki" 角标
- 长期：考虑废弃 KG 路径或定型为只读历史

### P2-2：集成测试增加 3 个 E2E 场景

**问题**：5862 行测试多为 mock 单元测试。multi-pass × 部分失败 × locale 三维场景缺。

**建议补 spec**：
1. `wiki-ingest-multi-pass-failure.e2e-spec.ts`：section-fill 阶段 20% 失败 → WikiIngestDraft checkpoint 恢复
2. `wiki-ingest-locale-concurrent.e2e-spec.ts`：双 locale 并发 ingest 同一 slug → affectedKeys 冲突检测
3. `wiki-diff-baseline-stale.e2e-spec.ts`：baselineHash 过期 + P2034 重试 → 一次成功

### P2-3：WikiPageEmbedding 写入路径

**问题**：spec §4 已建 WikiPageEmbedding 表（ONELINER / BODY 两 resolution），但代码搜索显示写入路径空（consensus 标记为 P3a 后续 sub-iteration）。

**建议**：
- 如确认推迟，在 schema 加注释 `// TODO(P3a-sub-iter): write path pending`
- 或 README 标注该表暂未启用，避免误读"已实现"

### P2-4：wiki-ingest skill 模型选择 ADR

**问题**：spec §15 开放问题 #1（"用什么模型？BYOK 强制？"）悬置 7 轮评审未决。

**建议**：写入 `decisions/006-ingest-model-selection.md`：

| Pass | TaskProfile | 推荐模型类 | 理由 |
|---|---|---|---|
| outline | `reasoning=high` | o3-mini / claude-opus | 少而结构化，需要推理 |
| section-fill | `reasoning=low, creativity=medium` | claude-sonnet | 量大，质量充足即可 |
| cross-link | `reasoning=low, outputLength=short` | claude-haiku | 确定性任务，成本敏感 |

**BYOK 策略**：默认平台 key；admin 在 `wiki-kb-admin` 可切 BYOK（与既有 KB 配置一致）。

### P2-5：清理 WikiDiff schema 注释中废弃 partial unique 文字

**问题**：R2 待办（spec L279 附近）提到"WikiDiff schema 注释清废弃 partial unique 文字"似乎仍未完成。

**建议**：W0 PR 同步 grep `partial unique` / `WHERE status` 在 prisma/schema 下，清理过时注释。

### P2-6：决策追溯表（对齐 P0-1）

**问题**：R1-R7 累积决策散落 6 份评审 + 主文档决策矩阵。新成员需翻 7 份文档拼出当前真实状态。

**建议**：新建 `decisions-trace.md`（或并入 README.md），每行单决策：

| 决策 | 首次提出 | 修订 | 最终版本 | 当前状态 | ADR 链接 |
|---|---|---|---|---|---|
| Diff 全量替换 newBody | R1 §2 | — | v1.0 | Accepted | 001 |
| 折叠 Contradiction 到 CrossCutting | R5 BLOCKER-1 | — | v1.4 | Accepted | — |
| affectedSlugs → affectedKeys | consensus C2 | — | v2.0 | Supersedes affectedSlugs | 002 |
| IDOR 统一 404 | R7.1 P1-S1 | R7.2 7 处穿透 | v1.5.3 | Accepted | 004 |

---

## 6. 推荐路线图：W0 工程纪律前置 PR

建议在 v2.0 W1（预解析）启动**前**插入 W0：

```
W0  工程纪律 (1-1.5 天)
  ├── P0-1  文档体系拆分 (Diátaxis + ADR)         [~4h]
  ├── P0-2  wiki-ingest.service 机械拆分           [~4h]
  ├── P0-3  并发模型简化 (OCC 单层)                [~4h]
  └── 验证：verify:arch + type-check + 全套 wiki spec  [~1h]

W1  预解析（按 rebuild-plan 原计划，1 天）
W2  多 pass（按 consensus）+ 接入 OTel (P1-1)      [+0.5 天]
W3  多语言（含 P1-5 系统生成 translationGroupId）   [无额外]
W4  wiki-search tool（按 rebuild-plan，0.5 天）
W5  删除（含 P1-2 软删除 + P1-3 TTL cleanup）      [+0.5 天]
W6（可选）P2 收尾（KG UX / E2E / Embedding / 模型 ADR） [1 天]
```

**总工程量调整**：5.5-6.5 天（v2.0 原计划） → 8-9 天（含 W0 + 分散 P1）。

**核心论断**：W0 看似额外 1-1.5 天，但显著降低 W1-W5 实施期的事故率。粗估 W0 能避免 3-5 个线上 incident（参考 R1-R7 共 7 轮评审 19 项 P0 / 36 项 P1 的发现率统计）。

---

## 7. R8 元教训

1. **架构合规度 ≠ 工程纪律**：v1.5.3 已 4/4 APPROVED，但 1496 行单文档 / 2070 行单服务 / 三层并发防护这些都属"通过评审但难维护"的债务。下次设计文档评审应增加"维护成本"维度（document length / service line count / concurrency layer count）。

2. **累积修订的雪球效应**：R1-R7 七轮评审每轮都是合理的局部修订，但累积导致 §16 出现 18 处编辑点附录 / §15 开放问题悬置 7 轮 / 决策矩阵 4 轮累积。建议每 3 轮评审后强制"重写而非追加"——把过去 3 轮的修订穿透合并入正文，附录归档为单独的 changelog。

3. **subagent 调度策略**：R8 采用 3 路并行调研（spec / supporting docs / backend code）一次拿全证据，相对 R1-R7 的 4 路评审角色（reviewer / architect / security / tester）效率更高。下次实施前复盘建议沿用 R8 模式。

4. **业界对标 ≠ 照搬**：本次审视引用 Diátaxis / Nygard ADR / OCC vs PCC / Strong Migrations 等业界标准，但 wiki 全量替换 newBody（违 RFC 6902）这类自造做法在本场景下 trade-off 合理（LLM 段落级修改导致 unified diff 噪声爆炸）。建议每条"偏离业界标准"的设计决策落 ADR 显式记录理由。

5. **文档与代码的同步性**：R8 发现 WikiIngestDraft TTL 仅在 schema 注释（代码空）/ WikiPageEmbedding 写入路径空 / R2 待办 partial unique 注释未清等"文档说 A 但代码是 B"的不一致。建议每 PR 落地时 reviewer 强制核对 "spec § / schema 注释 / 代码实现" 三者一致。

---

## 8. 已知不在 R8 范围的 follow-up

以下项 R8 不展开，留作后续单独评审：

- v2.0 W3 多语言完整 BLOCKER 清单（已在 consensus）
- KG 路径正式废弃或并入 wiki 的迁移方案（需新 ADR）
- 跨模块 IDOR 一致性（R7.3 architect APPROVED 时建议的 §15 follow-up note）
- Wiki 与 RAG / Knowledge Graph / Notes 的长期共存策略（产品形态决策，非架构问题）

---

**文档版本**：1.0（2026-05-15 首次发布，作为 v2.0 W1 实施前置 baseline）
**接受度建议**：P0 全部建议 v2.0 W1 启动前完成；P1 在 W2-W5 期间分散；P2 在 W6 可选 PR 或后续迭代
**关联文档**：
- [llm-wiki.md](./llm-wiki.md) v1.5.3 基线
- [llm-wiki-v2-rebuild-plan.md](./llm-wiki-v2-rebuild-plan.md) v2.0 路线图（建议补 W0）
- [2026-05-12-multi-pass-and-locale-consensus.md](./2026-05-12-multi-pass-and-locale-consensus.md) W2/W3 实施规范
- [005-llm-wiki-vs-knowledge-graph-coexistence.md](../../../decisions/005-llm-wiki-vs-knowledge-graph-coexistence.md) KG 共存定型
