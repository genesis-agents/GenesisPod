# 统一存储生命周期管理架构设计 v1.0

> Genesis 平台所有持久化数据的统一生命周期管理（Hot/Warm/Cold/Glacier 四态），沉淀到 `ai-infra/storage` 基础层，业务模块只消费门面，不关心介质和迁移。

**状态**: Draft v1.0  
**作者**: Claude Code  
**日期**: 2026-05-10  
**对应代码**: `backend/src/modules/ai-infra/storage/`（待 PR-S 系列实施）  
**当前现状**: 仅有 R2 field-offload（13 个字段级 target，2KB 阈值，24h cron）；mission_events 99MB 等行级数据未纳入

---

## 1. 问题陈述

### 1.1 现状盘点（2026-05-10 prod）

| 数据类型                               | 体量              | 当前归属           | 治理状态                                    |
| -------------------------------------- | ----------------- | ------------------ | ------------------------------------------- |
| `agent_playground_mission_events`      | 99 MB / 90,689 行 | DB 单表            | ❌ **未治理**，与 mission 同寿命无限累积    |
| `topic_reports.full_report`            | ≈ 几十 MB         | DB JSONB           | ✅ field offload (R2 `topic-reports/`)      |
| `dimension_analyses.data_points`       | ≈ 几 MB           | DB JSONB           | ✅ field offload (R2 `dimension-analyses/`) |
| `research_tasks.result`                | 5,344 行待迁      | DB JSONB           | ✅ field offload (R2 `research-tasks/`)     |
| `knowledge_base_documents.raw_content` | 20 docs           | DB Text            | ✅ field offload (R2 `kb-documents/`)       |
| `wiki_page_revisions.body`             | append-only 极冷  | DB Text            | ✅ field offload (R2 `wiki-revisions/`)     |
| `wiki_diffs.items`                     | 30d 后归档        | DB JSONB           | ✅ field offload (R2 `wiki-diffs/`)         |
| `agent_playground_research_results`    | 151 行 / 912 KB   | DB                 | ❌ 未治理                                   |
| `agent_playground_chapter_drafts`      | 877 行 / 4.4 MB   | DB                 | ❌ 未治理                                   |
| `mission_report_versions.report_full`  | 0 行（新表）      | DB JSONB           | ✅ field offload                            |
| `notifications`                        | 不详（增长中）    | DB                 | ❌ 未治理                                   |
| `Redis cache`                          | 散点缓存          | Redis              | ❌ 无 TTL 治理面板                          |
| 用户头像 / library 资源                | R2 直存           | R2（无 lifecycle） | ❌ 无冷数据归档/删除                        |

### 1.2 三个根本问题

**问题 A：模式碎片化**

现有 OFFLOAD_TARGETS 只支持"字段级搬迁"（单行的某个大字段 → R2，行保留）。但 `mission_events` 是"行级归档"模式（90K 小行按 mission_id 打包成 1 个 R2 对象，行删除）。两种模式不能塞进同一个注册表。

**问题 B：数据生命周期缺失**

当前是**单向**：DB → R2，数据进入 R2 就永久留存。缺：

- **温→冷**：R2 内对象老于 N 月，转 R2 Infrequent Access 或 Glacier 策略
- **冷→删**：超过法律保留期 / 合规保留期 → 删除（含 R2 + DB 主表）
- **手动召回**：admin 想把某个老 mission 拉回 DB 调试

**问题 C：抽象层缺失**

业务模块（research / playground / library）直接知道 R2 / Prisma JSONB / Redis 在哪。换底（比如未来从 R2 切到 S3 / Cloudflare Durable Objects KV）需要全仓改。应该让业务只调 `storage.get(id) / storage.put(id, data, policy)`，介质由基础层决定。

**问题 D：可观测性 / 可审计缺失**

- 当前 admin/storage 页只能看 DB / R2 总量，看不到**单条数据**的生命周期
- 没有 `who archived what at when` 审计流（合规要求）
- 没有 metric / alert（"R2 未启用了 24h" / "归档失败率 > 5%"）

---

## 2. 设计目标

### 2.1 用户故事

