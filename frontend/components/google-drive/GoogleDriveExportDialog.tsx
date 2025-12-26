'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Folder,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils/common';
import {
  useGoogleDriveExport,
  type ExportFormat,
  type ExportOptions,
  type Resource,
} from '@/hooks/features/useGoogleDriveExport';
import { GoogleDriveFolderPicker } from './GoogleDriveFolderPicker';

interface GoogleDriveExportDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 选中的资源列表 */
  resources: Resource[];
  /** 导出成功回调 */
  onExportSuccess?: () => void;
}

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Best for sharing',
  },
  {
    value: 'markdown',
    label: 'Markdown',
    description: 'Best for editing',
  },
  {
    value: 'html',
    label: 'HTML',
    description: 'Best for web',
  },
  {
    value: 'original',
    label: 'Original',
    description: 'Keep original format',
  },
];

/**
 * Google Drive 导出对话框
 *
 * 功能：
 * - 显示选中的资源列表
 * - 选择导出格式
 * - 选择目标文件夹
 * - 配置导出选项
 * - 显示导出进度
 */
export function GoogleDriveExportDialog({
  open,
  onClose,
  resources,
  onExportSuccess,
}: GoogleDriveExportDialogProps) {
  const { exportToDrive, isExporting, progress, totalProgress, reset } =
    useGoogleDriveExport();

  // 导出选项
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [folderId, setFolderId] = useState<string | undefined>();
  const [folderName, setFolderName] = useState('My Drive');
  const [includeAISummary, setIncludeAISummary] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(false);

  // 重置状态
  useEffect(() => {
    if (!open) {
      reset();
      setFormat('pdf');
      setFolderId(undefined);
      setFolderName('My Drive');
      setIncludeAISummary(true);
      setIncludeNotes(true);
      setIncludeMetadata(false);
    }
  }, [open, reset]);

  const handleExport = () => {
    const options: ExportOptions = {
      format,
      folderId,
      includeAISummary,
      includeNotes,
      includeMetadata,
    };

    void exportToDrive(resources, options)
      .then((result) => {
        // 导出完成
        if (result && result.failed === 0) {
          setTimeout(() => {
            onExportSuccess?.();
            onClose();
          }, 1500);
        }
      })
      .catch((error) => {
        console.error('Export failed:', error);
      });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={16} className="text-gray-400" />;
      case 'exporting':
        return <Loader2 size={16} className="animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle2 size={16} className="text-green-600" />;
      case 'failed':
        return <XCircle size={16} className="text-red-600" />;
      default:
        return null;
    }
  };

  const canExport = !isExporting && resources.length > 0;
  const hasStarted = progress.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export to Google Drive"
      subtitle={`${resources.length} resource${resources.length !== 1 ? 's' : ''} selected`}
      size="xl"
      closeButtonDisabled={isExporting}
      closeOnOverlayClick={!isExporting}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {hasStarted && !isExporting ? 'Close' : 'Cancel'}
          </button>
          {!hasStarted && (
            <button
              onClick={handleExport}
              disabled={!canExport}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Download size={16} />
              Export {resources.length} Resource
              {resources.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {/* 导出选项 */}
        {!hasStarted && (
          <div className="space-y-6">
            {/* 格式选择 */}
            <div>
              <h4 className="mb-3 font-semibold text-gray-900">
                Export Format
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {FORMAT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer flex-col rounded-lg border-2 p-4 transition-all',
                      format === option.value
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="format"
                        value={option.value}
                        checked={format === option.value}
                        onChange={(e) =>
                          setFormat(e.target.value as ExportFormat)
                        }
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-gray-900">
                        {option.label}
                      </span>
                    </div>
                    <p className="ml-6 mt-1 text-sm text-gray-500">
                      {option.description}
                    </p>
                  </label>
                ))}
              </div>
            </div>

            {/* 目标文件夹 */}
            <div>
              <h4 className="mb-3 font-semibold text-gray-900">
                Target Folder
              </h4>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                  <Folder size={16} />
                  <span className="font-medium">Selected:</span>
                  <span>{folderName}</span>
                </div>
                <GoogleDriveFolderPicker
                  selectedFolderId={folderId}
                  onSelectFolder={(id, name) => {
                    setFolderId(id);
                    setFolderName(name);
                  }}
                  className="max-h-64"
                />
              </div>
            </div>

            {/* 导出选项 */}
            <div>
              <h4 className="mb-3 font-semibold text-gray-900">
                Export Options
              </h4>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={includeAISummary}
                    onChange={(e) => setIncludeAISummary(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      Include AI summary
                    </span>
                    <p className="text-xs text-gray-500">
                      Add AI-generated summary to exported files
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      Include my notes
                    </span>
                    <p className="text-xs text-gray-500">
                      Add your personal notes and annotations
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={includeMetadata}
                    onChange={(e) => setIncludeMetadata(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      Include metadata
                    </span>
                    <p className="text-xs text-gray-500">
                      Add resource metadata (tags, dates, etc.)
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 资源列表 / 进度 */}
        <div>
          <h4 className="mb-3 font-semibold text-gray-900">
            {hasStarted ? 'Export Progress' : 'Resources to Export'}
          </h4>
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            {/* 总进度条 */}
            {hasStarted && (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-gray-600">
                  <span>Overall Progress</span>
                  <span>{totalProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 资源项 */}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {!hasStarted
                ? resources.map((resource) => (
                    <div
                      key={resource.id}
                      className="flex items-center gap-3 rounded-lg bg-white p-3"
                    >
                      <FileText
                        size={20}
                        className="flex-shrink-0 text-blue-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {resource.title}
                        </p>
                        {resource.type && (
                          <p className="text-xs text-gray-500">
                            {resource.type}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                : progress.map((item) => (
                    <div
                      key={item.resourceId}
                      className={cn(
                        'flex items-center gap-3 rounded-lg p-3',
                        item.status === 'success' && 'bg-green-50',
                        item.status === 'failed' && 'bg-red-50',
                        item.status !== 'success' &&
                          item.status !== 'failed' &&
                          'bg-white'
                      )}
                    >
                      <div className="flex-shrink-0">
                        {getStatusIcon(item.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {item.resourceTitle}
                        </p>
                        {item.error && (
                          <p className="text-xs text-red-600">{item.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* 提示信息 */}
        {!hasStarted && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-900">
              Resources will be exported to Google Drive in the selected format.
              You can access them in your <strong>{folderName}</strong> folder.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
