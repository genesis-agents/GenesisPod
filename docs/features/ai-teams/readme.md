# AI Teams 产品文档

> AI Teams 是 Genesis.ai 的核心能力，实现"像真实公司一样运作的 AI 团队"。

---

## 文档索引

### 架构设计

| 文档                                                                                  | 说明                                   | 状态   |
| ------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| [核心概念](../../architecture/ai-apps/ai-teams/core-concepts.md)                      | Mission/Team/Role/Member/Workflow 定义 | Active |
| [Mission 生命周期](../../architecture/ai-apps/ai-teams/mission-lifecycle.md)          | Mission 从创建到完成的详细流程         | Active |
| [长文本处理](../../architecture/ai-apps/ai-teams/ai-teams-long-content-e2e-design.md) | 长文本处理端到端设计                   | Active |

### 功能说明

| 文档                                        | 说明                                         | 状态   |
| ------------------------------------------- | -------------------------------------------- | ------ |
| [Topic Research](./topic-research.md)       | 专题研究功能（基于 AI Teams 的典型应用案例） | Active |
| [Debate System](./debate-system.md)         | 辩论系统（多观点对抗和推演）                 | Draft  |
| [Mission Execution](./mission-execution.md) | Mission 执行机制详解                         | Draft  |
| [产品愿景](./ai-teams-product-vision.md)    | 整体产品架构、三层设计、演进路线             | Draft  |

### 开发指南

| 文档                                                            | 说明                 | 状态 |
| --------------------------------------------------------------- | -------------------- | ---- |
| [Skills 开发指南](../../guides/skills-development.md)           | 如何开发自定义 Skill | TODO |
| [Tools 开发指南](../../guides/tools-development.md)             | 如何开发自定义 Tool  | TODO |
| [Custom Teams 配置](../../guides/custom-teams-configuration.md) | 如何配置自定义 Team  | TODO |

### 分析报告

| 文档                                          | 说明                 | 状态    |
| --------------------------------------------- | -------------------- | ------- |
| [Gap Analysis](./gap-analysis.md)             | 现状与目标的差距分析 | Archive |
| [Code Review Report](./code-review-report.md) | 代码审查报告         | Archive |

---

## 核心概念速览

```
用户任务 (Mission)
     │
     ▼
┌─────────────────────────────────┐
│  AI Team                        │
│  ┌───────────┐                  │
│  │  Leader   │ ← 任务分解、调度、审核
│  └─────┬─────┘                  │
│        │                        │
│  ┌─────┴─────┬─────────┐       │
│  ▼           ▼         ▼       │
│ Member    Member    Member     │
│ (Role)    (Role)    (Role)     │
│ Skills    Skills    Skills     │
│ Tools     Tools     Tools      │
└─────────────────────────────────┘
     │
     ▼
约束条件 (Constraints)
├── 成本 (Cost): maxTokens, maxCost, modelPreference
├── 质量 (Quality): depth, accuracy, reviewRequired
└── 效率 (Efficiency): maxDuration, parallelism
```

---

## Mission 执行流程

```
Parse (解析意图)
   ↓
Plan (生成执行计划)
   ↓
Execute (执行步骤)
   ├── Handoff (Leader → Member 委派)
   ├── Skills Execution (执行成员技能)
   ├── LLM Fusion (融合技能结果 + 成员人设)
   └── Tool-Calling (处理工具调用)
   ↓
Review (Leader 审核)
   ├── 通过 → Deliver
   └── 不通过 → Rework (返工)
   ↓
Deliver (生成交付物)
   └── Mission Result (报告、演示文稿、数据等)
```

---

## 预定义 Teams

| Team ID    | 名称     | 用途                     | 实现状态   |
| ---------- | -------- | ------------------------ | ---------- |
| `research` | 深度研究 | 专业级深度研究，输出报告 | ✅ Active  |
| `report`   | 报告撰写 | 生成结构化文档           | ⚙️ Partial |
| `debate`   | 辩论推演 | 多观点对抗和推演         | ⚙️ Partial |
| `slides`   | 演示文稿 | PPT 大纲和内容生成       | ⚙️ Partial |
| `coding`   | 代码开发 | AI 编程助手              | 📋 Planned |
| `design`   | 视觉设计 | UI/UX 设计生成           | 📋 Planned |

---

## 预定义 Roles

| Role ID         | 名称     | 核心能力           | 使用场景             |
| --------------- | -------- | ------------------ | -------------------- |
| `research-lead` | 研究主管 | 研究规划、质量审核 | Research Team Leader |
| `researcher`    | 研究员   | 信息收集、来源验证 | 信息收集步骤         |
| `analyst`       | 分析师   | 数据分析、趋势洞察 | 分析整合步骤         |
| `writer`        | 撰写员   | 内容创作、文档撰写 | 报告撰写步骤         |
| `designer`      | 设计师   | 视觉设计、排版     | 演示文稿设计         |
| `coder`         | 工程师   | 代码生成、技术实现 | 代码开发任务         |
| `debater`       | 辩论者   | 观点提出、逻辑推理 | 辩论系统             |
| `reviewer`      | 审核员   | 质量评估、反馈生成 | 审核步骤             |

