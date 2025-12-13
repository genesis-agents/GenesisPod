import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { InputJsonValue } from "@prisma/client/runtime/library";
import { SendChatMessageDto, CreateNoteDto, UpdateNoteDto } from "./dto";
import { AiChatService } from "../ai-core/ai-chat.service";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  citations?: string[];
}

@Injectable()
export class AiStudioChatService {
  private readonly logger = new Logger(AiStudioChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * Get or create the current chat session for a project
   */
  async getCurrentChat(userId: string, projectId: string) {
    // Verify project ownership
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Get the most recent chat or create a new one
    let chat = await this.prisma.researchProjectChat.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    if (!chat) {
      chat = await this.prisma.researchProjectChat.create({
        data: {
          projectId,
          messages: [],
          title: "New Chat",
        },
      });

      // Update chat count
      await this.prisma.researchProject.update({
        where: { id: projectId },
        data: { chatCount: { increment: 1 } },
      });
    }

    return chat;
  }

  /**
   * Send a message in a chat session and get AI response
   */
  async sendMessage(
    userId: string,
    projectId: string,
    dto: SendChatMessageDto,
  ) {
    const chat = await this.getCurrentChat(userId, projectId);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: dto.message,
      timestamp: new Date().toISOString(),
    };

    // Get current messages and add the new one
    const messages = (chat.messages as unknown as ChatMessage[]) || [];
    messages.push(userMessage);

    // Update the chat with user message
    await this.prisma.researchProjectChat.update({
      where: { id: chat.id },
      data: {
        messages: messages as unknown as InputJsonValue,
        modelUsed: dto.model || "gpt-4",
      },
    });

    // Get selected sources for context
    let sourceContext: any[] = [];
    if (dto.selectedSourceIds && dto.selectedSourceIds.length > 0) {
      const sources = await this.prisma.researchProjectSource.findMany({
        where: {
          id: { in: dto.selectedSourceIds },
          projectId,
        },
        select: {
          id: true,
          title: true,
          abstract: true,
          content: true,
          sourceType: true,
          aiSummary: true,
        },
      });
      sourceContext = sources;
    }

    // Build context from sources
    const sourceContextText = this.buildSourceContext(sourceContext);

    // Build system prompt with source context
    const systemPrompt = this.buildSystemPrompt(sourceContextText);

    // Build conversation history for AI
    const conversationHistory = messages
      .filter((m) => m.role !== "system")
      .slice(-10) // Keep last 10 messages for context
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      this.logger.log(
        `Generating AI response for project ${projectId} with ${sourceContext.length} sources, model: ${dto.model}`,
      );

      // Get model configuration from database
      const modelConfig = await this.getModelConfig(dto.model);

      if (!modelConfig) {
        throw new Error(`Model "${dto.model}" not found or not enabled`);
      }

      this.logger.log(
        `Using model: ${modelConfig.displayName} (${modelConfig.provider}/${modelConfig.modelId})`,
      );

      // Call AI service with database configuration
      const aiResult = await this.aiChatService.generateChatCompletionWithKey({
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
        apiKey: modelConfig.apiKey || "",
        apiEndpoint: modelConfig.apiEndpoint || undefined,
        systemPrompt,
        messages: conversationHistory,
        maxTokens: modelConfig.maxTokens || 2048,
        temperature: modelConfig.temperature || 0.7,
        displayName: modelConfig.displayName,
      });

      // Create AI response message
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: aiResult.content,
        timestamp: new Date().toISOString(),
        citations: sourceContext.map((s) => s.title),
      };

      // Add AI response to messages
      messages.push(aiMessage);

      // Update chat with AI response
      await this.prisma.researchProjectChat.update({
        where: { id: chat.id },
        data: {
          messages: messages as unknown as InputJsonValue,
          tokensUsed: (chat.tokensUsed || 0) + aiResult.tokensUsed,
        },
      });

