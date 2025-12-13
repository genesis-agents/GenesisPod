'use client';

/**
 * AI Docs 页面
 * 智能文档生成器
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Settings,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

import Sidebar from '@/components/layout/Sidebar';
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
import { cn } from '@/lib/utils';

// 文档模板定义
const DOCS_TEMPLATES = [
  {
    id: 'research-report',
    name: '研究报告',
    description: '深度研究分析报告',
    icon: '📊',
    prompt: '撰写关于[主题]的研究报告',
  },
  {
    id: 'business-proposal',
    name: '商业提案',
    description: '商业计划和提案文档',
    icon: '💼',
    prompt: '撰写[项目]的商业提案',
  },
  {
    id: 'technical-doc',
    name: '技术文档',
    description: '技术规范和说明文档',
    icon: '📖',
    prompt: '撰写[系统/功能]的技术文档',
  },
  {
    id: 'meeting-minutes',
    name: '会议纪要',
    description: '会议记录和行动项',
    icon: '📝',
    prompt: '整理[会议主题]的会议纪要',
  },
  {
    id: 'article',
    name: '文章创作',
    description: '各类文章和博客',
    icon: '✍️',
    prompt: '撰写关于[主题]的文章',
  },
];

// 文档类型选项
const DOC_TYPE_OPTIONS = [
  { id: 'ARTICLE', name: '文章', description: '通用文章格式' },
  { id: 'RESEARCH', name: '研究报告', description: '深度研究分析' },
  { id: 'PROPOSAL', name: '提案', description: '商业提案方案' },
  { id: 'REPORT', name: '报告', description: '工作汇报总结' },
];

// 导出格式选项
const EXPORT_FORMAT_OPTIONS = [
  { id: 'docx', name: 'Word', icon: '📄', description: 'Microsoft Word 格式' },
  { id: 'pdf', name: 'PDF', icon: '📕', description: '便于分享和打印' },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: '📝',
    description: '纯文本标记格式',
  },
];

// 详细程度选项
const DETAIL_LEVEL_OPTIONS = [
  { id: 1, name: '简洁', description: '关键要点' },
  { id: 2, name: '适中', description: '平衡详略' },
  { id: 3, name: '详细', description: '深入阐述' },
];

export default function DocsPage() {
  const agentConfig = AGENT_CONFIGS[AgentType.DOCS];
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 设置选项
  const [documentType, setDocumentType] = useState('ARTICLE');
  const [exportFormat, setExportFormat] = useState('docx');
  const [detailLevel, setDetailLevel] = useState(2);

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
        // 添加选项
        const enhancedInput: AgentInput = {
          ...input,
          options: {
            ...input.options,
            documentType,
            exportFormat,
            detailLevel,
          },
        };

        // 调用 API 开始生成
        const taskResponse = await executeAgent(enhancedInput, AgentType.DOCS);
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
      documentType,
      exportFormat,
      detailLevel,
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
  const handleTemplateSelect = (template: (typeof DOCS_TEMPLATES)[0]) => {
    console.log('Selected template:', template);
  };

  // 获取导出格式显示信息
  const getExportFormatInfo = () => {
    return EXPORT_FORMAT_OPTIONS.find((f) => f.id === exportFormat);
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
                  {/* 文档类型 */}
                  <div>
                    <h3 className="mb-3 font-medium">文档类型</h3>
                    <div className="flex flex-wrap gap-2">
                      {DOC_TYPE_OPTIONS.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setDocumentType(type.id)}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-left transition-all',
                            documentType === type.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="text-sm font-medium">
                            {type.name}
                          </span>
                          <p className="text-muted-foreground text-xs">
                            {type.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 导出格式 */}
                  <div>
                    <h3 className="mb-3 font-medium">导出格式</h3>
                    <div className="flex flex-wrap gap-2">
                      {EXPORT_FORMAT_OPTIONS.map((format) => (
                        <button
                          key={format.id}
                          onClick={() => setExportFormat(format.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-4 py-2 transition-all',
                            exportFormat === format.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span>{format.icon}</span>
                          <span className="text-sm">{format.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 详细程度 */}
                  <div>
                    <h3 className="mb-3 font-medium">详细程度</h3>
                    <div className="flex flex-wrap gap-2">
                      {DETAIL_LEVEL_OPTIONS.map((level) => (
                        <button
                          key={level.id}
                          onClick={() => setDetailLevel(level.id)}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-left transition-all',
                            detailLevel === level.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <span className="text-sm font-medium">
                            {level.name}
                          </span>
                          <p className="text-muted-foreground text-xs">
                            {level.description}
                          </p>
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
                {DOCS_TEMPLATES.map((template) => (
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
                          下载 {getExportFormatInfo()?.name || 'DOCX'}
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
          <div className="from-background via-background fixed bottom-0 left-0 right-0 bg-gradient-to-t to-transparent p-4 pl-64">
            <div className="mx-auto max-w-3xl">
              <PromptBar
                agentType={AgentType.DOCS}
                placeholder="描述你想要创建的文档，例如：撰写一份关于人工智能发展趋势的研究报告..."
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
    </div>
  );
}
