'use client';

/**
 * Unified ExportDialog - WYSIWYG 导出对话框
 * 支持 PDF/DOCX/PPTX/HTML 格式，WYSIWYG 和可编辑两种模式
 */

import React, { useState, useCallback } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  Download,
  Loader2,
  Check,
  Monitor,
  PenTool,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/stores';
import { HtmlCaptureService } from '@/lib/utils/html-capture.service';
import useExport, {
  type ExportFormat,
  type ExportSource,
  type ExportOptions,
} from '@/hooks/features/useExport';
import { logger } from '@/lib/utils/logger';

// ==================== Types ====================

export type ExportModuleType =
  | 'research'
  | 'planning'
  | 'writing'
  | 'social'
  | 'office'
  | 'teams';

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contentSelector: string;
  contentTitle: string;
  moduleType: ExportModuleType;
  sourceId: string;
  availableFormats?: ExportFormat[];
}

// ==================== Format config ====================

interface FormatConfig {
  key: ExportFormat;
  label: string;
  icon: React.ElementType;
  supportsEditable: boolean;
  description: string;
}

const FORMAT_CONFIGS: FormatConfig[] = [
  {
    key: 'PDF',
    label: 'PDF',
    icon: FileText,
    supportsEditable: false,
    description: 'export.formats.pdfDesc',
  },
  {
    key: 'DOCX',
    label: 'Word',
    icon: FileSpreadsheet,
    supportsEditable: true,
    description: 'export.formats.docxDesc',
  },
  {
    key: 'PPTX',
    label: 'PowerPoint',
    icon: Presentation,
    supportsEditable: true,
    description: 'export.formats.pptxDesc',
  },
  {
    key: 'HTML',
    label: 'HTML',
    icon: Globe,
    supportsEditable: false,
    description: 'export.formats.htmlDesc',
  },
];

// Build properly typed source from module type
function buildSource(
  moduleType: ExportModuleType,
  sourceId: string
): ExportSource {
  switch (moduleType) {
    case 'research':
      return { type: 'RESEARCH', sessionId: sourceId };
    case 'planning':
      return { type: 'PLANNING', planId: sourceId };
    case 'writing':
      return { type: 'WRITING', sessionId: sourceId };
    case 'social':
      return { type: 'SOCIAL', contentId: sourceId };
    case 'office':
      return { type: 'DOCUMENT', documentId: sourceId };
    case 'teams':
      // Note: Teams currently uses exportMission() directly (TeamCanvasModal.tsx) with
      // separate missionId and topicId. This path is for future ExportDialog integration.
      return { type: 'MISSION', missionId: sourceId, topicId: sourceId };
  }
}

// ==================== Component ====================

