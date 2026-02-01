import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import {
  DataSourceType,
  DataSourcePlanInput,
  DataSourcePlan,
  DataSourceCapability,
} from "../../types/data-source.types";
import { AICapabilityResolver } from "@/modules/ai-engine/capabilities/ai-capability-resolver.service";

/**
 * DataSourcePlannerService
 *
 * AI 驱动的数据源规划服务，根据研究维度自动推荐最合适的数据源组合
 *
 * 核心功能：
 * 1. 分析维度描述，理解研究需求
 * 2. 根据可用数据源能力推荐最佳组合
 * 3. 提供推荐理由，支持用户覆盖
 * 4. 动态调整搜索策略
 */
@Injectable()
export class DataSourcePlannerService {
  private readonly logger = new Logger(DataSourcePlannerService.name);

  /**
   * 数据源能力描述表
   * 用于让 AI 理解每个数据源的能力和适用场景
   */
  private readonly DATA_SOURCE_CAPABILITIES: DataSourceCapability[] = [
    {
      type: DataSourceType.WEB,
      displayName: "Web Search",
      description: "通用网络搜索，覆盖新闻、博客、企业网站等广泛内容",
      useCases: ["市场分析", "行业新闻", "企业信息", "产品评测", "用户评论"],
      characteristics: ["覆盖面广", "时效性好", "内容多样", "权威性参差不齐"],
      requiresApiKey: true,
      isAvailable: true,
    },
    {
      type: DataSourceType.ACADEMIC,
      displayName: "Academic (arXiv)",
      description:
        "arXiv 学术预印本搜索，涵盖 AI、物理、数学、计算机科学等领域",
      useCases: [
        "前沿技术研究",
        "算法原理",
        "学术论文引用",
        "理论基础",
        "技术趋势",
      ],
      characteristics: ["学术权威", "技术深度", "引用可追溯", "偏理论性"],
      requiresApiKey: false,
      isAvailable: true,
    },
    {
      type: DataSourceType.GITHUB,
      displayName: "GitHub Search",
      description: "GitHub 开源仓库搜索，获取开源项目、代码实现、技术栈信息",
      useCases: [
        "技术实现",
        "开源生态",
        "代码参考",
        "项目活跃度",
        "技术栈分析",
      ],
      characteristics: ["实践导向", "代码级细节", "社区活跃度", "技术趋势"],
      requiresApiKey: false, // 可选，但推荐
      isAvailable: true,
    },
    {
      type: DataSourceType.HACKERNEWS,
      displayName: "HackerNews",
      description: "技术社区讨论，获取技术人员对新技术、产品、事件的看法",
      useCases: ["技术讨论", "社区观点", "产品反馈", "行业事件", "技术争议"],
      characteristics: ["技术社区视角", "讨论深入", "观点多元", "时效性强"],
      requiresApiKey: false,
      isAvailable: true,
    },
    {
      type: DataSourceType.FEDERAL_REGISTER,
      displayName: "Federal Register",
      description: "美国联邦公报，包含行政命令、法规、拟议规则、机构通知",
      useCases: ["政策法规", "行政命令", "监管动态", "政府公告", "合规要求"],
      characteristics: ["官方权威", "法规原文", "政策导向", "美国联邦层面"],
      requiresApiKey: false,
      isAvailable: true,
    },
    {
      type: DataSourceType.CONGRESS,
      displayName: "Congress.gov",
      description: "美国国会立法信息，包含法案、决议、投票记录",
      useCases: ["立法动态", "法案追踪", "政策变化", "两党态度", "委员会活动"],
      characteristics: ["立法权威", "法案全文", "立法进程", "美国国会层面"],
      requiresApiKey: false, // 可选
      isAvailable: true,
    },
    {
      type: DataSourceType.WHITEHOUSE,
      displayName: "White House News",
      description: "白宫新闻和声明，包含总统声明、政策公告、行政行动",
      useCases: ["政府政策", "总统声明", "行政行动", "政府优先级", "外交政策"],
      characteristics: ["最高行政权威", "政策风向", "时效性强", "美国行政层面"],
      requiresApiKey: false,
      isAvailable: true,
    },
    {
      type: DataSourceType.RSS,
      displayName: "RSS Feeds",
      description: "RSS 订阅源搜索，基于预配置的行业媒体和博客",
      useCases: ["行业动态", "博客更新", "媒体报道", "专家观点", "定制来源"],
      characteristics: ["可定制", "持续更新", "来源可控", "需要预配置"],
      requiresApiKey: false,
      isAvailable: false, // TODO: 待实现
    },
    {
      type: DataSourceType.LOCAL,
      displayName: "Local Knowledge Base",
      description: "本地资源库搜索（RAG），搜索用户上传的文档和报告",
      useCases: [
        "内部文档",
        "历史报告",
        "私有知识",
        "已验证资料",
        "上下文补充",
      ],
      characteristics: ["私有数据", "已验证", "语义搜索", "需要预先上传"],
      requiresApiKey: false,
      isAvailable: false, // TODO: 待实现
    },
    // ★ 社媒数据源
    {
      type: DataSourceType.SOCIAL_X,
      displayName: "X/Twitter",
      description: "X/Twitter 社媒热点搜索，获取实时社交媒体讨论和舆情",
      useCases: [
        "舆情监测",
        "社会热点",
        "用户反馈",
        "品牌声誉",
        "实时事件",
        "KOL观点",
      ],
      characteristics: [
        "实时性强",
        "覆盖面广",
        "情绪分析",
        "影响力指标",
        "需要 Grok 模型",
      ],
      requiresApiKey: true, // 需要 xAI API 或 Web Search 作为降级
      isAvailable: true,
    },
  ];

