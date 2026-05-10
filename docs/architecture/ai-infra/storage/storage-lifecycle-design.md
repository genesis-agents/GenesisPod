# 统一存储生命周期管理架构设计 v1.2

> Genesis 平台所有持久化数据的统一生命周期管理（HOT / WARM / COLD 三态 + DELETED 终态），沉淀到 `ai-infra/storage` 基础层；业务模块只消费门面，不关心介质和迁移。

**状态**: Draft v1.2（v1.1 第 2 轮 4 路评审 3/4 后修订；新发现 1 P0 + 多项 P1）  
**作者**: Claude Code  
**日期**: 2026-05-10  
**对应代码**: `backend/src/modules/ai-infra/storage/`（待 PR-S 系列实施）  
**当前现状**: 已有 R2 field-offload（**12 个**字段级 target，2KB 阈值，24h cron）；mission_events 99 MB / 90K 行行级数据未纳入  
**v1.2 vs v1.1**: 修复 Security P0（ACL 列缺失）+ 12 项 P1（详见 §13 修订记录）

---

## 1. 问题陈述

### 1.1 现状盘点（2026-05-10 prod）

| 数据类型                                                                                                           | 体量              | 当前归属           | 治理状态                                         |
| ------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------ | ------------------------------------------------ |
| `agent_playground_mission_events`                                                                                  | 99 MB / 90,689 行 | DB 单表            | ❌ **未治理**（行级归档模式现注册表装不下）      |
| `topic_reports.full_report`                                                                                        | 几十 MB           | DB JSONB           | ✅ field offload (R2 `topic-reports/`)           |
| `dimension_analyses.data_points`                                                                                   | 几 MB             | DB JSONB           | ✅ field offload                                 |
| `research_tasks.result`                                                                                            | 5,344 行待迁      | DB JSONB           | ✅ field offload                                 |
| `knowledge_base_documents.raw_content`                                                                             | 20 docs           | DB Text            | ✅ field offload                                 |
| `wiki_page_revisions.body`                                                                                         | append-only 极冷  | DB Text            | ✅ field offload                                 |
| `wiki_diffs.items`                                                                                                 | 30d 后归档        | DB JSONB           | ✅ field offload                                 |
| `agent_playground_missions.{report_full / reconciliation_report / leader_journal / analyst_output / outline_plan}` | 5 字段            | DB JSONB           | ✅ field offload（5 个 target，不是 1 个）       |
| `mission_report_versions.report_full`                                                                              | 0 行              | DB JSONB           | ✅ field offload                                 |
| `agent_playground_research_results` / `agent_playground_chapter_drafts` / `notifications`                          | 3 表共 ~5MB       | DB                 | ⚠ v2 候选                                        |
| Redis cache                                                                                                        | 散点缓存          | Redis              | ⚠ **不在本设计范围**（独立 `cache-governance/`） |
| 用户头像 / library 资源                                                                                            | R2 直存           | R2（无 lifecycle） | ⚠ v2 候选                                        |

OFFLOAD_TARGETS 实际 **12 个**（v1.0 写 13 个为口径错误）。

### 1.2 三个根本问题

A. **模式碎片化**：现 OFFLOAD_TARGETS 只支持字段级，行级归档（mission_events 90K 小行 → 1 个 R2 对象）装不下。

B. **生命周期单向**：DB → R2 后无回流、无 cold 转换、无合规删除。

C. **抽象层缺失**：业务直接 import R2/Prisma；换底要全仓改。

---

## 2. 设计目标与边界

### 2.1 接管 / 不接管

✅ **接管**：

- 字段级冷数据搬迁（FieldOffload）— 12 个现有 target 改造
- 行级冷数据归档（RowArchive）— 解决 mission_events 99 MB
- 透明读路径 + DB+R2 mixed merge 查询
- 合规删除（GDPR）路径在 R2 standard / IA 范围内同步保证
- 应用层敏感字段加密（v1.2 新增 — 下文 §4.7）

❌ **不接管**：

- HOT 态业务自治（Prisma + Redis）；facade 只接管"已离 DB"的对象
- GLACIER 态 v1 不实施
- EDGE_HOT 完全删除
- Redis cache 治理（拆独立 `ai-infra/cache-governance/`）
- 跨区复制 / 多活灾备
- 多 vendor 抽象（v1 仅 Cloudflare R2）

### 2.2 用户故事

```
作为 admin：看冷数据分布、手动促归档、查任意对象迁移轨迹、关键失败有告警
作为业务开发者：调 storage.put / get / scan 不关心介质，schema 有版本演进
作为合规审计员：查任意数据当前位置 / 历史；GDPR 删除一键删 R2 std + IA + DB
作为合规官（legal-admin）：可独立设置 / 解除 legal_hold；普通 admin 不能改
```

---

## 3. 三态生命周期模型

### 3.1 状态机

```
┌─────────────────┐
│ HOT (业务自治)  │  ← Prisma + Redis；facade 不接管
└────────┬────────┘
         │ archive() 业务终态触发
         ↓ 或 cron 按 policy.archiveAfter
┌─────────────────┐
│  WARM (R2 std)  │ ← facade 接管起点
└────────┬────────┘
         │ cron 按 policy.coolAfter
         ↓
┌─────────────────┐
│  COLD (R2 IA)   │
└────────┬────────┘
         │ policy.deleteAfter（合规期满 + 非 legal_hold）
         ↓
      DELETED

召回：COLD → WARM → HOT (业务侧 prisma.create + storage.delete)
```

