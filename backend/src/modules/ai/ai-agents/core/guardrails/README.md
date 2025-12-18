# 安全护栏系统 (Guardrails)

安全护栏系统为 DeepDive 工具执行提供多层安全保护，确保系统的安全性、合规性和性能。

## 概述

护栏系统提供以下保护机制：

1. **内容过滤** - 阻止恶意输入和输出
2. **输出验证** - 确保输出符合 Schema 规范
3. **速率限制** - 防止滥用和 DoS 攻击
4. **成本控制** - 限制 Token 使用和执行时间
5. **隐私保护** - 检测和保护敏感信息

## 核心功能

### 1. 内容过滤

阻止包含危险或不当内容的请求：

```typescript
interface ContentFilterConfig {
  enabled: boolean;
  blockedPatterns?: string[];        // 阻止的关键词模式（正则）
  blockedCategories?: ContentCategory[]; // 阻止的内容类别
  piiDetection?: boolean;            // 敏感信息检测
  maxInputLength?: number;           // 最大输入长度
}

enum ContentCategory {
  HATE_SPEECH = "hate_speech",    // 仇恨言论
  VIOLENCE = "violence",          // 暴力内容
  SEXUAL = "sexual",              // 色情内容
  SELF_HARM = "self_harm",        // 自残内容
  ILLEGAL = "illegal",            // 非法内容
  SPAM = "spam",                  // 垃圾信息
  MALWARE = "malware"             // 恶意软件
}
```

### 2. 输出验证

确保工具输出符合预期格式：

```typescript
interface OutputValidationConfig {
  enabled: boolean;
  schema?: JSONSchema;              // 输出 Schema
  maxOutputLength?: number;         // 最大输出长度
  requiredFields?: string[];        // 必需字段
  customValidator?: (output: unknown) => ValidationResult; // 自定义验证器
}
```

### 3. 速率限制

防止单个用户过度调用工具：

```typescript
interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;          // 时间窗口（毫秒）
  maxCalls: number;          // 最大调用次数
  strategy?: RateLimitStrategy; // 限流策略
  perUser?: boolean;         // 按用户限流
  perTool?: boolean;         // 按工具类型限流
}

enum RateLimitStrategy {
  FIXED_WINDOW = "fixed_window",       // 固定窗口
  SLIDING_WINDOW = "sliding_window",   // 滑动窗口
  TOKEN_BUCKET = "token_bucket"        // 令牌桶
}
```

### 4. 成本控制

限制 AI 调用成本：

```typescript
interface CostControlConfig {
  enabled: boolean;
  maxTokens?: number;         // 最大 Token 数
  maxExecutionTime?: number;  // 最大执行时间（毫秒）
  maxDailyCost?: number;      // 单日最大成本（美元）
  costEstimator?: (toolType: ToolType, input: unknown) => number; // 成本估算器
}
```

### 5. 隐私保护

检测和保护敏感信息：

```typescript
interface PrivacyConfig {
  enabled: boolean;
  detectPII?: boolean;               // 检测个人身份信息
  autoRedact?: boolean;              // 自动脱敏
  sensitiveTypes?: SensitiveInfoType[]; // 敏感信息类型
}

enum SensitiveInfoType {
  EMAIL = "email",             // 邮箱
  PHONE = "phone",             // 电话
  SSN = "ssn",                 // 社保号
  CREDIT_CARD = "credit_card", // 信用卡
  IP_ADDRESS = "ip_address",   // IP 地址
  API_KEY = "api_key",         // API 密钥
  PASSWORD = "password"        // 密码
}
```

## 使用示例

### 基础使用

```typescript
import { GuardrailService } from '@/modules/ai/ai-agents/core/guardrails';
import { ToolType } from '@/modules/ai/ai-agents/core/agent.types';

// 初始化服务
const guardrails = new GuardrailService();

// 检查输入
const inputCheck = await guardrails.checkInput(
  ToolType.WEB_SEARCH,
  { query: 'test query' },
  'user_123'
);

if (!inputCheck.passed) {
  console.error('Input validation failed:', inputCheck.reason);
  throw new Error(inputCheck.reason);
}

// 执行工具
const result = await executeTool();

// 检查输出
const outputCheck = await guardrails.checkOutput(
  ToolType.WEB_SEARCH,
  result
);

if (!outputCheck.passed) {
  console.error('Output validation failed:', outputCheck.reason);
  throw new Error(outputCheck.reason);
}
```

### 配置默认护栏