```
作为 admin，我想：
  - 一个面板看到所有数据的生命周期阶段（hot/warm/cold/glacier 各占多少）
  - 手动促 mission 的 events 立即归档（不用等 30 天 cron）
  - 看到任何一次归档 / 召回的审计记录（时间、操作者、对象、结果）
  - R2 配额 / Redis 内存 任一指标超阈值时收到告警

作为业务开发者，我想：
  - 写代码不知道 R2 / Postgres / Redis 在哪
  - 调 storage.put(id, data, { tier: 'hot', warmAfter: '7d' }) 完事
  - 调 storage.get(id) 透明拿到内容（哪怕已经在 R2 / Glacier）

作为合规审计员，我想：
  - 查任意一条用户数据的当前位置 / 历史迁移
  - 应用户删除请求时，一键删除所有副本（DB + R2 + Glacier + 备份）
```

### 2.2 非目标

- **不做实时事务保证**：迁移是 best-effort 异步任务，不接入业务事务
- **不做跨区复制**：当前 Genesis 单区部署，CDR 不在 v1 范围
- **不做 query engine**：不提供"按生命周期 SQL"，业务直接用 Prisma 拿主表

---

## 3. 四态生命周期模型

### 3.1 状态机

```
       ┌──────────┐  warmAfter   ┌──────────┐  coldAfter   ┌──────────┐  glacierAfter  ┌──────────┐
       │   HOT    │ ───────────→ │   WARM   │ ───────────→ │   COLD   │ ─────────────→ │ GLACIER  │
       │ (DB +    │              │ (R2 std) │              │ (R2 IA)  │                │ (R2 GLA) │
       │  Redis)  │              │          │              │          │                │          │
       └──────────┘              └──────────┘              └──────────┘                └──────────┘
            ↑                          │                          │                           │
            │                          │                          │                           │
            └──── recall (admin) ──────┴──────────────────────────┴───────────────────────────┘

                                       deleteAfter ─────→ DELETED (gone)
```

| 态          | 介质                                     | 访问延迟   | 单价相对值 | 用例                                             |
| ----------- | ---------------------------------------- | ---------- | ---------- | ------------------------------------------------ |
| **HOT**     | Postgres + Redis cache                   | < 10 ms    | 100x       | 活跃 mission events / 当前用户数据 / 实时聊天    |
| **WARM**    | R2 standard                              | 50-200 ms  | 10x        | 完结 < 30d mission / 已发布 report / 月活资源    |
| **COLD**    | R2 Infrequent Access                     | 200-500 ms | 3x         | 完结 > 30d mission events / 1 年前 wiki revision |
| **GLACIER** | R2 + Cloudflare lifecycle policy（深存） | 数小时     | 1x         | 法律保留 / 合规归档（5+ 年）                     |

### 3.2 状态转换规则

- **同步转换**（业务触发）：`storage.put()` 默认 HOT
- **异步转换**（cron 触发）：每 24h 扫所有 lifecycle policy，按 age 推进
- **手动转换**（admin 触发）：admin/storage 面板可强制推进或召回
- **不可跳级**：HOT → WARM → COLD → GLACIER 单向流；GLACIER → HOT 必须经过 WARM hydrate 中间态

### 3.3 KV 时代的"零态"

> 现代场景下还有"比 HOT 更热"的层：边缘 KV（Cloudflare KV / DO storage / Redis edge replica）。

- **EDGE_HOT**: < 1 ms 边缘读取，用于**纯读**场景（feature flags / 公共配置 / brand settings / 实时计数器）
- 不在 v1 范围内但保留扩展位（在 `StorageTier` enum 里预留 `'edge'` 值，对应 `IEdgeStorageAdapter`）

---

## 4. 抽象层（沉淀到 `ai-infra/storage/`）

### 4.1 顶层门面

