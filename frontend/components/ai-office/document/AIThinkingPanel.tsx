'use client';

/**
 * AIThinkingPanel - AI 思考过程展示面板
 * Genspark 风格的 AI 工具调用和思考步骤展示
 *
 * 支持两种使用方式:
 * 1. 传入 steps 属性直接使用
 * 2. 使用 useAgentStore=true 从 agentStore 获取数据
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WrenchScrewdriverIcon,
  LightBulbIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  SparklesIcon,
  DocumentTextIcon,
  PhotoIcon,
  PaintBrushIcon,
  ExclamationCircleIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils/common';
import {
  ThinkingStep,
  useThinkingSteps,
  useIsProcessing,
} from '@/stores';

// AI 思考步骤状态
export type ThinkingStepStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'error';

// AI 思考步骤 (兼容旧接口)
export interface AIThinkingStep {
  id: string;
  tool: string; // 使用的工具名称
  description: string; // 描述
  status: ThinkingStepStatus;
  startTime?: Date;
  endTime?: Date;
  progress?: number; // 0-100 进度
  duration?: number; // 耗时（毫秒）
  input?: any;
  output?: any;
  subSteps?: {
    label: string;
    completed: boolean;
  }[];
  metadata?: Record<string, any>;
}

interface AIThinkingPanelProps {
  /** 传入的步骤列表（与 useAgentStore 二选一） */
  steps?: AIThinkingStep[];
  /** 是否正在生成（与 useAgentStore 二选一） */
  isGenerating?: boolean;
  /** 是否从 agentStore 获取数据 */
  useAgentStore?: boolean;
  currentTool?: string;
  currentDescription?: string;
  className?: string;
}

// 工具图标映射
const toolIcons: Record<string, React.ElementType> = {
  outline: DocumentTextIcon,
  layout: PaintBrushIcon,
  content: SparklesIcon,
  image: PhotoIcon,
  text_generation: SparklesIcon,
  code_generation: CodeBracketIcon,
  code_execution: CodeBracketIcon,
  web_search: MagnifyingGlassIcon,
  image_generation: PhotoIcon,
  document_creation: DocumentTextIcon,
  slide_creation: DocumentTextIcon,
  thinking: LightBulbIcon,
  default: WrenchScrewdriverIcon,
};

// 工具名称映射
const toolLabels: Record<string, string> = {
  outline: '大纲规划',
  layout: '布局设计',
  content: '内容生成',
  image: '图片处理',
  text_generation: '文本生成',
  code_generation: '代码生成',
  code_execution: '代码执行',
  web_search: '网络搜索',
  image_generation: '图片生成',
  document_creation: '文档创建',
  slide_creation: '幻灯片创建',
  thinking: '深度思考',
};

/**
 * 格式化持续时间
 */