```typescript
// 设置全局默认配置
guardrails.setDefaultConfig({
  contentFilter: {
    enabled: true,
    blockedPatterns: [
      '(?i)(hack|exploit|malware)',
      '(?i)(sql injection|xss)'
    ],
    maxInputLength: 50000
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,  // 1分钟
    maxCalls: 50,
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    perUser: true
  },
  costControl: {
    enabled: true,
    maxTokens: 50000,
    maxDailyCost: 5  // $5/天
  }
});
```

### 配置特定工具的护栏

```typescript
// 为敏感工具配置更严格的护栏
guardrails.setToolConfig(ToolType.PYTHON_EXECUTOR, {
  contentFilter: {
    enabled: true,
    blockedPatterns: [
      '(?i)(os\\.system|subprocess|eval|exec)',
      '(?i)(rm -rf|del /f)',
      '(?i)(__import__|importlib)'
    ],
    maxInputLength: 10000
  },
  rateLimit: {
    enabled: true,
    windowMs: 300000,  // 5分钟
    maxCalls: 10,      // 限制更严格
    strategy: RateLimitStrategy.SLIDING_WINDOW,
    perUser: true,
    perTool: true
  },
  costControl: {
    enabled: true,
    maxExecutionTime: 30000  // 30秒超时
  }
});

// 为简单工具配置宽松护栏
guardrails.setToolConfig(ToolType.DATA_FETCH, {
  contentFilter: {
    enabled: true,
    maxInputLength: 100000
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    maxCalls: 200,  // 更高的限制
    strategy: RateLimitStrategy.FIXED_WINDOW
  }
});
```

### 自定义输出验证器

```typescript
guardrails.setToolConfig(ToolType.WEB_SEARCH, {
  outputValidation: {
    enabled: true,
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' }
            }
          }
        }
      },
      required: ['results']
    },
    customValidator: (output) => {
      const data = output as any;

      // 确保有结果
      if (!data.results || data.results.length === 0) {
        return {
          valid: false,
          errors: ['Search returned no results']
        };
      }

      // 确保 URL 有效
      for (const result of data.results) {
        try {
          new URL(result.url);
        } catch (e) {
          return {
            valid: false,
            errors: [`Invalid URL: ${result.url}`]
          };
        }
      }

      return { valid: true };
    }
  }
});
```

### 成本估算器

```typescript
guardrails.setDefaultConfig({
  costControl: {
    enabled: true,
    maxDailyCost: 10,  // $10/天
    costEstimator: (toolType, input) => {
      switch (toolType) {
        case ToolType.TEXT_GENERATION:
          // 根据输入长度估算成本
          const inputLength = JSON.stringify(input).length;
          const estimatedTokens = inputLength * 1.3; // 粗略估算
          return (estimatedTokens / 1000) * 0.002; // $0.002 per 1K tokens

        case ToolType.IMAGE_GENERATION:
          return 0.02; // $0.02 per image

        case ToolType.WEB_SEARCH:
          return 0.001; // $0.001 per search

        default:
          return 0;
      }
    }
  }
});

// 记录实际成本
const actualCost = 0.015;
guardrails.recordCost(actualCost);
```

### 隐私保护

```typescript
guardrails.setDefaultConfig({
  privacy: {
    enabled: true,
    detectPII: true,
    autoRedact: false,  // 不自动脱敏，而是拒绝请求
    sensitiveTypes: [
      SensitiveInfoType.EMAIL,
      SensitiveInfoType.PHONE,
      SensitiveInfoType.CREDIT_CARD,
      SensitiveInfoType.API_KEY
    ]
  }
});

// 检查输入
const input = { query: '我的邮箱是 test@example.com' };
const check = await guardrails.checkInput(ToolType.WEB_SEARCH, input);

if (!check.passed) {
  console.log('Detected PII:', check.details?.detected);
  // ['email']
}
```

### 速率限制管理

```typescript
// 检查速率限制
const rateLimitCheck = guardrails.checkRateLimit(
  'user_123',
  ToolType.WEB_SEARCH
);

if (!rateLimitCheck.passed) {
  console.log('Rate limit exceeded');
  console.log('Details:', rateLimitCheck.details);
  console.log('Suggestions:', rateLimitCheck.suggestions);
  // Suggestions: ['Please wait 60 seconds before retrying']
}

// 手动重置速率限制（管理员功能）
guardrails.resetRateLimit('user_123');

// 重置特定工具的限制
guardrails.resetRateLimit('user_123', ToolType.WEB_SEARCH);
```

## 违规处理

### 违规类型

