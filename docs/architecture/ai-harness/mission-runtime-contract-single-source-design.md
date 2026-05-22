# Mission Runtime 契约单一真源 — Harness 平台层系统设计（权威）

**日期**: 2026-05-22
**作者**: Claude Code（综合 Codex 平台层诊断 + 本会话运行时实证 + Radar/Social 跨 app 勘探）
**状态**: 设计待评审（架构大决策；评审通过后分波次实施）
**适用范围**: 全部 mission 型 AI app — **agent-playground / AI Radar / AI Social**，以及未来任何跑在同一 harness 上的 mission app（writing / report / …）
**定位**: 本文件是 **mission runtime 平台语义的单一真源（single source of truth）**。任何 mission app 涉及"配置 / 预算 / 时间 / 状态 / 失败 / abort / rerun / 存活"的实现，以本文件契约为准；与本文件冲突的散落实现一律视为待迁移的技术债。

---

## 0. 一句话

把 **mission 的真实配置、真实预算、真实时间、真实状态、真实失败原因、真实 abort 语义、rerun 真输入、存活回收** 从"每个 app 各自发明 + 多处投影"收口为 **ai-harness 平台层的类型化 canonical 契约**，并建立**多层看护机制**强制所有 mission app 消费同一套契约——使系统**结构上不可腐朽**，而非靠人自觉。app 只声明业务语义（depth 档位 / style / leader 业务态 / UI）。

---

## 0.5 五路集体评审共识与 v2 修订决议（2026-05-22）

> 设计阶段经 5 路并行评审（architect / migration-reviewer / red-team / harness-fact-check / Codex）。结论一致：**方向对（这是 harness contract 缺口，不是 playground 局部 bug），但 v1 有若干"换皮保留多源 / 固化错误 / 看护可绕"的硬伤，不补则落地后 canonical 体系仍能被 app 绕开。** 以下为采纳的修订决议，**优先级高于下文 v1 正文与之冲突处**。

### R-BLOCKER（必须先解决，否则不实施）

**RB1. 先收口"终态写权限"（单一 terminal-transition owner）——提为 P0 前置项。**
v1 致命缺陷（Codex#1 + red-team M4 + architect）：MissionFailure 由 dispatcher 写、liveness-guard 兜底写、AbortReason 由 controller/stage/framework 多处产生，而"谁有权把 mission 从 running 推到 terminal"直到 C7/P2 才提 lifecycle-manager。→ P0 上线后只是把"多源 message"升级成"多源 canonical code"，**核心承诺不成立**。
**修订**：P0 第一步 = `MissionLifecycleManager` 成为**唯一终态写入口**；所有 dispatcher/liveness/abort 只能**提交终态意图**给它，由它用 **DB 条件写**（`UPDATE … WHERE status='running' AND failure_code IS NULL`）做原子仲裁（首个写入者赢，后续 no-op）。先有单写 owner，再谈 canonical enum，否则枚举也照样竞争。

**RB2. 不要把 `CREDITS_TO_USD=0.002` 当"单一真源"——它是已被代码证明错误的假设。**
red-team B1 + architect M1：真实成本是逐模型的 `ai-engine/llm/pricing/model-pricing.registry.ts`（从 DB 逐模型单价），而 cap 用平的 `×0.002`；跑 Opus vs Haiku 同 credits 真实 USD 差 10×。v1 要把 0.002 封进 harness 唯一常量 + L3 grep 禁任何其它换算 = **用看护机制锁死错误并禁止修正**（SoT 最危险失败模式）。
**修订**：(a) `maxCostUsd` cap 明确改名/标注为 **`creditBudgetProxyUsd`（额度代理值，非真实成本）**，文档与字段注释都写明"这是 credits 的粗略闸，真实成本以 `ModelPricingRegistry`/`BudgetAccountant` 为准"；(b) **不 grep 禁 pricing 路径**；(c) C3 拆成 C3a 平台换算（credits→tokens，平台额度语义）+ C3b 真实成本（复用 ai-infra pricing 单一源，与既有 `no-hardcoded-pricing.spec.ts` 对账，不另立）。

**RB3. conformance 必须"harness 不认识 app 名"——否则撞既有红线 R0-A5。**
architect B1：`layer-boundaries.spec.ts:600-712` 禁 harness 文件（含注释）出现 `playground/social/radar` 等业务名。v1 的 `assertMissionAppConformance(appModule)` 若让 harness 枚举每个 app → 立即红。
**修订**：app **自报 namespace 字符串**注册；harness 启动期只断言"已注册集合非空 + 每个注册项满足接口/注册了 liveness/cancel 接线"，**不硬列 app 名**。conformance 是"对任意注册项的不变量",非"对具体 app 的清单"。

**RB4. 裁决 harness 内已存在的第二套 heartbeat/ownership——否则是"又加一层"非"消除多源"。**
architect B2 + fact-check：harness 已有 (a) `MissionLivenessGuard`+DB 心跳（per-app 注册）与 (b) `MissionRuntimeStateStore` Redis 心跳（`podId/startedAt`/TTL90s）两套；`MissionOwnershipRegistry` 也已是一等公民却不在 v1 契约集。
**修订**：契约集**增 ownership 域**；明确裁决 DB 心跳 vs Redis 心跳谁权威谁退场（建议 Redis 作活性探测、DB 作回收依据，二选一写死职责），写进 §4。

**RB5. `MissionConfigSnapshot.businessInput` 不能是 opaque blob——否则 row+JSON 多源换成 snapshot 内部多源。**
Codex#2：opaque blob 下 app 仍可漏字段/改名/在 rebuilder 暗自 fallback，平台无法做 completeness 校验与 schema 迁移守护。
**修订**：snapshot 的序列化/反序列化升为 **adapter 显式 schema 契约**（app 声明 `businessInputSchema`(zod) + serialize/deserialize），harness 据此做完整性校验 + 版本迁移；businessInput 不再是无类型 blob。

**RB6. social 真停必须解决 S8 半发布原子性——否则产生不可撤销外部副作用。**
migration BLOCKER-3：`s8-publish-execute` 是唯一外部副作用 stage（微信草稿 API 无删除接口）；cancel 在 S8 进行中触发 → 半发布、平台后台残留。
**修订**：abort 采 **gate-before-stage** —— S8 一旦进入即不可中途 abort（signal 在 S8 入口检查：未进入则拒绝进入，已进入则等其完成再落 cancelled）；§11 测试矩阵增"cancel 发生在 S8 前/中"两分支。

