/**
 * 统一导出系统 - 导出选项类型
 */

import {
  ExportFormat,
  ExportSourceType,
  ExportTemplateCategory,
} from "@prisma/client";
import { ThemeConfig, LayoutConfig } from "./theme-config";

// ==================== 导出请求 ====================

export interface ExportRequest {
  // 内容来源
  source: ExportSource;

  // 导出格式
  format: ExportFormat;

  // 模板 (可选)
  templateId?: string;
  customTheme?: Partial<ThemeConfig>;
  customLayout?: Partial<LayoutConfig>;

  // 导出选项
  options?: ExportOptions;
}

export type ExportSource =
  | DocumentSource
  | ResearchSource
  | ReportSource
  | RawSource;

export interface DocumentSource {
  type: "DOCUMENT";
  documentId: string;
}

export interface ResearchSource {
  type: "RESEARCH";
  sessionId: string;
}

export interface ReportSource {
  type: "REPORT";
  reportId: string;
}

export interface RawSource {
  type: "RAW";
  content: string;
  contentType: "markdown" | "html" | "json";
  title?: string;
}

// ==================== 导出选项 ====================

export interface ExportOptions {
  // 内容选项
  includeCover?: boolean;
  includeTableOfContents?: boolean;
  includeReferences?: boolean;
  includePageNumbers?: boolean;
  includeMetadata?: boolean;

  // 页面设置
  pageSize?: "A4" | "A3" | "Letter" | "Legal";
  orientation?: "portrait" | "landscape";

  // 安全选项
  watermark?: string;
  watermarkOpacity?: number;
  password?: string;

  // 文件名
  fileName?: string;

  // 语言
  language?: string;
}

// ==================== 导出响应 ====================

export interface ExportJobResponse {
  jobId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress: number;
  estimatedTime?: number;
  downloadUrl?: string;
  expiresAt?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

// ==================== 模板 DTO ====================

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category: ExportTemplateCategory;
  themeConfig: ThemeConfig;
  layoutConfig: LayoutConfig;
  styleConfig?: Record<string, any>;
  supportedFormats: ExportFormat[];
  supportedSources: ExportSourceType[];
  isPublic?: boolean;
  previewImage?: string;
}

export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  themeConfig?: ThemeConfig;
  layoutConfig?: LayoutConfig;
  styleConfig?: Record<string, any>;
  supportedFormats?: ExportFormat[];
  supportedSources?: ExportSourceType[];
  isPublic?: boolean;
  isDefault?: boolean;
  previewImage?: string;
}

export interface TemplateQueryDto {
  category?: ExportTemplateCategory;
  format?: ExportFormat;
  sourceType?: ExportSourceType;
  includeBuiltIn?: boolean;
  includePublic?: boolean;
}

export interface TemplateResponse {
  id: string;
  name: string;
  description?: string;
  category: ExportTemplateCategory;
  themeConfig: ThemeConfig;
  layoutConfig: LayoutConfig;
  supportedFormats: ExportFormat[];
  supportedSources: ExportSourceType[];
  isBuiltIn: boolean;
  isDefault: boolean;
  isPublic: boolean;
  previewImage?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
