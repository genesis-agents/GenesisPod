# 密钥引用机制彻底治理方案 v1.1

> 日期：2026-05-07
> 状态：**第 2 轮草案**（吸收第 1 轮 4 路评审 26 条 concerns）
> 前序：v1.0 (`secret-reference-overhaul-design-v1.md`)
> 触发：Screenshot_5 N:1 串号事故已修 (commit `53cb299cf`)，本案是深层架构清理

## 0. 第 1 轮评审 fix-list 索引

每条 concern 在本文档对应位置可查（标注 `[A1/D1/S1/O1...]`）：

- 架构师 (architect): A1-A6
- DB 迁移 (reviewer): D1-D6
- 安全 (security-auditor): S1-S6
- 运维 (general-purpose SRE): O1-O9

## 1. 问题陈述（不变）

- 5 重存储同时存在
- N:1 capability vs provider 模型错配
- Provider/Registry 双 ID 双源同步表漂移
- Read-time inference 不是 write-time consistency
- 3 种 KEY 来源（system / direct / BYOK）无统一 resolver
- Secret 删除无级联
- ConfigureModal 仅 `secret.category` 过滤

## 2. 目标态架构（v1.1 修订）

### 2.1 北极星（不变）

> **1 个 secret 1 处定义、1 处引用、1 个 resolver。admin 改任何一处，运行时立即一致。**

### 2.2 数据模型简化（**v1.1 修订**）

#### 保留

- `Secret`（物理 KEY 存储，AES-256-CBC 加密）
- `SecretKey`（多 KEY fallback chain）
- `UserApiKey`（BYOK）
- `ToolConfig`（tool 元数据 + secret 引用）

#### 改造（**v1.1 新增**）

- **`Secret.isAutoManaged: boolean`** 字段新增 `[S2]`：admin "direct input" 模式自动创建的 auto-secret 标记，UI 加只读徽章 + 删除时强阻 + 不出现在 ConfigureModal 选项里
- **`ToolConfig.useResolver: boolean`** 字段新增 `[O5]`：per-tool feature flag，PR-S2 灰度切流，默认 false，逐 tool 开
- **`ToolConfig.secretKey` 字段语义收紧**：仅 provider 行可写；capability/registry 行 invariant 由 **arch spec assertion** 保证（**不**用 DB CHECK constraint，因 PostgreSQL 不能跨表查询，已自我承认 v1.0 §5 #7）`[D5/A4]`
- **删除** `ToolConfig.config.apiKey` 直接 plaintext 嵌入：admin direct input 改写 auto-secret，**走 5 步 dual-read/dual-write 序列**（PR-S6 详）`[O3]`
- **不实现 PR-S7 DB CHECK**：替代为应用层 service guard（已在 commit `53cb299cf` 落） + 1 个 arch spec 断言 `[A4/D5]`

#### 删除

- 5 个 legacy endpoint 实质上是 `system_settings` 行（key 形如 `search.perplexity.apiKey`），**不是 5 张独立表**`[D1]`
- 这些行经 PR-S5a/S5b 双阶段迁移到 Secret 表

### 2.3 ToolApiKeyResolver（**v1.1 简化**）

`[A1]` **层级修正**：放在 `backend/src/modules/ai-infra/credentials/tool-api-key-resolver/`（不是 ai-engine）—— 与现有 `key-resolver/` / `user-api-keys/` / `health/` / `key-assignments/` 同级。

`[A3]` **API 简化**：`resolve(secretName, opts)` 而非 `resolve(toolId, opts)` —— tool→secretName 的 lookup 留在调用方（tool 执行器有 ToolConfig 就近拿），resolver 是纯三源 dispatcher（BYOK/system/null）。

```typescript
// ai-infra/credentials/tool-api-key-resolver/tool-api-key-resolver.service.ts
export interface ResolvedKeyHandle {
  value: string;
  keyId: string | null;
  source: "byok" | "system";
  secretName?: string;
}

export interface ResolveOptions {
  /** 调用上下文 */
  userId?: string;
  /** byok 偏好（user-profile 设置；admin per-tool 覆盖通过 ToolConfig 字段，不靠 caller 传参）`[S4]` */
  byokPolicy?: "prefer-byok" | "system-only" | "byok-only";
}

@Injectable()
export class ToolApiKeyResolver {
  constructor(
    private readonly secretKeys: SecretKeysService, // system path
    private readonly userApiKeys: UserApiKeysService, // BYOK path
  ) {}
  // ↑ 仅 2 个依赖（v1.0 是 4 个）`[A3]`

  async resolve(
    secretName: string,
    opts: ResolveOptions = {},
  ): Promise<ResolvedKeyHandle | null>;

  async markSuccess(
    handle: Pick<ResolvedKeyHandle, "keyId" | "source">,
  ): Promise<void>;
  async markFailure(
    handle: Pick<ResolvedKeyHandle, "keyId" | "source">,
    code: string,
    message: string,
  ): Promise<void>;
}
```

