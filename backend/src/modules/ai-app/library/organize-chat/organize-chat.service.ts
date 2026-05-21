import { Injectable, Logger, Optional } from "@nestjs/common";
import { OrganizeScope } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  ChatFacade,
  ToolFacade,
  type AICapabilityContext,
  type ExecutionConfig,
} from "@/modules/ai-harness/facade";
import {
  CreditsService,
  InsufficientCreditsException,
} from "../../../ai-infra/facade";
import { OrganizeChatDto } from "./dto/organize-chat.dto";
import { ORGANIZE_AGENT_ROLE_ID } from "./tools/organize-bookmark-tools";

/** SSE 事件（前端逐条渲染：会话/状态/工具动作/总结/完成/错误）*/
export type OrganizeStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "status"; stage: "planning" }
  | { type: "tool"; phase: "call" | "result"; tool: string; data?: unknown }
  | { type: "chunk"; content: string }
  | {
      type: "done";
      sessionId: string;
      assistantMessageId: string;
      tokensUsed: number;
      summary: string;
    }
  | { type: "error"; message: string };

const ORGANIZE_ESTIMATED_CREDITS = 20;

@Injectable()
export class OrganizeChatService {
  private readonly logger = new Logger(OrganizeChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly toolFacade: ToolFacade,
    @Optional() private readonly creditsService?: CreditsService,
  ) {}