**RB7. DB 弃旧两步 + 读优先 feature flag——否则回滚不可逆。**
migration BLOCKER-4：`wallTimeMs` DROP COLUMN 不可逆 + 无 flag 切回旧读路径。
**修订**：`canonical-read-priority` feature flag 控制读新/旧；弃旧拆 Step A（停写旧字段，可秒回滚）/ Step B（DROP，人工、备份后、≥30 天观察，绝不进自动迁移脚本）。

### R-MAJOR（采纳，调整设计）

- **RM1 看护重心从 grep 移到类型（make illegal states unrepresentable）。** red-team M2/M5 + Codex#4：grep 禁字面量可被等价改写平凡绕过（`const r=0.002`、`x*2/1000`、别名 enum），且 `wallTimeMs` 全仓 297 处/40 文件含 harness 自身 → 全仓禁令必逼出大量白名单 → 守护失效。**修订**：L1 为主——`ResolvedBudgetCaps` 私有构造+只能由工厂产出+readonly（别处拿不到原料散落）；abort 签名收 enum（传字符串 tsc 红）；snapshot 工厂。L3 grep **降级**为"仅扫 budget 目录 + 白名单 + 仅对新增代码 + 带 deadline"，不全仓即时封死。L4 ESLint 全仓 rule 取消（误伤大）。
- **RM2 conformance 分"静态可验" vs "需集成测试"。** red-team M3 + migration MINOR-2：静态只能查存在性（且 social 假停恰是"abort 出现在错的地方"→ 静态会误判合格）。**修订**：liveness 注册=静态可验（保留）；cancel 真停 / 失败写 canonical = **集成测试**（发 mission→cancel→断言 budget 停增/signal.aborted），写进 §11。
- **RM3 C9 落点纠正（保持 app 层）。** architect B3：`STAGE_NUMBER_CONTRACTS` registry 在 app 层是**正确**的（哪个 stage 约束哪个值是 app 业务，上提违反 R0-A5）；只有 primitive `assertNumberProducerWithinSchema` 在 harness。**修订**：§4.9/§5 改为"primitive 在 harness、registry 各 app 自持"，删"radar/social 登记进 harness 注册表"的错误表述。
- **RM4 ConfigSnapshot patch 语义裁决。** red-team M6："冻结+只读"与 rerun `patch?` 冲突。**修订**：rerun 带 patch → **生成新 snapshot（schemaVersion/parentSnapshotId 链）**，不就地改；run/rerun 各自只读"自己那次"的 snapshot。
- **RM5 C2 必须含 agent-level→mission-level 映射表 + 穷尽测试。** architect M3：已有 `failure-extraction.utils.ts` 大写 string code；C2 小写 enum。**修订**：映射表作为 C2 一部分 + "任何新增 agentCode 未映射即红"测试；`FailureCategory/Source` 若无消费场景则砍到 `code+message`。
- **RM6 C7 牵动 `IMissionStore` 端口（completed≠succeeded），blast radius 重估。** architect M5 + fact-check：**修订**：不改 `status` 字面量（保 `completed`），只**新增 `terminalOutcome` 层**，降风险。
- **RM7 social 缺 heartbeat 列。** fact-check A3：social_missions 无 `heartbeatAt` 列。**修订**：C8 对 social 需"先加列再注册 adapter"。
- **RM8 config_snapshot 依赖统一 `MissionRecord<T>`。** fact-check A6 + migration MAJOR-2：三 app store 现返回各自 Prisma 类型。**修订**：C5 前置"统一 MissionRecord 契约"，否则 snapshot 无处安放。
- **RM9 迁移期"双语义窗口"风险（Codex#3）。** v1 先改 C3/C4 字段+协议、P1 才上 Rebuilder，却让 legacy rebuilder 跨整个波次存活读新字段。**修订**：C6 Rebuilder（统一重建入口）**与 C4/C5 同波次或先行**，避免旧重建逻辑读新字段 fallback 错误；缩短双语义并存窗口。
- **RM10 补平台语义路线图：** idempotency（启动/rerun 幂等键防 double-spend）、mission lifecycle **event payload canonical schema**（现 `payload: unknown`）、`rerun-lock` 并发契约归位（architect M6）——至少进 P2/P3 路线图。BYOK/计费明确"归 ai-infra，不另立"。

### R-战略（最重要的一条，决定要不要现在做这件大事）

**RS1. 把"真缺陷修复"从"平台契约收口"里拆出来，前者立即做、后者评审后分波次。**
red-team B2 + Codex 简评一致：整套 9 契约 + 七层看护 + 3 app + DB 迁移，与本会话**真正让你抓狂的"报告质量差(minFindings/章节)"完全正交**（§12 明确划在范围外）。而真正高价值且**立即可做、零新抽象、零 DB 迁移**的只有两个现成缺陷修复：

1. **radar/social 注册 liveness adapter**（各加 ~1 处 `registerAdapter`，guard 现成）——治"孤儿 running 行永不回收"。
2. **social cancel 真停**（`cancelTask` 加 `abortRegistry.abort(id)` + dispatcher `abortMission`，registry 现成）——治"取消后继续烧预算"。
   **决议**：这两项作为**独立 hotfix（P0-now）立即修**，不等平台重构；C2–C7 的契约/枚举/值对象/迁移作为**平台收口（P0-platform 起）**评审通过后分波次。避免用宏大重构挤占并拖延两个一行级真修复。

---

## 0.6 治理模型 / 权力边界（v3，Codex 第二轮评审）

> 第二轮共识：**对象模型（该收口什么）已清楚，治理模型（谁有最终写权 / 谁能改 snapshot / 谁能 patch / 谁验证接入语义）还不够硬。** 不补这些"权力边界"，最终会得到"canonical 类型都在、adapter 都接了，但业务层仍能绕开/覆盖/补丁化平台语义"——看起来平台化、实际仍脆弱。以下 6 条治理决议**优先级最高**，是 §4 对象契约能否真生效的前提。

**G1. 终态状态机（写权 + 最小值域）提到 P0 最前，先于 C1/C2/C8。**（Codex#1）
v2 把 C7 放 P2，但 C2 failure / C8 liveness / C1 abort 的正确性都依赖"终态推进语义已统一"。底层仍是各 app 状态机时，P0 只能"附加 canonical 字段"，做不到单一真源——产出"failure_code 对、status 仍各写各"的**伪收敛**。
**决议**：P0 第 0 步 = 定义平台**最小 `MissionLifecycleStatus` 值域** + **唯一终态写入口**（`MissionLifecycleManager`，承接 RB1 的 DB 条件写仲裁）。**先有"谁能写终态 + 终态值域"，再上 C1/C2/C8**。C7 的"三层状态"其余部分（presentation 聚合）可留 P2，但"终态写权 + 最小值域"必须 P0 前置。

