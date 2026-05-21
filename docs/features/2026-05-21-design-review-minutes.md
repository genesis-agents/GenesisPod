# 多路评审纪要 — 对话整理(#1) + Agent Teams 呈现迁移(#2)

**日期：** 2026-05-21
**评审形式：** 四路并行独立评审（架构 / 质量 / 安全 / 产品），各自核验源码后给结论，主持人收敛共识。
**评审对象：** [features/library/conversational-organize-design.md](library/conversational-organize-design.md)（#1）· [features/ai-teams/presentation-migration-design.md](ai-teams/presentation-migration-design.md)（#2）· [ADR-006](../decisions/006-conversational-organize.md) · [ADR-007](../decisions/007-ai-teams-presentation-migration.md)
**基线版本：** v0.2 → 评审后迭代至 **v0.3**

---

## 0. 四路结论

| 评审线        | #1 对话整理                 | #2 Teams 迁移                        |
| ------------- | --------------------------- | ------------------------------------ |
| 架构          | 🔴 需返工（核心 API 认错）  | 🟡 批准但需改                        |
| 质量/可验证性 | 🟡 批准但需改               | 🟡 批准但需改                        |
| 安全          | 🟡 批准但需改（1 阻断）     | 🟡 批准但需改（1 阻断：gateway JWT） |
| 产品/范围     | 🟡 批准但需改（闭环缺撤销） | 🟡 批准但需改（角色卡缺位）          |

**共识结论**：方向（最大化复用、不重造）正确；**#1 必须先修「复用对象认错」+ 回答 2 个 P0 才能开工**；**#2 批准，按修订项推进**。基线迭代为 v0.3（含下列已定项），仍有 7 个开放问题待用户拍板。

---

## 1. 阻断项（必须改，已在 v0.3 落实 / 标 P0）

### #1

- **BLK-1【三线共识·已改】`executeAgent` 不是工具循环。** 实测：`executeAgent` → `AgentExecutorService.executeTask` = 单次 LLM（无 ReAct、无 `tools` 入参、非流式）。真正的工具循环是 **`ToolFacade.chatWithToolsStream()`**（`FunctionCallingExecutor.executeWithContext`，产 `AsyncGenerator<AgentEvent>`，AI Ask 在用）。→ ADR-006 决策 1 + 设计 §3.1/§3.2/§3.3/§5/§7 全部改为基于 `chatWithToolsStream`。
- **BLK-2【架构·已改】单一 facade 入口。** `ToolFacade` 在 **ai-harness**（非 ai-engine）。organize-chat 只 `import @/modules/ai-harness/facade` 一个入口即可（ToolFacade/AiChatService/ITool/ToolRegistry/ToolContext/AgentEvent 全在此 re-export），比原设计「同时调 harness+engine 两 facade」更合规更省。
- **BLK-3【架构+安全·P0 必答】工具子集 + userId 注入机制。** `chatWithToolsStream` 按 `AICapabilityContext`(agentId/teamId/userId/roleId/domain) 经 `AICapabilityResolver` 解析工具，**没有「按次传工具子集」入参**，也需确认 `userId` 能否从 request 流到 `ToolExecutionRequest.context.userId`（否则「userId 行级过滤」是**虚假安全保证**）。→ P0 必须先确认：organize 工具如何只对本 agent 可见（候选：专用 `roleId`/`domain` + resolver role 过滤）+ userId 完整传递链路。**未答不得进 P1。**
- **BLK-4【质量·P0 必答】`conversationHistory` 没有注入槽。** `chatWithToolsStream` 从 systemPrompt+userPrompt 重建 messages，无历史注入 → 多轮「继续追加指令」无法实现。需定历史注入机制。
- **BLK-5【质量+安全·已改】`OrganizeSession` 建表缺失。** ADR-006 已选独立会话表，但分阶段无 schema/手写迁移（违反交付自检 #1）。→ P1 纳入 `OrganizeSession` model + `organize_sessions` 手写迁移；§9 自相矛盾的「会话开放问题」移除。**新增 model 属架构决策，落地前单独确认。**
- **BLK-6【安全·已改】`modelConfig` 须显式 provider/modelId/apiKey（BYOK）。** `chatWithToolsStream` 不走 `chat()` 的自动计费/模型解析；organize-chat 需复用 ai-ask 流式同款「用户默认模型 + BYOK Key 解析」链路取 modelConfig，并在 SSE done 后**显式扣费**（按 `AgentEvent.complete.tokensUsed`）。

