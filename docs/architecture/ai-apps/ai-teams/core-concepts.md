# AI Teams 核心概念

> **版本**: v1.0
> **最后更新**: 2026-01-15
> **状态**: Active

---

## 概述

AI Teams 是 Genesis.ai 的核心能力层，实现了"像真实团队一样运作的 AI 协作系统"。本文档定义 AI Teams 的核心抽象和概念模型。

---

## 核心抽象

### 1. Mission（任务）

**定义**: 用户下发给 AI Team 的完整工作任务，是协作的起点和终点。

**生命周期**:

```
created → parsing → planning → executing → reviewing → delivering → completed/failed
```

**核心属性**:

| 属性          | 类型              | 说明                                |
| ------------- | ----------------- | ----------------------------------- |
| `id`          | MissionId         | 任务唯一标识                        |
| `teamId`      | TeamId            | 执行团队 ID                         |
| `userId`      | string            | 发起用户                            |
| `input`       | MissionInput      | 任务输入（提示词、文件、URL、要求） |
| `constraints` | ConstraintProfile | 约束配置（成本、质量、效率）        |
| `status`      | MissionStatus     | 当前状态                            |

**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/mission.interface.ts`

---

### 2. Team（团队）

**定义**: AI Agent 的组织单元，包含 Leader 和 Members，共享工作流和约束。

**团队结构**:

```
Team
├── Leader (ITeamMember)
│   ├── Role: Leader 角色定义
│   ├── Model: 使用的 LLM 模型
│   └── Capabilities: 任务分解、调度、审核、整合
│
└── Members[] (ITeamMember[])
    ├── Role: 成员角色定义
    ├── Skills: 技能列表（来自 SkillRegistry）
    ├── Tools: 工具列表（来自 ToolRegistry）
    └── Persona: 角色人设和工作风格
```

**核心属性**:

| 属性                | 类型                     | 说明                   |
| ------------------- | ------------------------ | ---------------------- |
| `id`                | TeamId                   | 团队 ID                |
| `type`              | "predefined" \| "custom" | 预定义团队或自定义团队 |
| `leader`            | ITeamMember              | Leader 成员            |
| `members`           | ITeamMember[]            | 普通成员列表           |
| `workflow`          | IWorkflow                | 工作流定义             |
| `constraintProfile` | ConstraintProfile        | 默认约束配置           |

**实现位置**:

- 抽象: `backend/src/modules/ai-engine/teams/abstractions/team.interface.ts`
- 实现: `backend/src/modules/ai-engine/teams/base/team.ts`

---

### 3. Role（角色）

**定义**: 成员在团队中的职能定义，决定其能力边界和工作风格。

**预定义角色**:

| RoleId          | 名称     | 核心能力           | 典型用途             |
| --------------- | -------- | ------------------ | -------------------- |
| `research-lead` | 研究主管 | 研究规划、质量审核 | Research Team Leader |
| `researcher`    | 研究员   | 信息收集、来源验证 | 信息收集步骤         |
| `analyst`       | 分析师   | 数据分析、趋势洞察 | 分析整合步骤         |
| `writer`        | 撰写员   | 内容创作、文档撰写 | 报告撰写步骤         |
| `designer`      | 设计师   | 视觉设计、排版     | 演示文稿设计         |
| `coder`         | 工程师   | 代码生成、技术实现 | 代码开发任务         |

**核心属性**:

| 属性          | 类型      | 说明                                     |
| ------------- | --------- | ---------------------------------------- |
| `id`          | RoleId    | 角色 ID                                  |
| `name`        | string    | 角色名称                                 |
| `description` | string    | 角色描述                                 |
| `coreSkills`  | SkillId[] | 核心技能列表                             |
| `coreTools`   | ToolId[]  | 核心工具列表                             |
| `workStyle`   | WorkStyle | 工作风格（输出风格、思考深度、风险偏好） |

**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/role.interface.ts`

---

### 4. Member（成员）

**定义**: 角色的运行时实例，携带具体的 LLM 模型和个性化配置。

**成员状态机**:

```
idle → thinking → executing → waiting → completed/failed → idle
```

**核心属性**:

| 属性        | 类型         | 说明                                                |
| ----------- | ------------ | --------------------------------------------------- |
| `id`        | TeamMemberId | 成员 ID                                             |
| `name`      | string       | 成员名称                                            |
| `role`      | IRole        | 角色定义                                            |
| `model`     | string       | 使用的 LLM 模型（如 `gpt-4o`, `claude-3.5-sonnet`） |
| `skills`    | SkillId[]    | 可用技能（继承自 Role + 额外技能）                  |
| `tools`     | ToolId[]     | 可用工具（继承自 Role + 额外工具）                  |
| `persona`   | string       | 角色人设（个性化系统提示词）                        |
| `workStyle` | WorkStyle    | 工作风格（影响 temperature、输出长度等）            |

**Leader 扩展能力**:

```typescript
interface ILeader extends ITeamMember {
  decomposeTask(task: TaskInput): Promise<SubTask[]>;
  assignTask(subTask: SubTask, member: ITeamMember): Promise<TaskAssignment>;
  reviewOutput(output: MemberOutput): Promise<ReviewResult>;
  integrateResults(results: MemberOutput[]): Promise<IntegratedResult>;
  decideRework(review: ReviewResult): Promise<ReworkDecision>;
}
```

**实现位置**: `backend/src/modules/ai-engine/teams/abstractions/member.interface.ts`

---

### 5. Workflow（工作流）

**定义**: 团队执行任务的步骤编排，定义依赖关系和执行顺序。

**工作流类型**:

| 类型         | 说明       | 适用场景           |
| ------------ | ---------- | ------------------ |
| `sequential` | 顺序执行   | 步骤之间强依赖     |
| `parallel`   | 并行执行   | 步骤之间无依赖     |
| `dag`        | DAG 图执行 | 复杂依赖关系       |
| `hybrid`     | 混合模式   | 部分并行、部分顺序 |

**步骤类型**:

| 类型       | 说明         | 示例                 |
| ---------- | ------------ | -------------------- |
| `task`     | 普通任务步骤 | 信息收集、分析、撰写 |
| `review`   | 审核步骤     | Leader 质量审核      |
| `decision` | 决策节点     | 根据条件选择分支     |
| `parallel` | 并行容器     | 包含多个并行子步骤   |
| `loop`     | 循环步骤     | 重复执行直到满足条件 |

**示例：Research Team Workflow**:

```
framework (task)
    ├── info-gathering-1 (parallel task)
    ├── info-gathering-2 (parallel task)
    └── info-gathering-3 (parallel task)
        └── analysis (task)
            └── writing (task)
                └── review (review)
```

**实现位置**:

- 抽象: `backend/src/modules/ai-engine/teams/abstractions/workflow.interface.ts`
- 实现: `backend/src/modules/ai-engine/teams/base/workflow.ts`

---

### 6. Constraint（约束）

**定义**: 限制 Mission 执行的边界条件，确保可控性和可预测性。

**三大约束维度**:

#### 6.1 成本约束 (CostConstraints)

| 字段              | 类型   | 说明                                       | 默认值     |
| ----------------- | ------ | ------------------------------------------ | ---------- |
| `maxTokens`       | number | 最大 Token 消耗                            | 100000     |
| `maxCost`         | number | 最大成本（积分）                           | 1000       |
| `modelPreference` | string | 模型偏好（`economy`/`balanced`/`premium`） | `balanced` |

#### 6.2 质量约束 (QualityConstraints)

| 字段             | 类型    | 说明                                                               | 默认值             |
| ---------------- | ------- | ------------------------------------------------------------------ | ------------------ |
| `depth`          | string  | 分析深度（`basic`/`standard`/`comprehensive`）                     | `standard`         |
| `accuracy`       | string  | 准确性要求（`best_effort`/`require_evidence`/`strict_validation`） | `require_evidence` |
| `reviewRequired` | boolean | 是否需要审核                                                       | `true`             |
| `minReviewScore` | number  | 最低审核分数（1-10）                                               | `7`                |
| `maxReworks`     | number  | 最大返工次数                                                       | `2`                |

#### 6.3 效率约束 (EfficiencyConstraints)

