# AI 编排服务

## 概述

DeepDive 实现了统一的 AI 编排层，管理多个 LLM 提供商，支持自动故障转移、负载均衡和调用追踪。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Orchestration Layer                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              AIOrchestrationService                    │ │
│  │  • 统一 API 入口                                       │ │
│  │  • 请求路由                                            │ │
│  │  • 故障转移                                            │ │
│  │  • 调用追踪                                            │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                 │
│              ┌─────────────┼─────────────┐                  │
│              ▼             ▼             ▼                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ LiteLLM Proxy│ │ Direct API  │ │ Python AI Svc│        │
│  │  (主要路由)   │ │  (备用)      │ │  (FastAPI)   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│              │             │             │                  │
│  ┌───────────┴─────────────┴─────────────┴───────────┐     │
│  │                    AI Providers                    │     │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │     │
│  │  │ OpenAI  │ │Anthropic│ │ Google  │ │   xAI   │ │     │
│  │  │GPT-5.1  │ │ Claude  │ │ Gemini  │ │  Grok   │ │     │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │     │
│  └───────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. AI 编排服务

```typescript
// ai-orchestration.service.ts
@Injectable()
export class AIOrchestrationService {
  private readonly providers: Map<string, AIProvider>;
  private readonly fallbackChain: string[];

  constructor(
    private openAIProvider: OpenAIProvider,
    private anthropicProvider: AnthropicProvider,
    private googleProvider: GoogleProvider,
    private xAIProvider: XAIProvider,
    private configService: ConfigService,
  ) {
    // 注册所有 Provider
    this.providers = new Map([
      ["openai", this.openAIProvider],
      ["anthropic", this.anthropicProvider],
      ["google", this.googleProvider],
      ["xai", this.xAIProvider],
    ]);

    // 故障转移链
    this.fallbackChain = ["openai", "anthropic", "google"];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();

    try {
      // 尝试主要 Provider
      const provider = this.selectProvider(request);
      const response = await provider.chat(request);

      // 记录成功调用
      await this.logCall({
        traceId,
        provider: provider.name,
        model: request.model,
        duration: Date.now() - startTime,
        status: "success",
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
      });

      return response;
    } catch (error) {
      // 故障转移
      return this.handleFallback(request, error, traceId, startTime);
    }
  }

  private async handleFallback(
    request: ChatRequest,
    originalError: Error,
    traceId: string,
    startTime: number,
  ): Promise<ChatResponse> {
    for (const providerName of this.fallbackChain) {
      const provider = this.providers.get(providerName);

      if (!provider || provider.name === request.preferredProvider) {
        continue;
      }

      try {
        const response = await provider.chat({
          ...request,
          model: this.mapModel(request.model, providerName),
        });

        // 记录故障转移成功
        await this.logCall({
          traceId,
          provider: providerName,
          model: request.model,
          duration: Date.now() - startTime,
          status: "fallback_success",
          originalProvider: request.preferredProvider,
          originalError: originalError.message,
        });

        return response;
      } catch (error) {
        // 继续尝试下一个 Provider
        continue;
      }
    }

    // 所有 Provider 都失败
    throw new AIProviderError("All AI providers failed", originalError);
  }

  private selectProvider(request: ChatRequest): AIProvider {
    if (request.preferredProvider) {
      return this.providers.get(request.preferredProvider);
    }

    // 基于模型选择 Provider
    const modelProviderMap: Record<string, string> = {
      "gpt-5.1": "openai",
      "gpt-4o": "openai",
      "claude-3": "anthropic",
      "gemini-2": "google",
      grok: "xai",
    };

    const providerName = modelProviderMap[request.model] || "openai";
    return this.providers.get(providerName);
  }

  private mapModel(originalModel: string, targetProvider: string): string {
    // 模型映射表
    const modelMap: Record<string, Record<string, string>> = {
      "gpt-5.1": {
        anthropic: "claude-3-opus",
        google: "gemini-2.0-flash",
      },
      "claude-3": {
        openai: "gpt-5.1",
        google: "gemini-2.0-flash",
      },
    };

    return modelMap[originalModel]?.[targetProvider] || originalModel;
  }
}
```

