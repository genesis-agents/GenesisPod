# Engine `safety` 杂货筐拆解 + 跨层同名概念归并 · 系统方案

> **日期**：2026-06-02
> **作者**：Claude Code（架构审查，基于文件级证据）
> **状态**：⏳ 方案归档，待 workflow 自驱执行（安全波次自动完成 + 验证，行为合并波次产出可执行 spec）
> **关联**：[2026-06-02-scored-router-sota-design.md](./2026-06-02-scored-router-sota-design.md)（routing 聚合）

---

## 0. 一句话结论

`ai-engine/safety/` 累积成 5 个不相关家族的杂货筐，其中 3 个家族（`constraint` 的 content-filter、`quality`、`resilience`）与 `ai-infra`、`ai-harness` 的同名概念跨层碰撞，违反项目自定的「同名概念全项目唯一」「顶层全是业界标准词、禁自造杂烩」原则。本方案把每个概念归并到**唯一**且**符合业界 SOTA 命名**的归属。

---

## 0.5 递归 MECE 架构原则（本方案的判定基准 + 整改后长期治理）

> 不止修 4 处重叠，而是确立一套**层层递归、直到文件级**的 MECE 原则；本方案所有归位决策都用它判定，整改后用它持续看护。

### 原则总纲

> **MECE = Mutually Exclusive（互斥，无重叠）+ Collectively Exhaustive（穷尽，无遗漏）。**
> 在**每一个层级**都成立：分层 → 聚合 → 子模块 → 文件。父节点的职责被其子节点**互斥且穷尽**地划分。

```
L 层级 (L1→L4)          ── ME: 每层一个职责档；CE: 依赖单向、无层被跳过
  └ 聚合 (top-level dir) ── ME: 一聚合一业界标准能力域，概念不跨聚合；CE: 每个原语有唯一归属
      └ 子模块 (sub-dir) ── ME: 兄弟子目录能力不重叠；CE: 子目录之并 = 聚合职责
          └ 文件 (file)  ── ME: 一文件一内聚单元（一 service/一 class/一概念）；CE: 文件名 = 其唯一职责
```

### 四级判定规则（"某符号 X 该放哪"按序回答）

1. **哪一层？** 知道 agent/mission → `harness`(L2.5)；纯能力原语、不知 agent → `engine`(L2)；跨业务基础设施 → `infra`(L1)。
2. **哪个聚合？** 它属于哪**一个**业界标准能力域（llm/tools/rag/routing/evaluation/reliability/safety/…）。落在两个之间 = 信号：要么拆分概念，要么提为共享原语聚合（如 `routing`）。
3. **哪个子模块？** 聚合内哪**一个**子能力；不存在则新建一个**MECE 命名**的子目录，**禁止**塞进 utils/misc/common。
4. **哪个文件？** 一文件一职责，文件名即职责；**全项目类名/概念名唯一**。

### MECE 反模式（递归审计的红旗清单）

| 反模式                  | 检测信号                                                   | 本方案实例                                                                                            |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **杂货筐聚合**          | 一个聚合塞 ≥3 个不相关家族                                 | `engine/safety`（security+moderation+quality+resilience+constraint）                                  |
| **跨节点同名**          | 同名 dir/class 出现在多处                                  | `CircuitBreaker`×2、`TokenBudgetService`×2、`constraint`×3、两个 `TokenBucket`、两个 `output-manager` |
| **概念跨聚合/跨层**     | 同一能力在多个聚合/层各写一份                              | rate-limit（engine+harness）、constraint-profile（teams+guardrails）                                  |
| **装错抽屉**            | 文件职责与所在目录名不符                                   | `safety/constraint/content-filter`（实为 moderation）                                                 |
| **垃圾命名子目录**      | `utils/`/`misc/`/`common/`/`core/`/`helpers/` 承载实质逻辑 | 审计时逐聚合排查                                                                                      |
| **接口源头错位**        | interface 不与其实现/契约源头同居                          | constraint 接口在 teams、实现在 guardrails                                                            |
| **abstractions 大杂烩** | 跨聚合 `runtime/abstractions/` re-export                   | 每聚合须自带 `abstractions/`（CLAUDE.md MECE #4）                                                     |