export function ExportDialog({
  isOpen,
  onClose,
  contentSelector,
  contentTitle,
  moduleType,
  sourceId,
  availableFormats,
}: ExportDialogProps) {
  const { t } = useTranslation();
  const { exportDocument, downloadExport, exportStatus, isExporting, reset } =
    useExport();

  // State
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('PDF');
  const [renderMode, setRenderMode] = useState<'wysiwyg' | 'editable'>(
    'wysiwyg'
  );
  const [options, setOptions] = useState<ExportOptions>({
    includeCover: true,
    includeTableOfContents: true,
    includeReferences: true,
    includePageNumbers: true,
    pageSize: 'A4',
    orientation: 'portrait',
  });

  // Filter formats
  const formats = FORMAT_CONFIGS.filter(
    (f) => !availableFormats || availableFormats.includes(f.key)
  );

  // Check if editable mode is available for selected format
  const selectedFormatConfig = formats.find((f) => f.key === selectedFormat);
  const canSelectEditable = selectedFormatConfig?.supportsEditable ?? false;

  // Handle format change
  const handleFormatChange = useCallback((format: ExportFormat) => {
    setSelectedFormat(format);
    const config = FORMAT_CONFIGS.find((f) => f.key === format);
    if (!config?.supportsEditable) {
      setRenderMode('wysiwyg');
    }
  }, []);

  // Handle export
  const handleExport = useCallback(async () => {
    try {
      let wysiwygHtml: string | undefined;
      let wysiwygCss: string | undefined;

      // Capture HTML for WYSIWYG mode
      if (renderMode === 'wysiwyg') {
        // Check if the target element exists before attempting capture.
        // For example, AI Planning's data-export-content="planning" only exists
        // when the Report tab is active (or rendered via CSS hidden).
        const targetElement = document.querySelector(contentSelector);
        if (targetElement) {
          try {
            const captured = await HtmlCaptureService.capture(contentSelector, {
              inlineStyles: true,
              freezeCharts: true,
              freezeMermaid: true,
            });
            wysiwygHtml = captured.html;
            wysiwygCss = captured.css;
          } catch (captureError) {
            logger.error(
              'HTML capture failed, falling back to editable mode:',
              captureError
            );
            toast.warning(t('export.captureFallback'));
          }
        } else {
          logger.debug(
            `WYSIWYG target element not found: ${contentSelector}, using editable mode`
          );
        }
      }

      const source = buildSource(moduleType, sourceId);
      const exportOptions: ExportOptions = {
        ...options,
        renderMode: wysiwygHtml ? 'wysiwyg' : 'editable',
        wysiwygHtml,
        wysiwygCss,
        fileName: contentTitle,
      };

      const result = await exportDocument({
        source,
        format: selectedFormat,
        options: exportOptions,
      });

      if (result.downloadUrl) {
        downloadExport(result.jobId);
        toast.success(t('export.success'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      toast.error(message);
    }
  }, [
    renderMode,
    contentSelector,
    moduleType,
    sourceId,
    options,
    contentTitle,
    selectedFormat,
    exportDocument,
    downloadExport,
    t,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isExporting) {
      reset();
      onClose();
    }
  }, [isExporting, reset, onClose]);

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={t('export.dialogTitle')}
      subtitle={contentTitle}
      size="md"
      closeButtonDisabled={isExporting}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-gray-400">
            {renderMode === 'wysiwyg'
              ? t('export.wysiwygHint')
              : t('export.editableHint')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={isExporting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            {exportStatus.status === 'completed' && exportStatus.downloadUrl ? (
              <button
                onClick={() => {
                  if (exportStatus.jobId) downloadExport(exportStatus.jobId);
                }}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                {t('common.download')}
              </button>
            ) : (
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('export.exporting')}
                    {typeof exportStatus.progress === 'number' &&
                      ` ${exportStatus.progress}%`}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    {t('common.export')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Format Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {t('export.format')}
          </label>
          <div
            className="grid grid-cols-4 gap-2"
            role="radiogroup"
            aria-label={t('export.format')}
          >
            {formats.map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = selectedFormat === fmt.key;
              return (
                <button
                  key={fmt.key}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleFormatChange(fmt.key)}
                  disabled={isExporting}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all',
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50',
                    isExporting && 'opacity-50'
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{fmt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Render Mode Toggle (only for DOCX/PPTX) */}
        {canSelectEditable && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t('export.renderMode')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRenderMode('wysiwyg')}
                disabled={isExporting}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all',
                  renderMode === 'wysiwyg'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300',
                  isExporting && 'opacity-50'
                )}
              >
                <Monitor
                  className={cn(
                    'h-5 w-5',
                    renderMode === 'wysiwyg' ? 'text-blue-600' : 'text-gray-400'
                  )}
                />
                <div>
                  <div
                    className={cn(
                      'text-sm font-medium',
                      renderMode === 'wysiwyg'
                        ? 'text-blue-700'
                        : 'text-gray-700'
                    )}
                  >
                    {t('export.wysiwyg')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('export.wysiwygDesc')}
                  </div>
                </div>
              </button>
              <button
                onClick={() => setRenderMode('editable')}
                disabled={isExporting}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all',
                  renderMode === 'editable'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300',
                  isExporting && 'opacity-50'
                )}
              >
                <PenTool
                  className={cn(
                    'h-5 w-5',
                    renderMode === 'editable'
                      ? 'text-blue-600'
                      : 'text-gray-400'
                  )}
                />
                <div>
                  <div
                    className={cn(
                      'text-sm font-medium',
                      renderMode === 'editable'
                        ? 'text-blue-700'
                        : 'text-gray-700'
                    )}
                  >
                    {t('export.editable')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('export.editableDesc')}
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Export Options */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {t('export.options')}
          </label>
          <div className="space-y-2">
            {[
              {
                key: 'includeCover' as const,
                label: t('export.optCover'),
              },
              {
                key: 'includeTableOfContents' as const,
                label: t('export.optToc'),
              },
              {
                key: 'includeReferences' as const,
                label: t('export.optReferences'),
              },
              {
                key: 'includePageNumbers' as const,
                label: t('export.optPageNumbers'),
              },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={!!options[key]}
                  onChange={() =>
                    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  className="sr-only"
                  disabled={isExporting}
                />
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
                    options[key]
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  )}
                >
                  {options[key] && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Page Settings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('export.pageSize')}
            </label>
            <select
              value={options.pageSize}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  pageSize: e.target.value as ExportOptions['pageSize'],
                }))
              }
              disabled={isExporting}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t('export.orientation')}
            </label>
            <select
              value={options.orientation}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  orientation: e.target.value as ExportOptions['orientation'],
                }))
              }
              disabled={isExporting}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="portrait">{t('export.portrait')}</option>
              <option value="landscape">{t('export.landscape')}</option>
            </select>
          </div>
        </div>

        {/* Progress indicator */}
        {isExporting && typeof exportStatus.progress === 'number' && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${exportStatus.progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-gray-500">
              {exportStatus.progress}%
            </p>
          </div>
        )}

        {/* Error display */}
        {exportStatus.status === 'failed' && exportStatus.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {exportStatus.error}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ExportDialog;
