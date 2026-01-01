# AI Coding 团队协同重构 PRD v1.0

## 彻底重构：从"假执行"到"真协同"

**版本**: 1.0
**日期**: 2025-12-21
**状态**: 待评审
**核心目标**: 将 AI Coding 从模拟执行改造为真正的 AI 团队协同开发，参考 AI Team 的成熟实现

---

## 1. 问题诊断：当前实现的致命缺陷

### 1.1 核心问题：全是假的

经过深入代码分析，当前 AI Coding 存在以下**致命问题**：

```
┌─────────────────────────────────────────────────────────────────────┐
│ 致命缺陷清单                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ❌ 缺陷1: API密钥缺失不报错                                        │
│     - 缺失API Key时返回错误文本而非抛出异常                          │
│     - 错误信息"API Key 未配置"被当作有效输出继续流转                 │
│     - 用户看到的PRD、设计文档可能都是错误提示                        │
│                                                                     │
│  ❌ 缺陷2: 虚假进度指示                                             │
│     - 进度更新与实际AI调用完全解耦                                   │
│     - 无论AI是否成功，进度都从0%线性增长到100%                       │
│     - WebSocket推送虚假的"执行中"状态                                │
│                                                                     │
│  ❌ 缺陷3: 无输出有效性验证                                         │
│     - 不检查Agent输出是否包含有效数据                                │
│     - 空数组、空字符串、错误信息都被接受                             │
│     - 项目最终标记为"完成"但文件为空                                 │
│                                                                     │
│  ❌ 缺陷4: 单点串行执行                                             │
│     - 所有Agent顺序执行模板代码                                      │
│     - 不是真正的团队协作，而是流水线                                 │
│     - 没有反馈循环、审查、修改机制                                   │
│                                                                     │
│  ❌ 缺陷5: 级联故障传播                                             │
│     - PM失败 → 架构师收到错误输入                                    │
│     - 架构师失败 → 工程师收到错误输入                                │
│     - 最终交付物是多层错误堆积的结果                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 问题证据（代码级别）

**证据1: ai-chat.service.ts 第430-437行**

```typescript
if (!apiKey) {
  this.logger.warn("XAI_API_KEY not configured");
  return {
    content: `**API Key 未配置**\n\n我是 Grok，但无法生成回复...`,
    model: "grok",
    tokensUsed: 0,
  };
}
// 问题：返回错误信息而非抛出异常
```

**证据2: ai-coding.service.ts 执行流程**

```typescript
// Step 1: PM 生成 PRD (15%)
const prd = await this.runPMAgent(...);  // 可能返回 { overview: "API Key 未配置...", ... }
await this.updateProgress(projectId, 15, { prd });  // 无论prd是否有效，进度都更新

// Step 2: Architect 生成设计 (30%)
const design = await this.runArchitectAgent(...);  // 基于错误的prd生成
await this.updateProgress(projectId, 30, { design });
// 继续...
```

**证据3: 无验证的输出**

```typescript
return {
  overview: result.content, // 可能是 "API Key 未配置"
  userStories: [], // 空数组
  functionalRequirements: [],
  nonFunctionalRequirements: [],
  acceptanceCriteria: [],
};
// 这个对象被当作有效PRD继续使用
```

### 1.3 与 AI Team 的对比

| 维度     | AI Team (正确实现)  | AI Coding (假执行) |
| -------- | ------------------- | ------------------ |
| AI调用   | 每条消息真正调用AI  | 可能返回错误信息   |
| 错误处理 | 抛出异常、分类重试  | 静默失败、继续执行 |
| 进度追踪 | 与实际执行挂钩      | 与执行完全解耦     |
| 反馈机制 | Leader审查+修改循环 | 无任何反馈         |
| 团队协作 | 消息驱动、任务编排  | 串行流水线         |
| 输出验证 | JSON解析+格式校验   | 几乎无验证         |

---

## 2. 全新设计方案

### 2.1 核心理念转变

```
旧方案：流水线模式
┌────┐   ┌────┐   ┌────┐   ┌────┐   ┌────┐
│ PM │ → │架构│ → │项目│ → │工程│ → │ QA │
└────┘   └────┘   └────┘   └────┘   └────┘
   ↓        ↓        ↓        ↓        ↓
 PRD     设计     任务     代码     测试