```
ai-infra/storage/
  facade/
    storage.facade.ts                  ← 业务唯一入口
    abstractions/
      storage.contract.ts              ← IStorageFacade 接口定义
      lifecycle-policy.ts              ← LifecyclePolicy / Tier 类型

  lifecycle/                           ← 核心生命周期引擎
    lifecycle.service.ts
    lifecycle-manager.ts               ← 状态机
    abstractions/
      lifecycle-target.ts              ← LifecycleTarget 接口（field/row 两种）
    targets/
      field-offload.target.ts          ← 现有 OFFLOAD_TARGETS 适配
      row-archive.target.ts            ← mission_events 这种行级归档
      ttl-cleanup.target.ts            ← Redis cache / 通知等带 TTL 的

  adapters/                            ← 介质适配器
    postgres-hot.adapter.ts            ← Prisma 读写
    redis-cache.adapter.ts             ← Redis L2 cache
    r2-warm.adapter.ts                 ← R2 standard
    r2-cold.adapter.ts                 ← R2 IA
    r2-glacier.adapter.ts              ← R2 lifecycle policy
    abstractions/
      tier-adapter.ts                  ← ITierAdapter

  governance/                          ← 已存在（field offload）
    storage-inventory.service.ts       ← 统计面板的数据源
    storage-offload.registry.ts        ← 改造为 LifecycleTarget 的注册器
    storage-offload.service.ts         ← 改造为 LifecycleManager 的实施层

  audit/                               ← 新增
    audit-log.service.ts               ← 每次 transition / recall / delete 写入 storage_audit_log 表
    abstractions/
      audit-event.ts

  monitoring/                          ← 新增
    storage-metrics.service.ts         ← 暴露 prom metrics
    health-check.service.ts            ← health endpoint
```

### 4.2 业务侧 API（Facade）

```typescript
// 1. 写入 — 业务关心的只是逻辑 ID + 数据 + 策略
await storage.put("mission-events:mission-id-xxx", eventArray, {
  tier: "hot", // 起始 tier
  contentType: "application/json",
  policy: "agent-playground-events", // 政策名（lifecycle 注册表里查）
});

// 2. 读取 — 透明 hydrate（不管在哪，自动拉回内存）
const events = await storage.get<MissionEvent[]>(
  "mission-events:mission-id-xxx",
);

// 3. 删除 — 用户行权 / 合规
await storage.delete("mission-events:mission-id-xxx", {
  reason: "gdpr-delete",
});

// 4. 查询 lifecycle 状态
const status = await storage.statusOf("mission-events:mission-id-xxx");
// { tier: 'warm', medium: 'r2-standard', sizeBytes: 1.2e6, transitions: [...] }
```

### 4.3 Lifecycle Policy 定义

每个业务在启动时注册自己的 policy，落到 `storage_lifecycle_policies` 表：

```typescript
storage.registerPolicy({
  name: 'agent-playground-events',
  // 触发条件：mission 终态后开始计时
  hotUntil: { trigger: 'mission.completed', within: '30d' },
  warmAfter: '30d',     // 30 天后转 R2 standard
  coldAfter: '90d',     // 90 天后转 R2 IA
  glacierAfter: '365d', // 1 年后转 Glacier
  deleteAfter: '5y',    // 5 年后删除（合规保留期）

  // R2 路径模板
  keyTemplate: 'mission-events/{mission_id}/{archive_at}.jsonl',

  // 行级归档（不是字段）
  archiveStrategy: 'row-batch',
  archiveQuery: (prisma) => prisma.agentPlaygroundMissionEvent.findMany({
    where: { mission: { status: 'COMPLETED', completedAt: { lt: ... } } },
  }),

  // 审计
  audit: true,
});
```

### 4.4 两种 LifecycleTarget 类型

```typescript
interface LifecycleTarget {
  name: string;
  policy: LifecyclePolicy;

  // 当前状态查询（给 inventory.service 用）
  collectStats(): Promise<TargetStats>;

  // 状态推进（给 lifecycle-manager 用）
  promote(tier: Tier): Promise<TransitionResult>;

  // 召回到上一态
  recall(id: string, toTier: Tier): Promise<void>;
}

// 字段级（现有 OFFLOAD_TARGETS 改造）
interface FieldOffloadTarget extends LifecycleTarget {
  kind: "field";
  table: string;
  field: string;
  uriField: string;
  threshold: number; // 单字段大小阈值
}

// 行级（新增，用于 mission_events）
interface RowArchiveTarget extends LifecycleTarget {
  kind: "row-archive";
  table: string;
  groupBy: string; // 'mission_id' / 'user_id' / etc.
  triggerCondition: string; // SQL 谓词
  deleteAfterArchive: boolean;
}

// TTL 清理（新增，用于 Redis cache / 通知）
interface TTLCleanupTarget extends LifecycleTarget {
  kind: "ttl-cleanup";
  medium: "redis" | "postgres";
  retentionDuration: string;
}
```

