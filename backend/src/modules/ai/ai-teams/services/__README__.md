# TeamCollaborationService 使用指南

## 概述

`TeamCollaborationService` 桥接 `ai-agents` 协作工具与 `ai-teams` 成员系统，提供任务委派和共识投票功能。

## 功能

### 1. 任务委派（Agent Handoff）

将任务委派给其他 AI 成员执行。

#### 接口定义

```typescript
interface HandoffRequest {
  topicId: string;
  fromMemberId: string; // 发起委派的成员
  toMemberId: string; // 目标成员
  task: string; // 任务描述
  context?: Record<string, unknown>;
  waitForResult?: boolean; // 是否等待结果（同步/异步）
}

interface HandoffResult {
  success: boolean;
  handoffId: string;
  targetMemberName: string;
  status: "delegated" | "completed" | "failed";
  responseMessageId?: string;
  error?: string;
}
```

#### 使用示例

```typescript
import { TeamCollaborationService } from "./services";

@Injectable()
class ExampleService {
  constructor(private teamCollaboration: TeamCollaborationService) {}

  async delegateToDesigner() {
    // 异步委派（立即返回）
    const result = await this.teamCollaboration.delegateTask({
      topicId: "topic-123",
      fromMemberId: "member-alice",
      toMemberId: "member-bob",
      task: "请设计一个科技感的海报",
      context: {
        theme: "未来科技",
        colors: ["#0066FF", "#00CCFF"],
      },
      waitForResult: false,
    });

    console.log(result);
    // {
    //   success: true,
    //   handoffId: 'uuid-xxx',
    //   targetMemberName: 'Bob Designer',
    //   status: 'delegated'
    // }
  }

  async delegateAndWait() {
    // 同步委派（等待结果）
    const result = await this.teamCollaboration.delegateTask({
      topicId: "topic-123",
      fromMemberId: "member-alice",
      toMemberId: "member-bob",
      task: "分析这份市场报告",
      waitForResult: true,
    });

    console.log(result);
    // {
    //   success: true,
    //   handoffId: 'uuid-xxx',
    //   targetMemberName: 'Bob Analyst',
    //   status: 'completed',
    //   responseMessageId: 'msg-456'
    // }
  }
}
```

### 2. 共识投票（Consensus Mechanism）

在多个 AI 成员之间建立共识决策。

#### 接口定义

```typescript
interface VoteRequest {
  topicId: string;
  proposalId: string;
  title: string;
  description: string;
  initiatorId: string; // 发起者（AI成员ID）
  voterIds: string[]; // 参与投票的成员ID列表
  strategy: "MAJORITY" | "SUPERMAJORITY" | "UNANIMOUS";
  options?: string[];
}

interface VoteResult {
  success: boolean;
  proposalId: string;
  consensusReached: boolean;
  decision: string;
  votes: Array<{
    voterId: string;
    voterName: string;
    value: string;
    reason?: string;
  }>;
}
```

#### 投票策略说明

- **MAJORITY**: 简单多数（>50%）
- **SUPERMAJORITY**: 超级多数（>66%）
- **UNANIMOUS**: 全票通过（100%）

#### 使用示例

```typescript
// 1. 创建投票提案
const proposalResult = await this.teamCollaboration.createVoteProposal({
  topicId: "topic-123",
  proposalId: "proposal-001",
  title: "是否采用新的技术架构",
  description: "建议将后端框架从 Express 迁移到 NestJS",
  initiatorId: "member-leader",
  voterIds: ["member-dev1", "member-dev2", "member-architect"],
  strategy: "SUPERMAJORITY",
  options: ["赞成迁移", "反对迁移", "需要更多信息"],
});

console.log(proposalResult);
// {
//   proposalId: 'proposal-001',
//   status: 'OPEN'
// }

// 2. AI 成员手动投票
await this.teamCollaboration.castMemberVote(
  "proposal-001",
  "member-dev1",
  "APPROVE",
  "迁移可以提高代码质量和开发效率",
);

await this.teamCollaboration.castMemberVote(
  "proposal-001",
  "member-dev2",
  "REJECT",
  "迁移成本太高，现有系统运行稳定",
);

// 3. 自动收集所有 AI 成员的投票
// 每个 AI 会基于提案内容自主决定投票
const voteResult = await this.teamCollaboration.collectAIVotes("proposal-001");

console.log(voteResult);
// {
//   success: true,
//   proposalId: 'proposal-001',
//   consensusReached: true,
//   decision: 'APPROVE',
//   votes: [
//     {
//       voterId: 'member-dev1',
//       voterName: 'Developer 1',
//       value: 'APPROVE',
//       reason: '迁移可以提高代码质量...'
//     },
//     {
//       voterId: 'member-dev2',
//       voterName: 'Developer 2',
//       value: 'REJECT',
//       reason: '迁移成本太高...'
//     },
//     {
//       voterId: 'member-architect',
//       voterName: 'Architect',
//       value: 'APPROVE',
//       reason: '长期来看有利于系统架构...'
//     }
//   ]
// }

// 4. 查询投票结果
const result = this.teamCollaboration.getVoteResult("proposal-001");

// 5. 查询提案状态
const status = this.teamCollaboration.getProposalStatus("proposal-001");
console.log(status);
// {
//   exists: true,
//   status: 'CLOSED',
//   statistics: {
//     totalVoters: 3,
//     votesReceived: 3,
//     participationRate: 100,
//     approves: 2,
//     rejects: 1,
//     abstains: 0
//   }
// }
```

