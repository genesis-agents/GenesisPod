/**
 * ExploreSearchTool —— AI 前沿库检索（每日更新的高质量策展资源 → 各 agent 默认检索能力）
 *
 * 把 AI Explore 的资源目录（Resource，公共策展库，每日定时入库 + AI 富化打分）暴露为
 * ToolRegistry 'information' 类目下的检索工具，纳入 DEFAULT_RETRIEVAL_TOOL_IDS，
 * 让所有研究型 agent 在采证阶段把前沿库当作与 web-search / rag-search / radar-signal-search
 * 互补的"策展层"输入。
 *
 * 数据范围（scope）：
 *   - public（默认）：检索整个公共前沿库目录 —— 这是前沿库的核心价值（每日更新的全量策展）。
 *   - mine：只检索当前用户已收藏进自己 collection 的资源（行级隔离，
 *     collectionItems.some.collection.userId = userId）。无 userId 时返回空 + note。
 *
 * 排序：优先 trendingScore / qualityScore（策展质量信号），再按 createdAt（入库新鲜度）。
 * 隔离：mine 从 context.userId 做行级鉴权，不信任 LLM 传入的任何身份参数。
 * 空结果：success:true + 空 results + note，引导 LLM 回落 web-search（与 radar-signal-search 同款）。
 */
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BaseTool } from "@/modules/ai-harness/facade/base-classes";
import type { ToolContext, JSONSchema } from "@/modules/ai-engine/facade";
import { PrismaService } from "../../../../common/prisma/prisma.service";

export interface ExploreSearchInput {
  /** 检索查询（自然语言或关键词；内部拆词做 OR 匹配） */
  query: string;
  /** 检索范围：public=公共前沿库全量（默认）；mine=仅我收藏的资源 */
  scope?: "public" | "mine";
  /** 入库回看天数，默认 90，最大 365（前沿库强调新鲜，但策展资源价值衰减慢于雷达信号） */
  days?: number;
  /** 返回条数，默认 8，最大 20 */
  topK?: number;
}

export interface ExploreSearchItem {
  itemId: string;
  title: string;
  /** AI 摘要（入库富化），缺失时回退 abstract */
  summary: string | null;
  url: string | null;
  category: string | null;
  tags: string[];
  qualityScore: number | null;
  trendingScore: number | null;
  createdAt: string;
}

export interface ExploreSearchOutput {
  results: ExploreSearchItem[];
  success: boolean;
  totalResults: number;
  /** 成功但无结果时的说明（如"我的收藏为空"），引导 LLM 回落 web-search */
  note?: string;
  error?: string;
}

const MAX_DAYS = 365;
const DEFAULT_DAYS = 90;
const MAX_TOP_K = 20;
const DEFAULT_TOP_K = 8;

@Injectable()
export class ExploreSearchTool extends BaseTool<
  ExploreSearchInput,
  ExploreSearchOutput