| 态      | 介质             | 延迟    | 谁管     |
| ------- | ---------------- | ------- | -------- |
| HOT     | Postgres + Redis | < 10 ms | 业务自治 |
| WARM    | R2 standard      | ~50 ms  | facade   |
| COLD    | R2 IA            | ~200 ms | facade   |
| DELETED | —                | —       | facade   |

### 3.2 状态转换原则

- 业务触发归档：`storage.archive(id, archiver, payload, policy, ownerContext)`
- Cron 触发降温：每 24h 扫 `next_transition_at < now()` AND `legal_hold = false`
- Cron 触发合规删除：扫 `delete_after < now()` AND `legal_hold = false`
- Admin 触发召回：`storage.requestHydrate(id, ownerContext) → ticket`
- 不可跳级；GDPR delete 是同步路径，不走 cron
- **读路径不写状态机**

---

## 4. 抽象层

### 4.1 顶层目录

```
ai-infra/storage/
  facade/
    storage.facade.ts                  ← 业务唯一入口
    storage.module.ts
    abstractions/
      storage.contract.ts              ← IStorageFacade
      lifecycle-policy.ts              ← LifecyclePolicy / Tier
      owner-context.ts                 ← OwnerContext
      versioned-schema.ts              ← VersionedSchema<T>（v1.2 新增，详见 §4.2）

  lifecycle/
    lifecycle-manager.service.ts
    abstractions/lifecycle-target.ts   ← LifecycleTarget（仅 Field/Row 两种）
    targets/field-offload.target.ts    ← 12 个改造
    targets/row-archive.target.ts      ← mission_events

  archiver/
    abstractions/archiver.contract.ts  ← IArchiver
    archiver-registry.ts
    helpers/sanitize-key-segment.ts    ← path traversal 防护

  adapters/
    r2-warm.adapter.ts                 ← R2 standard
    r2-cold.adapter.ts                 ← R2 IA
    abstractions/tier-adapter.ts

  encryption/                          ← v1.2 新增（§4.7）
    application-layer-encryptor.ts
    abstractions/encryptor.contract.ts

  governance/                          ← 已存在改造
    storage-inventory.service.ts       ← 数据源切到 storage_objects
    storage-offload.registry.ts        ← 改造为 LifecycleTarget 注册器
    storage-offload.service.ts         ← 改名 lifecycle-manager 兼容 export

  ❌ monitoring/   ← 不建，用 common/observability/MetricsService
  ❌ audit/        ← 不建，用 common/audit/（v1.2 见 §4.5）
```

### 4.2 业务侧 API（IStorageFacade）— v1.2 修复 ACL

```typescript
/**
 * v1.2 新增：版本化 schema 包装（解决 Reviewer P1-A）
 * z.ZodType<T> 标准接口无 _currentSchemaVersion，需显式包装
 */
export interface VersionedSchema<T> {
  schema: z.ZodType<T>;
  schemaVersion: number; // 与 archiver schemaVersion 对齐
  /** 旧版本数据迁移到当前版本 */
  migrate?: (legacyPayload: unknown, fromVersion: number) => unknown;
}

/**
 * v1.2 强化：所有读 / 召回 / 删除接口必传 OwnerContext，DB 也持久化（§5.2）
 */
export interface OwnerContext {
  userId: string; // 调用者 user id（JWT 注入）
  workspaceId?: string; // 调用者所在 workspace（可选，多租户场景）
  roles?: string[]; // 角色列表（如 ['admin', 'legal-admin']）
}

interface IStorageFacade {
  /**
   * 归档：HOT → WARM 唯一入口；ownerContext 持久化到 storage_objects
   */
  archive(
    id: string,
    archiverName: string,
    payload: unknown,
    policy: string,
    ownerContext: OwnerContext, // 持久化为 storage_objects.owner_id / workspace_id
  ): Promise<{ tier: "warm" }>;

  /**
   * 透明读 — 强制 VersionedSchema + ownerContext + allowTiers
   */
  get<T>(
    id: string,
    schema: VersionedSchema<T>, // 不再裸 z.ZodType
    ownerContext: OwnerContext,
    options?: { allowTiers?: ("warm" | "cold")[] },
  ): Promise<T>;

  /**
   * 集合查询 — DB+R2 mixed merge
   */
  scan<T>(
    scope: { groupBy: string; value: string },
    archiverName: string,
    schema: VersionedSchema<T[]>,
    ownerContext: OwnerContext,
  ): Promise<T[]>;

  /**
   * 召回 ticket — v1.2 强化：getHydrateStatus 也要 ownerContext（解决 Security P1-1）
   */
  requestHydrate(
    id: string,
    ownerContext: OwnerContext,
  ): Promise<{ ticketId: string; eta: Date }>;

  getHydrateStatus(
    ticketId: string,
    ownerContext: OwnerContext, // v1.2 新增 — 防 ticketId 枚举泄露
  ): Promise<HydrateStatus>;

  /**
   * 删除 — v1.2 修复：legal_hold + GDPR 不再自动覆盖（解决 Security P1-3）
   */
  delete(
    id: string,
    ownerContext: OwnerContext,
    reason: "gdpr" | "user-request" | "admin-purge" | "lifecycle-expired",
  ): Promise<DeleteResult>; // 可能返回 'pending-legal-review'

  statusOf(
    id: string,
    ownerContext: OwnerContext,
  ): Promise<StorageObjectStatus>;
}

export type DeleteResult =
  | { status: "deleted" }
  | { status: "pending-legal-review"; reason: string; auditEventId: string };
```

**v1.2 关键修复**：

- `VersionedSchema<T>` 替代裸 `z.ZodType<T>` — Reviewer P1-A
- `getHydrateStatus(ticketId, ownerContext)` — Security P1-1（防信息泄露）
- `delete()` 返回类型可能为 `pending-legal-review`，不再自动覆盖 legal_hold（Security P1-3）

