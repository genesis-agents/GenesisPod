/**
 * 统一导出系统 - 前端 Hook
 *
 * 提供统一的导出功能接口
 */

import { useState, useCallback } from 'react';
import { config } from '@/lib/utils/config';

// ==================== 类型定义 ====================

export type ExportFormat =
  | 'PDF'
  | 'DOCX'
  | 'PPTX'
  | 'XLSX'
  | 'MARKDOWN'
  | 'HTML';

export type ExportSourceType = 'DOCUMENT' | 'RESEARCH' | 'REPORT' | 'RAW';

export type TemplateCategory =
  | 'REPORT'
  | 'PPT'
  | 'DOCUMENT'
  | 'ACADEMIC'
  | 'BUSINESS';

export interface ExportSource {
  type: ExportSourceType;
  documentId?: string;
  sessionId?: string;
  reportId?: string;
  content?: string;
  contentType?: 'markdown' | 'html' | 'json';
  title?: string;
}

export interface ExportOptions {
  includeCover?: boolean;
  includeTableOfContents?: boolean;
  includeReferences?: boolean;
  includePageNumbers?: boolean;
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  watermark?: string;
  fileName?: string;
}

export interface ExportRequest {
  source: ExportSource;
  format: ExportFormat;
  templateId?: string;
  options?: ExportOptions;
}

export interface ExportJobResponse {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  estimatedTime?: number;
  downloadUrl?: string;
  expiresAt?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  supportedFormats: ExportFormat[];
  isBuiltIn: boolean;
  isDefault: boolean;
  previewImage?: string;
}

export interface ExportStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  progress?: number;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
}

export interface UseExportResult {
  // 状态
  exportStatus: ExportStatus;
  isExporting: boolean;
  error: string | null;

  // 操作
  exportDocument: (request: ExportRequest) => Promise<ExportJobResponse>;
  exportResearch: (
    sessionId: string,
    format: ExportFormat,
    options?: ExportOptions
  ) => Promise<ExportJobResponse>;
  exportRaw: (
    content: string,
    format: ExportFormat,
    title?: string,
    options?: ExportOptions
  ) => Promise<ExportJobResponse>;

  // 模板
  getTemplates: (category?: TemplateCategory) => Promise<ExportTemplate[]>;

  // 下载
  downloadExport: (jobId: string) => void;

  // 重置
  reset: () => void;
}

// ==================== Hook 实现 ====================

export function useExport(): UseExportResult {
  const [status, setStatus] = useState<ExportStatus>({ status: 'idle' });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 轮询任务状态
   */
  const pollJobStatus = useCallback(
    async (
      jobId: string,
      onProgress?: (progress: number) => void
    ): Promise<ExportJobResponse> => {
      const maxAttempts = 120; // 最多轮询 2 分钟
      const interval = 1000; // 每秒轮询一次

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(`${config.apiUrl}/export/${jobId}`, {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to get export status');
        }

        const result: ExportJobResponse = await response.json();

        if (onProgress) {
          onProgress(result.progress);
        }

        if (result.status === 'COMPLETED') {
          return result;
        }

        if (result.status === 'FAILED') {
          throw new Error(result.error || 'Export failed');
        }

        // 等待下一次轮询
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      throw new Error('Export timeout');
    },
    []
  );

  /**
   * 创建导出任务
   */
  const exportDocument = useCallback(
    async (request: ExportRequest): Promise<ExportJobResponse> => {
      setIsExporting(true);
      setError(null);
      setStatus({ status: 'processing', progress: 0 });

      try {
        // 1. 创建导出任务
        const createResponse = await fetch(`${config.apiUrl}/export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(request),
        });

        if (!createResponse.ok) {
          const err = await createResponse.json();
          throw new Error(err.message || 'Failed to create export job');
        }

        const { jobId } = await createResponse.json();

        // 2. 轮询任务状态
        const result = await pollJobStatus(jobId, (progress) => {
          setStatus({ status: 'processing', progress });
        });

        // 3. 更新状态
        setStatus({
          status: 'completed',
          downloadUrl: result.downloadUrl,
          fileName: result.fileName,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Export failed';
        setError(errorMessage);
        setStatus({ status: 'failed', error: errorMessage });
        throw err;
      } finally {
        setIsExporting(false);
      }
    },
    [pollJobStatus]
  );

  /**
   * 导出研究报告（快捷方法）
   */
  const exportResearch = useCallback(
    async (
      sessionId: string,
      format: ExportFormat,
      options?: ExportOptions
    ): Promise<ExportJobResponse> => {
      return exportDocument({
        source: {
          type: 'RESEARCH',
          sessionId,
        },
        format,
        templateId: 'deep-research', // 使用深度研究专用模板
        options: {
          includeCover: true,
          includeTableOfContents: true,
          includeReferences: true,
          ...options,
        },
      });
    },
    [exportDocument]
  );

  /**
   * 导出原始内容（快捷方法）
   */
  const exportRaw = useCallback(
    async (
      content: string,
      format: ExportFormat,
      title?: string,
      options?: ExportOptions
    ): Promise<ExportJobResponse> => {
      return exportDocument({
        source: {
          type: 'RAW',
          content,
          contentType: 'markdown',
          title,
        },
        format,
        options,
      });
    },
    [exportDocument]
  );

  /**
   * 获取模板列表
   */
  const getTemplates = useCallback(
    async (category?: TemplateCategory): Promise<ExportTemplate[]> => {
      const params = new URLSearchParams();
      if (category) {
        params.set('category', category);
      }

      const response = await fetch(
        `${config.apiUrl}/templates?${params.toString()}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get templates');
      }

      return response.json();
    },
    []
  );

  /**
   * 下载导出文件
   */
  const downloadExport = useCallback((jobId: string) => {
    window.open(`${config.apiUrl}/export/${jobId}/download`, '_blank');
  }, []);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setStatus({ status: 'idle' });
    setIsExporting(false);
    setError(null);
  }, []);

  return {
    exportStatus: status,
    isExporting,
    error,
    exportDocument,
    exportResearch,
    exportRaw,
    getTemplates,
    downloadExport,
    reset,
  };
}

export default useExport;
