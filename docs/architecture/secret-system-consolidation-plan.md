# 密钥体系收敛重构专项 —— 方案（待评审）

> 目标（用户 2026-05-29 明确）：理清整个密钥体系，**架构清晰、最佳实践**。一套存储模型理念 +
> 一个解析入口 + 一套多 Key UI + 一致的字段/失败/健康语义。
> 性质：**高 blast radius**（动全用户取 key 运行时 + 可能动生产数据），必须独立计划 + 独立多路检视 + 分波次。
> 不与功能开发混做。状态：**待评审，未动工**。创建 2026-05-29。

---

## 0. 现状全景（已读代码核实）

### 0.1 五处"key 概念"散落

| #   | 存储/机制                 | 归属                                                          | 多 Key                | 失败/健康                           | 加密            | 解析入口                                            | UI                                                               |
| --- | ------------------------- | ------------------------------------------------------------- | --------------------- | ----------------------------------- | --------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `secrets` + `secret_keys` | admin（userId=NULL）+ **本次新增** BYOK 用户行（userId=用户） | ✅ priority+5min 熔断 | testStatus/lastErrorCode/lastUsedAt | envelope v2     | `SecretKeysService.getSecretKey`                    | `SecretKeysDrawer`+`MultiKeyTable`（admin + 本次 BYOK 工具复用） |
| 2   | `user_api_keys`           | BYOK LLM（PERSONAL）                                          | ✅ label+KeyChain     | `KeyHealthStore` 熔断 + DB 回写     | v1 CBC + v2 GCM | `KeyResolverService.resolveKeyChain`                | `UserApiKeyDrawer`（适配成 MultiKeyTable）                       |
| 3   | `user_credentials`        | BYOK 工具（PR-3 新表，**本次已基本架空**，0 行）              | ❌                    | testStatus                          | envelope v2     | `UserSecretsService.getUserSecretValue`（回退路径） | 无（已并入 secrets 抽屉）                                        |
| 4   | `key_assignments`         | 管理员授权给用户的 key（ASSIGNED）+ 配额                      | n/a                   | accessCount/spend                   | —               | `KeyAssignmentsService` + KeyResolver ASSIGNED 分支 | admin 授权 UI                                                    |
| 5   | `authorization_grants`    | 工具授权（TOOL_GRANT，允许用户走 admin key）                  | n/a                   | —                                   | —               | `ToolKeyResolverService` step2                      | 授权申请/审批 UI                                                 |

### 0.2 两套解析器（运行时取 key）

- **LLM**：`KeyResolverService`（PERSONAL→ASSIGNED，KeyChain failover + KeyHealthStore，严格 BYOK 不回退 SYSTEM）。成熟、复杂、与 assignments/health 深耦合。
- **工具**：`ToolKeyResolverService`（用户 key→授权 admin→byokMode FALLBACK/STRICT）。本次已让它 dual-read user-scoped secrets。
- **系统/后台**：`ai-model-config.resolveApiKey` 的 SYSTEM 分支直查 secrets（无 userId 上下文）。

### 0.3 债务清单（"来回"的根因）

1. **概念重复**：同一个"API key"散在 secrets/user_api_keys/user_credentials 三表 + assignments，字段语义各异（priority 有的有有的无、lastErrorCode 有的有、加密 v1/v2/HKDF 混用）。
2. **两套多 Key 实现**：secret_keys 的 pickActiveKey vs user_api_keys 的 KeyChain/KeyHealthStore——同一个"failover+熔断"写了两遍，行为细节不一致。
3. **两个前端入口**：`/me/api-keys`（本次接了双抽屉）+ `/me/models`（UserApiKeyDrawer）+ 历史 `/me/tools`。
4. **命名债**：`donated` 实为 `ASSIGNED`（getDonatedKey/donate 端点早删，枚举/sourceMap 残留）。
5. **过渡债（本次新增，需有下线路径）**：ToolKeyResolver dual-read、UserSecretsService.list 的 legacy secrets 读、user_credentials 空表保留。
6. **加密多版本**：v1 CBC（master）/ v2 GCM（envelope）/ per-user HKDF 三套并存，decryptAny 分派；PR-4/PR-5 计划下线 legacy（见 [[project_byok_tool_key_redesign_2026_05_28]]）。

---

## 1. 关键架构岔路（请你拍）

"架构清晰"有两种合法终态，blast radius 与收益差别很大：

### 方案 A：收敛到一张存储表（`secrets`/`secret_keys` 统一）

把 user_api_keys + user_credentials 全部并入 `secrets`/`secret_keys`，用 `scope(system|user)` + `kind(llm|tool|...)` 区分，一个 `SecretKeysService` 统管多 Key+熔断，一个 UI。

