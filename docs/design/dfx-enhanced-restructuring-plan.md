# DeepDive Engine 目录重构方案 - DFx 增强版

> 版本: 2.0 | 创建日期: 2025-12-28 | 状态: 待评审

---

## 一、DFx 设计原则

### 1.1 DFx 目标矩阵

| DFx 维度           | 目标         | 关键指标               | 验收标准                 |
| ------------------ | ------------ | ---------------------- | ------------------------ |
| **可维护性 (DFM)** | 降低变更成本 | 模块耦合度、代码重复率 | 单模块变更不影响其他模块 |
| **可扩展性 (DFE)** | 支持功能扩展 | 新增功能代码行数       | 新增 AI 模块 < 500 行    |
| **可测试性 (DFT)** | 提高测试覆盖 | 测试覆盖率、Mock 难度  | 核心模块覆盖率 > 80%     |
| **可靠性 (DFR)**   | 减少故障影响 | 故障隔离度、恢复时间   | 单服务故障不影响整体     |
| **安全性 (DFS)**   | 保护敏感数据 | 权限边界清晰度         | 无越权访问路径           |
| **性能 (DFP)**     | 优化加载速度 | 首屏时间、包体积       | 首屏 < 2s，包 < 500KB    |
| **可观测性 (DFO)** | 支持问题定位 | 日志完整度、追踪覆盖   | 问题定位 < 5 分钟        |
| **可部署性 (DFD)** | 简化部署流程 | 部署步骤、回滚时间     | 一键部署，回滚 < 5 分钟  |

---

## 二、可维护性设计 (DFM)

### 2.1 模块依赖规则

```
┌─────────────────────────────────────────────────────────────────────┐
│                       依赖层次图（由下到上）                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Layer 4: Features (页面/功能)                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │ai-studio│ │ai-teams │ │ai-office│ │ library │ ...               │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                   │
│       │          │          │          │                           │
│       ▼          ▼          ▼          ▼                           │
│  Layer 3: Domain (业务领域)                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │ai-core  │ │ content │ │  data   │ │  core   │                   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                   │
│       │          │          │          │                           │
│       ▼          ▼          ▼          ▼                           │
│  Layer 2: Infrastructure (基础设施)                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ common/ (ai-orchestration, streaming, prisma, guards...)    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Layer 1: External (外部依赖)                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ NestJS, Prisma, OpenAI SDK, Next.js, React...               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

依赖规则：
✅ 上层可依赖下层
✅ 同层可依赖（需通过接口）
❌ 下层不可依赖上层
❌ 跨层依赖（如 Features 直接依赖 External）
```

### 2.2 模块边界定义

```typescript
// backend/src/modules/MODULE_BOUNDARIES.ts
// 模块边界配置，用于 ESLint 规则校验

export const MODULE_BOUNDARIES = {
  // Layer 4: Features
  "modules/ai/ai-studio": {
    allow: ["modules/ai/ai-core", "modules/content", "common"],
    deny: ["modules/ai/ai-teams", "modules/ai/ai-office"], // 同层不直接依赖
  },
  "modules/ai/ai-teams": {
    allow: ["modules/ai/ai-core", "modules/content", "common"],
    deny: ["modules/ai/ai-studio", "modules/ai/ai-office"],
  },

  // Layer 3: Domain
  "modules/ai/ai-core": {
    allow: ["common"],
    deny: ["modules/ai/ai-studio", "modules/ai/ai-teams"], // 不可依赖上层
  },
  "modules/content": {
    allow: ["common"],
    deny: ["modules/ai"],
  },

  // Layer 2: Infrastructure
  common: {
    allow: [], // 只依赖外部库
    deny: ["modules"],
  },
};
```

### 2.3 变更影响分析

```
变更类型          影响范围                    需要验证
─────────────────────────────────────────────────────────
common/dtos      所有使用该 DTO 的模块        全量测试
common/errors    所有错误处理                 全量测试
ai-core          所有 AI 模块                 AI 模块测试
ai-studio        仅 ai-studio                ai-studio 测试
content          content + 依赖它的模块       content 相关测试
```

### 2.4 目录结构增强（DFM）

