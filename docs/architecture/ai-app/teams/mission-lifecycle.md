# Mission 生命周期详解

> **版本**: v1.0
> **最后更新**: 2026-01-15
> **状态**: Active

---

## 概述

本文档详细描述 AI Teams 中 Mission（任务）从创建到完成的完整生命周期，包括状态转换、事件流、错误处理和资源管理。

---

## 状态机

### 状态定义

```typescript
type MissionStatus =
  | "created" // 已创建，等待执行
  | "queued" // 已加入队列
  | "parsing" // 解析意图中
  | "planning" // 生成计划中
  | "executing" // 执行中
  | "reviewing" // 审核中
  | "delivering" // 生成交付物中
  | "completed" // 已完成
  | "failed" // 失败
  | "cancelled"; // 已取消
```

### 状态转换图

```
[created]
    ↓
[queued] ──────────────┐
    ↓                  │ (cancel)
[parsing] ─────────────┤
    ↓                  │
[planning] ────────────┤
    ↓                  │
[executing] ───────────┤
    ↓                  │
[reviewing] ───────────┤
    ↓                  │
[delivering] ──────────┤
    ↓                  │
[completed]            │
                       ↓
                 [cancelled]
    ↓ (任何阶段出错)
[failed]
```

---

## 阶段详解

### Phase 0: Created（创建）

**触发**: 用户通过 API 提交 Mission

**输入**:

```typescript
interface MissionInput {
  prompt: string; // 任务描述
  files?: UploadedFile[]; // 附加文件
  urls?: string[]; // 参考 URL
  requirements?: string[]; // 额外要求
  resourceIds?: string[]; // 参考资源 ID
  templateId?: string; // 模板 ID
  constraints?: Partial<ConstraintProfile>; // 约束覆盖
  metadata?: Record<string, unknown>; // 元数据
}
```

**处理**:

1. 验证输入（必填字段、格式检查）
2. 生成 `missionId`
3. 合并约束配置（`team.constraintProfile` + `input.constraints`）
4. 创建 Mission 记录
5. 发送 `mission_created` 事件

**状态转换**: `created` → `queued`

---

### Phase 1: Parsing（解析意图）

**目标**: 理解用户意图，提取关键信息，评估任务复杂度。

**状态转换**: `queued` → `parsing`

**事件流**:

1. `parsing_started`: 开始解析
2. `parsing_completed`: 解析完成

**处理逻辑**:

#### 1.1 LLM 解析（首选）

如果 `LLMFactory` 可用，使用 LLM 进行智能解析：

```typescript
const systemPrompt = `你是一个任务分析专家。分析用户输入，提取：
1. 主要目标
2. 次要目标
3. 任务类型（research/analysis/creation/coding/design/debate/review/mixed）
4. 复杂度评估
5. 建议的执行策略

以 JSON 格式输出。`;

const response = await adapter.chat({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: input.prompt },
  ],
  model: llmFactory.getDefaultModel(),
  temperature: 0.3, // 低温度确保一致性
});
```

**LLM 输出示例**:

```json
{
  "primaryGoal": "分析 AI 编程助手市场现状和趋势",
  "secondaryGoals": ["识别主要玩家", "评估技术路线", "预测未来方向"],
  "taskType": "research",
  "complexity": {
    "overall": "high",
    "estimatedSubTasks": 5
  },
  "workflowType": "hybrid",
  "needsIteration": true,
  "needsHumanReview": false
}
```

#### 1.2 规则解析（降级方案）

如果 LLM 不可用，使用关键词匹配：

```typescript
// 任务类型推断
const keywords: Record<TaskType, string[]> = {
  research: ["研究", "调研", "分析", "报告"],
  analysis: ["分析", "评估", "对比", "趋势"],
  creation: ["写", "创作", "生成", "撰写"],
  coding: ["代码", "开发", "实现", "编程"],
  design: ["设计", "UI", "界面", "视觉"],
  debate: ["辩论", "讨论", "对抗", "观点"],
  review: ["审核", "检查", "验证", "评审"],
  mixed: [],
};

// 复杂度评估
let score = 0;
if (promptLength > 500) score += 2;
if (hasFiles) score += 1;
if (hasUrls) score += 1;
if (hasRequirements) score += 1;

const overall: ComplexityLevel =
  score >= 4
    ? "very_high"
    : score >= 3
      ? "high"
      : score >= 2
        ? "medium"
        : "low";
```

