/**
 * Federal Register Tool
 * 联邦公报搜索工具 - 搜索行政命令、法规、通知等
 *
 * API 文档: https://www.federalregister.gov/developers/documentation/api/v1
 * 无需 API Key（免费公开）
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../../../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../../../abstractions/tool.interface";
import { PolicyDataService } from "./policy-data.service";

// ============================================================================
// Types
// ============================================================================

/**
 * Federal Register 文档类型
 */
export type FederalRegisterDocType =
  | "RULE" // 最终规则
  | "PRORULE" // 拟议规则
  | "NOTICE" // 通知
  | "PRESDOC"; // 总统文件（包括行政命令）

/**
 * 输入参数
 */
export interface FederalRegisterInput {
  /** 搜索关键词 */
  query?: string;
  /** 文档类型 */
  documentType?: FederalRegisterDocType | FederalRegisterDocType[];
  /** 发布机构 */
  agency?: string;
  /** 开始日期 (YYYY-MM-DD) */
  startDate?: string;
  /** 结束日期 (YYYY-MM-DD) */
  endDate?: string;
  /** 最大结果数 */
  maxResults?: number;
  /** 按相关性排序 */
  sortByRelevance?: boolean;
}

/**
 * 联邦公报文档
 */
export interface FederalRegisterDocument {
  /** 文档编号 */
  documentNumber: string;
  /** 标题 */
  title: string;
  /** 摘要 */
  abstract: string;
  /** 文档类型 */
  type: string;
  /** 发布机构 */
  agencies: string[];
  /** 发布日期 */
  publicationDate: string;
  /** 原始链接 */
  htmlUrl: string;
  /** PDF 链接 */
  pdfUrl?: string;
  /** 文档子类型（如 Executive Order） */
  subtype?: string;
  /** 行政令编号（如适用） */
  executiveOrderNumber?: string;
  /** 签署日期（如适用） */
  signingDate?: string;
}

/**
 * 输出结果
 */
