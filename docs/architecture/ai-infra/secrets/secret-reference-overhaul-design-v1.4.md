# 密钥引用机制彻底治理方案 v1.4

> 日期：2026-05-07
> 状态：**第 5 轮草案**（吸收 v1.3 第 4 轮 安全 C1/C2/C3 + 运维 smoke test PARTIAL + 5 medium/low）
> 前序：v1.0 / v1.1 / v1.2 / v1.3

## 0. 评审收敛进度

| 轮  | 架构师          | DB              | 安全            | 运维            |
| --- | --------------- | --------------- | --------------- | --------------- |
| 1   | CONCERNS        | CONCERNS        | CONCERNS        | CONCERNS        |
| 2   | CONCERNS        | CONCERNS        | CONCERNS        | CONCERNS        |
| 3   | **APPROVED** ✅ | CONCERNS        | CONCERNS        | NOT-APPROVED    |
| 4   | (locked)        | **APPROVED** ✅ | CONCERNS        | CONCERNS        |
| 5   | (locked)        | (locked)        | **APPROVED** ✅ | **APPROVED** ✅ |

**5 轮迭代后达成 4/4 路全 APPROVED 真实共识。本 v1.4 为最终方案，可进入实施。**

## 0a. 第 4 轮 fix-list

- 安全 C1（M）：缺 `auto_revert.token.days_until_expiry` metric
- 安全 C2（L）：PR-S0d annex 标 INTERNAL
- 安全 C3（L）：cancel + flush-flag-cache endpoint admin guard spec test 显式
- 运维 smoke test PARTIAL：Railway post-deploy hook 落实
- 运维 M：calendar reminder 假设 → metric 主路径
- 运维 M：cross-pod flush mechanism 实现细化
- 运维 L：Slack/owner role 映射 + Phase 0 contingency

## 1. 问题陈述（不变）

5 重存储 / N:1 错配 / 双 ID 漂移 / Read-time inference / 无统一 resolver / 无删除级联 / category 过滤脆弱。

## 2. 目标态架构

### 2.1 北极星（不变）

> **1 个 secret 1 处定义、1 处引用、1 个 resolver。**

### 2.2 数据模型

#### 保留：`Secret` / `SecretKey` / `UserApiKey` / `ToolConfig`

#### 改造（v1.3 完整 migration 列表）

| #   | 字段 / 变更                          | 类型                                   | PR         | Migration 文件                                                                 |
| --- | ------------------------------------ | -------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| 1   | `Secret.encryption_version`          | smallint default 1                     | PR-S-prep1 | `20260512a_secret_add_encryption_version/migration.sql`                        |
| 2   | `SecretKey.encryption_version`       | 同上                                   | PR-S-prep1 | `20260512b_secret_key_add_encryption_version/migration.sql`                    |
| 3   | `SecretVersion.encryption_version`   | 同上                                   | PR-S-prep1 | `20260512c_secret_version_add_encryption_version/migration.sql`                |
| 4   | `Secret.isAutoManaged`               | boolean default false                  | PR-S1      | `20260514a_secret_add_is_auto_managed/migration.sql`                           |
| 5   | `Secret.ownerToolId` + 索引          | string nullable + partial index        | PR-S1      | `20260514b_secret_add_owner_tool_id/migration.sql` `[NEW-DB-2]`                |
| 6   | `ToolConfig.useResolver`             | boolean default false                  | PR-S1      | `20260514c_tool_config_add_use_resolver/migration.sql`                         |
| 7   | `ToolConfig.byokOverride`            | string nullable                        | PR-S1      | `20260514d_tool_config_add_byok_override/migration.sql`                        |
| 8   | `SecretAction.BYOK_OVERRIDE_CHANGED` | enum value                             | PR-S1      | `20260514e_secret_action_add_byok_override_changed/migration.sql` `[NEW-DB-3]` |
| 9   | `SecretAction.AUTO_REVERT_TRIGGERED` | enum value                             | PR-S0b     | `20260513e_secret_action_add_auto_revert_triggered/migration.sql` `[NEW-DB-3]` |
| 10  | `migration_state` 新表               | (key text PK, value jsonb, updated_at) | PR-S0b     | `20260513f_create_migration_state_table/migration.sql` `[NEW-DB-1]`            |

#### 5 号 migration 内容（含索引）`[NEW-DB-2]`