### 2. Provider 接口

```typescript
// ai-provider.interface.ts
export interface AIProvider {
  readonly name: string;

  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<ChatChunk>;
  generateImage(request: ImageRequest): Promise<ImageResponse>;
  embedText(request: EmbedRequest): Promise<EmbedResponse>;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: string;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "tool_use";
}
```

### 3. OpenAI Provider 实现

```typescript
// openai.provider.ts
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get("OPENAI_API_KEY"),
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const completion = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    });

    return {
      content: completion.choices[0].message.content,
      model: completion.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      finishReason: completion.choices[0].finish_reason as any,
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          content: delta.content,
          finishReason: chunk.choices[0].finish_reason,
        };
      }
    }
  }

  async generateImage(request: ImageRequest): Promise<ImageResponse> {
    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt: request.prompt,
      size: request.size || "1024x1024",
      quality: request.quality || "standard",
      n: 1,
    });

    return {
      url: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt,
    };
  }
}
```

## LiteLLM 代理配置

### 1. 配置文件

```yaml
# litellm_config.yaml
model_list:
  # OpenAI 模型
  - model_name: gpt-5.1
    litellm_params:
      model: openai/gpt-5.1
      api_key: ${OPENAI_API_KEY}

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: ${OPENAI_API_KEY}

  # Anthropic 模型
  - model_name: claude-3-opus
    litellm_params:
      model: anthropic/claude-3-opus
      api_key: ${ANTHROPIC_API_KEY}

  # Google 模型
  - model_name: gemini-2.0-flash
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: ${GOOGLE_API_KEY}

  # xAI 模型
  - model_name: grok
    litellm_params:
      model: xai/grok-beta
      api_key: ${XAI_API_KEY}

# 路由配置
router_settings:
  routing_strategy: simple-shuffle # 简单轮询
  num_retries: 3
  retry_after: 5
  timeout: 300

  # 故障转移配置
  fallbacks:
    - gpt-5.1: [claude-3-opus, gemini-2.0-flash]
    - claude-3-opus: [gpt-5.1, gemini-2.0-flash]

# 全局设置
litellm_settings:
  drop_params: true
  set_verbose: false
  cache: true
  cache_params:
    type: redis
    host: ${REDIS_HOST}
    port: ${REDIS_PORT}
```

### 2. 启动代理

```bash
# Docker 方式
docker run -d \
  -p 4000:4000 \
  -v $(pwd)/litellm_config.yaml:/app/config.yaml \
  -e OPENAI_API_KEY=${OPENAI_API_KEY} \
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  ghcr.io/berriai/litellm:main-latest \
  --config /app/config.yaml
```

### 3. 通过 LiteLLM 调用

```typescript
// 使用 OpenAI SDK 调用 LiteLLM
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-any-key", // LiteLLM 代理不验证 key
  baseURL: "http://localhost:4000/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-5.1", // LiteLLM 会路由到正确的 Provider
  messages: [{ role: "user", content: "Hello!" }],
});
```

## 调用追踪