(可能错) (可能错) (可能错) (可能错) (可能错)

新方案：团队协同模式
┌─────────────────────────────────────────┐
│             AI 开发团队                  │
│                                         │
│    ┌─────┐   实时通信   ┌─────┐         │
│    │ PM  │ ←────────→ │架构师│         │
│    └──┬──┘             └──┬──┘         │
│       │                   │            │
│       ↓ 任务分配     审查 ↓            │
│    ┌─────┐           ┌─────┐           │
│    │项目经理│←────────→│工程师│          │
│    └──┬──┘   反馈     └──┬──┘          │
│       │                   │            │
│       └──────┬───────────┘            │
│              ↓                         │
│           ┌─────┐                      │
│           │ QA  │                      │
│           └─────┘                      │
│                                         │
│  【核心】每个Agent真正调用AI             │
│  【核心】Leader审查 + 反馈循环           │
│  【核心】任务依赖 + 并行执行             │
└─────────────────────────────────────────┘
```

### 2.2 新架构设计

#### 2.2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Coding 新架构                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  前端层                                                             │
│  ├─ ProjectDetailPage (项目详情)                                    │
│  ├─ TeamChatPanel (团队对话面板) [NEW]                              │
│  ├─ TaskBoard (任务看板)                                            │
│  └─ OutputViewer (产出查看器)                                       │
│                                                                     │
│  WebSocket层                                                        │
│  ├─ ai-coding.gateway.ts                                            │
│  ├─ Events: team:message, agent:typing, task:update, progress:update │
│  └─ Rooms: project:{id}, agent:{id}                                 │
│                                                                     │
│  服务层                                                             │
│  ├─ AiCodingService (项目管理)                                      │
│  ├─ CodingTeamService (团队协同) [NEW]                              │
│  ├─ CodingMissionService (任务编排) [NEW]                           │
│  ├─ CodingAgentService (Agent执行) [NEW]                            │
│  └─ DocumentService (文档生成)                                      │
│                                                                     │
│  AI调用层                                                           │
│  ├─ AiChatService (统一AI入口)                                      │
│  ├─ 启动前验证 [NEW]                                                │
│  ├─ 输出有效性校验 [NEW]                                            │
│  └─ 错误分类+重试 [ENHANCED]                                        │
│                                                                     │
│  数据层                                                             │
│  ├─ AiCodingProject                                                 │
│  ├─ CodingTeamMember [NEW]                                          │
│  ├─ CodingMission [NEW]                                             │
│  ├─ CodingAgentTask [NEW]                                           │
│  └─ CodingTeamMessage [NEW]                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 核心服务设计

**1. CodingTeamService - 团队协同服务**

```typescript
interface CodingTeamService {
  // 初始化开发团队
  initializeTeam(projectId: string): Promise<CodingTeam>;

  // 发送团队消息（真正调用AI）
  sendMessage(
    projectId: string,
    fromAgentId: string,
    content: string,
    mentions?: string[], // 提及其他Agent
  ): Promise<TeamMessage>;

  // 触发Agent响应（真正调用AI）
  triggerAgentResponse(
    projectId: string,
    agentId: string,
    context: MessageContext,
  ): Promise<TeamMessage>;

  // 广播系统消息
  broadcastSystemMessage(
    projectId: string,
    content: string,
    messageType: SystemMessageType,
  ): Promise<void>;
}
```

**2. CodingMissionService - 任务编排服务**

```typescript
interface CodingMissionService {
  // 创建开发任务
  createMission(
    projectId: string,
    requirement: string,
    leaderId: string, // 通常是PM
  ): Promise<CodingMission>;

