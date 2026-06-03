# Backend Scripts

后端工具脚本。**组织原则（MECE）**：

- **根目录只放"活脚本"**——被 `package.json` / Dockerfile / CI 引用、构建或部署链路在用的入口。
- **其余一律进功能桶**——按职责分目录，互斥且穷尽，根目录不做 grab-bag。
- **一次性脚本跑完即归档** `_archive/`（backfill / 一次性 fix / 已合入迁移的 SQL）。

> 2026-06-03 整理：原根目录堆了 19 个无引用的一次性/调试脚本，已归位到对应桶；本 README 由"虚构结构"（曾写了不存在的 `devops/`、`seed/`）改为与现实一致。

## 目录结构

```
scripts/
├── (root)        # 活脚本：被 package.json / Dockerfile 引用的入口（见下表）
├── _archive/     # 一次性历史脚本（backfill / 一次性 fix / 已合迁移的 SQL）—— 保留参考，勿删勿改
├── ci/           # CI 门禁脚本（boot smoke 等）
├── db/           # 数据库工具（检查 / 维护 / 应用迁移 / UI patrol 夹具）
├── dev-tools/    # 开发调试与覆盖率 / 循环依赖 / 监控等诊断工具
├── maintenance/  # 数据维护与运维（数据完整性 / 白名单 / KEK 轮换 / 清理）
└── thumbnails/   # 缩略图生成
```

## 根目录活脚本（动它们要同步改引用方）

| 脚本                                 | 引用方                                         | 命令                                       |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------ |
| `entrypoint.sh`                      | `backend/Dockerfile`（CMD）                    | (容器启动)                                 |
| `copy-build-assets.js`               | `package.json` `build`                         | (构建内部)                                 |
| `audit-capability-anti-patterns.cjs` | `package.json` `audit:capability*` + arch spec | `npm run audit:capability[:print/:update]` |
| `audit-architecture-debt.ts`         | `package.json` `audit:debt*`                   | `npm run audit:debt[:strict/:json]`        |

> 这 4 个是构建 / 部署 / 门禁链路的入口，故留根。新增此类入口同样留根并在此登记。

## 命名规范（[standards/12-scripts-management.md](../../.claude/standards/12-scripts-management.md)）

- **活脚本**：kebab-case + **动词前缀**——`check-*` / `audit-*` / `apply-*` / `generate-*` /
  `rotate-*` / `cleanup-*` / `validate-*` / `monitor-*` / `detect-*` / `seed-*`。
- **`fix-*` / `migrate-*` 前缀是"一次性"保留词**——只能出现在 `_archive/`，活跃桶里禁用
  （合规检查脚本按名字硬拦截，见下）。给"生成修复/校验修复"这类长期工具换个动词
  （如 `generate-*` / `validate-*`），别用 `fix-` 前缀。
- **`test-*` 前缀留给 jest 自动化测试**——诊断/冒烟脚本用 `check-*`，避免与测试运行器语义撞车
  （本次 `test-playground-ui.js` → `check-playground-ui.js`）。
- **归档文件加归档月份前缀** `YYYY-MM-{原名}.{ext}`（与 `check-scripts-compliance.sh --fix`
  自动归档产物一致，便于按时间清理过期归档）。

## 新增脚本怎么放

1. **会被 package.json / Dockerfile / CI 引用** → 留根 + 在上表登记。
2. **否则按职责进桶**：CI 门禁→`ci/`、数据库→`db/`、调试诊断→`dev-tools/`、数据/运维维护→`maintenance/`、缩略图→`thumbnails/`。
3. **一次性脚本**（backfill / 一次性 fix / 临时迁移）跑完移入 `_archive/2026-MM-{name}`，并从 package.json 摘掉对应 npm script。

## 合规检查

- 脚本目录合规由 `scripts/utils/check-scripts-compliance.sh` 检查（5 项：`fix-*` / `migrate-*`
  误留活跃区、临时文件、目录结构、README、过期归档），`--fix` 可自动归档。
- 本地手动跑：`npm run audit:scripts`（`-- --fix` 自动归档）。
- **已接入阻断门禁**（2026-06-03）：
  - **pre-push** `.husky/pre-push` 步骤 `[0d/6]`——违规拒推。
  - **CI** `.github/workflows/ci.yml` 的 `scripts-compliance` job，结果汇入 `ci-status` 合并门。
  - `scripts-guardian` agent 仍可按需做更细的语义巡检（read-only）。

## 注意事项

- TypeScript 脚本用 `npx tsx scripts/<bucket>/<name>.ts` 运行。
- 数据维护 / 迁移类生产环境谨慎执行。
- `_archive/` 保留历史不删；脚本目录治理由 `scripts-guardian` 看护。

---

**最后更新**: 2026-06-03
**维护者**: Backend Team
