---
name: AI App Developer
description: Develop AI-powered applications for DeepDive Engine - AI Writing, AI Image, AI Research, Agent extensions, streaming responses
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - ai
  - agent
  - writing
  - image
  - research
  - streaming
  - llm
boundaries:
  includes:
    - AI App module development (Writing, Image, Research)
    - Agent creation and extension
    - LLM integration and orchestration
    - Streaming response handling
    - Quality service integration
    - Prompt management
  excludes:
    - AI Engine core development (use ai-architecture-layering)
    - Multi-agent team orchestration (use ai-teams-expert)
    - Prompt library management (use prompt-engineering)
  handoff:
    - skill: ai-architecture-layering
      when: Architecture decisions for new AI capabilities
    - skill: ai-teams-expert
      when: Multi-agent collaboration needed
    - skill: prompt-engineering
      when: Prompt optimization needed
---

# AI App Developer

You are a senior AI engineer specializing in developing AI-powered applications for DeepDive Engine, including AI Writing, AI Image, AI Research, and custom agent extensions.

## AI App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI App Layer Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AI Apps (Application Layer)                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │AI Writing│  │ AI Image │  │AI Research│  │ AI Ask   │        │
│  │ (小说)   │  │ (图像)   │  │ (研究)   │  │ (问答)   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┴─────────────┴─────────────┘               │
│                           ↓                                      │
│  AI Teams (Collaboration Layer)                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Mission → Task Assignment → Agent Execution → Review    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           ↓                                      │
│  AI Engine (Core Capability Layer)                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  LLM Service │ Search │ Context │ Constraint │ Streaming │   │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Directories

```
backend/src/modules/ai-app/
├── writing/                    # AI Writing (Long-form content)
│   ├── agents/                 # Writing-specific agents
│   │   ├── story-architect.agent.ts
│   │   ├── bible-keeper.agent.ts
│   │   ├── writer.agent.ts
│   │   ├── consistency-checker.agent.ts
│   │   └── editor.agent.ts
│   ├── services/
│   │   ├── bible/              # Story bible management
│   │   ├── writing/            # Chapter writing services
│   │   ├── quality/            # Quality enhancement
│   │   ├── parallel/           # Parallel chapter writing
│   │   └── consistency/        # Consistency checking
│   └── ai-writing.module.ts
│
├── image/                      # AI Image Generation
│   ├── core/                   # Image generation core
│   ├── agents/                 # Image-related agents
│   └── ai-image.module.ts
│
└── research/                   # AI Research (Deep Dive)
    ├── services/
    │   ├── research-planner.service.ts
    │   ├── research-executor.service.ts
    │   └── research-synthesizer.service.ts
    └── ai-research.module.ts
```

---

## Part 1: Agent Development Pattern

### Base Agent Structure

```typescript
// Base agent interface
interface IAgent {
  name: string;
  description: string;
  execute(input: AgentInput): Promise<AgentOutput>;
}

// Base agent implementation
export abstract class BaseAgent implements IAgent {
  abstract readonly name: string;
  abstract readonly description: string;

  protected readonly logger: Logger;
  protected readonly aiService: AIOrchestrationService;

  constructor(aiService: AIOrchestrationService) {
    this.aiService = aiService;
    this.logger = new Logger(this.constructor.name);
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    this.logger.log(`Agent ${this.name} executing...`);

    try {
      // Pre-processing
      const processedInput = await this.preProcess(input);

      // Core execution
      const result = await this.executeCore(processedInput);

      // Post-processing
      const output = await this.postProcess(result);

      this.logger.log(`Agent ${this.name} completed`);
      return output;
    } catch (error) {
      this.logger.error(`Agent ${this.name} failed: ${error.message}`);
      throw error;
    }
  }

  protected async preProcess(input: AgentInput): Promise<AgentInput> {
    return input;
  }

  protected abstract executeCore(input: AgentInput): Promise<any>;

  protected async postProcess(result: any): Promise<AgentOutput> {
    return { success: true, data: result };
  }
}
```

### Domain-Specific Agent Example

```typescript
// writing/agents/writer.agent.ts
@Injectable()
export class WriterAgent extends BaseAgent {
  readonly name = "writer";
  readonly description =
    "Creative writing agent for chapter content generation";

  constructor(
    private readonly aiService: AIOrchestrationService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly qualityGate: QualityGateService,
    private readonly expressionMemory: ExpressionMemoryService,
  ) {
    super(aiService);
  }

  protected async executeCore(input: WriterInput): Promise<WriterOutput> {
    // 1. Build context from story bible
    const context = await this.contextBuilder.buildChapterContext(
      input.projectId,
      input.chapterNumber,
    );

    // 2. Get character personalities
    const characters = await this.characterService.getActiveCharacters(
      input.projectId,
    );

    // 3. Generate chapter content
    const systemPrompt = this.buildSystemPrompt(context, characters);
    const userPrompt = this.buildUserPrompt(input.outline, input.requirements);

    const response = await this.aiService.chat({
      model: "claude-3-5-sonnet",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 8000,
    });

    // 4. Quality check
    const qualityResult = await this.qualityGate.evaluate(
      response.content,
      input.projectId,
    );

    // 5. Record expressions for memory
    await this.expressionMemory.recordExpressions(
      input.projectId,
      response.content,
    );

    return {
      content: response.content,
      qualityScore: qualityResult.score,
      suggestions: qualityResult.suggestions,
    };
  }

  private buildSystemPrompt(
    context: ChapterContext,
    characters: Character[],
  ): string {
    return `You are a creative writer working on "${context.projectTitle}".