### 4.3 Archiver 责任反转（v1.2 强化）

```typescript
interface IArchiver<TScope = Record<string, string>, TPayload = unknown> {
  name: string;
  schemaVersion: number;

  /** 业务自取数据（storage 不知 prisma 表名）*/
  listForArchive(scope: TScope): Promise<TPayload>;

  /** v1.2 新增：业务声明 ID 模板，scan/delete 时按此反查（解决 Architect P1-N2）*/
  idTemplate(scope: TScope): string; // 如 'mission-events:{missionId}'

  /** 业务定义 R2 key（含 sanitize）*/
  keyFor(scope: TScope, schemaVersion: number): string;

  /** 业务自实现 mixed merge（DB HOT + R2 archived）*/
  scanMixed(scope: TScope, hydrate: () => Promise<TPayload>): Promise<TPayload>;

  serialize(payload: TPayload, schemaVersion: number): string;
  deserialize(raw: string, fromVersion: number, toVersion: number): TPayload;

  /** v1.2 新增：声明本 archiver 写入数据是否含敏感内容 */
  encryption?: {
    enabled: true;
    keyId: string; // 引用 secrets resolver
  };
}
```

> **v1.2 Architect P1-N3 落点**：`scanMixed` 中的 `hydrate` 闭包**不可跨调用缓存**，必须在 facade 内单次创建并由 archiver 立即消费。文档约束 + spec test 验证。

### 4.4 Lifecycle Policy

```typescript
storage.registerPolicy({
  name: "agent-playground-events",
  ownerModule: "agent-playground",
  archiverName: "agent-playground:mission-events",
  archiveTrigger: { kind: "business-event", eventName: "mission.completed" },
  archiveAfter: "0d",
  coolAfter: "90d",
  deleteAfter: null, // 默认不自动删
  r2Prefix: "mission-events/",
  currentSchemaVersion: 1,
  audit: true,
});
```

### 4.5 审计接入（v1.2 强化 — common/audit）

> **v1.2 Arch-Auditor P1-1/P1-3 修复**：现 `backend/src/common/audit/audit.service.ts` 是**纯内存实现**（line 147 `auditLogs: StoredAuditLog[] = []`，最多 1000 条，无 DB 持久化、无 RULE、无 legal-hold）。命名冲突 + 实现缺口必须正面解决。

```
common/audit/
  audit.service.ts                          ← 现存内存版，**重命名** → in-memory-audit.service.ts（向后兼容 alias 1 周）
  persistent-audit.service.ts               ← v1.2 新增：DB 持久化 + RULE INSERT-only + legal-hold
  abstractions/
    audit-event.ts
  audit-log.module.ts
```

**Schema**：

```sql
CREATE TABLE common_audit_log (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type     TEXT NOT NULL,                  -- 'storage' | 'story-bible' | 'feature-flag' | 'key-request'
  entity_id       TEXT NOT NULL,
  action          TEXT NOT NULL,
  actor_kind      TEXT NOT NULL,                  -- 'cron' | 'user' | 'system' | 'legal-admin'
  actor_id        TEXT,
  payload         JSONB NOT NULL,
  legal_hold      BOOLEAN NOT NULL DEFAULT false, -- 该审计行本身是否锁定（不被自身 lifecycle 删）
  occurred_at     TIMESTAMP NOT NULL DEFAULT NOW()
)
PARTITION BY RANGE (occurred_at);

-- v1.2 必备：schema 级 INSERT only
CREATE RULE common_audit_log_no_update ON common_audit_log AS ON UPDATE DO INSTEAD NOTHING;
CREATE RULE common_audit_log_no_delete ON common_audit_log AS ON DELETE DO INSTEAD NOTHING;

-- 月分区预建 12 个月
CREATE INDEX common_audit_entity_idx ON common_audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX common_audit_action_idx ON common_audit_log (action, occurred_at DESC) WHERE action LIKE '%failed%';
```

**审计读取 RBAC（v1.2 修复 Security 跨域泄露）**：

```typescript
class PersistentAuditService {
  async listByEntityType(
    entityType: string,
    requesterRoles: string[],
  ): Promise<AuditEvent[]> {
    // entityType 级 RBAC
    const allowedRoles = AUDIT_ROLE_MAP[entityType];     // 如 'storage' → ['admin', 'legal-admin']
    if (!requesterRoles.some(r => allowedRoles.includes(r))) {
      throw new ForbiddenError(`role missing for ${entityType} audit`);
    }
    return this.prisma.commonAuditLog.findMany({ where: { entityType }, ... });
  }

  async export(entityType: string, requesterRoles: string[]): Promise<NDJSON> {
    // export 必须 admin role + 自身写一条 audit-of-audit
    if (!requesterRoles.includes('admin')) throw new ForbiddenError();
    await this.write({ entityType: 'audit-export', action: 'exported', ... });
    return this.streamNDJSON({ entityType });
  }

  /** v1.2 新增：legal-admin 角色专属（解决 Security P1-2）*/
  async setLegalHold(
    entityType: string,
    entityId: string,
    reason: string,
    requesterRoles: string[],
  ): Promise<void> {
    if (!requesterRoles.includes('legal-admin')) {
      throw new ForbiddenError('legal-admin role required to set legal hold');
    }
    // 写 hold 记录到 common_audit_log（不可篡改）+ 更新 storage_objects.legal_hold = true
    ...
  }
}
```

### 4.6 Metrics 接入（现有 common/observability）