```typescript
enum ViolationType {
  CONTENT_VIOLATION = "content_violation",       // 内容违规
  SCHEMA_VIOLATION = "schema_violation",         // Schema 违规
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",   // 速率限制超出
  COST_LIMIT_EXCEEDED = "cost_limit_exceeded",   // 成本限制超出
  PRIVACY_VIOLATION = "privacy_violation",       // 隐私违规
  TIMEOUT = "timeout"                            // 超时
}
```

### 检查结果

```typescript
interface GuardrailResult {
  passed: boolean;             // 是否通过
  reason?: string;             // 失败原因
  violationType?: ViolationType; // 违规类型
  details?: Record<string, unknown>; // 详细信息
  suggestions?: string[];      // 建议
}
```

### 错误处理示例

```typescript
const result = await guardrails.checkInput(toolType, input, userId);

if (!result.passed) {
  switch (result.violationType) {
    case ViolationType.CONTENT_VIOLATION:
      // 记录可疑行为
      logger.warn(`Content violation by ${userId}`, result.details);
      throw new BadRequestException('Input contains prohibited content');

    case ViolationType.RATE_LIMIT_EXCEEDED:
      // 返回 429 Too Many Requests
      const { windowMs } = result.details;
      throw new TooManyRequestsException(
        `Rate limit exceeded. Retry after ${windowMs}ms`
      );

    case ViolationType.PRIVACY_VIOLATION:
      // 提示用户移除敏感信息
      throw new BadRequestException(
        `Input contains sensitive information: ${result.details.detected.join(', ')}`
      );

    case ViolationType.COST_LIMIT_EXCEEDED:
      // 建议升级套餐
      throw new PaymentRequiredException(
        'Daily cost limit exceeded. Please upgrade your plan.'
      );

    default:
      throw new BadRequestException(result.reason);
  }
}
```

## 与工具集成

### 在工具中使用护栏

```typescript
import { GuardrailService } from '@/modules/ai/ai-agents/core/guardrails';

class WebSearchTool extends BaseTool {
  constructor(private readonly guardrails: GuardrailService) {
    super();
  }

  async execute(input: SearchInput, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 1. 检查输入
      const inputCheck = await this.guardrails.checkInput(
        this.type,
        input,
        context.userId
      );

      if (!inputCheck.passed) {
        return {
          success: false,
          error: inputCheck.reason,
          duration: Date.now() - startTime
        };
      }

      // 2. 执行工具逻辑
      const data = await this.doSearch(input);

      // 3. 检查输出
      const outputCheck = await this.guardrails.checkOutput(this.type, data);

      if (!outputCheck.passed) {
        return {
          success: false,
          error: 'Output validation failed',
          duration: Date.now() - startTime
        };
      }

      // 4. 记录成本（如果适用）
      if (input.premium) {
        this.guardrails.recordCost(0.002);
      }

      return {
        success: true,
        data,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
}
```

### 在 Controller 中使用护栏

```typescript
@Controller('tools')
export class ToolController {
  constructor(private readonly guardrails: GuardrailService) {}

  @Post('execute')
  async executeTool(@Body() dto: ExecuteToolDto, @User() user: UserEntity) {
    // 预检查
    const inputCheck = await this.guardrails.checkInput(
      dto.toolType,
      dto.input,
      user.id
    );

    if (!inputCheck.passed) {
      throw new BadRequestException(inputCheck.reason);
    }

    // 执行工具
    const result = await this.toolService.execute(dto.toolType, dto.input);

    // 后检查
    const outputCheck = await this.guardrails.checkOutput(dto.toolType, result);

    if (!outputCheck.passed) {
      this.logger.warn('Output validation failed', outputCheck);
      // 仍然返回结果，但记录警告
    }

    return result;
  }
}
```

## 最佳实践

### 1. 分层防护

结合多种护栏机制：

```typescript
guardrails.setToolConfig(ToolType.PYTHON_EXECUTOR, {
  // 第1层：内容过滤（拦截恶意代码）
  contentFilter: {
    enabled: true,
    blockedPatterns: [
      '(?i)(os\\.system|subprocess)',
      '(?i)(eval|exec|compile)'
    ]
  },
  // 第2层：速率限制（防止滥用）
  rateLimit: {
    enabled: true,
    maxCalls: 10,
    windowMs: 300000
  },
  // 第3层：成本控制（限制资源消耗）
  costControl: {
    enabled: true,
    maxExecutionTime: 30000
  }
});
```

### 2. 渐进式策略

对不同用户应用不同的护栏：