---

## 实际应用案例

### 1. Topic Research（专题研究）

**场景**: 用户需要深度研究"AI 编程助手市场现状"

**流程**:

1. 用户创建 Topic + 启动 Mission
2. Leader（gpt-5-preview）规划研究策略：
   - 维度 1: 市场规模和增长趋势
   - 维度 2: 主要玩家和竞争格局
   - 维度 3: 技术路线和差异化
   - 维度 4: 用户需求和痛点
3. Researcher Agents 并行研究各维度
4. Leader 审核各维度结果
5. Writer Agent 合成最终报告
6. 生成交付物：Markdown 报告 + PDF

**实现位置**: `backend/src/modules/ai-app/research/topic-research/`

**文档**: [Topic Research 功能说明](./topic-research.md)

---

### 2. AI Office - Slides Generation（演示文稿生成）

**场景**: 用户输入长文本，生成 PPT 大纲和内容

**流程**:

1. 用户提交 Mission（输入文本 + 目标页数）
2. Leader 分解任务：
   - Step 1: 大纲生成（Designer Agent）
   - Step 2: 内容扩展（Writer Agent）
   - Step 3: 视觉建议（Designer Agent）
3. 各步骤执行（使用 Skills: `slides-outline-generation`, `slides-content-expansion`）
4. Leader 审核
5. 生成交付物：JSON 格式的 Slides 数据

**实现位置**: `backend/src/modules/ai-app/ai-office/slides/`

---

### 3. Debate System（辩论系统）

**场景**: 用户提出辩题，AI 团队进行多轮辩论

**流程**:

1. 用户创建辩题 Mission
2. Leader 分配正反方角色
3. Debater Agents 多轮辩论：
   - 正方提出观点
   - 反方反驳
   - 正方回应
   - ...（最多 N 轮）
4. Leader 总结双方观点
5. 生成交付物：辩论记录 + 观点对比表

**实现位置**: `backend/src/modules/ai-app/teams/services/collaboration/debate.service.ts`

**文档**: [Debate System 功能说明](./debate-system.md)

---

## 技术亮点

### 1. 真正的并行执行

- 自动识别无依赖步骤
- 使用 `Promise.allSettled` 并行执行
- 典型性能提升：3 个维度并行研究，耗时从 15 分钟缩短到 5 分钟

### 2. 多轮审核与返工

- Leader 使用 LLM 审核成员输出（1-10 分）
- 不通过时自动返工（最多 N 次）
- 确保最终交付物质量

### 3. Skills + LLM Fusion

- 成员的技能先执行，产生结构化中间结果
- LLM 融合技能结果 + 成员人设，生成最终输出
- 既有专业能力，又有灵活性

### 4. 约束驱动

- 成本约束：maxTokens, maxCost
- 质量约束：depth, accuracy, reviewRequired
- 效率约束：maxDuration, parallelism
- 每步执行后检查，超出则中止

### 5. 异步规划 + 实时进度

- Leader 规划（AI 推理）异步执行，避免超时
- 通过 WebSocket 实时推送进度
- 前端轮询 + 事件订阅，双保险

---

## 开发路线图

### Q1 2026: 核心能力完善

- [x] MissionOrchestrator 核心流程
- [x] Topic Research 完整实现
- [ ] Skills + Tools 生态扩展
- [ ] Custom Teams 配置化

### Q2 2026: 产品化

- [ ] AI Office 全套能力（Report/Slides/Design）
- [ ] Debate System 优化
- [ ] Multi-Agent Collaboration 可视化
- [ ] 用户自定义 Teams UI

### Q3 2026: 开放平台

- [ ] Teams Marketplace（社区共享 Teams）
- [ ] Skills SDK（第三方开发 Skills）
- [ ] API 开放（企业集成）

---

## 相关技术文档

这些文档位于 `docs/architecture/`，包含现有实现的技术细节：

- [AI Teams 架构改进计划](../../architecture/ai-teams-architecture-improvement-plan.md)
- [AI Teams 核心集成计划](../../architecture/ai-teams-core-integration-plan.md)

---

## 贡献指南

欢迎贡献！请遵循以下流程：

1. 阅读 [核心概念](../../architecture/ai-apps/ai-teams/core-concepts.md) 理解架构
2. 选择要贡献的领域：
   - 新增 Skill → 参考 [Skills 开发指南](../../guides/skills-development.md)
   - 新增 Tool → 参考 [Tools 开发指南](../../guides/tools-development.md)
   - 新增 Team → 参考 [Custom Teams 配置](../../guides/custom-teams-configuration.md)
3. 提交 PR，包含：
   - 代码实现
   - 单元测试
   - 功能文档（放在 `docs/features/ai-teams/`）

---

**最后更新**: 2026-01-15
**维护者**: AI Teams Core Team
**反馈渠道**: GitHub Issues
