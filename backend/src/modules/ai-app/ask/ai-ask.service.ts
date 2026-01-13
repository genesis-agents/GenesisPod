import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AIEngineFacade } from "../../ai-engine/facade";
import { AIModelType } from "@prisma/client";
import {
  FunctionCallingExecutor,
  ExecutionConfig,
} from "../../ai-engine/orchestration/executors/function-calling-executor";
import { BUILTIN_TOOLS, BuiltinToolId } from "../../ai-engine/core";
import { ToolRegistry } from "../../ai-engine/tools/registry";
import { ToolContext } from "../../ai-engine/tools/abstractions/tool.interface";
import { FunctionCallingLLMAdapter } from "../../ai-engine/llm/adapters/function-calling-llm-adapter";
import { RAGPipelineService } from "../rag/services/rag-pipeline.service";
import { CreditsService } from "../../credits/credits.service";
import { InsufficientCreditsException } from "../../credits/exceptions/insufficient-credits.exception";
import {
  DEEPDIVE_ENGINE_CONTEXT,
  isProjectRelatedQuery,
} from "./constants/project-context";

interface CreateSessionDto {
  title?: string;
  modelId?: string;
}

interface SendMessageDto {
  content: string;
  modelId?: string;
  webSearch?: boolean;
  /**
   * 是否启用工具调用（搜索、短期记忆等）
   * @default false
   */
  enableTools?: boolean;
  /**
   * 知识库 ID 列表，用于 RAG 查询
   */
  knowledgeBaseIds?: string[];
}

interface MessageWithContext {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * AI Ask 可用工具列表
 */
const AI_ASK_TOOLS: BuiltinToolId[] = [
  BUILTIN_TOOLS.TEXT_GENERATION,
  BUILTIN_TOOLS.WEB_SEARCH,
  BUILTIN_TOOLS.SHORT_TERM_MEMORY,
];

@Injectable()
export class AiAskService {
  private readonly logger = new Logger(AiAskService.name);
  private readonly DEFAULT_CONTEXT_MESSAGES = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiFacade: AIEngineFacade,
    @Optional()
    private readonly functionCallingExecutor: FunctionCallingExecutor,
    @Optional()
    private readonly functionCallingLLMAdapter: FunctionCallingLLMAdapter,
    @Optional() private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly ragPipelineService: RAGPipelineService,
    @Optional() private readonly creditsService: CreditsService,
  ) {}

  /**
   * 检查工具能力是否可用
   */
  private isToolCapabilityAvailable(): boolean {
    return !!(
      this.functionCallingExecutor &&
      this.functionCallingLLMAdapter &&
      this.toolRegistry
    );
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): BuiltinToolId[] {
    if (!this.isToolCapabilityAvailable()) {
      return [];
    }
    return AI_ASK_TOOLS.filter((tool) => this.toolRegistry.has(tool));
  }

  /**
   * 创建新会话
   */
  async createSession(userId: string, dto: CreateSessionDto) {
    const title = dto.title || "New Chat";

    const session = await this.prisma.askSession.create({
      data: {
        userId,
        title,
        modelId: dto.modelId,
      },
    });

    this.logger.log(`Created new session ${session.id} for user ${userId}`);
    return session;
  }

