# 密钥引用机制彻底治理方案 v1.0

> 日期：2026-05-07
> 触发事件：Screenshot_5「Perplexity dialog 显示 Tavily 的 key」 (commit `53cb299cf`) 暴露的 7 大架构债
> 状态：**草案，待集体共识**

## 1. 问题陈述

修复 Screenshot_5 bug 时发现：**1 个工具的 secret 引用同时存在于 5+ 个地方**。这是设计问题不是 bug。

### 1.1 当前数据流（Perplexity 为例）

**写入 5 条路径**：

```
ConfigureModal "secret manager" mode
  → PATCH /admin/ai/tools/perplexity { secretKey: "perplexity-api-key" }
  → ToolConfig.upsert(toolId='perplexity', secretKey='...')
  → 历史上还 sync 到 ToolConfig(toolId='web-search', secretKey='...') ← 已修

ConfigureModal "direct input" mode
  → PATCH /admin/search-config { perplexityApiKey: "sk-..." }
  → 5 套 legacy endpoint 写另一组列

ConfigureModal "direct input" + 非 search 类
  → PATCH /admin/ai/tools/perplexity { config: { apiKey: "sk-..." } }
  → ToolConfig.config.apiKey 嵌入 plaintext

Secret Manager 直接添加
  → POST /admin/secrets { name, value, category }
  → Secret 表（多 KEY 系统下展开为 SecretKey 行）

User BYOK
  → /api/user/api-keys
  → UserApiKey 表
```

**读取 N 条路径**：每个 tool 执行器各自实现 fallback 链，用法不一。

### 1.2 已知 7 大架构问题（来自 2026-05-07 audit）

| #   | 问题                                                   | 现象                                                                                                                                            |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 5 重存储同时存在                                       | `Secret`/`SecretKey`/`ToolConfig.secretKey`(provider)/`ToolConfig.secretKey`(registry, 已部分清)/`ToolConfig.config.apiKey` + 5 legacy endpoint |
| A2  | Capability vs Provider 模型错配                        | `web-search` 等能力 row 物理上只有 1 个 secretKey 字段，挂 4 个 provider，last-write-wins                                                       |
| A3  | Provider/Registry 双 ID 双源同步表漂移                 | 前端 `PROVIDER_TO_TOOL_ID` (28) ≠ 后端 `TOOL_ID_ALIAS_TO_REGISTRY_ID` (21)                                                                      |
| A4  | Read-time inference 不是 write-time consistency        | bridge 在读路径推理填补                                                                                                                         |
| A5  | 3 种 KEY 来源（system / direct / BYOK）无统一 resolver | 每 tool 各自实现                                                                                                                                |
| A6  | Secret 删除无级联                                      | dangling references 不清理                                                                                                                      |
| A7  | ConfigureModal 仅 `secret.category` 过滤               | admin 设错 category 永不出现                                                                                                                    |

## 2. 目标态架构

### 2.1 北极星

> **1 个 secret 1 处定义、1 处引用、1 个 resolver。admin 改任何一处，运行时立即一致。**

### 2.2 模型简化

#### 保留

- `Secret`（物理 KEY 存储，加密，唯一权威）
- `SecretKey`（多 KEY fallback chain，归属某个 Secret）
- `UserApiKey`（BYOK，用户级）
- `ToolConfig`（tool 元数据 + secret 引用）

#### 改造

- **`ToolConfig.secretKey` 字段语义收紧**：仅 provider 维度的 row 可写；capability/registry id 的 row 该字段始终 NULL（DB CHECK constraint + service-level guard）
- **`ToolConfig.config.apiKey` 直接 plaintext 移除**：admin "direct input" 模式自动创建一个名为 `auto-${toolId}` 的 system Secret，引用回 `ToolConfig.secretKey = 'auto-${toolId}'`

#### 删除

- 5 个 legacy endpoint：`/admin/search-config` / `/admin/extraction-config` / `/admin/youtube-config` / `/admin/tts-config` / `/admin/skillsmp-config`
- `ToolConfig.secretKey` 在 capability/registry row 上的写入路径

### 2.3 单一权威：ToolApiKeyResolver

新模块：`backend/src/modules/ai-engine/credentials/tool-api-key-resolver.service.ts`