export interface FederalRegisterOutput {
  /** 是否成功 */
  success: boolean;
  /** 搜索结果 */
  documents: FederalRegisterDocument[];
  /** 结果总数 */
  totalCount: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface FederalRegisterApiResponse {
  count: number;
  results: FederalRegisterApiDocument[];
}

interface FederalRegisterApiDocument {
  document_number: string;
  title: string;
  abstract: string;
  type: string;
  agencies: Array<{ name: string; slug: string }>;
  publication_date: string;
  html_url: string;
  pdf_url?: string;
  subtype?: string;
  executive_order_number?: string;
  signing_date?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class FederalRegisterTool extends BaseTool<
  FederalRegisterInput,
  FederalRegisterOutput
> {
  private readonly logger = new Logger(FederalRegisterTool.name);

  readonly id = "federal-register";
  readonly sideEffect = "none" as const;
  readonly name = "Federal Register Search";
  readonly description =
    "搜索美国联邦公报（Federal Register）：行政命令、联邦法规、拟议规则、机构通知。数据来源：federalregister.gov，无需 API Key。";
  readonly category: ToolCategory = "information";
  readonly tags = ["policy", "regulation", "executive-order", "federal"];
  readonly defaultTimeout = 30000;

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词",
      },
      documentType: {
        oneOf: [
          {
            type: "string",
            enum: ["RULE", "PRORULE", "NOTICE", "PRESDOC"],
          },
          {
            type: "array",
            items: {
              type: "string",
              enum: ["RULE", "PRORULE", "NOTICE", "PRESDOC"],
            },
          },
        ],
        description:
          "文档类型：RULE=最终规则，PRORULE=拟议规则，NOTICE=通知，PRESDOC=总统文件（行政命令）",
      },
      agency: {
        type: "string",
        description: "发布机构名称或缩写，如 EPA, DOE, Commerce Department",
      },
      startDate: {
        type: "string",
        description: "开始日期，格式 YYYY-MM-DD",
      },
      endDate: {
        type: "string",
        description: "结束日期，格式 YYYY-MM-DD",
      },
      maxResults: {
        type: "number",
        description: "最大结果数量，默认 10，最大 100",
        default: 10,
      },
      sortByRelevance: {
        type: "boolean",
        description: "是否按相关性排序（默认按日期）",
        default: false,
      },
    },
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: { type: "boolean" },
      documents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            documentNumber: { type: "string" },
            title: { type: "string" },
            abstract: { type: "string" },
            type: { type: "string" },
            agencies: { type: "array", items: { type: "string" } },
            publicationDate: { type: "string" },
            htmlUrl: { type: "string" },
            pdfUrl: { type: "string" },
            subtype: { type: "string" },
            executiveOrderNumber: { type: "string" },
            signingDate: { type: "string" },
          },
        },
      },
      totalCount: { type: "number" },
      error: { type: "string" },
    },
  };

  constructor(private readonly policyDataService: PolicyDataService) {
    super();
  }

  protected async doExecute(
    input: FederalRegisterInput,
    _context: ToolContext,
  ): Promise<FederalRegisterOutput> {
    const {
      query,
      documentType,
      agency,
      startDate,
      endDate,
      maxResults = 10,
      sortByRelevance = false,
    } = input;

    this.logger.log(
      `[doExecute] Searching Federal Register: query="${query}", type=${documentType}`,
    );

    try {
      // 构建 API URL 和参数
      const baseUrl = "https://www.federalregister.gov/api/v1/documents.json";
      const params: Record<string, string | number | boolean | undefined> = {
        per_page: Math.min(maxResults, 100),
        order: sortByRelevance ? "relevance" : "newest",
        fields: [
          "document_number",
          "title",
          "abstract",
          "type",
          "agencies",
          "publication_date",
          "html_url",
          "pdf_url",
          "subtype",
          "executive_order_number",
          "signing_date",
        ].join(","),
      };

      // 添加搜索条件
      if (query) {
        params["conditions[term]"] = query;
      }

      // 文档类型 - 每个类型需要单独的参数
      if (documentType) {
        const types = Array.isArray(documentType)
          ? documentType
          : [documentType];
        // Federal Register API 要求数组参数使用多个同名参数
        // 例如: conditions[type][]=RULE&conditions[type][]=PRESDOC
        types.forEach((type, index) => {
          params[`conditions[type][${index}]`] = type;
        });
      }

      // 机构 - 同样需要数组格式
      if (agency) {
        params["conditions[agencies][0]"] = agency;
      }

      if (startDate) {
        params["conditions[publication_date][gte]"] = startDate;
      }

      if (endDate) {
        params["conditions[publication_date][lte]"] = endDate;
      }

      // 发送请求
      const response =
        await this.policyDataService.httpGet<FederalRegisterApiResponse>(
          baseUrl,
          params,
        );

      // 转换结果
      const documents: FederalRegisterDocument[] = (response.results || []).map(
        (doc) => ({
          documentNumber: doc.document_number,
          title: doc.title,
          abstract: doc.abstract || "",
          type: doc.type,
          agencies: doc.agencies?.map((a) => a.name) || [],
          publicationDate: doc.publication_date,
          htmlUrl: doc.html_url,
          pdfUrl: doc.pdf_url,
          subtype: doc.subtype,
          executiveOrderNumber: doc.executive_order_number,
          signingDate: doc.signing_date,
        }),
      );

      this.logger.log(
        `[doExecute] Found ${documents.length} documents (total: ${response.count})`,
      );

      return {
        success: true,
        documents,
        totalCount: response.count,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`[doExecute] Federal Register API error: ${error}`);

      return {
        success: false,
        documents: [],
        totalCount: 0,
        error: `Federal Register 搜索失败: ${errorMessage}`,
      };
    }
  }

  validateInput(input: FederalRegisterInput): boolean {
    // 至少需要一个搜索条件
    return !!(
      input.query ||
      input.documentType ||
      input.agency ||
      input.startDate
    );
  }
}