---

## 5. 数据库 schema

### 5.1 `storage_lifecycle_policies`（policy 注册表）

```sql
CREATE TABLE storage_lifecycle_policies (
  id              TEXT PRIMARY KEY,
  name            TEXT UNIQUE NOT NULL,         -- 'agent-playground-events'
  kind            TEXT NOT NULL,                -- 'field' | 'row-archive' | 'ttl-cleanup'
  config          JSONB NOT NULL,               -- 完整 policy 配置
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.2 `storage_objects`（每个对象的位置 + 状态）

```sql
CREATE TABLE storage_objects (
  id              TEXT PRIMARY KEY,             -- 业务 ID（mission-events:xxx）
  policy_name     TEXT NOT NULL REFERENCES storage_lifecycle_policies(name),
  current_tier    TEXT NOT NULL,                -- 'hot' | 'warm' | 'cold' | 'glacier'
  medium          TEXT NOT NULL,                -- 'postgres' | 'redis' | 'r2-standard' | 'r2-ia' | 'r2-glacier'
  uri             TEXT,                         -- R2 key 或 Postgres locator
  size_bytes      BIGINT,
  content_type    TEXT,
  hot_until_at    TIMESTAMP,                    -- HOT 期截止
  next_transition_at TIMESTAMP,                 -- 下次 cron 检查
  delete_after    TIMESTAMP,                    -- 应删除时间
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  -- 索引：cron 扫待迁移 / 待删除
  INDEX (next_transition_at) WHERE current_tier != 'glacier',
  INDEX (delete_after) WHERE delete_after IS NOT NULL,
  INDEX (policy_name, current_tier)
);
```

### 5.3 `storage_audit_log`（审计流）

```sql
CREATE TABLE storage_audit_log (
  id              TEXT PRIMARY KEY,
  object_id       TEXT NOT NULL,
  policy_name     TEXT NOT NULL,
  action          TEXT NOT NULL,                -- 'create' | 'transition' | 'recall' | 'delete' | 'failed'
  from_tier       TEXT,
  to_tier         TEXT,
  triggered_by    TEXT NOT NULL,                -- 'cron' | 'admin:user-uuid' | 'system'
  reason          TEXT,                         -- 'age-threshold' | 'manual' | 'gdpr-delete'
  size_bytes      BIGINT,
  duration_ms     INT,
  error           TEXT,
  occurred_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  INDEX (object_id, occurred_at DESC),
  INDEX (occurred_at DESC),
  INDEX (action, occurred_at DESC) WHERE action = 'failed'
);
```

---

## 6. 迁移引擎（Lifecycle Manager）

### 6.1 cron 主循环

```typescript
@Injectable()
class LifecycleManagerService {
  // 每 24h 跑一次（pg_advisory_lock 多实例同步）
  async runOnce() {
    for (const policy of await this.policies.listEnabled()) {
      const target = this.targets.resolve(policy.kind);
      const stats = await target.collectStats(policy);

      // 推进：HOT 过期 → WARM
      const hotExpired = await this.objects.findHotExpired(policy.name);
      for (const obj of hotExpired) {
        await this.transition(obj, 'warm');
      }

      // WARM → COLD / COLD → GLACIER 同理

      // 删除超期对象
      const expired = await this.objects.findDeleteExpired(policy.name);
      for (const obj of expired) {
        await this.delete(obj);
      }
    }
  }