**输出**: `ParsedIntent`

```typescript
interface ParsedIntent {
  id: string;
  missionId: MissionId;
  primaryGoal: string;
  secondaryGoals: string[];
  extractedInfo: {
    topics: string[];
    entities: NamedEntity[];
    timeRange?: TimeRange;
    language?: string;
  };
  taskType: TaskType;
  complexity: ComplexityAssessment;
  suggestedStrategy: ExecutionStrategy;
  confidence: number; // 0-1，LLM 解析为 0.9，规则解析为 0.8
}
```

**持久化**:

```typescript
await memoryService.setWithSession(missionId, "intent", intent);
```

**状态转换**: `parsing` → `planning`

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 347-437)

---

### Phase 2: Planning（生成执行计划）

**目标**: 基于意图和团队配置，生成可执行的步骤计划。

**状态转换**: `planning` → `executing`

**事件流**:

1. `planning_started`: 开始规划
2. `planning_completed`: 规划完成

**处理逻辑**:

#### 2.1 基于 Workflow 生成步骤

```typescript
const steps: ExecutionStep[] = [];
const workflow = team.workflow;

for (const workflowStep of workflow.steps) {
  // 1. 分配执行者
  const executors = workflowStep.executorRoles.map((roleId) => {
    const members = team.getMembersByRole(roleId);
    return members[0]?.id || roleId;
  });

  // 2. 预估耗时和成本
  const stepDuration = estimateStepDuration(
    workflowStep.type,
    constraints.quality.depth,
  );
  const stepCost = estimateStepCost(
    stepDuration,
    constraints.cost.modelPreference,
  );

  steps.push({
    id: workflowStep.id,
    name: workflowStep.name,
    description: workflowStep.description,
    executor: executors[0],
    type: mapStepType(workflowStep.type),
    dependencies: workflowStep.dependsOn,
    estimatedDuration: stepDuration,
    estimatedCost: stepCost,
  });
}
```

#### 2.2 添加审核步骤

如果 `constraints.quality.reviewRequired == true`：

```typescript
const lastStep = steps[steps.length - 1];
steps.push({
  id: "review",
  name: "质量审核",
  description: "Leader 审核所有输出",
  executor: team.leader.id,
  type: "review",
  dependencies: [lastStep.id],
  estimatedDuration: 60000, // 1 分钟
  estimatedCost: 10,
});
```

#### 2.3 添加交付步骤

```typescript
steps.push({
  id: "delivery",
  name: "生成交付物",
  description: "整合结果并生成最终交付物",
  executor: team.leader.id,
  type: "delivery",
  dependencies: constraints.quality.reviewRequired
    ? ["review"]
    : [steps[steps.length - 1].id],
  estimatedDuration: 30000, // 30 秒
  estimatedCost: 5,
});
```

**输出**: `MissionExecutionPlan`

```typescript
interface MissionExecutionPlan {
  id: string;
  missionId: MissionId;
  parsedIntent: ParsedIntent;
  steps: ExecutionStep[];
  estimatedCost: number; // 总预估成本
  estimatedDuration: number; // 总预估耗时
  createdAt: Date;
}
```

**持久化**:

```typescript
await memoryService.setWithSession(missionId, "plan", plan);
```

**状态转换**: `planning` → `executing`

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 492-571)

---

### Phase 3: Executing（执行计划）

**目标**: 按计划执行各步骤，调度成员协作，生成中间结果。

**状态转换**: `executing`（持续）

**事件流**:

1. `step_started`: 步骤开始（每个步骤）
2. `step_progress`: 步骤进度（可选）
3. `step_completed`: 步骤完成（每个步骤）
4. `step_failed`: 步骤失败（如果出错）

**执行模式**:

#### 3.1 拓扑排序执行

```typescript
const completedSteps = new Set<string>();

while (completedSteps.size < plan.steps.length) {
  // 找出可执行的步骤（依赖已完成）
  const executableSteps = plan.steps.filter(
    (step) =>
      !completedSteps.has(step.id) &&
      step.dependencies.every((dep) => completedSteps.has(dep)),
  );

  if (executableSteps.length === 0) {
    throw new Error("Deadlock detected");
  }

  // 执行步骤...
}
```

#### 3.2 并行执行（如果启用）

