/**
 * ArXiv Search Tool
 * ArXiv 学术搜索工具 - 搜索计算机科学、物理学等领域的学术论文预印本
 *
 * API 文档: https://info.arxiv.org/help/api/index.html
 * 无需 API Key（免费公开）
 * 限速: 3 requests/second
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../abstractions/tool.interface";
import { PolicyDataService } from "./policy/policy-data.service";
import * as xml2js from "xml2js";

// ============================================================================
// Types
// ============================================================================

/**
 * 排序方式
 */
export type ArxivSortBy = "relevance" | "lastUpdatedDate" | "submittedDate";

/**
 * 输入参数
 */
export interface ArxivSearchInput {
  /** 搜索查询 */
  query: string;
  /** 最大结果数，默认 10 */
  maxResults?: number;
  /** arXiv 分类，如 'cs.AI', 'cs.LG' */
  category?: string;
  /** 排序方式 */
  sortBy?: ArxivSortBy;
}

/**
 * ArXiv 论文
 */
export interface ArxivPaper {
  /** arXiv ID */
  id: string;
  /** 标题 */
  title: string;
  /** 作者列表 */
  authors: string[];
  /** 摘要 */
  abstract: string;
  /** 分类列表 */
  categories: string[];
  /** 发布日期 */
  publishedDate: string;
  /** 最后更新日期 */
  updatedDate: string;
  /** PDF 链接 */
  pdfUrl: string;
  /** arXiv 页面链接 */
  arxivUrl: string;
}

/**
 * 输出结果
 */
export interface ArxivSearchOutput {
  /** 论文列表 */
  papers: ArxivPaper[];
  /** 结果总数 */
  totalResults: number;
  /** 搜索查询 */
  query: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface ArxivApiEntry {
  id: string[];
  title: string[];
  summary: string[];
  author: Array<{ name: string[] }>;
  published: string[];
  updated: string[];
  category?: Array<{ $: { term: string } }>;
  link: Array<{ $: { href: string; type?: string; title?: string } }>;
}

interface ArxivApiResponse {
  feed: {
    entry?: ArxivApiEntry[];
    "opensearch:totalResults": string[];
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class ArxivSearchTool extends BaseTool<
  ArxivSearchInput,
  ArxivSearchOutput
> {
  private readonly logger = new Logger(ArxivSearchTool.name);
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 350; // 3 req/s = ~333ms interval, use 350ms for safety

  readonly id = "arxiv-search";
  readonly name = "ArXiv Search";
  readonly description =
    "搜索 ArXiv 学术论文预印本库：计算机科学、物理学、数学等领域的最新研究论文。数据来源：arxiv.org，无需 API Key。适合深度研究、文献调研、前沿技术追踪。";
  readonly category: ToolCategory = "information";
  readonly tags = ["academic", "research", "paper", "arxiv", "science"];
  readonly defaultTimeout = 30000;

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "搜索查询，支持关键词、作者、标题等。示例：'machine learning', 'au:Hinton', 'ti:transformer'",
      },
      maxResults: {
        type: "number",
        description: "最大结果数量，默认 10，最大 100",
        default: 10,
      },
      category: {
        type: "string",
        description:
          "arXiv 分类过滤，如 cs.AI (人工智能), cs.LG (机器学习), cs.CV (计算机视觉)",
      },
      sortBy: {
        type: "string",
        enum: ["relevance", "lastUpdatedDate", "submittedDate"],
        description:
          "排序方式：relevance=相关性，lastUpdatedDate=更新日期，submittedDate=提交日期",
        default: "relevance",
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      papers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            authors: { type: "array", items: { type: "string" } },
            abstract: { type: "string" },
            categories: { type: "array", items: { type: "string" } },
            publishedDate: { type: "string" },
            updatedDate: { type: "string" },
            pdfUrl: { type: "string" },
            arxivUrl: { type: "string" },
          },
        },
      },
      totalResults: { type: "number" },
      query: { type: "string" },
      error: { type: "string" },
    },
  };

  constructor(private readonly policyDataService: PolicyDataService) {
    super();
  }

  protected async doExecute(
    input: ArxivSearchInput,
    _context: ToolContext,
  ): Promise<ArxivSearchOutput> {
    const { query, maxResults = 10, category, sortBy = "relevance" } = input;

    this.logger.log(
      `[doExecute] Searching ArXiv: query="${query}", maxResults=${maxResults}, category=${category}`,
    );

    try {
      // 实施限速
      await this.enforceRateLimit();

      // 构建搜索查询
      let searchQuery = query;
      if (category) {
        searchQuery = `${query} AND cat:${category}`;
      }

      // 构建 API URL 和参数
      const baseUrl = "http://export.arxiv.org/api/query";
      const params: Record<string, string | number> = {
        search_query: searchQuery,
        max_results: Math.min(maxResults, 100),
        sortBy: sortBy,
        sortOrder: sortBy === "relevance" ? "descending" : "descending",
      };

      this.logger.debug(`[doExecute] API params: ${JSON.stringify(params)}`);

      // 发送请求
      const xmlData = await this.policyDataService.httpGet<string>(
        baseUrl,
        params,
      );

      // 解析 XML
      const parser = new xml2js.Parser({
        explicitArray: true,
        mergeAttrs: false,
      });
      const result: ArxivApiResponse = await parser.parseStringPromise(xmlData);

      // 提取总结果数
      const totalResults = parseInt(
        result.feed["opensearch:totalResults"]?.[0] || "0",
        10,
      );

      // 提取论文列表
      const entries = result.feed.entry || [];
      const papers: ArxivPaper[] = entries.map((entry) =>
        this.parseEntry(entry),
      );

      this.logger.log(
        `[doExecute] Found ${papers.length} papers (total: ${totalResults})`,
      );

      return {
        success: true,
        papers,
        totalResults,
        query: searchQuery,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[doExecute] ArXiv API error: ${error}`);

      return {
        success: false,
        papers: [],
        totalResults: 0,
        query,
        error: `ArXiv 搜索失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 解析单个论文条目
   */
  private parseEntry(entry: ArxivApiEntry): ArxivPaper {
    // 提取 ID（去除 URL 前缀）
    const idUrl = entry.id[0];
    const id = idUrl.replace("http://arxiv.org/abs/", "");

    // 提取标题（去除多余空白）
    const title = entry.title[0].replace(/\s+/g, " ").trim();

    // 提取摘要（去除多余空白）
    const abstract = entry.summary[0].replace(/\s+/g, " ").trim();

    // 提取作者
    const authors = entry.author?.map((author) => author.name[0]) || [];

    // 提取分类
    const categories = entry.category?.map((cat) => cat.$.term) || [];

    // 提取日期
    const publishedDate = entry.published[0];
    const updatedDate = entry.updated[0];

    // 提取链接
    const pdfLink = entry.link.find((link) => link.$.title === "pdf");
    const pdfUrl = pdfLink?.$.href || `http://arxiv.org/pdf/${id}.pdf`;
    const arxivUrl = `http://arxiv.org/abs/${id}`;

    return {
      id,
      title,
      authors,
      abstract,
      categories,
      publishedDate,
      updatedDate,
      pdfUrl,
      arxivUrl,
    };
  }

  /**
   * 实施 3 req/s 限速
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.debug(`[enforceRateLimit] Waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  validateInput(input: ArxivSearchInput): boolean {
    // 必须有查询关键词
    return !!input.query && input.query.trim().length > 0;
  }
}
