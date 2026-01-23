import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "../../../ai-engine/facade/ai-engine.facade";
import { SocialContentType, AIModelType } from "@prisma/client";

export interface TransformInput {
  sourceContent: string;
  sourceTitle?: string;
  /** 原文内容（英文或原始语言） */
  originalContent?: string;
  /** 翻译内容（中文） */
  translatedContent?: string;
  /** 是否为双语内容 */
  isBilingual?: boolean;
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

  constructor(private readonly aiFacade: AIEngineFacade) {}

  async transform(input: TransformInput): Promise<TransformOutput> {
    this.logger.log(
      `Transforming content to ${input.targetType}, isBilingual=${input.isBilingual}`,
    );

    const prompt = this.buildPrompt(input);

    const response = await this.aiFacade.chat({
      messages: [
        {
          role: "system",
          content: this.getSystemPrompt(input.targetType, input.isBilingual),
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

  private getSystemPrompt(
    targetType: SocialContentType,
    isBilingual?: boolean,
  ): string {
    // 双语输出的通用样式说明
    const bilingualStyleGuide = isBilingual
      ? `

## 【重要】双语输出格式要求：

由于原始内容包含英文原文，请在文章中采用 **中英双语对照** 格式：先是一段中文，紧接着对应的一段英文。

### 双语段落格式（必须严格遵循）：

每个段落按以下格式输出，先中文后英文：

<div style="margin: 1.5em 0; padding: 20px; background: #fafbfc; border-radius: 10px; border: 1px solid #e8eaed;">
  <p style="margin: 0 0 15px 0; line-height: 1.9; font-size: 16px; color: #1a1a1a;">
    这里是中文内容，一段完整的中文表达。
  </p>
  <p style="margin: 0; line-height: 1.8; font-size: 15px; color: #5f6368; font-style: italic; padding-top: 12px; border-top: 1px dashed #dadce0;">
    This is the English content, a complete English expression.
  </p>
</div>

### 双语小标题格式：

<h3 style="margin: 2em 0 1em; font-size: 18px; font-weight: bold; color: #1a1a1a; border-bottom: 2px solid #4285f4; padding-bottom: 8px;">
  中文标题
  <br><span style="font-size: 14px; color: #5f6368; font-weight: normal; font-style: italic;">English Title</span>
</h3>

### 双语要点格式：

<div style="margin: 1.2em 0; padding: 15px 18px; background: linear-gradient(135deg, #e8f0fe 0%, #f8f9fa 100%); border-radius: 8px; border-left: 4px solid #4285f4;">
  <p style="margin: 0 0 10px 0; font-size: 16px; color: #1a1a1a;"><strong>📌 中文要点内容</strong></p>
  <p style="margin: 0; font-size: 14px; color: #5f6368; font-style: italic;">📌 Key point in English</p>
</div>

### 双语引用格式：

<blockquote style="margin: 1.5em 0; padding: 18px 22px; background: #f8f9fa; border-left: 4px solid #fbbc04; border-radius: 0 8px 8px 0;">
  <p style="margin: 0 0 12px 0; font-size: 16px; color: #1a1a1a; line-height: 1.8;">"中文引用内容"</p>
  <p style="margin: 0; font-size: 14px; color: #5f6368; font-style: italic; line-height: 1.7;">"English quote content"</p>
</blockquote>

### 格式要求：
1. **先中文后英文**：每个段落、要点、引用都是先写中文，紧接着写英文
2. 中文字号 16px，英文字号 14-15px，英文用斜体和灰色区分
3. 使用虚线或实线分隔中英文部分
4. 关键术语在中文中用括号标注英文，如：人工智能（Artificial Intelligence）
5. 整体布局美观专业，使用圆角卡片和微妙的背景色
`
      : "";

    switch (targetType) {
      case SocialContentType.WECHAT_ARTICLE:
        return `你是一位专业的微信公众号文章编辑。你的任务是将提供的内容转换为适合微信公众号的文章格式。

## 文章结构要求（参考"AI寒武纪"公众号风格）：

### 1. 开头部分
- 关注引导语（可选）：如 "↑阅读之前记得关注+星标⭐️"
- 2-4段摘要：用简洁有力的语言概括全文核心观点，让读者快速了解文章价值

### 2. 正文部分
- 使用 **h3 小标题** 划分章节（如："AI 的指数级增长：新时代的摩尔定律"）
- 每个章节下设置 **粗体要点**（如："智能领域的摩尔定律"），后接详细解释
- 章节之间使用分隔线
- 保持逻辑清晰，层层递进

### 3. 结尾部分
- 简洁的结束语（如 "--end--"）
${bilingualStyleGuide}
## HTML 样式规范（必须使用内联样式）：

- 段落: <p style="margin: 1em 0; line-height: 2; font-size: 16px; color: #333;">内容</p>
- 摘要段落: <p style="margin: 1em 0; line-height: 2; font-size: 16px; color: #333; text-indent: 0;">摘要内容</p>
- 小标题: <h3 style="margin: 1.8em 0 1em; font-size: 18px; font-weight: bold; color: #333;">章节标题</h3>
- 粗体要点: <p style="margin: 1em 0; line-height: 2; font-size: 16px;"><strong style="color: #333;">要点标题</strong></p>
- 分隔线: <hr style="margin: 2em 0; border: none; border-top: 1px solid #eee;">
- 引用块: <blockquote style="margin: 1em 0; padding: 15px 20px; background: #f9f9f9; border-left: 4px solid #ddd; color: #666;">引用内容</blockquote>
- 结束语: <p style="text-align: center; margin: 2em 0; color: #999;">--end--</p>

## 字数要求：
- 正文内容必须在 1500-5000 字之间
- 内容要充实、有深度，不能过于简短
- 每个章节至少 200 字以上

## 其他要求：
1. 标题要有吸引力，可以用冒号分隔主副标题，控制在35字以内
2. 生成3-5个相关标签
3. 生成一段120字以内的摘要（概括文章核心观点）

请以JSON格式返回，包含以下字段：
- title: 文章标题（纯文本）
- content: 正文内容（带内联样式的HTML，不要包含<html><body>等外层标签）
- digest: 摘要（纯文本）
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
${isBilingual ? "\n8. 如果原文是英文，关键术语保留中英对照，如：人工智能 AI\n" : ""}
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
`;

    // 如果有双语内容，分别提供原文和翻译
    if (input.isBilingual && input.originalContent && input.translatedContent) {
      prompt += `
【重要提示】此内容为双语素材，请按照双语格式要求输出中英对照内容。

=== 英文原文 (English Original) ===
${input.originalContent}

=== 中文翻译 (Chinese Translation) ===
${input.translatedContent}
`;
    } else if (input.originalContent && !input.translatedContent) {
      // 只有原文，没有翻译
      prompt += `
【提示】以下为英文原文，请在输出时保留关键术语的英文原文。

原始内容（英文）：
${input.originalContent}
`;
    } else {
      // 普通内容
      prompt += `
原始内容：
${input.sourceContent}`;
    }

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
