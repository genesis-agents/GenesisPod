'use client';

/**
 * AI 打字指示器组件
 * Genspark 风格：显示 AI 正在思考/输入的动画
 */

import React from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';

interface AITypingIndicatorProps {
  message?: string;
  variant?: 'thinking' | 'typing' | 'processing';
}

export default function AITypingIndicator({
  message,
  variant = 'thinking',
}: AITypingIndicatorProps) {
  const getDefaultMessage = () => {
    switch (variant) {
      case 'thinking':
        return 'AI 正在思考...';
      case 'typing':
        return 'AI 正在输入...';
      case 'processing':
        return 'AI 正在处理...';
      default:
        return 'AI 正在工作...';
    }
  };

  return (
    <div className="flex items-start gap-3">
      {/* AI 头像 */}
      <div className="relative flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
          <SparklesIcon className="h-5 w-5 text-white" />
        </div>
        {/* 脉冲动画 */}
        <div className="absolute -inset-1 animate-ping rounded-xl bg-blue-400 opacity-20" />
      </div>

      {/* 消息气泡 */}
      <div className="flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-none bg-gray-100 px-4 py-3">
          {/* 打字动画点 */}
          <div className="flex items-center gap-1">
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: '300ms' }}
            />
          </div>

          {/* 消息文本 */}
          <span className="text-sm text-gray-600">
            {message || getDefaultMessage()}
          </span>
        </div>
      </div>
    </div>
  );
}