  // Leader规划任务分解
  planMission(missionId: string): Promise<TaskBreakdown>;

  // 分配子任务给Agent
  assignTask(
    missionId: string,
    taskId: string,
    assigneeId: string,
  ): Promise<void>;

  // Agent完成任务并提交产出
  submitTaskOutput(taskId: string, output: AgentOutput): Promise<void>;

  // Leader审查任务产出
  reviewTaskOutput(
    taskId: string,
    approved: boolean,
    feedback?: string,
  ): Promise<void>;

  // 完成任务（整合所有产出）
  completeMission(missionId: string): Promise<MissionResult>;
}
```

**3. CodingAgentService - Agent执行服务**

```typescript
interface CodingAgentService {
  // 执行Agent任务（真正调用AI）
  executeTask(
    agentId: string,
    task: CodingAgentTask,
    context: TaskContext,
  ): Promise<TaskOutput>;

  // 生成Agent响应（真正调用AI）
  generateResponse(
    agentId: string,
    prompt: string,
    systemPrompt: string,
  ): Promise<AgentResponse>;

  // 验证输出有效性
  validateOutput(agentType: CodingAgentType, output: unknown): ValidationResult;
}
```

### 2.3 Agent角色定义

```typescript
enum CodingAgentType {
  PM = "pm", // 产品经理 - Leader角色
  ARCHITECT = "architect", // 架构师
  PROJECT_MANAGER = "pm_lead", // 项目经理
  ENGINEER = "engineer", // 工程师
  QA = "qa", // QA测试
}

interface CodingAgentConfig {
  type: CodingAgentType;
  displayName: string;
  aiModel: string; // grok, gpt-4, claude, gemini
  systemPrompt: string; // 角色专属提示词
  capabilities: string[]; // 能力列表
  canBeLeader: boolean; // 是否可作为Leader
  maxRetries: number; // 最大重试次数
}

// Agent配置示例
const PM_CONFIG: CodingAgentConfig = {
  type: CodingAgentType.PM,
  displayName: "产品经理",
  aiModel: "grok",
  systemPrompt: `你是一位资深产品经理，负责：
1. 理解和分析用户需求
2. 编写清晰的PRD文档
3. 定义功能需求和验收标准
4. 协调团队成员工作
...`,
  capabilities: ["需求分析", "PRD编写", "优先级管理"],
  canBeLeader: true,
  maxRetries: 3,
};
```

### 2.4 任务执行流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                       任务执行流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 启动阶段                                                        │
│     ├─ 验证API密钥可用性 (必须)                                     │
│     ├─ 初始化开发团队 (5个Agent)                                    │
│     ├─ 创建Mission记录                                              │
│     └─ WebSocket通知前端"团队已就位"                                │
│                                                                     │
│  2. 规划阶段 (PM Lead)                                              │
│     ├─ PM分析需求 → 真正调用AI                                      │
│     ├─ 验证输出 → 必须包含有效JSON                                  │
│     ├─ 失败则重试3次                                                │
│     ├─ 彻底失败则标记Mission为FAILED                                │
│     └─ 成功则分解为子任务，分配给团队成员                           │
│                                                                     │
│  3. 执行阶段 (并行+依赖)                                            │
│     ├─ 架构师：设计系统架构 → 真正调用AI                            │
│     │   └─ 完成后通知PM审查                                         │
│     ├─ PM审查架构设计                                               │
│     │   ├─ 通过 → 继续下一步                                        │
│     │   └─ 不通过 → 反馈修改意见，重新执行                          │
│     ├─ 项目经理：细化任务拆分 → 真正调用AI                          │
│     ├─ 工程师：生成代码 → 真正调用AI                                │
│     │   └─ 依赖架构设计完成                                         │
│     └─ QA：编写测试用例 → 真正调用AI                                │
│         └─ 依赖代码完成                                             │
│                                                                     │
│  4. 审查阶段                                                        │
│     ├─ PM审查所有产出                                               │
│     ├─ 汇总问题和修改建议                                           │
│     ├─ 需要修改 → 回到执行阶段（最多3轮）                           │
│     └─ 全部通过 → 进入交付阶段                                      │
│                                                                     │
│  5. 交付阶段                                                        │
│     ├─ 整合所有产出物                                               │
│     ├─ 生成最终文档 (PRD、架构设计、代码、测试)                     │
│     ├─ 更新项目状态为COMPLETED                                      │
│     └─ WebSocket通知前端"项目完成"                                  │
│                                                                     │
│  异常处理                                                           │
│     ├─ API调用失败 → 重试3次，分类错误                              │
│     ├─ 输出无效 → 重新生成，最多3次                                 │
│     ├─ 任务超时 → 标记为TIMEOUT，允许手动重试                       │
│     └─ 彻底失败 → 标记Mission为FAILED，通知用户                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.5 数据模型设计

```prisma
// 新增模型