```
backend/src/
├── common/                          # Layer 2: Infrastructure
│   ├── dtos/                        # 公共 DTO
│   │   ├── base/
│   │   │   ├── pagination.dto.ts
│   │   │   ├── response.dto.ts
│   │   │   └── __tests__/           # 🆕 DTO 测试
│   │   │       └── pagination.dto.spec.ts
│   │   └── index.ts
│   │
│   ├── errors/                      # 统一错误
│   │   ├── error.types.ts
│   │   ├── error.factory.ts
│   │   ├── error.codes.ts
│   │   ├── __tests__/               # 🆕 错误处理测试
│   │   └── index.ts
│   │
│   ├── interfaces/                  # 🆕 公共接口（依赖倒置）
│   │   ├── ai-service.interface.ts  # AI 服务接口
│   │   ├── storage.interface.ts     # 存储接口
│   │   ├── cache.interface.ts       # 缓存接口
│   │   └── index.ts
│   │
│   ├── constants/                   # 🆕 公共常量
│   │   ├── error-messages.ts
│   │   ├── config-keys.ts
│   │   └── index.ts
│   │
│   └── ...existing directories
```

---

## 三、可扩展性设计 (DFE)

### 3.1 扩展点定义

```
┌─────────────────────────────────────────────────────────────────────┐
│                         扩展点架构                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Plugin Registry                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │   │
│  │  │AI Provider│ │  Agent   │ │  Export  │ │ Storage  │       │   │
│  │  │  Plugin   │ │  Plugin  │ │  Plugin  │ │  Plugin  │       │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Extension Points                          │   │
│  │                                                              │   │
│  │  1. AI Provider Extension    - 新增 AI 模型提供商            │   │
│  │  2. Agent Extension          - 新增 Agent 类型               │   │
│  │  3. Export Format Extension  - 新增导出格式                  │   │
│  │  4. Storage Backend Extension- 新增存储后端                  │   │
│  │  5. Auth Strategy Extension  - 新增认证方式                  │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 AI Provider 扩展点

```typescript
// common/ai-orchestration/providers/ai-provider.interface.ts

export interface IAIProvider {
  readonly name: string;
  readonly supportedModels: string[];

  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<ChatChunk>;

  // 可选能力
  embeddings?(text: string): Promise<number[]>;
  imageGeneration?(prompt: string): Promise<string>;
}

// 新增提供商只需实现接口
// common/ai-orchestration/providers/deepseek.provider.ts
@Injectable()
export class DeepSeekProvider implements IAIProvider {
  readonly name = 'deepseek';
  readonly supportedModels = ['deepseek-chat', 'deepseek-coder'];

  // 实现接口方法...
}

// 通过装饰器自动注册
@AIProvider('deepseek')
export class DeepSeekProvider implements IAIProvider { ... }
```

### 3.3 Agent 扩展点

```typescript
// modules/ai/ai-core/agents/agent.registry.ts

export interface IAgentRegistry {
  register(type: string, agentClass: typeof BaseAgent): void;
  get(type: string): typeof BaseAgent | undefined;
  list(): string[];
}

// 使用装饰器自动注册
@Agent({
  type: "researcher",
  name: "深度研究员",
  description: "执行深度研究任务",
})
export class ResearcherAgent extends BaseAgent {
  // 只需实现业务逻辑
}

// 新增 Agent 示例（扩展无需修改核心代码）
// modules/ai/ai-studio/agents/fact-checker.agent.ts
@Agent({
  type: "fact-checker",
  name: "事实核查员",
  description: "验证信息准确性",
})
export class FactCheckerAgent extends BaseAgent {
  protected getSystemPrompt(): string {
    return factCheckerPrompt;
  }
}
```

### 3.4 Export Format 扩展点

```typescript
// modules/export/interfaces/exporter.interface.ts

export interface IExporter {
  readonly format: string;
  readonly mimeType: string;
  readonly extension: string;

  export(data: ExportData): Promise<Buffer>;
  supports(contentType: string): boolean;
}

// 新增导出格式只需实现接口
@Exporter("notion")
export class NotionExporter implements IExporter {
  readonly format = "notion";
  readonly mimeType = "application/json";
  readonly extension = ".notion.json";

  async export(data: ExportData): Promise<Buffer> {
    // 实现 Notion 格式导出
  }
}
```

### 3.5 前端组件扩展点

```typescript
// frontend/components/composed/dialogs/dialog.registry.ts

