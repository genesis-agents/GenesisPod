'use client';

import React, { useState } from 'react';
import { Loader2, AlertCircle, X, Upload, FileText } from 'lucide-react';

type ResourceType =
  | 'PAPER'
  | 'BLOG'
  | 'NEWS'
  | 'YOUTUBE_VIDEO'
  | 'REPORT'
  | 'EVENT'
  | 'RSS';

interface UploadFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onUploadSuccess: () => void;
  apiBaseUrl: string;
}

const RESOURCE_TYPE_DISPLAY = {
  papers: { name: '学术论文', type: 'PAPER' as ResourceType },
  blogs: { name: '研究博客', type: 'BLOG' as ResourceType },
  reports: { name: '行业报告', type: 'REPORT' as ResourceType },
  youtube: { name: 'YouTube视频', type: 'YOUTUBE_VIDEO' as ResourceType },
  news: { name: '科技新闻', type: 'NEWS' as ResourceType },
};

export function UploadFileDialog({
  isOpen,
  onClose,
  activeTab,
  onUploadSuccess,
  apiBaseUrl,
}: UploadFileDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const resourceTypeInfo = RESOURCE_TYPE_DISPLAY[
    activeTab as keyof typeof RESOURCE_TYPE_DISPLAY
  ] || {
    name: '资源',
    type: 'PAPER' as ResourceType,
  };

  const handleClose = () => {
    setSelectedFile(null);
    setError('');
    setDragActive(false);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File | undefined) => {
    if (!file) return;

    // Validate file type - only allow PDF
    if (file.type !== 'application/pdf') {
      setError('仅支持PDF文件格式');
      setSelectedFile(null);
      return;
    }

    // Validate file size - max 100MB
    const maxSize = 100 * 1024 * 1024; // 100MB in bytes
    if (file.size > maxSize) {
      setError('文件大小不能超过100MB');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError('');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    validateAndSetFile(file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('请选择文件');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('resourceType', resourceTypeInfo.type);

      const response = await fetch(
        `${apiBaseUrl}/api/v1/data-management/import-file`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '文件上传失败');
      }

      // 上传成功 - 直接关闭对话框
      handleClose();
      onUploadSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : '文件上传失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            上传{resourceTypeInfo.name} - PDF文件
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="space-y-4">
            {/* Info Box */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-2 font-semibold text-blue-900">📁 上传说明</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>✓ 仅支持PDF文档格式</li>
                <li>✓ 文件大小不超过100MB</li>
                <li>✓ 系统会自动解析文件内容并支持在线预览</li>
                <li>✓ 上传后即可在资源列表中查看和阅读</li>
              </ul>
            </div>

            {/* Drag and Drop Area */}
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,application/pdf"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                id="file-upload"
              />
              {selectedFile ? (
                <div className="space-y-3">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <FileText className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setError('');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    选择其他文件
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      拖拽PDF文件到这里，或{' '}
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer text-blue-600 hover:text-blue-700"
                      >
                        点击选择文件
                      </label>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      仅支持PDF格式，最大100MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">上传失败</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t px-6 py-4">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>

          <button
            onClick={handleFileUpload}
            disabled={!selectedFile || isLoading}
            className="ml-auto flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {isLoading ? '上传中...' : '开始上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
