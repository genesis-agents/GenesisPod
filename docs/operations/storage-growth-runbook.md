# 存储增长治理 Runbook（Railway DB 膨胀 / R2 卸载）

> 适用：Railway PostgreSQL 体积持续增长、admin「数据管理」页大量 offload 规则停在 Pending。
> 最后更新：2026-06-20

## 1. 先认清：项目里有三套独立机制，各管不同的表

| 机制                                 | 做什么                                       | 数据                | 覆盖的表                                                                                                                                                                                           | 开关                                    | 代码                                          |
| ------------------------------------ | -------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| **StorageOffload**（列搬 R2）        | 把**单列大 blob**搬 R2，清列留行             | 不丢                | `topic_reports.full_report`、`dimension_analyses`、`research_tasks.result`、`agent_playground_missions` 报告列、`wiki_*`、`kb_documents`                                                           | R2 未配置即静默禁用                     | `storage-offload.service.ts` / `.registry.ts` |
| **EventArchive**（整行归档 R2 再删） | 老行导成 gzip NDJSON 上 R2，**确认成功才删** | **不丢**（冷备 R2） | `harness_agent_events`、`harness_checkpoints`（仅终态）、`agent_playground_mission_events`、`ai_engine_metrics`、`harness_run_metrics`、`research_agent_activities`、`agent_spans`、`agent_traces` | `ENABLE_EVENT_ARCHIVE !== "true"` 禁用  | `event-archive.service.ts`                    |
| **DataRetention**（按龄删行）        | 老行**直接删除**（有损，与归档二选一）       | **丢**              | 同上事件表 + `secret_access_logs`                                                                                                                                                                  | `ENABLE_DATA_RETENTION !== "true"` 禁用 | `data-retention.scheduler.ts`                 |

**关键认知**：吃 DB 的前几名（`harness_agent_events` 405MB / `harness_checkpoints` 239MB / `ai_engine_metrics` 68MB）是**高行数事件流，没有大 blob 列可列级 offload（R2 无 SQL，搬过去不可查）**。要**无损**释放 DB，只能用 **EventArchive**：整行归档成压缩档存 R2、再从 DB 删。**这是首选**。DataRetention（直接删）是有损的备选，二者对同一张表**只开其一**。

## 2. 排障顺序

### 2.1 DB 月增 ~1GB → 查 DataRetention 是否开

1. admin「数据管理 → 存储状态」页底部「数据老化（Retention）」面板：
   - 显示「老化未启用」→ 即根因。先点 **「预演（不删除）」** 看每张表"可删多少行"。
   - 确认删除量合理后，去 Railway 设环境变量（见 §3）。
2. 或直接调接口预演（只统计不删）：
   ```
   POST /api/v1/admin/storage-inventory/run-retention            # 默认 dry-run
   GET  /api/v1/admin/storage-inventory/retention                # 看状态/上次结果
   ```

### 2.2 R2 已转存几乎为 0 / 规则全 Pending → 查 R2 配置

`StorageOffloadService.onModuleInit` 在 R2 未配置时直接 `return` 并打印
`[StorageOffload] object storage not configured, scheduler disabled`——**UI 看不出来**。
确认 Railway 上 `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` 三者齐全
（bucket 默认 `genesis-reports`）。admin 页 R2 卡片若显示 `configured:false` / 0 对象即缺配置。

启动日志关键字：

- `[StorageOffload] scheduled` = offload 正常；`object storage not configured` = R2 缺配置
- `[data-retention] sweep` = retention 在跑

### 2.3 卸载成功了但 DB 体积没降 → autovacuum 不收缩物理文件

offload 清空列内容、retention 删行，都**只把空间标记为可复用，不收缩 `pg_database_size`**
（offload 刻意不做 `VACUUM FULL`，避免 exclusive lock 影响业务）。删完大量行后若要真正回收磁盘，
见 §4。

## 2.5 内容列 offload：加一列要动 7 处（避免读空）

把某张业务表的「大文本/JSON 列」搬 R2（清列留行、读时透明 hydrate），**每加一列必须同步改 7 处**，漏一处就读空：

