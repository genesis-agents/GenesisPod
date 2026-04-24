# Topic Insights · Handoff Document · 2026-04-23

> **Session 切换节点**：2026-04-23 session-end
> **下一 session 必读**：本文档 + `docs/tasks/F-topic-insights-functional-restoration.md` + 两份 debug 审计

---

## 一、本 Session 完成项（已 push main）

### 目录架构重构（84/100 SOTA）

- 13 根目录条目 → 9 概念目录 + 3 文件
- Agent-centric 分层：`mission/ agents/ skills/ knowledge/ memory/ artifacts/ api/ shared/ prompts/ intent/`
- Pipeline 最深 2 级（`mission/pipeline/stages/`）
- 所有跨目录 imports 改 `@/` 绝对路径
- Commits：`22c250bad` → `bb5fb8b9a`（7 个 commit）

### God Service 拆分（step 1-2）

- `ComputeUsageService` 从 facade 抽出（-462 行）
- `ReportContentEditingService` 从 facade 抽出（-187 行）
- Facade 从 2,246 → 1,597 行（-29%）

### 配套 SOTA 命名清理（6 个 commit）

- `services/dimension/*.utils.ts` → `utils/dimension/`
- `services/topic-insights-data-export` → `services/data/data-export`
- `services/topic/topic-*` → `services/topic/*`（去前缀）
- `services/data/data-source-*` → `services/data/source-*`（去前缀）
- `topic-insights.gateway.ts` → `gateways/realtime.gateway.ts`
- `services/health/` → `services/monitoring/`

---

## 二、本 Session 遗留问题（严重 · 必须补回）

通过两份审计发现：**H6 legacy sweep 删除 legacy 时把业务功能一起删了，harness 没有完整覆盖**。

### 🔴 P0（不能上线）

1. **16 个 WS 事件仍在 enum，0 个 active emit** → 前端 Leader 动画 / 任务时间线 / 维度进度全部空白
2. **`/mission/adjust` 静默失败**：addDimensions 写 researchTask 表，pipeline 不读 → 返 200 骗用户
3. **`/leader/chat`、`/leader/message` 降级为 ACK** → 动态交互完全丢失
4. **`/topics/from-template` 抛 501**
5. **`/dimensions/:id/refresh` 抛 501**
6. **`/templates` 返 `[]`**（getDefaultDimensionsByType 实现体就是 `return []`）
7. **4 个 config 删除**：
   - `framework-skills.config.ts` → 12 个 skill.md 孤儿（MACRO/TECHNOLOGY/COMPANY/EVENT 框架分析丢失）
   - `prompt-adaptation.config.ts` → Tier 自适应 prompt 丢失（cheap 模型质量风险）
   - `dimension-templates.config.ts` → 模板系统废弃
   - `agent-roles.config.ts` → 角色风格统一丢失

### 🟠 P1

8. `reviewTaskResult` 无条件 auto-approve（审查完全没了）
9. `@OnEvent(RECOVERY_NEEDED)` 是 no-op（自动恢复机制关闭）
10. `leaderAgenticSearch` 删除（Leader 主导 agentic search 丢失）
11. `EvidenceSyncCompensationService` 删除
12. `DataEnrichmentService` 4 个 search 后处理方法删除

### 🟡 P2

13. task 级 retry / cancel 降为 mission 级（粒度变粗）
14. `continueExecution` / `resumeExecutionForNewTask` 删除
15. 动态 agent 选择 → spec 静态绑定
16. 模板管理 5 方法（recommend/getAsync/syncBuiltIn/createCustom/update）删除
17. 程序化创建维度 3 方法删除
18. `topic-insights.service.ts` 仍 1,597 行 god facade
19. `services.ts` compat barrel 仍在（16 个内部消费者）

详细证据：`debug/topic-insights-functional-loss-audit-2026-04-23.md`

---

## 三、下一 Session 必读的 4 份文档

| 文档 | 位置 | 作用 |
|---|---|---|
| 执行路线图 | `docs/tasks/F-topic-insights-functional-restoration.md` | **F1-F8 分批执行方案** |
| 功能丢失审计 | `debug/topic-insights-functional-loss-audit-2026-04-23.md` | 原始丢失清单 + 证据 |
| 目录现状审计 | `debug/topic-insights-current-state-audit.md` | 当前目录结构 + SOTA 评分 |
| 本交接文档 | `debug/topic-insights-handoff-2026-04-23.md` | 上下文 + 红线 |

---

## 四、红线（下一 session 必须遵守）

1. **完整补回原则**：所有丢失功能必须恢复（不接受 fail-fast / deprecated / remove）
2. **反硬编码**：config 独立成文件 + Repository 封装，不内联到 service body
3. **数据与逻辑分离**：`.config.ts` 只放数据，`.service.ts` 只放逻辑
4. **L2 vs L3 分层**：跨 AI App 横切能力放 `ai-engine/llm/`，topic-insights 业务放 `ai-app/topic-insights/`
5. **Harness-native**：不复活旧 service 类名，用新 IAgentSpec / amendment primitive / pipeline hooks 实现等价行为
6. **批次独立**：F1 → F8 顺序推进，每批独立 commit + push + 更新 plan 文档验收状态
7. **不跳测试**：每批完成后 tsc 绿 + jest 全绿才进下一批
8. **遇到想硬编码 / 走捷径的冲动 → 停下来重新设计**

---

## 五、当前代码基线

- branch: main
- HEAD: `bb5fb8b9a` (refactor(topic-insights): R1-R8 agent-centric directory restructure)
- topic-insights tests: 145/145 suites · 4,311 tests 绿
- 全后端 tests: 1,044/1,045 suites · 30,974 tests 绿（唯一失败 `business-logic-simulation-round2.spec.ts` 是 H6 legacy 残留，可忽略，会随 F8 修复）
- tsc: 0 error

---

## 六、下一 session 起步动作

```bash
# 1. 读完 4 份文档
# 2. 确认 git state
git pull --rebase origin main
git log --oneline -10   # 确认 HEAD 在 bb5fb8b9a 或更新

# 3. 运行基线测试
cd backend
npx tsc --noEmit --project tsconfig.json
npx jest src/modules/ai-app/topic-insights --no-coverage

# 4. 开始 F1
#    - 创建 artifacts/topic/templates/
#    - 创建 skills/frameworks/_policy.*
#    - 创建 ai-engine/llm/prompt-adaptation/
#    - 创建 agents/specs/_base-agent-spec.ts
#    - 修 3 个端点 (/templates, /from-template, /refreshDimension)
#    - 跑测试 + commit + push
#    - 更新 docs/tasks/F-topic-insights-functional-restoration.md 的验收表

# 5. F1 完成后再 F2 → F8（严格顺序）
```

---

## 七、TODO Tracker

如果 session 使用 TaskCreate 追踪，建议创建：

- F1 Foundation · configs + Repository 就位
- F2 Leader Interactions · LeaderChatService + intent spec
- F3 Mission Dynamic · Amendment primitive + task-level cancel/retry
- F4 WebSocket Events · 16 emit 方法 + stages 接入
- F5 Search + Evidence · 4 后处理方法 + sync compensation
- F6 Review + Framework + Selection · quality-reviewer 真审 + topicType 注入
- F7 Template + Dimension CRUD · 补 8 个方法
- F8 Final Sweep · facade 瘦身 + barrel 删除 + god 文件拆分评估

---

**Handoff 完成时间**：2026-04-23 session-end
**签收条件**：下一 session 读毕 4 份文档并 ack