```
storage_objects_total{policy, tier}
storage_size_bytes{policy, tier}
storage_transitions_total{from, to, status, reason}
storage_transition_duration_seconds_bucket{...}
storage_orphans_deleted_total
storage_legal_hold_active_total{entity_type}      ← v1.2 新增
```

### 4.7 应用层加密（v1.2 新增 — 解决 Security 风险）

> **背景**：v1.2 之前归档对象仅靠 Cloudflare R2 SSE 服务端加密，bucket 配置错误时 PII 全裸。Security 提出 v1 至少敏感字段应用层加密。

**适用范围（v1）**：

- `topic_reports.full_report` — 含用户研究内容
- `agent_playground_mission_events` — 含用户提示词 / AI 对话
- `wiki_page_revisions.body` — 含用户编辑内容
- 其余字段（如 `dimension_analyses.data_points`、`research_tasks.result` 中明显是 LLM 输出指标的）暂不加密，单独审计

**实现**（archiver 声明触发）：

```typescript
// archiver 声明 encryption.enabled = true 的 payload 自动经 ApplicationLayerEncryptor 处理
class ApplicationLayerEncryptor {
  // AES-256-GCM；keyId 由 secrets resolver 提供（user-tenant or system-tier）
  async encrypt(plaintext: string, keyId: string): Promise<EncryptedPayload> {
    const key = await this.secrets.getKey(keyId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      _enc: 'aes-256-gcm',
      _keyId: keyId,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }
  async decrypt(payload: EncryptedPayload): Promise<string> { ... }
}
```

**密钥管理**：复用现有 `secrets/secret-resolver.service.ts`；用户级密钥未来可对接 BYOK（v2 候选 — "删 key 即删数据"，物理删除证明）。

**当前限制（合规明示）**：v1 不提供"物理删除证明"。BYOK + per-user key 是 v2 单独立项，不在本设计范围（Architect P1-N5 修复）。

---

## 5. 数据库 schema

### 5.1 `storage_lifecycle_policies`

```sql
CREATE TABLE storage_lifecycle_policies (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                    TEXT UNIQUE NOT NULL,
  owner_module            TEXT NOT NULL,
  archiver_name           TEXT NOT NULL,
  config                  JSONB NOT NULL,
  current_schema_version  INT NOT NULL DEFAULT 1,
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.2 `storage_objects`（v1.2 关键修复 — 加 owner 列）

```sql
CREATE TABLE storage_objects (
  id                  TEXT PRIMARY KEY,
  policy_name         TEXT NOT NULL REFERENCES storage_lifecycle_policies(name),
  current_tier        TEXT NOT NULL,
  uri                 TEXT NOT NULL,
  size_bytes          BIGINT,
  schema_version      INT NOT NULL,

  -- v1.2 新增：ACL 列（解决 Security P0-1 / CWE-863）
  owner_user_id       TEXT,                       -- archiver 写入时持久化 ownerContext.userId
  owner_workspace_id  TEXT,                       -- ownerContext.workspaceId（多租户）

  -- v1.2 新增：加密元信息
  encrypted           BOOLEAN NOT NULL DEFAULT false,
  encryption_key_id   TEXT,                       -- 引用 secrets resolver

  next_transition_at  TIMESTAMP NOT NULL,
  delete_after        TIMESTAMP,
  legal_hold          BOOLEAN NOT NULL DEFAULT false,
  legal_hold_reason   TEXT,
  legal_hold_set_by   TEXT,                       -- legal-admin user id
  legal_hold_set_at   TIMESTAMP,

  -- v1.2 新增：backfill 续传游标
  backfill_cursor     JSONB,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
)
PARTITION BY RANGE (created_at);

-- v1.2 必备索引：ACL 校验路径（owner 列 + policy 联合）
CREATE INDEX storage_objects_owner_idx ON storage_objects (owner_user_id, policy_name);
CREATE INDEX storage_objects_workspace_idx ON storage_objects (owner_workspace_id, policy_name) WHERE owner_workspace_id IS NOT NULL;

-- 现有索引
CREATE INDEX storage_objects_pending_idx ON storage_objects (next_transition_at)
  WHERE current_tier = 'warm' AND legal_hold = false;
CREATE INDEX storage_objects_delete_idx ON storage_objects (delete_after)
  WHERE delete_after IS NOT NULL AND legal_hold = false;
