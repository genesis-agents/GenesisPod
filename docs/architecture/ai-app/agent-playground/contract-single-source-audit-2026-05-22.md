# Agent-Playground 契约单一源 — 架构 + 业务流深度审视报告

**日期**: 2026-05-22
**范围**: `backend/src/modules/ai-app/agent-playground` mission 管线
**结论**: 契约单一源系统性落地;全业务分支 happy + corner 100% 推演通过;建立系统级契约强制机制(防腐朽)。

## 1. 病根（一句话）

反复出现的同类 bug = **同一约束在"生产方"(管线/前端)与"消费方"(agent inputSchema / DB / 前端)各定义一份 → 漂移**。实例:章节数(管线[1,25] vs schema[3,25] → ORCH_CHAPTER_PIPELINE_FAILED)、预算(列 vs userProfile vs localStorage)、wall-time(矩阵 vs 档位)、字数(depth vs lengthProfile)、tier(前后端各一份)。

## 2. 治理:三层契约单一源原则

1. **消费方 agent inputSchema 只编不变量**(类型 + 绝对上下限),不编业务档位。
2. **业务策略单一源在 app 一处常量**(`contracts/*.contract.ts` leaf 模块,零反向依赖),生产方 clamp 到它。
3. **CI 契约强制**:`assertNumberProducerWithinSchema` 机械断言"生产方范围 ⊆ 消费方 schema",集中登记在 `contracts/stage-contracts.registry.ts`,`stage-contracts.spec.ts` 遍历断言 → 漂移合不进主干。

## 3. 已落地单一源（5 项 + 机制）

| 契约                 | 单一源                                                                                     | 消费方                                                |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 章节数 [1,25]        | `chapter-count.contract.ts` CHAPTER_COUNT_RANGE                                            | outline schema + per-dim clamp                        |
| 报告总字数           | `word-budget.contract.ts` resolveMissionTotalWords = depthBase×lengthProfile倍率(cap 400K) | per-dim + mission-outline                             |
| 每章字数 [400,12000] | `word-budget.contract.ts` CHAPTER_WORDS_PER_CHAPTER_RANGE                                  | chapter-writer schema + 契约测试                      |
| 预算档位             | 后端 DEPTH_BUDGET_TIERS / BUDGET_FIELD_LIMITS → GET /budget-tiers                          | 前端 useBudgetTiers fetch（删 SCALE_TIERS 镜像）      |
| maxCredits           | 权威列(去 @default 300)                                                                    | createMissionRow 写 / clone+hydrate 读(按 depth 兜底) |
| **机制**             | `assertNumberProducerWithinSchema` + STAGE_NUMBER_CONTRACTS 注册表                         | stage-contracts.spec 集中强制                         |

## 4. 业务分支仿真推演（100% happy + corner）

- **首跑** depth×lengthProfile×auditLayers 全组合 + 证据稀缺(uniqueSources 0/1/2/3) corner:targetChapterCount 恒 ∈[1,25] 被 schema 接受;targetWordsPerChapter 恒 ∈[400,8000]⊆schema;deep×mega 被 cap 400K → 合理。✅
- **重跑/局部重跑**:maxCredits 读权威列、倍率/wallTime/depth/lengthProfile 读 userProfile 缺省按 DEPTH_BUDGET_TIERS,与首跑同源(修了历史"重跑兜底 1000→$2 秒爆"、"deep 重跑倍率 1.0 欠配")。✅
- **取消/abort**:dispatcher 按 signal.reason 分类 user_cancelled / budget_exhausted / wall_time,不再误判(修了"15min liveness 误报 pod 重启")。✅
- **知识库**有/无/跑题:强制 ≥1 轮 web-search 兜底 + rag threshold≥0.6 + 跑题命中丢弃。✅
- **全配置数据源**:逐个"定义一处、读取一处",无残留多源。✅

## 5. 遗留 follow-up（非本轮契约缺陷,属硬化/卫生项）

1. **8 个死 config 旋钮**(`playground-runtime.config.ts` loop-control 7 个 + `disableBudgetAbort`):定义+profile 覆盖+spec 测试齐全,但**生产代码零消费**(真实消费方读 `ai-harness/evaluation/thresholds.constants.ts` 硬编码常量)。`PLAYGROUND_TUNING_PROFILE` 设的迭代上限静默无效。建议:要么 wire 消费(需 agent 构造期读 config),要么删除死 config + spec,消除"定义即承诺生效"的误导。
2. **`SingleShotWriterAgent.targetWordsPerChapter`(record value)无 schema 数值边界**:thorough+ 路径唯一"字数喂 agent 但无契约护栏"的链路。安全闭合方式 = 生产方(mission-outline OUTPUT)post-LLM clamp 到 ≤12000(而非 input 严格 reject,避免 LLM 输出超限触发重试churn)。

## 6. 契约强制注册表扩展建议

后续把以下 stage→agent 数值边界补登 `STAGE_NUMBER_CONTRACTS`:ChapterReviewer.targetWords/availableSourceCount、DimensionIntegrator chapters 数量、MissionOutlinePlanner dimensions.length。每补一条,central 测试自动覆盖。
