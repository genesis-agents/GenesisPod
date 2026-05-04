# L1 AI Infrastructure

> 平台基础设施层。认证、密钥与配置资产、额度账本、存储底座、数据库治理、监控与系统运维能力。
> 单一信息源：[`backend/src/modules/ai-infra/README.md`](../../../backend/src/modules/ai-infra/README.md)

## 14 个底座模块

| 模块             | 代码路径                  | 职责                          |
| ---------------- | ------------------------- | ----------------------------- |
| `abstractions/`  | `ai-infra/abstractions/`  | 共享 DI token 与基础抽象      |
| `auth/`          | `ai-infra/auth/`          | 认证与用户身份                |
| `credentials/`   | `ai-infra/credentials/`   | BYOK、密钥解析、用户模型配置  |
| `credits/`       | `ai-infra/credits/`       | 通用额度账本、policy、rewards |
| `db-governance/` | `ai-infra/db-governance/` | 表统计、诊断、清理、retention |
| `email/`         | `ai-infra/email/`         | 邮件发送底座                  |
| `encryption/`    | `ai-infra/encryption/`    | 加解密原语                    |
| `facade/`        | `ai-infra/facade/`        | 对外稳定入口                  |
| `monitoring/`    | `ai-infra/monitoring/`    | 指标、健康检查、错误跟踪      |
| `notifications/` | `ai-infra/notifications/` | 站内通知基础能力              |
| `release/`       | `ai-infra/release/`       | 版本发布与公告                |
| `secrets/`       | `ai-infra/secrets/`       | 系统级密钥资产                |
| `settings/`      | `ai-infra/settings/`      | 系统设置                      |
| `storage/`       | `ai-infra/storage/`       | 对象存储（R2/B2）+ governance |

## 边界规则

- 不需要知道 agent / mission / 具体 AI 业务语义
- **不得反向依赖上层模块**
- `credentials/` 只允许存在于 `ai-infra`，engine 侧仅保留 `llm/user-config` 与 `llm/key-health`
- `backend/prisma/`、`src/common/prisma/` 不属于 `ai-infra`

## 顶层文档

- [`backend-nestjs.md`](backend-nestjs.md) — NestJS 框架使用规范
- [`backend-prisma-orm.md`](backend-prisma-orm.md) — Prisma 使用规范
- [`database-postgresql.md`](database-postgresql.md) — PostgreSQL 17 + JSONB 设计
- [`database-redis.md`](database-redis.md) — Redis 7 缓存与会话
- [`base-layer-directory-contracts.md`](base-layer-directory-contracts.md) — 基础层目录契约（W17/W20）
- [`CHANGELOG.md`](CHANGELOG.md) — 基础设施变更日志

## 收敛重点

- `credits/` 拆清"通用账本" vs "产品线计费策略"
- `storage/` 拆清"对象存储 runtime" vs "存储治理任务"
- `notifications/` / `settings/` / `release/` 复核 app 领域语义渗入