> {
  private readonly logger = new Logger(ExploreSearchTool.name);
  readonly id = "explore-search";
  readonly sideEffect = "none" as const;
  readonly category = "information";
  readonly tags = ["explore", "frontier", "curated", "internal"];
  readonly name = "前沿库检索";
  readonly description =
    "检索 AI 前沿库（每日更新的高质量策展资源：论文 / 文章 / 视频，带 AI 摘要、质量与热度评分、原文链接）。适合获取某主题的优质一手资料与策展精选；默认检索公共全量库（scope=public），传 scope=mine 只查我收藏的资源。无命中时返回空结果，回落 web-search 即可。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "检索查询，关键词或短语（内部按词拆分做 OR 匹配）",
      },
      scope: {
        type: "string",
        enum: ["public", "mine"],
        description:
          "检索范围：public=公共前沿库全量（默认）；mine=仅我收藏的资源",
        default: "public",
      },
      days: {
        type: "number",
        description: `入库回看天数，默认 ${DEFAULT_DAYS}，最大 ${MAX_DAYS}`,
        default: DEFAULT_DAYS,
      },
      topK: {
        type: "number",
        description: `返回条数，默认 ${DEFAULT_TOP_K}，最大 ${MAX_TOP_K}`,
        default: DEFAULT_TOP_K,
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "命中的前沿库资源（按热度 / 质量降序）",
        items: {
          type: "object",
          properties: {
            itemId: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            url: { type: "string" },
            category: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            qualityScore: { type: "number" },
            trendingScore: { type: "number" },
            createdAt: { type: "string" },
          },
        },
      },
      success: { type: "boolean" },
      totalResults: { type: "number" },
      note: { type: "string", description: "成功但无结果时的说明" },
      error: { type: "string", description: "失败原因" },
    },
  };

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  validateInput(input: ExploreSearchInput): boolean {
    if (
      !input.query ||
      typeof input.query !== "string" ||
      input.query.trim().length === 0
    ) {
      this.logger.error("Invalid query: must be a non-empty string");
      return false;
    }
    if (input.query.length > 2000) {
      this.logger.error("Invalid query: too long (max 2000 characters)");
      return false;
    }
    if (
      input.scope !== undefined &&
      input.scope !== "public" &&
      input.scope !== "mine"
    ) {
      this.logger.error("Invalid scope: must be 'public' or 'mine'");
      return false;
    }
    if (
      input.days !== undefined &&
      (typeof input.days !== "number" ||
        input.days < 1 ||
        input.days > MAX_DAYS)
    ) {
      this.logger.error(`Invalid days: must be between 1 and ${MAX_DAYS}`);
      return false;
    }
    if (
      input.topK !== undefined &&
      (typeof input.topK !== "number" ||
        input.topK < 1 ||
        input.topK > MAX_TOP_K)
    ) {
      this.logger.error(`Invalid topK: must be between 1 and ${MAX_TOP_K}`);
      return false;
    }
    return true;
  }

  protected async doExecute(
    input: ExploreSearchInput,
    context: ToolContext,
  ): Promise<ExploreSearchOutput> {
    const {
      query,
      scope = "public",
      days = DEFAULT_DAYS,
      topK = DEFAULT_TOP_K,
    } = input;
    const userId = context.userId;

    if (scope === "mine" && !userId) {
      // mine 必须有身份；无 userId 返回空而非假 error，引导回落 web-search
      return {
        results: [],
        success: true,
        totalResults: 0,
        note: "scope=mine requires a user but no userId in tool context — fall back to public scope or web-search",
      };
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 拆词 OR 匹配：自然语言长 query 直接 contains 会必然 0 命中
    const terms = query
      .split(/[\s,，、;；/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 6);

    const where: Prisma.ResourceWhereInput = {
      // 入库新鲜度窗口（createdAt 非空、有默认值，保证窗口稳定生效）
      createdAt: { gte: since },
      // 排除标题为空的脏数据（与 ExploreContentSourceProvider 一致）
      NOT: { title: "" },
    };

    if (scope === "mine") {
      // 行级隔离：只看用户自己 collection 里的资源
      where.collectionItems = { some: { collection: { userId } } };
    }

    if (terms.length > 0) {
      where.OR = terms.flatMap((t) => [
        { title: { contains: t, mode: "insensitive" } },
        { abstract: { contains: t, mode: "insensitive" } },
        { aiSummary: { contains: t, mode: "insensitive" } },
      ]);
    }

    try {
      const items = await this.prisma.resource.findMany({
        where,
        select: {
          id: true,
          title: true,
          abstract: true,
          aiSummary: true,
          sourceUrl: true,
          primaryCategory: true,
          tags: true,
          qualityScore: true,
          trendingScore: true,
          createdAt: true,
        },
        orderBy: [
          { trendingScore: { sort: "desc", nulls: "last" } },
          { qualityScore: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        take: Math.min(topK, MAX_TOP_K),
      });

      if (items.length === 0) {
        return {
          results: [],
          success: true,
          totalResults: 0,
          note:
            scope === "mine"
              ? "no matching resources in your collections — try scope=public or fall back to web-search"
              : "no frontier-library resources matched — fall back to web-search",
        };
      }

      const results: ExploreSearchItem[] = items.map((it) => ({
        itemId: it.id,
        title: it.title,
        summary: it.aiSummary ?? it.abstract ?? null,
        url: it.sourceUrl,
        category: it.primaryCategory,
        tags: Array.isArray(it.tags) ? (it.tags as string[]) : [],
        qualityScore: it.qualityScore != null ? Number(it.qualityScore) : null,
        trendingScore:
          it.trendingScore != null ? Number(it.trendingScore) : null,
        createdAt: it.createdAt.toISOString(),
      }));

      this.logger.log(
        `explore-search: scope=${scope} query="${query.substring(0, 80)}" terms=${terms.length} hits=${results.length}`,
      );
      return { results, success: true, totalResults: results.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`explore-search failed: ${message}`);
      return { results: [], success: false, totalResults: 0, error: message };
    }
  }
}