model CodingTeamMember {
  id            String         @id @default(uuid())
  projectId     String
  project       AiCodingProject @relation(fields: [projectId], references: [id])
  agentType     CodingAgentType
  displayName   String
  aiModel       String         @default("grok")
  systemPrompt  String         @db.Text
  isLeader      Boolean        @default(false)
  status        AgentStatus    @default(IDLE)  // IDLE, WORKING, WAITING, COMPLETED
  createdAt     DateTime       @default(now())

  messages      CodingTeamMessage[]  @relation("sender")
  assignedTasks CodingAgentTask[]    @relation("assignee")
  reviewedTasks CodingAgentTask[]    @relation("reviewer")
}

model CodingMission {
  id            String         @id @default(uuid())
  projectId     String
  project       AiCodingProject @relation(fields: [projectId], references: [id])
  leaderId      String
  leader        CodingTeamMember @relation(fields: [leaderId], references: [id])
  title         String
  description   String         @db.Text
  status        MissionStatus  @default(PENDING)
  // PENDING → PLANNING → EXECUTING → REVIEWING → COMPLETED/FAILED

  taskBreakdown Json?          // AI生成的任务分解方案
  finalResult   Json?          // 最终整合的产出
  errorMessage  String?        // 失败原因

  currentRound  Int            @default(1)  // 当前修改轮次
  maxRounds     Int            @default(3)  // 最大修改轮次

  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime       @default(now())

  tasks         CodingAgentTask[]
  logs          CodingMissionLog[]
}

model CodingAgentTask {
  id            String         @id @default(uuid())
  missionId     String
  mission       CodingMission  @relation(fields: [missionId], references: [id])

  title         String
  description   String         @db.Text
  taskType      TaskType       // PRD, ARCHITECTURE, TASK_BREAKDOWN, CODE, TEST
  priority      Int            @default(0)

  assignedToId  String
  assignedTo    CodingTeamMember @relation("assignee", fields: [assignedToId], references: [id])

  reviewerId    String?
  reviewer      CodingTeamMember? @relation("reviewer", fields: [reviewerId], references: [id])

  status        TaskStatus     @default(PENDING)
  // PENDING → ASSIGNED → IN_PROGRESS → REVIEW → COMPLETED/REJECTED

  dependencies  String[]       // 依赖的任务ID列表
  output        Json?          // AI生成的输出
  feedback      String?        // 审查反馈

  retryCount    Int            @default(0)
  maxRetries    Int            @default(3)

  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime       @default(now())
}