### 递归审计产物（workflow 输出）

逐 engine/harness 聚合 → 逐子目录 → 抽查文件，对照红旗清单，产出**违规登记册**（每条：路径 / 反模式 / 证据 / 建议归位 / 风险）。本方案的 7 波是「已确诊」违规的整改；审计可能发现**增量违规**，并入登记册分级处置。

---

## 1. 证据基线（已读文件，file-level）

| 文件                                                                                                      | 行  | 事实                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------- |
| `ai-engine/safety/resilience/circuit-breaker.service.ts`                                                  | 806 | NestJS 单例，`Map<entityId,state>` 管多实体，Redis 持久化，`getHealthMetrics()`、**`selectBest()`**（负载均衡选择） |
| `ai-infra/resilience/circuit-breaker.ts`                                                                  | 117 | 纯 class，逐调用点 `new`，滑窗，无 Redis；自述「散点 4 处熔断去重的通用原语」                                       |
| `ai-engine/safety/resilience/rate-limit.service.ts` (+`token-bucket.ts`)                                  | 157 | **token-bucket** 算法，global/tenant/agentType 维度；自述「2026-05-04 修正分类后回归 engine」                       |
| `ai-harness/guardrails/resources/rate-limiter.ts`                                                         | 354 | **滑窗时间戳**算法 + 泛 key + `registerLimit`，**内联又一个 `TokenBucket` class**                                   |
| `ai-engine/planning/budget/token-budget.service.ts`                                                       | 463 | class **`TokenBudgetService`**：估算/分配/压缩（`countTokens`/`allocateBudget`/`compress`），无 Redis               |
| `ai-harness/guardrails/runtime/token-budget.service.ts`                                                   | 308 | class **`TokenBudgetService`**：追踪/强制（`createBudget`/`check`/`consume`），Redis INCRBY per-mission             |
| `ai-harness/guardrails/constraints/constraint-engine.ts`                                                  | 863 | `ConstraintEngine`：成本/质量/效率铁三角治理                                                                        |
| `ai-engine/safety/constraint/guardrails/content-filter.ts`                                                | 361 | `ContentFilter`：hate/violence/**pii**/**prompt-injection** 正则过滤                                                |
| `ai-engine/safety/quality/checkers/*`                                                                     | —   | coherence/consistency/diversity/factual checker（**纯原语**，无 mission/agent 状态）+ quality-gate.service          |
| `ai-harness/evaluation/{critique,verify,figure,dreaming}/*`                                               | —   | judge/critique-refine/defect-scanner/report-quality-gate（**编排**，mission/agent 感知）                            |
| `ai-harness/teams/constraints/{constraint-engine.interface,constraint-profile}.ts`                        | —   | 接口源头 + **重复的 constraint-profile**（guardrails/constraints 也有一份）                                         |
| `ai-harness/guardrails/budget/{budget-accountant,mission-budget-pool}.ts`、`resources/cost-controller.ts` | —   | budget/cost 4 面 sprawl（同聚合内）                                                                                 |

---

## 2. 重叠判定（四组）

| #   | 概念                | 现状                                                                                                                                                      | 判定                                                                                                                 |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A   | **Circuit Breaker** | engine 那个是「多实体健康注册 + `selectBest` 选择」（806 行），infra 那个是「单点熔断原语」（117 行）                                                     | **假重复 + 职责错位**：engine 实为 health/selection（喂 routing 的 health 信号），不是 safety；与 infra 原语同名碰撞 |
| B   | **Rate Limiting**   | engine=token-bucket，harness=滑窗时间戳；两套算法、两个 `TokenBucket`                                                                                     | **真重复**：能力重叠，需合并到单一 engine 原语                                                                       |
| C   | **Token Budget**    | 两个 class **字面同名 `TokenBudgetService`**：engine=估算/压缩，harness=追踪/强制                                                                         | **假重复（职责不同）但同名**：必须改名消歧，不合并                                                                   |
| D   | **"constraint"**    | engine/safety/constraint=ContentFilter(moderation)+schema-validator；harness/guardrails/constraints=资源治理；harness/teams/constraints=接口+重复 profile | **同词三义 + engine 那个装错抽屉（是 moderation）**                                                                  |

