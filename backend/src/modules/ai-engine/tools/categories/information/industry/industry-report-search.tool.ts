/**
 * Industry Report Search Tool
 * 行业报告搜索工具 - 在 a16z / McKinsey / SemiAnalysis 等管理员配置的行业报告源
 * 中检索内容。
 *
 * 来源清单从 DB tool_configs.config.sources 读取（管理员可配置 enabled 域名 +
 * credibility 评分），实际检索通过 web-search 工具加 site: 前缀完成。
 *
 * 历史背景：原本只有 TI 内部的 IndustryReportSearchAdapter 可用此能力，
 * playground researcher 无法调用。本工具把适配器逻辑沉淀到 ai-engine/tools，
 * 让所有 BaseAgent（含 playground）的 toolRegistry 都能召回到。
 */

import { Injectable, Logger } from "@nestjs/common";
import { getToolIdAliases } from "@/common/ai/tool-id-aliases";
import { BaseTool } from "../../../base/base-tool";
import { ToolRegistry } from "../../../registry/tool.registry";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";
import { PrismaService } from "@/common/prisma/prisma.service";

// ============================================================================
// Types
// ============================================================================

export interface IndustryReportSearchInput {
  /** 搜索查询 */
  query: string;
  /** 最大结果数，默认 10 */
  maxResults?: number;
  /** 主题类型过滤（technology / finance / energy / 等），按 source.topicTypes 收窄 */
  topicType?: string;
}

export interface IndustryReportItem {
  /** 标题 */
  title: string;
  /** URL */
  url: string;
  /** 摘要 */
  snippet: string;
  /** 发布日期 */
  publishedDate?: string;
  /** 命中的来源名称（如 "a16z" / "McKinsey"） */
  source: string;
  /** 来源域名 */
  domain: string;
  /** 信誉评分（0-1） */
  credibilityScore: number;
}

export interface IndustryReportSearchOutput {
  /** 命中条目 */
  items: IndustryReportItem[];
  /** 实际检索的来源数（去重） */
  sourcesQueried: number;
  /** 是否成功 */
  success: boolean;
  /** 失败原因 */
  error?: string;
}