CREATE INDEX storage_objects_policy_tier_idx ON storage_objects (policy_name, current_tier);
```

### 5.3 Migration 注意事项

- 全部 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
- 月分区预建 12 个月（手写 SQL）
- 避免 `CREATE INDEX CONCURRENTLY`（已知 prisma migrate deploy 静默回滚坑）
- `audit_log` PARTITION BY RANGE(occurred_at) 月分区在 PR-A0b 同步建立（不能等表大了再加）

---

## 6. 迁移引擎（Lifecycle Manager）

### 6.1 cron 主循环

```typescript
async runOnce() {
  const policies = await this.prisma.storageLifecyclePolicy.findMany({ where: { enabled: true } });
  const locked = await acquireAdvisoryLock();
  if (!locked) return;

  try {
    for (const policy of policies) {
      const due = await this.findDueForCool(policy);
      for (const obj of due) await this.transition(obj, 'cold');

      const expired = await this.findDueForDelete(policy);
      // legal_hold 直接在 SQL WHERE 过滤（不依赖应用层判断）
      for (const obj of expired) {
        await this.deleteInternal(obj, 'lifecycle-expired');
      }
    }
    await this.orphanScanner.scan();
  } finally {
    await releaseAdvisoryLock();
  }
}
```

### 6.2 transition 序列（commit-then-delete + audit pending）

```typescript
async transition(obj: StorageObject, toTier: Tier) {
  const auditId = await this.audit.write({
    entityType: 'storage',
    entityId: obj.id,
    action: 'transition.pending',
    payload: { from: obj.current_tier, to: toTier },
  });

  try {
    const newUri = await this.adapters[toTier].copyIfNotExists(obj.uri); // v1.2: 显式幂等接口
    await this.prisma.storageObject.update({
      where: { id: obj.id },
      data: { current_tier: toTier, uri: newUri, updated_at: new Date() },
    });
    await this.adapters[obj.current_tier].delete(obj.uri);
    await this.audit.write({ entityType: 'storage', entityId: obj.id, action: 'transition.success', payload: { auditPendingId: auditId, ...} });
  } catch (e) {
    await this.audit.write({ entityType: 'storage', entityId: obj.id, action: 'transition.failed', payload: { auditPendingId: auditId, error: e.message } });
    // 不抛 — 单对象失败不阻塞其他
  }
}
```

> **Reviewer P1-D 落点**：`copyIfNotExists` 是显式 adapter 接口；R2 原生不支持 if-not-exists copy，adapter 内部用 `headObject` 检查 + `putObject`（两步幂等，竞争窗口由 advisory lock 收敛）。

### 6.3 Orphan Scanner

继承 v1.1 设计，每次扫一批 R2 对象（1000）按 prefix 反查 storage_objects：

- DB 不存在 → 删
- DB 存在但 URI 与 R2 key 不匹配（旧 URI 残留）→ 删

### 6.4 透明读路径（v1.2 ACL 强化）

```typescript
async get<T>(id, schema, ownerContext, options) {
  const obj = await this.prisma.storageObject.findFirst({ where: { id } });
  if (!obj) throw new NotFoundError(id);

  // v1.2: 真实 ACL 检查（基于 storage_objects.owner_user_id / workspace_id）
  await this.acl.assertCanRead(obj, ownerContext);

  const allowTiers = options?.allowTiers ?? ['warm'];
  if (!allowTiers.includes(obj.current_tier)) {
    throw new NeedsHydrationError(id, obj.current_tier);
  }

  let raw = await this.adapters[obj.current_tier].read(obj.uri);

  // v1.2: 应用层解密（如果 archived 时启用）
  if (obj.encrypted) {
    raw = await this.encryptor.decrypt(JSON.parse(raw));
  }

  const archiver = this.archivers.get(obj.policy.archiverName);
  const data = archiver.deserialize(raw, obj.schema_version, schema.schemaVersion);

  return schema.schema.parse(data);
}

// v1.2 ACL 实现核心
class StorageAclService {
  async assertCanRead(obj: StorageObject, ctx: OwnerContext): Promise<void> {
    // 1. 同 user 直读
    if (obj.owner_user_id === ctx.userId) return;
    // 2. 同 workspace 且 caller 是 workspace member（业务 RBAC 上层校验）
    if (obj.owner_workspace_id && obj.owner_workspace_id === ctx.workspaceId) return;
    // 3. admin role 可读所有（含 audit 审查）
    if (ctx.roles?.includes('admin')) return;
    throw new ForbiddenError(`user ${ctx.userId} cannot read storage object ${obj.id}`);
  }