```typescript
if (config.enableParallel && executableSteps.length > 1) {
  // 限制并行度
  const maxParallel = constraints.efficiency.parallelism || 3
  const parallelSteps = executableSteps.slice(0, maxParallel)

  // 并行执行
  const results = await Promise.allSettled(
    parallelSteps.map(step => executeStepFull(step, ...))
  )

  // 处理结果
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === "fulfilled") {
      completedSteps.add(parallelSteps[i].id)
      state.intermediateOutputs.set(parallelSteps[i].id, result.value)
    } else {
      state.failedSteps.push(parallelSteps[i].id)
      if (!config.enableAutoRetry) throw result.reason
    }
  }
}
```

#### 3.3 步骤执行详解

**步骤执行流程**:

```
1. Handoff（如果执行者不是 Leader）
    ↓
2. Skills 执行（执行成员的所有技能）
    ↓
3. LLM 调用（融合技能结果 + 成员人设）
    ↓
4. Tool-Calling 处理（处理 LLM 返回的工具调用）
    ↓
5. 资源追踪（记录 Tokens、成本、耗时）
    ↓
6. 约束检查（是否超出限制）
```

**Handoff（委派）**:

```typescript
if (!executor.isLeader()) {
  await handoffCoordinator.initiateHandoff({
    fromAgentId: leader.id,
    toAgentId: executor.id,
    reason: `执行步骤: ${step.name}`,
    context: HandoffContextBuilder()
      .withTask({ id: step.id, description: step.description })
      .withConstraints([`执行者角色: ${executor.role.name}`])
      .build(),
  });
}
```

**Skills 执行**:

```typescript
const skillResults = [];
for (const skillId of executor.skills) {
  const skill = skillRegistry.tryGet(skillId);
  if (skill) {
    // 设置 LLM 适配器
    skill.setLLMAdapter(llmAdapter);

    // 构建技能上下文
    const skillContext: SkillContext = {
      executionId: uuidv4(),
      skillId,
      domain: skill.domain,
      callerId: executor.id,
      sessionId: missionId,
      createdAt: new Date(),
    };

    // 构建技能输入（从 metadata 提取数据）
    const skillInput = {
      task: step.description,
      context: {
        ...context,
        input: {
          sourceText: missionInput?.metadata?.context,
          userRequirement: missionInput?.prompt,
          ...missionInput?.metadata,
        },
      },
      previousOutputs: Object.fromEntries(state.intermediateOutputs),
    };

    // 执行技能
    const result = await skill.execute(skillInput, skillContext);
    skillResults.push({ skillId, result });
  }
}
```

**LLM 融合**:

```typescript
// 1. 构建系统提示词（融合人设和工作风格）
const systemPrompt = buildSystemPromptWithPersona(executor);

// 2. 构建用户提示词（融合技能结果）
const userPrompt = buildStepPromptWithSkills(step, context, skillResults);

// 3. 调用 LLM
const response = await adapter.chat({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  model: executor.model,
  temperature: getTemperatureFromWorkStyle(executor.workStyle),
  tools: collectAvailableTools(executor),
});

// 4. 处理工具调用
if (response.toolCalls) {
  toolResults = await handleToolCalls(response.toolCalls);
}
```

**资源追踪**:

```typescript
// 记录成本
const cost = constraintEngine.recordCost(
  `step_${step.id}`,
  response.model,
  response.usage.promptTokens,
  response.usage.completionTokens,
  missionId,
);

// 更新状态
state.resourceUsage.tokensUsed += totalTokens;
state.resourceUsage.costUsed += totalCost;

// 检查约束
const canContinue = constraintEngine.canContinue(
  constraints,
  state.resourceUsage,
);
if (!canContinue.canContinue) {
  throw new Error(canContinue.reason);
}
```

**输出**: `StepExecutionResult`

```typescript
interface StepExecutionResult {
  stepId: string;
  executor: string;
  output: string | unknown;
  skillResults?: Array<{ skillId: string; result: SkillResult }>;
  toolResults?: unknown[];
  timestamp: Date;
  tokensUsed: number;
  costUsed: number;
}
```

**存储**:

```typescript
// 双键存储：stepId + skillId
state.intermediateOutputs.set(step.id, stepResult);
for (const { skillId, result } of stepResult.skillResults) {
  if (result.success && result.data) {
    state.intermediateOutputs.set(skillId, result.data);
  }
}
```