- **优点**：概念最少、真正"一套表一套码"。
- **代价/风险**：必须把 LLM 的 `KeyChain`/`KeyHealthStore`/`key_assignments`（配额、ASSIGNED 来源、LastGood、in-memory 熔断）全部在 secret_keys 上**重建**——这正是本次 BYOK 我判定"高危、叫停迁移"的东西。assignments 的配额计费模型与 secret_keys 不同构，强行合并会很别扭。**生产 user_api_keys≈20 + 历史 assignments 需迁移**。

### 方案 B（推荐）：分层存储不变，**统一访问层 + UI + 语义**

保留按"关注点"分的存储（系统 secrets / 用户 LLM keys / 授权 assignments），但：

- **一个解析门面 `KeyResolverFacade`**：对调用方只暴露 `resolve(kind, identity, userId) → KeyChain`，内部按 kind 路由到现有专用解析器。工具与 LLM 的 failover/熔断**抽成共享原语**（pickActiveKey/circuit-breaker 一份实现，两边复用）。
- **一套多 Key UI**：`MultiKeyTable` 已是共享组件（admin + BYOK 工具 + LLM 抽屉都用它）；把三个抽屉收敛成一个 `KeyManagerDrawer`（按 kind 注入 hook）。
- **字段/状态语义对齐**：priority/testStatus/lastErrorCode/lastUsedAt/accessCount 在三处统一含义与命名。
- **命名归一**：donated→assigned（枚举 + sourceMap + 文案），不动 personal/system。
- **过渡债下线**：dual-read、legacy secrets 读、user_credentials 空表，定明确删除触发条件。
- **优点**：保留各自成熟特性（LLM 的 assignments/health 不动），blast radius 可控（门面是新增层，旧路径渐迁），符合"关注点分离"的最佳实践。
- **代价**：仍是多表（但访问层统一，调用方看到的是一套）。

> 我的建议：**B**。理由：A 的唯一额外收益是"少几张表"，但代价是重建 LLM 那套经过生产打磨的 KeyChain/health/assignments，正是 blood-lesson 区。B 用"统一门面+共享原语+一套 UI+语义对齐"达到"架构清晰"，且每一步可独立验证、可回退。若你要极致单一，可把 B 作为 A 的第一阶段（先统一访问层，未来再评估底层合表）。

---

## 2. 目标架构（按方案 B）

```
调用方（ai-app / runtime）
        │  只依赖一个门面
        ▼
KeyResolverFacade.resolve({ kind, identity, userId }) → KeyChain（统一 failover 协议）
        ├── kind=llm    → KeyResolverService（user_api_keys + assignments + KeyHealthStore）
        ├── kind=tool   → ToolKeyResolverService（user-scoped secrets + 授权 + byokMode）
        └── kind=system → secrets（userId=NULL，后台无 user 上下文）
        ▲
        共享原语：pickActiveKey(priority+5min熔断) / markSuccess / markFailure / 健康回写
        共享 UI：KeyManagerDrawer + MultiKeyTable（按 kind 注入 useKeys hook）
        统一语义：priority / testStatus / lastErrorCode / lastUsedAt / accessCount
```

---

## 3. 分波次（每波独立可交付 + 多路检视 + 可回退）

- **W0 盘点冻结**：精确列出每个解析器的全部调用方（grep resolveKey/resolveToolKey/getValueInternal/getSecretKey）、各表行数、加密版本分布。产出消费方矩阵（无此不开工）。
- **W1 共享 failover 原语**：把 pickActiveKey+熔断+健康回写抽成 `KeyHealthCore`，secret_keys 与 user_api_keys 两路改为复用（行为对齐，先不改存储）。
- **W2 解析门面**：`KeyResolverFacade` 收口三路解析，调用方逐个迁到门面（旧入口保留 deprecated）。
- **W3 前端收敛**：三抽屉→`KeyManagerDrawer`；`/me/api-keys` 与 `/me/models` 入口去重。
- **W4 语义/命名归一**：字段语义对齐 + donated→assigned（含 migration + sourceMap）。
- **W5 过渡债下线**：删 dual-read / legacy secrets 读 / user_credentials（依赖 PR-4 backfill 完成确认）。
- **W6（可选，仅当选 A）**：底层合表 + LLM 特性在 secret_keys 重建 + 数据迁移。

## 4. blast radius 控制（硬约束）

- 每波只动"一层"，旧路径保留到新路径验证通过；门面/原语用大量单测锁行为等价。
- 运行时取 key 改动必须有：熔断/优先级/failover 集成测试 + 灰度（env flag 切换新旧解析）。
- 任何动生产数据的波次（W4 命名 migration / W6 合表）独立 PR + 部署门控 + 可回滚脚本。

## 5. 待你拍的决策

1. **A 还是 B**？（我荐 B；A 可作为 B 之后的远期）
2. **donated→assigned 命名归一**是否纳入本专项（涉及枚举/DB/前端文案，中等改动）？
3. **起步范围**：先做 W0 盘点 + W1 共享原语（最安全、零存储变更、立刻减少"两套熔断"债），还是要我直接把 W0–W3 的完整设计细化到文件级？