### #2

- **BLK-7【安全·阻断·前置】`AiTeamsGateway` userId 来自 `handshake.auth.userId` 无 JWT 验证**（`ai-teams.gateway.ts:74`，无 `JwtAuthGuard`）→ 任意客户端可伪造 userId 加入他人 topic。迁移**复用该 gateway 前必须先修**：handshake 验 JWT 解出 userId，不信任客户端传值。
- **BLK-8【架构+质量·已改】派生层锚点路径错。** 实际是 `lib/features/agent-playground/derive.ts`、`lib/features/ai-social/derive-social-stages.ts`（多了 `features/`）。→ 设计 §5/§6 + ADR-007 + 标准 21 §8 锚点订正为 `lib/features/...`；ai-teams 派生层落 `lib/features/ai-teams/`。
- **BLK-9【质量·已改/P0】`useAgentPlaygroundStream` 硬绑 `/agent-playground` namespace + 丢弃无 `.` 的事件**；ai-teams 原生事件（`mission:agent_working`/`task:status`/…）会被丢弃。→ P1 泛化必须含 namespace 参数化 + join 协议 + replay 端点差异方案；P0 调研产出 ai-teams 全部事件名（已知 12 个）→ `MissionEvent` 映射表 + adapter 工作量估算。
- **BLK-10【产品·已改】角色卡无落点。** Screenshot_100 要角色卡，`team-topology/avatars/` 已有 10 个现成组件，但设计 tab/布局没给它位置。→ §3 明确：角色卡在**左栏**（拓扑下方），数据取 `view.agents`，点击展开该 agent 子任务/产出/状态。
- **BLK-11【质量·已改】god-class 功能映射清单缺失。** P3「不丢功能」无可测依据。→ P0 同步产出「3153 行逐功能 → 新落点」清单（取消/重试/分享/加入/编辑…），作为 P3 验收输入。

---

## 2. 已采纳的设计修订（v0.3，无需再议）

- #1 改用 `chatWithToolsStream`；单一 harness facade 入口；工具实现为 `ITool` 但**显式工具白名单/role 隔离**（防污染全局，BLK-3）；P1 含 OrganizeSession 迁移。
- #1 安全加固：`itemIds` 单次上限（建议 100，超限拒绝不截断）；写工具校验 `itemIds ⊆ 本会话 list_items 返回集`（防 prompt 注入幻构 ID）；**绝不注册 `batchDeleteItems`**；外部连接工具只读、模块注释标注「不注册任何回写第三方工具」；`conversationHistory` 服务端 `@ArrayMaxSize`。
- #1 体验闭环：补**单步即时撤销**（反向调既有 batch，成本低）+ **破坏性/批量>N(20) 执行前意图预演确认**（小改直接执行）；补一条「已读的别动」带条件过滤的端到端样例时序（证明工具粒度能表达组合意图）。
- #1 `tag_items set` 大批量 + `batchUpdateTags` 逐条 UPDATE 的性能：工具层加条数上限（见上）。
- #2 `MissionTab` 契约收紧为 `{ key, label, component: CanonicalTabKey, adapt: (view)=>TabProps }`（业务只能**选** canonical tab + 数据适配，不能传任意 ReactNode 自渲染——锁死「平台定呈现」）。
- #2 P1.5 canonical tab **先抽 3 个有明确复用源的**（TaskList→DataTable / Report→report-viewer / References→citations），ActionLog/Messages/Compute 等**第二消费方出现再抽**（YAGNI，标准 22 §4.2「3 处再抽象」）。
- #2 复用 `ai-social/mission-detail/SocialMissionPage.tsx`（已用 Frame 跑通）作为详情页装配范例。