| 字段                    | 类型    | 说明                   | 默认值       |
| ----------------------- | ------- | ---------------------- | ------------ |
| `maxDuration`           | number  | 最大执行时长（毫秒）   | 3600000 (1h) |
| `parallelism`           | number  | 最大并行度             | `3`          |
| `earlyStopOnGoodEnough` | boolean | 达到"足够好"时提前停止 | `false`      |

**预设配置**:

| Preset     | 说明                                   | 典型场景           |
| ---------- | -------------------------------------- | ------------------ |
| `quick`    | 快速模式：低成本、基础质量、高并行     | 快速概览、初步分析 |
| `balanced` | 均衡模式：中等成本、标准质量、适度并行 | 大部分常规任务     |
| `thorough` | 深入模式：高成本、高质量、低并行       | 深度研究、关键决策 |

**实现位置**: `backend/src/modules/ai-engine/teams/constraints/constraint-profile.ts`

---

## 核心流程

### Mission 执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                    MissionOrchestrator                       │
└─────────────────────────────────────────────────────────────┘
                            │
    ┌───────────────────────┴───────────────────────┐
    ▼                       ▼                       ▼
┌────────┐            ┌─────────┐            ┌──────────┐
│ Phase1 │            │ Phase2  │            │ Phase3   │
│ Parse  │  ──────▶   │  Plan   │  ──────▶   │ Execute  │
└────────┘            └─────────┘            └──────────┘
    │                       │                       │
    │ ParsedIntent          │ ExecutionPlan         │ StepResults
    ▼                       ▼                       ▼
┌────────┐            ┌─────────┐            ┌──────────┐
│ Phase4 │            │ Phase5  │            │ Final    │
│ Review │  ──────▶   │ Deliver │  ──────▶   │ Result   │
└────────┘            └─────────┘            └──────────┘
```

#### Phase 1: Parse（解析意图）

**输入**: `MissionInput`（提示词、文件、URL、要求）
**输出**: `ParsedIntent`（主要目标、任务类型、复杂度评估、执行策略）

**处理逻辑**:

1. 使用 LLM 分析用户输入（如果 LLMFactory 可用）
2. 提取关键信息：主题、实体、时间范围、格式要求
3. 推断任务类型：`research`/`analysis`/`creation`/`coding`/`design`/`debate`/`review`/`mixed`
4. 评估复杂度：`low`/`medium`/`high`/`very_high`
5. 建议执行策略：工作流类型、成员配置、迭代需求

#### Phase 2: Plan（生成执行计划）

**输入**: `ParsedIntent` + `Team` + `ConstraintProfile`
**输出**: `MissionExecutionPlan`（步骤列表、依赖关系、预估成本和时长）

**处理逻辑**:

1. 基于 Team 的 Workflow 生成步骤列表
2. 为每个步骤分配执行者（根据 Role 匹配 Member）
3. 计算依赖关系（DAG 拓扑排序）
4. 预估每个步骤的耗时和成本
5. 添加审核步骤（如果 `constraints.quality.reviewRequired == true`）
6. 添加交付步骤（生成最终交付物）

#### Phase 3: Execute（执行计划）

**输入**: `ExecutionPlan` + `Team` + `ConstraintProfile`
**输出**: `IntermediateOutputs`（各步骤的执行结果）

**处理逻辑**:

1. **拓扑排序**: 找出可执行的步骤（依赖已完成）
2. **并行执行**: 如果多个步骤无依赖，使用 `Promise.all` 并行执行
3. **步骤执行**:
   - **Handoff**: 如果执行者不是 Leader，使用 HandoffCoordinator 委派任务
   - **Skills 调用**: 执行成员的所有技能（从 SkillRegistry 获取）
   - **LLM 调用**: 使用 LLM 融合技能结果和成员人设，生成最终输出
   - **Tools 调用**: 处理 LLM 返回的工具调用（Tool-calling）
4. **资源追踪**: 记录 Tokens 消耗、成本、耗时
5. **约束检查**: 每步执行后检查是否超出约束限制
6. **事件发射**: 发送 `step_started`/`step_completed`/`step_failed` 事件

#### Phase 4: Review（质量审核）

**输入**: `IntermediateOutputs`
**输出**: `ReviewResults`（审核分数、反馈、是否通过）

**处理逻辑**:

1. 对每个步骤的输出调用 Leader 的 `reviewOutput()` 方法
2. Leader 使用 LLM 评估质量（基于 Workflow 的 `reviewConfig.criteria`）
3. 如果审核不通过且未达到 `maxReworks` 限制，触发返工：
   - 构建返工上下文（原输出、审核反馈、问题列表）
   - 重新执行步骤（使用 `executeStepWithRework`）
   - 更新 `intermediateOutputs`
4. 重复审核直到通过或达到最大返工次数

#### Phase 5: Deliver（生成交付物）

**输入**: `IntermediateOutputs` + `ReviewResults`
**输出**: `MissionDeliverable[]`（报告、演示文稿、数据文件等）

**处理逻辑**:

1. 整合所有步骤的输出
2. 使用导出工具（`export-docx`/`export-pdf`）生成文档（如果可用）
3. 生成 JSON 格式的详细报告（包含统计信息）
4. 返回交付物列表

---

## 技能与工具集成

### Skill（技能）

**定义**: 领域专用的可复用能力单元，可调用 LLM、Tools 或外部服务。

**技能执行流程**:

```
Step Execution
    └── Member Skills Execution
        ├── Skill 1: normalizeInput() → execute() → output
        ├── Skill 2: normalizeInput() → execute() → output
        └── Skill 3: normalizeInput() → execute() → output
            └── LLM Fusion (融合技能结果 + Member Persona)
                └── Final Step Output