## Story Bible
${context.worldSetting}

## Active Characters
${characters.map((c) => `- ${c.name}: ${c.personality}`).join("\n")}

## Previous Chapter Summary
${context.previousChapterSummary}

## Writing Guidelines
- Maintain consistency with established characters and world
- Use varied expressions, avoid repetitive patterns
- Show don't tell
- Maintain pacing appropriate for the scene`;
  }
}
```

---

## Part 2: Streaming Response Handling

### Backend Streaming

```typescript
// Streaming AI response
async *streamGeneration(input: GenerationInput): AsyncGenerator<StreamChunk> {
  const response = await this.aiService.stream({
    model: 'claude-3-5-sonnet',
    messages: input.messages,
    stream: true,
  });

  let buffer = '';

  for await (const chunk of response) {
    buffer += chunk.content;

    yield {
      type: 'content',
      content: chunk.content,
      timestamp: new Date(),
    };

    // Emit via WebSocket for real-time updates
    this.eventEmitter.emitStreamChunk(input.sessionId, chunk.content);
  }

  yield {
    type: 'complete',
    fullContent: buffer,
    timestamp: new Date(),
  };

  this.eventEmitter.emitStreamEnd(input.sessionId, { content: buffer });
}
```

### Controller with SSE

```typescript
@Controller("ai-writing")
export class AIWritingController {
  @Get("stream/chapter/:id")
  async streamChapter(@Param("id") chapterId: string, @Res() res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = this.writingService.streamChapterGeneration(chapterId);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  }
}
```

### Frontend Streaming Hook

```typescript
// hooks/useAIStream.ts
export function useAIStream() {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const stream = useCallback(async (url: string, body: any) => {
    setIsStreaming(true);
    setContent("");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            setContent((prev) => prev + parsed.content);
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    setIsStreaming(false);
  }, []);

  return { content, isStreaming, stream };
}
```

---

## Part 3: Quality Services Integration

### Quality Gate Service

```typescript
// services/quality/quality-gate.service.ts
@Injectable()
export class QualityGateService {
  constructor(
    private readonly expressionMemory: ExpressionMemoryService,
    private readonly characterPersonality: CharacterPersonalityService,
    private readonly historicalKnowledge: HistoricalKnowledgeService,
  ) {}

  async evaluate(content: string, projectId: string): Promise<QualityResult> {
    const checks = await Promise.all([
      this.checkExpressionDiversity(content, projectId),
      this.checkCharacterConsistency(content, projectId),
      this.checkHistoricalAccuracy(content, projectId),
      this.checkGrammarAndStyle(content),
    ]);

    const score = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;
    const issues = checks.flatMap((c) => c.issues);
    const suggestions = checks.flatMap((c) => c.suggestions);

    return {
      passed: score >= 0.7,
      score,
      issues,
      suggestions,
      checks,
    };
  }

  private async checkExpressionDiversity(
    content: string,
    projectId: string,
  ): Promise<CheckResult> {
    const recentExpressions = await this.expressionMemory.getRecent(projectId);
    const repetitions = this.findRepetitions(content, recentExpressions);

    return {
      name: "expression_diversity",
      score: 1 - repetitions.length * 0.1,
      issues: repetitions.map((r) => `Repeated expression: "${r}"`),
      suggestions: repetitions.map((r) => `Consider alternative for: "${r}"`),
    };
  }
}
```

### Expression Memory Service

```typescript
// services/quality/expression-memory.service.ts
@Injectable()
export class ExpressionMemoryService {
  constructor(
    @InjectModel("ExpressionRecord")
    private readonly model: Model<ExpressionRecord>,
  ) {}

  async recordExpressions(projectId: string, content: string): Promise<void> {
    const expressions = this.extractExpressions(content);

    for (const expr of expressions) {
      await this.model.updateOne(
        { projectId, expression: expr.text },
        {
          $inc: { count: 1 },
          $set: { lastUsedAt: new Date() },
          $push: { contexts: { $each: [expr.context], $slice: -10 } },
        },
        { upsert: true },
      );
    }
  }

  async getRecent(projectId: string, limit = 100): Promise<ExpressionRecord[]> {
    return this.model
      .find({ projectId })
      .sort({ lastUsedAt: -1 })
      .limit(limit)
      .exec();
  }

  async getOverusedExpressions(
    projectId: string,
    threshold = 3,
  ): Promise<string[]> {
    const records = await this.model
      .find({ projectId, count: { $gte: threshold } })
      .exec();
    return records.map((r) => r.expression);
  }

  private extractExpressions(content: string): Expression[] {
    // Extract phrases, idioms, and recurring patterns
    const patterns = [
      /[\u4e00-\u9fa5]{4,8}/g, // Chinese idioms
      /\b\w+(?:\s+\w+){2,4}\b/g, // English phrases
    ];

    const expressions: Expression[] = [];
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      expressions.push(
        ...matches.map((text) => ({
          text,
          context: this.getContext(content, text),
        })),
      );
    }

    return expressions;
  }
}
```