export interface DialogRegistryEntry {
  type: string;
  component: React.ComponentType<BaseDialogProps>;
  defaultProps?: Partial<BaseDialogProps>;
}

// 注册新对话框类型
dialogRegistry.register({
  type: 'import-notion',
  component: ImportNotionDialog,
  defaultProps: { size: 'lg' },
});

// 动态渲染
<DynamicDialog type="import-notion" {...props} />
```

---

## 四、可测试性设计 (DFT)

### 4.1 测试目录规范

```
backend/src/
├── common/
│   ├── dtos/
│   │   └── __tests__/               # 单元测试（就近放置）
│   │       ├── pagination.dto.spec.ts
│   │       └── fixtures/            # 测试数据
│   │           └── pagination.fixtures.ts
│   │
│   └── ai-orchestration/
│       └── __tests__/
│           ├── ai-orchestration.service.spec.ts
│           ├── mocks/               # Mock 对象
│           │   └── ai-provider.mock.ts
│           └── fixtures/
│               └── chat-response.fixtures.ts
│
├── modules/
│   └── ai/
│       └── ai-core/
│           └── __tests__/
│               ├── unit/            # 单元测试
│               │   ├── base-agent.spec.ts
│               │   └── prompt-template.spec.ts
│               ├── integration/     # 集成测试
│               │   └── ai-chat.integration.spec.ts
│               └── e2e/             # 端到端测试
│                   └── ai-chat.e2e.spec.ts
│
└── test/                            # 全局测试配置
    ├── setup.ts                     # 测试环境设置
    ├── utils/                       # 测试工具
    │   ├── test-database.ts         # 测试数据库
    │   ├── test-auth.ts             # 测试认证
    │   └── test-fixtures.ts         # 通用 fixtures
    └── mocks/                       # 全局 mocks
        ├── ai-service.mock.ts
        └── storage.mock.ts

frontend/
├── components/
│   └── ui/
│       └── __tests__/
│           ├── Button.test.tsx
│           └── snapshots/           # 快照测试
│               └── Button.snap
│
└── __tests__/                       # 前端全局测试
    ├── setup.ts
    ├── utils/
    │   ├── render-with-providers.tsx
    │   └── mock-router.ts
    └── mocks/
        └── api.mock.ts
```

### 4.2 Mock 策略

```typescript
// backend/test/mocks/ai-service.mock.ts

export class MockAIOrchestrationService implements IAIOrchestrationService {
  private responses: Map<string, ChatResponse> = new Map();

  // 预设响应
  setResponse(key: string, response: ChatResponse): void {
    this.responses.set(key, response);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const key = this.generateKey(request);
    return this.responses.get(key) ?? this.defaultResponse();
  }

  // 用于验证调用
  getCalls(): ChatRequest[] { ... }
  getCallCount(): number { ... }
  reset(): void { ... }
}

// 使用示例
describe('AiAskService', () => {
  let service: AiAskService;
  let mockAI: MockAIOrchestrationService;

  beforeEach(() => {
    mockAI = new MockAIOrchestrationService();
    mockAI.setResponse('default', {
      content: 'Mock response',
      model: 'gpt-4o',
      usage: { totalTokens: 100 },
    });

    service = new AiAskService(mockAI);
  });

  it('should return AI response', async () => {
    const result = await service.ask('Hello');
    expect(result).toBe('Mock response');
    expect(mockAI.getCallCount()).toBe(1);
  });
});
```

### 4.3 测试覆盖率目标

| 模块     | 单元测试 | 集成测试 | E2E 测试 |
| -------- | -------- | -------- | -------- |
| common/  | 90%      | 70%      | -        |
| ai-core/ | 85%      | 80%      | 60%      |
| ai-\*/   | 70%      | 60%      | 50%      |
| content/ | 80%      | 70%      | 50%      |
| core/    | 90%      | 80%      | 70%      |

### 4.4 可测试性检查清单

```typescript
// 可测试性设计原则

// ✅ 依赖注入，便于 Mock
@Injectable()
export class AiAskService {
  constructor(
    private readonly aiOrchestration: IAIOrchestrationService, // 接口，可替换
    private readonly cache: ICacheService,                      // 接口，可替换
  ) {}
}

