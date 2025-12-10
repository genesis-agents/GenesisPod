'use client';

/**
 * AI Designer 页面
 * 智能设计助手
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Settings,
  Image as ImageIcon,
  ZoomIn,
} from 'lucide-react';
import Link from 'next/link';

import Sidebar from '@/components/layout/Sidebar';
import { PromptBar } from '@/components/ai-office/core/PromptBar';
import {
  ProgressTracker,
  ProgressOverlay,
} from '@/components/ai-office/core/ProgressTracker';
import { AgentType, AgentInput, AGENT_CONFIGS } from '@/lib/agents/types';
import { useAgentStore } from '@/stores/agentStore';
import { executeAgent, subscribeToTask, cancelTask } from '@/lib/agents/api';
import { cn } from '@/lib/utils';

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

export default function DesignerPage() {
  const agentConfig = AGENT_CONFIGS[AgentType.DESIGNER];
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 设置选项
  const [templateLayout, setTemplateLayout] = useState('cards');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [style, setStyle] = useState('consulting');

  // 处理提交
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
        // 添加选项
        const enhancedInput: AgentInput = {
          ...input,
          options: {
            ...input.options,
            templateLayout,
            aspectRatio,
            style,
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
    [
      templateLayout,
      aspectRatio,
      style,
      resetProgress,
      updateProgress,
      handleEvent,
    ]
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
  const handleTemplateSelect = (template: (typeof DESIGNER_TEMPLATES)[0]) => {
    console.log('Selected template:', template);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 全局左侧菜单 */}
      <Sidebar />

      {/* 主内容区域 */}
      <div className="bg-background flex flex-1 flex-col overflow-hidden">
        {/* 头部 */}
        <header className="border-border bg-background/95 sticky top-0 z-40 flex-shrink-0 border-b backdrop-blur-sm">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <Link
                href="/ai-office"
                className="hover:bg-muted rounded-lg p-2 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{agentConfig.icon}</span>
                <div>
                  <h1 className="font-semibold">{agentConfig.name}</h1>
                  <p className="text-muted-foreground text-xs">
                    {agentConfig.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  showSettings
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto px-6 py-8">
          {/* 设置面板 */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden"
              >
                <div className="bg-muted/50 space-y-4 rounded-xl p-4">
                  {/* 布局模板 */}
                  <div>
                    <h3 className="mb-3 font-medium">布局模板</h3>
                    <div className="flex flex-wrap gap-2">
                      {LAYOUT_OPTIONS.map((layout) => (
                        <button
                          key={layout.id}
                          onClick={() => setTemplateLayout(layout.id)}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-left transition-all',
                            templateLayout === layout.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="text-sm font-medium">
                            {layout.name}
                          </span>
                          <p className="text-muted-foreground text-xs">
                            {layout.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 宽高比 */}
                  <div>
                    <h3 className="mb-3 font-medium">宽高比</h3>
                    <div className="flex flex-wrap gap-2">
                      {ASPECT_RATIO_OPTIONS.map((ratio) => (
                        <button
                          key={ratio.id}
                          onClick={() => setAspectRatio(ratio.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-4 py-2 transition-all',
                            aspectRatio === ratio.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="text-sm font-medium">
                            {ratio.name}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {ratio.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 设计风格 */}
                  <div>
                    <h3 className="mb-3 font-medium">设计风格</h3>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_OPTIONS.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setStyle(s.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-4 py-2 transition-all',
                            style === s.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-sm">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    className="border-border hover:border-primary/50 hover:bg-muted/50 rounded-xl border p-4 text-left transition-colors"
                  >
                    <span className="mb-2 block text-2xl">{template.icon}</span>
                    <h3 className="text-sm font-medium">{template.name}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
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
                <div className="bg-card mx-auto max-w-2xl rounded-2xl border p-6 shadow-sm">
                  <ProgressTracker progress={progress} showToolCalls />
                  {isGenerating && (
                    <button
                      onClick={handleCancel}
                      className="text-muted-foreground hover:text-destructive mt-4 w-full py-2 text-sm transition-colors"
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
                <div className="bg-card rounded-2xl border p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">生成完成</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resetProgress()}
                        className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
                      >
                        <RefreshCw className="h-4 w-4" />
                        重新生成
                      </button>
                      {result.artifacts.map((artifact) => (
                        <React.Fragment key={artifact.id}>
                          <button
                            onClick={() => setShowPreview(true)}
                            className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
                          >
                            <ZoomIn className="h-4 w-4" />
                            预览
                          </button>
                          <a
                            href={artifact.url}
                            download
                            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            下载图片
                          </a>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <p className="text-muted-foreground">{result.summary}</p>
                  <div className="text-muted-foreground mt-4 text-sm">
                    耗时: {(result.duration / 1000).toFixed(1)}s
                  </div>

                  {/* 图片预览 */}
                  {result.artifacts.length > 0 && (
                    <div className="mt-6">
                      <div className="bg-muted/50 overflow-hidden rounded-lg">
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

          {/* 输入区域 - 始终显示在底部 */}
          <div className="from-background via-background fixed bottom-0 left-0 right-0 bg-gradient-to-t to-transparent p-4 pl-64">
            <div className="mx-auto max-w-3xl">
              <PromptBar
                agentType={AgentType.DESIGNER}
                placeholder="描述你想要的设计，例如：创建一张关于人工智能发展历程的信息图..."
                onSubmit={handleSubmit}
                isProcessing={isGenerating}
              />
            </div>
          </div>

          {/* 底部占位 */}
          <div className="h-32" />
        </main>

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
    </div>
  );
}