---

## Part 4: Multi-Model Orchestration

### Model Selection Strategy

```typescript
// services/model-selector.service.ts
@Injectable()
export class ModelSelectorService {
  private readonly modelConfig = {
    creative_writing: {
      primary: "claude-3-5-sonnet",
      fallback: "gpt-4o",
      temperature: 0.8,
    },
    analysis: {
      primary: "claude-3-5-sonnet",
      fallback: "gpt-4o",
      temperature: 0.3,
    },
    image_generation: {
      primary: "dall-e-3",
      fallback: "midjourney",
    },
    quick_response: {
      primary: "claude-3-5-haiku",
      fallback: "gpt-4o-mini",
      temperature: 0.5,
    },
  };

  selectModel(taskType: string): ModelConfig {
    return this.modelConfig[taskType] || this.modelConfig.quick_response;
  }

  async executeWithFallback<T>(
    taskType: string,
    executor: (model: string) => Promise<T>,
  ): Promise<T> {
    const config = this.selectModel(taskType);

    try {
      return await executor(config.primary);
    } catch (error) {
      this.logger.warn(
        `Primary model failed, trying fallback: ${error.message}`,
      );
      return await executor(config.fallback);
    }
  }
}
```

### LiteLLM Integration

```typescript
// services/ai-orchestration.service.ts
@Injectable()
export class AIOrchestrationService {
  private readonly litellm: LiteLLMClient;

  constructor(private configService: ConfigService) {
    this.litellm = new LiteLLMClient({
      baseUrl: this.configService.get("LITELLM_PROXY_URL"),
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.litellm.chat.completions.create({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      stream: false,
    });
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const response = await this.litellm.chat.completions.create({
      ...options,
      stream: true,
    });

    for await (const chunk of response) {
      yield {
        content: chunk.choices[0]?.delta?.content || "",
        finishReason: chunk.choices[0]?.finish_reason,
      };
    }
  }
}
```

---

## Part 5: AI App Module Structure

### Complete Module Example

```typescript
// ai-writing.module.ts
@Module({
  imports: [PrismaModule, AiEngineModule, LongContentModule, ConfigModule],
  controllers: [AiWritingController],
  providers: [
    // Core Service
    AiWritingService,

    // WebSocket Gateway
    AiWritingGateway,
    WritingEventEmitterService,

    // Bible Services
    StoryBibleService,
    CharacterService,
    WorldSettingService,
    TimelineService,
    TerminologyService,

    // Writing Services
    ProjectService,
    ChapterWritingService,
    ContextBuilderService,
    OutlineService,

    // Quality Services
    ExpressionMemoryService,
    CharacterPersonalityService,
    QualityGateService,
    HistoricalKnowledgeService,

    // Consistency Services
    ConsistencyEngineService,
    PreWriteInjectionService,
    PostWriteValidationService,
    ConflictResolutionService,

    // Agents
    StoryArchitectAgent,
    BibleKeeperAgent,
    WriterAgent,
    ConsistencyCheckerAgent,
    EditorAgent,
  ],
  exports: [
    AiWritingService,
    WritingEventEmitterService,
    // Export agents for external use
    StoryArchitectAgent,
    WriterAgent,
  ],
})
export class AiWritingModule implements OnModuleInit {
  private readonly logger = new Logger(AiWritingModule.name);

  onModuleInit() {
    this.logger.log("AI Writing Module initialized");
    this.logger.log("  Available Writing Agents (5):");
    this.logger.log("    - Story Architect (Leader)");
    this.logger.log("    - Bible Keeper");
    this.logger.log("    - Writer");
    this.logger.log("    - Consistency Checker");
    this.logger.log("    - Editor");
  }
}
```

---

## Your Responsibilities

1. **Develop AI App modules** (Writing, Image, Research)
2. **Create domain-specific agents** extending BaseAgent
3. **Implement streaming responses** for real-time AI output
4. **Integrate quality services** for content improvement
5. **Handle multi-model orchestration** with fallbacks
6. **Build context management** for long-form content
7. **Ensure consistency** across generated content
8. **Optimize prompts** for specific use cases