// ✅ 纯函数，易于测试
export function calculateTokenCost(tokens: number, model: string): number {
  // 无副作用，输入决定输出
}

// ✅ 小而专注的函数
export async function validatePrompt(prompt: string): ValidationResult { ... }
export async function renderPrompt(template: string, vars: object): string { ... }

// ❌ 避免：硬编码依赖
export class BadService {
  private ai = new OpenAIProvider(); // 无法 Mock
}

// ❌ 避免：大函数
export async function doEverything() {
  // 500 行代码，难以测试
}
```

---

## 五、可靠性设计 (DFR)

### 5.1 故障隔离架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         故障隔离边界                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      Bulkhead Pattern                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │  AI Pool    │  │ DB Pool     │  │ External    │           │ │
│  │  │ (隔离 AI)   │  │ (隔离 DB)   │  │ API Pool    │           │ │
│  │  │ timeout:30s │  │ timeout:5s  │  │ timeout:10s │           │ │
│  │  │ retry: 3    │  │ retry: 2    │  │ retry: 3    │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    Circuit Breaker                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ OpenAI CB   │  │ Claude CB   │  │ Grok CB     │           │ │
│  │  │ threshold:5 │  │ threshold:5 │  │ threshold:5 │           │ │
│  │  │ timeout:60s │  │ timeout:60s │  │ timeout:60s │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 降级策略

```typescript
// common/ai-orchestration/fallback-strategies.ts

export interface IFallbackStrategy {
  canHandle(error: Error): boolean;
  execute(request: ChatRequest): Promise<ChatResponse>;
}

// 策略 1: 模型降级
@FallbackStrategy({ priority: 1 })
export class ModelDowngradeStrategy implements IFallbackStrategy {
  private fallbackChain = [
    'gpt-4o' → 'gpt-4o-mini',
    'claude-3-opus' → 'claude-3-sonnet',
    'grok-2' → 'grok-1',
  ];

  canHandle(error: Error): boolean {
    return error instanceof AIRateLimitError || error instanceof AITimeoutError;
  }

  async execute(request: ChatRequest): Promise<ChatResponse> {
    const fallbackModel = this.fallbackChain[request.model];
    return this.ai.chat({ ...request, model: fallbackModel });
  }
}

// 策略 2: 提供商降级
@FallbackStrategy({ priority: 2 })
export class ProviderFallbackStrategy implements IFallbackStrategy {
  private providerPriority = ['openai', 'anthropic', 'xai'];

  canHandle(error: Error): boolean {
    return error instanceof AIServiceUnavailableError;
  }

  async execute(request: ChatRequest): Promise<ChatResponse> {
    for (const provider of this.providerPriority) {
      try {
        return await this.providers.get(provider).chat(request);
      } catch (e) {
        continue;
      }
    }
    throw new AllProvidersFailedError();
  }
}

// 策略 3: 缓存降级
@FallbackStrategy({ priority: 3 })
export class CacheFallbackStrategy implements IFallbackStrategy {
  canHandle(error: Error): boolean {
    return true; // 最后兜底
  }

  async execute(request: ChatRequest): Promise<ChatResponse> {
    const cached = await this.cache.get(this.generateKey(request));
    if (cached) {
      return { ...cached, fromCache: true };
    }
    throw new NoFallbackAvailableError();
  }
}
```

### 5.3 错误恢复流程

```typescript
// common/errors/error-recovery.service.ts

