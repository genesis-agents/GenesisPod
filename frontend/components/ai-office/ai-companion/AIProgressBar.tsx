'use client';

/**
 * AI 进度条组件
 * Genspark 风格：显示 AI 生成文档的进度和步骤
 */

import React from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  SparklesIcon,
  DocumentTextIcon,
  PhotoIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface Step {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message?: string;
}

interface AIProgressBarProps {
  steps: Step[];
  currentStep: string;
  progress: number; // 0-100
  estimatedTime?: number; // 秒
  onCancel?: () => void;
}

export default function AIProgressBar({
  steps,
  currentStep,
  progress,
  estimatedTime,
  onCancel,
}: AIProgressBarProps) {
  const getStepIcon = (step: Step) => {
    if (step.status === 'completed') {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    }
    if (step.status === 'processing') {
      return <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-500" />;
    }
    if (step.status === 'error') {
      return <span className="text-red-500">!</span>;
    }
    return <ClockIcon className="h-5 w-5 text-gray-300" />;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI 正在生成文档</h3>
            <p className="text-sm text-gray-500">
              {steps.find((s) => s.id === currentStep)?.message || '请稍候...'}
            </p>
          </div>
        </div>

        {/* 预计时间 */}
        {estimatedTime && estimatedTime > 0 && (
          <div className="text-right">
            <p className="text-sm text-gray-500">预计剩余</p>
            <p className="font-mono text-lg font-semibold text-gray-900">
              {Math.floor(estimatedTime / 60)}:
              {String(estimatedTime % 60).padStart(2, '0')}
            </p>
          </div>
        )}
      </div>

      {/* 进度条 */}
      <div className="px-6 py-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-600">生成进度</span>
          <span className="font-mono font-medium text-blue-600">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="border-t border-gray-100 px-6 py-4">
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 ${
                step.status === 'pending' ? 'opacity-50' : ''
              }`}
            >
              {/* 步骤图标 */}
              <div className="flex-shrink-0">{getStepIcon(step)}</div>

              {/* 步骤信息 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      step.status === 'completed'
                        ? 'text-green-600'
                        : step.status === 'processing'
                          ? 'text-blue-600'
                          : step.status === 'error'
                            ? 'text-red-600'
                            : 'text-gray-400'
                    }`}
                  >
                    {step.name}
                  </span>
                  {step.status === 'processing' && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                      进行中
                    </span>
                  )}
                </div>
                {step.message && step.status !== 'pending' && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {step.message}
                  </p>
                )}
              </div>

              {/* 连接线 */}
              {index < steps.length - 1 && (
                <div className="absolute left-[27px] mt-8 h-4 w-0.5 bg-gray-200" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作 */}
      {onCancel && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <button
            onClick={onCancel}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            取消生成
          </button>
        </div>
      )}
    </div>
  );
}