  constructor(
    private readonly aiFacade: AIEngineFacade,
    private readonly capabilityResolver: AICapabilityResolver,
  ) {}

  /**
   * 为指定维度规划数据源
   *
   * @param input 规划输入
   * @returns 数据源规划结果
   */
  async planDataSources(input: DataSourcePlanInput): Promise<DataSourcePlan> {
    this.logger.log(
      `[planDataSources] Planning for dimension: ${input.dimensionName} (topic: ${input.topicName})`,
    );

    try {
      // 1. 获取当前可用的数据源（基于 Admin 配置）
      const availableSources = await this.getAvailableDataSources();

      // 2. 构建 AI 规划提示词
      const prompt = this.buildPlanningPrompt(input, availableSources);

      // 3. 调用 AI 进行规划
      const response = await this.aiFacade.chat({
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt(),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
      });

      // 4. 解析 AI 响应
      const plan = this.parseAIResponse(response.content, availableSources);

      this.logger.log(
        `[planDataSources] AI recommended ${plan.recommendedSources.length} sources: ${plan.recommendedSources.join(", ")}`,
      );

      return plan;
    } catch (error) {
      this.logger.error(
        `[planDataSources] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // 返回默认规划
      return this.getDefaultPlan(input);
    }
  }

  /**
   * 获取当前可用的数据源列表
   * 基于 Admin 配置和工具注册状态
   */
  private async getAvailableDataSources(): Promise<DataSourceCapability[]> {
    const availableCapabilities: DataSourceCapability[] = [];

    for (const capability of this.DATA_SOURCE_CAPABILITIES) {
      // 检查工具是否在 ToolRegistry 中注册并被 Admin 启用
      const toolId = this.dataSourceToToolId(capability.type);
      if (toolId) {
        const isEnabled = await this.isToolEnabled(toolId);
        if (isEnabled) {
          availableCapabilities.push({ ...capability, isAvailable: true });
        }
      } else if (capability.isAvailable) {
        // 没有对应工具 ID 但标记为可用的（如 LOCAL）
        availableCapabilities.push(capability);
      }
    }

    return availableCapabilities;
  }

  /**
   * 数据源类型到工具 ID 的映射
   */
  private dataSourceToToolId(source: DataSourceType): string | null {
    const mapping: Partial<Record<DataSourceType, string>> = {
      [DataSourceType.WEB]: "web-search",
      [DataSourceType.ACADEMIC]: "arxiv-search",
      [DataSourceType.GITHUB]: "github-search",
      [DataSourceType.HACKERNEWS]: "hackernews-search",
      [DataSourceType.FEDERAL_REGISTER]: "federal-register",
      [DataSourceType.CONGRESS]: "congress-gov",
      [DataSourceType.WHITEHOUSE]: "whitehouse-news",
      [DataSourceType.SOCIAL_X]: "social-x", // X/Twitter 社媒热点
    };
    return mapping[source] || null;
  }

  /**
   * 检查工具是否被 Admin 启用
   */
  private async isToolEnabled(toolId: string): Promise<boolean> {
    try {
      const availableTools = await this.capabilityResolver.resolveToolsForAgent(
        {},
      );
      return availableTools.includes(toolId);
    } catch (error) {
      this.logger.debug(
        `[isToolEnabled] Failed to check if tool ${toolId} is enabled: ${error}`,
      );
      return false;
    }
  }

  /**
   * 获取系统提示词
   */
  private getSystemPrompt(): string {
    return `你是一个专业的研究数据源规划助手。你的任务是根据研究维度的描述，推荐最适合的数据源组合。

规划原则：
1. **相关性优先**：选择与研究主题最相关的数据源
2. **覆盖全面**：确保从多个角度获取信息
3. **权威可靠**：优先选择权威性高的数据源
4. **效率平衡**：不要选择过多数据源，通常 2-4 个为宜
5. **场景匹配**：
   - 政策法规研究：优先政府官方数据源
   - 技术研究：优先学术和开源数据源
   - 市场分析：优先 Web 搜索和新闻
   - 社区观点：优先社交媒体和论坛

输出格式要求：
- 返回 JSON 格式
- 包含推荐数据源列表和理由
- 包含搜索策略建议`;
  }

  /**
   * 构建规划提示词
   */
  private buildPlanningPrompt(
    input: DataSourcePlanInput,
    availableSources: DataSourceCapability[],
  ): string {
    const sourcesDescription = availableSources
      .map(
        (s) =>
          `- **${s.type}** (${s.displayName}): ${s.description}\n  适用场景: ${s.useCases.join("、")}\n  特点: ${s.characteristics.join("、")}`,
      )
      .join("\n\n");

    return `请为以下研究维度推荐最合适的数据源组合：

## 研究信息

**主题名称**: ${input.topicName}
**主题类型**: ${input.topicType}
**维度名称**: ${input.dimensionName}
**维度描述**: ${input.dimensionDescription}
${input.searchQueries?.length ? `**预设搜索查询**: ${input.searchQueries.join("; ")}` : ""}

## 可用数据源

${sourcesDescription}

## 输出要求

请以 JSON 格式返回规划结果：

\`\`\`json
{
  "recommendedSources": ["source1", "source2"],
  "sourceRationales": {
    "source1": "选择理由...",
    "source2": "选择理由..."
  },
  "overallRationale": "整体规划说明...",
  "fallbackSources": ["fallback1"],
  "searchStrategy": {
    "suggestedMaxResults": 25,
    "needsTimeFilter": true,
    "suggestedTimeRangeDays": 180,
    "needsEnrichment": true
  },
  "confidence": 85
}
\`\`\`

注意：
1. recommendedSources 只能包含上述可用数据源的 type 值
2. 根据维度性质选择 2-4 个最相关的数据源
3. confidence 表示你对这个推荐的置信度 (0-100)`;
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(
    content: string,
    availableSources: DataSourceCapability[],
  ): DataSourcePlan {
    try {
      // 提取 JSON 块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;

      const parsed = JSON.parse(jsonStr);

      // 验证并过滤推荐的数据源
      const validSourceTypes = availableSources.map((s) => s.type);
      const recommendedSources = (parsed.recommendedSources || []).filter(
        (s: string) => validSourceTypes.includes(s as DataSourceType),
      ) as DataSourceType[];

      const fallbackSources = (parsed.fallbackSources || []).filter(
        (s: string) => validSourceTypes.includes(s as DataSourceType),
      ) as DataSourceType[];

      return {
        recommendedSources:
          recommendedSources.length > 0
            ? recommendedSources
            : [DataSourceType.WEB],
        sourceRationales: parsed.sourceRationales || {},
        overallRationale: parsed.overallRationale || "AI 自动推荐",
        fallbackSources,
        searchStrategy: {
          suggestedMaxResults: parsed.searchStrategy?.suggestedMaxResults || 25,
          needsTimeFilter: parsed.searchStrategy?.needsTimeFilter ?? true,
          suggestedTimeRangeDays:
            parsed.searchStrategy?.suggestedTimeRangeDays || 180,
          needsEnrichment: parsed.searchStrategy?.needsEnrichment ?? true,
        },
        confidence: parsed.confidence || 70,
      };
    } catch (error) {
      this.logger.warn(
        `[parseAIResponse] Failed to parse AI response, using default: ${error instanceof Error ? error.message : String(error)}`,
      );

      // 返回基于关键词的简单规划
      return this.getKeywordBasedPlan(availableSources);
    }
  }

  /**
   * 基于关键词的简单规划（当 AI 解析失败时使用）
   */
  private getKeywordBasedPlan(
    _availableSources: DataSourceCapability[],
  ): DataSourcePlan {
    return {
      recommendedSources: [DataSourceType.WEB],
      sourceRationales: {
        [DataSourceType.WEB]: "默认使用 Web 搜索作为通用数据源",
      },
      overallRationale: "AI 响应解析失败，使用默认配置",
      fallbackSources: [],
      searchStrategy: {
        suggestedMaxResults: 25,
        needsTimeFilter: true,
        suggestedTimeRangeDays: 180,
        needsEnrichment: true,
      },
      confidence: 50,
    };
  }

  /**
   * 获取默认规划（当 AI 调用失败时使用）
   */
  private getDefaultPlan(input: DataSourcePlanInput): DataSourcePlan {
    // 根据主题类型返回预设规划
    const topicType = (input.topicType || "").toUpperCase();
    const dimensionLower = (input.dimensionName || "").toLowerCase();

    let recommendedSources: DataSourceType[] = [DataSourceType.WEB];
    let rationale = "默认使用 Web 搜索";

    // 政策相关维度
    if (
      dimensionLower.includes("政策") ||
      dimensionLower.includes("法规") ||
      dimensionLower.includes("regulation") ||
      dimensionLower.includes("policy")
    ) {
      recommendedSources = [
        DataSourceType.WEB,
        DataSourceType.FEDERAL_REGISTER,
        DataSourceType.CONGRESS,
        DataSourceType.WHITEHOUSE,
      ];
      rationale = "政策相关维度，使用政府官方数据源";
    }
    // 技术相关维度
    else if (
      dimensionLower.includes("技术") ||
      dimensionLower.includes("algorithm") ||
      dimensionLower.includes("technology") ||
      topicType === "TECHNOLOGY_INSIGHT"
    ) {
      recommendedSources = [
        DataSourceType.ACADEMIC,
        DataSourceType.GITHUB,
        DataSourceType.HACKERNEWS,
        DataSourceType.WEB,
      ];
      rationale = "技术相关维度，使用学术和开源数据源";
    }
    // 市场相关维度
    else if (
      dimensionLower.includes("市场") ||
      dimensionLower.includes("投资") ||
      dimensionLower.includes("market") ||
      dimensionLower.includes("investment")
    ) {
      recommendedSources = [DataSourceType.WEB, DataSourceType.HACKERNEWS];
      rationale = "市场相关维度，使用 Web 搜索和社区讨论";
    }

    return {
      recommendedSources,
      sourceRationales: Object.fromEntries(
        recommendedSources.map((s) => [s, rationale]),
      ),
      overallRationale: `基于维度类型「${input.dimensionName}」的默认规划`,
      fallbackSources: [DataSourceType.WEB],
      searchStrategy: {
        suggestedMaxResults: 25,
        needsTimeFilter: true,
        suggestedTimeRangeDays: 180,
        needsEnrichment: true,
      },
      confidence: 60,
    };
  }

  /**
   * 获取所有数据源能力描述
   * 用于前端展示或调试
   */
  getDataSourceCapabilities(): DataSourceCapability[] {
    return this.DATA_SOURCE_CAPABILITIES;
  }
}
