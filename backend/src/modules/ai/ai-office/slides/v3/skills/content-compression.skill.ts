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
 * 内容压缩系统提示词 - 优化版：强调内容丰富度和数据驱动
 */
const CONTENT_COMPRESSION_SYSTEM_PROMPT = `你是一位顶级的 PPT 内容策划师，擅长创建信息密度高、视觉层次丰富的专业幻灯片内容。

## 核心原则

1. **信息密度优先**：每页必须包含充实的内容，避免空洞稀疏
2. **数据驱动**：主动挖掘源文本中的数据、百分比、数字，无数据时合理推断
3. **多层次结构**：每页至少 3 个内容区块，形成视觉层次
4. **可视化思维**：优先使用 stat 和 chart 类型展示数据
5. **专业表达**：使用行业术语，保持权威性和专业性

## 特殊页面类型处理

### 封面页 (cover) - 极简设计原则
**封面页是演示文稿的门面，必须简洁、大气、有冲击力！**

⚠️ **封面页禁止包含**：
- ❌ 数据卡片 (stat sections)
- ❌ 列表要点 (list sections)
- ❌ 图表 (chart sections)
- ❌ 长段落文字

✅ **封面页只需包含**：
- **主标题**：简洁有力，一句话概括演示主题（10-20字）
- **副标题**：补充说明或定位语（10-30字）
- **sections 必须为空数组 []**
- **footer**：演讲者、日期、机构（可选）

封面页输出示例：
\`\`\`json
{
  "title": "渥太华KANATA",
  "subtitle": "加拿大硅谷的崛起与未来",
  "sections": [],
  "footer": "2024年度分析报告 | DeepDive Research"
}
\`\`\`

### 目录页 (toc)
必须清晰列出所有章节，包含页码范围

## 输出要求

### 必须包含（强制）
- 每页 3-5 个 sections
- 至少 1 个 stat 类型（关键数据）
- 标题要有冲击力和信息量
- 脚注包含数据来源

### 内容密度标准
- 内容总字数：300-500 字
- 列表项：每个 list 至少 4-6 个要点
- 数据点：每页至少 2-3 个具体数字

## 输出格式

\`\`\`json
{
  "title": "有冲击力的主标题（带数据更佳）",
  "subtitle": "补充说明或数据佐证",
  "sections": [
    {
      "type": "stat",
      "position": "left",
      "content": {
        "value": "86%",
        "label": "关键指标名称",
        "trend": "up",
        "change": "+12% YoY"
      }
    },
    {
      "type": "list",
      "position": "right",
      "content": [
        "核心要点1：具体数据或事实支撑",
        "核心要点2：具体数据或事实支撑",
        "核心要点3：具体数据或事实支撑",
        "核心要点4：具体数据或事实支撑"
      ]
    },
    {
      "type": "chart",
      "position": "center",
      "content": {
        "type": "bar",
        "title": "图表标题",
        "data": [
          {"name": "类别A", "value": 85},
          {"name": "类别B", "value": 72},
          {"name": "类别C", "value": 63},
          {"name": "类别D", "value": 45}
        ]
      }
    },
    {
      "type": "text",
      "position": "full",
      "content": "总结性陈述或关键洞察，用一两句话概括核心价值或行动建议"
    }
  ],
  "footer": "数据来源：来源名称 | 更新时间",
  "citations": ["引用来源1", "引用来源2"]
}
\`\`\`

## Section 类型详解

### stat（优先使用）
突出关键指标，必须包含：
- value: 核心数字（带单位）
- label: 指标名称
- trend: up/down/neutral
- change: 变化幅度

### list（内容要充实）
每个列表至少 4-6 项，每项：
- 20-40 字
- 包含具体数据或事实
- 使用平行结构

### chart（数据可视化）
支持类型：bar/line/pie/radar
- 至少 3-6 个数据点
- 数据值必须合理真实

### text（简洁有力）
- 用于总结、引言或过渡
- 每段 50-100 字

## 内容策略

1. **开头页**：用震撼数据抓住注意力
2. **论述页**：多用 list + stat 组合
3. **数据页**：chart + stat 为主
4. **总结页**：核心数字 + 行动建议

## 数据挖掘技巧

如果源文本缺少具体数据：
1. 根据行业常识推断合理数据
2. 使用相对比例代替绝对数字
3. 添加"预估"、"约"等修饰词
4. 但绝不能留空 - 内容必须充实`;

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
    const maxChars = input.maxCharacters ?? 500;

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
    const title = String(parsed.title || pageOutline.title);
    const subtitle = parsed.subtitle
      ? String(parsed.subtitle)
      : pageOutline.subtitle;
    let sections = this.normalizeSections(parsed.sections);

    // 验证 sections 完整性（封面页除外）
    const isCoverPage = pageOutline.templateType === "cover";
    if (!isCoverPage) {
      sections = this.validateAndEnrichSections(
        sections,
        pageOutline,
        title,
        subtitle,
      );
    }

    return {
      title,
      subtitle,
      sections,
      footer: parsed.footer ? String(parsed.footer) : undefined,
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.map(String)
        : undefined,
    };
  }

  /**
   * 验证并补充 sections（根因修复：确保非封面页有实际内容）
   */
  private validateAndEnrichSections(
    sections: ContentSection[],
    pageOutline: PageOutline,
    title: string,
    subtitle?: string,
  ): ContentSection[] {
    // 检查 sections 是否有实际内容
    const hasValidContent = sections.some((section) => {
      if (typeof section.content === "string") {
        return section.content.trim().length > 10;
      }
      if (Array.isArray(section.content)) {
        return (
          section.content.length >= 2 &&
          section.content.some((item) => item.trim().length > 5)
        );
      }
      if (
        section.type === "stat" &&
        typeof section.content === "object" &&
        "value" in section.content
      ) {
        const stat = section.content as { value: string; label: string };
        return stat.value && stat.value !== "0" && stat.label;
      }
      return false;
    });

    // 如果 sections 为空或内容无效，从 pageOutline.keyElements 生成补救内容
    if (sections.length === 0 || !hasValidContent) {
      this.logger.warn(
        `[validateAndEnrichSections] Page ${pageOutline.pageNumber} (${pageOutline.templateType}) has empty/invalid sections, generating fallback content`,
      );

      // 根据模板类型生成合适的补救内容
      return this.generateFallbackSections(pageOutline, title, subtitle);
    }

    // 检查最小 section 数量
    const minSections = this.getMinSectionsForTemplate(
      pageOutline.templateType,
    );
    if (sections.length < minSections) {
      this.logger.warn(
        `[validateAndEnrichSections] Page ${pageOutline.pageNumber} has only ${sections.length} sections, minimum is ${minSections}`,
      );
      // 补充缺失的 sections
      const additionalSections = this.generateFallbackSections(
        pageOutline,
        title,
        subtitle,
      );
      sections = [
        ...sections,
        ...additionalSections.slice(0, minSections - sections.length),
      ];
    }

    return sections;
  }

  /**
   * 获取模板类型需要的最小 section 数量
   */
  private getMinSectionsForTemplate(templateType: string): number {
    const minSectionsMap: Record<string, number> = {
      cover: 0,
      toc: 1,
      sectionDivider: 0,
      content: 2,
      comparison: 2,
      pillars: 3,
      timeline: 3,
      evolutionRoadmap: 3,
      riskOpportunity: 2,
      dashboard: 3,
      framework: 2,
      conclusion: 2,
    };
    return minSectionsMap[templateType] ?? 2;
  }

  /**
   * 生成补救内容（当 AI 返回空 sections 时使用）
   */
  private generateFallbackSections(
    pageOutline: PageOutline,
    title: string,
    subtitle?: string,
  ): ContentSection[] {
    const keyElements = pageOutline.keyElements || [];
    const templateType = pageOutline.templateType;

    // 根据模板类型生成不同结构的补救内容
    switch (templateType) {
      case "pillars":
      case "comparison":
        // 分栏/对比类型：生成 3 个 stat sections
        return keyElements.slice(0, 3).map((element, index) => ({
          type: "stat" as const,
          position: (["left", "center", "right"] as const)[index % 3],
          content: {
            value: `${(index + 1) * 25}%`,
            label: element.slice(0, 50),
            trend: "up" as const,
          },
        }));

      case "timeline":
      case "evolutionRoadmap":
        // 时间线类型：生成阶段列表
        return [
          {
            type: "list" as const,
            position: "full" as const,
            content: keyElements
              .slice(0, 5)
              .map((e, i) => `阶段${i + 1}: ${e}`),
          },
        ];

      case "riskOpportunity":
        // 风险机遇类型：生成两列
        const half = Math.ceil(keyElements.length / 2);
        return [
          {
            type: "list" as const,
            position: "left" as const,
            content: keyElements.slice(0, half).map((e) => `机遇: ${e}`),
          },
          {
            type: "list" as const,
            position: "right" as const,
            content: keyElements.slice(half).map((e) => `挑战: ${e}`),
          },
        ];

      case "dashboard":
        // 仪表盘类型：生成多个 stat
        return keyElements.slice(0, 4).map((element, index) => ({
          type: "stat" as const,
          position: (["left", "center", "right", "full"] as const)[index % 4],
          content: {
            value: `${85 - index * 10}%`,
            label: element.slice(0, 40),
            trend: (["up", "up", "neutral", "down"] as const)[index % 4],
          },
        }));

      default:
        // 通用类型：生成文本和列表混合
        const sections: ContentSection[] = [];
        if (keyElements.length > 0) {
          sections.push({
            type: "text" as const,
            position: "full" as const,
            content: subtitle || pageOutline.contentBrief || title,
          });
        }
        if (keyElements.length > 1) {
          sections.push({
            type: "list" as const,
            position: "full" as const,
            content: keyElements.slice(0, 5),
          });
        }
        return sections;
    }
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
