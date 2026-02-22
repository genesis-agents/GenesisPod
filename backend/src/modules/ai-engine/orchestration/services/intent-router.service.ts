/**
 * IntentRouterService
 *
 * 支柱二：GenesisAgent 编排层 — 意图路由层
 *
 * 接收用户自然语言意图（来自 Global AI Bar 或其他入口），
 * 使用 AiChatService（deterministic 模式 + JSON mode）解析意图，
 * 决定需要调用哪些 AI App 模块，再交给 TaskPlannerService 生成 DAG 计划。
 *
 * 与其他服务的关系：
 *   IntentRouterService → 解析意图 → "用哪些模块" → TaskPlannerService → TaskPlan
 *   TaskPlan → DagExecutor → 实际调用 AIEngineFacade 对应方法
 *
 * 低置信度降级策略：
 *   confidence < 0.6 → 直接路由到 ask 模块，由对话兜底
 *   调用方可根据 plan.confidence 决定是否向用户展示确认 UI
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIModelType } from "@prisma/client";
import { AiChatService } from "../../llm/services/ai-chat.service";
import {
  TaskPlannerService,
  TaskPlan,
  AppModule,
  CapabilityRequirement,
} from "./task-planner.service";

// ─────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────

/**
 * GenesisAgent 上下文 — 调用方传入的会话状态
 */
export interface AgentContext {
  /** 用户 ID */
  userId: string;
  /** 会话 ID（可选，用于记忆关联） */
  sessionId?: string;
  /** 附加元数据（来源页面、已选模块等） */
  metadata?: Record<string, unknown>;
}

/**
 * 路由结果（包含 TaskPlan 和诊断信息）
 */
export interface RouteResult {
  /** 生成的任务计划 */
  plan: TaskPlan;
  /** 是否应该向用户展示确认 UI（低置信度时） */
  requiresConfirmation: boolean;
  /** 意图分析的原始 LLM 输出（调试用） */
  rawAnalysis?: string;
}

// ─────────────────────────────────────────────────────────
// Internal types (LLM JSON 输出)
// ─────────────────────────────────────────────────────────

interface IntentAnalysis {
  /** 识别到的能力需求 */
  capabilities: Array<{
    module: AppModule;
    action: string;
    input: string;
    priority: number;
  }>;
  /** 置信度（0-1） */
  confidence: number;
  /** 分析推理（可选，用于调试） */
  reasoning?: string;
}

// ─────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────

