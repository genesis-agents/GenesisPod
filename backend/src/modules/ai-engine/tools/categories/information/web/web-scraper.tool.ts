/**
 * Web Scraper Tool
 * 网页抓取工具 - 复用 SearchService 的 URL 抓取能力
 */

import { Injectable } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";

import { SearchService } from "../../../../knowledge/search/search.service";

// ============================================================================
// Types
// ============================================================================

export interface WebScraperInput {
  /**
   * 要抓取的 URL
   */
  url: string;

  /**
   * 是否提取主要内容（去除导航、广告等）
   */
  extractMainContent?: boolean;

  /**
   * 最大内容长度（字符数）
   */
  maxLength?: number;
}

export interface WebScraperOutput {
  /**
   * 页面标题
   */
  title: string;

  /**
   * 提取的内容（纯文本）
   */
  content: string;

  /**
   * 清理后的 HTML（去除 script/style，保留结构标签，用于图片提取）
   */
  html?: string;

  /**
   * 原始 URL
   */
  url: string;

  /**
   * 内容长度
   */
  contentLength: number;

  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 错误信息
   */
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class WebScraperTool extends BaseTool<
  WebScraperInput,
  WebScraperOutput
> {
  readonly id = "web-scraper";
  readonly category: ToolCategory = "information";
  readonly tags = ["web", "scrape", "html", "general"];
  readonly name = "网页抓取";
  readonly description =
    "抓取并解析指定 URL 的网页内容。提取页面标题和主要文本内容，适用于获取文章、博客、新闻等网页的详细信息。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "要抓取的网页 URL，必须是完整的 HTTP/HTTPS 地址",
      },
      extractMainContent: {
        type: "boolean",
        description: "是否只提取主要内容，过滤导航、广告等",
        default: true,
      },
      maxLength: {
        type: "number",
        description: "最大内容长度（字符数），默认 10000",
        default: 10000,
      },
    },
    required: ["url"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "页面标题",
      },
      content: {
        type: "string",
        description: "提取的页面内容",
      },
      url: {
        type: "string",
        description: "原始 URL",
      },
      contentLength: {
        type: "number",
        description: "内容长度（字符数）",
      },
      success: {
        type: "boolean",
        description: "抓取是否成功",
      },
      error: {
        type: "string",
        description: "错误信息（如果失败）",
      },
    },
  };

  constructor(private readonly searchService: SearchService) {
    super();
    // defaultTimeout set in class property // 30 秒超时
  }

  validateInput(input: WebScraperInput) {
    if (!input.url || typeof input.url !== "string") {
      return false;
    }

    // 验证 URL 格式
    try {
      new URL(input.url);
      return true;
    } catch {
      return false;
    }
  }

  protected async doExecute(
    input: WebScraperInput,
    _context: ToolContext,
  ): Promise<WebScraperOutput> {
    const { url, maxLength = 10000 } = input;

    try {
      // 使用 SearchService 的 fetchUrlContent 方法
      const result = await this.searchService.fetchUrlContent(url);

      if (!result.success) {
        return {
          title: "",
          content: "",
          url,
          contentLength: 0,
          success: false,
          error: "Failed to fetch URL content",
        };
      }

      // 截断内容到最大长度
      let content = result.content || "";
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + "...";
      }

      return {
        title: result.title || "",
        content,
        html: result.html,
        url,
        contentLength: content.length,
        success: true,
      };
    } catch (error) {
      return {
        title: "",
        content: "",
        url,
        contentLength: 0,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