---

## 3. 根因

```
ai-engine/safety/   ← 杂货筐
├── security/    injection/ssrf/capability        ✓ 真 safety
├── guardrails/  content I/O 管道                  ~ moderation
├── constraint/  ContentFilter(=moderation!) + schema-validator   ✗ 误命名 + 跨层撞 harness
├── quality/     coherence/factual checker(=原语)  ✗ 该属 evaluation，不属 safety
└── resilience/  circuit-breaker(=health/select) + rate-limit + token-bucket   ✗ 跨层撞 infra/resilience + harness/guardrails
```

---

## 4. 目标态（每概念唯一归属 + SOTA 命名）

### 4.1 engine 顶层聚合 10 → 12

新增 2 个**业界标准词**聚合，`safety` 收敛为「只做真 safety」：

| 聚合                            | 内容                                                                                                                                       | 来源                   | 业界对应                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------- |
| `engine/safety/`（收敛）        | `security/`（injection/ssrf/capability）+ `moderation/`（← content-filter）+ `validation/`（← schema-validator）                           | 现 safety 瘦身         | Llama Guard / Prompt Guard                                 |
| **`engine/evaluation/`（新）**  | 原语检查器：coherence/consistency/diversity/factual + quality-gate/registry                                                                | ← `safety/quality/`    | eval primitives（与 harness/evaluation 编排成 L2/L2.5 对） |
| **`engine/reliability/`（新）** | `rate-limit/`（token-bucket 唯一实现）+ `entity-health/`（← circuit-breaker.service 改名 `EntityHealthRegistry`，单点熔断委托 infra 原语） | ← `safety/resilience/` | rate limiter / health tracker                              |

> 其余 8 聚合（facade/llm/tools/rag/routing/knowledge/content/skills/planning）不变。

### 4.2 命名消歧

| 原                                                   | 新                            | 理由                            |
| ---------------------------------------------------- | ----------------------------- | ------------------------------- |
| `engine/planning/budget` 的 `TokenBudgetService`     | **`ContextBudgetCalculator`** | 它做 sizing/压缩，不是配额      |
| `harness/guardrails/runtime` 的 `TokenBudgetService` | **`MissionTokenLedger`**      | 它做 per-mission 配额追踪/强制  |
| `engine/tools/output-manager`（spill-storage）       | **`result-spill`**            | 与 `skills/output-manager` 区分 |

### 4.3 constraint 收口

- `engine/safety/constraint/guardrails/content-filter.ts` → `engine/safety/moderation/`
- `engine/safety/constraint/validators/schema-validator.ts` → `engine/safety/validation/`
- `harness/teams/constraints/constraint-engine.interface.ts` → 移到 `harness/guardrails/constraints/`（接口与实现同居），`teams` 侧 re-export
- `harness/teams/constraints/constraint-profile.ts` 与 `harness/guardrails/constraints/constraint-profile.ts` 去重（保留 guardrails 一份，teams re-export）
- `engine/safety/constraint/` 目录消失

### 4.4 依赖方向校验（不可破）

- `engine/reliability/entity-health` 的单点熔断委托 `ai-infra/resilience/CircuitBreaker`（L2→L1，合法）
- `engine/routing` 的 health SignalScorer 读 `engine/reliability/entity-health`（聚合间，合法）
- harness 的 rate-limit 编排委托 `engine/reliability/rate-limit`（L2.5→L2，合法）
- **禁止** engine→harness 反向依赖（`verify:arch` 守门）

---

## 5. 执行波次（安全优先 + 强成功标准）