model CodingTeamMessage {
  id            String         @id @default(uuid())
  projectId     String
  project       AiCodingProject @relation(fields: [projectId], references: [id])

  senderId      String?
  sender        CodingTeamMember? @relation("sender", fields: [senderId], references: [id])

  content       String         @db.Text
  messageType   MessageType    // CHAT, TASK_UPDATE, SYSTEM, REVIEW_REQUEST, REVIEW_RESULT

  aiModel       String?        // 使用的AI模型
  tokensUsed    Int?           // token消耗

  mentions      String[]       // 提及的Agent ID列表
  replyToId     String?        // 回复的消息ID

  createdAt     DateTime       @default(now())
}

model CodingMissionLog {
  id            String         @id @default(uuid())
  missionId     String
  mission       CodingMission  @relation(fields: [missionId], references: [id])

  phase         String         // planning, executing, reviewing, completed, failed
  action        String         // 具体动作描述
  agentId       String?        // 相关Agent
  details       Json?          // 详细信息

  createdAt     DateTime       @default(now())
}
```

### 2.6 关键修复点

#### 2.6.1 启动前验证

```typescript
// CodingAgentService.ts
async validateAIServiceAvailability(): Promise<ValidationResult> {
  const defaultModel = process.env.DEFAULT_AI_MODEL || 'gemini';
  const requiredEnvKey = this.getRequiredApiKey(defaultModel);

  if (!process.env[requiredEnvKey]) {
    throw new AiServiceUnavailableError(
      `AI服务不可用：缺少必需的环境变量 ${requiredEnvKey}`
    );
  }

  // 测试API连通性
  try {
    await this.aiChatService.testConnection(defaultModel);
  } catch (error) {
    throw new AiServiceUnavailableError(
      `AI服务不可用：${error.message}`
    );
  }

  return { valid: true };
}
```

#### 2.6.2 输出有效性验证

```typescript
// CodingAgentService.ts
validatePRDOutput(output: unknown): ValidationResult {
  if (typeof output !== 'object' || output === null) {
    return { valid: false, error: 'PRD输出必须是对象' };
  }

  const prd = output as PRDOutput;

  // 检查必需字段
  if (!prd.overview || prd.overview.includes('API Key')) {
    return { valid: false, error: 'PRD概述无效或包含错误信息' };
  }

  if (!Array.isArray(prd.functionalRequirements) || prd.functionalRequirements.length === 0) {
    return { valid: false, error: 'PRD必须包含至少一个功能需求' };
  }

  if (!Array.isArray(prd.userStories) || prd.userStories.length === 0) {
    return { valid: false, error: 'PRD必须包含至少一个用户故事' };
  }

  return { valid: true };
}
```

#### 2.6.3 错误处理增强

```typescript
// CodingAgentService.ts
async executeTaskWithRetry(
  agentId: string,
  task: CodingAgentTask,
  context: TaskContext
): Promise<TaskOutput> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= task.maxRetries; attempt++) {
    try {
      // 调用AI
      const response = await this.aiChatService.chat({
        messages: context.messages,
        systemPrompt: context.systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
      });

      // 检查响应是否包含错误信息
      if (response.content.includes('API Key 未配置') ||
          response.content.includes('无法生成回复')) {
        throw new AiResponseInvalidError('AI响应包含错误信息');
      }

      // 解析JSON输出
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AiResponseInvalidError('无法从响应中提取JSON');
      }

      const output = JSON.parse(jsonMatch[0]);

      // 验证输出有效性
      const validation = this.validateOutput(task.taskType, output);
      if (!validation.valid) {
        throw new AiOutputValidationError(validation.error);
      }

      return {
        success: true,
        data: output,
        tokensUsed: response.tokensUsed,
        attempt,
      };

    } catch (error) {
      lastError = error;
      this.logger.warn(`任务执行失败 (尝试 ${attempt}/${task.maxRetries}): ${error.message}`);

      // 指数退避
      if (attempt < task.maxRetries) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  // 所有重试都失败
  throw new TaskExecutionError(
    `任务执行失败，已重试${task.maxRetries}次: ${lastError?.message}`
  );
}
```

#### 2.6.4 真正的进度追踪

```typescript
// CodingMissionService.ts
async updateProgress(missionId: string): Promise<void> {
  const mission = await this.getMissionWithTasks(missionId);

  // 计算真实进度
  const totalTasks = mission.tasks.length;
  const completedTasks = mission.tasks.filter(t => t.status === 'COMPLETED').length;
  const inProgressTasks = mission.tasks.filter(t => t.status === 'IN_PROGRESS').length;

  // 基础进度 = 已完成任务比例
  // 额外进度 = 进行中任务贡献部分进度
  const baseProgress = (completedTasks / totalTasks) * 100;
  const inProgressBonus = (inProgressTasks / totalTasks) * 10; // 进行中任务贡献10%

  const realProgress = Math.min(
    baseProgress + inProgressBonus,
    mission.status === 'COMPLETED' ? 100 : 99  // 只有真正完成才是100%
  );

  // 更新数据库
  await this.prisma.aiCodingProject.update({
    where: { id: mission.projectId },
    data: { progress: Math.round(realProgress) },
  });

  // WebSocket推送真实进度
  await this.eventEmitter.emitProgress({
    projectId: mission.projectId,
    phase: mission.status.toLowerCase(),
    progress: Math.round(realProgress),
    completedTasks,
    totalTasks,
    currentTask: mission.tasks.find(t => t.status === 'IN_PROGRESS')?.title,
  });
}
```

### 2.7 前端改进

#### 2.7.1 团队对话面板

```tsx
// components/ai-coding/TeamChatPanel.tsx
interface TeamChatPanelProps {
  projectId: string;
  onMessageSent: (message: TeamMessage) => void;
}

