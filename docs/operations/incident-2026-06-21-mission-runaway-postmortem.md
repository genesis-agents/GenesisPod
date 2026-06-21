# 事故复盘 + 系统性修复方案：Mission 失控空烧（2026-06-21）

> 状态：**P0 + prose-not-JSON 已实现并验证**（commit `ddfdf0a85`，分支 `fix/mission-runaway-systemic`，未 push）；**P1-2（playground 去留）待决策**
> 触发：用户反馈「洞察失败」（mission `dc0d2aae-2256-4a89-822f-e8de0c01ded4`，topic「AIDC并网标准洞察」，depth=deep）
> 调查方式：源码端到端追踪 + Railway 生产 DB 实证（`agent_playground_missions` / `agent_playground_mission_events`）+ 四路并行只读审计
> 维护者：Claude Code

---

## 1. 执行摘要

一个 deep 档洞察任务在生产上**失控**：两轮累计运行约 33 小时、烧掉 **$18.16 / 6.05M token**，且**没有任何断路器在过程中阻止它**。最终它不是被取消的，而是 thrash 到自然 `completed`，成本翻倍。

直接技术症状是 `RUNNER_OUTPUT_SCHEMA_MISMATCH`：pipeline 里**每一类 agent**（researcher / integrator / chapter-writer / writer / outline）的 finalize 输出过不了 `outputSchema` 校验（`<root>: Expected object, received string` / `summary|fullMarkdown|body: Required`），撞 `MAX_FINALIZE_REJECTS=3` 后强吐次优产物，维度反复 retry、永不收敛。

深度检视确认：**这不是 playground 单点 bug，而是四个平台级系统性问题的叠加。**

---

## 2. 时间线（生产事件实证）

| 时间 (UTC)             | 事件                                    | 备注                                                                                                                      |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-20 00:05:12    | run1 `mission:started`                  | depth=deep, withFigures, useOntology                                                                                      |
| 2026-06-20 00:06       | `leader:goals-set`                      | Leader 定下巨标：≥12000 字 / ≥50 来源 / ≥10 图表                                                                          |
| 2026-06-20 00:36       | `stage:stalled` (s3-researchers, 30min) | **仅 warning**                                                                                                            |
| 2026-06-21 01:04       | run1 `mission:failed`                   | `Writer 失败 (2 次)：RUNNER_OUTPUT_SCHEMA_MISMATCH <root>: Expected object, received string`；costUsd≈9.70；**跑了 ~25h** |
| 2026-06-21 19:25       | `mission:reopened`（用户手动重跑）      | run_count→2                                                                                                               |
| 2026-06-21 19:25–20:0x | run2 全程 thrash                        | 67 次 `validation-rejected`，每个 agent 反复 schema fail                                                                  |
| 2026-06-21 20:0x       | run2 `completed`                        | 累计 **$18.16 / 6.05M token**                                                                                             |

调查期间 DB 实测：`wallTimeCapMs=86400000(24h)`、`creditBudgetProxyUsd=$40`、`maxTokens=20,000,000`、`budgetMultiplier=4`；模型 = `deepseek-v4-pro` / `gpt-5.4`。

---

## 3. 直接失败机制（已源码确认）

1. playground 各 agent **不用 native function-calling / JSON mode**，而是要求 LLM 在普通文本回复里夹一段 JSON object，再用 `extractJsonFromAIResponse`（7 策略启发式）抽取 → `outputSchema.safeParse`。
   - `backend/src/modules/ai-harness/runner/loop/simple-loop.ts:208-246`
   - `backend/src/modules/ai-harness/agents/dev-tools/agent-runner.service.ts:396-477`（DX 层最终断言，line 462 抛 `Output schema validation failed`）
2. `deepseek-v4-pro` / `gpt-5.4` 在 deep 长文里直接写 markdown 正文，不吐 JSON 信封 → 抽取得到字符串 → schema 期望 object → `<root>: Expected object, received string`。
3. ReAct/Reflexion finalize 闸：`react-loop.ts:1494-1528` 连续 reject 到 `MAX_FINALIZE_REJECTS=3` → emit `RUNNER_OUTPUT_SCHEMA_MISMATCH` + 强吐次优产物。
4. Writer 起草 stage `s8-writer-draft-report.stage.ts` 两次 attempt 都拿不到合法 report → `throw "Writer 失败"` → mission 失败（run1）/ 续跑空转（run2）。