```

**关键方法**:

- `normalizeInput()`: 标准化输入（从 `previousOutputs` 提取前置技能的结果）
- `execute()`: 执行技能逻辑
- `callLLM()`: 调用 LLM（通过注入的 `ISimpleLLMAdapter`）

**示例技能**:

- `slides-outline-generation`: 大纲生成（输入 sourceText，输出结构化大纲）
- `slides-content-expansion`: 内容扩展（输入大纲，输出详细内容）
- `slides-visual-suggestion`: 视觉建议（输入内容，输出设计建议）

**注册位置**: `backend/src/modules/ai-engine/skills/registry/skill.registry.ts`

---

### Tool（工具）

**定义**: 执行具体操作的原子能力，如搜索、爬取、数据分析、文档导出。

**工具调用方式**:

#### 1. LLM Tool-Calling（推荐）

```
LLM Response
    └── toolCalls: [{ name: "web-search", arguments: {...} }]
        └── MissionOrchestrator.handleToolCalls()
            ├── ToolRegistry.tryGet("web-search")
            └── tool.execute(arguments, context)
```

#### 2. Skills 直接调用

```
Skill.execute()
    └── this.toolRegistry.get("export-pdf").execute(...)
```

**预定义工具**:

- `web-search`: 网络搜索
- `web-scraper`: 网页爬取
- `rag-search`: RAG 检索
- `data-analysis`: 数据分析
- `export-docx`: 导出 Word
- `export-pdf`: 导出 PDF

**注册位置**: `backend/src/modules/ai-engine/tools/registry/tool.registry.ts`

---

## 协作模式

### 1. Leader-Member 委派（Handoff Pattern）

**场景**: Leader 将子任务分配给 Member 执行。

**实现**:

```typescript
// 1. Leader 发起 Handoff
await handoffCoordinator.initiateHandoff({
  fromAgentId: leader.id,
  toAgentId: member.id,
  reason: "执行步骤: 信息收集",
  context: HandoffContextBuilder()
    .withTask({ id, description, progress: 0 })
    .withConstraints(["执行者角色: researcher"])
    .build(),
});

// 2. Member 接受任务（模拟）
return { accepted: true, message: "任务已接受" };

// 3. Member 执行任务
await executeStepFull(step, member, missionId, state, constraints);
```

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 754-800)

---

### 2. 多轮审核与返工（Review-Rework Loop）

**场景**: Leader 审核 Member 输出，如果不合格则返工。

**流程**:

```
Member Output
    ↓
Leader Review (score: 1-10)
    ↓
passed? ──Yes──▶ Accept
    ↓ No
attempt < maxReworks? ──Yes──▶ Rework
    ↓ No