  async assertCanDelete(obj: StorageObject, ctx: OwnerContext): Promise<void> {
    // GDPR / user-request 必须是 owner；admin-purge 必须是 admin role
    if (obj.owner_user_id === ctx.userId) return;
    if (ctx.roles?.includes('admin')) return;
    throw new ForbiddenError();
  }
}
```

### 6.5 Mixed-Source Scan（v1.2 修复 ACL null guard）

```typescript
async scan<T>(scope, archiverName, schema, ownerContext) {
  const archiver = this.archivers.get(archiverName);
  const expectedId = archiver.idTemplate(scope);  // v1.2: 业务侧明确模板，不靠 startsWith
  const obj = await this.prisma.storageObject.findFirst({ where: { id: expectedId } });

  // v1.2 修复 P1-C：obj 为 null（未归档）时跳过 storage 层 ACL，由业务方 archiver 在 scanMixed 内自行校验 scope 归属
  if (obj) {
    await this.acl.assertCanRead(obj, ownerContext);
  }

  const result = await archiver.scanMixed(scope, async () => {
    if (!obj) return [];
    let raw = await this.adapters[obj.current_tier].read(obj.uri);
    if (obj.encrypted) raw = await this.encryptor.decrypt(JSON.parse(raw));
    return archiver.deserialize(raw, obj.schema_version, schema.schemaVersion);
  });

  return schema.schema.parse(result);
}
```

### 6.6 GDPR / 删除路径（v1.2 修复 legal_hold）

```typescript
async delete(id, ownerContext, reason): Promise<DeleteResult> {
  const obj = await this.prisma.storageObject.findFirst({ where: { id } });
  if (!obj) return { status: 'deleted' };

  await this.acl.assertCanDelete(obj, ownerContext);

  // v1.2 修复 Security P1-3：legal_hold 不再被 GDPR 自动覆盖
  if (obj.legal_hold) {
    const eventId = await this.audit.write({
      entityType: 'storage',
      entityId: id,
      action: 'delete.legal-hold-blocked',
      actorKind: 'user',
      actorId: ownerContext.userId,
      payload: { reason, legalHoldReason: obj.legal_hold_reason },
    });
    // 通知合规审批通道
    await this.notify.toLegalAdmin({
      kind: 'gdpr-vs-legal-hold-conflict',
      objectId: id,
      reason,
      auditEventId: eventId,
    });
    return { status: 'pending-legal-review', reason: 'legal-hold-active', auditEventId: eventId };
  }

  // v1.2 实装承诺：同时跑 orphan scan for 该 id 命中的所有 prefix（解决 Reviewer P1-B）
  await this.orphanScanner.scanForObject(obj);

  try {
    await this.adapters[obj.current_tier].delete(obj.uri);
    await this.prisma.storageObject.delete({ where: { id } });
    await this.audit.write({ entityType: 'storage', entityId: id, action: 'deleted', payload: { reason, formerUri: obj.uri } });
    return { status: 'deleted' };
  } catch (e) {
    // v1.2 修复 Security P0-1（Round 2 残留）：R2 删成功 + DB 删失败的半完成路径
    await this.audit.write({ entityType: 'storage', entityId: id, action: 'delete.partial', payload: { reason, error: e.message, formerUri: obj.uri } });
    throw e;
  }
}
```

---

## 7. 可视化 / 可管理 / 可监控 / 可审计

### 7.1 可视化（admin/storage UI — v1.2 修正 tab 数）

**最终 6 tab = 3 现有 + 3 新增**：

| 现有保留                       | 新增                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| Pipeline（field offload 进度） | Lifecycle Overview（取代 DB Footprint，数据切到 storage_objects 表） |
| Catalog（R2 prefix 实际分布）  | Policies（policy 列表 + 启用 / 命中数 / last cron）                  |
| Trend（30d 体量走势）          | Objects（单对象 ID 搜索 + tier 时序 + audit 轨迹）                   |

**移除**：DB Footprint（被 Lifecycle Overview 取代，数据来源同源）

### 7.2 可管理（v1.2 RBAC 细分）

| 操作                                 | 角色                                |
| ------------------------------------ | ----------------------------------- |
| 看面板 / 看 audit                    | `admin`                             |
| 单对象推转 / 召回                    | `admin`                             |
| policy 启用 / 禁用                   | `admin`                             |
| policy 编辑（warmAfter / coolAfter） | `admin`                             |
| **强制 delete object**               | `admin`                             |
| **设置 / 解除 legal_hold**           | `legal-admin`（独立 role）          |
| **审计导出**                         | `admin` + 自身写一条 audit-of-audit |

新建 destructive endpoints 必须 `JwtAuthGuard + @Roles(...)`，不再用现有 `StorageGovernanceController` 的 `@Public + x-admin-key` 模式（Round 1 Security P1）。

### 7.3 可监控

接入现有 `common/observability/MetricsService`，告警规则在现有 alert 配置：

- 迁移失败率 1h > 5% → warn
- HOT 数据 > 5 GB → warn
- cron 36h 未跑 → critical
- legal_hold 数量月增 > 50 → 通知 legal-admin

### 7.4 可审计

- 所有 transition / hydrate / delete / orphan / legal-hold-set / audit-export 写 `common_audit_log`
- schema-level RULE INSERT only + spec test 断言
- 保留期 7 年（明示依据：金融行业最严格 + GDPR 处理记录 Article 30）
- entityType 级 RBAC（admin 看 storage / story-bible 等不同业务域可独立配 role）
- legal-admin 能 set 但不能 unset 别人设的 hold（spec test 验证）

---

## 8. PR 实施序列（v1.2 重排）

### Phase 0：项目级前置（v1.2 拆细）

| PR          | 内容                                                                                                                                                                      | 工作量 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **PR-A0a**  | `common/audit/abstractions/`（IAuditLogService 接口契约 + AuditEvent 类型）                                                                                               | 0.5 天 |
| **PR-A0b**  | `PersistentAuditService` 实装（DB 表 + RULE + 月分区 + entityType RBAC + legal-hold）；现 `audit.service.ts` 重命名为 `in-memory-audit.service.ts`（向后兼容 alias 1 周） | 2 天   |
| **PR-A0.5** | `StoryBibleAuditLog` / `FeatureFlagAuditLog` 接入 `PersistentAuditService`（DB 迁移脚本 + caller 修改 + 回归 spec）                                                       | 1.5 天 |

**Phase 0 合计：4 天**（v1.1 估 1.5 天，依据 arch-auditor 实读 audit.service.ts 修正）

### Phase 1：抽象骨架

| PR             | 内容                                                                                                                                    | 工作量         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **PR-S1**      | 目录 + abstractions（StorageFacade / OwnerContext / IArchiver / VersionedSchema / LifecycleTarget / IEncryptor）+ ArchiverRegistry 骨架 | 1 天           |
| **PR-S2**      | DB migration（storage_lifecycle_policies / storage_objects + owner 列 + 月分区）                                                        | 1 天           |
| **PR-S3**      | LifecycleManagerService 骨架 + R2WarmAdapter / R2ColdAdapter（含 copyIfNotExists 幂等）                                                 | 1.5 天         |
| **PR-S4a-S4d** | 12 个 OFFLOAD_TARGETS 拆 4 PR 改造（每 PR 3 个 target，避免 god-class guard 拦）                                                        | 4 × 0.5 = 2 天 |
| **PR-S5**      | RowArchiveTarget + sample IArchiver                                                                                                     | 1 天           |

**Phase 1 合计：6.5 天**

### Phase 2：业务接入 + 加密 + 监控

| PR          | 内容                                                                                                                          | 工作量 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| **PR-S6a**  | MissionEventsArchiver 实现（含 idTemplate / scanMixed / encryption.enabled）+ 注册                                            | 1.5 天 |
| **PR-S6b**  | MissionEventsService 改造：`findByMission` 调 `storage.scan`；活跃 mission 走原 in-memory + DB（互斥条件 + spec test）        | 2.5 天 |
| **PR-S7a**  | Backfill dry-run 脚本（独立 advisory lock key）                                                                               | 0.5 天 |
| **PR-S7b**  | Backfill 正式（分批 + 续传游标 in storage_objects.backfill_cursor + 失败可恢复）                                              | 1 天   |
| **PR-S8**   | Audit 接入：所有 transition / hydrate / delete / orphan / archive / legal-hold-set / audit-export 写 `PersistentAuditService` | 1 天   |
| **PR-S9**   | Metrics 注册 + 健康检查 + 告警规则                                                                                            | 0.5 天 |
| **PR-S9.5** | ApplicationLayerEncryptor 实现 + topic_reports / mission_events / wiki revisions 接入加密                                     | 1.5 天 |

**Phase 2 合计：8.5 天**

### Phase 3：admin UI + RBAC

| PR         | 内容                                                                                        | 工作量 |
| ---------- | ------------------------------------------------------------------------------------------- | ------ |
| **PR-S10** | admin UI 新增 3 tab（Lifecycle Overview / Policies / Objects）；移除 DB Footprint；6 tab 总 | 4 天   |
| **PR-S11** | destructive endpoints + JwtAuthGuard + Roles（admin / legal-admin 二级）+ legal-hold UI     | 2 天   |

**Phase 3 合计：6 天**

### **总工作量：Phase 0+1+2+3 = 25 工作日**（v1.1 估 17.5 天偏乐观，主因 Phase 0 audit 重建）

---

## 9. 风险与对策

| 风险                                 | 影响                  | 对策                                                                               |
| ------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| 透明 hydrate 失败 → 业务读 null      | mission replay 假成功 | adapter 失败抛具体错（404 / timeout）；facade 不静默吞                             |
| transition 双写孤儿                  | DB+R2 不一致          | §6.2 commit-then-delete + audit pending + §6.3 orphan scanner                      |
| GDPR delete + legal_hold 冲突        | 合规进退两难          | §6.6 抛 `pending-legal-review` 通知合规人工决策，不自动                            |
| Cloudflare 内部副本                  | 物理删除不可证        | v1 文档明示限制；BYOK 物理删除证明列为 v2 单独立项（不在 backlog 含混留）          |
| Cron pod SIGKILL                     | 半完成 transition     | audit pending + 下次 cron + orphan scanner                                         |
| backfill 90K 一次跑挂                | 状态混乱              | dry-run + 分批续传 + 独立 lock                                                     |
| policy 写错                          | 数据立即降温          | zod 校验 + spec test                                                               |
| R2 配额超                            | 上传失败              | metric 告警 + adapter 抛 quota error                                               |
| R2 key path traversal                | 跨租户                | `sanitizeKeySegment` helper + spec test                                            |
| 跨租户 IDOR                          | 数据泄露              | `storage_objects.owner_user_id` + `assertCanRead` 真实比对 + spec test             |
| ticketId 枚举                        | 信息泄露              | `getHydrateStatus` 强制 `ownerContext` 校验                                        |
| legal-admin 滥用                     | 越权                  | legal-admin 不能 unset 别人 set 的 hold；所有变更写 audit                          |
| 应用层加密 key 丢失                  | 归档对象不可读        | secrets resolver 多副本 + 启动时 boot-test 解密一条 + alert                        |
| audit 表跨业务域看见                 | 合规违规              | entityType 级 RBAC + admin 导出再写一条 audit-of-audit                             |
| 单 vendor R2 故障                    | WARM/COLD 不可用      | SLA: 24h 内业务 fallback 走 DB（已归档对象返回 NeedsHydrationError，业务 surface） |
| `common/audit/AuditService` 命名冲突 | 现有 caller 断        | 重命名 → `InMemoryAuditService` + 1 周向后兼容 alias，spec 双覆盖                  |

---

## 10. 与项目现有架构的关系

### 10.1 层级归属

```
L4 Open API / L3 AI Apps                              ← 调 storage facade + 实现 IArchiver
              ↓
