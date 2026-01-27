'use client';

/**
 * Feedback Button Component
 *
 * 全局反馈按钮，可放置在任何位置
 * - 自动捕获当前上下文（topicId, reportId, 选中文本等）
 * - 用户只需输入反馈内容
 */

import { useState, useCallback } from 'react';
import { FeedbackModal } from './FeedbackModal';
import type { ResearchFeedbackCategory } from '@/lib/api/research-feedback';

// 反馈图标
const FeedbackIcon = ({ className }: { className?: string }) => (
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
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    />
  </svg>
);

export interface FeedbackContext {
  topicId?: string;
  topicName?: string;
  reportId?: string;
  sectionId?: string;
  selectedText?: string;
  pageUrl?: string;
  pageTitle?: string;
}

interface FeedbackButtonProps {
  /** 反馈上下文 - 自动捕获的信息 */
  context: FeedbackContext;
  /** 按钮样式变体 */
  variant?: 'floating' | 'inline' | 'icon-only';
  /** 按钮文本 */
  label?: string;
  /** 按钮大小 */
  size?: 'sm' | 'md' | 'lg';
  /** 自定义类名 */
  className?: string;
  /** 提交成功回调 */
  onSuccess?: () => void;
  /** 预设分类（可选） */
  defaultCategory?: ResearchFeedbackCategory;
}

export function FeedbackButton({
  context,
  variant = 'inline',
  label = '反馈',
  size = 'md',
  className = '',
  onSuccess,
  defaultCategory,
}: FeedbackButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setIsModalOpen(false);
    onSuccess?.();
  }, [onSuccess]);

  // 尺寸样式
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  // 变体样式
  if (variant === 'floating') {
    return (
      <>
        <button
          onClick={handleOpen}
          className={`fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl ${className}`}
          title="提交反馈"
        >
          <FeedbackIcon className="h-6 w-6" />
        </button>
        <FeedbackModal
          isOpen={isModalOpen}
          onClose={handleClose}
          onSuccess={handleSuccess}
          context={context}
          defaultCategory={defaultCategory}
        />
      </>
    );
  }

  if (variant === 'icon-only') {
    return (
      <>
        <button
          onClick={handleOpen}
          className={`rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${className}`}
          title="提交反馈"
        >
          <FeedbackIcon className={iconSizes[size]} />
        </button>
        <FeedbackModal
          isOpen={isModalOpen}
          onClose={handleClose}
          onSuccess={handleSuccess}
          context={context}
          defaultCategory={defaultCategory}
        />
      </>
    );
  }

  // inline 变体（默认）
  return (
    <>
      <button
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white font-medium text-gray-700 transition-colors hover:bg-gray-50 ${sizeClasses[size]} ${className}`}
      >
        <FeedbackIcon className={iconSizes[size]} />
        {label}
      </button>
      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSuccess={handleSuccess}
        context={context}
        defaultCategory={defaultCategory}
      />
    </>
  );
}