---

## 4. 四大系统性主题（深度检视结论）

### 主题一：结构化输出契约全平台脆弱

17+ 个 agent 同模式（长文 prose 塞进 object schema + 启发式抽取），跨多个模块。最危险（长文写手，HIGHEST）：

| 文件                                                                                                       | agent          | 备注                                      |
| ---------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------- |
| `ai-app/playground/mission/agents/writer/chapter-writer.agent.ts:124`                                      | chapter-writer | body 单字段塞万字 markdown                |
| `ai-app/playground/mission/agents/writer/single-shot-writer.agent.ts:107`                                  | writer         | ResearchReportSchema 嵌套，reflexion 重试 |
| `ai-app/playground/mission/agents/writer/dimension-integrator.agent.ts:59`                                 | integrator     | fullMarkdown 单字段                       |
| `ai-app/playground/mission/agents/analyst/analyst.agent.ts:220`                                            | analyst        | 5 段 prose 字段                           |
| `ai-app/marketplace/capabilities/deep-insight/agents/**`                                                   | (克隆)         | **线上能力核，同样的雷**                  |
| `ai-app/writing/mission/agents/writer.agent.ts:73` / `story-architect.agent.ts:136` / `editor.agent.ts:76` | writing.\*     | 同模式                                    |
| `ai-app/social/mission/agents/content-transformer/content-transformer.agent.ts:57`                         | social         | 同模式                                    |

> 安全模式（不受影响）：root 为 string/markdown 的 schema，或短结构化输出（分类/分数/枚举）。

### 主题二：全平台缺「空转 / 成本速率」断路器

- `MissionLivenessGuard`（`ai-harness/lifecycle/mission-lifecycle/mission-liveness-guard.service.ts`）只杀「心跳 AND 事件双 stale」=「冻死」，**杀不了「高频出事件但不前进」的 thrash**。30 分钟 `stage:stalled` 仅 warning。
- **Teams / Insight 连 mission 级 liveness 都没注册**（无 wall-time、无 cost cap）→ 比 playground 更危险。
- 全平台无「单任务成本速率 / 成本上限」告警。
- playground deep 档 `wallTimeCapMs` 来源 `DEPTH_BUDGET_TIERS`=24h，与 liveness adapter 注册的 2h 上限**不一致**（取松的那个生效）。

### 主题三：cancel/abort 在多处是坏的

| 路径                                                                        | 现状                                                            | 严重度                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| `ai-app/insight/.../mission-lifecycle.service.ts:~1354`                     | already-cancelled early-return，**跳过 abort**                  | CRITICAL（审计报告，待 fix 时复核） |
| `ai-app/teams/.../collaboration/mission/mission-lifecycle.service.ts:65-77` | **只改 DB，零 abort 调用**                                      | MAJOR（已确认）                     |
| `ai-app/writing/.../writing-mission-lifecycle.service.ts:~199`              | abort 责任委托出去不保证执行                                    | MAJOR（审计报告，待复核）           |
| `ai-app/playground/api/controller/playground.controller.ts:284`             | already-cancelled 时 early-return 跳过 abort                    | MINOR（已确认，本次踩到）           |
| **`MissionAbortRegistry`（`abort-registry.ts:38`）**                        | **进程内 `Map`，非分布式** → 多 pod 时 cancel 落错 pod 静默失效 | HIGH 设计风险（已确认）             |

> 注：`abort-registry` 有 `onApplicationShutdown` 钩子会 abort 本 pod 全部在跑 mission——所以**重启 backend 能可靠止血**，而 SQL 改状态不能。

### 主题四：那次 revert 制造永久维护陷阱

- revert `c6056e795`（2026-06-10）把 playground 冻成 `6f59`（`6f5920258…`，2026-06-08）的 deep-insight 克隆；deep-insight 持续演进 → **两套近乎重复的 agent+pipeline 永久漂移**。
- revert **悄悄抹掉 playground 自有 pipeline 的终态仲裁/平价修复**（`2977aa49a` / `474264d6a` / `477a37cef` 的 playground 半边）→ schema 失败的任务无法 fast-fail，只能静默 thrash（本次「跑两天」放大器）。
- **prose-not-JSON 头号嫌疑**：`gpt-5.4` / `deepseek-v4-pro` 在 BYOK/model-config 的 `isReasoning` 分类（#382「isReasoning 收窄」）可能误判 → finalize 传输路径选错 → 模型吐散文。**已证实，见下。**

