# AI Teams 架构文档

> AI Teams 核心架构和设计文档索引

---

## 文档导航

### 核心概念

| 文档                                       | 说明                                              | 状态   |
| ------------------------------------------ | ------------------------------------------------- | ------ |
| [核心概念](./core-concepts.md)             | Mission/Team/Role/Member/Workflow/Constraint 定义 | Active |
| [Mission 生命周期](./mission-lifecycle.md) | Mission 从创建到完成的详细流程（6 个 Phase）      | Active |

### 设计文档

| 文档                                                          | 说明                     | 状态   |
| ------------------------------------------------------------- | ------------------------ | ------ |
| [长文本处理端到端设计](./ai-teams-long-content-e2e-design.md) | 长文本处理的完整设计方案 | Active |
| [长文本处理机制](./ai-teams-long-text-processing.md)          | 长文本处理的技术实现细节 | Active |

### 改进计划（历史文档）

| 文档                                                        | 说明                       | 状态    |
| ----------------------------------------------------------- | -------------------------- | ------- |
| [架构改进计划](./ai-teams-architecture-improvement-plan.md) | 早期架构改进规划           | Archive |
| [核心集成计划](./ai-teams-core-integration-plan.md)         | AI Engine 核心能力集成计划 | Archive |

---

## 快速开始

### 理解 AI Teams

**推荐阅读顺序**:

1. [核心概念](./core-concepts.md) - 理解 Mission/Team/Role/Member/Workflow
2. [Mission 生命周期](./mission-lifecycle.md) - 理解 Mission 执行流程
3. [Topic Research 应用案例](../../features/ai-teams/topic-research.md) - 看实际应用

### 开发新功能

**推荐路径**:

1. 阅读 [核心概念](./core-concepts.md) 的"扩展点"章节
2. 根据需求选择扩展方式：
   - 新增 Team → 定义 TeamConfig + Workflow
   - 新增 Role → 定义 RoleConfig（技能 + 工具 + 工作风格）
   - 新增 Skill → 继承 BaseSkill，实现 execute()
   - 新增 Tool → 继承 BaseTool，实现 execute()
3. 参考现有实现（如 `research-team.ts`、`slides-outline-generation.skill.ts`）

---

## 核心抽象速览

### Mission（任务）

用户下发给 AI Team 的完整工作任务。

**生命周期**:

```
created → parsing → planning → executing → reviewing → delivering → completed/failed
```

**关键接口**: `IMission`, `MissionInput`, `MissionResult`
**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/mission.interface.ts`

---

### Team（团队）

AI Agent 的组织单元，包含 Leader 和 Members。

**结构**:

```
Team
├── Leader (任务分解、调度、审核、整合)
└── Members[] (执行具体任务，调用 Skills 和 Tools)
```

**关键接口**: `ITeam`, `TeamConfig`
**实现位置**: `backend/src/modules/ai-engine/teams/base/team.ts`

---

### Role（角色）

成员在团队中的职能定义。

**预定义角色**:

- `research-lead`: 研究主管（Leader）
- `researcher`: 研究员（信息收集）
- `analyst`: 分析师（数据分析）
- `writer`: 撰写员（内容创作）
- `designer`: 设计师（视觉设计）

**关键接口**: `IRole`, `RoleConfig`, `WorkStyle`
**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/role.interface.ts`

---

### Workflow（工作流）

团队执行任务的步骤编排。

**类型**:

- `sequential`: 顺序执行
- `parallel`: 并行执行
- `dag`: DAG 图执行
- `hybrid`: 混合模式

**步骤类型**: `task`（普通任务）、`review`（审核）、`decision`（决策）、`parallel`（并行容器）、`loop`（循环）