```typescript
// ai-telemetry.service.ts
@Injectable()
export class AITelemetryService {
  constructor(
    private prisma: PrismaService,
    private redis: Redis,
  ) {}

  async logCall(call: AICallLog): Promise<void> {
    // 存储到数据库
    await this.prisma.aiCallLog.create({
      data: {
        traceId: call.traceId,
        provider: call.provider,
        model: call.model,
        duration: call.duration,
        status: call.status,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        cost: this.calculateCost(call),
        metadata: call.metadata,
      },
    });

    // 更新实时统计
    const today = new Date().toISOString().split("T")[0];
    await this.redis.hincrby(`ai:stats:${today}`, "totalCalls", 1);
    await this.redis.hincrby(
      `ai:stats:${today}`,
      "totalTokens",
      call.inputTokens + call.outputTokens,
    );
    await this.redis.hincrbyfloat(
      `ai:stats:${today}`,
      "totalCost",
      this.calculateCost(call),
    );
  }

  private calculateCost(call: AICallLog): number {
    // 各模型定价 (每 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-5.1": { input: 0.01, output: 0.03 },
      "gpt-4o": { input: 0.005, output: 0.015 },
      "claude-3-opus": { input: 0.015, output: 0.075 },
      "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
    };

    const price = pricing[call.model] || { input: 0.001, output: 0.002 };
    return (
      (call.inputTokens * price.input + call.outputTokens * price.output) / 1000
    );
  }

  async getStats(startDate: Date, endDate: Date): Promise<AIStats> {
    return this.prisma.aiCallLog.aggregate({
      _count: { id: true },
      _sum: {
        duration: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
      },
      _avg: { duration: true },
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    });
  }
}
```

## AI 服务模块

### 1. AI Chat 服务

```typescript
// ai-chat.service.ts
@Injectable()
export class AIChatService {
  constructor(
    private aiOrchestration: AIOrchestrationService,
    private prisma: PrismaService,
  ) {}

  async chat(userId: string, request: ChatInput): Promise<ChatOutput> {
    // 获取或创建会话
    const conversation = await this.getOrCreateConversation(
      userId,
      request.conversationId,
    );

    // 构建消息历史
    const messages = await this.buildMessages(conversation.id, request.message);

    // 调用 AI
    const response = await this.aiOrchestration.chat({
      model: request.model || "gpt-5.1",
      messages,
      temperature: request.temperature,
    });

    // 保存消息
    await this.saveMessages(conversation.id, request.message, response.content);

    return {
      conversationId: conversation.id,
      message: response.content,
      model: response.model,
    };
  }

  async *streamChat(userId: string, request: ChatInput): AsyncIterable<string> {
    const conversation = await this.getOrCreateConversation(
      userId,
      request.conversationId,
    );
    const messages = await this.buildMessages(conversation.id, request.message);

    let fullResponse = "";

    for await (const chunk of this.aiOrchestration.streamChat({
      model: request.model || "gpt-5.1",
      messages,
    })) {
      fullResponse += chunk.content;
      yield chunk.content;
    }

    // 保存完整响应
    await this.saveMessages(conversation.id, request.message, fullResponse);
  }
}
```

### 2. AI Agents 服务

```typescript
// ai-agents.service.ts
@Injectable()
export class AIAgentsService {
  private readonly agents: Map<string, AgentConfig> = new Map([
    [
      "designer",
      {
        systemPrompt: `你是一位专业的 UI/UX 设计师...`,
        model: "gpt-5.1",
        temperature: 0.8,
      },
    ],
    [
      "developer",
      {
        systemPrompt: `你是一位高级软件工程师...`,
        model: "gpt-5.1",
        temperature: 0.3,
      },
    ],
    [
      "docs",
      {
        systemPrompt: `你是一位技术文档专家...`,
        model: "gpt-4o",
        temperature: 0.5,
      },
    ],
  ]);

  async invokeAgent(
    agentName: string,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const agent = this.agents.get(agentName);

    if (!agent) {
      throw new NotFoundException(`Agent ${agentName} not found`);
    }

    const messages: Message[] = [
      { role: "system", content: agent.systemPrompt },
      ...(request.context || []),
      { role: "user", content: request.input },
    ];

    const response = await this.aiOrchestration.chat({
      model: agent.model,
      messages,
      temperature: agent.temperature,
    });

    return {
      agent: agentName,
      output: response.content,
      model: response.model,
    };
  }
}
```

## 参考资源

- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [LiteLLM 文档](https://docs.litellm.ai/)
- [AI 编排最佳实践](https://www.anthropic.com/engineering)
