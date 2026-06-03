# 脚本管理规范

**版本：** 1.1
**强制级别：** MUST
**更新日期：** 2026-06-03

---

## 核心原则

- **生命周期管理** - 临时脚本完成后必须归档
- **清晰分类** - 按用途组织到对应子目录
- **命名一致性** - 使用动词前缀表明脚本用途
- **最小化原则** - 活跃目录只保留有效脚本

---

## 目录结构

> 2026-06-03 与现实对齐：原列的 `deployment/` 不存在（实为 `devops/`），并补齐
> `ci/` `dev/` `devops/` `ui-iteration/` 四个真实目录。

```
scripts/
├── _archive/                    # 已完成/过期脚本归档
│   ├── migrations/              # 已完成的迁移脚本
│   └── fixes/                   # 已完成的修复脚本
│
├── ci/                          # CI 门禁脚本（namespace 检查等）
├── dev/                         # 开发调试 / 夹具导出 / 本地诊断
├── devops/                      # 部署 / 运维 / 发布（facade 边界 / 生产监控 / GitHub release 同步）
├── docs-specialist/             # 文档治理脚本
├── local-server/                # 本地开发服务启停
├── merge-to-main/               # 合并工作流（CI 监控 / 预合并校验 / 回滚）
├── monitoring/                  # 监控和告警（含 config/）
├── release-notification/        # 发布通知
├── ui-iteration/                # UI 自动迭代框架（TS 模块）
│
├── utils/                       # 通用工具 + audit-* 治理脚本
│   └── diagnostics/             # 诊断工具
│
└── README.md                    # 目录说明
```

---

## 命名规范

### 命名格式

- 使用 **kebab-case**（小写 + 连字符）
- **动词开头** 描述功能
- 扩展名表明类型：`.sh`, `.js`, `.ts`, `.sql`, `.bat`

### 脚本分类与生命周期

| 类型       | 前缀/命名                          | 生命周期           | 存放位置                      |
| ---------- | ---------------------------------- | ------------------ | ----------------------------- |
| 种子数据   | `seed-{name}`                      | 永久               | backend/scripts/              |
| 生成脚本   | `generate-{name}`                  | 永久               | 相关目录                      |
| 验证脚本   | `verify-{name}`, `validate-{name}` | 永久               | scripts/utils/                |
| 诊断脚本   | `diagnose-{name}`                  | 永久               | scripts/utils/diagnostics/    |
| 设置脚本   | `setup-{name}`                     | 永久               | scripts/utils/                |
| 一次性修复 | `fix-{name}`                       | **使用后立即归档** | scripts/\_archive/fixes/      |
| 一次性迁移 | `migrate-{name}`                   | **使用后立即归档** | scripts/\_archive/migrations/ |

### 禁止行为

- ❌ 在活跃目录保留已完成的 `fix-*` 脚本
- ❌ 在活跃目录保留已完成的迁移脚本
- ❌ 使用模糊命名（如 `script1.sh`, `temp.js`）
- ❌ 在根目录散放工具脚本

---

## 归档规则

### 何时归档

1. **修复脚本** - 问题修复后立即归档
2. **迁移脚本** - 迁移完成并验证后归档
3. **临时脚本** - 一次性用途完成后归档
4. **过期脚本** - 不再适用当前系统时归档

### 归档命名

归档文件添加日期前缀：

```
YYYY-MM-{original-name}.{ext}
```

示例：

- `fix-railway-database.sh` -> `_archive/fixes/2025-01-fix-railway-database.sh`
- `migrate-v2-schema.sql` -> `_archive/migrations/2025-01-migrate-v2-schema.sql`

### 归档记录

在 `scripts/_archive/README.md` 中记录归档原因和日期（可选）。

---

## 两个 scripts 目录的区分

项目有两个 scripts 目录，职责不同：

| 目录                | 类型            | 用途                            |
| ------------------- | --------------- | ------------------------------- |
| `scripts/` (根目录) | Shell 脚本为主  | 基础设施、CI/CD、监控、开发工具 |
| `backend/scripts/`  | TypeScript 为主 | 需要 NestJS 上下文的后端脚本    |

### 根目录 scripts/ 放置

- Shell 脚本 (.sh, .bat)
- 不依赖后端代码的工具
- CI/CD 相关脚本
- 基础设施和监控脚本

### backend/scripts/ 放置

- 需要 Prisma / NestJS 的脚本
- 数据种子脚本
- 数据验证脚本
- 后端专用工具

---

## Backend 脚本规范

后端脚本放在 `backend/scripts/` 目录。**根目录只放活脚本**（被 package.json / Dockerfile /
CI 引用的入口），其余按职责进桶（2026-06-03 收敛，详见 `backend/scripts/README.md`）：