@Injectable()
export class ErrorRecoveryService {
  async handleError(
    error: Error,
    context: RequestContext,
  ): Promise<RecoveryResult> {
    // 1. 分类错误
    const errorType = this.classifier.classify(error);

    // 2. 记录错误
    await this.logger.logError(error, context);

    // 3. 执行恢复策略
    const strategy = this.strategies.get(errorType);
    if (strategy) {
      try {
        const result = await strategy.recover(error, context);
        return { recovered: true, result };
      } catch (recoveryError) {
        // 恢复失败，升级处理
        return this.escalate(error, recoveryError, context);
      }
    }

    // 4. 无可用策略，返回友好错误
    return {
      recovered: false,
      userMessage: this.getUserFriendlyMessage(errorType),
      errorCode: errorType,
    };
  }
}
```

---

## 六、安全性设计 (DFS)

### 6.1 敏感数据隔离

```
┌─────────────────────────────────────────────────────────────────────┐
│                       安全边界划分                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Public Zone (公开区)                      │   │
│  │  • 静态资源                                                  │   │
│  │  • 公开 API (/api/public/*)                                 │   │
│  │  • 健康检查 (/health)                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Auth Zone (认证区)                        │   │
│  │  • 用户 API (/api/user/*)                                   │   │
│  │  • 资源访问 (/api/resources/*)                              │   │
│  │  • AI 功能 (/api/ai/*)                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Admin Zone (管理区)                       │   │
│  │  • 管理 API (/api/admin/*)                                  │   │
│  │  • 系统配置                                                  │   │
│  │  • 用户管理                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Secret Zone (机密区)                      │   │
│  │  • API Keys (环境变量，不进代码)                            │   │
│  │  • 数据库凭证                                               │   │
│  │  • 加密密钥                                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 目录权限设计

```typescript
// backend/src/common/guards/route-permissions.ts

export const ROUTE_PERMISSIONS = {
  // Public - 无需认证
  "/api/public/*": { auth: false, roles: [] },
  "/health": { auth: false, roles: [] },

  // User - 需要登录
  "/api/resources/*": { auth: true, roles: ["user", "admin"] },
  "/api/ai/*": { auth: true, roles: ["user", "admin"] },
  "/api/knowledge-bases/*": { auth: true, roles: ["user", "admin"] },

  // Admin - 需要管理员
  "/api/admin/*": { auth: true, roles: ["admin"] },
  "/api/admin/users/*": { auth: true, roles: ["admin"] },
  "/api/admin/settings/*": { auth: true, roles: ["admin"] },
};

// 敏感数据字段标记
export const SENSITIVE_FIELDS = {
  User: ["password", "apiKey", "refreshToken"],
  AIModel: ["apiKey", "secretKey"],
  Integration: ["accessToken", "refreshToken", "credentials"],
};
```

### 6.3 输入验证规范

```typescript
// common/validators/input-sanitizer.ts

@Injectable()
export class InputSanitizer {
  // XSS 防护
  sanitizeHtml(input: string): string {
    return DOMPurify.sanitize(input);
  }

  // SQL 注入防护（Prisma 已处理，但双重保险）
  sanitizeSql(input: string): string {
    return input.replace(/['";]/g, "");
  }

  // 路径遍历防护
  sanitizePath(input: string): string {
    return path.normalize(input).replace(/^(\.\.(\/|\\|$))+/, "");
  }

  // Prompt 注入防护
  sanitizePrompt(input: string): string {
    // 移除可能的指令注入
    return input
      .replace(/ignore previous instructions/gi, "")
      .replace(/system:/gi, "")
      .replace(/\[INST\]/gi, "");
  }
}
```

---

## 七、性能设计 (DFP)

### 7.1 代码分割策略

```typescript
// frontend/next.config.js

module.exports = {
  // 路由级代码分割
  experimental: {
    optimizePackageImports: ["@/components/ui", "@/components/composed"],
  },

  // 模块级分割
  webpack: (config) => {
    config.optimization.splitChunks = {
      chunks: "all",
      cacheGroups: {
        // UI 组件独立包
        ui: {
          test: /[\\/]components[\\/]ui[\\/]/,
          name: "ui-components",
          priority: 10,
        },
        // AI 功能独立包
        ai: {
          test: /[\\/]components[\\/](ai-|features[\\/]ai)/,
          name: "ai-features",
          priority: 10,
        },
        // 第三方库
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendors",
          priority: 5,
        },
      },
    };
    return config;
  },
};
```

### 7.2 懒加载规范

```typescript
// frontend/components/features/index.ts

// ✅ 懒加载大型功能模块
export const AIStudio = dynamic(() => import('./ai-studio'), {
  loading: () => <PageSkeleton />,
  ssr: false, // AI 功能不需要 SSR
});

export const AITeams = dynamic(() => import('./ai-teams'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

// ✅ 预加载关键路径
export const Library = dynamic(() => import('./library'), {
  loading: () => <PageSkeleton />,
  ssr: true, // 资源库需要 SEO
});

// 预加载策略
export function preloadFeature(feature: string) {
  switch (feature) {
    case 'ai-studio':
      import('./ai-studio');
      break;
    case 'ai-teams':
      import('./ai-teams');
      break;
  }
}
```

### 7.3 缓存策略

```typescript
// backend/src/common/cache/cache-strategies.ts

export const CACHE_STRATEGIES = {
  // AI 响应缓存（短期）
  aiResponse: {
    ttl: 60 * 5, // 5 分钟
    key: (request: ChatRequest) => `ai:${hash(request)}`,
    invalidate: ["model-change", "prompt-update"],
  },

  // 资源列表缓存（中期）
  resourceList: {
    ttl: 60 * 15, // 15 分钟
    key: (userId: string, filter: object) =>
      `resources:${userId}:${hash(filter)}`,
    invalidate: ["resource-create", "resource-update", "resource-delete"],
  },

  // 知识库索引（长期）
  knowledgeBaseIndex: {
    ttl: 60 * 60 * 24, // 24 小时
    key: (kbId: string) => `kb-index:${kbId}`,
    invalidate: ["document-add", "document-remove", "kb-rebuild"],
  },
};
```

---

## 八、可观测性设计 (DFO)

### 8.1 日志规范

```typescript
// common/utils/structured-logger.ts

export interface LogContext {
  requestId: string;
  userId?: string;
  module: string;
  action: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export class StructuredLogger {
  // 标准日志格式
  log(level: "info" | "warn" | "error", message: string, context: LogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      env: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    };

    console.log(JSON.stringify(logEntry));
  }

  // 业务日志
  logBusiness(action: string, context: LogContext) {
    this.log("info", `Business: ${action}`, context);
  }

  // 性能日志
  logPerformance(action: string, duration: number, context: LogContext) {
    this.log("info", `Performance: ${action}`, { ...context, duration });
  }

  // 错误日志
  logError(error: Error, context: LogContext) {
    this.log("error", error.message, {
      ...context,
      stack: error.stack,
      errorType: error.constructor.name,
    });
  }
}
```

### 8.2 追踪埋点

```typescript
// common/tracing/tracing.decorator.ts

// 自动追踪装饰器
export function Trace(options?: TraceOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const span = tracer.startSpan(
        `${target.constructor.name}.${propertyKey}`,
      );

      try {
        span.setAttributes({
          "service.name": target.constructor.name,
          "method.name": propertyKey,
          "args.count": args.length,
        });

        const result = await originalMethod.apply(this, args);

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    };

    return descriptor;
  };
}

// 使用示例
@Injectable()
export class AiAskService {
  @Trace()
  async ask(question: string): Promise<string> {
    // 自动追踪
  }
}
```

### 8.3 监控指标

```typescript
// common/metrics/metrics.service.ts

export interface MetricsService {
  // 计数器
  incrementCounter(name: string, labels?: Record<string, string>): void;

  // 直方图
  recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void;

  // 仪表盘
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}

// 预定义指标
export const METRICS = {
  // AI 相关
  "ai.request.count": { type: "counter", labels: ["model", "status"] },
  "ai.request.duration": { type: "histogram", labels: ["model"] },
  "ai.tokens.used": { type: "counter", labels: ["model", "type"] },

  // 业务相关
  "resource.created": { type: "counter", labels: ["type"] },
  "knowledge_base.query": { type: "counter", labels: ["kb_id"] },

  // 系统相关
  "http.request.duration": {
    type: "histogram",
    labels: ["method", "path", "status"],
  },
  "db.query.duration": { type: "histogram", labels: ["operation"] },
};
```

---

## 九、可部署性设计 (DFD)

### 9.1 环境隔离

```
┌─────────────────────────────────────────────────────────────────────┐
│                         环境配置隔离                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Development                               │   │
│  │  DATABASE_URL=postgresql://localhost:5432/deepdive_dev      │   │
│  │  AI_MOCK=true                                               │   │
│  │  LOG_LEVEL=debug                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Staging                                   │   │
│  │  DATABASE_URL=postgresql://staging-db/deepdive              │   │
│  │  AI_MOCK=false                                              │   │
│  │  LOG_LEVEL=info                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Production                                │   │
│  │  DATABASE_URL=postgresql://prod-db/deepdive                 │   │
│  │  AI_MOCK=false                                              │   │
│  │  LOG_LEVEL=warn                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 构建优化

```typescript
// 构建配置
// backend/nest-cli.json
{
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "webpackConfigPath": "webpack.config.js"
  }
}

// backend/webpack.config.js
module.exports = {
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
    },
  },
  // 排除不需要打包的依赖
  externals: [
    nodeExternals({
      allowlist: ['@nestjs/common', '@nestjs/core'],
    }),
  ],
};
```

### 9.3 健康检查

```typescript
// backend/src/health/health.controller.ts

@Controller("health")
export class HealthController {
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // 数据库
      () => this.db.pingCheck("postgres", { timeout: 3000 }),
      () => this.mongodb.pingCheck("mongodb", { timeout: 3000 }),

      // 外部服务
      () => this.http.pingCheck("openai", "https://api.openai.com/v1/models"),

      // 内存
      () => this.memory.checkHeap("memory_heap", 500 * 1024 * 1024), // 500MB

      // 磁盘
      () =>
        this.disk.checkStorage("disk", { thresholdPercent: 0.9, path: "/" }),
    ]);
  }

  @Get("ready")
  ready() {
    // 就绪检查（用于 K8s）
    return { status: "ready" };
  }

  @Get("live")
  live() {
    // 存活检查（用于 K8s）
    return { status: "live" };
  }
}
```

---

## 十、执行计划更新

### 10.1 增强后的阶段划分

| 阶段     | 内容         | 天数     | DFx 重点 |
| -------- | ------------ | -------- | -------- |
| Phase 1  | 后端基础增强 | 3天      | DFM, DFT |
| Phase 2  | AI Core 增强 | 4天      | DFE, DFR |
| Phase 3  | 前端组件重组 | 4天      | DFM, DFP |
| Phase 4  | 可观测性增强 | 2天      | DFO      |
| Phase 5  | 安全性增强   | 2天      | DFS      |
| Phase 6  | 清理与验证   | 2天      | DFD      |
| **总计** |              | **17天** |          |

### 10.2 验收标准更新

| DFx 维度 | 验收标准                | 验证方法      |
| -------- | ----------------------- | ------------- |
| DFM      | 模块耦合度 < 3          | 依赖分析工具  |
| DFE      | 新增 AI 模块 < 500 行   | 代码统计      |
| DFT      | 核心覆盖率 > 80%        | Jest coverage |
| DFR      | 单服务故障不影响整体    | 混沌测试      |
| DFS      | 无越权访问路径          | 安全扫描      |
| DFP      | 首屏 < 2s，包 < 500KB   | Lighthouse    |
| DFO      | 问题定位 < 5 分钟       | 故障演练      |
| DFD      | 一键部署，回滚 < 5 分钟 | 部署演练      |

---

## 十一、总结

### 11.1 DFx 覆盖对比

| DFx 维度       | 原方案 | 增强后 | 提升 |
| -------------- | ------ | ------ | ---- |
| 可维护性 (DFM) | 60%    | 90%    | +30% |
| 可扩展性 (DFE) | 50%    | 85%    | +35% |
| 可测试性 (DFT) | 20%    | 80%    | +60% |
| 可靠性 (DFR)   | 30%    | 75%    | +45% |
| 安全性 (DFS)   | 10%    | 70%    | +60% |
| 性能 (DFP)     | 10%    | 70%    | +60% |
| 可观测性 (DFO) | 10%    | 75%    | +65% |
| 可部署性 (DFD) | 20%    | 80%    | +60% |

### 11.2 关键改进

1. **依赖规则明确化** - 防止循环依赖和架构腐化
2. **扩展点标准化** - 新增功能无需修改核心代码
3. **测试策略完善** - Mock、Fixture、Coverage 全覆盖
4. **故障隔离设计** - 熔断、降级、重试机制
5. **安全边界划分** - 敏感数据隔离和权限控制
6. **性能优化指南** - 代码分割、懒加载、缓存策略
7. **可观测性增强** - 结构化日志、追踪、指标
8. **部署标准化** - 环境隔离、健康检查、回滚策略

---

**文档版本**: 2.0
**创建日期**: 2025-12-28
**状态**: 待评审
**预计工期**: 17 天