```typescript
export interface ResolvedKeyHandle {
  value: string;
  keyId: string | null; // SecretKey/UserApiKey row id（用于 markSuccess/Failure）
  source: "byok" | "system";
  secretName?: string; // 仅 source='system' 时有值（debug/audit 用）
}

export interface ToolApiKeyResolverOptions {
  /** 当前调用上下文，决定 BYOK 是否启用 */
  userId?: string;
  /** 如果用户偏好 = 'system-only'，跳过 BYOK 检查 */
  byokPolicy?: "prefer-byok" | "system-only" | "byok-only";
}

@Injectable()
export class ToolApiKeyResolver {
  constructor(
    private readonly secrets: SecretsService,
    private readonly secretKeys: SecretKeysService,
    private readonly userApiKeys: UserApiKeysService,
    private readonly toolConfig: ToolConfigService,
  ) {}

  /**
   * 给定 toolId（provider 或 registry 都行），返回当前请求该使用的 KEY value。
   * 内部 fallback 链：
   *   1. BYOK（按 byokPolicy 决定是否检查）
   *   2. ToolConfig.secretKey → SecretKeysService.getSecretKey()（多 KEY chain）
   *   3. legacy 表（过渡期，PR-S5 删除后此分支移除）
   */
  async resolve(
    toolId: string,
    options: ToolApiKeyResolverOptions = {},
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

**调用约定（所有 tool 执行器都遵守）**：

```typescript
const handle = await this.toolApiKeyResolver.resolve('perplexity', { userId });
if (!handle) throw new MissingApiKeyError(...);