L2.5 AI Harness / L2 AI Engine                        ← 不直接消费
              ↓
L1 ai-infra/storage（facade + lifecycle + adapters + encryption）
       │
       ├ 依赖 L1 common/audit （PR-A0a/b 前置）
       ├ 依赖 L1 common/observability/MetricsService
       └ 依赖 L1 common/secrets （key resolver）
```

### 10.2 端口模式（合法 adapter）

业务方实现 `IArchiver` 注册到 `ArchiverRegistry` —— 与 SkillRegistry / ToolRegistry 一致；不违反 ESLint `no-restricted-imports`。

### 10.3 现有代码迁移路径

- 现 12 个 OFFLOAD_TARGETS → PR-S4a-S4d 拆 4 PR 改造
- 现 `StorageOffloadService.runOnce` → 改名 `LifecycleManagerService.runOnce`，alias export 兼容
- 现 `storage-inventory.service.ts` → 切到 `storage_objects` 表（双轨并跑 1 周校验）
- 现 `MissionEventBuffer` in-memory + DB → PR-S6b 显式区分双路径
- 现 `common/audit/audit.service.ts`（内存版）→ 重命名 + 新建 `PersistentAuditService`

---

## 11. 验证标准（实施完毕后）

- [ ] `agent_playground_mission_events` 90d 前的行 < 1000 行
- [ ] DB 总量在 mission 翻倍时**不**线性增长
- [ ] `storage.scan(...)` 返回完整 events（DB+R2 merge），spec 覆盖 backfill 前后两侧
- [ ] `storage.get<T>(id, schema, ctx)` 拒绝 `as T` 调用，所有 caller 必传 VersionedSchema
- [ ] `storage.get(id, schema, wrongUserCtx)` 抛 `ForbiddenError`，spec 覆盖
- [ ] `storage.delete(id, ctx, 'gdpr')` 同步删 R2 std + IA + DB，spec 覆盖
- [ ] `delete()` 命中 legal_hold 返回 `pending-legal-review`，不自动覆盖，spec 覆盖
- [ ] `getHydrateStatus(ticketId, otherUserCtx)` 抛 `ForbiddenError`，spec 覆盖
- [ ] `common_audit_log` UPDATE / DELETE 0 行影响（RULE 强制），spec 断言
- [ ] `legal_hold = true` 对象不被 cron 删除，spec 覆盖
- [ ] R2 key 含 `..` / `/` 注入被拒，spec 覆盖
- [ ] orphan scanner 识别 transition 半完成产生的旧 URI 副本并清理，spec 覆盖
- [ ] 应用层加密：`encrypted = true` 对象 R2 read 后 plaintext 不出现在 audit log
- [ ] `setLegalHold` 仅 `legal-admin` role 可调用，spec 覆盖
- [ ] `audit export` 必须 admin role 且自身写 audit，spec 覆盖
- [ ] `entityType` 级 RBAC：caller role 不在 AUDIT_ROLE_MAP 抛 ForbiddenError，spec 覆盖
- [ ] Prom metrics 标签基数 < 100
- [ ] `common/audit/AuditService` 现有 caller 不破（重命名 + alias 1 周）

---

## 12. 后续讨论点（v2 候选）

1. GLACIER tier（含同步删除能力）
2. EDGE_HOT
3. 多 vendor 适配（S3 / Azure）
4. 跨区灾备 (CDR)
5. Phase 4 接入：notifications / library 资源 / chapter_drafts / research_results
6. **BYOK + per-user 加密密钥**（独立立项）：解决"物理删除证明"——删除用户密钥即数据不可读，与 GDPR Article 17 "可证明删除"对接

---

## 13. 修订记录

### v1.2（2026-05-10）— Round 2 后修订

**Security P0（关键）**：

- ✅ `storage_objects` 加 `owner_user_id` / `owner_workspace_id` 列 + 索引（CWE-863）
- ✅ `assertCanRead` / `assertCanDelete` 实装真实 ACL，不再空实现

**多路 P1 全采纳**：

| #   | 来源              | 修复                                                                             |
| --- | ----------------- | -------------------------------------------------------------------------------- |
| 1   | Architect P1-N1   | tab 数自洽：3 现有 + 3 新增 = 6                                                  |
| 2   | Architect P1-N2   | archiver 加 `idTemplate(scope)` 显式声明，scan 不靠 startsWith                   |
| 3   | Architect P1-N3   | scanMixed hydrate 闭包不可跨调用缓存（文档约束 + spec）                          |
| 4   | Architect P1-N4   | Phase 0 拆 PR-A0a（接口契约）+ PR-A0b（实现）                                    |
| 5   | Architect P1-N5   | BYOK 物理删除证明从 backlog 移到 v2 单独立项                                     |
| 6   | Arch-Auditor P1-1 | Phase 0 工作量重估 1.5d → 4d（PR-A0=2d+1.5d / 现 audit.service 重命名）          |
| 7   | Arch-Auditor P1-2 | PR-S4 拆 PR-S4a~S4d 4 个（防 god-class guard）                                   |
| 8   | Arch-Auditor P1-3 | `common/audit/audit.service` 命名冲突明确解决：重命名 + alias                    |
| 9   | Reviewer P1-A     | 新增 `VersionedSchema<T>` 包装类型                                               |
| 10  | Reviewer P1-B     | §6.6 GDPR delete 实装 `orphanScanner.scanForObject(obj)`                         |
| 11  | Reviewer P1-C     | §6.5 obj=null 时 ACL guard，业务侧 archiver 自校验 scope                         |
| 12  | Reviewer P1-D     | adapter 显式 `copyIfNotExists` 接口；R2 内部 headObject + putObject 两步幂等     |
| 13  | Security P1-1     | `getHydrateStatus(ticketId, ownerContext)` 必传                                  |
| 14  | Security P1-2     | `legal_hold` 写权限独立 `legal-admin` role；setLegalHold 入 RBAC                 |
| 15  | Security P1-3     | GDPR delete 命中 legal_hold 不自动覆盖，返回 `pending-legal-review` 通知合规决策 |
| 16  | Security 加密     | 新增 §4.7 应用层加密；topic_reports / mission_events / wiki revisions 强制加密   |
| 17  | Security 跨域     | audit_log entityType 级 RBAC + export 必须 admin + 自审计                        |
| 18  | Security 部分删除 | `delete()` R2 删成功 + DB 删失败路径写 `delete.partial` audit                    |

**总工期重估**：v1.1 17.5d → **v1.2 25 工作日**（主因：Phase 0 audit 实际是重建 + 加密层 + RBAC 细分）

### v1.1（2026-05-10）

- 修复 v1.0 9 个 P0 + P1 共识采纳
- Round 2: Architect / Arch-Auditor / Reviewer APPROVED-WITH-COMMENTS；Security NEEDS-CHANGES（新发现 ACL 列缺失 P0）

### v1.0（2026-05-10）

- 初版设计；Round 1: 4 路 0/4 APPROVED，9 个 P0

---

**最后更新**: 2026-05-10  
**状态**: Draft v1.2，Security 第 3 轮评审待  
**审议人选**: Security 单路验证（其余 3 路 Round 2 已 APPROVED-WITH-COMMENTS，不重复评审）