      return {
        chatId: chat.id,
        userMessage,
        aiMessage,
        sourceContext,
        tokensUsed: aiResult.tokensUsed,
      };
    } catch (error: any) {
      this.logger.error(`AI chat failed: ${error.message}`);

      // Return error message as AI response
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: `抱歉，AI 回复生成失败：${error.message}。请稍后重试。`,
        timestamp: new Date().toISOString(),
      };

      messages.push(errorMessage);
      await this.prisma.researchProjectChat.update({
        where: { id: chat.id },
        data: {
          messages: messages as unknown as InputJsonValue,
        },
      });

      return {
        chatId: chat.id,
        userMessage,
        aiMessage: errorMessage,
        sourceContext,
        error: error.message,
      };
    }
  }

  /**
   * Build context text from sources
   */
  private buildSourceContext(sources: any[]): string {
    if (sources.length === 0) {
      return "";
    }

    const contextParts = sources.map((source, index) => {
      const parts = [`[资料 ${index + 1}] ${source.title}`];
      parts.push(`类型: ${source.sourceType}`);

      if (source.abstract) {
        parts.push(`摘要: ${source.abstract}`);
      }

      if (source.content) {
        // Limit content to avoid token overflow
        const maxContentLength = 2000;
        const content =
          source.content.length > maxContentLength
            ? source.content.substring(0, maxContentLength) + "..."
            : source.content;
        parts.push(`内容: ${content}`);
      }

      if (source.aiSummary) {
        parts.push(`AI 总结: ${source.aiSummary}`);
      }

      return parts.join("\n");
    });

    return contextParts.join("\n\n---\n\n");
  }

  /**
   * Get model configuration from database
   */
  private async getModelConfig(modelName?: string) {
    // If model name is provided, find by name
    if (modelName) {
      const model = await this.prisma.aIModel.findFirst({
        where: {
          name: modelName,
          isEnabled: true,
        },
      });
      if (model) {
        this.logger.log(
          `[AIStudio] Using specified model: ${model.name} (${model.modelId})`,
        );
        return model;
      }
    }

    // Fallback to default CHAT model
    const defaultModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
        modelType: "CHAT",
      },
    });

    if (defaultModel) {
      this.logger.log(
        `[AIStudio] Using default CHAT model: ${defaultModel.name} (${defaultModel.modelId})`,
      );
      return defaultModel;
    }

    // If no default, get any enabled CHAT model
    const anyModel = await this.prisma.aIModel.findFirst({
      where: {
        isEnabled: true,
        modelType: "CHAT",
      },
      orderBy: { createdAt: "asc" },
    });

    if (anyModel) {
      this.logger.log(
        `[AIStudio] Using fallback CHAT model: ${anyModel.name} (${anyModel.modelId})`,
      );
    }

    return anyModel;
  }

  /**
   * Build system prompt with source context
   */
  private buildSystemPrompt(sourceContext: string): string {
    const basePrompt = `你是一个专业的研究助手，帮助用户分析和理解研究资料。你的回答应该：
1. 基于提供的资料内容进行分析和回答
2. 引用具体的资料来源支持你的观点
3. 如果资料中没有相关信息，请明确说明
4. 保持客观、准确、专业的态度
5. 使用清晰的结构组织回答`;

    if (sourceContext) {
      return `${basePrompt}

以下是用户选择的研究资料，请基于这些资料回答用户的问题：

${sourceContext}`;
    }

    return `${basePrompt}

注意：用户没有选择任何研究资料。如果用户的问题需要基于特定资料回答，请提醒他们先选择相关资料。`;
  }

  /**
   * Add AI response to chat
   */
  async addAIResponse(
    chatId: string,
    content: string,
    citations?: string[],
    tokensUsed?: number,
  ) {
    const chat = await this.prisma.researchProjectChat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException("Chat not found");
    }

    const aiMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      citations,
    };

    const messages = (chat.messages as unknown as ChatMessage[]) || [];
    messages.push(aiMessage);

    return this.prisma.researchProjectChat.update({
      where: { id: chatId },
      data: {
        messages: messages as unknown as InputJsonValue,
        tokensUsed: (chat.tokensUsed || 0) + (tokensUsed || 0),
      },
    });
  }

  /**
   * Get chat history
   */
  async getChatHistory(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProjectChat.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        modelUsed: true,
        tokensUsed: true,
      },
    });
  }

  /**
   * Start a new chat session
   */
  async startNewChat(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const chat = await this.prisma.researchProjectChat.create({
      data: {
        projectId,
        messages: [],
        title: `Chat ${new Date().toLocaleDateString()}`,
      },
    });

    // Update chat count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { chatCount: { increment: 1 } },
    });

    return chat;
  }

  // ==================== Notes ====================

  /**
   * Create a note in a project
   */
  async createNote(userId: string, projectId: string, dto: CreateNoteDto) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const note = await this.prisma.researchProjectNote.create({
      data: {
        projectId,
        title: dto.title,
        content: dto.content,
        sourceType: dto.sourceType || "manual",
        chatId: dto.chatId,
        tags: dto.tags || [],
        isPinned: dto.isPinned || false,
      },
    });

    // Update note count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { noteCount: { increment: 1 } },
    });

    return note;
  }

  /**
   * Get all notes for a project
   */
  async getNotes(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProjectNote.findMany({
      where: { projectId },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Update a note
   */
  async updateNote(
    userId: string,
    projectId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const note = await this.prisma.researchProjectNote.findUnique({
      where: { id: noteId },
    });

    if (!note || note.projectId !== projectId) {
      throw new NotFoundException("Note not found");
    }

    return this.prisma.researchProjectNote.update({
      where: { id: noteId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
      },
    });
  }

  /**
   * Delete a note
   */
  async deleteNote(userId: string, projectId: string, noteId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const note = await this.prisma.researchProjectNote.findUnique({
      where: { id: noteId },
    });

    if (!note || note.projectId !== projectId) {
      throw new NotFoundException("Note not found");
    }

    await this.prisma.researchProjectNote.delete({
      where: { id: noteId },
    });

    // Update note count
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { noteCount: { decrement: 1 } },
    });

    return { success: true };
  }

  /**
   * Save chat message as note
   */
  async saveMessageAsNote(
    userId: string,
    projectId: string,
    chatId: string,
    messageContent: string,
    title?: string,
  ) {
    return this.createNote(userId, projectId, {
      title: title || "Saved from chat",
      content: messageContent,
      sourceType: "ai-chat",
      chatId,
    });
  }
}
