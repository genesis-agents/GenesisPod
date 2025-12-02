'use client';

/**
 * AI 陪伴式头像组件
 * Genspark 风格：显示 AI 助手的状态和情感
 */

import React from 'react';
import {
  SparklesIcon,
  BoltIcon,
  HeartIcon,
  LightBulbIcon,
} from '@heroicons/react/24/solid';

type AIState = 'idle' | 'thinking' | 'typing' | 'success' | 'excited' | 'error';

interface AICompanionAvatarProps {
  state?: AIState;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
  message?: string;
}

export default function AICompanionAvatar({
  state = 'idle',
  size = 'md',
  showPulse = false,
  message,
}: AICompanionAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  };

  const getStateStyles = () => {
    switch (state) {
      case 'thinking':
        return {
          gradient: 'from-blue-400 to-purple-500',
          animation: 'animate-pulse',
          icon: SparklesIcon,
        };
      case 'typing':
        return {
          gradient: 'from-blue-500 to-cyan-400',
          animation: '',
          icon: SparklesIcon,
        };
      case 'success':
        return {
          gradient: 'from-green-400 to-emerald-500',
          animation: 'animate-bounce',
          icon: HeartIcon,
        };
      case 'excited':
        return {
          gradient: 'from-yellow-400 to-orange-500',
          animation: 'animate-pulse',
          icon: BoltIcon,
        };
      case 'error':
        return {
          gradient: 'from-red-400 to-pink-500',
          animation: '',
          icon: LightBulbIcon,
        };
      default:
        return {
          gradient: 'from-blue-500 to-purple-600',
          animation: '',
          icon: SparklesIcon,
        };
    }
  };

  const { gradient, animation, icon: Icon } = getStateStyles();

  return (
    <div className="relative inline-flex flex-col items-center">
      {/* 头像容器 */}
      <div className="relative">
        {/* 脉冲效果 */}
        {(showPulse || state === 'thinking') && (
          <div
            className={`absolute -inset-1 rounded-xl bg-gradient-to-br ${gradient} opacity-30 blur-sm ${animation}`}
          />
        )}

        {/* 主头像 */}
        <div
          className={`relative flex ${sizeClasses[size]} items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg ${animation}`}
        >
          <Icon className={`${iconSizes[size]} text-white`} />
        </div>

        {/* 状态指示点 */}
        {state !== 'idle' && (
          <div
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
              state === 'thinking' || state === 'typing'
                ? 'animate-pulse bg-blue-400'
                : state === 'success'
                  ? 'bg-green-400'
                  : state === 'excited'
                    ? 'bg-yellow-400'
                    : state === 'error'
                      ? 'bg-red-400'
                      : 'bg-gray-400'
            }`}
          />
        )}
      </div>

      {/* 消息气泡 */}
      {message && (
        <div className="mt-2 max-w-[150px] rounded-lg bg-gray-900 px-3 py-1.5 text-center text-xs text-white shadow-lg">
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900" />
          {message}
        </div>
      )}
    </div>
  );
}