**G2. Snapshot 写路径治理：任何影响 rerun 的配置改动都必须重写 versioned snapshot。**（Codex#2）
v2 只管住"读路径"（run/rerun/resume/hydrate 读 snapshot），没管"写路径"。terminal 后 PATCH budget / 用户改 rerun 参数 / app retry patch / controller override 若只改 row/JSON 不改 snapshot → rebuilder 读到旧 snapshot。
**决议**：立 **versioned mutation contract** —— snapshot 只能由 `openSession()` 与少数**显式声明的 mutation 入口**产出/更新；**任何改动 rerun 相关配置的路径必须生成新 versioned snapshot（schemaVersion++ / parentSnapshotId 链），禁止旁路改 row/JSON 而不改 snapshot**。看护：arch 断言"mission 配置字段的写入只允许发生在 snapshot 工厂内"。

**G3. Rebuilder `patch` 必须是 canonical patch schema，不得 app 自由扩展。**（Codex#3）
v2 的 `buildForXxx(snapshot, patch?)` 没定义 patch 约束 → app 各自扩 patch 语义 → "平台 builder 一套 + 业务层再套一层" 双主脑。
**决议**：定义 **`MissionInputPatch` canonical schema**（白名单：哪些字段可 patch、哪些必须走 app 业务层）；**应用顺序钉死**：`snapshot → apply canonical patch → policy re-resolve（budget/limits 重解析）`，不允许 "snapshot-resolved → patch-final" 的旁路。patch 越权字段 → 编译期/校验期红。

**G4. 两级 conformance：wiring（静态）+ behavioral（集成语义）。**（Codex#4）
v2 的 L5 只是"接线检查"（实现 adapter / 注册 liveness / 调了 abort / 写了 failure），挡不住"接了但语义错"（abort reason 乱传、rebuilder patch 越权、heartbeat 刷新点不对、failure category 瞎映射）。
**决议**：L5 拆两级。**L5a wiring conformance（静态）**：注册存在性（治漏注册，保留）。**L5b behavioral conformance（集成测试套件）**：发真 mission → cancel → 断言 signal.aborted + budget 停增 + 终态=cancelled + reason 正确；rerun → 断言 patch 不越权 + 重解析正确；制造预算耗尽 → 断言 failureCode/category/source 映射正确；制造静默 → 断言 liveness 回收。**无 L5b 的接入视为未接入**。

**G5. Rollout 隔离：per-app adapter version + canonical-read opt-in flag，否则"逐 app"是假隔离。**（Codex#5）
v2 风险缓解只写"先 playground 再逐 app",但 C3/C4 改的是**平台级共享命名/单位**——harness 一旦切 canonical,其它 app 被动受影响,"逐 app"在代码层未必真隔离。
**决议**：(a) **per-app adapter version**（harness 同时支持 legacy adapter 与 canonical adapter，app 按自己节奏切）；(b) **`canonical-read-priority` per-app feature flag**（读路径按 app 灰度切）；(c) harness canonical 与 legacy **并行供给一个完整波次**，最后一个 app 切完才移除 legacy。没有这三者，C3/C4 不得开工。

**G6. 平台 terminal outcome 只保 {success, failure, cancelled}——`quality_rejected` 移出平台 enum。**（Codex#6）
v2 把 `quality_rejected` 放进 `MissionTerminalOutcome` 平台 enum,但有些 app 根本没有"质量拒绝"这个终态(或它是业务 gate/retry state 而非 terminal)。平台内建它 = 又把业务模型预设进平台。
**决议**：`MissionTerminalOutcome = { success, failure, cancelled }`(纯平台);`leader_signoff_rejected` 这类**留在 `failureCode` / app 级 `businessOutcomeCode`**。平台 enum 不再吸入任何业务语义。

### 治理模型一句话

**对象模型解决"收口什么",治理模型解决"谁有权改它"。** 没有 G1–G6 的权力边界,§4 的 9 个 canonical 对象会变成"类型都在、却人人能绕"的漂亮空壳。因此实施次序硬性规定:**G1(终态写权)→ G2(snapshot 写治理)→ G3(patch schema)→ 再上对象契约 C1–C8 → G4(behavioral conformance)贯穿 → G5(rollout 隔离)护航**。

---

## 1. 背景、定级、范围

### 1.1 这是一类系统级病（不是单点 bug）

同一运行时语义在"生产方 / 消费方 / 持久化 / 前端 / 跨 app"各定义一份 → 漂移。已实证实例（见 §2 全景表）：

- 预算换算 `×1000 / ×0.002` 数学只在 harness framework 一处，但 3 个 app 又各自发明了**第二套估算**（playground 400K token 基线 / social `0.05×平台` USD / radar 静态 50）→ 单位与口径漂移，local rerun guard 甚至把 credits 当 USD 比。
- wall-time：`wallTimeMs` 字段在 **social 表=实测耗时**、**radar 表=配置上限**——**跨 app 同名异义**；playground 同表内 cap/elapsed 也曾混。
- 失败原因：真因 `budget_exhausted` 被层层改写成 `cancelled` 再成"失联/pod 重启"；social 自己 inline 4 个 failureCode **却不落库**；radar 纯 message 正则。
- abort：`MissionAbortRegistry.abort(id, reason?: string)` 裸字符串；**social 的"取消"根本不调 abort，正在跑的 mission 不真停，继续烧预算**（功能缺陷，非仅风格）。
- 配置快照：input → row+JSON → rerun 重拼 → hydrate 重拼 → 前端再拼（playground 5 处）；social retry 从 task 表重拼；radar 用 payload blob。
- 存活回收：**radar / social 都建了 `heartbeatAt/podId` 列和 `[status,heartbeatAt]` 索引，却都没注册 liveness adapter** → 心跳写了没人扫 → 孤儿 `running` 行永不回收（radar store JSDoc 甚至虚假宣称"Liveness guard 扫描"）。

> 只要 writing / radar / social / report 等都跑在同一 harness 上，这些坑必然复现。**这是平台 contract 缺口，必须在 harness 收口。**

### 1.2 关键前提：harness 平台层"半成品已在"，三 app 已复用框架

