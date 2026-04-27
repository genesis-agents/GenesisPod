/**
 * Web Search Tool
 * 网络搜索工具 - 复用 SearchService
 */

import { Injectable } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";

import {
  SearchService,
  SearchResult,
} from "../../../../knowledge/search/search.service";

// ============================================================================
// Types
// ============================================================================

export interface WebSearchInput {
  /**
   * 搜索查询词
   */
  query: string;

  /**
   * 返回结果数量，默认 5
   */
  numResults?: number;

  /**
   * 搜索语言
   */
  language?: "zh-CN" | "en-US" | "auto";
}

export interface WebSearchOutput {
  /**
   * 搜索结果列表
   */
  results: SearchResult[];

  /**
   * 搜索是否成功
   */
  success: boolean;

  /**
   * 结果总数
   */
  totalResults: number;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class WebSearchTool extends BaseTool<WebSearchInput, WebSearchOutput> {
  readonly id = "web-search";
  readonly category: ToolCategory = "information";
  readonly tags = ["web", "search", "general"];
  readonly name = "网络搜索";
  readonly description =
    "搜索互联网获取最新信息。适用于需要实时数据、新闻、或需要验证的信息。返回搜索结果列表，包含标题、URL和摘要。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索查询词，应该简洁明确",
      },
      numResults: {
        type: "number",
        description: "返回结果数量，默认 5，最大 10",
        default: 5,
      },
      language: {
        type: "string",
        description: "搜索语言偏好",
        enum: ["zh-CN", "en-US", "auto"],
        default: "auto",
      },
    },
    required: ["query"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "搜索结果列表",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "结果标题" },
            url: { type: "string", description: "结果链接" },
            content: { type: "string", description: "摘要内容" },
            publishedDate: { type: "string", description: "发布日期" },
          },
        },
      },
      success: {
        type: "boolean",
        description: "搜索是否成功",
      },
      totalResults: {
        type: "number",
        description: "返回的结果数量",
      },
    },
  };

  constructor(private readonly searchService: SearchService) {
    super();
    // defaultTimeout set in class property // 15 秒超时
  }

  validateInput(input: WebSearchInput) {
    return (
      typeof input.query === "string" &&
      input.query.trim().length > 0 &&
      input.query.length <= 500
    );
  }

  protected async doExecute(
    input: WebSearchInput,
    _context: ToolContext,
  ): Promise<WebSearchOutput> {
    const { query, numResults = 5 } = input;

    // 限制最大结果数
    const maxResults = Math.min(numResults, 10);

    // 调用搜索服务
    const response = await this.searchService.search(query, maxResults);

    return {
      results: response.results,
      success: response.success,
      totalResults: response.results.length,
    };
  }
}