1. `prisma/schema/models.prisma`：给该 model 加 `{field}Uri String? @map("{field}_uri")` + `{field}Size Int?`
2. `prisma/migrations/<date>_xxx/migration.sql`：`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
3. `common/storage/offload-key-allowlist.ts`：加 R2 key 前缀（hydrate 的 downloadText 白名单，不加则回读被拒）
4. `platform/storage/governance/offload-prefixes.ts`：加同名前缀 + extractId/listLiveIds（孤儿清理用；启动自检强制与 #3 一致）
5. `storage-offload.registry.ts`：加 target（list/commit/recordSmall/keyFor）
6. `common/prisma/prisma.service.ts`：加 `hydrate{Model}Row` + `$extends.query.{model}` 块 + shadow 循环里加 model key
7. `npx prisma generate` 后 type-check + 跑 governance/hydration/arch 测试

**read-path 红线**：被 offload 的列，所有 `prisma.{model}.findX({ select })` 的 select **必须带上 `{field}Uri`**，否则 hydrate 拿不到 uri → 读空（hydrate 会打 warning）。只有「不写 select 的全字段读」才自动安全。**加表前先 grep 该 model 的所有 read 站点**，确认没有 partial-select 漏 uri（如 `notes.content` 有 4+ 处 partial select → 暂未纳入）。

**现状：内容列 offload 暂未上线（2026-06-20 多 agent 检视后整批回退）**。

曾尝试纳入 6 列（research*project*\*、resource_translations、workspace_tasks、topic_summaries），
但代码检视发现一个**系统性陷阱**：透明 hydrate 的 `$extends` 钩子**只对顶层直接调用的 model 触发**
（`prisma.{model}.findX(...)`）。而 research 域这些子表**大量经父表 `include` 读**
（`prisma.researchProject.findUnique({ include: { sources, notes, outputs } })`）——
这类读**绕过 hydrate**，offload 清列后会在「项目详情 / AI 聊天 / 生成 / 导出 / 跨模块 RAG」**静默读空**。
最初只 grep `prisma.<model>.find` 的审计**漏掉了 include 旁路与 partial-select**，结论被证伪，故整批回退。

**重做的前置条件（缺一不可）**：

1. 审计该 model 的**全部**读路径，含：① 顶层 `findX({select})` 漏 uri ② 经父表 `include`/嵌套 `select` 读 ③ raw SQL 读 ④ 0 直接 find（只走 include）。
2. 把不安全的读路径改造：partial-select 补 `{field}Uri`；父表 include 改为「父查完再用顶层 `prisma.{child}.findMany({where:{parentId}})` 分查组装」；raw SQL 改 Prisma。
3. 补一条架构 spec 断言「被 offload 列的任何 `findX({select})` 必含对应 `Uri` 字段」并扫 include 旁路 —— 人工审计已被证明会漏。
4. 跑该 model 的端到端读路径回归（offload 后内容仍能读回）。

**结论**：列级 offload 单看是纯增益，但前置的读路径改造是独立工程，且这些列本就不是 DB 膨胀主因
（主因是事件大表，已由 §2.4 EventArchive 无损处理）。优先级低于事件归档，按需再做。

## 2.4 推荐路径：无损归档（EventArchive）

吃 DB 的事件大表，**首选无损归档**而非删除：

1. admin「数据管理 → 存储状态 → 无损卸载（归档到 R2）」面板，点 **「预演（不传不删）」** 看每张表"会归档多少行"。
2. 确认 R2 已配置（见 §2.2）+ 归档量合理后，Railway 设 `ENABLE_EVENT_ARCHIVE=true`。
3. 每天 `03:40 UTC` 自动跑：老行 → `event-archive/<表>/<起>_<止>_<hash>.ndjson.gz` 上 R2 → 删 DB。**先落 R2 再删，上传失败绝不删**。
4. 接口：
   ```
   GET  /api/v1/admin/storage-inventory/archive                    # 状态/上次结果
   POST /api/v1/admin/storage-inventory/run-archive                # 默认 dry-run 预演
   POST /api/v1/admin/storage-inventory/run-archive?dryRun=false   # 真正归档+删除
   ```
5. 取回归档：R2 下载对应 `.ndjson.gz`，`gunzip` 后逐行 JSON 即原始行（无内置 rehydrate 回库，按需手工导）。

## 3. Railway 环境变量清单

| 变量                                                                                                                                                                                                                                          | 作用                                           | 建议值                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| `ENABLE_EVENT_ARCHIVE`                                                                                                                                                                                                                        | 开启事件大表**无损归档**到 R2（首选）          | `true`                  |
| `EVENT_ARCHIVE_DRY_RUN`                                                                                                                                                                                                                       | 定时跑只统计不归档                             | 首轮 `true`，确认后去掉 |
| `ARCHIVE_HARNESS_EVENTS_DAYS` / `ARCHIVE_CHECKPOINT_DAYS` / `ARCHIVE_MISSION_EVENTS_DAYS` / `ARCHIVE_METRICS_DAYS` / `ARCHIVE_RUN_METRICS_DAYS` / `ARCHIVE_RESEARCH_ACTIVITY_DAYS` / `ARCHIVE_AGENT_SPANS_DAYS` / `ARCHIVE_AGENT_TRACES_DAYS` | 各表归档前保留天数                             | 默认 14~60              |
| `ENABLE_DATA_RETENTION`                                                                                                                                                                                                                       | 开启高增长表按龄**删除**（有损，与归档二选一） | 一般留空                |
| `DATA_RETENTION_DRY_RUN`                                                                                                                                                                                                                      | 定时跑时只统计不删                             | 首轮 `true`             |
| `RETENTION_HARNESS_EVENTS_DAYS`                                                                                                                                                                                                               | harness_agent_events 保留天数                  | 默认 30                 |
| `RETENTION_CHECKPOINT_DAYS`                                                                                                                                                                                                                   | harness_checkpoints 保留天数（仅删终态）       | 默认 14                 |
| `RETENTION_MISSION_EVENTS_DAYS`                                                                                                                                                                                                               | agent_playground_mission_events 保留天数       | 默认 30                 |
| `RETENTION_METRICS_DAYS`                                                                                                                                                                                                                      | ai_engine_metrics 保留天数                     | 默认 30                 |
| `RETENTION_SECRET_LOGS_DAYS`                                                                                                                                                                                                                  | secret_access_logs 保留天数（合规最长）        | 默认 90                 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`                                                                                                                                                                                 | R2 连接（缺一即 offload 禁用）                 | 必填                    |