## 工作流程

### 任务委派流程

```
1. Leader Agent 决定委派任务
   ↓
2. 调用 delegateTask()
   ↓
3. 验证成员存在
   ↓
4. 创建委派消息
   ↓
5a. 异步模式：立即返回 'delegated' 状态
5b. 同步模式：调用 aiResponseService.generateAIResponse()
   ↓
6. 返回结果（包含 responseMessageId 或错误）
```

### 共识投票流程

```
1. 创建投票提案
   ↓
2. 验证发起者和投票者
   ↓
3. 存储提案到 Map
   ↓
4. 创建提案消息
   ↓
5. 调用 collectAIVotes() 自动收集投票
   ↓
6. 为每个 AI 成员构造投票提示词
   ↓
7. 调用 aiResponseService.generateAIResponse()
   ↓
8. 解析 AI 响应提取投票意见
   ↓
9. 记录投票结果
   ↓
10. 计算共识结果
   ↓
11. 关闭投票，返回最终结果
```

## 集成要点

### 与 AgentHandoffTool 集成

`AgentHandoffTool` 中的 `executeTargetAgent()` 方法当前是模拟实现。`TeamCollaborationService.delegateTask()` 提供了真实的实现：

- 验证成员存在于 Topic 中
- 创建委派消息记录
- 调用 `AiResponseService` 生成 AI 响应
- 返回响应消息 ID

### 与 ConsensusMechanismTool 集成

`ConsensusMechanismTool` 使用内存存储提案。`TeamCollaborationService` 扩展了功能：

- 提供完整的成员验证
- 自动收集 AI 投票（调用 AI 生成意见）
- 解析 AI 响应提取投票意向
- 创建投票消息记录

## 注意事项

### 1. 循环依赖

`TeamCollaborationService` 依赖 `AiResponseService`，需要确保正确的模块导入顺序。

### 2. 内存存储

当前提案存储在内存 Map 中，服务重启会丢失。后续可考虑：

- 存储到数据库
- 使用 Redis 缓存
- 持久化到文件

### 3. AI 投票解析

`parseVoteFromResponse()` 使用简单的关键词匹配提取投票意见。可优化为：

- 使用结构化输出（JSON Schema）
- 提示词引导返回固定格式
- 使用正则表达式或 NLP 解析

### 4. 错误处理

各方法都包含 try-catch 错误处理，但调用方仍需处理可能的异常：

- 成员不存在
- AI 响应生成失败
- 提案不存在

### 5. 日志记录

Service 使用 NestJS Logger，关键操作都有日志记录，便于调试和追踪。

## 未来扩展

### 1. 持久化存储

```typescript
// 将提案存储到数据库
interface ConsensusProposal {
  id: string;
  topicId: string;
  title: string;
  // ...
}

// Prisma Schema
model ConsensusProposal {
  id          String   @id @default(uuid())
  topicId     String
  title       String
  description String
  // ...
}
```

### 2. 实时通知

```typescript
// 投票事件推送
this.aiTeamsGateway.emitToTopic(topicId, "vote:cast", {
  proposalId,
  voterId,
  value,
});

this.aiTeamsGateway.emitToTopic(topicId, "vote:completed", {
  proposalId,
  result,
});
```

### 3. 投票历史

```typescript
// 查询历史投票
async getVoteHistory(topicId: string): Promise<VoteResult[]> {
  // 返回该 Topic 的所有投票记录
}
```

### 4. 委派链追踪

```typescript
// 追踪任务委派链
interface HandoffChain {
  originalTask: string;
  delegations: Array<{
    from: string;
    to: string;
    task: string;
    timestamp: string;
  }>;
}
```

## 测试示例

```typescript
import { Test } from "@nestjs/testing";
import { TeamCollaborationService } from "./team-collaboration.service";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiResponseService } from "../ai-response.service";

describe("TeamCollaborationService", () => {
  let service: TeamCollaborationService;
  let prisma: PrismaService;
  let aiResponse: AiResponseService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TeamCollaborationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: AiResponseService,
          useValue: mockAiResponse,
        },
      ],
    }).compile();

    service = module.get<TeamCollaborationService>(TeamCollaborationService);
  });

  describe("delegateTask", () => {
    it("should delegate task successfully", async () => {
      const result = await service.delegateTask({
        topicId: "topic-1",
        fromMemberId: "member-1",
        toMemberId: "member-2",
        task: "Test task",
        waitForResult: false,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("delegated");
    });
  });

  describe("createVoteProposal", () => {
    it("should create proposal successfully", async () => {
      const result = await service.createVoteProposal({
        topicId: "topic-1",
        proposalId: "proposal-1",
        title: "Test Proposal",
        description: "Test",
        initiatorId: "member-1",
        voterIds: ["member-2", "member-3"],
        strategy: "MAJORITY",
      });

      expect(result.proposalId).toBe("proposal-1");
      expect(result.status).toBe("OPEN");
    });
  });
});
```

## 参考资料

- [AgentHandoffTool 源码](../../../ai-agents/tools/collaboration/agent-handoff.tool.ts)
- [ConsensusMechanismTool 源码](../../../ai-agents/tools/collaboration/consensus-mechanism.tool.ts)
- [AiResponseService 源码](../ai-response.service.ts)
- [AI Agents 集成指南](../../../../docs/features/ai-agents/ai-modules-integration-guide.md)