  /**
   * 对话整理一轮：复用平台 ReAct 工具循环（chatWithToolsStream），把 AgentEvent 转为 SSE。
   * 不自写 loop；意图理解 + 工具选择由平台 agent 完成；工具薄封装 collections（行级鉴权）。
   */
  async *streamOrganize(
    userId: string,
    dto: OrganizeChatDto,
  ): AsyncGenerator<OrganizeStreamEvent> {
    const scope = dto.scope ?? OrganizeScope.BOOKMARKS;

    // 1. 会话（续聊 or 新建）
    let session = dto.sessionId
      ? await this.prisma.organizeSession.findFirst({
          where: { id: dto.sessionId, userId },
        })
      : null;
    if (!session) {
      session = await this.prisma.organizeSession.create({
        data: { userId, scope, title: dto.message.slice(0, 50) || "整理会话" },
      });
    }
    yield { type: "session", sessionId: session.id };

    // 2. 持久化用户消息
    await this.prisma.organizeMessage.create({
      data: { sessionId: session.id, role: "user", content: dto.message },
    });

    // 3. 余额闸门（评审 Q5：按轮计费）
    if (this.creditsService) {
      const balance = await this.creditsService.checkBalance(
        userId,
        ORGANIZE_ESTIMATED_CREDITS,
      );
      if (!balance.sufficient) {
        throw new InsufficientCreditsException(
          ORGANIZE_ESTIMATED_CREDITS,
          balance.balance,
        );
      }
    }

    // 4. 模型配置（复用 ai-ask 范式；BYOK key 由 facade 内部解析）
    const modelConfig = await this.getModelConfig(dto.modelId);

    // 5. 组装 organize agent：systemPrompt + roleId 隔离 context
    const systemPrompt = this.buildSystemPrompt(scope, dto.conversationHistory);
    const capabilityContext: AICapabilityContext = {
      agentId: `organize-${session.id}`,
      userId,
      roleId: ORGANIZE_AGENT_ROLE_ID,
      domain: "organize",
    };
    const executionConfig: Partial<ExecutionConfig> = {
      maxIterations: 6,
      maxToolCalls: 15,
      taskProfile: { creativity: "medium", outputLength: "standard" },
    };

    yield { type: "status", stage: "planning" };

    // 6. 跑平台 ReAct 工具循环，AgentEvent → SSE
    let summary = "";
    let tokensUsed = 0;
    const toolActions: Array<{ tool: string }> = [];

    for await (const ev of this.toolFacade.chatWithToolsStream({
      systemPrompt,
      userPrompt: dto.message,
      context: capabilityContext,
      modelConfig: {
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey ?? undefined,
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
      },
      executionConfig,
    })) {
      switch (ev.type) {
        case "tool_call":
          yield { type: "tool", phase: "call", tool: ev.tool, data: ev.input };
          break;
        case "tool_result":
          toolActions.push({ tool: ev.tool });
          yield {
            type: "tool",
            phase: "result",
            tool: ev.tool,
            data: ev.output,
          };
          break;
        case "complete":
          summary = ev.result.summary;
          tokensUsed = ev.result.tokensUsed;
          if (summary) yield { type: "chunk", content: summary };
          break;
        case "error":
          throw new Error(ev.error);
        default:
          break;
      }
    }

    // 7. 持久化助手消息 + 触碰会话时间
    const assistantMessage = await this.prisma.organizeMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: summary,
        toolActions,
      },
    });
    await this.prisma.organizeSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    // 8. 计费（按本轮实际 token；BLK-6：显式扣费，不依赖 BillingContext 包裹 generator）
    if (this.creditsService && tokensUsed > 0) {
      try {
        await this.creditsService.consumeCredits({
          userId,
          moduleType: "organize-chat",
          operationType: "organize",
          tokenCount: tokensUsed,
          modelName: modelConfig.name,
          referenceId: session.id,
          description: "对话整理",
        });
      } catch (err) {
        this.logger.error(
          `[organize] consumeCredits failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    yield {
      type: "done",
      sessionId: session.id,
      assistantMessageId: assistantMessage.id,
      tokensUsed,
      summary,
    };
  }

  /** 取最近会话消息（前端代理掐断后 GET 对账，同 ai-ask reconcile 范式）*/
  async getRecentMessages(userId: string, sessionId: string, limit = 6) {
    const session = await this.prisma.organizeSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) return [];
    return this.prisma.organizeMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 20),
    });
  }

  /** 复用 ai-ask 的模型解析（默认 CHAT 模型；apiKey 由 facade 内部按 BYOK 解析）*/
  private async getModelConfig(modelId?: string | null) {
    if (modelId) {
      const model = await this.chatFacade.getModelById(modelId);
      if (model) {
        return {
          modelId: model.modelId,
          name: model.displayName,
          provider: model.provider,
          apiKey: null as string | null,
          apiEndpoint: model.apiEndpoint || null,
        };
      }
    }
    const defaultModel = await this.chatFacade.getDefaultTextModel();
    if (!defaultModel) {
      throw new Error("No CHAT AI model is available");
    }
    return {
      modelId: defaultModel.modelId,
      name: defaultModel.displayName,
      provider: defaultModel.provider,
      apiKey: null as string | null,
      apiEndpoint: null as string | null,
    };
  }

  private buildSystemPrompt(
    scope: OrganizeScope,
    history?: Array<{ role: string; content: string }>,
  ): string {
    const scopeLabel =
      scope === OrganizeScope.NOTES
        ? "笔记"
        : scope === OrganizeScope.EXTERNAL
          ? "外部连接内容"
          : "书签";
    const lines = [
      `你是用户资料库的「${scopeLabel}」整理助手。根据用户的自然语言指令，调用工具真实整理用户的库。`,
      "规则：",
      "1. 先用 organize-list-collections / organize-list-items 了解现状，再做写操作。",
      "2. 写工具（打标/移动/改状态）的 itemIds 必须来自 organize-list-items 实际返回的 id，不得编造。",
      "3. 严格遵守用户的限定条件（如「已读的别动」→ 先按 status 过滤再操作）。",
      "4. 单次写操作最多 100 条；超出请分批并说明。",
      "5. 完成后用简洁中文总结你做了什么（建了哪些集合、给多少条打了什么标签/移动到哪）。",
    ];
    if (history && history.length > 0) {
      lines.push("", "对话历史（供延续上下文）：");
      for (const m of history.slice(-20)) {
        lines.push(`${m.role === "assistant" ? "助手" : "用户"}：${m.content}`);
      }
    }
    return lines.join("\n");
  }
}