export function TeamChatPanel({
  projectId,
  onMessageSent,
}: TeamChatPanelProps) {
  const { messages, sendMessage, isConnected } = useAiCodingSocket(projectId);

  return (
    <div className="flex flex-col h-full">
      {/* 连接状态 */}
      <ConnectionStatus connected={isConnected} />

      {/* 消息列表 */}
      <div className="flex-1 overflow-auto">
        {messages.map((msg) => (
          <TeamMessage key={msg.id} message={msg} isAgent={!!msg.senderId} />
        ))}
      </div>

      {/* 显示正在输入的Agent */}
      <TypingIndicator />

      {/* 输入框（可选，允许用户干预） */}
      <MessageInput onSend={sendMessage} />
    </div>
  );
}
```

#### 2.7.2 真实的Agent状态卡片

```tsx
// components/ai-coding/AgentStatusCard.tsx
interface AgentStatusCardProps {
  agent: CodingTeamMember;
  currentTask?: CodingAgentTask;
}

export function AgentStatusCard({ agent, currentTask }: AgentStatusCardProps) {
  // 状态映射
  const statusConfig = {
    IDLE: { color: "bg-gray-100", icon: "💤", text: "空闲" },
    WORKING: { color: "bg-blue-100", icon: "⚡", text: "工作中" },
    WAITING: { color: "bg-yellow-100", icon: "⏳", text: "等待审查" },
    COMPLETED: { color: "bg-green-100", icon: "✅", text: "已完成" },
    FAILED: { color: "bg-red-100", icon: "❌", text: "失败" },
  };

  const config = statusConfig[agent.status];

  return (
    <div className={`rounded-lg p-4 ${config.color}`}>
      <div className="flex items-center gap-2">
        <AgentAvatar type={agent.agentType} />
        <div>
          <h4 className="font-medium">{agent.displayName}</h4>
          <p className="text-sm text-gray-600">{config.text}</p>
        </div>
        <span className="ml-auto text-2xl">{config.icon}</span>
      </div>

      {/* 当前任务 */}
      {currentTask && agent.status === "WORKING" && (
        <div className="mt-2 text-sm">
          <p className="text-gray-500">正在处理:</p>
          <p className="font-medium">{currentTask.title}</p>
          {currentTask.retryCount > 0 && (
            <p className="text-orange-500">
              重试中 ({currentTask.retryCount}/3)
            </p>
          )}
        </div>
      )}

      {/* 失败信息 */}
      {agent.status === "FAILED" && currentTask?.feedback && (
        <div className="mt-2 text-sm text-red-600">{currentTask.feedback}</div>
      )}
    </div>
  );
}
```

---

## 3. 实现计划

### 3.1 阶段划分

```
Phase 1: 基础修复（紧急）
├─ 1.1 启动前API验证
├─ 1.2 输出有效性检查
├─ 1.3 错误传播阻断
└─ 1.4 真实进度追踪