**状态转换**: `executing` → `reviewing`（所有步骤完成后）

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 576-749, 804-1013)

---

### Phase 4: Reviewing（质量审核）

**目标**: Leader 审核所有步骤输出，不合格则返工。

**状态转换**: `reviewing`（持续）

**事件流**:

1. `review_started`: 开始审核
2. `review_completed`: 单个步骤审核完成
3. `rework_requested`: 请求返工
4. `rework_completed`: 返工完成

**审核流程**:

#### 4.1 审核单个步骤

```typescript
let currentOutput = output;
let attempt = 0;
let reviewResult: StepReviewResult;

do {
  // 1. Leader 审核
  reviewResult = await review(stepId, currentOutput, team);
  state.reviewResults.push(reviewResult);
  yield createEvent("review_completed", missionId, { reviewResult });

  // 2. 判断是否需要返工
  if (!reviewResult.passed && attempt < constraints.quality.maxReworks) {
    // 3. 发起返工
    yield createEvent("rework_requested", missionId, {
      stepId,
      attempt: attempt + 1,
      reason: reviewResult.feedback,
    });

    // 4. 重新执行步骤
    const reworkContext: ReworkContext = {
      stepId,
      attempt: attempt + 1,
      previousOutput: currentOutput,
      reviewFeedback: reviewResult.feedback,
      issues: [],
    };
    currentOutput = await executeStepWithRework(
      step,
      executor,
      missionId,
      state,
      reworkContext,
    );
    state.intermediateOutputs.set(stepId, currentOutput);

    yield createEvent("rework_completed", missionId, {
      stepId,
      attempt: attempt + 1,
      output: currentOutput,
    });

    state.resourceUsage.reworkCount++;
    attempt++;
  }
} while (!reviewResult.passed && attempt < constraints.quality.maxReworks);
```

#### 4.2 LLM 审核逻辑

```typescript
const systemPrompt = `你是一个质量审核专家。请审核以下输出，评估其质量、准确性和完整性。
给出 1-10 的分数，以及详细反馈。

输出 JSON 格式：
{
  "score": number,
  "passed": boolean,
  "feedback": string,
  "issues": []
}`;

const response = await adapter.chat({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(output) },
  ],
  model: team.leader.model,
  temperature: 0.3, // 低温度确保一致性
});

// 解析结果
const parsed = JSON.parse(response.content);
return {
  stepId,
  passed: parsed.passed ?? parsed.score >= constraints.quality.minReviewScore,
  score: parsed.score,
  feedback: parsed.feedback,
  reviewedAt: new Date(),
};
```

#### 4.3 返工执行

```typescript
const reworkPrompt = `## 任务返工（第 ${attempt} 次）

### 原任务
${step.description}

### 上次输出
${JSON.stringify(previousOutput)}

### 审核反馈
${reviewFeedback}

### 需要修正的问题
${issues.map((i) => `- ${i}`).join("\n")}

请根据审核反馈修正输出，解决上述问题。`;

const response = await adapter.chat({
  messages: [
    { role: "system", content: executor.getSystemPrompt() },
    { role: "user", content: reworkPrompt },
  ],
  model: executor.model,
  temperature: 0.5, // 返工时使用较低温度
});
```

**输出**: `ReviewResult[]`

```typescript
interface StepReviewResult {
  stepId: string;
  passed: boolean;
  score: number; // 1-10
  feedback: string;
  reviewedAt: Date;
}
```

**状态转换**: `reviewing` → `delivering`

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 237-307, 1320-1387)

---

### Phase 5: Delivering（生成交付物）

**目标**: 整合所有结果，生成最终交付物（文档、报告、数据等）。

**状态转换**: `delivering` → `completed`

**事件流**:

1. `delivering_started`: 开始生成交付物
2. `deliverable_ready`: 单个交付物生成完成

**处理逻辑**:

#### 5.1 使用导出工具生成文档

```typescript
const exportTools = ["export-docx", "export-pdf"];

for (const toolId of exportTools) {
  const tool = toolRegistry.tryGet(toolId);
  if (tool) {
    try {
      // 整合内容
      const content = integrateOutputsForExport(allOutputs);

      // 调用导出工具
      const result = await tool.execute(
        {
          title: "任务报告",
          content,
          format: toolId.replace("export-", ""),
        },
        toolContext,
      );

      deliverables.push({
        id: uuidv4(),
        missionId: state.missionId,
        type: "report",
        name: `任务报告.${toolId.replace("export-", "")}`,
        description: "自动生成的任务报告文档",
        mimeType:
          toolId === "export-pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 0,
        content: result,
        createdAt: new Date(),
      });
      break;
    } catch (error) {
      logger.warn(`Export tool ${toolId} failed`);
    }
  }
}
```

