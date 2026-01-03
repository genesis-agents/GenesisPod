/**
 * Multi Model Service - Stub
 *
 * @deprecated This service is deprecated. Use LLMFactory from AI Engine instead.
 * Skills should be refactored to implement ISkill interface and use LLMFactory.
 *
 * This stub is provided for backward compatibility during migration.
 */

import { Injectable, Logger } from "@nestjs/common";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm-factory";

export interface MultiModelChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Role call input - used by skills to call LLM with role context
 * @deprecated Use LLMFactory directly
 */
export interface RoleCallInput {
  role: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Role call result
 * @deprecated Use LLMFactory directly
 */
export interface RoleCallResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * @deprecated Use LLMFactory instead
 */
@Injectable()
export class MultiModelService {
  private readonly logger = new Logger(MultiModelService.name);

  constructor(private readonly llmFactory: LLMFactory) {
    this.logger.warn(
      "MultiModelService is deprecated. Please use LLMFactory instead.",
    );
  }

  /**
   * Call LLM by role - maps role to appropriate model
   * @deprecated Use LLMFactory.getAdapter() instead
   */
  async callByRole(input: RoleCallInput): Promise<RoleCallResult> {
    try {
      // Map role to model - default to gpt-4o for now
      const model = this.roleToModel(input.role);
      const adapter = await this.llmFactory.getAdapter(model);

      if (!adapter) {
        return {
          success: false,
          error: `Failed to get adapter for role: ${input.role}`,
        };
      }

      const response = await adapter.chat({
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });

      return {
        success: true,
        content: response.content || "",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`[callByRole] Error: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Map role to model
   * @deprecated Roles should be handled by AI Engine's RoleRegistry
   */
  private roleToModel(_role: string): string {
    // 严禁硬编码！使用 LLMFactory 的默认模型
    // 所有角色使用统一的数据库配置模型
    return this.llmFactory.getDefaultModel();
  }

  /**
   * @deprecated Use LLMFactory.getAdapter() instead
   */
  async chat(
    messages: ChatMessage[],
    options?: MultiModelChatOptions,
  ): Promise<string> {
    const adapter = await this.llmFactory.getAdapter(options?.model);
    if (!adapter) {
      throw new Error("Failed to get LLM adapter");
    }
    const response = await adapter.chat({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return response.content || "";
  }

  /**
   * @deprecated Use LLMFactory.getAdapter().chatStream() instead
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: MultiModelChatOptions,
  ): AsyncGenerator<string> {
    const adapter = await this.llmFactory.getAdapter(options?.model);
    if (!adapter) {
      throw new Error("Failed to get LLM adapter");
    }

    // Check if adapter supports streaming
    if (!adapter.chatStream) {
      // Fallback to non-streaming
      const response = await adapter.chat({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
      yield response.content || "";
      return;
    }

    const stream = adapter.chatStream({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });

    for await (const chunk of stream) {
      yield chunk.delta?.content || "";
    }
  }
}