设计**不是从零建地基**：

| 已存在（harness）                                                                                       | 文件                                                                          | 三 app 复用情况                                     |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `MissionRuntimeShellFramework`（lifecycle runtime：wallTimer/heartbeat/abort/cleanup + 建 budget pool） | `ai-harness/teams/business-team/lifecycle/mission-runtime-shell.framework.ts` | **playground / radar / social 全部经 adapter 复用** |
| `MissionBudgetPool`（`maxTokens=credits×1000`、`maxCostUsd=credits×0.002`）                             | `ai-harness/guardrails/budget/mission-budget-pool.ts`                         | 三者全用（池机制）；但**估算/换算各写一套**         |
| `MissionAbortRegistry`                                                                                  | `ai-harness/lifecycle/mission-lifecycle/abort-registry.ts`                    | reason=裸字符串；radar 真接、**social 不接**        |
| `MissionLivenessGuard`（孤儿回收）                                                                      | `ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts`    | **仅 playground 注册 adapter**；radar/social 漏注册 |
| `mission-store.interface` / lifecycle-manager / runtime-state-store / rerun primitive                   | `ai-harness/lifecycle/mission-lifecycle/*`                                    | rerun primitive **三 app 都没用**                   |

**核心判断**：adapter 模式是对的。缺的是 **把 adapter 的输入输出做成类型化 canonical 契约**，并让 framework / pool / registry / guard 成为这些契约的唯一产出/消费点 + **强制每个 app 实现 adapter conformance**。P0 大多是"提升已有散落值为 canonical + 改消费方"，非 greenfield。

### 1.3 范围边界

- **本设计覆盖**：mission runtime 的 8 类平台契约（§4）+ 已落地的 stage-boundary 契约机制（§4.9）+ 看护机制（§7）。
- **本设计不覆盖**（留各 app 业务层，§12）：depth 档位名、budgetProfile 文案、style/audience/searchTimeRange、leader 签字业务解释、维度工具矩阵、章节/字数业务契约、页面交互。

---

## 2. 现状全景（跨 app 证据表）

> 来源：本会话 playground 实证 + Radar/Social 只读勘探（file:line 见各 app 适配清单 §6）。

| 契约域             | agent-playground                                             | AI Radar                                          | AI Social                              | 漂移程度                           |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| Lifecycle 框架     | ✅ framework                                                 | ✅ framework                                      | ✅ framework                           | 低（已统一）                       |
| BudgetPool 机制    | ✅ pool                                                      | ✅ pool                                           | ✅ pool                                | 低（已统一）                       |
| **预算估算/换算**  | 400K token 基线 × mult                                       | 静态 50 / 10                                      | `0.05×平台×factor` USD                 | **高（三套）**                     |
| **status 值域**    | 5 态 + quality-failed + starting 占位                        | 5 态(running/completed/failed/cancelled/rejected) | 实写 3 态(注释写 4) + 并行 task 状态机 | **高（不一致）**                   |
| **failureCode**    | dispatcher 分类 + BUDGET_EXHAUSTED（本会话加，未 canonical） | 纯 message 正则                                   | inline 4 码**不落库**                  | **高（无 canonical）**             |
| **abort/cancel**   | 真停 + signal.reason 分类                                    | 真停（session.missionAbort）                      | **假停（不调 abort，不真停）**         | **高（功能缺陷）**                 |
| **wall-time 字段** | 注释澄清(本会话)                                             | `wallTimeMs`=上限 + `durationMs`=实测             | `wallTimeMs`=实测（与 radar 同名异义） | **高（二义+跨 app 冲突）**         |
| **配置快照**       | input→row+userProfile，5 处重拼                              | payload JSON blob + 启动时从 topic hydrate        | 类型化列 + retry 从 task 表重拼        | **高（无 canonical snapshot）**    |
| **rerun/resume**   | 完整子系统（自建，未用 harness primitive）                   | 业务重刷                                          | 重拼 DTO 全新跑                        | **高（都不用 harness primitive）** |
| **liveness 注册**  | ✅ 注册 adapter                                              | ❌ 漏注册（孤儿不回收）                           | ❌ 漏注册（孤儿不回收）                | **高（缺陷）**                     |

---

## 3. 分层原则

```
Harness 平台层（mission runtime 语义；所有 mission app 共享；强约束 + 看护）
  canonical 类型 + framework/pool/registry/guard 产出&消费它们
  ──────────────────────────────────────────────
        ▲ adapter（每 app 实现 + conformance 测试强制）
  ──────────────────────────────────────────────
ai-app 业务层（每 app 自己的业务语义；不上提）
  depth 档位 / budgetProfile 文案 / style / audience / searchTimeRange
  leader 签字业务解释 / 工具矩阵 / 章节字数契约 / UI 展示交互
```

**MECE 红线（看护机制强制，§7）**：

1. harness 不认识 `depth=quick|deep`，只接收解析后的 `ResolvedRuntimeLimits` / `ResolvedBudgetCaps`。
2. 任何地方禁止 `credits×0.002` / `credits×1000` / `×0.05` 等估算换算散落 —— 只能读 `ResolvedBudgetCaps` / 调 canonical estimator。
3. 歧义字段 `wallTimeMs` 全栈禁用；拆 `wallTimeCapMs`（上限）/ `elapsedWallTimeMs`（耗时）。
4. failure/abort 只认 canonical enum；app 仅可在"映射到平台终态"处扩展业务态。
5. 每个 mission app **必须**注册 liveness adapter + 实现 abort 真停 + 实现 rerun policy（缺一者 conformance 测试红）。

---

## 4. 完整 canonical 契约清单（平台单一真源）

> 9 类。每类给：**现状 → 目标 → 产出方 → 消费方 → 落点 → 红线**。命名/字段为建议，评审定稿。

### C1 `MissionAbortReason`（enum）— P0

- 现状：`abort(id, reason?: string)` 裸串；radar 传 `"user_cancelled"`，social 不传，playground dispatcher 字符串比对。
- 目标：`enum MissionAbortReason { user_cancelled, budget_exhausted, wall_time_exceeded, mission_row_missing, superseded, orchestrator_shutdown }`
- 产出：所有 abort 调用方（s\*预算 stage / framework wallTimer / controller cancel）传 enum。
- 消费：dispatcher 按 enum→终态映射；不再字符串 if。
- 落点：`abort-registry.ts` 改签名 `abort(id, reason: MissionAbortReason)`。
- 红线：禁止裸字符串 abort reason（看护 §7-L3）。