---

## 3. 强成功标准（评审补强，已并入设计 §7）

- #1 P1：mock `chatWithToolsStream` 产 toolCall 事件流 → 断言对应 `CollectionsService` 方法被调且参数含**服务端注入 userId** + SSE 转发 + 库实际写入；`tsc` 0。
- #1 P2：真机「选书签→『给最近 20 条打标 research』→工具卡片→集合实际变化」；`audit:ui-discipline` 基线不上涨。
- #2 P0：产出 ai-teams 12 事件 → MissionEvent 映射表 + 明确「需/不需 adapt-events.ts」+ 预估行数；功能映射清单。
- #2 P1：`useMissionStream` 接受 `namespace`+`replayEndpoint` 参数；playground fixture 回归全绿。
- #2 P2：`lib/features/ai-teams/__tests__/deriveTeamsView.fixture.spec.ts` 用生产快照断言 stages>0/status/含 leader 角色。
- #2 P4：`grep ai-teams/[topicId]/page` 0 引用；tsc/lint/audit 0。

---

## 4. 仍待用户拍板的开放问题（附评审推荐默认值）

| #   | 问题                            | 推荐默认（评审共识）                                                                                                                                         |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | #1 工具隔离机制（BLK-3）        | 专用 `roleId`/`domain` + resolver role 过滤（最省）；若 resolver 不支持「只给某 role 这批工具」，再评估补 harness 显式白名单入口（属改公共能力，需单独确认） |
| Q2  | #1 单步撤销做不做               | **做**单步即时撤销（反向调 batch），不做多步撤销栈                                                                                                           |
| Q3  | #1 执行前意图预演确认           | 破坏性/批量 >20 条预演确认，小改直接执行                                                                                                                     |
| Q4  | #1 `OrganizeSession` 新建 model | 批准独立建表（手写迁移）；否则本期内存态、下期补表                                                                                                           |
| Q5  | #1 计费口径                     | 按轮（1 次 ai-ask 口径），对用户可预期                                                                                                                       |
| Q6  | #1 MVP「三类一起」语义          | 解读为「最终三类都要」，交付上 P1-P2 先书签打通范式、P3 复制到笔记/外部（同形工具，scope 切换）                                                              |
| Q7  | #2 旧 god-class 下线节奏        | 灰度并存（feature flag），新页跑通再切；P0 确认是否需路由分流                                                                                                |

---

## 5. 放行条件

- **#1**：BLK-3 / BLK-4 两个 P0 在调研中给出明确答案 + Q1–Q5 用户拍板 → 锁 v1.0 → 开 P1。
- **#2**：BLK-7（gateway JWT）修复列为 P0 前置 + BLK-9 P1 泛化方案产出 + Q7 定 → 开 P0 调研。

> 评审依据的源码（四线交叉核实）：`ai-harness/facade/{ai.facade,domain/tool.facade,domain/agent.facade,sub-facades/agent.sub-facade,sub-facades/tool-exec.sub-facade,types/facade.types,index}.ts`、`runner/executor/{function-calling-executor,agent-executor.service}.ts`、`runner/capabilities/ai-capability-resolver.service.ts`、`ai-engine/facade/index.ts`、`ai-app/library/collections/collections.service.ts`、`ai-app/teams/ai-teams.gateway.ts`、`frontend/components/common/mission-detail/`、`frontend/components/common/team-topology/`、`frontend/components/agent-playground/`、`frontend/lib/features/{agent-playground,ai-social}/`、`frontend/hooks/features/useAgentPlaygroundStream.ts`、`frontend/app/ai-teams/[topicId]/page.tsx`、标准 21/22/02/10。