**关键接口**: `IWorkflow`, `WorkflowConfig`, `IWorkflowStep`
**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/workflow.interface.ts`

---

### Constraint（约束）

限制 Mission 执行的边界条件。

**三大维度**:

1. **成本约束**: maxTokens, maxCost, modelPreference
2. **质量约束**: depth, accuracy, reviewRequired, minReviewScore, maxReworks
3. **效率约束**: maxDuration, parallelism, earlyStopOnGoodEnough

**预设配置**: `quick`（快速）、`balanced`（均衡）、`thorough`（深入）

**实现位置**: `backend/src/modules/ai-engine/teams/constraints/constraint-profile.ts`

---

## 核心流程

### Mission 执行流程（完整）

```
Phase 1: Parse (解析意图)
    ├── LLM 解析（首选）
    └── 规则解析（降级）
    ↓ ParsedIntent

Phase 2: Plan (生成执行计划)
    ├── 基于 Workflow 生成步骤
    ├── 分配执行者（Role → Member）
    ├── 添加审核步骤（如果启用）
    └── 添加交付步骤
    ↓ MissionExecutionPlan

Phase 3: Execute (执行计划)
    ├── 拓扑排序（找出可执行步骤）
    ├── 并行执行（如果启用）
    └── 步骤执行
        ├── Handoff（Leader → Member 委派）
        ├── Skills 执行（成员技能）
        ├── LLM Fusion（融合技能结果 + 人设）
        ├── Tool-Calling（处理工具调用）
        ├── 资源追踪（Tokens、成本、耗时）
        └── 约束检查（是否超出限制）
    ↓ IntermediateOutputs

Phase 4: Review (质量审核)
    ├── Leader 审核各步骤输出（1-10 分）
    └── 审核不通过 → 返工（最多 N 次）
    ↓ ReviewResults

Phase 5: Deliver (生成交付物)
    ├── 整合所有步骤输出
    ├── 调用导出工具（export-docx/export-pdf）
    └── 生成 JSON 报告
    ↓ MissionDeliverable[]

Phase 6: Completed (完成)
    ├── 返回 MissionResult
    └── 清理资源
```

**详细文档**: [Mission 生命周期](./mission-lifecycle.md)

---

## 协作模式

### 1. Leader-Member 委派（Handoff Pattern）

Leader 将子任务分配给 Member 执行。

**实现**:

```typescript
await handoffCoordinator.initiateHandoff({
  fromAgentId: leader.id,
  toAgentId: member.id,
  reason: "执行步骤: 信息收集",
  context: HandoffContextBuilder()
    .withTask({ id, description })
    .withConstraints(["执行者角色: researcher"])
    .build(),
});
```

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 754-800)

---

### 2. 多轮审核与返工（Review-Rework Loop）

Leader 审核 Member 输出，不合格则返工。

**流程**:

```
Member Output → Leader Review (score: 1-10)
    ↓ passed?
    Yes → Accept
    No → attempt < maxReworks? → Yes → Rework
                               → No → Accept (with warnings)
```

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 238-307)

---

### 3. 并行执行（Parallel Execution）

多个无依赖的步骤同时执行。

**实现**:

```typescript
const executableSteps = plan.steps.filter(step =>
  !completedSteps.has(step.id) &&
  step.dependencies.every(dep => completedSteps.has(dep))
)

if (config.enableParallel && executableSteps.length > 1) {
  const results = await Promise.allSettled(
    executableSteps.map(step => executeStepFull(step, ...))
  )
}
```

**约束控制**: `constraints.efficiency.parallelism` 限制最大并行度

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 600-678)

---

## 技能与工具

### Skill（技能）

领域专用的可复用能力单元。

**关键方法**:

- `normalizeInput()`: 标准化输入（从 previousOutputs 提取前置技能结果）
- `execute()`: 执行技能逻辑
- `callLLM()`: 调用 LLM（通过注入的 ISimpleLLMAdapter）

**示例技能**:

- `slides-outline-generation`: 大纲生成
- `slides-content-expansion`: 内容扩展
- `dimension-research`: 维度研究

**注册位置**: `backend/src/modules/ai-engine/skills/registry/skill.registry.ts`

---

### Tool（工具）

执行具体操作的原子能力。

**调用方式**:

1. **LLM Tool-Calling**（推荐）: LLM 返回 `toolCalls`，Orchestrator 自动调用
2. **Skills 直接调用**: `this.toolRegistry.get("export-pdf").execute(...)`

**预定义工具**:

- `web-search`: 网络搜索
- `web-scraper`: 网页爬取
- `rag-search`: RAG 检索
- `data-analysis`: 数据分析
- `export-docx`: 导出 Word
- `export-pdf`: 导出 PDF

**注册位置**: `backend/src/modules/ai-engine/tools/registry/tool.registry.ts`

---

## 数据流

### Mission 数据流

```
User Input (MissionInput)
    ↓