**`[A2]` BYOK 默认锁定**：在 PR-S0.5 完成对 `AiChatService` + 30 callsite 的 BYOK 现状审计前**不锁**。审计输出文档 + 现状对照 → resolver 默认必须与现状对齐，不引入行为变更。

**`[S4]` byokPolicy RBAC**：

- user-profile 自设：仅影响该 user 的 session（非 admin 也能改自己）
- per-tool 强制覆盖：必须存 `ToolConfig.byokOverride` 字段（PR-S1 加），admin-only 改
- caller 传入 byokPolicy 参数仅作 hint，被上述两条 override

### 2.4 Provider/Registry ID 收敛（不变）

`[S6]` `GET /admin/ai/tool-aliases` 必须 `@UseGuards(JwtAuthGuard, AdminGuard)`，与所有其他 admin endpoint 一致。

### 2.5 Secret 删除策略（**v1.1 重写，O6/S3**）

**v1.0 错误**：直接 SET NULL 级联，admin 不知情。

**v1.1 正解**：

1. `secretsService.softDelete(name)`：仅写 `Secret.deletedAt` + `isActive=false`，**不清** `ToolConfig.secretKey`
2. resolver 读到 `deletedAt != NULL` 的 secret，走 fallback（BYOK or null）+ markFailure(`SECRET_DELETED`)
3. admin UI 删除 dialog 列出 N 个引用 tool，**强制** admin 在 dialog 里勾选下一步：
   - "重建同名 secret 完成 rotate"（推荐）
   - "解除引用并禁用 tool"（断 reference，每 tool 独立确认）
   - "保留引用 + 暂时 disable tool"（默认）
4. 全过程 `prisma.$transaction` 包裹 `[D6]`
5. 审计日志写 `hadRefs: boolean` 而非 `count`，避免 topology 泄漏 `[S3]`

### 2.6 ConfigureModal name-pattern 推荐（不变）

按 toolId 模糊匹配 + ★ 标 + "推荐"徽章。

## 3. PR 序列（**v1.1 大幅细化**）

### Phase 0：前置 + 基础设施（必须先做完）

| PR             | 目标                                                                                                                             | 依据                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **PR-S-prep1** | `SETTINGS_ENCRYPTION_SALT` 环境变量 + key 重新派生 + 现存 ciphertext 重加密迁移                                                  | `[S1]` 静态 salt 高危 |
| **PR-S0a**     | 收敛 alias map 单源（backend 真理） + `GET /admin/ai/tool-aliases` (`@AdminGuard`) + 前端 `useToolAliases()` hook + 删前端硬编码 | `[S6]`                |
| **PR-S0b**     | Observability scaffolding：7 项 metric + admin migration progress dashboard                                                      | `[O7][O8]`            |
| **PR-S0c**     | E2e harness：fixture admin user + provider mock + assert resolved KEY value 命中预期（覆盖 BYOK/system/legacy 排列组合）         | `[A5]` 必备           |
| **PR-S0d**     | 现状审计：grep 30 callsite + `AiChatService` + 输出现状报告锁定 D2（BYOK 默认）和现有 fallback 顺序                              | `[A2]`                |

### Phase 1：核心 resolver

| PR        | 目标                                                                                                                                                                                                   | 依据                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **PR-S1** | 落 `ToolApiKeyResolver` (2 deps) + 加 schema 字段：`Secret.isAutoManaged`, `ToolConfig.useResolver`, `ToolConfig.byokOverride` + arch spec 断言 capability/registry 行 secretKey IS NULL + facade 暴露 | `[A1][A3][O5][S2][S4][D5]` |

Phase 1 不切 callsite，仅落入口 + 字段。`useResolver=false` 默认，旧路径不变。

### Phase 2：tool callsite 切流（5 个独立 PR）

| PR     | 目标                                                                    | tool 数 |
| ------ | ----------------------------------------------------------------------- | ------- |
| PR-S2a | search 类（perplexity / tavily / serper / duckduckgo）                  | 4       |
| PR-S2b | extraction 类（jina / firecrawl / tavilyExtract / supadata 修类目错误） | 4       |
| PR-S2c | youtube + tts 类                                                        | ~3      |
| PR-S2d | academic + finance + weather + image search                             | ~10     |
| PR-S2e | dev tools + policy research + 收尾                                      | ~10     |