Accept (with warnings)
```

**返工上下文**:

```typescript
interface ReworkContext {
  stepId: string;
  attempt: number;
  previousOutput: unknown;
  reviewFeedback: string;
  issues: string[];
}
```

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 238-307, 1018-1093)

---

### 3. 并行执行（Parallel Execution）

**场景**: 多个无依赖的步骤同时执行，提升效率。

**实现**:

```typescript
// 1. 找出可执行的步骤
const executableSteps = plan.steps.filter(step =>
  !completedSteps.has(step.id) &&
  step.dependencies.every(dep => completedSteps.has(dep))
)

// 2. 并行执行
if (config.enableParallel && executableSteps.length > 1) {
  const results = await Promise.allSettled(
    executableSteps.map(step => executeStepFull(step, ...))
  )
}
```

**约束控制**: `constraints.efficiency.parallelism` 限制最大并行度。

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 600-678)

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

### Skill 数据依赖

**问题**: Skill A 的输出如何传递给 Skill B？

**解决方案**: 双键存储策略

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

## 扩展点

### 1. 自定义 Team

**步骤**:

1. 定义 `TeamConfig`（成员角色、工作流、约束）
2. 注册到 `TeamRegistry`
3. 通过 `TeamFactory.createTeam(config)` 实例化

**示例**: 创建一个"数据分析团队"

```typescript
const dataAnalysisTeam: TeamConfig = {
  id: "data-analysis",
  name: "数据分析",
  type: "custom",
  leaderRoleId: "analyst-lead",
  memberRoles: [
    { roleId: "data-engineer", minCount: 1, maxCount: 2, required: true },
    { roleId: "visualization-expert", minCount: 1, maxCount: 1, required: false }
  ],
  workflow: DATA_ANALYSIS_WORKFLOW,
  constraintProfile: createConstraintProfile("balanced"),
  ...
}
```

---

### 2. 自定义 Role

**步骤**:

1. 定义 `RoleConfig`（技能、工具、工作风格）
2. 注册到 `RoleRegistry`
3. 在 TeamConfig 中引用

**示例**: 创建一个"数据工程师"角色

```typescript
const dataEngineerRole: RoleConfig = {
  id: "data-engineer",
  name: "数据工程师",
  description: "数据清洗、转换和分析",
  category: "technical",
  coreSkills: ["data-cleaning", "sql-query", "statistical-analysis"],
  coreTools: ["data-analysis", "sql-executor"],
  workStyle: {
    outputStyle: "detailed",
    thinkingDepth: "deep",
    riskTolerance: "conservative",
  },
};
```

---

### 3. 自定义 Skill

**步骤**:

1. 继承 `BaseSkill`
2. 实现 `normalizeInput()` 和 `execute()`
3. 注册到 `SkillRegistry`

**示例**: 创建一个"数据清洗"技能

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

### 4. 自定义 Workflow

**步骤**:

1. 定义 `WorkflowConfig`（步骤、依赖、审核配置）
2. 创建 `Workflow` 实例
3. 在 TeamConfig 中引用

**示例**: 创建一个"数据分析工作流"

```typescript
const dataAnalysisWorkflow: WorkflowConfig = {
  id: "data-analysis-workflow",
  type: "sequential",
  steps: [
    {
      id: "load-data",
      name: "数据加载",
      type: "task",
      executorRoles: ["data-engineer"],
      dependsOn: [],
    },
    {
      id: "clean-data",
      name: "数据清洗",
      type: "task",
      executorRoles: ["data-engineer"],
      dependsOn: ["load-data"],
    },
    {
      id: "analyze",
      name: "统计分析",
      type: "task",
      executorRoles: ["analyst"],
      dependsOn: ["clean-data"],
    },
    {
      id: "visualize",
      name: "可视化",
      type: "task",
      executorRoles: ["visualization-expert"],
      dependsOn: ["analyze"],
    },
  ],
};
```

---

## 相关文档

- [Mission 生命周期详解](./mission-lifecycle.md)
- [Workflow 执行机制](./workflow-execution.md)
- [约束引擎设计](./constraint-engine.md)
- [Skills 开发指南](../../guides/skills-development.md)
- [Tools 开发指南](../../guides/tools-development.md)

---

**维护者**: AI Teams Core Team
**反馈渠道**: GitHub Issues