```typescript
function getGuardrailConfig(user: User): GuardrailConfig {
  if (user.isPremium) {
    // 高级用户：更宽松的限制
    return {
      rateLimit: {
        enabled: true,
        maxCalls: 500,
        windowMs: 60000
      },
      costControl: {
        enabled: true,
        maxDailyCost: 50
      }
    };
  } else {
    // 免费用户：更严格的限制
    return {
      rateLimit: {
        enabled: true,
        maxCalls: 50,
        windowMs: 60000
      },
      costControl: {
        enabled: true,
        maxDailyCost: 2
      }
    };
  }
}
```

### 3. 监控和告警

记录违规行为：

```typescript
const result = await guardrails.checkInput(toolType, input, userId);

if (!result.passed) {
  // 记录违规
  await this.analyticsService.recordViolation({
    userId,
    toolType,
    violationType: result.violationType,
    timestamp: new Date(),
    details: result.details
  });

  // 达到阈值时告警
  const violationCount = await this.getViolationCount(userId, '24h');
  if (violationCount > 10) {
    await this.alertService.notify('High violation rate', {
      userId,
      count: violationCount
    });
  }
}
```

### 4. 白名单机制

为受信任的用户或系统账号绕过某些限制：

```typescript
async checkInput(toolType: ToolType, input: unknown, userId?: string) {
  // 白名单检查
  if (userId && this.isWhitelisted(userId)) {
    return { passed: true };
  }

  // 正常检查
  return this.performChecks(toolType, input, userId);
}

private isWhitelisted(userId: string): boolean {
  return this.whitelistedUsers.has(userId) ||
         userId.startsWith('system_');
}
```

## 统计信息

获取护栏统计：

```typescript
const stats = guardrails.getStats();
console.log(stats);
// {
//   dailyCost: 2.5,
//   lastResetDate: '2024-12-18',
//   configuredTools: 5
// }
```

## 测试

### 单元测试示例

```typescript
describe('GuardrailService', () => {
  let service: GuardrailService;

  beforeEach(() => {
    service = new GuardrailService();
  });

  it('should pass valid input', async () => {
    const result = await service.checkInput(
      ToolType.WEB_SEARCH,
      { query: 'test' },
      'user_123'
    );
    expect(result.passed).toBe(true);
  });

  it('should block malicious input', async () => {
    const result = await service.checkInput(
      ToolType.WEB_SEARCH,
      { query: 'hack system' },
      'user_123'
    );
    expect(result.passed).toBe(false);
    expect(result.violationType).toBe(ViolationType.CONTENT_VIOLATION);
  });

  it('should enforce rate limit', async () => {
    service.setDefaultConfig({
      rateLimit: {
        enabled: true,
        maxCalls: 2,
        windowMs: 60000
      }
    });

    // 第1次调用 - 成功
    let result = await service.checkInput(ToolType.WEB_SEARCH, {}, 'user_123');
    expect(result.passed).toBe(true);

    // 第2次调用 - 成功
    result = await service.checkInput(ToolType.WEB_SEARCH, {}, 'user_123');
    expect(result.passed).toBe(true);

    // 第3次调用 - 失败
    result = await service.checkInput(ToolType.WEB_SEARCH, {}, 'user_123');
    expect(result.passed).toBe(false);
    expect(result.violationType).toBe(ViolationType.RATE_LIMIT_EXCEEDED);
  });
});
```

## 性能考虑

1. **异步检查**: 护栏检查应该尽可能快，避免阻塞工具执行
2. **缓存**: 对于重复的内容过滤模式，使用正则表达式缓存
3. **批量处理**: 支持批量检查多个输入
4. **并行检查**: 多个独立的护栏检查可以并行执行

```typescript
async checkInput(toolType: ToolType, input: unknown, userId?: string) {
  // 并行执行独立的检查
  const [contentCheck, privacyCheck, costCheck] = await Promise.all([
    this.checkContent(input, config.contentFilter),
    this.checkPrivacy(input, config.privacy),
    this.checkCost(toolType, input, config.costControl)
  ]);

  // 聚合结果
  return this.aggregateResults([contentCheck, privacyCheck, costCheck]);
}
```

## 参考资源

- [OWASP 安全测试指南](https://owasp.org/www-project-web-security-testing-guide/)
- [Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [PII 检测最佳实践](https://www.privacy.com/blog/what-is-pii)
- [API 速率限制策略](https://cloud.google.com/apis/design/rate_limiting)

## 版本历史

- **v1.0.0** (2024-12): 初始版本
  - 内容过滤
  - 输出验证
  - 速率限制
  - 成本控制
  - 隐私保护

## 许可证

MIT License
