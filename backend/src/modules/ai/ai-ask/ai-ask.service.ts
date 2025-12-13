import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AiChatService } from "../ai-core/ai-chat.service";
import { AIModelType } from "@prisma/client";

interface CreateSessionDto {
  title?: string;
  modelId?: string;
}

interface SendMessageDto {
  content: string;
  modelId?: string;
  webSearch?: boolean;
}

interface MessageWithContext {
  role: "user" | "assistant" | "system";
  content: string;
}

@Injectable()
export class AiAskService {
  private readonly logger = new Logger(AiAskService.name);
  private readonly DEFAULT_CONTEXT_MESSAGES = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

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
    data: { title?: string; modelId?: string },
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
      // 调用 AI
      const aiResponse = await this.aiChatService.generateChatCompletionWithKey(
        {
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey: modelConfig.apiKey ?? "",
          apiEndpoint: modelConfig.apiEndpoint ?? undefined,
          messages: contextMessages,
          maxTokens: 4000,
          temperature: 0.7,
        },
      );

      // 保存 AI 响应
      const assistantMessage = await this.prisma.askMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: aiResponse.content,
          modelId: modelConfig.id,
          modelName: modelConfig.name,
          webSearch: dto.webSearch || false,
          tokens: aiResponse.tokensUsed,
        },
      });

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
      // 调用 AI
      const aiResponse = await this.aiChatService.generateChatCompletionWithKey(
        {
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey: modelConfig.apiKey ?? "",
          apiEndpoint: modelConfig.apiEndpoint ?? undefined,
          messages: contextMessages,
          maxTokens: 4000,
          temperature: 0.7,
        },
      );

      // 更新消息内容
      const updatedMessage = await this.prisma.askMessage.update({
        where: { id: messageId },
        data: {
          content: aiResponse.content,
          tokens: aiResponse.tokensUsed,
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
   */
  private async generateSessionTitle(
    sessionId: string,
    firstMessage: string,
  ): Promise<void> {
    try {
      const modelConfig = await this.getModelConfig();

      const response = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey ?? "",
        apiEndpoint: modelConfig.apiEndpoint ?? undefined,
        messages: [
          {
            role: "system",
            content:
              "Generate a short title (max 30 characters) for this conversation. Reply with only the title, no quotes or extra text.",
          },
          {
            role: "user",
            content: firstMessage,
          },
        ],
        maxTokens: 50,
        temperature: 0.7,
      });

      const title = response.content.trim().slice(0, 100);

      await this.prisma.askSession.update({
        where: { id: sessionId },
        data: { title },
      });

      this.logger.log(`Generated title for session ${sessionId}: ${title}`);
    } catch (error) {
      this.logger.error(`Failed to generate session title: ${error}`);
    }
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