| 波  | 内容                                                                                                                                                                          | 风险                                    | 是否需新模块          | 行为变更 | verify                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------- | -------- | ------------------------------------------------------------- |
| W0  | 主 Agent 手建 `engine/evaluation`、`engine/reliability` 模块骨架 + facade export                                                                                              | 低                                      | **是（主 Agent 做）** | 无       | type-check                                                    |
| W1  | content-filter→`safety/moderation`、schema-validator→`safety/validation`，删 `safety/constraint`                                                                              | 低（移动+改 import）                    | 否                    | 无       | arch+type-check                                               |
| W2  | `safety/quality`→`engine/evaluation`，改 import；核对 harness/evaluation 是否有重复 gate 逻辑                                                                                 | 中                                      | 用 W0 骨架            | 无       | arch+type-check+evaluation 单测                               |
| W3  | `tools/output-manager`→`result-spill` 改名                                                                                                                                    | 低                                      | 否                    | 无       | type-check                                                    |
| W4  | TokenBudgetService 两处改名（`ContextBudgetCalculator`/`MissionTokenLedger`），全仓 import 改                                                                                 | 中（blast radius 大但纯改名）           | 否                    | 无       | type-check+相关单测                                           |
| W5  | constraint 接口源头 teams→guardrails，去重 profile                                                                                                                            | 中                                      | 否                    | 无       | arch+type-check                                               |
| W6  | **rate-limit 合并**：删 harness rate-limiter 逻辑 + 内联 TokenBucket，统一委托 engine token-bucket；保留 harness 结果 API（remaining/resetAt/retryAfter）通过扩展 engine 接口 | **高（行为：算法从滑窗→token-bucket）** | 用 W0 reliability     | **是**   | arch+type-check+**rate-limit 单测（含突发/refill 行为断言）** |
| W7  | circuit-breaker.service→`engine/reliability/entity-health/EntityHealthRegistry` 改名+移位，单点熔断委托 infra 原语；`selectBest` 消费方改路径                                 | **高（blast radius + 委托重写）**       | 用 W0 reliability     | **是**   | arch+type-check+健康/选择单测                                 |

**强成功标准**：每波 `npm run verify:arch` 绿 + `npm run type-check` 0 error；行为波（W6/W7）额外要相关单测绿。任一波 verify 红 → 自愈循环（≤2 轮），仍红则该波回到干净态并标记 blocked，不污染后续波。

---

## 6. 关键决策与权衡（已定，记录依据）

1. **rate-limit canonical = token-bucket**（非滑窗）。依据：engine 注释明示 token-bucket 是「标准实现」；SOTA 限流默认 token-bucket（允许突发 + 平滑 refill）。harness 滑窗的富返回（remaining/resetAt/retryAfter/registerLimit 命名配置）通过**扩展 engine API 保留**，不丢能力。
   - _备选（弃）_：保留滑窗——理由弱，且要维护两套。
2. **quality 不并入 harness**，而是新建 `engine/evaluation` 原语层。依据：engine checker 是 agent 无关原语，harness 是 mission 感知编排——这是正确的 L2/L2.5 分层，不该塌缩成一层。
3. **circuit-breaker.service 归 `engine/reliability/entity-health` 而非直接塞进 routing**。依据：它是 health 数据源（tracking），routing 是选择（selection）；保持「追踪 vs 选择」分离，routing 的 health SignalScorer 读它。`selectBest` 的选择语义长期应迁往 routing（标记为后续）。
4. **新增 2 个 engine 顶层聚合**（evaluation/reliability）。依据：均为业界标准词，比现 safety 杂货筐更 MECE。代价：需同步更新 `standards/16` 与 `.claude/CLAUDE.md` 的 engine 聚合清单（10→12）。
5. **token-budget 不合并**（职责不同），仅改名消歧。

---

## 7. 顺带需修正的文档漂移（非本方案核心）

- `.claude/CLAUDE.md` engine 聚合清单漏 `routing`、错列 `credentials`（实际在 `ai-infra/credentials`）；本方案完成后还需补 `evaluation`/`reliability`。
- `harness/guardrails/resources/cost-controller.ts` 头注释写「AI Engine - Cost Controller」但物理在 harness（搬迁残留，改注释即可）。
- `harness/guardrails` 内部 budget/cost 4 面 sprawl —— 独立的同聚合内清理，**不在本方案范围**，另行评估。

---

## 8. 不做什么（边界）

- ❌ 不动 facade 对外签名（保持兼容）
- ❌ 不重写 ConstraintEngine 的铁三角算法（只挪接口源头 + 去重 profile）
- ❌ 不做 harness/guardrails 内部 budget/cost 4 面的合并（另案）
- ❌ subagent 不创建 .module.ts、不改入口文件、不跑 git reset/checkout/clean/push（红线）