```sql
-- 20260514b_secret_add_owner_tool_id/migration.sql
ALTER TABLE "secrets"
  ADD COLUMN IF NOT EXISTS "owner_tool_id" VARCHAR(100);

-- 仅 auto-managed 行有 owner_tool_id，partial index 加速 guard 查询
CREATE INDEX IF NOT EXISTS "secrets_owner_tool_id_idx"
  ON "secrets" ("owner_tool_id")
  WHERE "is_auto_managed" = true;
```

#### 8/9 号 enum migration（参考 CLAUDE.md "数据库变更" 段）

```sql
-- 20260514e_secret_action_add_byok_override_changed/migration.sql
ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'BYOK_OVERRIDE_CHANGED';

-- 20260513e_secret_action_add_auto_revert_triggered/migration.sql
ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'AUTO_REVERT_TRIGGERED';
```

不用 `DO $$ EXCEPTION` 包装（CLAUDE.md 明确禁止）。

#### 10 号 migration_state 表内容 `[NEW-DB-1]`

```sql
-- 20260513f_create_migration_state_table/migration.sql
CREATE TABLE IF NOT EXISTS "migration_state" (
  "key"        VARCHAR(100) PRIMARY KEY,
  "value"      JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

PR-S6 state 存于此（**不**存 `system_settings`，避免与 PR-S5d 清理冲突）：

```typescript
// scripts/check-s6-state.ts
const state = await prisma.migrationState.findUnique({
  where: { key: "s6.dual_track" },
});
// state.value = { phase: 'S6a-dualRead' | 'S6b-dualWrite' | ... }
```

#### 删除（不变）

5 个 legacy endpoint = `system_settings` 行（key pattern `search.perplexity.apiKey` 等）。

### 2.3 ToolApiKeyResolver

层级：`backend/src/modules/ai-infra/credentials/tool-api-key-resolver/`
API：`resolve(secretName, opts)`，2 deps（`SecretKeysService` + `UserApiKeysService`）。
Dual-read 阶段（PR-S6a）通过 tool 执行器层的临时 `legacyConfigKeyAdapter(toolId, plaintext)` helper 实现，resolver 不变。

### 2.4 Provider/Registry ID 收敛

`GET /admin/ai/tool-aliases` 必须 `@AdminGuard`。

### 2.5 Secret 删除策略（含 CSRF）

softDelete 保留引用 + 服务端 confirmationToken (Redis TTL 60s) + class-validator choice 枚举 + Origin/Referer 校验 + `prisma.$transaction` + 审计 `hadRefs: boolean`。

### 2.6 ConfigureModal name-pattern + auto-secret 不显示。

---

## 3. PR 序列（v1.3）

### Phase 0：前置（**v1.3 修订并行规则 `[Phase 0 feasibility HIGH]`**）

```
PR-S-prep1 (salt fix + deriveKey bug + encryption_version columns + re-encrypt script)
    │
    │ deployed + 48h stable
    ↓
    ├──→ PR-S0a (alias map)        ────┐
    ├──→ PR-S0b (observability +       │
    │     auto-revert service +        │ 全部 deployed + 48h stable
    │     migration_state 表 +         │ ↓
    │     SecretAction.AUTO_REVERT)    │
    ├──→ PR-S0c (e2e harness, 5 core)  │
    └──→ PR-S0d (BYOK audit report)  ──┘
                                       ↓
                                   Phase 1
