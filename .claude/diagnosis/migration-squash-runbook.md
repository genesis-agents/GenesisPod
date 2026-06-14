# 迁移链根治 — Squash Baseline 执行单（Tier 2）

> 状态:**待审批,未执行**。涉及生产 `_prisma_migrations` 状态,必须在「全新空库验证 + 生产快照演练」通过后才动生产。
> 前置:Tier 1(schema 派生 enum 兜底)已落地,运行时 invalid-enum 风险已堵住——本 Tier 2 不紧急,可从容做。

## 0. 要解决的根因(实测)

- 338 个迁移;102 含 `DO $$`、71 含 `EXCEPTION`。
- `bootstrapFreshDatabase()` 对空库走 `db push --accept-data-loss`(非 migrate deploy),因为迁移链只能建 ~255/279 张表,缺 47 张(含 CRITICAL 的 knowledge_bases/child_chunks)。
- Step 2 每次部署把失败迁移**静默标记 applied**。
- → 迁移历史不是真相源,`schema.prisma` 才是;空库与存量库走两条不同路径,会发散。

## 1. 目标态

- **一个** baseline 迁移,从 `schema.prisma` 生成,能在空库 `migrate deploy` 出**完全正确**的 schema(304 model + 171 enum 全值,无 EXCEPTION)。
- 存量库(生产)把 baseline 标记为已应用,不重跑。
- 删除 `db push` 引导分支、静默 auto-resolve、Step 4.5 兜底 → 部署脚本回归标准 Prisma 流程。

## 2. 生成 baseline(本地,不碰任何远程库)

```bash
cd backend
# 2.1 归档旧迁移(保留可追溯,不删)
mkdir -p prisma/migrations/_archive
git mv prisma/migrations/2025* prisma/migrations/2026* prisma/migrations/_archive/   # 按实际前缀

# 2.2 从 schema 生成单一 baseline 的 SQL
mkdir -p prisma/migrations/00000000000000_squashed_baseline
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema \
  --script > prisma/migrations/00000000000000_squashed_baseline/migration.sql

# 2.3 保留 migration_lock.toml 不动
```

## 3. 验证 ①:空库零 diff(最关键的正确性闸门)

```bash
# 用一个一次性本地 Postgres(docker),绝不连生产
docker run -d --name squash-verify -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16
export DATABASE_URL="postgresql://postgres:x@localhost:55432/postgres"

# 3.1 跑 baseline
npx prisma migrate deploy --schema=prisma/schema

# 3.2 关键断言:DB 现状 与 schema.prisma 必须零 diff
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema \
  --exit-code
# exit 0 = 零 diff(通过);exit 2 = 有 diff(baseline 不完整,停止)

# 3.3 附加断言:CRITICAL 表都在 + enum 值齐
#     用 Tier 1 同款 DMMF 对照 pg_enum,期望「0 missing」
docker rm -f squash-verify
```

**只有 3.2 exit 0 才继续。** 有 diff 说明 baseline 没覆盖全(常见:扩展、视图、触发器、`db push` 期间手工加的对象),需补进 baseline 或单独的 follow-up 迁移。

## 4. 验证 ②:生产快照演练(在副本上,不碰生产)

```bash
# 4.1 用最近的生产快照/备份恢复到一个临时库(staging-clone)
# 4.2 在该副本上执行「标记已应用」流程(见 Step 5),不重跑 SQL
# 4.3 断言:migrate status 全 applied;migrate diff(--from-url 副本 --to-schema) exit 0
# 4.4 跑一遍应用 boot smoke + 关键读写,确认无 invalid-enum / 缺表
```

## 5. 生产切换(审批后,低峰期,带回滚)

> 原则:baseline 在生产**只登记不执行**(schema 已匹配)。绝不在生产跑 `db push` 或 baseline 的 CREATE。

部署脚本改造(`deploy-migrations.ts`):

1. **新增一次性「baseline 登记」分支**:若 `_prisma_migrations` 里**没有** baseline 记录但库**非空**(存量库)→ `prisma migrate resolve --applied 00000000000000_squashed_baseline`,并把旧 338 条记录保留(或清理成仅 baseline,二选一,演练时定)。
2. **空库**:直接 `migrate deploy`(baseline 会建全量 schema)→ 删掉 `bootstrapFreshDatabase()` 的 `db push` 分支。
3. **删掉 Step 2 静默 auto-resolve**:改为「遇到非预期失败迁移就 loud fail」(已知坏迁移已被 baseline 取代,不该再有)。
4. **删掉 Step 4.5**:baseline 已含全部 enum 值,Tier 1 的 DMMF 兜底可保留一版作为双保险,或一并移除(演练时定)。

## 6. 回滚预案

- baseline 切换**只改迁移目录 + `_prisma_migrations` 记录,不改业务数据** → 回滚 = 还原 `_prisma_migrations` 表 + revert 部署脚本 commit。
- 切换前对 `_prisma_migrations` 做一次显式 `pg_dump -t _prisma_migrations` 备份。
- 任一断言(3.2 / 4.3)不过 → 不进生产,回到 Tier 1 现状(完全可用)。

## 7. 工作量与风险

- 生成 + 空库验证:0.5 天。
- 生产快照演练:0.5–1 天(取决于拿快照的难易)。
- 生产切换 + 守护:0.5 天(低峰期 + 盯一个部署周期)。
- 风险点排序:① 空库 diff 不为零(baseline 不全)② 生产 `_prisma_migrations` 登记错位 → 用 3.2/4.3 两道 exit-code 闸门 + 快照演练 + 回滚备份兜底。

## 8. 需要你提供 / 确认

1. 是否能拿到**一份生产快照/备份**用于 Step 4 演练?(没有的话,Step 4 退化为「只在空库验证」,生产切换风险上升,需你接受。)
2. 旧 338 条 `_prisma_migrations` 记录:切换时**保留**还是**清成仅 baseline**?(保留更稳,清理更干净——演练时一并定。)
3. 切换窗口(低峰期)。
