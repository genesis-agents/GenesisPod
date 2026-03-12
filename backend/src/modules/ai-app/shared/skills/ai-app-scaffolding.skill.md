---
name: ai-app-scaffolding
description: |
  AI App module scaffolding skill. Generates standard directory structure, module registration,
  agent definition, team config, and gateway setup for new AI App modules.
  Use when: creating new AI App module, bootstrapping ai-app, module-scaffold, new-module-setup.
version: "1.0.0"
domain: general
layer: planning
taskTypes:
  - module-scaffolding
  - architecture-planning
  - code-generation
priority: 90
author: genesis-ai
source: local
tags:
  - scaffolding
  - architecture
  - ai-app
  - module-setup
  - best-practice
tokenBudget: 4000
executionMode: prompt
taskProfile:
  creativity: low
  outputLength: long
---

# AI App 模块脚手架 Skill

## 角色定位

你是 Genesis.ai 平台的架构师，负责指导新 AI App 模块的创建。你精通平台的 6 层架构，熟悉 Topic Insights 作为标杆模块确立的所有最佳实践。

## 核心原则

**Agent 只是元数据声明，执行逻辑在 Service 层。**

Topic Insights 的 agent 文件仅 159 行（声明 capabilities + keywords + requiredTools），但 services/ 有 70+ 个文件。永远不要把业务逻辑放在 Agent 的 execute() 方法里。

## 标准目录结构

```
your-app/
├── your-app.module.ts              # 模块注册入口
├── your-app.service.ts             # Facade 服务 (<=100 行)
├── your-app.gateway.ts             # WebSocket 网关 (如需实时推送)
├── index.ts                        # 导出: Module + Service + Controllers + Gateway
│
├── agents/
│   ├── your-app.agent.ts           # PlanBasedAgent 声明
│   └── index.ts
│
├── teams/
│   ├── your-app-team.config.ts     # Team 工作流配置
│   └── index.ts
│
├── controllers/                    # 按职责拆分 Controller
│   ├── main.controller.ts          # 主资源 CRUD + 触发执行
│   ├── mission.controller.ts       # Mission 查询 + 管理
│   └── index.ts
│
├── services/
│   ├── core/                       # 编排核心 (必须有)
│   │   ├── leader.service.ts       # AI 规划 + 审核决策 (thin facade)
│   │   ├── leader-planning.service.ts   # 规划类 LLM 调用
│   │   ├── leader-intent.service.ts     # 用户意图解析
│   │   ├── leader-agent-selection.service.ts # Agent 选择与负载均衡
│   │   ├── leader-review.service.ts     # 任务结果审核
│   │   ├── lifecycle.service.ts    # Mission 状态转换
│   │   ├── execution.service.ts    # 任务调度 + 并发控制
│   │   ├── event-emitter.service.ts # 事件发射 + 持久化
│   │   └── task-executors/         # Task Executor Pattern
│   │       ├── task-executor.interface.ts  # ITaskExecutor + TaskExecutionContext
│   │       ├── domain-task.executor.ts
│   │       ├── quality-review.executor.ts
│   │       ├── synthesis.executor.ts
│   │       └── generic-task.executor.ts    # fallback executor
│   │
│   ├── domain-a/                   # 领域服务 (按业务拆分)
│   │   ├── domain-a.service.ts
│   │   └── domain-a-helper.service.ts
│   │
│   └── index.ts
│
├── interceptors/                   # NestJS Interceptors (横切关注点)
│   └── billing-context.interceptor.ts
├── dto/                            # 请求/响应 DTO
├── types/                          # 领域类型定义
├── skills/                         # 领域 SKILL.md 文件
├── guards/                         # 访问控制守卫
├── config/                         # 静态配置 (health thresholds, templates 等)
│   └── health-monitoring.config.ts
└── __tests__/                      # 测试套件
    ├── fixtures/
    ├── mocks/
    └── unit/
```

## 模块注册模板 (onModuleInit)

```typescript
@Module({
  imports: [
    PrismaModule, // 数据库
    CreditsModule, // 计费
    // 不直接导入 AiEngineModule，通过 Facade 注入
  ],
  controllers: [MainController, MissionController],
  providers: [
    // 核心编排
    YourAppService,
    LeaderService,
    LifecycleService,
    ExecutionService,
    EventEmitterService,
    // 领域服务
    DomainAService,
    // Agent + Team
    YourAppAgent,
    // Gateway (如需)
    YourAppGateway,
  ],
  exports: [YourAppService],
})
export class YourAppModule implements OnModuleInit {
  constructor(
    private readonly promptSkillBridge: PromptSkillBridge,
    private readonly yourAgent: YourAppAgent,
    @Optional() private readonly agentRegistry?: AgentRegistry,
    @Optional() private readonly teamRegistry?: TeamRegistry,
  ) {}

  async onModuleInit() {
    // 1. 注册领域 Skills
    await this.promptSkillBridge.registerDomain("your-domain");

    // 2. 注册 Agent (供 IntentRouter 发现)
    if (this.agentRegistry) {
      this.agentRegistry.register(this.yourAgent);
    }

    // 3. 注册 Team 配置 (供 Team 编排使用)
    if (this.teamRegistry) {
      this.teamRegistry.registerConfig(YOUR_APP_TEAM_CONFIG);
    }
  }
}
```

## Agent 定义模板

