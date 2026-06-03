# ai-infra

> 平台基础设施层。负责认证、密钥与配置资产、额度账本、存储底座、数据库治理、监控与系统运维能力。

## 定位

`ai-infra` 是 `L1` 基础设施层。

判断口径只有一条：

- 不需要知道 `agent` / `mission` / 具体 AI 业务语义，也能独立成立的底座能力，归 `ai-infra`

依赖方向严格单向：

- `ai-app -> ai-harness -> ai-engine -> ai-infra`
- `ai-infra` 不得反向依赖上层模块

## 当前顶层

```text
ai-infra/
├── abstractions/        # 共享 DI token 与基础抽象
├── auth/                # 认证与用户身份
├── credentials/         # BYOK、密钥解析、用户模型配置、分发/申请/调度
├── credits/             # 通用额度账本与额度规则
├── db-governance/       # 表统计、诊断、清理治理
├── email/               # 邮件发送底座
├── encryption/          # 加解密原语
├── facade/              # 对外稳定入口
├── monitoring/          # 指标、健康检查、错误跟踪
├── notifications/       # 站内通知基础能力
├── release/             # 版本发布与公告发布底座
├── secrets/             # 系统级密钥资产
├── settings/            # 系统设置
└── storage/             # 对象存储与存储治理
```

## 明确边界

- `credentials/` 只允许存在于 `ai-infra`
  - `ai-engine` 不再保留顶层 `credentials/`
  - engine 侧仅允许保留 `llm/user-config` 与 `llm/key-health` 这类 LLM 配套能力

- `db-governance/` 保留在 `ai-infra`
  - 它表达的是数据库治理，不是业务域“表管理”
  - `data-retention.service.ts` 归属数据库保留策略，不再挂在 `monitoring/`
  - 允许提供管理员诊断/清理能力，但不承载 app 领域策略

- `storage/` 保留在 `ai-infra`
  - 对象存储、R2/B2 适配、存储盘点、离线清理属于基础设施
  - `governance/storage-governance.service.ts` 是当前治理聚合入口
  - 围绕单一业务对象的包装器不应长期留在 infra core

- `credits/` 保留在 `ai-infra`
  - `credits.service.ts` 负责 ledger/quota core
  - `policy/` 放计费规则
  - `rewards/` 放通用奖励策略
  - 不允许把 app 级产品编排逻辑直接堆到 core 账本层

- `backend/prisma/` 不属于 `ai-infra`
  - 它是 workspace 级 schema / migrations / seed / SQL 资产层

- `src/common/prisma/` 也不属于 `ai-infra` 顶层目录
  - 它是全仓共享的运行时持久化底座

## 后续收敛重点

- `credits/` 继续拆清“通用账本”与“产品线计费策略”
- `storage/` 继续拆清“对象存储 runtime”与“存储治理任务”
- `notifications/`、`settings/`、`release/` 继续复核是否存在 app 领域语义渗入
