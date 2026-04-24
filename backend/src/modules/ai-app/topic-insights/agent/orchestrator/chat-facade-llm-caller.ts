/**
 * ChatFacadeLLMCaller — 把 ChatFacade (AI Engine) 包装成 harness 的 LLMCaller
 *
 * 归属：L3 ai-app/topic-insights/agent/orchestrator/
 *
 * harness 层不知道任何具体 LLM 实现（ChatFacade/OpenAI/Anthropic），通过 DI 注入 LLMCaller。
 * 本 adapter 让 topic-insights 用现有 ChatFacade 接入 ReActRunner。
 */

import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import type {
  LLMCaller,
  Message,
  ModelTier,
  Span,
  ToolSchema,
} from "@/modules/ai-engine/harness/runtime";

@Injectable()
export class ChatFacadeLLMCaller implements LLMCaller {
  private readonly logger = new Logger(ChatFacadeLLMCaller.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  async call(req: {
    messages: Message[];
    tools?: ToolSchema[];
    modelTier: ModelTier;
    span: Span;
  }): Promise<{
    content: string;
    toolCalls?: Array<{
      name: string;
      args: Record<string, unknown>;
      id: string;
    }>;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    modelId: string;
  }> {
    const tp = this.tierToTaskProfile(req.modelTier);
    const chatMessages = req.messages.map((m) => ({
      role: m.role === "tool" ? ("user" as const) : m.role, // ChatFacade 不支持 tool role, fallback to user
      content: m.content,
    }));

    try {
      const response = await this.chatFacade.chat({
        messages: chatMessages,
        modelType: AIModelType.CHAT,
        taskProfile: tp,
        operationName: "agent-react-step",
        skipGuardrails: true,
      });
      const modelId = response.model ?? "";
      const promptTokens = response.inputTokens ?? 0;
      const completionTokens = response.outputTokens ?? 0;
      // ChatFacade doesn't expose costUsd; BudgetAccountant will derive it from token counts + model tier.
      const costUsd = 0;

      // Phase 5 第一版：ChatFacade 还没支持 native tool_use，
      // 先从 content 中尝试解析 structured JSON tool call（Phase 5+ 升级）
      const toolCalls = this.parseToolCalls(response.content);
      return {
        content: response.content,
        toolCalls,
        promptTokens,
        completionTokens,
        costUsd,
        modelId,
      };
    } catch (err) {
      this.logger.error(
        `[call] chat failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  private tierToTaskProfile(tier: ModelTier): {
    creativity: "low" | "medium" | "high";
    outputLength: "short" | "medium" | "long" | "extended";
    reasoningDepth?: "light" | "moderate" | "deep";
  } {
    switch (tier) {
      case "strong":
        return {
          creativity: "medium",
          outputLength: "extended",
          reasoningDepth: "deep",
        };
      case "standard":
        return {
          creativity: "medium",
          outputLength: "long",
          reasoningDepth: "moderate",
        };
      case "basic":
      default:
        return {
          creativity: "low",
          outputLength: "medium",
          reasoningDepth: "light",
        };
    }
  }

  /**
   * 约定：ChatFacade 产出遇到 tool_call 时，LLM 会按以下 JSON 片段格式在 content 内写入：
   *   {"tool_call": {"name": "web_search", "args": {"query": "..."}}}
   *   或包在 ```tool ... ``` fence 中。
   * Phase 5 native function-calling 升级后此 helper 废弃。
   */
  private parseToolCalls(
    content: string,
  ):
    | Array<{ name: string; args: Record<string, unknown>; id: string }>
    | undefined {
    // 匹配 ```tool\n{...}\n``` 或 ```json tool_call ... ``` 或顶层 {"tool_call":...}
    const fence = content.match(/```(?:tool|json)?\s*([\s\S]*?)\s*```/);
    const body = fence ? fence[1] : content;
    try {
      const parsed = JSON.parse(body) as
        | { tool_call?: { name: string; args?: Record<string, unknown> } }
        | { name?: string; args?: Record<string, unknown> };
      const call =
        "tool_call" in parsed && parsed.tool_call
          ? parsed.tool_call
          : undefined;
      if (call?.name) {
        return [
          {
            name: call.name,
            args: call.args ?? {},
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          },
        ];
      }
    } catch {
      // 不是 tool call，返回 undefined 让 ReActRunner 按 think_more 处理
    }
    return undefined;
  }
}