Phase 2: 团队协同（核心）
├─ 2.1 数据模型扩展
├─ 2.2 CodingTeamService 实现
├─ 2.3 CodingMissionService 实现
├─ 2.4 CodingAgentService 实现
└─ 2.5 WebSocket事件扩展

Phase 3: 反馈循环（增强）
├─ 3.1 Leader审查机制
├─ 3.2 任务修改循环
├─ 3.3 任务依赖调度
└─ 3.4 并行任务执行

Phase 4: 前端升级（体验）
├─ 4.1 团队对话面板
├─ 4.2 Agent状态实时更新
├─ 4.3 任务看板改进
└─ 4.4 错误处理UI
```

### 3.2 验收标准

| 标准       | 描述                          | 验证方法           |
| ---------- | ----------------------------- | ------------------ |
| AI真实调用 | 每个Agent任务都真正调用AI服务 | 检查token消耗记录  |
| 启动验证   | 缺少API密钥时无法启动项目     | 移除API Key测试    |
| 输出验证   | 无效输出不会被接受            | 检查生成的文档内容 |
| 真实进度   | 进度与任务完成情况一致        | 对比任务状态和进度 |
| 错误处理   | 失败任务有明确的错误信息      | 模拟API失败场景    |
| 反馈循环   | Leader可以审查并要求修改      | 执行完整流程       |

---

## 4. 风险评估

| 风险            | 可能性 | 影响 | 缓解措施                 |
| --------------- | ------ | ---- | ------------------------ |
| API调用成本增加 | 高     | 中   | 优化prompt、缓存相似请求 |
| 执行时间变长    | 高     | 中   | 并行执行、超时控制       |
| 数据库迁移复杂  | 中     | 高   | 分阶段迁移、保持向后兼容 |
| 重试耗尽资源    | 低     | 高   | 限制重试次数、熔断机制   |

---

## 5. 附录

### 5.1 参考实现

- AI Team 团队协同: `backend/src/modules/ai/ai-teams/`
- AI Team 任务编排: `backend/src/modules/ai/ai-teams/services/collaboration/team-mission.service.ts`
- AI 调用服务: `backend/src/modules/ai/ai-core/ai-chat.service.ts`

### 5.2 关键文件清单

需要修改的文件：

- `backend/src/modules/ai/ai-coding/ai-coding.service.ts`
- `backend/src/modules/ai/ai-coding/ai-coding.gateway.ts`
- `backend/src/modules/ai/ai-core/ai-chat.service.ts`
- `frontend/app/(main)/ai-coding/[projectId]/page.tsx`
- `frontend/hooks/useAiCodingSocket.ts`

需要新增的文件：

- `backend/src/modules/ai/ai-coding/services/coding-team.service.ts`
- `backend/src/modules/ai/ai-coding/services/coding-mission.service.ts`
- `backend/src/modules/ai/ai-coding/services/coding-agent.service.ts`
- `frontend/components/ai-coding/TeamChatPanel.tsx`
- `frontend/components/ai-coding/AgentStatusCard.tsx`

---

**文档版本历史**

| 版本 | 日期       | 作者  | 变更说明 |
| ---- | ---------- | ----- | -------- |
| 1.0  | 2025-12-21 | AI PM | 初始版本 |