MissionOrchestrator.parse()
    ↓
ParsedIntent ──────▶ Memory.setWithSession(missionId, "intent", intent)
    ↓
MissionOrchestrator.plan()
    ↓
ExecutionPlan ──────▶ Memory.setWithSession(missionId, "plan", plan)
    ↓
MissionOrchestrator.executePlan()
    ↓
IntermediateOutputs ────▶ state.intermediateOutputs (Map<stepId, output>)
    │                      │
    │                      └──▶ Skill Results (Map<skillId, output>)
    ↓
MissionOrchestrator.review()
    ↓
ReviewResults ──────▶ state.reviewResults
    ↓
MissionOrchestrator.deliver()
    ↓
MissionDeliverable[] ──▶ MissionResult
```

### Skill 数据依赖（双键存储）

```typescript
// 执行 Skill A
const resultA = await skillA.execute(input, context);
state.intermediateOutputs.set("step-1", { skillResults: [resultA] });
state.intermediateOutputs.set("skill-a", resultA.data); // ★ 关键

// Skill B 的 normalizeInput() 可以访问
const previousOutputs = Object.fromEntries(state.intermediateOutputs);
const skillAOutput = previousOutputs["skill-a"]; // ✅ 可获取
```

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 645-661, 711-724)

---

## 扩展示例

### 创建自定义 Team

```typescript
const dataAnalysisTeam: TeamConfig = {
  id: "data-analysis",
  name: "数据分析",
  type: "custom",
  leaderRoleId: "analyst-lead",
  memberRoles: [
    { roleId: "data-engineer", minCount: 1, maxCount: 2, required: true },
    {
      roleId: "visualization-expert",
      minCount: 1,
      maxCount: 1,
      required: false,
    },
  ],
  workflow: DATA_ANALYSIS_WORKFLOW,
  availableSkills: ["data-cleaning", "statistical-analysis"],
  availableTools: ["data-analysis", "sql-executor"],
  constraintProfile: createConstraintProfile("balanced"),
  deliverableTypes: ["report", "data"],
};
```

---

### 创建自定义 Skill

```typescript
export class DataCleaningSkill extends BaseSkill {
  readonly id = "data-cleaning";
  readonly domain = "data-processing";

  async normalizeInput(rawInput: any): Promise<DataCleaningInput> {
    return {
      dataset: rawInput.previousOutputs["data-loading"].dataset,
      rules: rawInput.task.cleaningRules || [],
    };
  }

  async execute(
    input: DataCleaningInput,
    context: SkillContext,
  ): Promise<SkillResult> {
    // 1. 数据清洗逻辑
    const cleanedData = this.cleanData(input.dataset, input.rules);

    // 2. 调用 LLM 生成清洗报告
    const report = await this.callLLM({
      messages: [
        { role: "system", content: "你是数据清洗专家" },
        {
          role: "user",
          content: `分析清洗结果: ${JSON.stringify(cleanedData)}`,
        },
      ],
    });

    return {
      success: true,
      data: { cleanedData, report },
      metadata: { tokensUsed: 0 },
    };
  }
}
```

---

## 相关文档

### 功能文档

- [AI Teams 功能说明](../../features/ai-teams/readme.md)
- [Topic Research 应用案例](../../features/ai-teams/topic-research.md)
- [Debate System](../../features/ai-teams/debate-system.md)

### 开发指南（TODO）

- Skills 开发指南
- Tools 开发指南
- Custom Teams 配置指南

---

**最后更新**: 2026-01-15
**维护者**: AI Teams Core Team
**反馈渠道**: GitHub Issues