  /**
   * 获取用户的会话列表
   */
  async getSessions(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.askSession.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: { messages: true },
          },
        },
      }),
      this.prisma.askSession.count({ where: { userId } }),
    ]);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        modelId: s.modelId,
        isBookmarked: s.isBookmarked,
        messageCount: s._count.messages,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * 获取单个会话详情（含消息）
   */
  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.askSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    const messages = await this.prisma.askMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    return {
      session,
      messages,
    };
  }

  /**
   * 更新会话
   */
  async updateSession(
    sessionId: string,
    userId: string,
    data: { title?: string; modelId?: string; isBookmarked?: boolean },
  ) {
    const session = await this.prisma.askSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    return this.prisma.askSession.update({
      where: { id: sessionId },
      data,
    });
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string, userId: string) {
    const session = await this.prisma.askSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    await this.prisma.askSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }

  /**
   * 发送消息并获取 AI 响应
   * 支持可选的工具调用能力
   */
  async sendMessage(sessionId: string, userId: string, dto: SendMessageDto) {
    // 验证会话
    const session = await this.prisma.askSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    // 获取模型配置
    const modelId = dto.modelId || session.modelId;
    const modelConfig = await this.getModelConfig(modelId);

    // 积分检查：判断操作类型和预估积分
    const isRagQuery = dto.knowledgeBaseIds && dto.knowledgeBaseIds.length > 0;
    const operationType = isRagQuery ? "rag-chat" : "chat";
    const estimatedCredits = isRagQuery ? 15 : 10; // RAG 查询需要更多积分

    if (this.creditsService) {
      const balanceCheck = await this.creditsService.checkBalance(
        userId,
        estimatedCredits,
      );
      if (!balanceCheck.sufficient) {
        throw new InsufficientCreditsException(
          estimatedCredits,
          balanceCheck.balance,
        );
      }
    }

    // 构建上下文消息
    const contextMessages = await this.buildContext(sessionId);

    // 保存用户消息
    const userMessage = await this.prisma.askMessage.create({
      data: {
        sessionId,
        role: "user",
        content: dto.content,
        modelId: modelConfig.id,
        modelName: modelConfig.name,
        webSearch: dto.webSearch || false,
      },
    });

    // 添加当前用户消息到上下文
    contextMessages.push({
      role: "user" as const,
      content: dto.content,
    });

    try {
      let aiResponseContent: string;
      let tokensUsed = 0;
      const toolsUsed: string[] = [];

      // RAG 查询：如果指定了知识库，先进行 RAG 检索
      let ragContext = "";
      let ragSources: Array<{
        documentTitle: string;
        excerpt: string;
        score: number;
      }> = [];

      this.logger.log(
        `[sendMessage] Received knowledgeBaseIds: ${dto.knowledgeBaseIds?.join(", ") || "none"}, ragPipelineService available: ${!!this.ragPipelineService}`,
      );
      if (
        dto.knowledgeBaseIds &&
        dto.knowledgeBaseIds.length > 0 &&
        this.ragPipelineService
      ) {
        try {
          this.logger.log(
            `[sendMessage] Performing RAG query for KBs: ${dto.knowledgeBaseIds.join(", ")}`,
          );
          const ragResponse = await this.ragPipelineService.query({
            query: dto.content,
            knowledgeBaseIds: dto.knowledgeBaseIds,
            options: {
              topK: 5,
              useHyde: false, // 简化查询，加快速度
              useRerank: false,
              // When useRerank=false, scores are RRF scores (max ~0.016)
              // So we need a much lower threshold than when using rerank scores (0-1)
              minScore: 0.001,
            },
          });

          if (ragResponse.context && ragResponse.context.sources.length > 0) {
            ragContext = ragResponse.context.text;
            // Collect RAG sources to return to frontend
            ragSources = ragResponse.context.sources.map((s) => ({
              documentTitle: s.documentTitle,
              excerpt: s.excerpt,
              score: s.score,
            }));
            this.logger.log(
              `[sendMessage] RAG context added (${ragSources.length} sources): ${ragSources.map((s) => s.documentTitle).join(", ")}`,
            );
          } else {
            this.logger.log(
              `[sendMessage] RAG query returned no results above threshold`,
            );
          }
        } catch (ragError) {
          this.logger.warn(`[sendMessage] RAG query failed: ${ragError}`);
          // RAG 失败不应阻止正常回复
        }
      }

      // 判断是否使用工具调用模式
      const useTools = dto.enableTools && this.isToolCapabilityAvailable();

      if (useTools) {
        // 使用 AgentOrchestrator 进行工具调用
        this.logger.log(
          `[sendMessage] Using tool-enabled mode for session ${sessionId}`,
        );

        // 配置 LLM 适配器（使用 AI Engine 的 FunctionCallingLLMAdapter）
        this.functionCallingLLMAdapter.setConfig({
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey: modelConfig.apiKey ?? undefined,
          apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        });

        // 构建系统提示词（包含 RAG 上下文和项目上下文）
        const systemPrompt = this.buildSystemPromptWithContext(
          contextMessages,
          ragContext,
          dto.content,
        );

        // 构建工具执行上下文
        const toolContext: ToolContext = {
          executionId: sessionId,
          toolId: "ai-ask",
          createdAt: new Date(),
          timeout: 60000,
        };

        // 执行配置
        // Note: ExecutionConfig 暂不支持 taskProfile，保持原参数
        // TODO: Phase 1 - 更新 ExecutionConfig 接口以支持 taskProfile
        const executionConfig: Partial<ExecutionConfig> = {
          maxIterations: 5,
          maxToolCalls: 10,
          temperature: 0.7, // creativity: medium
          maxTokens: 4000, // outputLength: standard
        };

        // 执行自主模式（使用 AI Engine 的 FunctionCallingLLMAdapter）
        const events = this.functionCallingExecutor.execute(
          this.functionCallingLLMAdapter,
          systemPrompt,
          dto.content,
          this.getAvailableTools(),
          toolContext,
          executionConfig,
        );

        // 收集执行结果
        let finalContent = "";
        for await (const event of events) {
          if (event.type === "tool_call") {
            toolsUsed.push(event.tool);
            this.logger.log(`[sendMessage] Tool called: ${event.tool}`);
          } else if (event.type === "tool_result") {
            this.logger.log(`[sendMessage] Tool result: ${event.tool}`);
          } else if (event.type === "complete") {
            tokensUsed = event.result?.tokensUsed || 0;
            if (event.result?.summary) {
              finalContent = event.result.summary;
            }
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        aiResponseContent = finalContent || "抱歉，我无法完成这个请求。";
      } else {
        // 使用传统模式（通过 AIEngineFacade 调用）
        // 构建系统提示词（包含项目上下文和 RAG 上下文）
        const systemPrompt = this.buildSystemPromptForChat(
          dto.content,
          ragContext,
        );

        const messagesWithSystem = [
          {
            role: "system" as const,
            content: systemPrompt,
          },
          ...contextMessages,
        ];

        // 使用 AIEngineFacade 统一入口
        const aiResponse = await this.aiFacade.chat({
          messages: messagesWithSystem,
          model: modelConfig.modelId, // 指定模型
          modelType: AIModelType.CHAT,
          taskProfile: {
            creativity: "medium", // 对话需要中等创造性 (mapped from temperature: 0.7)
            outputLength: "standard", // 标准输出长度 (mapped from maxTokens: 4000)
          },
        });
        aiResponseContent = aiResponse.content;
        tokensUsed = aiResponse.tokensUsed || 0;
      }

      // 保存 AI 响应（如果使用了工具，在内容末尾添加工具使用信息）
      let responseContent = aiResponseContent;
      if (toolsUsed.length > 0) {
        responseContent += `\n\n---\n*使用了工具: ${toolsUsed.join(", ")}*`;
      }

      // 如果使用了 RAG，添加来源引用
      if (ragContext) {
        responseContent += `\n\n---\n📚 *回答基于知识库内容*`;
      }

      const assistantMessage = await this.prisma.askMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: responseContent,
          modelId: modelConfig.id,
          modelName: modelConfig.name,
          webSearch: dto.webSearch || false,
          tokens: tokensUsed,
        },
      });

      // 扣减积分
      if (this.creditsService) {
        try {
          await this.creditsService.consumeCredits({
            userId,
            moduleType: "ai-ask",
            operationType,
            tokenCount: tokensUsed,
            modelName: modelConfig.name,
            referenceId: assistantMessage.id,
            description: `AI Ask ${operationType === "rag-chat" ? "(RAG)" : ""} - ${modelConfig.name}`,
          });
        } catch (creditError) {
          this.logger.warn(
            `Failed to consume credits for AI Ask: ${creditError}`,
          );
          // 积分扣减失败不应阻止响应返回
        }
      }

      // 更新会话时间戳
      await this.prisma.askSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      // 如果是第一条消息，自动生成标题
      const messageCount = await this.prisma.askMessage.count({
        where: { sessionId },
      });

      if (messageCount === 2 && session.title === "New Chat") {
        // 异步生成标题
        this.generateSessionTitle(sessionId, dto.content).catch((err) => {
          this.logger.warn(`Failed to generate session title: ${err.message}`);
        });
      }

      return {
        userMessage,
        assistantMessage,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        // Include RAG sources for frontend display
        ragSources: ragSources.length > 0 ? ragSources : undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to get AI response: ${error}`);

      // 保存错误消息
      const errorMessage = await this.prisma.askMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
          modelId: modelConfig.id,
          modelName: modelConfig.name,
        },
      });

      return {
        userMessage,
        assistantMessage: errorMessage,
      };
    }
  }

  /**
   * 构建带上下文的系统提示词
   * @param contextMessages 对话历史
   * @param ragContext RAG 检索的知识库内容
   * @param userQuery 当前用户问题（用于判断是否需要项目上下文）
   */
  private buildSystemPromptWithContext(
    contextMessages: MessageWithContext[],
    ragContext?: string,
    userQuery?: string,
  ): string {
    const systemParts = [
      "你是一个智能助手，可以帮助用户回答问题、搜索信息和完成各种任务。",
      "请用中文回答，除非用户明确要求使用其他语言。",
      "回答要准确、简洁、有帮助。",
    ];

    // 如果问题与 DeepDive Engine 项目相关，添加项目上下文
    if (userQuery && isProjectRelatedQuery(userQuery)) {
      systemParts.push("\n## DeepDive Engine 项目知识库");
      systemParts.push(
        "以下是 DeepDive Engine 项目的内置知识，请基于这些信息回答关于本项目的问题：",
      );
      systemParts.push(DEEPDIVE_ENGINE_CONTEXT);
      this.logger.debug(
        "[buildSystemPromptWithContext] Added DeepDive Engine project context",
      );
    }

    // 如果有 RAG 上下文，添加知识库内容
    if (ragContext) {
      systemParts.push(
        "\n## 参考知识库内容\n以下是从知识库检索到的相关内容，请基于这些内容回答用户问题：",
      );
      systemParts.push(ragContext);
      systemParts.push(
        "\n请基于上述知识库内容回答问题。如果内容不相关，可以结合自身知识回答。",
      );
    }

    // 如果有对话历史，添加上下文
    if (contextMessages.length > 1) {
      const historyContext = contextMessages
        .slice(0, -1) // 排除最后一条（当前用户消息）
        .map(
          (m) =>
            `${m.role === "user" ? "用户" : "助手"}: ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`,
        )
        .join("\n");

      if (historyContext) {
        systemParts.push("\n以下是之前的对话历史：\n" + historyContext);
      }
    }

    return systemParts.join("\n");
  }

  /**
   * 构建聊天系统提示词（传统模式）
   * 包含项目上下文和 RAG 上下文
   */
  private buildSystemPromptForChat(
    userQuery: string,
    ragContext?: string,
  ): string {
    const parts = [
      "你是一个智能助手，可以帮助用户回答问题、搜索信息和完成各种任务。",
    ];

    // 如果问题与 DeepDive Engine 项目相关，添加项目上下文
    if (isProjectRelatedQuery(userQuery)) {
      parts.push("\n## DeepDive Engine 项目知识库");
      parts.push(
        "以下是 DeepDive Engine 项目的内置知识，请基于这些信息回答关于本项目的问题：",
      );
      parts.push(DEEPDIVE_ENGINE_CONTEXT);
      this.logger.debug(
        "[buildSystemPromptForChat] Added DeepDive Engine project context",
      );
    }

    // 如果有 RAG 上下文，添加知识库内容
    if (ragContext) {
      parts.push("\n## 参考知识库内容");
      parts.push("以下是从用户知识库中检索到的相关内容：");
      parts.push(ragContext);
    }

    parts.push("\n## 回答要求");
    parts.push("1. 优先使用上述知识库内容来回答问题");
    parts.push("2. 如果知识库内容与问题相关，请基于这些内容给出准确答案");
    parts.push("3. 如果知识库内容不足以回答问题，可以结合你自身的知识进行补充");
    parts.push("4. 请用中文回答，除非用户明确要求使用其他语言");
    parts.push("5. 回答要准确、简洁、有帮助");

    return parts.join("\n");
  }

  /**
   * 获取会话消息（支持分页）
   */
  async getMessages(
    sessionId: string,
    userId: string,
    limit = 50,
    before?: Date,
  ) {
    const session = await this.prisma.askSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    const where: any = { sessionId };
    if (before) {
      where.createdAt = { lt: before };
    }

    const messages = await this.prisma.askMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: resultMessages.reverse(),
      hasMore,
    };
  }

  /**
   * 重新生成消息
   */
  async regenerateMessage(
    sessionId: string,
    messageId: string,
    userId: string,
  ) {
    const session = await this.prisma.askSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    // 获取要重新生成的消息
    const message = await this.prisma.askMessage.findFirst({
      where: { id: messageId, sessionId },
    });

    if (!message || message.role !== "assistant") {
      throw new NotFoundException(
        "Message not found or not an assistant message",
      );
    }

    // 获取该消息之前的用户消息
    const previousMessages = await this.prisma.askMessage.findMany({
      where: {
        sessionId,
        createdAt: { lt: message.createdAt },
      },
      orderBy: { createdAt: "asc" },
    });

    if (previousMessages.length === 0) {
      throw new NotFoundException("No previous user message found");
    }

    const lastUserMessage = previousMessages[previousMessages.length - 1];
    if (lastUserMessage.role !== "user") {
      throw new NotFoundException("Previous message is not a user message");
    }

    // 获取模型配置
    const modelConfig = await this.getModelConfig(message.modelId);

    // 构建上下文（不包括要重新生成的消息）
    // 同样需要清理 base64 图片数据
    const contextMessages: MessageWithContext[] = previousMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: this.sanitizeMessageContent(m.content),
    }));

    try {
      // 调用 AI (通过 AIEngineFacade 统一入口)
      const aiResponse = await this.aiFacade.chat({
        messages: contextMessages,
        model: modelConfig.modelId, // 指定模型
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "medium", // 对话需要中等创造性 (mapped from temperature: 0.7)
          outputLength: "standard", // 标准输出长度 (mapped from maxTokens: 4000)
        },
      });

      // 更新消息内容
      const updatedMessage = await this.prisma.askMessage.update({
        where: { id: messageId },
        data: {
          content: aiResponse.content,
          tokens: aiResponse.tokensUsed || 0,
        },
      });

      return updatedMessage;
    } catch (error) {
      this.logger.error(`Failed to regenerate message: ${error}`);
      throw error;
    }
  }

  /**
   * 构建上下文消息
   * 清理 base64 图片数据以避免 token 超限
   */
  private async buildContext(
    sessionId: string,
    maxMessages = this.DEFAULT_CONTEXT_MESSAGES,
  ): Promise<MessageWithContext[]> {
    const messages = await this.prisma.askMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: maxMessages,
    });

    // 反转以保持时间顺序
    const orderedMessages = messages.reverse();

    // 转换为上下文格式，同时清理 base64 图片数据
    const contextMessages = orderedMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: this.sanitizeMessageContent(m.content),
    }));

    // 计算总字符长度，如果超过限制则截断旧消息
    const MAX_TOTAL_CHARS = 100000; // 约 25000 tokens
    let totalChars = 0;
    const truncatedMessages: MessageWithContext[] = [];

    // 从最新的消息开始，保留尽可能多的消息
    for (let i = contextMessages.length - 1; i >= 0; i--) {
      const msgLength = contextMessages[i].content.length;
      if (totalChars + msgLength <= MAX_TOTAL_CHARS) {
        truncatedMessages.unshift(contextMessages[i]);
        totalChars += msgLength;
      } else {
        // 如果是最新的用户消息，仍然保留（可能需要截断）
        if (
          i === contextMessages.length - 1 &&
          contextMessages[i].role === "user"
        ) {
          const truncatedContent = contextMessages[i].content.substring(
            0,
            MAX_TOTAL_CHARS - totalChars,
          );
          truncatedMessages.unshift({
            ...contextMessages[i],
            content: truncatedContent + "\n[内容已截断]",
          });
        }
        this.logger.warn(
          `Context truncated: removed ${i + 1} older messages to fit token limit`,
        );
        break;
      }
    }

    return truncatedMessages;
  }

  /**
   * 清理消息内容中的 base64 图片数据
   * 将巨大的 base64 数据替换为占位符
   */
  private sanitizeMessageContent(content: string): string {
    if (!content) return content;

    // 替换 base64 图片数据为占位符
    // 匹配 data:image/xxx;base64,... 格式
    let sanitized = content.replace(
      /data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+/g,
      "[图片已省略]",
    );

    // 替换 Markdown 格式的 base64 图片
    // ![xxx](data:image/xxx;base64,...)
    sanitized = sanitized.replace(
      /!\[[^\]]*\]\(data:image\/[^)]+\)/g,
      "[图片已省略]",
    );

    // 如果单条消息还是太长，截断
    const MAX_MESSAGE_LENGTH = 20000;
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      sanitized =
        sanitized.substring(0, MAX_MESSAGE_LENGTH) + "\n[消息内容已截断]";
    }

    return sanitized;
  }

  /**
   * 获取模型配置
   */
  private async getModelConfig(modelId?: string | null) {
    if (modelId) {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          OR: [
            { id: modelId },
            { modelId: { equals: modelId, mode: "insensitive" } },
            { name: { equals: modelId, mode: "insensitive" } },
          ],
          isEnabled: true,
        },
      });

      if (model) {
        return model;
      }
    }

    // 获取默认 CHAT 模型
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: AIModelType.CHAT,
      },
    });

    if (defaultModel) {
      return defaultModel;
    }

    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: AIModelType.CHAT,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!anyModel) {
      throw new NotFoundException("No CHAT AI model is available");
    }

    return anyModel;
  }

  /**
   * 自动生成会话标题
   * 直接从用户消息提取关键内容作为标题，不依赖 AI 生成（更可靠）
   */
  private async generateSessionTitle(
    sessionId: string,
    firstMessage: string,
  ): Promise<void> {
    try {
      // 直接从用户消息生成标题，不调用 AI（更可靠、更快）
      const title = this.extractTitleFromMessage(firstMessage);

      await this.prisma.askSession.update({
        where: { id: sessionId },
        data: { title },
      });

      this.logger.log(`Generated title for session ${sessionId}: ${title}`);
    } catch (error) {
      this.logger.error(`Failed to set session title: ${error}`);
    }
  }

  /**
   * 从用户消息中提取标题
   * 简单可靠的实现：直接使用用户消息的前 N 个字符
   */
  private extractTitleFromMessage(message: string): string {
    if (!message || typeof message !== "string") {
      return "New Chat";
    }

    // 清理消息内容
    const cleaned = message
      .replace(/\n+/g, " ") // 换行替换为空格
      .replace(/\s+/g, " ") // 合并多个空格
      .replace(/^[>\s#*\-•]+/g, "") // 移除 markdown 前缀
      .replace(/!\[.*?\]\(.*?\)/g, "") // 移除图片标记
      .replace(/\[.*?\]\(.*?\)/g, (match) => {
        // 链接只保留文字部分
        const textMatch = match.match(/\[(.*?)\]/);
        return textMatch ? textMatch[1] : "";
      })
      .replace(/<[^>]+>/g, "") // 移除 HTML 标签
      .replace(/```[\s\S]*?```/g, "[代码]") // 代码块替换为 [代码]
      .replace(/`[^`]+`/g, "") // 移除行内代码
      .trim();

    // 如果清理后为空，返回默认标题
    if (!cleaned) {
      return "New Chat";
    }

    // 限制长度为 40 个字符
    const maxLength = 40;
    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // 尝试在自然边界截断（句号、问号、逗号、空格）
    const truncated = cleaned.substring(0, maxLength);

    // 中文：在标点符号处截断
    const chinesePunctuationIndex = Math.max(
      truncated.lastIndexOf("。"),
      truncated.lastIndexOf("？"),
      truncated.lastIndexOf("！"),
      truncated.lastIndexOf("，"),
      truncated.lastIndexOf("、"),
    );
    if (chinesePunctuationIndex > maxLength * 0.5) {
      return truncated.substring(0, chinesePunctuationIndex);
    }

    // 英文：在空格处截断
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.5) {
      return truncated.substring(0, lastSpace);
    }

    // 直接截断
    return truncated;
  }

  /**
   * 搜索会话
   */
  async searchSessions(userId: string, query: string, limit = 20) {
    const sessions = await this.prisma.askSession.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { summary: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return sessions;
  }
}
