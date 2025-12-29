/**
 * Slides Engine v3.0 - Content Compression Skill
 *
 * 内容压缩技能：将长文本压缩为适合幻灯片展示的简洁内容
 * 使用 Writer 角色 (CHAT_FAST + COST_OPTIMIZED)
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  PageOutline,
  PageContent,
  ContentSection,
  StatContent,
  ChartContent,
} from "../checkpoint/checkpoint.types";

/**
 * 内容压缩输入
 */
export interface ContentCompressionInput {
  /** 页面大纲 */
  pageOutline: PageOutline;
  /** 源文本内容 */
  sourceText: string;
  /** 最大字数限制 */
  maxCharacters?: number;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 内容压缩结果
 */
export interface ContentCompressionResult {
  /** 压缩后的页面内容 */
  pageContent: PageContent;
  /** 原始字数 */
  originalLength: number;
  /** 压缩后字数 */
  compressedLength: number;
  /** 压缩比 */
  compressionRatio: number;
}

/**
 * 内容压缩系统提示词
 */
const CONTENT_COMPRESSION_SYSTEM_PROMPT = `你是一位专业的内容编辑，擅长将长篇内容压缩为适合 PPT 展示的简洁文案。

## 压缩原则

1. **保留核心信息**：提取最重要的观点和数据
2. **简洁有力**：每个要点控制在 20-50 字
3. **层次清晰**：使用标题、要点、数据形成层次
4. **数据驱动**：突出关键数字和百分比
5. **动作导向**：使用主动语态，避免冗长修饰

## 输出格式

严格按照以下 JSON 格式输出：

\`\`\`json
{
  "title": "页面主标题",
  "subtitle": "副标题（可选）",
  "sections": [
    {
      "type": "text",
      "position": "left",
      "content": "简洁的文字内容"
    },
    {
      "type": "list",
      "position": "right",
      "content": ["要点1", "要点2", "要点3"]
    },
    {
      "type": "stat",
      "position": "center",
      "content": {
        "value": "86%",
        "label": "市场份额",
        "trend": "up",
        "change": "+5%"
      }
    },
    {
      "type": "quote",
      "position": "full",
      "content": "重要引用内容"
    },
    {
      "type": "chart",
      "position": "right",
      "content": {
        "type": "bar",
        "data": [{"name": "A", "value": 100}],
        "title": "图表标题"
      }
    }
  ],
  "footer": "脚注信息（可选）",
  "citations": ["来源1", "来源2"]
}
\`\`\`

## Section 类型说明

- **text**: 纯文本段落，适合简短说明
- **list**: 列表项，适合多个并列要点
- **stat**: 统计数据，适合突出关键指标
- **quote**: 引用，适合重要语录
- **chart**: 图表，适合数据可视化
- **image**: 图片占位，适合需要配图的位置

## 压缩技巧

1. 删除重复信息和过渡语句
2. 将长句拆分为短句或要点
3. 用数字替代模糊描述
4. 保留专有名词和关键术语
5. 每页内容控制在 150-300 字`;

@Injectable()
export class ContentCompressionSkill {
  private readonly logger = new Logger(ContentCompressionSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行内容压缩
   */
  async execute(
    input: ContentCompressionInput,
  ): Promise<ContentCompressionResult> {
    const { pageOutline, sourceText, sessionId } = input;
    const maxChars = input.maxCharacters ?? 300;

    this.logger.log(
      `[execute] Compressing content for page ${pageOutline.pageNumber}, source length: ${sourceText.length}, max: ${maxChars}`,
    );

    // Ensure maxCharacters is set for buildUserMessage
    const inputWithDefaults = { ...input, maxCharacters: maxChars };
    const userMessage = this.buildUserMessage(inputWithDefaults);

    const roleCall: RoleCallInput = {
      role: "writer",
      messages: [
        { role: "system", content: CONTENT_COMPRESSION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.5,
      metadata: {
        sessionId,
        pageNumber: pageOutline.pageNumber,
        phase: "content_compression",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      throw new Error(`Content compression failed: ${result.error}`);
    }

    const pageContent = this.parseResponse(result.content, pageOutline);
    const compressedLength = this.calculateContentLength(pageContent);

    this.logger.log(
      `[execute] Content compressed: ${sourceText.length} -> ${compressedLength} chars (${((compressedLength / sourceText.length) * 100).toFixed(1)}%)`,
    );

    return {
      pageContent,
      originalLength: sourceText.length,
      compressedLength,
      compressionRatio: compressedLength / sourceText.length,
    };
  }

  /**
   * 批量压缩多页内容
   */
  async executeBatch(
    inputs: ContentCompressionInput[],
  ): Promise<Map<number, ContentCompressionResult>> {
    const results = new Map<number, ContentCompressionResult>();

    // 并行处理（限制并发数）
    const concurrencyLimit = 3;
    const batches: ContentCompressionInput[][] = [];

    for (let i = 0; i < inputs.length; i += concurrencyLimit) {
      batches.push(inputs.slice(i, i + concurrencyLimit));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (input) => {
          try {
            const result = await this.execute(input);
            return { pageNumber: input.pageOutline.pageNumber, result };
          } catch (error) {
            this.logger.error(
              `[executeBatch] Failed for page ${input.pageOutline.pageNumber}:`,
              error,
            );
            return {
              pageNumber: input.pageOutline.pageNumber,
              result: this.createFallbackResult(input),
            };
          }
        }),
      );

      for (const { pageNumber, result } of batchResults) {
        results.set(pageNumber, result);
      }
    }

    return results;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: ContentCompressionInput): string {
    const { pageOutline, sourceText, maxCharacters } = input;

    return `## 页面信息

### 页码
${pageOutline.pageNumber}

### 页面类型
${pageOutline.templateType}

### 标题
${pageOutline.title}

### 副标题
${pageOutline.subtitle || "无"}

### 内容简述
${pageOutline.contentBrief}

### 关键元素
${pageOutline.keyElements.map((e) => `- ${e}`).join("\n")}

## 源文本内容

${sourceText}

## 要求

1. 将上述内容压缩为适合 PPT 展示的简洁文案
2. 总字数控制在 ${maxCharacters} 字以内
3. 保留所有关键数据和核心观点
4. 输出 JSON 格式的 PageContent`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    pageOutline: PageOutline,
  ): PageContent {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.normalizePageContent(parsed, pageOutline);
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return this.createFallbackContent(pageOutline);
    }
  }

  /**
   * 规范化页面内容
   */
  private normalizePageContent(
    parsed: Record<string, unknown>,
    pageOutline: PageOutline,
  ): PageContent {
    return {
      title: String(parsed.title || pageOutline.title),
      subtitle: parsed.subtitle
        ? String(parsed.subtitle)
        : pageOutline.subtitle,
      sections: this.normalizeSections(parsed.sections),
      footer: parsed.footer ? String(parsed.footer) : undefined,
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.map(String)
        : undefined,
    };
  }

  /**
   * 规范化内容区块
   */
  private normalizeSections(raw: unknown): ContentSection[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((section: Record<string, unknown>) => ({
      type: this.validateSectionType(section.type),
      position: this.validatePosition(section.position),
      content: this.normalizeContent(section.content, section.type as string),
    }));
  }

  /**
   * 验证区块类型
   */
  private validateSectionType(type: unknown): ContentSection["type"] {
    const validTypes: ContentSection["type"][] = [
      "text",
      "list",
      "quote",
      "stat",
      "chart",
      "image",
    ];

    if (
      typeof type === "string" &&
      validTypes.includes(type as ContentSection["type"])
    ) {
      return type as ContentSection["type"];
    }

    return "text";
  }

  /**
   * 验证位置
   */
  private validatePosition(position: unknown): ContentSection["position"] {
    const validPositions: ContentSection["position"][] = [
      "left",
      "right",
      "center",
      "full",
    ];

    if (
      typeof position === "string" &&
      validPositions.includes(position as ContentSection["position"])
    ) {
      return position as ContentSection["position"];
    }

    return "left";
  }

  /**
   * 规范化内容
   */
  private normalizeContent(
    content: unknown,
    type: string,
  ): string | string[] | StatContent | ChartContent {
    switch (type) {
      case "list":
        if (Array.isArray(content)) {
          return content.map(String);
        }
        return typeof content === "string" ? [content] : [];

      case "stat":
        if (typeof content === "object" && content !== null) {
          const stat = content as Record<string, unknown>;
          return {
            value: String(stat.value || "0"),
            label: String(stat.label || ""),
            trend: (stat.trend as StatContent["trend"]) || undefined,
            change: stat.change ? String(stat.change) : undefined,
          };
        }
        return { value: "0", label: "" };

      case "chart":
        if (typeof content === "object" && content !== null) {
          const chart = content as Record<string, unknown>;
          return {
            type: (chart.type as ChartContent["type"]) || "bar",
            data: Array.isArray(chart.data)
              ? (chart.data as Record<string, number | string>[])
              : [],
            title: chart.title ? String(chart.title) : undefined,
          };
        }
        return { type: "bar", data: [] };

      default:
        return typeof content === "string" ? content : String(content || "");
    }
  }

  /**
   * 计算内容长度
   */
  private calculateContentLength(pageContent: PageContent): number {
    let length =
      (pageContent.title?.length || 0) + (pageContent.subtitle?.length || 0);

    for (const section of pageContent.sections) {
      if (typeof section.content === "string") {
        length += section.content.length;
      } else if (Array.isArray(section.content)) {
        length += section.content.join("").length;
      } else if ("value" in section.content && "label" in section.content) {
        length += section.content.value.length + section.content.label.length;
      }
    }

    return length;
  }

  /**
   * 创建降级内容
   */
  private createFallbackContent(pageOutline: PageOutline): PageContent {
    return {
      title: pageOutline.title,
      subtitle: pageOutline.subtitle,
      sections: pageOutline.keyElements.map((element, index) => ({
        type: "text" as const,
        position: (index % 2 === 0
          ? "left"
          : "right") as ContentSection["position"],
        content: element,
      })),
    };
  }

  /**
   * 创建降级结果
   */
  private createFallbackResult(
    input: ContentCompressionInput,
  ): ContentCompressionResult {
    const pageContent = this.createFallbackContent(input.pageOutline);
    const compressedLength = this.calculateContentLength(pageContent);

    return {
      pageContent,
      originalLength: input.sourceText.length,
      compressedLength,
      compressionRatio: compressedLength / input.sourceText.length,
    };
  }
}