function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AIThinkingPanel({
  steps: propSteps,
  isGenerating: propIsGenerating,
  useAgentStore: useStore = false,
  currentTool,
  currentDescription,
  className,
}: AIThinkingPanelProps) {
  const [isToolExpanded, setIsToolExpanded] = useState(true);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);

  // 从 store 获取数据（如果启用）
  const storeSteps = useThinkingSteps();
  const storeIsProcessing = useIsProcessing();

  // 使用 store 数据或传入的 props
  const steps: AIThinkingStep[] = useStore
    ? storeSteps.map((s) => ({
        ...s,
        status: s.status as ThinkingStepStatus,
      }))
    : propSteps || [];
  const isGenerating = useStore
    ? storeIsProcessing
    : (propIsGenerating ?? false);

  // 统计待办项
  const allSubSteps = steps.flatMap((s) => s.subSteps || []);
  const completedSubSteps = allSubSteps.filter((s) => s.completed).length;
  const pendingSubSteps = allSubSteps.length - completedSubSteps;

  // 获取当前正在处理的步骤
  const processingStep = steps.find((s) => s.status === 'processing');
  const completedSteps = steps.filter((s) => s.status === 'completed');
  const errorSteps = steps.filter((s) => s.status === 'error');

  if (steps.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* 使用工具卡片 */}
      {(processingStep || currentTool) && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* 头部 */}
          <button
            onClick={() => setIsToolExpanded(!isToolExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <WrenchScrewdriverIcon className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                使用工具
              </span>
            </div>
            <ChevronDownIcon
              className={cn(
                'h-4 w-4 text-gray-400 transition-transform',
                isToolExpanded && 'rotate-180'
              )}
            />
          </button>

          {/* 内容 */}
          <AnimatePresence>
            {isToolExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-100"
              >
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    {/* 工具图标 */}
                    <div className="flex-shrink-0">
                      {(() => {
                        const toolKey =
                          currentTool || processingStep?.tool || 'default';
                        const Icon = toolIcons[toolKey] || toolIcons.default;
                        return (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-purple-50">
                            <Icon className="h-5 w-5 text-blue-600" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* 工具信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {toolLabels[
                            currentTool || processingStep?.tool || ''
                          ] || '演示文稿'}
                        </span>
                        {isGenerating && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                            处理中
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-gray-500">
                        {currentDescription ||
                          processingStep?.description ||
                          '正在生成内容...'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 深度思考卡片 */}
      {(steps.length > 0 || isGenerating) && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* 头部 */}
          <button
            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <LightBulbIcon className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">
                深度思考
              </span>
            </div>
            <div className="flex items-center gap-3">
              {allSubSteps.length > 0 && (
                <span className="text-xs text-gray-500">
                  总计: {allSubSteps.length} 个待办事项
                </span>
              )}
              <ChevronDownIcon
                className={cn(
                  'h-4 w-4 text-gray-400 transition-transform',
                  isThinkingExpanded && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* 内容 */}
          <AnimatePresence>
            {isThinkingExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-100"
              >
                <div className="space-y-3 px-4 py-3">
                  {/* 进度摘要 */}
                  {allSubSteps.length > 0 && (
                    <div className="text-sm text-gray-600">
                      {pendingSubSteps > 0 ? (
                        <span>还剩 {pendingSubSteps} 个待办事项</span>
                      ) : (
                        <span className="text-green-600">所有任务已完成</span>
                      )}
                    </div>
                  )}

                  {/* 步骤列表 */}
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <div key={step.id} className="space-y-1.5">
                        {/* 步骤标题 */}
                        <div className="flex items-center gap-2">
                          {step.status === 'completed' ? (
                            <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-500" />
                          ) : step.status === 'processing' ? (
                            <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          ) : step.status === 'error' ? (
                            <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 text-red-500" />
                          ) : (
                            <ClockIcon className="h-4 w-4 flex-shrink-0 text-gray-300" />
                          )}
                          <span
                            className={cn(
                              'flex-1 truncate text-sm',
                              step.status === 'completed'
                                ? 'text-gray-500'
                                : step.status === 'processing'
                                  ? 'font-medium text-blue-700'
                                  : step.status === 'error'
                                    ? 'text-red-600'
                                    : 'text-gray-400'
                            )}
                          >
                            {step.description}
                          </span>
                          {/* 显示耗时 */}
                          {step.duration && (
                            <span className="flex-shrink-0 text-xs text-gray-400">
                              {formatDuration(step.duration)}
                            </span>
                          )}
                        </div>

                        {/* 子步骤 */}
                        {step.subSteps && step.subSteps.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {step.subSteps.map((subStep, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-sm"
                              >
                                {subStep.completed ? (
                                  <CheckCircleIcon className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                                ) : (
                                  <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-gray-300" />
                                )}
                                <span
                                  className={cn(
                                    subStep.completed
                                      ? 'text-gray-400 line-through'
                                      : 'text-gray-600'
                                  )}
                                >
                                  {subStep.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 加载占位 */}
                    {isGenerating && steps.length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        <span>正在分析需求...</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 完成状态 */}
      {!isGenerating &&
        completedSteps.length > 0 &&
        completedSteps.length === steps.length && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
            <span>PPT 生成完成！共 {completedSteps.length} 个步骤</span>
          </div>
        )}
    </div>
  );
}