```
backend/scripts/
├── _archive/                    # 一次性历史脚本归档（YYYY-MM-{name} 前缀，FLAT 不建子目录）
├── ci/                          # CI 门禁（boot smoke 等）
├── db/                          # 数据库工具（检查 / 维护 / 应用迁移 / UI patrol 夹具）
├── dev-tools/                   # 开发调试 / 覆盖率 / 循环依赖 / 监控诊断
├── maintenance/                 # 数据维护与运维（完整性 / 白名单 / KEK 轮换 / 清理）
├── thumbnails/                  # 缩略图生成
├── entrypoint.sh                # Docker 入口（Dockerfile CMD）—— 活脚本留根
├── copy-build-assets.js         # 构建产物拷贝（package.json build）—— 活脚本留根
├── audit-*.{cjs,ts}             # 能力/架构债门禁（package.json + arch spec）—— 活脚本留根
└── README.md                    # 目录说明
```

> 命名前缀（`seed-*` / `generate-*` / `validate-*` / `check-*` / `update-*`）仍按上文规范，
> 但**位置进对应桶**，不再散落根目录。

### 禁止在 backend/scripts/ 中

- ❌ `fix-*.js` / `fix-*.ts` 临时修复脚本（应立即归档）
- ❌ E2E 测试脚本（应放在 `backend/test/`）
- ❌ SQL 迁移文件（应放在 `backend/prisma/migrations/`）

---

## CI/CD 脚本规范

### GitHub Actions

```
.github/workflows/
├── ci.yml                       # 主 CI 流程
├── deploy-protection.yml        # 部署保护检查
├── smoke-tests.yml              # 冒烟测试
└── release-notification.yml     # 发布通知
```

命名规范：

- 使用 kebab-case
- 描述性名称
- 不使用版本后缀（更新而非创建新文件）

### Husky Hooks

```
.husky/
├── pre-commit                   # 提交前检查
├── pre-push                     # 推送前验证
└── commit-msg                   # 提交信息检查
```

---

## 检查清单

### 创建新脚本时

- [ ] 确定脚本是永久还是临时
- [ ] 使用正确的命名前缀
- [ ] 放在正确的目录位置
- [ ] 添加脚本说明注释

### 完成临时脚本后

- [ ] 验证脚本目标已达成
- [ ] 移动到 `_archive/` 目录
- [ ] 添加日期前缀
- [ ] 更新相关文档（如有）

### 定期维护

- [ ] 每月检查活跃脚本是否仍然有效
- [ ] 清理过期的归档脚本（超过 6 个月）
- [ ] 更新 README.md 反映当前结构

---

## 常见问题

### Q: 修复脚本写完后怎么办？

A: 修复完成并验证后，立即移动到 `scripts/_archive/fixes/`，添加日期前缀。

### Q: 工具脚本放哪里？

A:

- 通用工具 -> `scripts/utils/`
- 诊断工具 -> `scripts/utils/diagnostics/`
- 特定功能 -> 相应功能目录（如 `monitoring/`）

### Q: SQL 迁移脚本放哪里？

A:

- 如果是 Prisma 迁移 -> `backend/prisma/migrations/`
- 如果是手动一次性迁移 -> 执行后归档到 `scripts/_archive/migrations/`

### Q: 测试脚本放哪里？

A:

- 单元测试 -> `backend/test/` 或 `frontend/__tests__/`
- E2E 测试 -> `backend/test/e2e/`
- 临时测试脚本 -> 完成后删除

---

## 强制执行（Enforcement）

> 2026-06-03 起本规范从 honor-level 升级为**阻断门禁**。

| 层       | 机制                                                                                          | 范围                            |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| 本地     | `npm run audit:scripts`（= `scripts/utils/check-scripts-compliance.sh`，`-- --fix` 自动归档） | 手动按需                        |
| pre-push | `.husky/pre-push` 步骤 `[0d/6]`——违规拒推                                                     | `scripts/` + `backend/scripts/` |
| CI       | `.github/workflows/ci.yml` 的 `scripts-compliance` job，汇入 `ci-status` 合并门               | 同上                            |
| Agent    | `scripts-guardian`（read-only）——更细的语义巡检 / 识别该归档的脚本                            | 按需触发                        |

检查 5 项：①`fix-*` / `migrate-*` 误留活跃区（按名硬拦截，故这两个前缀是一次性脚本保留词，
长期工具改用 `generate-*` / `validate-*` 等动词）·②临时文件（`.tmp` / `.bak` / `temp*`）·
③必需目录结构·④`scripts/README.md` 存在·⑤过期归档（>6 个月，warning）。

---

**记住：** 脚本目录的整洁程度反映项目的专业程度。及时归档临时脚本，保持活跃目录最小化！
