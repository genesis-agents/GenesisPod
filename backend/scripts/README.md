# Backend Scripts

后端工具脚本集合，按功能分类组织。

## 目录结构

```
scripts/
├── _archive/          # 历史归档脚本（已废弃或一次性修复）
├── devops/           # 部署和运维脚本
├── dev-tools/        # 开发工具
├── maintenance/      # 数据维护脚本
├── seed/             # 数据库种子数据脚本
└── thumbnails/       # 缩略图生成脚本
```

## 脚本分类

### DevOps (devops/)

部署和发布相关脚本。

| 脚本                           | 命令                | 描述                     |
| ------------------------------ | ------------------- | ------------------------ |
| `docker-entrypoint.sh`         | (Docker 内部使用)   | Docker 容器启动脚本      |
| `send-release-notification.ts` | `npm run release:*` | 发送版本发布通知         |
| `studio-railway.bat`           | (手动执行)          | Railway 环境 Prisma 管理 |
| `studio-railway.ps1`           | (手动执行)          | Railway 环境 Prisma 管理 |

**常用命令:**

```bash
# 预览发布通知
npm run release:preview

# 发送发布通知
npm run release:notify
```

### 开发工具 (dev-tools/)

开发和调试工具。

| 脚本                      | 命令                   | 描述             |
| ------------------------- | ---------------------- | ---------------- |
| `detect-circular-deps.ts` | `npm run dev:circular` | 检测循环依赖问题 |

**常用命令:**

```bash
# 检测循环依赖
npm run dev:circular
```

### 数据维护 (maintenance/)

数据库数据清理和验证脚本。

| 脚本                         | 命令                           | 描述           |
| ---------------------------- | ------------------------------ | -------------- |
| `update-policy-whitelist.ts` | `npm run maintenance:policy`   | 更新政策白名单 |
| `validate-data-integrity.ts` | `npm run maintenance:validate` | 验证数据完整性 |

**常用命令:**

```bash
# 更新政策白名单
npm run maintenance:policy

# 验证数据完整性
npm run maintenance:validate
```

### 种子数据 (seed/)

初始化和填充数据库数据。

**新数据 seed 走 `backend/src/common/seed/` 的 SeedSyncService**（backend 启动自动幂等同步）。
这里不再放业务 seed 脚本；架构 spec 测试 `__tests__/architecture/seed-governance.spec.ts` 会拦截违规。

只剩两个保留入口：

| 脚本                   | 命令                                   | 描述                                     |
| ---------------------- | -------------------------------------- | ---------------------------------------- |
| `prisma/seed.ts`       | `npm run prisma:seed` / `npm run seed` | Prisma 官方 seed 入口（demo 用户、兜底） |
| `db/seed-ui-patrol.ts` | —                                      | UI patrol 测试夹具（E2E 用，非生产数据） |

### 缩略图 (thumbnails/)

缩略图生成和更新脚本。

| 脚本                         | 命令                          | 描述                  |
| ---------------------------- | ----------------------------- | --------------------- |
| `generate-thumbnails.ts`     | `npm run thumbnails:generate` | 生成缺失的缩略图      |
| `generate-all-thumbnails.ts` | `npm run thumbnails:all`      | 重新生成所有缩略图    |
| `update-arxiv-thumbnails.ts` | `npm run thumbnails:arxiv`    | 更新 arXiv 论文缩略图 |

**常用命令:**

```bash
# 生成缺失的缩略图
npm run thumbnails:generate

# 重新生成所有缩略图
npm run thumbnails:all

# 更新 arXiv 缩略图
npm run thumbnails:arxiv
```

## 归档脚本 (\_archive/)

历史脚本，已废弃或为一次性修复，保留用于参考。

| 脚本                               | 描述           | 归档原因           |
| ---------------------------------- | -------------- | ------------------ |
| `check-datasources.ts`             | 检查数据源表   | 诊断脚本，已完成   |
| `fix-mcp-package-names.ts`         | 修复 MCP 包名  | 一次性修复，已完成 |
| `2025-01-create-export-tables.sql` | 创建导出表 SQL | 已合并到迁移       |
| `2025-01-fix-export-tables.js`     | 修复导出表     | 一次性修复，已完成 |
| `2025-01-fix-invalid-models.ts`    | 修复无效模型   | 一次性修复，已完成 |

## 使用指南

### 执行脚本

```bash
# 使用 npm scripts (推荐)
npm run <script-name>

# 直接使用 tsx
npx tsx scripts/<category>/<script-name>.ts
```

### 添加新脚本

1. 确定脚本类别（devops/dev-tools/maintenance/seed/thumbnails）
2. 将脚本放入对应目录
3. 在 `package.json` 中添加对应的 npm script
4. 更新此 README

### 归档旧脚本

1. 将废弃脚本移动到 `_archive/`
2. 从 `package.json` 移除对应的 npm script
3. 更新此 README 的归档列表

## 注意事项

- 所有脚本使用 `tsx` 运行（支持 TypeScript）
- 数据库相关脚本执行前确保数据库可访问
- 生产环境谨慎执行 maintenance 脚本
- 归档脚本不要删除，保留用于历史参考

---

**最后更新**: 2026-01-23
**维护者**: Backend Team