### 主题一·补充：prose-not-JSON 的中心根因（生产数据已确证，2026-06-21）

> 结论：**这是单点中心 bug，不是 17 个 agent 各自的问题**——修对一处即可根治。

agent finalize 的结构化输出策略由 `ai-engine/llm/output/structured/structured-output-router.service.ts` →
`ModelCapabilityService.deriveStructuredOutputChain()` 派生，落到具体 adapter（json_schema_strict / json_mode /
tool_use / **prompt**）。`prompt` = 文本夹 JSON 的脆弱路径。router 已接入 `react-loop.ts` / `llm-executor.ts`。

**生产 `ai_models` 表实测**：

- `gpt-5.4`：`structured_output_strategy=json_schema_strict`，supports json_schema/tool/json_mode 全 true（配置正确）。
- `deepseek-v4-pro`：**catalog 里根本没有这一行**（只有 `deepseek-reasoner`，且 `is_enabled=false`）→ 未知模型 → 派生链兜底到 **`prompt`**。
- 三个候选行 `is_enabled=false`，但 mission 实际用了 gpt-5.4 + deepseek-v4-pro → **走的是 BYOK / 用户自配路径**。

**关键代码事实**：`ai-engine/llm/byok/user-models-auto-configure.service.ts` 自动配 BYOK 模型时
**既不写 `structuredOutputStrategy` 也不写 `supports*` 标志** → Prisma 默认 `null` + 全 `false` →
capability 链派生到 **`prompt`**。于是 BYOK 下即便 catalog 配了 json_schema_strict 的 gpt-5.4 也被绕过，
和 deepseek-v4-pro 一起落到 `prompt` → 强模型把万字 markdown 写进 finalize 槽 → `extractJson` 得字符串 →
object schema reject → thrash。

**最终核实（工作流 + 复核，2026-06-21）**：原"isReasoning 误判"假设**被证伪**——`gpt-5.4`(isReasoning=true)
与 `deepseek-v4-pro`(isReasoning=false)分类都正确，且 finalize 传输路径**不分支于 isReasoning**。wire 层
native mode 由 catalog 经 `resolveEffectiveNativeMode` 派生（gpt-5.4→json*schema_strict；deepseek-v4-pro 经
provider="deepseek"+`/v4[-*]?pro/` Pass-2 匹配→json_mode），对这两个模型**是对的**。

**真正中心根因（已修复）**：`ai-harness/runner/loop/react-loop.ts` 只在 `approachingLimit`（≤2 轮剩余）时才把
业务 finalize schema 嵌进 native 请求（`buildFinalizeDecisionSchema`）；**正常轮次用宽松的
`REACT_LOOP_DECISION_JSON_SCHEMA`**。强写手模型**提前 finalize** 时把万字 markdown 当**字符串**塞进
`action.output`——宽松 schema 下合法，只能 post-parse 才发现 → `<root>: Expected object, received string` →
reject → 重试 → thrash。

> **修复**：把触发条件从 `approachingLimit` 扩成 `approachingLimit || finalizeAlreadyRejected`——**一旦某次
> finalize 被 schema 拒**，下一次就强制走 strict finalize schema（provider 层强约束对象形状）。安全性：finalize-reject
> 的 critique 本就要求模型"停止 tool、用现有结果 finalize"，故强制 finalize-only schema 与既有意图一致，不会误堵工具。
> 改动：`react-loop.ts`（reason() 加 `finalizeAlreadyRejected` 参数 + 触发条件）+ 单测
> `structured-output.spec.ts`。验证：loop 226 测试 + arch 473 + type-check 0 全绿。

**残留次要隐患（另开 ticket，非本次）**：`base-http-caller.ts:resolveEffectiveNativeMode` 构造 capability projection
时**不带 apiFormat** → catalog Pass-1 跳过；对 gpt-5.4/deepseek-v4-pro 靠 Pass-2 provider 匹配仍 OK，但 **BYOK
用网关别名 provider slug（如 "custom"/"agnes"）会 miss catalog → SAFE_DEFAULTS nativeMode="none" → 无
response_format → 散文**。且 `byok/user-models-auto-configure.service.ts` 自动配模型时不写
`structuredOutputStrategy`/`supports*`。属 provider-slug/projection 健壮性问题，建议单独修。

---

## 5. 为什么会漏到生产（四层防护同时失守）