#### 5.2 生成 JSON 报告

始终生成 JSON 格式的详细报告：

```typescript
deliverables.push({
  id: uuidv4(),
  missionId: state.missionId,
  type: "report",
  name: "任务报告",
  description: "任务执行结果汇总报告",
  mimeType: "application/json",
  size: JSON.stringify(allOutputs).length,
  content: {
    summary: "任务执行完成",
    outputs: allOutputs,
    statistics: {
      totalSteps: state.completedSteps.length + state.failedSteps.length,
      completedSteps: state.completedSteps.length,
      failedSteps: state.failedSteps.length,
      reworkCount: state.resourceUsage.reworkCount,
      reviewResults: state.reviewResults,
    },
  },
  createdAt: new Date(),
});
```

**输出**: `MissionDeliverable[]`

```typescript
interface MissionDeliverable {
  id: string;
  missionId: MissionId;
  type: DeliverableType; // "report" | "presentation" | "data" | "code" | ...
  name: string;
  description: string;
  mimeType: string;
  size: number;
  url?: string;
  content?: unknown;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}
```

**状态转换**: `delivering` → `completed`

**实现位置**: `backend/src/modules/ai-engine/teams/orchestrator/mission-orchestrator.ts` (line 1392-1481)

---

### Phase 6: Completed（完成）

**目标**: 返回最终结果，清理资源。

**事件流**:

1. `mission_completed`: 任务完成

**输出**: `MissionResult`

```typescript
interface MissionResult {
  missionId: MissionId;
  success: boolean;
  deliverables: MissionDeliverable[];
  summary: string;
  tokensUsed: number;
  costUsed: number;
  duration: number;
  error?: MissionError;
  statistics: MissionStatistics;
  metadata?: Record<string, unknown>;
}
```

**统计信息**:

```typescript
interface MissionStatistics {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  reworkCount: number;
  membersInvolved: number;
  toolCalls: number;
  skillCalls: number;
  reviewCount: number;
  reviewPassRate: number; // 0-1
}
```

**资源清理**:

```typescript
// 清理原始输入，防止内存泄漏
this.originalInputs.delete(missionId);

// 可选：清理 Memory 缓存
await memoryService.deleteSession(missionId);
```

---

## 错误处理

### 失败类型

| 错误类型               | 说明         | 是否可重试 | 处理策略           |
| ---------------------- | ------------ | ---------- | ------------------ |
| `PARSING_ERROR`        | 意图解析失败 | 是         | 使用规则解析降级   |
| `PLANNING_ERROR`       | 计划生成失败 | 是         | 简化工作流         |
| `EXECUTION_ERROR`      | 步骤执行失败 | 是         | 自动重试或返工     |
| `REVIEW_ERROR`         | 审核失败     | 否         | 跳过审核或降低标准 |
| `CONSTRAINT_VIOLATION` | 违反约束     | 否         | 立即中止           |
| `TIMEOUT`              | 执行超时     | 否         | 立即中止           |
| `RESOURCE_EXHAUSTED`   | 资源耗尽     | 否         | 立即中止           |

### 重试机制

#### 步骤级重试

```typescript
const retryConfig = workflowStep.retry || {
  maxRetries: 2,
  retryDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
  retryableErrors: ["TEMPORARY_ERROR", "RATE_LIMIT"],
};

let attempt = 0;
while (attempt <= retryConfig.maxRetries) {
  try {
    return await executeStep(step);
  } catch (error) {
    if (!isRetryable(error, retryConfig)) throw error;

    attempt++;
    if (attempt > retryConfig.maxRetries) throw error;

    const delay = Math.min(
      retryConfig.retryDelay *
        Math.pow(retryConfig.backoffMultiplier, attempt - 1),
      retryConfig.maxDelay,
    );
    await sleep(delay);
  }
}
```

#### 返工机制

审核不通过时的返工（见 Phase 4）。

### 失败处理