### C2 `MissionFailure`（failureCode + category + source，enum 组）— P0

- 现状：失败原因来自 abort reason / markFailed message / liveness 兜底 / 前端 banner / app 手拼；无 canonical；social inline 4 码不落库；radar 纯 message。harness 已有**agent 级** taxonomy（`tracing/observability/failure-extraction.utils.ts`）但未升 mission 级。
- 目标：
  ```ts
  enum MissionFailureCode {
    user_cancelled,
    budget_exhausted,
    wall_time_exceeded,
    mission_row_missing,
    leader_signoff_rejected,
    provider_error,
    runtime_crashed,
    unknown,
  }
  enum FailureCategory {
    cancellation,
    budget,
    time,
    quality,
    infra,
    provider,
    unknown,
  }
  enum FailureSource {
    runtime,
    liveness,
    business_gate,
    persistence,
    provider,
  }
  interface MissionFailure {
    code: MissionFailureCode;
    category: FailureCategory;
    source: FailureSource;
    message: string; /*human*/
  }
  ```
- 产出：dispatcher 写 canonical；liveness-guard **仅在 failureCode 尚空时**兜底（不得覆盖已有 code）。
- 消费：DB 落 `failure_code/category/source`（三 app 表都加列）；前端**永远优先**按 code 出文案。
- 落点：`ai-harness/lifecycle/mission-lifecycle/abstractions/mission-failure.ts`（新）；复用既有 agent 级 taxonomy 做映射。
- 红线：app 不得用裸 message 表达失败类别；liveness 不得覆盖已有 code。

### C3 `ResolvedBudgetCaps` + `MissionCostEstimator`（值对象 + 端口）— P0

- 现状：换算 `×1000/×0.002` 只在 framework；但 3 app 各发明估算（400K / 0.05×平台 / 静态）。
- 目标：
  ```ts
  interface ResolvedBudgetCaps {
    maxCredits;
    maxTokens;
    maxCostUsd;
    budgetMultiplier;
    source: "default" | "override" | "inherited";
    resolvedAt: ISO;
  }
  // 唯一换算常量 + 估算端口
  const CREDITS_TO_TOKENS = 1000;
  const CREDITS_TO_USD = 0.002;
  interface MissionCostEstimator {
    estimate(businessSignals): { credits: number };
  }
  ```
- 产出：harness 唯一 `resolveBudgetCaps(credits, multiplier, source)`（含唯一换算数学）；各 app 实现 `MissionCostEstimator`（业务信号→credits），但**换算→caps 一律走 harness**。
- 消费：budget pool / rerun guard / UI DTO（`GET /budget-tiers` 的 capUsd）/ event payload / diagnostics 全读 caps。
- 落点：`ai-harness/guardrails/budget/resolved-budget-caps.ts`（新）；`MissionBudgetPool` 改消费它。
- 红线：删全栈 `×0.002 / ×1000 / ×0.05` 散落；禁止把 credits 当 USD。

### C4 `ResolvedRuntimeLimits` + `MissionLifecycleMetrics`（值对象，含 wall-time 拆字段）— P0

- 现状：`wallTimeMs` 二义且跨 app 同名异义。
- 目标：`interface ResolvedRuntimeLimits { wallTimeCapMs; maxIterations?; maxConcurrentAgents? }` / `interface MissionLifecycleMetrics { elapsedWallTimeMs; iterations? }`
- 落点：harness abstractions；**三 app DB 手写迁移**：明确区分 cap 列与 elapsed 列（radar `wallTimeMs`→`wallTimeCapMs`、`durationMs`→`elapsedWallTimeMs`；social `wallTimeMs`(实测)→`elapsedWallTimeMs` + 新增 `wallTimeCapMs`）；event/DTO/UI 跟改名。
- 红线：全栈禁用裸 `wallTimeMs`。

### C5 `MissionConfigSnapshot`（值对象）— P1

- 现状：playground 5 处重拼；social retry 从 task 表重拼；radar payload blob。
- 目标：
  ```ts
  interface MissionConfigSnapshot {
    schemaVersion;
    resolvedAt;
    topic;
    language;
    // ★ RB5 修订：不是 opaque blob。app 声明 businessInputSchema(zod) + serialize/
    //   deserialize 显式契约，harness 据此做完整性校验 + 版本迁移。
    businessInput: AppBusinessInput; // 受 app 声明的 schema 约束，非无类型 blob
    budget: ResolvedBudgetCaps;
    runtimeLimits: ResolvedRuntimeLimits;
    sourceMissionId?;
  }
  ```
- 产出：`openSession()` 解析一次 + 持久化（三 app 行加 `config_snapshot` JSONB + version）。
- 消费：run/rerun/resume/hydrate **一律只读 snapshot**。
- 落点：harness abstractions + store interface 扩 `config_snapshot`。

### C6 `MissionInputRebuilder`（service）— P1

- 现状：playground 自建 rerun 子系统；social 重拼 DTO；radar 业务重刷；**都不用 harness rerun primitive**。
- 目标：`buildForFreshRun / buildForFullRerun(snapshot,patch?) / buildForIncrementalRerun(snapshot,checkpoint,patch?) / buildForLocalRerun(snapshot,targetStage,patch?)`，全部从 `MissionConfigSnapshot` 还原。
- 落点：`ai-harness/lifecycle/mission-lifecycle/rerun/`（已有目录，扩 rebuilder）。
- 红线：app 不得自己拼 budget/time/status 敏感字段。

### C7 `CanonicalMissionState`（三层状态）— **拆波次**（G1：终态写权+最小值域 P0 前置 / presentation P2）

- 现状：DB 状态值域三 app 不一（radar 5/social 3）；playground `starting` 占位 + `quality-failed` 当可读完成；其它模块 legacy 全大写。
- 目标三层（★ G1/RM6 修订）：
  ```ts
  // 平台状态机：不改既有 IMissionStore 的 status 字面量（保 'completed' 不改 'succeeded'），仅约束最小值域
  enum MissionLifecycleStatus { starting, running, completed, failed, cancelled }
  // ★ G6 修订：平台 terminal outcome 只保这三个，不含 quality_rejected（业务语义不上提）
  enum MissionTerminalOutcome { success, failure, cancelled }
  interface MissionPresentationState { ... }                                      // 前端聚合（P2）
  ```