const INTENT_ANALYSIS_PROMPT = `You are an AI intent analyzer for a multi-module AI platform. Analyze the user's intent and determine which AI modules should be invoked.

Available modules:
- "research": Deep multi-step research report generation. Use when the user wants to investigate, analyze trends, or produce a research report.
- "writing": Long-form writing assistant. Use when the user wants to write articles, reports, documents, or structured content.
- "teams": Multi-agent collaborative debate/discussion. Use when the user wants multiple perspectives, debate, or team analysis.
- "image": AI image generation. Use when the user wants to generate, create, or draw images, illustrations, or visual content.
- "office": PPT/slides generation. Use when the user wants to create presentations, slide decks, or PowerPoint files.
- "insight": Topic intelligence & monitoring. Use when the user wants to monitor a topic, track trends, or get ongoing intelligence reports on a subject.
- "ask": Quick Q&A and conversation. Use as default for simple questions or when intent is unclear.

Rules:
1. A task may require multiple modules (e.g., research then writing).
2. research and ask are "information gathering" and run in phase 1.
3. writing and teams are "content generation" and run in phase 2 (after phase 1).
4. Set priority: 1 = highest importance, higher number = lower priority.
5. confidence: 0.9 = very clear intent, 0.7 = reasonable guess, 0.5 = uncertain, use "ask" as fallback.
6. If the intent is simple conversation or unclear, output only one capability: ask with confidence <= 0.6.

Respond ONLY with valid JSON matching this schema:
{
  "capabilities": [
    { "module": "research"|"writing"|"teams"|"image"|"office"|"insight"|"ask", "action": "string describing what to do", "input": "the query/topic to pass to the module", "priority": 1 }
  ],
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  /** 低于此置信度时建议向用户确认 */
  private static readonly CONFIRMATION_THRESHOLD = 0.6;

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly taskPlanner: TaskPlannerService,
  ) {}

  /**
   * 分析用户意图并生成 TaskPlan
   */
  async route(userIntent: string, context: AgentContext): Promise<RouteResult> {
    this.logger.debug(
      `[route] userId=${context.userId} intent="${userIntent.length > 80 ? userIntent.slice(0, 80) + "..." : userIntent}"`,
    );

    let analysis: IntentAnalysis;
    let rawAnalysis: string | undefined;

    try {
      analysis = await this.analyzeIntent(userIntent);
      rawAnalysis = JSON.stringify(analysis);
    } catch (err) {
      this.logger.warn(
        `[route] Intent analysis failed, falling back to ask module: ${err instanceof Error ? err.message : String(err)}`,
      );
      analysis = this.buildFallbackAnalysis();
    }

    const requirements: CapabilityRequirement[] = analysis.capabilities.map(
      (c) => ({
        module: c.module,
        action: c.action,
        input: c.input,
        priority: c.priority,
      }),
    );

    const plan = this.taskPlanner.buildPlan(
      requirements,
      userIntent,
      analysis.confidence,
    );

    const requiresConfirmation =
      analysis.confidence < IntentRouterService.CONFIRMATION_THRESHOLD;

    if (requiresConfirmation) {
      this.logger.warn(
        `[route] Low confidence (${analysis.confidence.toFixed(2)}), requiresConfirmation=true`,
      );
    }

    return { plan, requiresConfirmation, rawAnalysis };
  }

  /**
   * 快捷方法：仅返回 TaskPlan
   */
  async getPlan(userIntent: string, context: AgentContext): Promise<TaskPlan> {
    return (await this.route(userIntent, context)).plan;
  }

  // ─── private ───────────────────────────────────────────

  private async analyzeIntent(userIntent: string): Promise<IntentAnalysis> {
    const result = await this.aiChatService.chat({
      model: "", // AiChatService 使用 modelType 自动选择
      messages: [
        { role: "system", content: INTENT_ANALYSIS_PROMPT },
        { role: "user", content: userIntent },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: { creativity: "deterministic", outputLength: "short" },
      responseFormat: "json",
      strictMode: true,
    });

    return this.parseAnalysis(result.content, userIntent);
  }

  private parseAnalysis(
    content: string,
    originalIntent: string,
  ): IntentAnalysis {
    try {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response");
      }
      const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));

      // 校验必要字段
      if (
        !Array.isArray(parsed.capabilities) ||
        parsed.capabilities.length === 0
      ) {
        throw new Error("No capabilities in response");
      }

      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5;

      return {
        capabilities: parsed.capabilities.map(
          (c: Record<string, unknown>, i: number) => ({
            module: this.validateModule(c.module as string),
            action: typeof c.action === "string" ? c.action : "执行任务",
            input: typeof c.input === "string" ? c.input : originalIntent,
            priority: typeof c.priority === "number" ? c.priority : i + 1,
          }),
        ),
        confidence,
        reasoning:
          typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `[parseAnalysis] Failed to parse LLM response: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.buildFallbackAnalysis();
    }
  }

  private validateModule(module: string): AppModule {
    const valid: AppModule[] = [
      "research",
      "writing",
      "teams",
      "ask",
      "image",
      "office",
      "insight",
    ];
    return valid.includes(module as AppModule) ? (module as AppModule) : "ask";
  }

  private buildFallbackAnalysis(): IntentAnalysis {
    return {
      capabilities: [
        {
          module: "ask",
          action: "直接问答",
          input: "",
          priority: 1,
        },
      ],
      confidence: 0.4,
    };
  }
}