```typescript
try {
  // 执行 Mission...
} catch (error) {
  state.phase = "failed"
  const errorMessage = (error as Error).message

  // 发送失败事件
  yield createEvent("mission_failed", missionId, {
    error: errorMessage
  })

  // 清理资源
  this.originalInputs.delete(missionId)

  // 返回失败结果
  return {
    missionId,
    success: false,
    deliverables: [],
    summary: `任务执行失败: ${errorMessage}`,
    error: {
      code: "EXECUTION_ERROR",
      message: errorMessage,
      retryable: true
    },
    ...
  }
}
```

---

## 事件系统

### 事件类型

```typescript
type MissionEventType =
  | "mission_created"
  | "mission_started"
  | "parsing_started"
  | "parsing_completed"
  | "planning_started"
  | "planning_completed"
  | "step_started"
  | "step_progress"
  | "step_completed"
  | "step_failed"
  | "review_started"
  | "review_completed"
  | "rework_requested"
  | "rework_completed"
  | "delivering_started"
  | "deliverable_ready"
  | "mission_completed"
  | "mission_failed"
  | "mission_cancelled"
  | "cost_warning"
  | "timeout_warning";
```

### 事件格式

```typescript
interface MissionEvent {
  type: MissionEventType;
  missionId: MissionId;
  timestamp: Date;
  data?: Record<string, unknown>;
}
```

### 事件订阅

```typescript
// 服务端订阅
for await (const event of orchestrator.execute(input, team, constraints)) {
  console.log(`[${event.type}] ${event.missionId}`, event.data);

  // 通过 WebSocket 推送给前端
  if (event.type === "step_completed") {
    wsGateway.emit("mission:progress", {
      missionId: event.missionId,
      progress: calculateProgress(event),
    });
  }
}
```

---

## 资源管理

### 资源追踪

```typescript
interface ResourceUsage {
  tokensUsed: number; // 已消耗 Tokens
  costUsed: number; // 已消耗成本（积分）
  timeElapsed: number; // 已耗时（毫秒）
  reviewCount: number; // 审核次数
  reworkCount: number; // 返工次数
  progress: number; // 进度（0-1）
}
```

### 约束检查

每步执行后检查：

```typescript
const canContinue = constraintEngine.canContinue(
  constraints,
  state.resourceUsage,
);

if (!canContinue.canContinue) {
  throw new Error(canContinue.reason);
  // 可能的原因：
  // - "Token 消耗超出限制"
  // - "成本超出预算"
  // - "执行时长超出限制"
}
```

### 成本预警

```typescript
// 达到 80% 阈值时发出警告
if (state.resourceUsage.costUsed >= constraints.cost.maxCost * 0.8) {
  yield createEvent("cost_warning", missionId, {
    current: state.resourceUsage.costUsed,
    limit: constraints.cost.maxCost,
    percentage: 0.8,
  });
}
```

---

## 持久化

### Memory 服务

```typescript
// 存储上下文
await memoryService.setWithSession(missionId, "input", input);
await memoryService.setWithSession(missionId, "intent", intent);
await memoryService.setWithSession(missionId, "plan", plan);

// 读取上下文
const input = await memoryService.getWithSession(missionId, "input");
const intent = await memoryService.getWithSession(missionId, "intent");
const plan = await memoryService.getWithSession(missionId, "plan");
```

### 双存储策略

为了防止 Memory 服务失效导致数据丢失：

```typescript
// 1. 内存映射（快速访问）
private readonly originalInputs = new Map<string, MissionInput>()
this.originalInputs.set(missionId, input)

// 2. Memory 服务（持久化，可选）
await memoryService.setWithSession(missionId, "input", input)

// 读取时优先使用内存映射
const input = this.originalInputs.get(missionId)
  || await memoryService.getWithSession(missionId, "input")
```

---

## 性能优化

### 并行执行

- 自动识别无依赖步骤
- 使用 `Promise.allSettled` 并行执行
- 受 `constraints.efficiency.parallelism` 限制

### 技能结果缓存

- 双键存储：`stepId` + `skillId`
- 后续技能可直接访问前置技能结果
- 避免重复计算

### LLM 调用优化

- 批量请求（未实现）
- 流式响应（未实现）
- 缓存常见查询（未实现）

---

## 相关文档

- [核心概念](./core-concepts.md)
- [Workflow 执行机制](./workflow-execution.md)
- [约束引擎设计](./constraint-engine.md)

---

**维护者**: AI Teams Core Team
**反馈渠道**: GitHub Issues