- **波次（G1）**：「**唯一终态写入口 `MissionLifecycleManager` + 最小 `MissionLifecycleStatus` 值域**」**提到 P0 第 0 步**（先于 C1/C2/C8）；`MissionTerminalOutcome` 层随 P0；`MissionPresentationState` 前端聚合留 P2。
- 红线：平台 lifecycle/outcome **不掺业务语义**——`quality-failed`/leader 拒签 → 留 `failureCode`/app 级 `businessOutcomeCode`（G6），不进平台 enum。

### C8 `MissionLivenessContract`（强制注册）— P0（缺陷修复）

- 现状：radar/social 建了 heartbeat 列却没注册 liveness adapter → 孤儿行永不回收。
- 目标：harness 提供 `registerMissionLiveness(adapter)`；**conformance 测试要求每个 mission app 必须注册**（否则红）。
- 落点：`ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts` + 看护 §7-L5。

### C9 Stage-boundary 契约机制（已落地，纳入单一真源）— DONE

- 本会话已建：`assertNumberProducerWithinSchema` + `STAGE_NUMBER_CONTRACTS` 注册表（playground）。
- 纳入本文件：作为"生产方范围 ⊆ 消费方 schema"的平台测试基元；后续 radar/social 的 stage→agent 数值边界也登记同一机制。
- 落点：`ai-harness/agents/dev-tools/contract-assertions.ts`（已在 harness）。

---

## 5. canonical 契约详表（产出/消费/落点速查）

> 波次以 §0.5/§0.6 修订为准（G1 前置终态写权；RM9 C6 与 C4/C5 同波次；C3 拆换算/估算；C7 拆波次）。

| 契约                                         | 产出方(唯一)                                   | 消费方                                             | harness 落点                                             | 波次                        |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | --------------------------- |
| **C0 终态写权 + 最小 LifecycleStatus**（G1） | `MissionLifecycleManager`（唯一终态写入口）    | 所有 markFailed/Completed/Cancelled 调用方提交意图 | lifecycle/mission-lifecycle/mission-lifecycle-manager.ts | **P0-0（最前）**            |
| C1 AbortReason                               | abort 调用方                                   | lifecycle-manager 映射                             | abort-registry.ts                                        | P0                          |
| C2 MissionFailure                            | dispatcher 提交→lifecycle-manager 单写         | DB / 前端文案 / metrics                            | abstractions/mission-failure.ts                          | P0                          |
| C3a 平台换算（credits→tokens）               | harness `resolveBudgetCaps`（唯一换算）        | pool / guard / UI / event                          | guardrails/budget/resolved-budget-caps.ts                | P0                          |
| C3b 真实成本                                 | 复用 ai-infra `ModelPricingRegistry`（不另立） | BudgetAccountant                                   | ai-infra/credits（既有）                                 | —                           |
| C4 RuntimeLimits + Metrics                   | framework / lifecycle.helper                   | wallTimer / DB / UI                                | abstractions/runtime-limits.ts                           | P0                          |
| C8 Liveness 强制                             | framework heartbeat                            | liveness guard 扫描                                | mission-liveness-guard.ts                                | P0                          |
| C5 ConfigSnapshot（显式 schema）             | openSession + 显式 mutation 入口（G2）         | run/rerun/resume/hydrate                           | abstractions/mission-config-snapshot.ts                  | P1                          |
| C6 InputRebuilder（canonical patch）         | harness rebuilder                              | app rerun/hydrate                                  | lifecycle/mission-lifecycle/rerun/                       | P1（与 C4/C5 同波次）       |
| C7 presentation 聚合                         | lifecycle-manager                              | controller / UI / metrics                          | abstractions/mission-state.ts                            | P2（终态写权部分已前移 C0） |
| C9 Stage 契约 primitive                      | harness primitive；registry 各 app 自持        | 契约测试                                           | primitive: agents/dev-tools/contract-assertions.ts       | DONE                        |

---

## 6. 全 app 落地（adapter 改造清单）

> 原则：先 playground 落地 + 跑稳 → radar → social，每 app 一个 PR；adapter conformance 测试随之绿。

### 6.1 agent-playground

本会话已落地的 app 层单一源（DEPTH_BUDGET_TIERS / dispatcher abort 分类 / wallTimeMs 注释 / maxCredits 列）→ **提升为消费 C1–C4 canonical**；rerun 子系统 → 迁到 C6 rebuilder。

### 6.2 AI Radar（`ai-app/radar`）

1. C3：`run-radar-refresh-mission.dto.ts:68-89` resolve\* 静态值 → canonical estimator；补 per-mission estimate。
2. C2：`radar-pipeline-dispatcher.service.ts:91-103 / 298-362` message 正则 → canonical taxonomy；`models.prisma:10602` 旁加 `failure_code`。
3. C4：`models.prisma:10587-10588` `durationMs/wallTimeMs` → `elapsedWallTimeMs/wallTimeCapMs`。
4. C1：`radar-pipeline-dispatcher.service.ts:447-459 abortMission` → `AbortRegistry.abort(id, reason)` 统一接口。
5. C8：`radar.module.ts` 注册 `MissionLivenessGuard.registerAdapter`（当前完全缺失）。
6. C5：`radar-mission-store.service.ts:112-121 payload` blob → 结构化 snapshot。
7. C7：`radar-mission-store.service.ts:21-26`（已 5 态，迁移成本最低）→ canonical enum。

### 6.3 AI Social（`ai-app/social`）

1. **C1（功能缺陷优先）**：`social-task.service.ts:222-252 cancelTask` 增加 `dispatcher.abortMission()/abortRegistry.abort()` **真停**（当前假停继续烧预算）。
2. C3：删 `social-pipeline-dispatcher.service.ts:418-438`（depthFactor/0.05 估算）+ `social-runtime-shell.service.ts:33-69` 散表 → canonical estimator/caps。
3. C2：`social-pipeline-dispatcher.service.ts:640-647` inline 4 码 → canonical taxonomy + 落 `failure_code` 列（`models.prisma:8883` 旁）。
4. C4：`models.prisma:8878 wallTimeMs`(实测) → `elapsedWallTimeMs` + 新增 `wallTimeCapMs`。
5. C7：`social-mission-store.service.ts:66,98,119` → canonical enum；补 `markCancelled/markRejected`；对齐 `models.prisma:8875` 注释。
6. C8：`ai-social.module.ts` 注册 liveness adapter（仿 `agent-playground.module.ts:257`）。
7. C6：`social-task.service.ts:260-299 retryTask` → harness rebuilder + `IMissionRerunPolicy`。

