'use client';

/**
 * AI Slides 页面
 * Genspark 风格的 PPT 生成器
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, RefreshCw, Settings } from 'lucide-react';
import Link from 'next/link';

import { PromptBar } from '@/components/ai-office/core/PromptBar';
import {
  ProgressTracker,
  ProgressOverlay,
} from '@/components/ai-office/core/ProgressTracker';
import {
  AgentType,
  AgentInput,
  ProgressState,
  AGENT_CONFIGS,
  ToolType,
} from '@/lib/agents/types';
import { useAgentStore } from '@/stores/agentStore';
import { executeAgent, subscribeToTask, cancelTask } from '@/lib/agents/api';
import { cn } from '@/lib/utils';

// 模板定义
const SLIDES_TEMPLATES = [
  {
    id: 'business-pitch',
    name: '商业提案',
    description: '适合商业计划书、投资提案',
    icon: '📈',
    prompt: '为[公司/产品]创建一份商业提案PPT',
  },
  {
    id: 'product-launch',
    name: '产品发布',
    description: '产品发布会演示文稿',
    icon: '🚀',
    prompt: '创建[产品名]发布会PPT',
  },
  {
    id: 'quarterly-report',
    name: '季度汇报',
    description: '季度/年度工作汇报',
    icon: '📊',
    prompt: '创建[时间段]季度汇报PPT',
  },
  {
    id: 'team-intro',
    name: '团队介绍',
    description: '团队或公司介绍',
    icon: '👥',
    prompt: '介绍[团队/公司名称]',
  },
  {
    id: 'education',
    name: '教学课件',
    description: '教育培训课件',
    icon: '📚',
    prompt: '创建关于[主题]的教学课件',
  },
];

// 主题选项
const THEME_OPTIONS = [
  { id: 'professional', name: '专业商务', color: '#1e3a5f' },
  { id: 'modern', name: '现代科技', color: '#6366f1' },
  { id: 'minimal', name: '极简风格', color: '#18181b' },
  { id: 'creative', name: '创意活力', color: '#ec4899' },
  { id: 'genspark', name: '深蓝专业', color: '#0A2B4E' },
];

export default function SlidesPage() {
  const agentConfig = AGENT_CONFIGS[AgentType.SLIDES];
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState('professional');
  const [showSettings, setShowSettings] = useState(false);

  // 处理提交
  const handleSubmit = useCallback(
    async (input: AgentInput) => {
      setIsGenerating(true);
      resetProgress();
      updateProgress({
        phase: 'planning',
        percentage: 0,
        message: '正在分析需求...',
      });

      try {
        // 添加主题选项
        const enhancedInput: AgentInput = {
          ...input,
          options: {
            ...input.options,
            themeId: selectedTheme,
          },
        };

        // 调用 API 开始生成
        const taskResponse = await executeAgent(
          enhancedInput,
          AgentType.SLIDES
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
    [selectedTheme, resetProgress, updateProgress, handleEvent]
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
  const handleTemplateSelect = (template: (typeof SLIDES_TEMPLATES)[0]) => {
    // 可以预填充提示词
    console.log('Selected template:', template);
  };

  return (
    <div className="bg-background min-h-screen">
      {/* 头部 */}
      <header className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
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
      <main className="container mx-auto px-4 py-8">
        {/* 设置面板 */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="bg-muted/50 rounded-xl p-4">
                <h3 className="mb-3 font-medium">主题风格</h3>
                <div className="flex flex-wrap gap-2">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-4 py-2 transition-all',
                        selectedTheme === theme.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span className="text-sm">{theme.name}</span>
                    </button>
                  ))}
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
              {SLIDES_TEMPLATES.map((template) => (
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
                      <a
                        key={artifact.id}
                        href={artifact.url}
                        download
                        className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        下载 PPTX
                      </a>
                    ))}
                  </div>
                </div>
                <p className="text-muted-foreground">{result.summary}</p>
                <div className="text-muted-foreground mt-4 text-sm">
                  耗时: {(result.duration / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 输入区域 - 始终显示在底部 */}
        <div className="from-background via-background fixed bottom-0 left-0 right-0 bg-gradient-to-t to-transparent p-4">
          <div className="container mx-auto max-w-3xl">
            <PromptBar
              agentType={AgentType.SLIDES}
              placeholder="描述你想要创建的 PPT，例如：为我的创业项目创建一份 10 页的商业计划书..."
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
    </div>
  );
}