interface IndustryReportSourceConfig {
  id: string;
  name: string;
  domain: string;
  category: string;
  credibilityScore: number;
  enabled: boolean;
  topicTypes: string[];
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class IndustryReportSearchTool extends BaseTool<
  IndustryReportSearchInput,
  IndustryReportSearchOutput
> {
  private readonly logger = new Logger(IndustryReportSearchTool.name);
  private cachedSources: IndustryReportSourceConfig[] | null = null;
  private cacheExpiry = 0;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  readonly id = "industry-report-search";
  readonly sideEffect = "none" as const;
  readonly name = "Industry Report Search";
  readonly description =
    "在精选行业研报源（如 a16z / McKinsey / BCG / SemiAnalysis / Brookings 等）检索行业洞察与趋势报告。来源清单与信誉评分由管理员在 tool_configs 中配置。适合商业 / 战略 / 行业分析 / 趋势研究类维度。";
  readonly category: ToolCategory = "information";
  readonly tags = ["industry", "report", "research", "analyst", "business"];
  readonly defaultTimeout = 20000;

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，例如 'AI infrastructure'、'GPU shortage'。",
      },
      maxResults: {
        type: "number",
        description: "最大结果数，默认 10",
        default: 10,
      },
      topicType: {
        type: "string",
        description:
          "主题类型，按来源 topicTypes 字段过滤（如 'technology' / 'finance' / 'energy'），可选。",
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
            publishedDate: { type: "string" },
            source: { type: "string" },
            domain: { type: "string" },
            credibilityScore: { type: "number" },
          },
        },
      },
      sourcesQueried: { type: "number" },
      error: { type: "string" },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistry,
  ) {
    super();
  }

  protected async doExecute(
    input: IndustryReportSearchInput,
    context: ToolContext,
  ): Promise<IndustryReportSearchOutput> {
    const { query, maxResults = 10, topicType } = input;

    try {
      const sources = await this.getEnabledSources(topicType);
      if (sources.length === 0) {
        return {
          success: false,
          items: [],
          sourcesQueried: 0,
          error:
            "No enabled industry report sources configured. 管理员需在 tool_configs.industry-report.config.sources 配置启用源。",
        };
      }

      // 取前 5 个域名拼 site: query（避免 query 过长）
      const top5 = sources.slice(0, 5);
      const siteFilter = top5.map((s) => `site:${s.domain}`).join(" OR ");
      const siteQuery = `(${siteFilter}) ${query}`;

      const webSearchTool = this.toolRegistry.tryGet("web-search");
      if (!webSearchTool) {
        return {
          success: false,
          items: [],
          sourcesQueried: top5.length,
          error:
            "web-search tool not registered (required by industry-report-search).",
        };
      }

      const result = await webSearchTool.execute(
        { query: siteQuery, numResults: maxResults },
        context,
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          items: [],
          sourcesQueried: top5.length,
          error: result.error?.message ?? "web-search returned no data",
        };
      }

      const data = result.data as {
        results?: Array<{
          title: string;
          url: string;
          content?: string;
          publishedDate?: string;
        }>;
      };
      const rawResults = data.results ?? [];

      // 域名 → source 元数据查表
      const credibilityByDomain = new Map<string, number>();
      const nameByDomain = new Map<string, string>();
      for (const s of sources) {
        credibilityByDomain.set(s.domain, s.credibilityScore);
        nameByDomain.set(s.domain, s.name);
      }

      const items: IndustryReportItem[] = rawResults.map((r) => {
        let matchedCredibility = 0.7;
        let matchedSource = "Industry Report";
        let matchedDomain = "";
        try {
          matchedDomain = new URL(r.url).hostname.replace(/^www\./, "");
          for (const [domain, score] of credibilityByDomain) {
            if (
              matchedDomain.includes(domain) ||
              domain.includes(matchedDomain)
            ) {
              matchedCredibility = score;
              matchedSource = nameByDomain.get(domain) ?? matchedSource;
              break;
            }
          }
        } catch {
          // URL 解析失败 → 用默认值
        }
        return {
          title: r.title ?? "",
          url: r.url,
          snippet: r.content ?? "",
          publishedDate: r.publishedDate,
          source: matchedSource,
          domain: matchedDomain,
          credibilityScore: matchedCredibility,
        };
      });

      this.logger.log(
        `[doExecute] industry-report-search: ${items.length} items across ${top5.length} curated sources`,
      );

      return {
        success: true,
        items,
        sourcesQueried: top5.length,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[doExecute] industry-report-search failed: ${errMsg}`);
      return {
        success: false,
        items: [],
        sourcesQueried: 0,
        error: `Industry Report 搜索失败: ${errMsg}`,
      };
    }
  }

  private async getEnabledSources(
    topicType?: string,
  ): Promise<IndustryReportSourceConfig[]> {
    if (this.cachedSources && Date.now() < this.cacheExpiry) {
      const enabled = this.cachedSources.filter((s) => s.enabled);
      return topicType
        ? enabled.filter((s) => s.topicTypes.includes(topicType))
        : enabled;
    }

    try {
      this.cachedSources = await this.loadConfiguredSources();
    } catch (err) {
      this.logger.warn(
        `Failed to load industry-report sources: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.cachedSources = [];
    }
    this.cacheExpiry = Date.now() + IndustryReportSearchTool.CACHE_TTL_MS;
    const enabled = this.cachedSources.filter((s) => s.enabled);
    return topicType
      ? enabled.filter((s) => s.topicTypes.includes(topicType))
      : enabled;
  }

  private async loadConfiguredSources(): Promise<IndustryReportSourceConfig[]> {
    for (const toolId of getToolIdAliases(this.id)) {
      const cfg = await this.prisma.toolConfig.findUnique({
        where: { toolId },
      });
      const config = cfg?.config as
        | { sources?: IndustryReportSourceConfig[] }
        | undefined
        | null;
      const sources = config?.sources ?? [];

      if (sources.length > 0) {
        return sources;
      }
    }

    return [];
  }
}
