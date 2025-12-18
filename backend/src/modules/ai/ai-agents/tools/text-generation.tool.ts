/**
 * Text Generation Tool
 * 文本生成工具 - 复用 AiChatService
 */

import { Injectable } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../core/tool.interface";
import { ToolType } from "../core/agent.types";
import { AiChatService } from "../../ai-core/ai-chat.service";

// ============================================================================
// Types
// ============================================================================

export interface TextGenerationInput {
  /**
   * 生成提示词
   */
  prompt: string;

  /**
   * 系统提示词（可选）
   */
  systemPrompt?: string;

  /**
   * 上下文信息（可选）
   */
  context?: string;

  /**
   * 最大输出 token 数
   */
  maxTokens?: number;

  /**
   * 温度参数（0-1）
   */
  temperature?: number;

  /**
   * 输出格式
   */
  outputFormat?: "text" | "json" | "markdown";
}

export interface TextGenerationOutput {
  /**
   * 生成的文本
   */
  text: string;

  /**
   * 使用的 token 数
   */
  tokensUsed?: number;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 使用的模型
   */
  model?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class TextGenerationTool extends BaseTool<
  TextGenerationInput,
  TextGenerationOutput
> {
  readonly type = ToolType.TEXT_GENERATION;
  readonly name = "文本生成";
  readonly description =
    "使用 AI 模型生成文本内容。适用于撰写文章、总结、翻译、改写等文本处理任务。支持设置系统提示和上下文。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "生成提示词，描述需要生成的内容",
      },
      systemPrompt: {
        type: "string",
        description: "系统提示词，定义 AI 的角色和行为",
      },
      context: {
        type: "string",
        description: "上下文信息，提供相关背景资料",
      },
      maxTokens: {
        type: "number",
        description: "最大输出 token 数，默认 2000",
        default: 2000,
      },
      temperature: {
        type: "number",
        description: "温度参数（0-1），越高越有创意，默认 0.7",
        default: 0.7,
      },
      outputFormat: {
        type: "string",
        description: "输出格式",
        enum: ["text", "json", "markdown"],
        default: "text",
      },
    },
    required: ["prompt"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "生成的文本内容",
      },
      tokensUsed: {
        type: "number",
        description: "使用的 token 数量",
      },
      success: {
        type: "boolean",
        description: "生成是否成功",
      },
      model: {
        type: "string",
        description: "使用的模型名称",
      },
    },
  };

  constructor(private readonly aiChatService: AiChatService) {
    super();
    this.defaultTimeout = 60000; // 60 秒超时
  }

  validateInput(input: TextGenerationInput): boolean {
    return (
      typeof input.prompt === "string" &&
      input.prompt.trim().length > 0 &&
      input.prompt.length <= 50000
    );
  }

  protected async doExecute(
    input: TextGenerationInput,
    _context: ToolContext,
  ): Promise<TextGenerationOutput> {
    const {
      prompt,
      systemPrompt,
      context,
      maxTokens = 2000,
      temperature = 0.7,
      outputFormat = "text",
    } = input;

    // 构建完整提示词
    let fullPrompt = prompt;
    if (context) {
      fullPrompt = `上下文信息：\n${context}\n\n${prompt}`;
    }

    // 添加格式要求
    if (outputFormat === "json") {
      fullPrompt += "\n\n请以有效的 JSON 格式输出结果。";
    } else if (outputFormat === "markdown") {
      fullPrompt += "\n\n请以 Markdown 格式输出结果。";
    }

    // 构建消息
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: fullPrompt });

    try {
      // 调用 AI 服务
      const response = await this.aiChatService.chat({
        messages,
        maxTokens,
        temperature,
      });

      return {
        text: response.content,
        tokensUsed: response.usage?.totalTokens,
        success: true,
        model: response.model,
      };
    } catch (error) {
      return {
        text: "",
        success: false,
      };
    }
  }
}