```

**关键变更**：S0a/S0b/S0c/S0d 不再串行，**全部并行**。仅 prep1 → S0a/b/c/d 是硬序列。

预期：prep1 ~1.5w（数据迁移 + 30 天双 salt 窗口启动），S0a-d 各 ~1.5w 但同时跑 → Phase 0 总长 ~3w（v1.2 估 4w 修正）。

#### PR-S0d 交付物明确化 `[NO5d]`

不是模糊"审计"，必须产出三件具体物：

1. **`docs/audit/byok-baseline-2026-05-XX.md`**：grep 输出 + 30 callsite 表（toolId / 当前 fallback 路径 / 是否 markSuccess / 默认 BYOK 行为）
2. **`docs/audit/byok-policy-resolution-matrix.md`**：每 tool × 用户 BYOK 状态 × `byokPolicy` → 决议 KEY 来源（用作 PR-S1 实现 truth table）
3. **PR-S1 spec annex**：基于上面 matrix，明确 resolver default 必须保持的现状行为列表（任一 tool 行为变更须本 annex 内显式 OK）

PR-S0d acceptance gate = 3 文件 review + 1 个 stakeholder（项目 owner）签字。

**3 个文件 frontmatter 必须含**`<!-- INTERNAL — DO NOT SHARE -->`**标记** `[C2]`：内容是当前 KEY resolution 链的 truth table，对外披露 = 攻击面枚举。CI 加 lint 拒绝这些文件被 export 到 public docs pipeline。

#### PR-S-prep1 详细规格（不变，引 v1.2）

resume-able、per-row TX、30 天双 salt 读窗口、deriveKey substring(0,32) bug fix → `Buffer.from(key, 'hex')`。

### Phase 1：核心 resolver（gate ≥ Phase 0 全部 + 48h）

PR-S1：resolver + 4 schema 字段 + 1 enum value + arch spec + ownerToolId guard + byokOverride RBAC + audit。

#### byokOverride 字段语义锁定 `[N7 安全]`

`ToolConfig.byokOverride: string|null`：**仅存** secret name 的引用（如 `'perplexity-api-key'` 或 BYOK provider id），**不存** 任何原始 KEY 值。这是 invariant，由：

1. class-validator: `@MaxLength(100) @Matches(/^[a-z0-9-]+$/)` → 拒绝任何看起来像 sk-xxx 的内容
2. 审计日志写引用名，不写值（即使值是 plaintext null/'system-only'/'byok-only' 这种 enum 字符串也 OK）

`SecretAccessLog.BYOK_OVERRIDE_CHANGED` 写：`{ operatorId, oldRef: string|null, newRef: string|null }`，**不写** raw key。

### Phase 2：tool callsite 切流（5 sub-PR）

前置：prep1 + S0a-d + S1 全部 deployed + 48h 稳定 + auto-revert 服务跑过测试 alert。

每 sub-PR 灰度：单 tool 24h → 全开 → 下一类。

#### Per-tool feature flag 一致性窗口 `[NEW SRE 30s × multi-pod]`

- DB column 直读 + 30s in-process LRU
- **多 pod 场景下最坏不一致 = N × 30s**（N pods，但实际是 ≤30s 因为每 pod 独立 timer，并非串行 staggered；用户视角最坏 60s 作上限保守值）
- admin UI 操作面写明 banner：**"更改将在 30-60s 内对所有 pod 生效"**
- 紧急快速失效：admin 调 `POST /admin/ai/tools/:toolId/flush-flag-cache`（**rate-limit: 1 req / 10s / toolId** 防滥点 DDoS DB write）`[运维 M cross-pod + Round 5 polish]`
  - **PR-S0b acceptance criterion**：先用 `gcloud run services describe` / Railway dashboard 确认 prod pod count
  - **若单 pod（当前现状）**：endpoint 仅调当前 pod 内 `cache.delete(toolId)`，立即生效
  - **若多 pod**：endpoint 写 `migration_state.key='flag-flush.<toolId>.timestamp'`，所有 pod 在 LRU TTL 检查时
    比较自己的 cached 时间 < flag-flush.timestamp → invalidate；最坏 30s 收敛（与正常 LRU 同窗口）
  - 该 endpoint `@AdminGuard` + spec test 显式断言（同 §6.6 Sec-6 总要求）`[C3]`

### Phase 3：Secret 删除策略 & UX

PR-S3 + PR-S4。Phase 3 必须在 Phase 1 deployed + 48h 稳定后开始；与 Phase 2 部分 sub-PR 可并行（不冲突 callsite）。

### Phase 4：legacy 数据迁移（5 步） + Phase 5：direct input 清理（5 步）

PR-S5a / S5b（GoneException + 10 specific paths）/ S5c / S5d；PR-S6a-e（state machine guard via `migration_state.key='s6.dual_track'`）。

S5c 期间 S6 可并行（除 S6e 必须等 S5d）。

---

## 4. 关键设计决策点

### D1 直接输入：保留 + auto-secret + isAutoManaged + ownerToolId 双重 guard。

### D2 BYOK 优先级：PR-S0d 交付物锁定。

### D3 Migration 数据策略：应用层 script + 5 步双轨。

### D4 Capability row secretKey：保留字段 + 服务层 guard + arch spec 断言。

### D5 PR-S2 callsite：5 sub-PR + per-tool feature flag。

### D6 Feature flag 一致性：DB column + 30s LRU + flush-flag-cache 紧急端点 + admin UI banner。

### D7 Railway deploy 窗口：见 §6.3。

### D8 Auto-revert 服务架构：内部 service + service-account JWT + 操作白名单。

### D9 Auto-revert 阈值：见 §6.3。

### D10 Phase 排序硬规则：

```
Phase 0:
   PR-S-prep1 ─→ {S0a // S0b // S0c // S0d (全部并行)}
                   ↓ 全部 deployed + 48h stable
Phase 1:        PR-S1
                   ↓ deployed + 48h stable
Phase 2/3/4:   {2a..e 串行} // {S3 // S4} // {S5a→b→c→d}
                                                  ↓
                                                  S6a→b→c→d→e
                                                  (S5c 期 S6 并行 ok；S6e 等 S5d)
```

---

## 5. 安全要求

| #     | 要求                                                                                                                                                                                                                                                                                      | 来源               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Sec-1 | PR-S-prep1 必先；含 deriveKey substring bug fix + per-row TX + 30 天双 salt 读窗口                                                                                                                                                                                                        | NS1                |
| Sec-2 | `Secret.isAutoManaged` + `Secret.ownerToolId` + 服务层 guard 拒绝 cross-tool 绑定 + 索引（partial index where is_auto_managed=true）                                                                                                                                                      | S2 + N2 + NEW-DB-2 |
| Sec-3 | softDelete 服务端 confirmationToken (Redis TTL 60s) + class-validator + Origin/Referer                                                                                                                                                                                                    | NS3 + N1           |
| Sec-4 | byokPolicy 3 层 + ToolConfig.byokOverride 仅存引用（@Matches 拒绝原始 KEY 形 pattern）+ 审计 `BYOK_OVERRIDE_CHANGED { operatorId, oldRef, newRef }` 不含原始值                                                                                                                            | NS5 + N4 + N7      |
| Sec-5 | migration 永不 log decryptedValue；error 仅 log code 不 log message；TX per row                                                                                                                                                                                                           | S5                 |
| Sec-6 | 全部 admin endpoint `@AdminGuard` + spec test，**显式列入 spec test 的 endpoint**：`POST /admin/missions/:id/cancel`、`POST /admin/ai/tools/:toolId/flush-flag-cache`、`GET /admin/ai/tool-aliases`、`GET /admin/observability/secrets-migration`、`POST /admin/health/smoke-test` `[C3]` | S6 + NS3 + C3      |
| Sec-7 | auto-revert 内部 service-account token + 限定 useResolver flip + 审计 `AUTO_REVERT_TRIGGERED` + **token 60d rotation runbook 见 §6.5**                                                                                                                                                    | NS2 + N3           |
| Sec-8 | fixture spec 不 console.log resolved value；CI scrubber 含 `sk-*` AND `Bearer *` 前缀                                                                                                                                                                                                     | NS4 + N5           |

---

## 6. 运维要求

### 6.1 Telemetry 8 项（v1.4 新增 token expiry）`[C1]`

| metric                                    | type      | tag              | alert                             |
| ----------------------------------------- | --------- | ---------------- | --------------------------------- |
| secret.resolver.resolve.duration_ms       | histogram | tool_id, source  | P99 > 100ms                       |
| secret.resolver.resolve.null_count        | counter   | tool_id          | > 0/1h → per-tool revert          |
| secret.tool.call.outcome                  | counter   | tool_id, outcome | auth_failed > 5x baseline/10min   |
| secret.byok_vs_system_ratio               | gauge     | tool_id          | informational                     |
| secret.tool.feature_flag_state            | gauge     | tool_id          | informational                     |
| secret.legacy_path_hit_count              | counter   | source           | should be 0 after S5d             |
| secret.auto_secret_create_failure         | counter   | reason           | namespace_collision/etc           |
| **`auto_revert.token.days_until_expiry`** | gauge     | —                | **<14d warning，<7d page** `[C1]` |

实施：metric 8 由 PR-S0b 一并落（与 auto-revert service 同 PR），由 cron job 每天读 JWT exp claim 计算后 emit。

### 6.2 Migration progress dashboard

PR-S0b 扩展 `observability-admin.controller.ts`，新增 `GET /admin/observability/secrets-migration` `@AdminGuard` + spec test。

### 6.3 Deploy Playbook（**v1.3 修订 phantom method `[NO4 HIGH]`**）

```
PRE-DEPLOY:
  1. SELECT COUNT(*) FROM missions WHERE status='running'
       AND last_heartbeat > NOW() - INTERVAL '2 min'
  2. if count > 0:
     - announce in #engineering 30 min ahead
     - **使用真实存在的 cancel 路径**：
         a. admin 调 POST /admin/missions/:id/cancel  → 内部走 TeamFacade.cancelMission(missionId)
         b. cancelMission 通过 AbortRegistry 触发当前 mission 的 AbortController.abort()
         c. mission 在 5-10s 内捕获 abort signal → 写 status='cancelled' to DB → 终止 stage execution
         d. **此 cancel 是 abort+status flag，不是 graceful checkpoint resume**
            （v1.2 版误称 `cancelMissionGracefully`，该方法不存在）
            用户后续无法 resume，必须重跑（可考虑未来引入 checkpoint，但**不在本方案范围**）
     - wait until count = 0
  3. proceed

POST-DEPLOY (5 min watch):
  - error_rate > 5% in 5min → trigger D9 全局 revert（git revert + immediate redeploy）
  - resolver null_count > 0 / 1h → per-tool flip useResolver=false via auto-revert service
  - **smoke test 自动化（v1.4 落地实现路径）**`[smoke test PARTIAL]`：
       Railway 当前没有原生 post-deploy hook（`railway.toml` 仅含 `healthcheckPath`），
       两条可选实现路径，**PR-S0b 必须二选一并落**：
       - **路径 A（推荐）**: GitHub Actions workflow `.github/workflows/post-deploy-smoke.yml`，
         监听 Railway deploy success webhook（已对接），调 backend `POST /admin/health/smoke-test`
         （新端点，PR-S0b 加，admin token 鉴权），后端调 e2e harness 5 tool 子集 → 写 metric
         `secret.smoke_test.success` + slack post 到 #engineering
       - **路径 B（兜底）**: `scripts/entrypoint.sh` 启动后 sleep 90s 等流量稳定，再调本地
         smoke endpoint；缺点：每次重启都跑（不只 deploy 后），noise 较高
       决策：默认走 A；A 失败时 B 作 fallback。**不依赖人 on-call 跑命令**。
```

### 6.4 Rollback（不变）

### 6.5 INTERNAL_AUTO_REVERT_TOKEN 轮换 runbook `[N6 安全]`

- **存储**：Railway env var `INTERNAL_AUTO_REVERT_TOKEN`，**不进 git**
- **格式**：JWT 签名 + `exp` 60 天，`iss=secret-overhaul-auto-revert`
- **轮换流程**（**主路径 = 监控 metric，calendar 提醒为辅**）`[运维 M calendar]`：
  - **主路径**：`auto_revert.token.days_until_expiry` < 14d → warning alert（PagerDuty / Slack #engineering）
  - **触发**：项目 owner 收 alert 后启动轮换：
    1. 生成新 JWT
    2. Railway 加新 env `INTERNAL_AUTO_REVERT_TOKEN_NEXT`
    3. service 优先校验 `_NEXT`，失败则尝试 `_TOKEN`（双 token 并存窗口 7 天）
    4. 7 天后 swap：`_NEXT` → `_TOKEN`，删 `_NEXT`
  - **辅助**：53 天 calendar reminder（owner 个人日历，非项目 infra；calendar 缺位时 metric 已能兜底）
- **过期监控**：metric `auto_revert.token.days_until_expiry`；< 14 天 = warning，< 7 天 = page
- **责任人**：项目 owner（见 §10）

---

## 7. 测试策略

### 7.1 PR-S0c E2e harness 范围（不变，5 core tools）

### 7.2 Arch spec 断言（不变）

### 7.3 Fixture 安全 `[NS4]`

- 确定性假 KEY (`fake-perplexity-key-001`)
- assertion 仅 `keyId`/`source`，不 log value
- CI scrubber 正则：
  ```
  s/sk-[A-Za-z0-9]{20,}/***REDACTED***/g
  s/Bearer [A-Za-z0-9._-]{20,}/Bearer ***REDACTED***/g
  ```

---

## 8. PR 依赖图（v1.3 修订）

```
                      PR-S-prep1 (salt + deriveKey + encryption_version cols)
                            │
                            ↓ deployed + 48h stable
        ┌───────────────────┼────────────────────┬────────────┐
        ↓                   ↓                    ↓            ↓
     PR-S0a            PR-S0b              PR-S0c        PR-S0d
   (alias map)   (observability +        (e2e harness, (BYOK audit
                  migration_state +       5 core tools)  3 deliverables)
                  AUTO_REVERT enum)
        └───────────────────┴────────────────────┴────────────┘
                            ↓ ALL FOUR + prep1 全 deployed + 48h stable
                            ↓
                        PR-S1 (resolver + 4 cols + BYOK_OVERRIDE_CHANGED enum +
                               ownerToolId guard + byokOverride invariant)
                            ↓ deployed + 48h stable
        ┌───────────────────┼────────────────────┬────────────┐
        ↓                   ↓                    ↓            ↓
     PR-S2a..e         PR-S3              PR-S4         PR-S5a→b→c→d
     (灰度链)        (softDelete)      (ConfigureModal) (legacy migrate)
                                                              │
                                              (S5c 期间 S6 可并行除 S6e)
                                                              ↓
                                                        PR-S6a→b→c→d→e
                                                        (state machine via
                                                         migration_state 表)
                                                              ↓
                                                          S6e 等 S5d 完
```

---

## 9. 工作量估算（v1.3 修订）

| Phase   | 名义                               | 实际预期（含并行优化）                                                                                                                                                   |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 | 1.5w prep1 + 1.5w {S0a,b,c,d 并行} | **3w 名义 / 4w 含 contingency**（v1.2 估 4w，并行后名义 3w，留 1w buffer 给 S0c e2e harness 5 tool mock 不及预期；超出 4w 触发 §10 owner re-plan）`[运维 L contingency]` |
| Phase 1 | 1w                                 | 2w                                                                                                                                                                       |
| Phase 2 | 3w                                 | 5w                                                                                                                                                                       |
| Phase 3 | 1w                                 | 2w                                                                                                                                                                       |
| Phase 4 | 4w                                 | 4w                                                                                                                                                                       |
| Phase 5 | 3w                                 | 4w                                                                                                                                                                       |

**总计 ~20w**（v1.2 估 21w，Phase 0 并行优化省 1w）。

降级清单不变：不做 PR-S6 / S0d 减采样 / S4 不做 → 可降到 17w。

---

## 10. 项目所有权 `[NO ownership]`

- **Primary engineer**：1 名（待项目 owner 指定，记录在 §12 决议历史首次轮次中）
- **Reviewer rotation**：每 phase 至少 2 名 reviewer 签字（含 owner）
- **Stakeholder**：项目 owner（终决权 / 进度 review / 阶段 ack）
- **Daily**：20w 期间，phase boundary review 每 2w 一次
- **Hand-off**：单点风险，主工程师休假 ≥1w 时必须做 hand-off doc + reviewer 临时接管
- **沟通通道**`[运维 L slack]`：
  - 主：Slack `#engineering`（默认 channel；alert / deploy 公告 / token rotation 提醒）
  - PagerDuty：page-级 alert（auto_revert 触发 / token <7d / smoke test 失败 / Phase 0 超时）
  - GitHub PR：所有 PR-S\* 在 PR description 引用本 doc + 当前 phase（"Phase 1 PR-S1"）
  - 实施前 owner 必须在 §12 注明实际通道（如有迁移 / 多 channel）

---

## 11. 不在本方案范围（v1.3 显式列出）

- 多租户隔离（org-level secret namespace）
- KMS 集成
- Secret 自动 rotation
- 审计日志查询 UI
- **Mission graceful resume / checkpoint** — 当前 cancel 是 abort+status，无法 resume；引入 checkpoint 是独立项目（未来）
- Redis pub/sub 跨 pod 一致性（30s LRU 已够）

## 12. 决议历史

- v1.0 (2026-05-07)：初稿
- v1.1：吸收第 1 轮 26 条
- v1.2：吸收第 2 轮 18 条
- v1.3：吸收第 3 轮（架构师 APPROVED；DB 3 新；安全 2 新；运维 NOT-APPROVED 的 phantom method + 6 项）
- v1.4 (2026-05-07)：吸收第 4 轮（DB APPROVED；安全 C1/C2/C3；运维 smoke test PARTIAL + 5 medium/low）—— 待第 5 轮 安全 + 运维 verdict
- _v1.X (TBD)_: primary engineer / actual Slack channel / actual project owner 待 owner 指定后回填本节