1. **revert 只验编译不验真跑**：`c6056e795` 验证标准是「tsc 0 / 测试全绿」，没跑一次真实 deep mission。
2. **换模型不做回归**：契约按老确定性模型调的，上了 gpt-5.4/deepseek 没做端到端回归。
3. **mock 测试给假信心**：1913 个测试几乎全 mock LLM，不验真实 finalize 是否合法 JSON、不验成本上限。
4. **断路器只防冻死不防空转**：为「别误杀正经长任务」把上限调松，留了对称的假阴性大洞。

> 对照 CLAUDE.md「Claude Code 反向洞察」#5（断路器）与「运行时验证而非只类型检查」——规范已写，但全是 honor-only，没有自动化拦截。

---

## 6. 系统性修复方案（分级）

> **修复进度（2026-06-21，分支 `fix/mission-runaway-systemic`，未 push）**
>
> - ✅ **P0 全部完成**（工作流 wf_afc54549-31e 自驱实现 + 复核）：无进度/成本断路器、Teams/Insight liveness 注册、
>   cancel 四处先 fire abort、deep 档上限收紧（24h→6h / 20000→12000 credits，并堵住 user override 重新撑大的洞）。
> - ✅ **prose-not-JSON 中心根因已修**（见主题一·补充）：react-loop finalize schema 在 reject 后即升级 strict。
> - ⏳ **P1-2（playground 去留）** 仍需你拍板（唯一不可逆决策）。
> - ⏳ **残留次要隐患**（provider-slug projection / BYOK 不写 capability 标志）建议另开 ticket。
> - 验证：type-check 0 / loop 226 测试 / arch 40 套 473 测试 全绿。

### P0（先止血，覆盖面最大）

- **P0-1 全平台「成本速率 / 无进度」断路器**：新增共享原语，监控每 mission 的 token/cost 增速 + stage 是否长期不推进；超阈值（如 N 分钟无 `last_completed_stage` 推进且持续烧 token）→ 主动 `abortRegistry.abort(mission_no_activity)`。
  - 验证：构造一个反复 validation-reject 的 mission，断言 ≤ 阈值时间内被 abort、状态落 failed、不再出 LLM 事件。
- **P0-2 给 Teams / Insight 注册 mission 级 liveness + wall-time/cost cap**。
  - 验证：Teams/Insight 各跑一个长任务，断言超 wall-time 被 markFailed。
- **P0-3 cancel 无条件先 fire abort**（4 处：playground/insight/teams/writing），把 `abortRegistry.abort()` 移到任何 status early-return **之前**；Teams 补 abort 调用。
  - 验证：对 already-cancelled / running 两种状态各调 cancel，断言 abort 都被调用；Teams cancel 后内存 loop 收到 signal。
- **P0-4 证实并修 `isReasoning` 对 gpt-5.4 / deepseek-v4-pro 的分类**（prose-not-JSON 直接开关）。
  - 验证：对这两个模型跑 writer agent，断言 finalize 走结构化路径、输出过 schema。
- **P0-5（设计决策）`MissionAbortRegistry` 跨 pod**：评估 Redis pub/sub abort 或 cancel 路由到持有 controller 的 pod；当前单 pod 可暂缓，但需登记风险。

### P1（根治）

- **P1-1 高危长文 agent 改 native 结构化输出**（function-calling / JSON mode）兜底，而非再加抽取补丁。优先 chapter-writer / writer / integrator / analyst（含 deep-insight 克隆）。
- **P1-2 决策 playground 去留**：forward-port `2977aa49a`+`474264d6a` 的 playground 半边，**或**退役 playground 自有 pipeline 改用 deep-insight 能力核（消除永久双克隆）。

### P2（防复发）

- **P2-1 真模型集成测试 + 成本上限断言**：至少一条 deep mission 用真模型跑通并断言 `costUsd < cap`。
- **P2-2 把 #5 断路器、运行时验证从 honor-only 升级为 spec/lint 拦截**。

---

## 7. 复核清单（动代码前必做）

- [ ] 复核 insight `mission-lifecycle.service.ts` cancel 跳过 abort 的确切行号
- [ ] 复核 writing cancel 委托链是否真调 `dispatcher.abortMission`
- [ ] 锁定 `isReasoning` 判定点 + gpt-5.4/deepseek 的实际取值
- [ ] 确认 P1-2 方向（forward-port vs 退役）后再动 playground/deep-insight
