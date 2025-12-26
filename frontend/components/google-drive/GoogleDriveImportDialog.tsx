'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Tag,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils/common';
import {
  useGoogleDriveImport,
  type GoogleDriveFile,
  type ImportOptions,
} from '@/hooks/features/useGoogleDriveImport';

interface GoogleDriveImportDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 选中的文件列表 */
  files: GoogleDriveFile[];
  /** 导入成功回调 */
  onImportSuccess?: () => void;
}

/**
 * Google Drive 导入对话框
 *
 * 功能：
 * - 显示选中的文件列表
 * - 配置导入选项
 * - 显示导入进度
 * - 错误处理
 */
export function GoogleDriveImportDialog({
  open,
  onClose,
  files,
  onImportSuccess,
}: GoogleDriveImportDialogProps) {
  const { importFromDrive, isImporting, progress, totalProgress, reset } =
    useGoogleDriveImport();

  // 导入选项
  const [extractContent, setExtractContent] = useState(true);
  const [generateSummary, setGenerateSummary] = useState(true);
  const [collectionId, setCollectionId] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // 重置状态
  useEffect(() => {
    if (!open) {
      reset();
      setExtractContent(true);
      setGenerateSummary(true);
      setCollectionId('');
      setTags([]);
      setTagInput('');
    }
  }, [open, reset]);

  const handleImport = () => {
    const options: ImportOptions = {
      extractContent,
      generateSummary,
      collectionId: collectionId || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };

    void importFromDrive(files, options)
      .then((result) => {
        // 导入完成
        if (result && result.failed === 0) {
          setTimeout(() => {
            onImportSuccess?.();
            onClose();
          }, 1500);
        }
      })
      .catch((error) => {
        console.error('Import failed:', error);
      });
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={16} className="text-gray-400" />;
      case 'importing':
        return <Loader2 size={16} className="animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle2 size={16} className="text-green-600" />;
      case 'failed':
        return <XCircle size={16} className="text-red-600" />;
      default:
        return null;
    }
  };

  const canImport = !isImporting && files.length > 0;
  const hasStarted = progress.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from Google Drive"
      subtitle={`${files.length} file${files.length !== 1 ? 's' : ''} selected`}
      size="xl"
      closeButtonDisabled={isImporting}
      closeOnOverlayClick={!isImporting}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {hasStarted && !isImporting ? 'Close' : 'Cancel'}
          </button>
          {!hasStarted && (
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload size={16} />
              Import {files.length} File{files.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {/* 导入选项 */}
        {!hasStarted && (
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Import Options</h4>

            {/* 基础选项 */}
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={extractContent}
                  onChange={(e) => setExtractContent(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">
                    Extract text content
                  </span>
                  <p className="text-xs text-gray-500">
                    Extract and index text from documents
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={generateSummary}
                  onChange={(e) => setGenerateSummary(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">
                    Generate AI summary
                  </span>
                  <p className="text-xs text-gray-500">
                    Create AI-generated summary for each file
                  </p>
                </div>
              </label>
            </div>

            {/* 集合选择 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Add to collection (optional)
              </label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- No collection --</option>
                {/* TODO: 从 API 加载集合列表 */}
                <option value="1">Research Papers</option>
                <option value="2">Reports</option>
                <option value="3">Documentation</option>
              </select>
            </div>

            {/* 标签输入 */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Apply tags (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Enter tag and press Enter"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700"
                    >
                      <Tag size={12} />
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 文件列表 */}
        <div>
          <h4 className="mb-3 font-semibold text-gray-900">
            {hasStarted ? 'Import Progress' : 'Files to Import'}
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

            {/* 文件项 */}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {!hasStarted
                ? files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 rounded-lg bg-white p-3"
                    >
                      <FileText size={20} className="flex-shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {file.size
                            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                            : 'Unknown size'}
                        </p>
                      </div>
                    </div>
                  ))
                : progress.map((item) => (
                    <div
                      key={item.fileId}
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
                          {item.fileName}
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
              Files will be imported to your Library and processed according to
              the options above. This may take a few moments depending on file
              size.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
