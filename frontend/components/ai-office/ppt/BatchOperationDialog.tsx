'use client';

/**
 * BatchOperationDialog - PPT 批量操作对话框
 *
 * 功能：
 * 1. 批量更新页脚、页眉、背景、字体等样式
 * 2. 选择应用范围（全部页面或指定页面）
 * 3. 实时预览效果
 *
 * API 调用：
 * - POST /api/ai-office/ppt/{id}/batch-update - 执行批量更新
 */

import React, { useState } from 'react';
import {
  X,
  Loader2,
  Check,
  AlertCircle,
  FileText,
  Palette,
  Type,
  Image,
  Layout,
} from 'lucide-react';
import { useApiPost } from '@/hooks/core/useApi';

// ============================================
// 类型定义
// ============================================

type BatchOperation =
  | 'update_footer'
  | 'update_header'
  | 'update_background'
  | 'update_font'
  | 'update_safe_area'
  | 'update_logo';

interface BatchOperationDialogProps {
  pptId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  totalSlides: number;
}

interface OperationConfig {
  id: BatchOperation;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const OPERATIONS: OperationConfig[] = [
  {
    id: 'update_footer',
    label: '更新页脚',
    icon: <FileText className="h-5 w-5" />,
    description: '统一设置所有页面的页脚格式和样式',
  },
  {
    id: 'update_header',
    label: '更新页眉',
    icon: <FileText className="h-5 w-5" />,
    description: '统一设置所有页面的页眉内容和位置',
  },
  {
    id: 'update_background',
    label: '更新背景',
    icon: <Palette className="h-5 w-5" />,
    description: '批量更改背景颜色或渐变效果',
  },
  {
    id: 'update_font',
    label: '更新字体',
    icon: <Type className="h-5 w-5" />,
    description: '统一设置标题和正文字体',
  },
  {
    id: 'update_safe_area',
    label: '更新安全区',
    icon: <Layout className="h-5 w-5" />,
    description: '调整内容区域边距，避免与页眉页脚重叠',
  },
  {
    id: 'update_logo',
    label: '添加 Logo',
    icon: <Image className="h-5 w-5" />,
    description: '在所有页面添加品牌 Logo',
  },
];

// ============================================
// 主组件
// ============================================

export const BatchOperationDialog: React.FC<BatchOperationDialogProps> = ({
  pptId,
  isOpen,
  onClose,
  onSuccess,
  totalSlides,
}) => {
  const [selectedOperation, setSelectedOperation] =
    useState<BatchOperation | null>(null);
  const [pageRange, setPageRange] = useState<'all' | 'selected'>('all');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [config, setConfig] = useState<Record<string, any>>({});

  const { execute, loading, error } = useApiPost(
    `/api/ai-office/ppt/${pptId}/batch-update`
  );

  const handleExecute = async () => {
    if (!selectedOperation) return;

    try {
      await execute({
        operation: selectedOperation,
        config,
        targetSlides: pageRange === 'all' ? 'all' : selectedPages,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('Batch operation failed:', e);
    }
  };

  const togglePage = (page: number) => {
    setSelectedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            批量操作
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {/* 操作选择 */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              选择操作类型
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {OPERATIONS.map((op) => (
                <button
                  key={op.id}
                  onClick={() => setSelectedOperation(op.id)}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selectedOperation === op.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <div
                    className={`${
                      selectedOperation === op.id
                        ? 'text-blue-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {op.icon}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {op.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {op.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 页面范围选择 */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              应用范围
            </h3>
            <div className="mb-3 flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={pageRange === 'all'}
                  onChange={() => setPageRange('all')}
                  className="text-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  全部页面 ({totalSlides} 页)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={pageRange === 'selected'}
                  onChange={() => setPageRange('selected')}
                  className="text-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  选择页面
                </span>
              </label>
            </div>

            {pageRange === 'selected' && (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: totalSlides }, (_, i) => i + 1).map(
                  (page) => (
                    <button
                      key={page}
                      onClick={() => togglePage(page)}
                      className={`h-8 w-8 rounded border text-sm ${
                        selectedPages.includes(page)
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* 配置区域 - 根据选择的操作显示不同配置 */}
          {selectedOperation && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                配置选项
              </h3>
              <OperationConfigForm
                operation={selectedOperation}
                config={config}
                onChange={setConfig}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error?.message || '操作失败'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t p-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleExecute}
            disabled={!selectedOperation || loading}
            className="flex items-center gap-2 rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                执行操作
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// 配置表单组件
// ============================================

interface OperationConfigFormProps {
  operation: BatchOperation;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

const OperationConfigForm: React.FC<OperationConfigFormProps> = ({
  operation,
  config,
  onChange,
}) => {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  switch (operation) {
    case 'update_footer':
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              页脚格式
            </label>
            <input
              type="text"
              value={config.format || '{page}/{total}'}
              onChange={(e) => updateConfig('format', e.target.value)}
              placeholder="第{page}页 | {brand}"
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
            <p className="mt-1 text-xs text-gray-500">
              可用变量: {'{page}'} - 页码, {'{total}'} - 总页数, {'{brand}'} -
              品牌名
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              位置
            </label>
            <select
              value={config.position || 'bottom-right'}
              onChange={(e) => updateConfig('position', e.target.value)}
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="bottom-left">左下角</option>
              <option value="bottom-center">底部居中</option>
              <option value="bottom-right">右下角</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              品牌名称
            </label>
            <input
              type="text"
              value={config.brand || ''}
              onChange={(e) => updateConfig('brand', e.target.value)}
              placeholder="输入品牌名称"
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
        </div>
      );

    case 'update_background':
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              背景类型
            </label>
            <select
              value={config.type || 'solid'}
              onChange={(e) => updateConfig('type', e.target.value)}
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="solid">纯色</option>
              <option value="gradient">渐变</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              主色调
            </label>
            <input
              type="color"
              value={config.color || '#ffffff'}
              onChange={(e) => updateConfig('color', e.target.value)}
              className="h-10 w-full cursor-pointer rounded"
            />
          </div>
          {config.type === 'gradient' && (
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                渐变终点色
              </label>
              <input
                type="color"
                value={config.gradient?.to || '#f0f0f0'}
                onChange={(e) =>
                  updateConfig('gradient', {
                    ...config.gradient,
                    to: e.target.value,
                  })
                }
                className="h-10 w-full cursor-pointer rounded"
              />
            </div>
          )}
        </div>
      );

    case 'update_font':
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              标题字体
            </label>
            <select
              value={config.headingFont || 'Inter'}
              onChange={(e) => updateConfig('headingFont', e.target.value)}
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="Inter">Inter</option>
              <option value="Roboto">Roboto</option>
              <option value="Noto Sans SC">Noto Sans SC (思源黑体)</option>
              <option value="PingFang SC">PingFang SC (苹方)</option>
              <option value="Microsoft YaHei">
                Microsoft YaHei (微软雅黑)
              </option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              正文字体
            </label>
            <select
              value={config.bodyFont || 'Inter'}
              onChange={(e) => updateConfig('bodyFont', e.target.value)}
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="Inter">Inter</option>
              <option value="Roboto">Roboto</option>
              <option value="Noto Sans SC">Noto Sans SC (思源黑体)</option>
              <option value="PingFang SC">PingFang SC (苹方)</option>
              <option value="Microsoft YaHei">
                Microsoft YaHei (微软雅黑)
              </option>
            </select>
          </div>
        </div>
      );

    case 'update_safe_area':
      return (
        <div className="grid grid-cols-2 gap-4">
          {['top', 'bottom', 'left', 'right'].map((side) => (
            <div key={side}>
              <label className="mb-1 block text-sm capitalize text-gray-600 dark:text-gray-400">
                {side === 'top'
                  ? '上'
                  : side === 'bottom'
                    ? '下'
                    : side === 'left'
                      ? '左'
                      : '右'}
                边距 (px)
              </label>
              <input
                type="number"
                value={config[side] || 80}
                onChange={(e) => updateConfig(side, parseInt(e.target.value))}
                min={0}
                max={200}
                className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>
          ))}
        </div>
      );

    case 'update_logo':
      return (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              Logo URL
            </label>
            <input
              type="text"
              value={config.url || ''}
              onChange={(e) => updateConfig('url', e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              位置
            </label>
            <select
              value={config.position || 'top-right'}
              onChange={(e) => updateConfig('position', e.target.value)}
              className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="top-left">左上角</option>
              <option value="top-right">右上角</option>
              <option value="bottom-left">左下角</option>
              <option value="bottom-right">右下角</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                宽度 (px)
              </label>
              <input
                type="number"
                value={config.width || 120}
                onChange={(e) =>
                  updateConfig('width', parseInt(e.target.value))
                }
                min={20}
                max={300}
                className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                高度 (px)
              </label>
              <input
                type="number"
                value={config.height || 40}
                onChange={(e) =>
                  updateConfig('height', parseInt(e.target.value))
                }
                min={20}
                max={200}
                className="w-full rounded border px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>
          </div>
        </div>
      );

    default:
      return <p className="text-sm text-gray-500">该操作暂无配置选项</p>;
  }
};

export default BatchOperationDialog;