---

## 7. 看护机制（防腐朽 — 本设计的核心要求）

> 目标：让违反契约**编译期/CI 期必红，合不进主干**，而不是靠人自觉。★ RM1 修订：**L1 类型是主防线（make illegal states unrepresentable）**，L3/L4 grep 仅补充、不可作主防线（字面量级可平凡绕过）。

### L1 类型契约（编译期）— ★ 主防线

- canonical 全为 TS 类型/枚举/值对象；adapter 接口强类型。app 传错类型 → tsc 红。
- **关键手段（治本，替代多数 grep 守护）**：`ResolvedBudgetCaps` **私有构造 + 只能由 `resolveBudgetCaps()` 工厂产出 + 字段 readonly**（别处拿不到原料去散落换算）；`abort()` 签名收 `MissionAbortReason` enum（传字符串 tsc 红）；snapshot 只能由工厂产出。**让错误状态无法表达**，比事后 grep 扫描根本。

### L2 契约单测（每 canonical 对象）

- enum 全覆盖；值对象不变量：`maxTokens===maxCredits×CREDITS_TO_TOKENS`；`creditBudgetProxyUsd===maxCredits×CREDITS_TO_USD`（★ RB2：此值是**额度代理**非真实成本，注释写明真实成本以 `ModelPricingRegistry` 为准）。
  （★ m2 修订：删除"`wallTimeCapMs≠elapsedWallTimeMs`"伪不变量——二者是不同字段非不变量关系，cap 可能恰等于某次 elapsed；该约束由 L1 类型层"禁裸 wallTimeMs"覆盖。）
- 沿用本会话 `assertNumberProducerWithinSchema`（C9 primitive，harness）：stage→agent 数值边界 producer ⊆ consumer（registry 各 app 自持，RM3）。

### L3 架构守护 spec（`verify:arch` 扩展，jest 拦截）— ★ RM1 修订：降级为"补充层"，非主防线

> 主防线是 L1 类型（见下）。grep 字面量级守护可被等价改写平凡绕过（`const r=0.002`、`x*2/1000`、别名 enum），且 `wallTimeMs` 全仓 297 处含 harness 自身——**全仓即时封禁会逼出大量白名单使守护失效**。故 grep 守护**收窄**：

1. `× 0.002 / × 1000` 换算：**仅扫 `guardrails/budget` 目录**（白名单 `resolved-budget-caps.ts`）+ **仅对新增代码**；不全仓。（`× 0.05` 是 social 业务估算，不禁。）
2. 裸 `wallTimeMs`：**仅对新增代码禁**（带 deadline 逐步清理存量），不全仓即时封死；用词边界正则避免误伤 `wallTimeCapMs`/`elapsedWallTimeMs`。
3. `abortRegistry.abort(` 第二参字符串字面量——**此条主要靠 L1**（abort 签名收 enum，传字符串 tsc 即红）；grep 仅兜底。
4. markFailed 只写 message 不写 failureCode——**靠 C0 单写入口**（终态只能经 lifecycle-manager，它强制要 failureCode）；grep 测不准数据流，不依赖它。

### L4 ESLint（IDE 实时 + lint-staged）— ★ RM1 修订：取消"全仓 0.002/1000 字面量"规则（误伤大）

- 保留：禁 `ai-app/**` 直接 import harness 内部 budget/lifecycle 路径（必走 facade）——这条是路径级、误伤小、与既有 `no-restricted-imports` 一致。
- **删除**：原"禁字面量 0.002/1000 用于 credits 上下文"——`1000` 全仓到处是毫秒/容量，AST 判"credits 上下文"假阳性多，成本高收益低。改由 L1（值对象私有构造，别处拿不到原料散落）治本。

### L5 Conformance — ★ RB3/G4 修订：harness 不认 app 名 + 两级（wiring 静态 / behavioral 集成）

> RB3：撞既有 R0-A5（harness 文件禁出现 app 名）。故**不是** `assertMissionAppConformance(appModule)` 枚举具体 app，而是 **app 自报 namespace 字符串注册**，harness 对"任意注册项"断言不变量。G4：只查接线挡不住"接了但语义错"，拆两级。

**L5a wiring conformance（静态，启动期）**——对每个注册项断言"接线存在"：

1. 实现了 `IMissionRuntimeAdapter`；2. **注册了 liveness adapter**（治 radar/social 漏注册，静态可验，真有效）；3. 声明了 cancel 入口 + rerun policy（若支持）。harness 只断言"已注册集合非空 + 每项满足接口"，**不硬列 app 名**。

**L5b behavioral conformance（集成测试套件）**——对每个注册项跑真实行为（治"接了但语义错"）：

- 发真 mission → cancel → 断言 `signal.aborted` + budget 停增 + 终态=cancelled + reason 正确（治 social 假停——静态会误判它合格，因为它"出现过 abort 调用"只是在错的地方）；
- rerun → 断言 patch 不越权 + policy 重解析正确；
- 制造预算耗尽 → 断言 failureCode/category/source 映射正确；
- 制造静默 → 断言 liveness 回收。
  > **无 L5b 的接入视为未接入。** 新增 mission app 缺任一级 → 红，无法合并。这是"新 app 接入清单"的可执行版。

### L6 pre-push + CI 二次执行

`.husky/pre-push` 第 0 步跑 `verify:arch`（含 L3）+ conformance（L5）+ 变更测试；CI 复跑全量。违规拒推。

### L7 注册表 + schemaVersion + 文档回链

- `MissionConfigSnapshot.schemaVersion`：契约演进有版本，跨版本回退有据。
- 本文件为单一真源；每个 canonical 文件头注释回链本文件路径；新增 mission app 的 PR 模板要求勾选"已过 conformance"。

---

## 8. 分波次迁移（× 全 app）

> ★ 本表已按 §0.6 G1 重排（终态写权前置）。