  private async transition(obj: StorageObject, toTier: Tier) {
    const start = Date.now();
    try {
      // 1. 拷贝到目标 tier
      const newUri = await this.adapters[toTier].copy(obj);
      // 2. 更新 storage_objects 表
      await this.objects.update(obj.id, { current_tier: toTier, uri: newUri, ... });
      // 3. 删除原 tier 对象
      await this.adapters[obj.current_tier].delete(obj);
      // 4. 写审计
      await this.audit.write({ action: 'transition', from: obj.current_tier, to: toTier, ... });
    } catch (e) {
      await this.audit.write({ action: 'failed', error: e.message, ... });
      // 不抛 — 单对象失败不阻塞其他
    }
  }
}
```

### 6.2 透明读路径（`storage.get`）

```typescript
async get<T>(id: string): Promise<T | null> {
  const obj = await this.objects.findById(id);
  if (!obj) return null;

  const adapter = this.adapters[obj.current_tier];
  const content = await adapter.read(obj);

  // 命中冷数据 → 自动 promote 一档（"刚被读过的数据总是要再读"）
  if (obj.current_tier === 'cold') {
    void this.lifecycleManager.recall(id, 'warm'); // fire-and-forget
  }

  return JSON.parse(content);
}
```

---

## 7. 可视化 / 可管理 / 可监控 / 可审计

### 7.1 可视化（admin/storage 升级）

新增 4 个 tab（在现有的 Pipeline / Catalog / DB Footprint / Trend 基础上）：

| Tab                          | 内容                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| **Lifecycle Overview**（新） | 4 个大饼：Hot / Warm / Cold / Glacier 各占多少（按 size + by 数量） |
| **Policies**（新）           | policy 列表 + 启用/禁用开关 + 命中对象数                            |
| **Objects**（新）            | 单对象搜索（输入 ID 看完整轨迹）                                    |
| **Audit Log**（新）          | 时间倒序的 transition / recall / delete 流，带筛选                  |
| Pipeline                     | 现有：field offload 字段进度                                        |
| DB Footprint                 | 现有：DB 表占用                                                     |
| Trend                        | 现有                                                                |

### 7.2 可管理

- **手动促转**：单对象 / 单 policy 立即推进一档
- **手动召回**：把 R2 对象拉回 DB（Hot），用于 admin 调试
- **policy 编辑**：DB 里改 policy 的 `warmAfter` / `coldAfter`，下一轮 cron 生效（不要在文件里硬编码）
- **暂停 policy**：紧急时单击禁用某 policy（事故隔离）

### 7.3 可监控

暴露 Prometheus metrics（`/metrics` 端点）：

```
storage_objects_total{policy="agent-playground-events", tier="warm"} 87
storage_size_bytes{policy="agent-playground-events", tier="warm"} 99000000
storage_transitions_total{from="hot", to="warm", status="success"} 1234
storage_transitions_total{from="hot", to="warm", status="failed"} 5
storage_transition_duration_seconds_bucket{...}
storage_recall_total{...}
storage_orphans_deleted_total
```

告警规则（Grafana / Railway alerts）：

- `rate(storage_transitions_total{status="failed"}[1h]) > 0.05` → 迁移失败率 > 5%
- `storage_size_bytes{tier="hot"} > 5_000_000_000` → DB 热数据 > 5GB（提前预警）
- `time() - storage_last_run_timestamp > 86400 * 1.5` → cron 36h 没跑

### 7.4 可审计

`storage_audit_log` 表全量记录：

- **不可修改**：表设为只允许 INSERT，没有 UPDATE/DELETE 权限
- **保留期**：审计日志本身按 lifecycle 治理（5 年保留 → glacier → 删除），自举
- **导出 API**：`GET /admin/storage/audit/export?from=...&to=...&objectId=...&action=...` → CSV / NDJSON

---

## 8. 落地路径（PR 序列）

### Phase 1：抽象层重构（不改业务）

| PR        | 内容                                                                                                  | 工作量 |
| --------- | ----------------------------------------------------------------------------------------------------- | ------ |
| **PR-S1** | 新建 `ai-infra/storage/lifecycle/` + `audit/` + `monitoring/` 目录 + abstractions（接口定义，无实现） | 0.5 天 |
| **PR-S2** | 数据库 schema（3 张新表 + migration）                                                                 | 0.5 天 |
| **PR-S3** | `StorageFacade` + `LifecycleManagerService` 骨架 + cron skeleton（不接业务）                          | 1 天   |
| **PR-S4** | 现有 `storage-offload.service.ts` 改造为 `FieldOffloadTarget`（向后兼容，零业务改动）                 | 1 天   |

### Phase 2：mission_events 接入（关键收益）

| PR        | 内容                                                                         | 工作量 |
| --------- | ---------------------------------------------------------------------------- | ------ |
| **PR-S5** | `RowArchiveTarget` 实现 + mission_events policy 注册（30d 阈值）             | 1 天   |
| **PR-S6** | `MissionEventsService` 改造：`findByMission` 调用 `storage.get` 透明 hydrate | 1 天   |
| **PR-S7** | 一次性 backfill：把当前 90K 老 events 立刻归档到 R2                          | 0.5 天 |

### Phase 3：可观测性补齐

| PR         | 内容                                                                                | 工作量 |
| ---------- | ----------------------------------------------------------------------------------- | ------ |
| **PR-S8**  | `storage_audit_log` 接入 + 所有 transition / recall / delete 写审计                 | 0.5 天 |
| **PR-S9**  | `StorageMetricsService` Prometheus metrics + health check endpoint                  | 0.5 天 |
| **PR-S10** | admin/storage UI 升级：Lifecycle Overview / Policies / Objects / Audit Log 4 个 tab | 2 天   |

### Phase 4：扩展接入（按需）

- `notifications` → policy `'notifications-30d-archive'`
- `library/youtube_video_transcripts` 老视频字幕 → policy
- 用户头像 / library 资源 → R2 lifecycle policy（年龄超 1 年迁 IA）
- Redis cache 治理面板（TTLCleanupTarget 启动）

**总工作量估计**：Phase 1+2+3 约 **8.5 工作日**（含本 design + 实施 + 测试 + UI）

---

## 9. 风险与对策

| 风险                                | 影响                    | 对策                                                                   |
| ----------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| 透明 hydrate 失败 → 业务读到 null   | mission replay 突然空白 | adapter 失败时抛具体错（404 / timeout），业务侧 surface 错误，不静默吞 |
| cron 跨 pod 重复跑                  | 数据重复迁/双写         | 现有 `pg_advisory_lock` 模式继承                                       |
| backfill 90K events 一次跑挂掉      | 中途状态混乱            | 分批（每批 1000 行）+ 每批落 audit 记录 + 失败可断点续传               |
| policy 写错（warmAfter < hotUntil） | 数据被立即归档          | policy 注册时 zod 校验 + 单元测试                                      |
| R2 配额超                           | 上传失败                | metric 告警 + 业务侧 fallback 留 DB（不阻塞写）                        |
| GDPR 删除请求                       | 必须删除所有副本        | `storage.delete` 同步删 DB + R2 + 审计落"reason: gdpr"，不入 cron 异步 |

---

## 10. 与项目现有架构的关系

### 10.1 层级归属

按 CLAUDE.md L1-L4 分层：

```
L4 Open API
L3 AI Apps（research / playground / library）
                ↓ 调