每个 PR 独立加 spec + 运行 e2e harness（PR-S0c）+ 灰度开 `useResolver=true` for 1 个 tool 24h 观察 → 全开 → 下一类 `[O1]`。

任一 PR 触发 `secret.resolver.resolve.null_count > 0` for 1h → PagerDuty alert + 自动 revert（`useResolver=false` per-tool flag）`[O9]`。

### Phase 3：Secret 删除策略 & UX

| PR    | 目标                                                                                     | 依据           |
| ----- | ---------------------------------------------------------------------------------------- | -------------- |
| PR-S3 | softDelete 不清 ref + admin 删除强制 dialog + transaction 包裹 + 审计日志 `hadRefs` 布尔 | `[O6][S3][D6]` |
| PR-S4 | ConfigureModal name-pattern 推荐 + auto-secret read-only badge + 删除强阻                | `[S2]`         |

Phase 3 与 Phase 2 部分可并行（不冲突 callsite）。

### Phase 4：legacy 数据迁移（5 步双读双写）

| PR         | 目标                                                                                                                                                                                             | 依据           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **PR-S5a** | system_settings 5 个 key 模式 → Secret 表（应用层 migration script `scripts/migrate-s5-system-settings-to-secrets.ts`，不是 .sql） + 数组类型展开为 SecretKey 多行 + 命名冲突时 skip+warn 不覆盖 | `[D1][D2][D3]` |
| **PR-S5b** | 老 endpoint 标 410 GONE 但保留 read（旧前端 cache 不裸 404）                                                                                                                                     | `[O2]`         |
| **PR-S5c** | 验证 2w：`SELECT COUNT(*) FROM logs WHERE source='legacy'` = 0                                                                                                                                   | `[O2]`         |
| **PR-S5d** | 删 system_settings 老 key + pg_dump 归档                                                                                                                                                         | `[O2]`         |

### Phase 5：direct input → auto-secret（5 步双轨）

| PR     | 目标                                                                 |
| ------ | -------------------------------------------------------------------- |
| PR-S6a | 加 dual-read：resolver 找不到 → 回看 ToolConfig.config.apiKey        |
| PR-S6b | 加 dual-write：admin direct input 同时写 auto-secret + config.apiKey |
| PR-S6c | 切读：resolver 优先；config.apiKey 只读不写                          |
| PR-S6d | 停写：所有写路径只走 auto-secret                                     |
| PR-S6e | 删字段：`tool_configs.config` JSON 移除 apiKey key                   |

每步独立 deploy 间隔 ≥48h `[O3]`。

### 不再实现

- ~~PR-S7 DB CHECK constraint~~ → 改为 PR-S1 的 arch spec 断言 + 应用层 guard（已在 commit `53cb299cf`）`[D5][A4]`

## 4. 关键设计决策点（**v1.1 修订**）

### D1 直接输入模式存与不存

保留，内部走 auto-secret + `isAutoManaged` 字段 + UI 不在 Secret Manager 列表显示（admin 只能看 manual secret）`[S2]`。

### D2 BYOK 优先级

**待 PR-S0d 现状审计后锁定**。不在本文档中预设。

### D3 Migration 数据策略

**应用层 migration script** + 渐进 5 步双轨 `[D2][O3]`。

### D4 Capability row secretKey 字段

保留字段 + 应用层 guard + arch spec 断言 + ~~DB CHECK~~（不可行）`[D5][A4]`。

### D5 PR-S2 callsite 改造

按 category 分 5 个 sub-PR + per-tool feature flag (DB column + 5min in-process LRU cache + admin invalidate endpoint) `[O5]`。

### D6 Feature flag 存储与失效（**v1.1 新增**）

- 存：`tool_configs.use_resolver: bool` 列
- 缓存：service-level 5min LRU
- 失效：admin patch endpoint 触发 cache.invalidate(toolId)
- 默认值：false（直到 PR-S2 灰度该 tool）

### D7 Railway deploy 窗口（**v1.1 新增 `[O4]`**）

- 单 env，每次 deploy 需检查 active mission 数
- 6w 窗口预计 ~15 次 deploy → 公告窗口 + active mission cancel 流程
- 详见 §6 Deploy Playbook

## 5. 安全要求（**v1.1 新增**）