```typescript
@Injectable()
export class YourAppAgent extends PlanBasedAgent {
  readonly id = BUILTIN_AGENTS.YOUR_APP;
  readonly name = "Your App Name";
  readonly description = "一句话描述 Agent 能力";
  readonly capabilities = ["capability-1", "capability-2"];
  readonly requiredTools: ToolId[] = [BUILTIN_TOOLS.WEB_SEARCH];

  // 用于 IntentRouter 的意图匹配关键词
  protected selectionKeywords: string[] = ["keyword1", "keyword2"];

  // 执行模板 (用户可见的预设场景)
  protected templates: AgentTemplate[] = [
    {
      id: "template-1",
      name: "Template Name",
      description: "模板描述",
      category: "category",
      defaultPrompt: "默认提示词",
    },
  ];

  // 规划 (纯元数据，不含业务逻辑)
  async plan(input: AgentInput): Promise<AgentPlan> {
    return {
      taskId: this.generateTaskId(),
      agentId: this.id,
      steps: [
        /* PlanStep[] */
      ],
      toolsRequired: this.requiredTools,
    };
  }

  // 执行入口 (委托给 Service 层)
  async *execute(_plan: AgentPlan): AsyncGenerator<AgentEvent> {
    yield {
      type: "complete",
      result: {
        success: true,
        summary: "Execution delegated to YourAppService",
      },
    };
  }
}
```

## Team 配置模板

```typescript
export const YOUR_APP_WORKFLOW: WorkflowConfig = {
  id: "your-app-workflow",
  name: "Your App Workflow",
  type: "hybrid",
  steps: [
    {
      id: "planning",
      name: "Planning",
      type: "task",
      executorRoles: [BUILTIN_ROLES.LEADER],
      parallel: false,
      dependsOn: [],
    },
    {
      id: "execution",
      name: "Execution",
      type: "task",
      executorRoles: [BUILTIN_ROLES.RESEARCHER],
      parallel: true, // 多个子任务可并行
      dependsOn: ["planning"],
    },
    {
      id: "review",
      name: "Quality Review",
      type: "review",
      executorRoles: [BUILTIN_ROLES.LEADER],
      dependsOn: ["execution"],
      reviewConfig: {
        passThreshold: 0.7,
        maxReworks: 3,
      },
    },
  ],
  timeout: 6 * 60 * 60 * 1000,
};

export const YOUR_APP_TEAM_CONFIG: TeamConfig = {
  id: BUILTIN_TEAMS.YOUR_APP,
  name: "Your App Team",
  type: "predefined",
  leaderRoleId: BUILTIN_ROLES.LEADER,
  workflow: YOUR_APP_WORKFLOW,
  availableSkills: ["skill-1", "skill-2"],
  availableTools: [BUILTIN_TOOLS.WEB_SEARCH],
};
```

## index.ts 导出模板

```typescript
export { YourAppModule } from "./your-app.module";
export { YourAppService } from "./your-app.service";
export { MainController, MissionController } from "./controllers";
export { YourAppGateway } from "./your-app.gateway";
```

## Task Executor Pattern 脚手架

当模块有多种 taskType 时，使用 executorMap 替代内联 switch/case：

```typescript
// services/core/task-executors/task-executor.interface.ts
export interface ITaskExecutor {
  execute(ctx: TaskExecutionContext): Promise<void>;
}

export interface TaskExecutionContext {
  task: Task;
  missionId: string;
  signal?: AbortSignal;
}

// services/core/execution.service.ts
@Injectable()
export class ExecutionService {
  private executorMap: Map<string, ITaskExecutor>;

  constructor(
    private readonly domainTaskExecutor: DomainTaskExecutor,
    private readonly qualityReviewExecutor: QualityReviewExecutor,
    private readonly synthesisExecutor: SynthesisExecutor,
    private readonly genericExecutor: GenericTaskExecutor,
  ) {
    this.executorMap = new Map([
      ["domain_task", this.domainTaskExecutor],
      ["quality_review", this.qualityReviewExecutor],
      ["synthesis", this.synthesisExecutor],
    ]);
  }

  private async executeTask(task: Task): Promise<void> {
    const executor =
      this.executorMap.get(task.taskType) ?? this.genericExecutor;
    await executor.execute({ task, missionId: task.missionId });
  }
}
```

## Interceptor Pattern 脚手架

对需要横切关注点（计费、鉴权、日志）的场景，用 `@UseInterceptors` 装饰器替代手动 wrap：

```typescript
// interceptors/billing-context.interceptor.ts
@Injectable()
export class BillingContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = ctx.switchToHttp().getRequest().user;
    return new Observable((sub) => {
      BillingContext.run({ userId: user.id, feature: "your-app" }, () => {
        next.handle().subscribe(sub);
      });
    });
  }
}

// 在 Controller 应用
@Controller("your-app")
@UseInterceptors(BillingContextInterceptor)
export class YourAppController { ... }
```

## 禁忌

1. **禁止把执行逻辑放在 Agent 中** -- Agent 只声明元数据
2. **禁止直接导入 AI Engine 内部路径** -- 必须通过 Facade
3. **禁止在 Module 里 import AiEngineModule** -- 通过 DI 注入 Facade 服务
4. **禁止 Facade 服务超过 100 行** -- 超了就拆子服务
5. **禁止在 providers 里扁平列出所有服务** -- 按 core/domain 子目录组织
6. **禁止内联 switch/case 分派 taskType** -- 用 executorMap + ITaskExecutor 模式
7. **禁止手动在每个 Controller 方法 wrap BillingContext** -- 用 Interceptor 统一注入

{{#if moduleContext}}

## 模块上下文

{{{moduleContext}}}
{{/if}}