L2.5 AI Harness（agent runtime）— 不直接消费 storage，通过 engine 桥
                ↓ 调
L2 AI Engine
                ↓ 调
L1 Infrastructure ← ★ storage facade 落在这里
```

业务（research / playground）import `from '@/modules/ai-infra/storage'`，绝不 import `from '@/modules/ai-infra/storage/adapters/r2-warm.adapter'` 直接路径。

### 10.2 与已有规范的兼容

- **Karpathy 简洁原则**：v1 只做 4 态，不做 EDGE / multi-region；预留接口位即可
- **MECE 原则**：lifecycle 只在 ai-infra/storage，不在 ai-engine 或 ai-harness 重新实现
- **不绕 facade**：业务一律走 `storage.facade.ts`，禁止穿透 `lifecycle/` 内部
- **TaskProfile 风格**：policy 用语义化字段（warmAfter: '30d'）而非硬编码秒数

### 10.3 与现有代码的迁移路径

- 现 `OFFLOAD_TARGETS` 13 个 target 一对一对应到 v1 的 `FieldOffloadTarget` 注册条目
- 现 `StorageOffloadService.runOnce()` 改名为 `LifecycleManagerService.runOnce()`，内部对 field-target 行为不变
- 现 `storage-inventory.service.ts` 数据源改为查 `storage_objects` 表（不再自己 SQL 算）
- 现 admin/storage UI 4 tab 保留 + 上面新增 4 tab

---

## 11. 验证标准（实施后必须满足）

完成 Phase 1+2+3 后，下列断言必须为真：

- [ ] `mission_events` 表 90 天前的行 < 1000 行（其余已归档到 R2）
- [ ] DB 总量在 mission 体量翻倍时**不**线性增长（受 lifecycle 控制）
- [ ] admin 任何对象搜索能在 < 200ms 看到 4 态分布 + 完整 audit 轨迹
- [ ] `storage.get('any-archived-id')` 透明返回数据，业务无感
- [ ] Prometheus 指标 `up` + cron 心跳 / 失败率全部接入告警
- [ ] 任意业务模块 grep 不到 `r2-warm.adapter` 等内部路径直接 import
- [ ] policy 配置可以在 admin 修改并 hot reload，不需要重启 pod

---

## 12. 后续讨论点（待评审）

1. **EDGE_HOT 是否在 v1 包含**：当前留扩展位但不实施。如果近期需要做 brand-config / feature-flag 边缘缓存，可一并 v1 上
2. **GDPR 删除链路**：需要法务确认保留期。当前 `deleteAfter: 5y` 是占位
3. **跨 pod cron 锁是否够强**：advisory lock 在 Pod 突然崩溃时的行为需要验证（是否会卡住）
4. **policy 表 schema 演进**：JSONB 全配置 vs 拆列，影响 admin UI 编辑体验
5. **mission_events 归档 zip vs JSONL**：JSONL 流式友好但体积稍大；zip 体积小但全或无
6. **是否需要 audit 表分区**：5 年保留期下日志单表会很大，按月分区是否提前规划

---

## 附录 A：术语对照

| 术语          | 含义                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Tier / 态     | 数据生命周期阶段（HOT / WARM / COLD / GLACIER）                            |
| Medium / 介质 | 实际存储位置（postgres / redis / r2-standard / r2-ia / r2-glacier）        |
| Policy / 策略 | 一组业务的 tier 转换规则（hotUntil / warmAfter / coldAfter / deleteAfter） |
| Target        | policy 的实施单位（field / row-archive / ttl-cleanup 三种）                |
| Transition    | tier 之间的迁移操作                                                        |
| Recall        | 反向迁移（COLD → WARM / WARM → HOT），admin 主动                           |
| Hydrate       | `storage.get` 时透明从冷介质拉回内存                                       |
| Backfill      | 一次性把存量数据按新 policy 归档                                           |

## 附录 B：当前 OFFLOAD_TARGETS → 新 policy 的映射

| 现有                                       | 新 policy 名                 | tier 推进                      |
| ------------------------------------------ | ---------------------------- | ------------------------------ |
| `topic_reports.full_report`                | `topic-reports-archive`      | hot 90d → warm                 |
| `dimension_analyses.data_points`           | `dimension-analyses-archive` | hot 30d → warm → cold 365d     |
| `research_tasks.result`                    | `research-tasks-archive`     | hot 30d → warm                 |
| `knowledge_base_documents.raw_content`     | `kb-documents-archive`       | hot until READY → warm         |
| `wiki_page_revisions.body`                 | `wiki-revisions-archive`     | append → warm immediately      |
| `wiki_diffs.items`                         | `wiki-diffs-archive`         | hot 30d → warm                 |
| `agent_playground_missions.report_full`    | `playground-mission-report`  | hot 30d → warm                 |
| `agent_playground_missions.{4 个 reports}` | 同上 policy                  | 同上                           |
| `mission_report_versions.report_full`      | `mission-report-versions`    | hot 30d → warm                 |
| **新增** `agent_playground_mission_events` | `playground-mission-events`  | hot 30d → warm（**关键收益**） |

---

**最后更新**: 2026-05-10  
**状态**: Draft v1.0，等待评审  
**审议人选**: 项目 owner / 一位资深架构 reviewer / 一位运维代表
