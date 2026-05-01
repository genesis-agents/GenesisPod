/**
 * ArXiv Search Tool
 * ArXiv 学术搜索工具 - 搜索计算机科学、物理学等领域的学术论文预印本
 *
 * API 文档: https://info.arxiv.org/help/api/index.html
 * 无需 API Key（免费公开）
 * 限速: 3 requests/second
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";
import { PolicyDataService } from "../policy/policy-data.service";
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
  private static lastRequestTime = 0;
  private static readonly MIN_REQUEST_INTERVAL = 1500; // conservative: ~0.7 req/s to avoid 429
  private static activeRequests = 0;
  private static readonly MAX_CONCURRENT = 1; // serialize all ArXiv requests
  private static readonly requestQueue: Array<() => void> = [];
  /** Global 429 cooldown — all requests wait until this timestamp */
  private static cooldownUntil = 0;

  readonly id = "arxiv-search";
  readonly sideEffect = "none" as const;
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
        sortOrder: "descending",
      };

      this.logger.debug(`[doExecute] API params: ${JSON.stringify(params)}`);

      // 带退避重试的请求，最多重试 3 次
      // 关键：收到 429 时设置全局冷却，防止其他并发请求继续打 ArXiv
      const maxRetries = 3;
      let xmlData: string | undefined;
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await this.acquireSlot();
        try {
          xmlData = await this.policyDataService.httpGet<string>(
            baseUrl,
            params,
          );
          this.releaseSlot();
          break; // 成功
        } catch (err) {
          this.releaseSlot(); // 立即释放槽位
          lastError = err instanceof Error ? err : new Error(String(err));
          const is429 = lastError.message.includes("429");
          if (is429 && attempt < maxRetries) {
            const backoff = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            // 设置全局冷却：所有排队的请求也必须等到冷却结束
            ArxivSearchTool.cooldownUntil = Date.now() + backoff;
            this.logger.warn(
              `[doExecute] ArXiv 429 rate limited, retry ${attempt + 1}/${maxRetries} after ${backoff}ms (global cooldown set)`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
          if (is429) {
            // 3 次 retry 全部失败，设置 30s 长冷却让后续请求有恢复窗口
            ArxivSearchTool.cooldownUntil = Date.now() + 30_000;
            this.logger.warn(
              `[doExecute] ArXiv 429 exhausted all retries, setting 30s global cooldown for subsequent requests`,
            );
          }
          throw err;
        }
      }

      if (!xmlData) {
        // ★ P0-LIVE-TOOL-ERR-DETAIL (2026-04-30): 透传最后一次 attempt 真实错误
        return {
          success: false,
          papers: [],
          totalResults: 0,
          query,
          error: `ArXiv 搜索失败: ${lastError?.message || "重试 3 次后仍未拿到响应（可能是 429 全局冷却 / 网络超时）"}`,
        };
      }

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
   * 获取并发槽位，等待全局冷却 + 最小请求间隔
   * 其他请求在冷却期间会暂停排队等待，不会放弃
   */
  private async acquireSlot(): Promise<void> {
    // 等待并发槽位
    while (ArxivSearchTool.activeRequests >= ArxivSearchTool.MAX_CONCURRENT) {
      await new Promise<void>((resolve) => {
        ArxivSearchTool.requestQueue.push(resolve);
      });
    }
    ArxivSearchTool.activeRequests++;

    // 等待全局 429 冷却结束（其他请求排队等待，不放弃）
    const cooldownRemaining = ArxivSearchTool.cooldownUntil - Date.now();
    if (cooldownRemaining > 0) {
      this.logger.debug(
        `[acquireSlot] Waiting ${cooldownRemaining}ms for global 429 cooldown`,
      );
      await new Promise((resolve) => setTimeout(resolve, cooldownRemaining));
    }

    // 强制最小请求间隔
    const now = Date.now();
    const timeSinceLastRequest = now - ArxivSearchTool.lastRequestTime;
    if (timeSinceLastRequest < ArxivSearchTool.MIN_REQUEST_INTERVAL) {
      const waitTime =
        ArxivSearchTool.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.debug(`[acquireSlot] Waiting ${waitTime}ms for rate limit`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    ArxivSearchTool.lastRequestTime = Date.now();
  }

  /**
   * 释放并发槽位，并唤醒队列中下一个等待者
   */
  private releaseSlot(): void {
    ArxivSearchTool.activeRequests--;
    const next = ArxivSearchTool.requestQueue.shift();
    if (next) next();
  }

  validateInput(input: ArxivSearchInput): boolean {
    // 必须有查询关键词
    return !!input.query && input.query.trim().length > 0;
  }
}
