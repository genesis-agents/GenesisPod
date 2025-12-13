'use client';

/**
 * AI Designer Tab 内容组件
 * 在 AI Office 页面的 Tab 中使用
 * 智能设计助手 - 信息图、数据可视化、流程图、海报等
 */

/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  RefreshCw,
  ZoomIn,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

import { PromptBar } from '@/components/ai-office/core/PromptBar';
import {
  ProgressTracker,
  ProgressOverlay,
} from '@/components/ai-office/core/ProgressTracker';
import {
  AgentType,
  AgentInput,
  AGENT_CONFIGS,
} from '@/lib/ai-office/agents/types';
import { useAgentStore } from '@/stores/agentStore';
import {
  executeAgent,
  subscribeToTask,
  cancelTask,
} from '@/lib/ai-office/agents/api';
import { cn } from '@/lib/utils/common';

// 设计模板定义
const DESIGNER_TEMPLATES = [
  {
    id: 'infographic',
    name: '信息图',
    description: '数据驱动的专业信息图',
    icon: '📊',
    prompt: '创建关于[主题]的信息图',
  },
  {
    id: 'data-visualization',
    name: '数据可视化',
    description: '图表和统计数据展示',
    icon: '📈',
    prompt: '可视化[数据类型]数据',
  },
  {
    id: 'process-flow',
    name: '流程图',
    description: '业务流程和步骤说明',
    icon: '🔄',
    prompt: '绘制[流程名称]的流程图',
  },
  {
    id: 'comparison',
    name: '对比图',
    description: '方案对比和优劣分析',
    icon: '⚖️',
    prompt: '对比[选项A]和[选项B]',
  },
  {
    id: 'poster',
    name: '海报设计',
    description: '活动海报和宣传图',
    icon: '🎨',
    prompt: '设计[活动/产品]的宣传海报',
  },
];

// 布局模板选项
const LAYOUT_OPTIONS = [
  { id: 'cards', name: '卡片式', description: '多卡片网格布局' },
  { id: 'center_visual', name: '中心视觉', description: '中心聚焦设计' },
  { id: 'timeline', name: '时间线', description: '时序流程展示' },
  { id: 'comparison', name: '对比式', description: '左右对比布局' },
  { id: 'statistics', name: '统计式', description: '数据统计展示' },
  { id: 'pyramid', name: '金字塔', description: '层级结构展示' },
];

// 宽高比选项
const ASPECT_RATIO_OPTIONS = [
  { id: '16:9', name: '16:9', description: '横向宽屏' },
  { id: '9:16', name: '9:16', description: '竖向海报' },
  { id: '1:1', name: '1:1', description: '正方形' },
  { id: '4:3', name: '4:3', description: '标准比例' },
];

// 设计风格选项
const STYLE_OPTIONS = [
  { id: 'consulting', name: '咨询风', color: '#1e3a5f' },
  { id: 'tech', name: '科技风', color: '#6366f1' },
  { id: 'minimal', name: '极简风', color: '#18181b' },
  { id: 'creative', name: '创意风', color: '#ec4899' },
  { id: 'dark', name: '暗黑风', color: '#0f172a' },
];

