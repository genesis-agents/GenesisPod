'use client';

/**
 * Feedback Modal Component
 *
 * 反馈提交弹窗
 * - 自动显示捕获的上下文
 * - 用户只需输入反馈内容和选择分类
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createFeedback,
  type ResearchFeedbackCategory,
} from '@/lib/api/research-feedback';
import type { FeedbackContext } from './FeedbackButton';

// 关闭图标
const CloseIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

// 发送图标
const SendIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

// 成功图标
const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

// 反馈分类配置
const CATEGORY_CONFIG: {
  value: ResearchFeedbackCategory;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'QUALITY_ISSUE',
    label: '质量问题',
    description: '内容逻辑不通、表述混乱',
    icon: '!',
  },
  {
    value: 'CONTENT_ERROR',
    label: '内容错误',
    description: '数据错误、引用错误、事实错误',
    icon: 'X',
  },
  {
    value: 'FEATURE_REQUEST',
    label: '功能建议',
    description: '希望增加新功能或改进现有功能',
    icon: '+',
  },
  {
    value: 'IMPROVEMENT',
    label: '改进建议',
    description: '表述、结构、格式等可以改进的地方',
    icon: '^',
  },
  {
    value: 'POSITIVE',
    label: '正面反馈',
    description: '做得好的地方，值得保持',
    icon: '*',
  },
];

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  context: FeedbackContext;
  defaultCategory?: ResearchFeedbackCategory;
}

export function FeedbackModal({
  isOpen,
  onClose,
  onSuccess,
  context,
  defaultCategory,
}: FeedbackModalProps) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<
    ResearchFeedbackCategory | undefined
  >(defaultCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setCategory(defaultCategory);
      setSubmitSuccess(false);
      setError(null);
      // 聚焦到输入框
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultCategory]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) {
      setError('请输入反馈内容');
      return;
    }

    if (!context.topicId) {
      setError('无法获取当前专题信息，请刷新页面重试');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createFeedback({
        content: content.trim(),
        topicId: context.topicId,
        reportId: context.reportId,
        sectionId: context.sectionId,
        selectedText: context.selectedText,
        sourceType: 'MANUAL',
        category,
      });

      setSubmitSuccess(true);
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  }, [content, category, context, onSuccess]);

  // Ctrl+Enter 提交
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* 成功状态 */}
        {submitSuccess ? (
          <div className="flex flex-col items-center justify-center px-6 py-12">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckIcon className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              反馈已提交
            </h3>
            <p className="text-sm text-gray-500">
              感谢您的反馈，我们会认真处理
            </p>
          </div>
        ) : (
          <>
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">提交反馈</h2>
              <button
                onClick={onClose}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {/* 上下文信息 */}
            {(context.topicName || context.selectedText) && (
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                {context.topicName && (
                  <div className="mb-1 text-xs text-gray-500">
                    专题:{' '}
                    <span className="font-medium text-gray-700">
                      {context.topicName}
                    </span>
                  </div>
                )}
                {context.selectedText && (
                  <div className="text-xs text-gray-500">
                    选中内容:{' '}
                    <span className="italic text-gray-600">
                      &ldquo;{context.selectedText.slice(0, 100)}
                      {context.selectedText.length > 100 ? '...' : ''}&rdquo;
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 表单 */}
            <div className="px-4 py-4">
              {/* 分类选择 */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  反馈类型 <span className="text-gray-400">(可选)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_CONFIG.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() =>
                        setCategory(
                          category === cat.value ? undefined : cat.value
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        category === cat.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title={cat.description}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 反馈内容 */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  反馈内容
                </label>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="请描述您遇到的问题或建议..."
                  rows={4}
                  className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Ctrl+Enter 快速提交</span>
                  <span>{content.length}/2000</span>
                </div>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>

            {/* 底部 */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    提交中...
                  </>
                ) : (
                  <>
                    <SendIcon className="h-4 w-4" />
                    提交反馈
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