try {
  const result = await callPerplexityAPI(handle.value);
  await this.toolApiKeyResolver.markSuccess(handle);
  return result;
} catch (e) {
  await this.toolApiKeyResolver.markFailure(handle, classifyError(e), e.message);
  throw e;
}
```

### 2.4 Provider/Registry ID 收敛

**backend `tool-id-aliases.ts` 是唯一真理表**。

新增 endpoint：`GET /admin/ai/tool-aliases` 返回完整 map。

前端 `useToolAliases()` hook 启动 1 次拉取 + cache。删除前端硬编码 `PROVIDER_TO_TOOL_ID`。

### 2.5 删除级联

`SecretsService.softDelete(name)` 内部触发：

```typescript
async softDelete(name: string): Promise<{ refsCleared: number }> {
  const cleared = await this.prisma.toolConfig.updateMany({
    where: { secretKey: name },
    data: { secretKey: null },
  });
  await this.secretKeys.softDeleteAllForSecret(name);
  await this.prisma.secret.update({
    where: { name },
    data: { deletedAt: new Date(), isActive: false },
  });
  await this.logAccess('SOFT_DELETE', { refsCleared: cleared.count });
  return { refsCleared: cleared.count };
}
```

### 2.6 ConfigureModal name-pattern 推荐

筛选可选 secret 时，新排序：

1. **★ exact match**：`secret.name === ${toolId}-api-key` 或 `secret.name` 含 `toolId`
2. **category match**：`secret.category === ${categoryFor(toolId)}`
3. **其他**：alphabetical

UI：exact match 加 ★ 标 + "推荐"徽章。

## 3. PR 序列规划

| PR    | 目标                                                               | 范围                                                                                              | 风险 | 依赖        |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---- | ----------- |
| PR-S0 | 收敛 alias map 单源                                                | `GET /admin/ai/tool-aliases` + `useToolAliases()` + 删前端 `PROVIDER_TO_TOOL_ID` 硬编码           | 低   | —           |
| PR-S1 | 实现 `ToolApiKeyResolver` 入口（不切 callsite）                    | 新模块 + spec；BYOK > system secret > legacy 三段；adapter 模式让旧/新共存                        | 中   | —           |
| PR-S2 | 切换 30+ tool callsite 到 resolver                                 | 逐个 tool 执行器改造；每改一个加 spec；保留 feature flag 可回退                                   | 高   | PR-S1       |
| PR-S3 | Secret 删除级联 + admin UI 警告                                    | `secretsService.softDelete()` 改造 + reference scanner + 前端确认对话框                           | 低   | —           |
| PR-S4 | ConfigureModal name-pattern 推荐                                   | 纯前端 UI，按 toolId 模糊匹配 + ★ 排序                                                            | 低   | —           |
| PR-S5 | 删 5 个 legacy endpoint + 数据迁移到 Secret 表                     | search-config/extraction-config/...；migration 把 `*ApiKey*` 列搬进 Secret + ToolConfig.secretKey | 高   | PR-S2       |
| PR-S6 | 删 `ToolConfig.config.apiKey` 直接嵌入；direct input → auto-secret | service 改造 + migration 抽出现有 config.apiKey 转 Secret                                         | 中   | PR-S2       |
| PR-S7 | DB CHECK constraint：capability/registry id 行 secretKey 必为 NULL | schema migration + service guard                                                                  | 低   | PR-S2/S5/S6 |

**总工作量估算**：6-8 周（按 1 名工程师全职计）

**部署顺序**：S0 / S1 / S3 / S4 (4 个低风险 PR 可并行) → S2 (高风险，分多个 sub-PR per tool category) → S5 / S6 / S7 (清理收尾)

## 4. 关键设计决策点

### D1. 直接输入 (direct input) 模式存与不存？

- **保留**：admin 临时调试方便；但需要 auto-create secret 抽象（PR-S6）
- **删除**：所有 KEY 必走 Secret Manager；UI 多 1 步操作但模型干净
- **决议**：保留，但内部走 auto-secret，外部 UX 不变

### D2. BYOK vs system 优先级

- 默认 `prefer-byok`：用户配了就优先用，没配就用 system
- 用户可在 profile 切到 `system-only` 或 `byok-only`
- 默认值需要在 PR-S1 spec 中明确

### D3. Migration 数据策略

PR-S5 删 5 legacy endpoint 时：

- **方案 A 暴力**：所有 `*ApiKey*` 列 → Secret 表 1:1 迁移；ToolConfig.secretKey 自动指向；老列删除
- **方案 B 渐进**：保留老列只读，写路径切到 Secret，2 周后再删老列
- **决议**：B 更安全，但工程量大

### D4. Capability row 的 secretKey 字段保留还是删

- **保留 + CHECK constraint = NULL**：schema 不动，靠运行时约束（PR-S7）
- **删除字段**：DB schema 变更，需 migration drop column
- **决议**：保留 + constraint，避免破坏性 schema 变更

### D5. PR-S2 callsite 改造策略

- **方案 A 一次性**：1 个大 PR 改完所有 30+ 处
- **方案 B 按 category**：search/extraction/youtube/... 各自独立 PR
- **方案 C feature flag**：双路径并存 + 灰度
- **决议**：B（最务实，回归面分散）

## 5. 反向证据 / 自我审视

实施前已识别风险：

1. **PR-S2 改动面巨大**：30+ tool callsite，回归面大。缓解：B 方案分批 + 每批独立 spec
2. **Direct input 命名空间冲突**：admin 同时配 system secret 和 direct input → auto-secret 名字（如 `auto-perplexity`）和 admin 命名（如 `perplexity-api-key`）共存，UI 要清晰区分
3. **BYOK 启用判定**：用户没显式 opt-in 但有 user key 时，是否默认用？需 D2 明确
4. **Migration 顺序敏感**：S5 必须等 S2 完全切换；S2 的 feature flag 要保留到 S5 验证完
5. **测试策略不足**：单元 spec 不够，需要 e2e 流程（admin 配 → 运行时调用 → KEY 命中正确）
6. **Secret 软删后同名重建**：admin 删了 perplexity-api-key 又重建同名，原 ToolConfig.secretKey 已 SET NULL，不会自动重连。**这是 feature 不是 bug**：删除是显式操作，重建后 admin 应主动重新绑定
7. **DB 约束选择**：CHECK constraint 引用其他表（is multi-provider parent？）在 PostgreSQL 中要走 trigger 或应用层 guard，CHECK constraint 本身不能跨表查询

## 6. 不在本方案范围

- 多租户隔离（org-level secret namespace）
- KMS 集成（当前是应用层加密）
- Secret rotation 自动调度
- 审计日志查询 UI

## 7. 决议历史

- v1.0 (2026-05-07)：初稿，待集体评审