export default function DesignerTab() {
  const agentConfig = AGENT_CONFIGS[AgentType.DESIGNER];
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // AI 解析后的意图状态
  const [parsedIntent, setParsedIntent] = useState<{
    urls: string[];
    designType: string | null;
    aspectRatio: string | null;
    style: string | null;
    cleanPrompt: string;
  } | null>(null);

  // 处理提交（使用后端意图解析）
  const handleSubmit = useCallback(
    async (input: AgentInput) => {
      setIsGenerating(true);
      resetProgress();
      updateProgress({
        phase: 'planning',
        percentage: 0,
        message: '正在分析设计需求...',
      });

      try {
        // 1. 调用后端意图解析 API
        let intentData = {
          urls: [] as string[],
          designType: 'cards',
          aspectRatio: '16:9',
          style: 'consulting',
          cleanPrompt: input.prompt,
        };

        try {
          const intentResponse = await fetch('/api/ai-office/parse-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: input.prompt }),
          });
          if (intentResponse.ok) {
            intentData = await intentResponse.json();
          }
        } catch (parseError) {
          console.warn('Intent parsing failed, using defaults:', parseError);
        }
        setParsedIntent(intentData);

        // 2. 使用解析后的参数构建增强输入
        const enhancedInput: AgentInput = {
          ...input,
          urls: intentData.urls || [],
          options: {
            ...input.options,
            templateLayout: intentData.designType || 'cards',
            aspectRatio: intentData.aspectRatio || '16:9',
            style: intentData.style || 'consulting',
          },
        };

        // 调用 API 开始生成
        const taskResponse = await executeAgent(
          enhancedInput,
          AgentType.DESIGNER
        );
        setCurrentTaskId(taskResponse.taskId);

        // 订阅进度更新
        const unsubscribe = subscribeToTask(taskResponse.taskId, (event) => {
          handleEvent(event);

          if (event.type === 'complete' || event.type === 'error') {
            setIsGenerating(false);
            unsubscribe();
          }
        });
      } catch (error) {
        console.error('Failed to start generation:', error);
        updateProgress({
          phase: 'error',
          message: error instanceof Error ? error.message : '生成失败',
        });
        setIsGenerating(false);
      }
    },
    [resetProgress, updateProgress, handleEvent]
  );

  // 处理取消
  const handleCancel = useCallback(async () => {
    if (currentTaskId) {
      try {
        await cancelTask(currentTaskId);
      } catch (error) {
        console.error('Failed to cancel:', error);
      }
    }
    setIsGenerating(false);
    resetProgress();
  }, [currentTaskId, resetProgress]);

  // 处理模板选择
  const handleTemplateSelect = (_template: (typeof DESIGNER_TEMPLATES)[0]) => {
    // TODO: Implement template selection
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* 头部 */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-pink-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">{agentConfig.name}</h1>
              <p className="text-xs text-gray-500">{agentConfig.description}</p>
            </div>
          </div>
        </div>
      </header>

      {/* AI 解析结果提示 */}
      <AnimatePresence>
        {parsedIntent && isGenerating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-gray-200 bg-gradient-to-r from-pink-50 to-rose-50 px-6 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">AI 理解:</span>
              {parsedIntent.urls.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  📎 {parsedIntent.urls.length} 个链接
                </span>
              )}
              {parsedIntent.designType && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                  📐{' '}
                  {LAYOUT_OPTIONS.find((l) => l.id === parsedIntent.designType)
                    ?.name || parsedIntent.designType}
                </span>
              )}
              {parsedIntent.aspectRatio && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  📏 {parsedIntent.aspectRatio}
                </span>
              )}
              {parsedIntent.style && (
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                  🎨{' '}
                  {STYLE_OPTIONS.find((s) => s.id === parsedIntent.style)
                    ?.name || parsedIntent.style}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto px-6 py-6">
        {/* 模板区域 */}
        {!isGenerating && progress.phase === 'idle' && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-medium">快速开始</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {DESIGNER_TEMPLATES.map((template) => (
                <motion.button
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTemplateSelect(template)}
                  className="rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-pink-300 hover:bg-pink-50/50"
                >
                  <span className="mb-2 block text-2xl">{template.icon}</span>
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {template.description}
                  </p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 进度展示 */}
        {(isGenerating || progress.phase !== 'idle') &&
          progress.phase !== 'completed' && (
            <div className="mb-8">
              <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <ProgressTracker progress={progress} showToolCalls />
                {isGenerating && (
                  <button
                    onClick={handleCancel}
                    className="mt-4 w-full py-2 text-sm text-gray-500 transition-colors hover:text-red-500"
                  >
                    取消生成
                  </button>
                )}
              </div>
            </div>
          )}

        {/* 结果展示 */}
        {progress.phase === 'completed' && result && (
          <div className="mb-8">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <h3 className="text-lg font-semibold">生成完成</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resetProgress()}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      重新生成
                    </button>
                    {result.artifacts.map((artifact) => (
                      <React.Fragment key={artifact.id}>
                        <button
                          onClick={() => setShowPreview(true)}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
                        >
                          <ZoomIn className="h-4 w-4" />
                          预览
                        </button>
                        <a
                          href={artifact.url}
                          download
                          className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm text-white transition-colors hover:bg-pink-700"
                        >
                          <Download className="h-4 w-4" />
                          下载图片
                        </a>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <p className="text-gray-600">{result.summary}</p>
                <div className="mt-4 text-sm text-gray-500">
                  耗时: {(result.duration / 1000).toFixed(1)}s
                </div>

                {/* 图片预览 */}
                {result.artifacts.length > 0 && (
                  <div className="mt-6">
                    <div className="overflow-hidden rounded-lg bg-gray-100">
                      <img
                        src={result.artifacts[0].url}
                        alt="Generated design"
                        className="h-auto w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 底部占位 */}
        <div className="h-32" />
      </main>

      {/* 输入区域 - 固定在底部 */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <PromptBar
            agentType={AgentType.DESIGNER}
            placeholder="直接描述你想要的设计，AI会自动理解。例如：&#10;• 基于 https://example.com 创建一张科技风信息图&#10;• 设计一张竖版海报，极简风格&#10;• 做一个数据对比图，16:9比例"
            onSubmit={handleSubmit}
            isProcessing={isGenerating}
          />
          <p className="mt-2 text-center text-xs text-gray-400">
            支持直接粘贴URL、指定布局、比例、风格等，AI会自动理解
          </p>
        </div>
      </div>

      {/* 进度遮罩（全屏模式） */}
      <AnimatePresence>
        {isGenerating && progress.phase === 'executing' && (
          <ProgressOverlay progress={progress} onCancel={handleCancel} />
        )}
      </AnimatePresence>

      {/* 全屏预览 */}
      <AnimatePresence>
        {showPreview && result && result.artifacts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
            onClick={() => setShowPreview(false)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={result.artifacts[0].url}
              alt="Preview"
              className="max-h-full max-w-full rounded-lg shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
