import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import { SocialContentType } from "../types";
import { AIModelType } from "@prisma/client";

export interface TransformInput {
  sourceContent: string;
  sourceTitle?: string;
  targetType: SocialContentType;
  additionalInstructions?: string;
}

export interface TransformOutput {
  title: string;
  content: string;
  digest?: string;
  tags?: string[];
}

@Injectable()
export class ContentTransformerService {
  private readonly logger = new Logger(ContentTransformerService.name);

  constructor(private readonly aiChat: AiChatService) {}

  async transform(input: TransformInput): Promise<TransformOutput> {
    this.logger.log(`Transforming content to ${input.targetType}`);

    const prompt = this.buildPrompt(input);

    const response = await this.aiChat.chat({
      messages: [
        {
          role: "system",
          content: this.getSystemPrompt(input.targetType),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      modelType: AIModelType.CHAT,
      taskProfile: {
        creativity: "medium",
        outputLength: "long",
      },
    });

    // Check for API errors (e.g., expired API key, rate limits)
    if (response.isError) {
      this.logger.error(
        `AI transform failed: ${response.content.slice(0, 200)}`,
      );
      throw new Error(`AI 内容转换失败: ${response.content.slice(0, 100)}`);
    }

    // Validate response content is not empty or too short
    if (!response.content || response.content.length < 50) {
      this.logger.error(
        `AI returned invalid content (length=${response.content?.length || 0})`,
      );
      throw new Error("AI 返回的内容无效或过短，请重试");
    }

    return this.parseResponse(response.content, input.sourceTitle);
  }

  private getSystemPrompt(targetType: SocialContentType): string {
    switch (targetType) {
      case SocialContentType.WECHAT_ARTICLE:
        return `你是一位专业的微信公众号文章编辑。你的任务是将提供的内容转换为适合微信公众号的文章格式。

要求：
1. 标题要吸引人，控制在30字以内
2. 开头要有吸引力，引发读者兴趣
3. 内容分段清晰，每段不宜过长
4. 适当使用小标题划分章节
5. 结尾要有总结或呼吁行动
6. 生成3-5个相关标签
7. 生成一段100字以内的摘要

请以JSON格式返回，包含以下字段：
- title: 文章标题
- content: 正文内容（Markdown格式）
- digest: 摘要
- tags: 标签数组`;

      case SocialContentType.XIAOHONGSHU_NOTE:
        return `你是一位专业的小红书内容创作者。你的任务是将提供的内容转换为适合小红书的图文笔记格式。

要求：
1. 标题要有吸引力，可以使用表情符号，控制在20字以内
2. 内容要口语化、亲和力强
3. 适当分段，每段2-3行
4. 使用适量表情符号增加可读性
5. 包含实用的干货或观点
6. 结尾可以引导互动（如提问）
7. 生成5-8个相关话题标签（带#号）

请以JSON格式返回，包含以下字段：
- title: 笔记标题
- content: 正文内容
- digest: 简短描述
- tags: 话题标签数组（带#号）`;

      default:
        return "将内容转换为适合社交媒体发布的格式。";
    }
  }

  private buildPrompt(input: TransformInput): string {
    let prompt = `请将以下内容转换为目标平台格式：

原始标题：${input.sourceTitle || "无"}

原始内容：
${input.sourceContent}`;

    if (input.additionalInstructions) {
      prompt += `\n\n额外要求：${input.additionalInstructions}`;
    }

    return prompt;
  }

  private parseResponse(
    responseContent: string,
    fallbackTitle?: string,
  ): TransformOutput {
    try {
      // 尝试从响应中提取JSON
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || fallbackTitle || "未命名",
          content: parsed.content || responseContent,
          digest: parsed.digest,
          tags: parsed.tags || [],
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse AI response as JSON", error);
    }

    // 如果解析失败，返回原始响应
    return {
      title: fallbackTitle || "未命名",
      content: responseContent,
      tags: [],
    };
  }
}