| #     | 来源   | 要求                                                                                               |
| ----- | ------ | -------------------------------------------------------------------------------------------------- |
| Sec-1 | `[S1]` | PR-S-prep1 必须先于其他 PR 完成（静态 salt 高危）                                                  |
| Sec-2 | `[S2]` | `Secret.isAutoManaged` 字段 + UI 不可在 Secret Manager 删除 + ConfigureModal 不显示作为可选 secret |
| Sec-3 | `[S3]` | softDelete 审计日志写 `hadRefs: boolean` 而非 count；`?confirmCascade=true` 服务端强制             |
| Sec-4 | `[S4]` | byokPolicy 三层：caller hint < user-profile setting < ToolConfig.byokOverride (admin-only)         |
| Sec-5 | `[S5]` | migration script 永不 log decryptedValue；transaction per row；解密后立即 NULL 老列                |
| Sec-6 | `[S6]` | `GET /admin/ai/tool-aliases` 必须 `@AdminGuard`                                                    |

## 6. 运维要求（**v1.1 新增**）

### 6.1 Telemetry 强制 7 项 `[O8]`

| metric                              | type      | tag                  | alert                  |
| ----------------------------------- | --------- | -------------------- | ---------------------- |
| secret.resolver.resolve.duration_ms | histogram | tool_id, source      | P99 > 100ms            |
| secret.resolver.resolve.null_count  | counter   | tool_id              | > 0 for 1h             |
| secret.tool.call.outcome            | counter   | tool_id, outcome     | auth_failed 突增       |
| secret.byok_vs_system_ratio         | gauge     | tool_id              | informational          |
| secret.tool.feature_flag_state      | gauge     | tool_id, useResolver | informational          |
| secret.legacy_path_hit_count        | counter   | source               | 应于 PR-S5d 后 = 0     |
| secret.auto_secret_create_failure   | counter   | reason               | namespace_collision 等 |

### 6.2 Migration progress dashboard `[O7]`

admin 内可见：每个 tool 的 `useResolver` 状态 + 24h success/failure ratio + BYOK ratio + 最近一次 markFailure 详情。

### 6.3 Deploy Playbook `[O4]`

每次 deploy 前：

1. `SELECT COUNT(*) FROM missions WHERE status='running'` —— >0 触发选择：等 / 公告 / 主动 cancel
2. 部署后 5min 内监控：error rate / resolver null rate / auth_failed
3. 任一指标超阈 → 自动 revert（git revert + 立即 deploy）`[O9]`
4. 单 tool 出问题 → flip `useResolver=false` (per-tool, 无需 deploy)

### 6.4 Rollback procedures

- 每个 PR 必有"revert 步骤"段
- migration script 必有逆向脚本（PR-S5/S6 强制）`[O2]`
- 字段添加（isAutoManaged / useResolver / byokOverride）回滚 = drop column；前向兼容代码默认值

## 7. 测试策略（**v1.1 强化**）

- **PR-S0c e2e harness 是阻塞 PR-S2 的前置条件**`[A5]`
- 每个 PR-S2x 上线前必须：
  - 单测覆盖该 category 全部 tool
  - e2e harness 跑 BYOK / system / null fallback 三场景
  - 灰度阶段 24h 观测无 alert
- arch spec 断言：`tool_configs WHERE tool_id IN (multiProviderRegistryIds) AND secret_key IS NOT NULL` 必为 0 行`[D5]`

## 8. PR 依赖图

```
PR-S-prep1 (salt fix)
    ├─→ PR-S0a (alias map)
    ├─→ PR-S0b (observability) ──┐
    ├─→ PR-S0c (e2e harness)  ───┤
    └─→ PR-S0d (BYOK audit)   ───┘
                                  ↓
                              PR-S1 (resolver + schema fields)
                                  ↓
                          ┌───────┴────────┐
                       Phase 2          Phase 3
                       PR-S2a..e        PR-S3 / S4
                          ↓                 ↓
                          └────────┬────────┘
                                   ↓
                              Phase 4: PR-S5a→b→c→d
                                   ↓
                              Phase 5: PR-S6a→b→c→d→e
```

## 9. 工作量重新估算

- Phase 0：3w（4 个 PR 可并行 2-3w）
- Phase 1：1w
- Phase 2：3w（5 个 sub-PR 串行 + 灰度观察期）
- Phase 3：1w
- Phase 4：4w（含 2w 验证期）
- Phase 5：3w（5 步 + 间隔 48h）

**总计 ~15w**（v1.0 估 6-8w 显著低估）。

## 10. 不在本方案范围（不变）

- 多租户隔离
- KMS 集成
- Secret 自动 rotation
- 审计日志查询 UI

## 11. 决议历史

- v1.0 (2026-05-07)：初稿
- v1.1 (2026-05-07)：第 1 轮 4 路评审 26 条 concerns 全吸收