| 波次                                | 内容                                                                                                                          | 全 app 落地                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **P0-now（独立 hotfix，不等重构）** | RS1：radar/social 注册 liveness adapter；social cancel 真停（各一行级，零迁移）                                               | radar / social 各一 PR                                                               |
| **P0-0（平台前置）**                | **C0 终态写权（`MissionLifecycleManager` 唯一终态写入口）+ 最小 `MissionLifecycleStatus` 值域**（G1）                         | 三 app 终态写改走单入口                                                              |
| **P0**                              | C1 AbortReason / C2 MissionFailure / C3a 换算 / C4 wall-time 拆 / C8 liveness 强制；**L1 类型为主防线** + L5a/L5b conformance | playground→radar→social 各一 PR（per-app adapter version + canonical-read flag，G5） |
| **P1**                              | C5 ConfigSnapshot（显式 schema，G2 写治理）/ C6 InputRebuilder（canonical patch，G3）**与 C4/C5 同波次**（RM9）               | 各 app 接 rebuilder                                                                  |
| **P2**                              | C7 presentation 聚合 / starting 占位平台化（终态写权部分已前移 P0-0）                                                         | controller/前端/store                                                                |
| DONE                                | C9 stage 契约 primitive（harness）；registry 各 app 自持（RM3）                                                               | playground 已落；radar/social 各自登记                                               |

**P0 内顺序（硬性，G1）**：C0 终态写权 → C1/C2（依赖终态语义）→ C3a/C4（带 G5 rollout 隔离）→ C8。**不再"C3+C4 先行"**；C6 Rebuilder 与 C4/C5 同波次以缩短双语义窗口（RM9）。

---

## 9. 兼容策略

- **双写过渡**：P0 期新 canonical 字段与旧并存，写两份、读优先 canonical，灰度 N 天后删旧。
- **in-flight / 历史 mission**：无 `config_snapshot` → rebuilder 回退 `legacy` 分支（旧 row+JSON 拼装，仅历史用）。
- **DB 迁移**：手写 SQL（项目规范，禁 `prisma migrate dev`）；先加列→回填→切读→弃旧；三 app 各自迁移脚本。
- **跨 app 节奏**：先 playground 验证 + adapter 边界稳定 → radar → social，每 app 一 PR；canonical 加 `schemaVersion`。
- **event/前端协议改名**：走 `playground-frontend-contract.spec` byte-equal 基线（radar/social 补各自基线），改名同步基线 + 前端 client。
- **prompt cache / 在跑任务**：合并节奏避开在跑任务；P0 不动 agent prompt。

## 10. 风险点

| 风险                                                     | 缓解                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| 跨 app blast radius（3+ app 同 harness）                 | 先 playground 验证；adapter 边界稳定后逐 app；canonical schemaVersion |
| DB 迁移（wall-time/config_snapshot/failure_code × 3 表） | 手写迁移 + 双写 + 回填 + 灰度切读                                     |
| in-flight / 历史无 snapshot                              | rebuilder legacy 回退分支                                             |
| social 真停上线后行为变化（之前假停）                    | 灰度 + 明确 changelog；cancel 后 budget 立停是预期改进                |
| event/前端协议改名                                       | byte-equal 基线 + 前端 client 同步 PR                                 |
| 看护 L3/L4 误伤合法用法                                  | 白名单（如 `resolved-budget-caps.ts` 允许换算常量）                   |

## 11. 测试矩阵（全 app × 全域 × 全分支）

- **契约单测**：每 canonical（C0–C9）值对象不变量 + enum 全覆盖。
- **conformance（L5，RB3/G4）**：harness 对**每个已注册项**（按自报 namespace，不硬列 app 名）跑 L5a wiring（静态）+ L5b behavioral（集成）。
- **业务分支矩阵**（每 app）：fresh run / full rerun / incremental / local rerun / **cancel 发生在 S8 前 vs S8 中（RB6 半发布）** / budget-exhaust / wall-time-exceed / quality-reject / 孤儿回收 / 历史无 snapshot legacy 回退 / **liveness markFailed 与正常 markCompleted 的 TOCTOU 竞争**。
- **架构守护（L3，RM1 降级）**：仅 budget 目录扫换算字面量 + 仅新增代码禁裸 wallTimeMs；主防线是 L1 类型（abort enum / caps 工厂私有构造）。
- **回归基线**：`playground-no-regression` + 三 app `*-frontend-contract` byte-equal（含 REST DTO 字段，非仅 event）。

## 12. 不上提（留 ai-app 业务层）

- `depth=quick|standard|deep` 档位、`budgetProfile` 文案标签。
- `styleProfile/audienceProfile/auditLayers/searchTimeRange` 业务输入。
- leader 签字业务解释（映射到平台 `failureCode=leader_signoff_rejected` 走 C2）。
- 维度工具矩阵 `dimension-tool-matrix`、章节/字数业务契约。
- 详情页 budget meters / 设置弹窗回填 / 布局交互。

## 13. 与本会话已落地工作的衔接

本会话已在 **app 层** 单一源化若干项；本设计 P0 把它们**提升为 harness canonical 并令 radar/social 共同消费**——多为"提升 + 改消费方"，非全新建：

| 本会话已做（app 层）                                      | 提升为（harness canonical）                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `DEPTH_BUDGET_TIERS` + `resolveMissionCredits/Multiplier` | C3 `ResolvedBudgetCaps` + `MissionCostEstimator`（换算搬进 harness 唯一处） |
| dispatcher `budget_exhausted/user_cancelled` 分类         | C1 `MissionAbortReason` + C2 `MissionFailureCode` enum                      |
| `wallTimeMs` 注释澄清 + maxCredits 列权威                 | C4 字段拆分 + C5 snapshot                                                   |
| `assertNumberProducerWithinSchema` + 注册表               | C9（已在 harness，作为看护 L2 基元）                                        |
| dimension-tool-matrix / chapter/word 契约                 | 留 app 业务层（§12）                                                        |

---

## 14. 评审决策点（待确认后实施）— ★ 已按 §0.5/§0.6 修订

1. **先做 RS1 两个独立 hotfix**（radar/social liveness 注册 + social cancel 真停，零迁移）——认可立即做、不等平台重构？
2. **平台 P0 顺序（G1）**：C0 终态写权前置 → C1/C2 → C3a/C4（带 G5 rollout 隔离）→ C8；**不再 C3/C4 先行**。认可？
3. 粒度：每 canonical × 每 app 一 PR（per-app adapter version + canonical-read flag，小步可回退）。认可？
4. social 真停（含 RB6 S8 gate-before-stage 防半发布）——确认是期望改进？
5. 范围裁剪：是否先只做"地基四件"（C0 终态写权 + RB2 pricing 不固化 + C8 liveness + L1 类型看护），其余 C5/C6/C7 视效果再排？

> 评审通过后，按 §8 波次实施；每步过 §7 看护（L1 主防线）+ §11 测试矩阵。**本文件 §0.5/§0.6 修订决议优先级高于其余正文；如发现冲突以修订为准。**
