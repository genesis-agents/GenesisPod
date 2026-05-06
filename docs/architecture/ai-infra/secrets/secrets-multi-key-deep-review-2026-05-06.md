# Secret 多 KEY 端到端深度代码检视（2026-05-06）

> **范围**：用户要求 "100% 业务分支仿真推理，包括前后台" — 对 P1+P2+P3 落地的 7 笔 commit 做穷举式分支走查。
> **结论**：核心逻辑正确，已在检视中识别并修复 1 处中危 bug（BYOK panel 状态 stale），其余为低危观察 / 后续优化点。
> **深度**：覆盖 backend service/controller/DTO/migration + frontend hook/component/page 全部 50+ 业务分支。

## TL;DR — 检视后的修复

| commit      | 严重度 | 修复内容                                                    |
| ----------- | ------ | ----------------------------------------------------------- |
| `c6babd703` | 中     | BYOK panel 解耦 — 防止父子组件 hook 实例独立导致 stale 数据 |

## 一、Backend 检视

### 1.1 SecretKeysService（multi-key 核心服务）

| 方法                               | 分支                                    | 走查结论                                                                                                                                                         |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listKeys(secretId)`               | secret 不存在 / 软删                    | requireSecret 抛 NotFoundException ✅                                                                                                                            |
|                                    | 0 keys                                  | 返回 `[]` ✅                                                                                                                                                     |
|                                    | N keys                                  | priority asc → createdAt asc 排序 ✅                                                                                                                             |
| `addKey(secretId, dto, ctx)`       | secret 不存在                           | requireSecret 抛 ✅                                                                                                                                              |
|                                    | label dup（同 secret 下）               | ConflictException ✅                                                                                                                                             |
|                                    | priority 未传                           | 默认 0 ✅                                                                                                                                                        |
|                                    | isActive 未传                           | 默认 true ✅                                                                                                                                                     |
|                                    | context 为 undefined                    | createdBy/updatedBy 为 null ✅                                                                                                                                   |
|                                    | value 长度 1-7                          | makeHint 返回 `••••••••`（短 key 不暴露） ✅                                                                                                                     |
| `updateKeyMeta(keyId, dto, ctx)`   | key 不存在                              | 抛 ✅                                                                                                                                                            |
|                                    | label change → dup                      | ConflictException ✅                                                                                                                                             |
|                                    | label 与 existing 相同                  | 跳过 dup 检查（避免误报） ✅                                                                                                                                     |
|                                    | dto 全 undefined                        | 仅 updatedBy 写入（无害空操作） ⚠️ low                                                                                                                           |
| `replaceKeyValue(keyId, dto, ctx)` | key 不存在                              | 抛 ✅                                                                                                                                                            |
|                                    | 同一 plaintext 重新加密                 | 不同 IV，不同密文（OK，等价于 rotation） ✅                                                                                                                      |
|                                    | testStatus 自动 reset 为 null           | 强制下次 test/调用回写 ✅                                                                                                                                        |
| `deleteKey(keyId, ctx)`            | key 不存在                              | 抛 ✅                                                                                                                                                            |
|                                    | hard delete                             | 行直接消失 ✅                                                                                                                                                    |
|                                    | 无 SecretAccessLog 记录                 | ⚠️ **审计 gap**（admin 操作 key 级别无审计；secret 级别有）— 后续 P4+                                                                                            |
| `testKey(keyId, ctx)`              | decrypt 成功                            | testStatus=success, lastTestedAt=now ✅                                                                                                                          |
|                                    | decrypt 失败（加密 key 漂移）           | testStatus=failed, lastErrorMessage="decryption failed" ✅                                                                                                       |
|                                    | **真实 provider call 未实现**           | ⚠️ **P1 占位**（reason 含 "provider health check pending P3"）                                                                                                   |
| `getSecretKey(name)`               | secret 不存在 / !isActive / 软删 / 过期 | null ✅                                                                                                                                                          |
|                                    | pickActiveKey null（0 active key）      | dual-track fallback 读 Secret.encryptedValue ✅                                                                                                                  |
|                                    | pickActiveKey 命中                      | decrypt → return {value, keyId, label} ✅                                                                                                                        |
|                                    | 全部 KEY in failed window               | pickActiveKey 兜底返回 first（让业务自然恢复 markSuccess） ✅                                                                                                    |
|                                    | failed but window expired (>5min)       | 重新使用该 KEY ✅                                                                                                                                                |
|                                    | priority 同值                           | createdAt asc 决定（稳定排序） ✅                                                                                                                                |
|                                    | decrypt 失败                            | warn log + return null（不重试其他 KEY）⚠️ **fallback 未级联** — 设计意图是熔断已通过 testStatus，decrypt fail 视为加密配置错误，不应 fallback；如需级联可未来加 |
| `markSuccess(keyId)`               | 写入成功                                | testStatus / lastTestedAt / accessCount++ ✅                                                                                                                     |
|                                    | key 不存在（concurrent delete）         | Prisma 抛 P2025；调用方应忽略此错误 ⚠️ **未防御**，但概率极低                                                                                                    |
| `markFailure(keyId, msg)`          | msg < 500 chars                         | 原样写入 ✅                                                                                                                                                      |
|                                    | msg ≥ 500 chars                         | 截断到 500 ✅                                                                                                                                                    |
|                                    | msg 含特殊字符 / 多行                   | TEXT 列直接存（无注入风险） ✅                                                                                                                                   |
| `pickActiveKey 内部`               | 5min 熔断窗口                           | `FAILED_CIRCUIT_BREAK_MS = 5 * 60 * 1000` 写死 — 后续可走配置                                                                                                    |

### 1.2 SecretsService（扩展后的现存服务）

| 方法                              | 分支                                                                     | 走查结论                                                          |
| --------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `create(dto, ctx)`                | prisma.secret.create 成功                                                | dual-write addKey 'primary' ✅                                    |
|                                   | dual-write addKey 抛错                                                   | `.catch` warn log，主流程不受影响 ✅                              |
|                                   | secret.create 失败（name dup 等）                                        | 不进入 dual-write ✅                                              |
|                                   | secretKeys 未注入（spec 旧场景）                                         | `if (this.secretKeys)` 跳过 ✅                                    |
|                                   | dto.value 含 unicode / null bytes                                        | EncryptionService 处理 ✅                                         |
| `update(name, dto, ctx)`          | existing 不存在 / 软删                                                   | NotFoundException ✅                                              |
|                                   | dto.value 提供 + 'primary' 存在                                          | replaceKeyValue ✅                                                |
|                                   | dto.value 提供 + 无 'primary'                                            | addKey ✅                                                         |
|                                   | dto.value === ""                                                         | 视为未提供，不动 SecretKey ✅                                     |
|                                   | dual-write 抛错                                                          | `.catch` warn，主 update 成功 ✅                                  |
| `getValueInternal(name)`          | secretKeys 未注入                                                        | 走 legacy 单 KEY 路径 ✅                                          |
|                                   | secretKeys getSecretKey 返回 {value, keyId}                              | 返回 value + bookkeeping ✅                                       |
|                                   | secretKeys getSecretKey 返回 {value, keyId: null}（dual-track fallback） | 仍返回 value ✅                                                   |
|                                   | secretKeys getSecretKey 返回 null                                        | 走 legacy 路径（兜底） ✅                                         |
|                                   | bookkeeping 失败                                                         | `.catch(() => undefined)` 静默 ⚠️ **counters 可能漂移**，但非关键 |
| `markSecretSuccess/Failure(name)` | secretKeys 未注入                                                        | 早返回 ✅                                                         |
|                                   | 解析返回 keyId=null（legacy）                                            | `if(...keyId)` 假，no-op ✅（正确：无 SecretKey 行可标）          |
|                                   | 解析返回 keyId 字符串                                                    | 调 SecretKeysService.markSuccess/Failure ✅                       |

### 1.3 Migration（20260506d_secret_keys_multi）

| 分支                                             | 走查结论                                        |
| ------------------------------------------------ | ----------------------------------------------- | ------ | --- | ------------ | --------------------------------------------------------------- |
| 首次运行                                         | CREATE TABLE + 3 索引 + INSERT...SELECT 回填 ✅ |
| 重跑（idempotent）                               | IF NOT EXISTS / WHERE NOT EXISTS 全程保护 ✅    |
| 软删 secret（deletedAt IS NOT NULL）             | INSERT 跳过 ✅                                  |
| 已存在 'primary' 行（dual-write 早于 migration） | NOT EXISTS 子查询跳过 ✅                        |
| 复合 ID `'sk\_'                                  |                                                 | s."id" |     | '\_primary'` | cuid 25 chars + 12 prefix/suffix = 37 chars，TEXT 列不限长度 ✅ |
| 并发跨节点运行                                   | Prisma migrate 串行；不可能并发 ✅              |
| ON DELETE CASCADE                                | 删除 Secret 自动级联删除 secret_keys ✅         |

### 1.4 Controller（admin SecretKeysController）

| 分支                                                                   | 走查结论                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 全 endpoint JwtAuthGuard + AdminGuard                                  | ✅                                                                                                                                 |
| Throttle 写操作                                                        | add/replace/delete/test 有限流 ✅                                                                                                  |
| GET list / PATCH meta 无 throttle                                      | 读和元信息更新风险低 ✅                                                                                                            |
| 路径冲突 `/admin/secrets/:secretId/keys` vs `/admin/secrets/:name/...` | NestJS 按精确后缀匹配，`/keys`、`/value`、`/logs`、`/versions` 均独立 ✅                                                           |
| `:secretId` 参数语义混淆（实际接受 cuid，但参数名不强制）              | 无校验；管理员前端必传合法 cuid，弱后台调用方可能传 name → SecretKeysService 内部 requireSecret 用 `id` 字段查找 → 找不到抛 404 ✅ |

### 1.5 DTO 校验

| 分支                                     | 走查结论                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| label `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$` | 字母数字开头 + 字母数字/下划线/横线 1-100 字符 ✅                                          |
| label 含中文 / 空格                      | 拒绝（pattern 不匹配） ✅                                                                  |
| value 1-8192 chars                       | 一般 API key 远小于 8192 ✅                                                                |
| value 全空白字符串                       | MinLength(1) 通过，但语义无意义 ⚠️ **low** — 后续可加 `@IsNotEmpty()` 去除 trim 后空字符串 |
| priority -1 / 1000                       | class-validator 拒绝 ✅                                                                    |

## 二、Frontend 检视

### 2.1 useSecretKeys hook

| 分支                            | 走查结论                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| secretId null                   | keys=[], 不 fetch ✅                                                                                                 |
| secretId 切换（drawer 重用）    | useEffect 触发重新 load ✅                                                                                           |
| API 抛错                        | setError + 保留旧 keys ⚠️ **未在 UI 显示** — 用户看不到错误原因（如 dup label）                                      |
| addKey/replace/delete/test 失败 | `setActionLoading(false)` 后错误冒泡 → MultiKeyTable handler 内 `await` 静默吞噬 ⚠️ **handler 应 try/catch + toast** |

### 2.2 MultiKeyTable

| 分支                             | 走查结论                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 空 keys + !loading               | "No keys configured" ✅                                                                                  |
| loading 中                       | "Loading…" ✅                                                                                            |
| readOnly                         | 无 Add 按钮，无 Actions 列 ✅                                                                            |
| Add：empty label / value         | 按钮 disabled ✅                                                                                         |
| Add：label 含特殊字符            | 后端 DTO 拒绝；前端无校验 → 提交后报错（依赖后端反馈）⚠️ **UX 弱**                                       |
| 同时 edit + replace 同一行       | `isEditing` / `isReplacing` 互斥（else if 链） ✅                                                        |
| Delete 确认                      | window.confirm 阻塞确认 ✅                                                                               |
| StatusBadge 全 4 态              | Disabled / OK / Failed / Unknown 覆盖 ✅                                                                 |
| fmtRelative null                 | "—" ✅                                                                                                   |
| 行内 Edit 时该 key 被外部 delete | editingId 滞留；下次刷新后行消失，editingId 仍指向已删 ID（无害），下次操作前会被新 setEditingId 覆盖 ✅ |

### 2.3 SecretKeysDrawer

| 分支              | 走查结论                              |
| ----------------- | ------------------------------------- |
| secret null       | 返回 null（不渲染） ✅                |
| 背景遮罩点击      | onClose ✅                            |
| X 按钮            | onClose ✅                            |
| provider 字段缺省 | 不渲染 provider 徽章 ✅               |
| ESC 键关闭        | ❌ **未实现** — 良好交互应支持 ⚠️ low |

### 2.4 SecretsStatusOverview

| 分支                          | 走查结论                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 搜索（NAME / displayName）    | 大小写不敏感 ✅                                                                                                              |
| Category 筛选                 | 全 15 类别下拉 ✅                                                                                                            |
| Status 筛选                   | 仅 active / disabled — 因为当前 STATUS 来源 `Secret.isActive`（旧字段）⚠️ P4 待聚合 SecretKey.testStatus 才有 failed/unknown |
| 列头排序（name / status）     | toggle asc/desc ✅                                                                                                           |
| 全选 / 行选 checkbox          | Set 状态管理 ✅                                                                                                              |
| Test Selected / Test All 按钮 | ❌ **未实现** — 设计文档 §4.5.0c 提到的 batch test，目前只有 checkbox 选择，没接 endpoint ⚠️ medium，P4 待补                 |
| 空筛选结果                    | "No secrets match the current filters." ✅                                                                                   |

### 2.5 SecretsPage（admin）

| 分支            | 走查结论                          |
| --------------- | --------------------------------- |
| Tabs 切换       | local state，切回保留筛选/选中 ✅ |
| Add Secret 按钮 | 仅 Key Management tab 显示 ✅     |

### 2.6 BYOK UserApiKeyMultiKeyPanel

| 分支                   | 走查结论                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 父子组件 hook 独立实例 | ❌ **bug 已修** `c6babd703` — 改 props 注入                                                                            |
| 默认折叠               | 进入 BYOK 页只显示 "Manage multiple keys (N)" 链接 ✅                                                                  |
| Add（label, value）    | 走父 saveKey → 父 refresh → 子 props 更新 ✅                                                                           |
| Replace value          | 走父 saveKey 同 label → 覆盖 ✅                                                                                        |
| Delete                 | 走父 deleteKey + label → DELETE :provider?label=X ✅                                                                   |
| Edit meta              | 留空（`handleUpdate` 空实现）→ MultiKeyTable Edit 按钮仍显示但点击无效 ⚠️ **UX gap**：BYOK 应隐藏 Edit 按钮            |
| Test                   | 留空（BYOK test endpoint 需要 plaintext key，UI 没有）⚠️ **设计选择** — 用户用 Replace 覆盖；通过被动 markFailure 反馈 |
| priority 列            | 恒 0（UserApiKey schema 无 priority；KeyChain 走 lastGood 调度） ✅                                                    |

### 2.7 UserApiKeysTab 集成

| 分支                                            | 走查结论                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Panel 渲染时机                                  | ProviderKeyCard expanded 时才渲染（不浪费 fetch） ✅                |
| getKeysForProvider 排序                         | label asc ✅                                                        |
| 单 provider 多个用户                            | UserApiKey schema `@@unique([userId, provider, label])` 隔离 ✅     |
| 同一用户同一 provider 一个 active 一个 inactive | KeyChain pickActiveKey 跳过 inactive ✅（参考 useUserApiKeys 逻辑） |

## 三、Spec 覆盖分析

| 模块                    | 现有 spec              | 覆盖率（approx）                                                                                       |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| SecretKeysService       | 12 tests（2026-05-06） | 80% — fallback 顺序 / 熔断 / dup label / dual-track 兜底全覆盖；缺 testKey 边界 + markSuccess 计数累加 |
| SecretsService 扩展     | 8 tests（新加）        | 90% — 委托 / 双写 / mark / dual-write 失败容忍全覆盖                                                   |
| SecretsController       | 既有 spec 通过         | 行为未变 ✅                                                                                            |
| Migration SQL           | 无 spec                | ⚠️ **migration 无单测**（与项目惯例一致；通过 Railway 灰度验证）                                       |
| MultiKeyTable           | 无 spec                | ⚠️ **frontend spec gap** — 后续 P4 可加 RTL 测试                                                       |
| SecretsStatusOverview   | 无 spec                | 同上                                                                                                   |
| UserApiKeyMultiKeyPanel | 无 spec                | 同上                                                                                                   |

## 四、安全检视

| 维度                                       | 检视结论                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| 加密算法                                   | AES-256-CBC（与 SecretsService 共享 EncryptionService），IV 32 hex chars 独立存储 ✅ |
| keyHint 只显示 head 3 + tail 4，不参与解密 | 不暴露足够信息让攻击者反推 ✅                                                        |
| getValueInternal 加访问审计                | lastAccessedAt + accessCount ✅                                                      |
| controller 全 admin 权限                   | JwtAuthGuard + AdminGuard 双保险 ✅                                                  |
| BYOK 仅自己的 key                          | userId scope 在 service 层强制 ✅                                                    |
| 写操作 throttle                            | 防 DOS 创建大量 key ✅                                                               |
| 日志不打 plaintext                         | 仅 logger.log secret name + label，不打 value ✅                                     |
| dual-write 异常吞噬                        | warn log；不影响主流程；不泄密 ✅                                                    |
| markFailure 错误 msg 截断 500              | 防大对象塞日志 ✅                                                                    |
| SQL 注入                                   | 全 Prisma ORM，无字符串拼接 ✅                                                       |
| XSS（前端）                                | React 默认转义 keyHint / lastErrorMessage；无 `dangerouslySetInnerHTML` ✅           |

## 五、性能检视

| 维度                        | 检视结论                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| listKeys 索引               | `@@index([secretId, isActive, priority])` 命中 ✅                                                          |
| pickActiveKey 索引          | 同上 ✅                                                                                                    |
| getValueInternal N+1        | 多调用同一 secret 时每次走 fallback chain；高频场景可加 cache layer（KeyHealthStore 已有命名空间，未来扩） |
| dual-write extra round-trip | create() / update() 多 1 次 SecretKey insert/update；可接受 ✅                                             |
| BYOK panel 折叠时不渲染     | useApiGet 不触发 fetch ✅                                                                                  |

## 六、多 session 协作

| 维度                                              | 检视结论                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| commit `301e35e1e` 意外吸入 per-dim-pipeline 文件 | 已与用户确认接受现状（属另一 session 的合理改动）                                                                          |
| lint-staged stash 风险                            | 多次出现，已记忆在 `feedback_lint_staged_pulled_other_session_2026_05_06`                                                  |
| `assume-unchanged` flag 异常                      | 本次发现 secrets.service.ts 被某进程标记 → 导致 commit b25ee21ca 漏改动；已 `--no-assume-unchanged` 修复并补提 `301e35e1e` |

## 七、剩余待办（按优先级）

### High（P4，1-2 周内）

1. **Edit/Test 按钮在 BYOK panel 隐藏**（UX gap）：MultiKeyTable 加 `hideEditMeta`、`hideTest` props
2. **useSecretKeys 错误 toast**：addKey/replace/delete/test handler 加 try/catch + toast.error
3. **状态总览 tab 接 SecretKey.testStatus 聚合**：当前只显示 isActive；应显示 OK/Failed/Unknown 4 态

### Medium

4. **状态总览 tab Test Selected / Test All 按钮**：连 admin testKey endpoint
5. **删除 SecretKey 加 SecretAccessLog 审计**
6. **MultiKeyTable label 前端校验**：与 DTO pattern 同步，提交前提示

### Low（P5+）

7. **Drawer ESC 关闭**
8. **testKey 真实 provider call**：当前是 decrypt 占位
9. **DTO value `@IsNotEmpty` after MinLength**
10. **KeyHealthStore 抽象统一**（DistributableKey + SecretKey 共用命名空间）
11. **Frontend spec for MultiKeyTable / Drawer / Panel**
12. **P4 cleanup**：观察 1-2 周后删 `secrets.encrypted_value/iv/key_version` 列 + dual-write 代码

## 八、检视方法学

本检视采用：

1. **代码 + spec 反向对照**：先读实现，再读 spec，对比覆盖
2. **分支穷举**：每个 method 列 happy / error / edge 分支至少 3 条
3. **数据流追踪**：UI → hook → endpoint → service → DB → response → re-render 完整链路
4. **多场景 simulation**：dual-track 阶段 / migration 重跑 / 多 session race / 加密漂移 / 网络中断
5. **安全 + 性能 + 可维护性**三维交叉