**上线步骤（保守）**：先 `ENABLE_DATA_RETENTION=true` + `DATA_RETENTION_DRY_RUN=true` 跑一轮，
看 `[data-retention] sweep done` 日志的删除量 → 合理后去掉 `DATA_RETENTION_DRY_RUN` 让它真删。
定时任务每天 `03:10 UTC` 执行。

## 4. 一次性回收磁盘（删完大量行后）

autovacuum 不会把已删空间还给操作系统。需要手动收缩时：

```sql
-- 优先 pg_repack（在线、不长时间锁表，需安装扩展）
-- pg_repack -t harness_agent_events -t harness_checkpoints -t ai_engine_metrics

-- 或 VACUUM FULL（会拿 exclusive lock，需在低峰期、表逐个做）
VACUUM (FULL, ANALYZE) harness_agent_events;
VACUUM (FULL, ANALYZE) harness_checkpoints;
VACUUM (FULL, ANALYZE) ai_engine_metrics;
VACUUM (FULL, ANALYZE) agent_playground_mission_events;
```

> ⚠️ `VACUUM FULL` 期间该表读写阻塞，务必逐表、低峰执行。Railway 上注意磁盘需有
> 约等于表大小的临时空间（VACUUM FULL 重写整张表）。

## 5. 验证

- `GET /admin/storage-inventory/retention` → `enabled:true`、`lastRun.results` 有删除数
- `GET /admin/storage-inventory` → `database.totalHuman` 在 VACUUM 后下降、`r2.configured:true`
- 趋势图（30 天）DB 曲线由升转平/降
