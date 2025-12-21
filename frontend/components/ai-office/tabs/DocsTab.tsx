'use client';

/**
 * AI Docs Tab 内容组件
 * 在 AI Office 页面的 Tab 中使用
 * 智能文档生成器 - 研究报告、商业提案、技术文档等
 */

/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  History,
  Trash2,
  Eye,
  Check,
  Loader2,
} from 'lucide-react';

import { PromptBar } from '@/components/ai-office/core/PromptBar';
import {
  ProgressTracker,
  ProgressOverlay,
} from '@/components/ai-office/core/ProgressTracker';
import AIThinkingPanel from '@/components/ai-office/document/AIThinkingPanel';
import {
  AgentType,
  AgentInput,
  AGENT_CONFIGS,
} from '@/lib/ai-office/agents/types';
import { useAgentStore } from '@/stores/agentStore';
import {
  useDocsHistoryStore,
  formatRelativeTime,
  DocsHistoryItem,
} from '@/stores/docsHistoryStore';
import {
  executeAgent,
  subscribeToTask,
  cancelTask,
} from '@/lib/ai-office/agents/api';
import { cn } from '@/lib/utils/common';
import { useAuth } from '@/contexts/AuthContext';

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

export default function DocsTab() {
  const agentConfig = AGENT_CONFIGS[AgentType.DOCS];
  const { user } = useAuth();
  const {
    progress,
    updateProgress,
    resetProgress,
    handleEvent,
    result,
    reset,
  } = useAgentStore();

  // 历史记录
  const { history, addHistory, updateHistory, removeHistory, clearHistory } =
    useDocsHistoryStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [templatePrompt, setTemplatePrompt] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // 恢复的历史结果
  const [restoredResult, setRestoredResult] = useState<
    DocsHistoryItem['result'] | null
  >(null);

  // AI 解析后的意图状态
  const [parsedIntent, setParsedIntent] = useState<{
    urls: string[];
    documentType: string | null;
    detailLevel: number | null;
    cleanPrompt: string;
  } | null>(null);

  // 组件挂载时重置状态，避免跨 Tab 状态污染
  useEffect(() => {
    reset();
  }, [reset]);

  // 处理提交（使用后端意图解析）
  const handleSubmit = useCallback(
    async (input: AgentInput) => {
      setIsGenerating(true);
      resetProgress();
      setRestoredResult(null); // 清除恢复的结果
      updateProgress({
        phase: 'planning',
        percentage: 0,
        message: '正在分析需求...',
      });

      // 1. 调用后端意图解析 API
      let intentData = {
        urls: [] as string[],
        documentType: 'ARTICLE',
        detailLevel: 2,
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

      // 添加到历史记录
      const historyId = addHistory({
        prompt: input.prompt,
        documentType: intentData.documentType || 'ARTICLE',
        detailLevel: intentData.detailLevel || 2,
        status: 'pending',
      });
      setCurrentHistoryId(historyId);

      try {
        // 2. 使用解析后的参数构建增强输入
        const enhancedInput: AgentInput = {
          ...input,
          urls: intentData.urls || [],
          options: {
            ...input.options,
            documentType: intentData.documentType || 'ARTICLE',
            exportFormat: 'docx',
            detailLevel: intentData.detailLevel || 2,
            userId: user?.id, // 传递当前用户 ID
          },
        };

        // 调用 API 开始生成
        const taskResponse = await executeAgent(enhancedInput, AgentType.DOCS);
        setCurrentTaskId(taskResponse.taskId);

        // 订阅进度更新
        const unsubscribe = subscribeToTask(taskResponse.taskId, (event) => {
          handleEvent(event);

          if (event.type === 'complete') {
            setIsGenerating(false);
            const eventResult = (event as any).result;
            // 保存完整结果到历史记录
            updateHistory(historyId, {
              status: 'success',
              summary: eventResult?.summary,
              result: eventResult
                ? {
                    artifacts:
                      eventResult.artifacts?.map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        type: a.type,
                        url: a.url || '',
                      })) || [],
                    duration: eventResult.duration || 0,
                    documentId: eventResult.documentId,
                  }
                : undefined,
            });
            unsubscribe();
          } else if (event.type === 'error') {
            setIsGenerating(false);
            updateHistory(historyId, { status: 'error' });
            unsubscribe();
          }
        });
      } catch (error) {
        console.error('Failed to start generation:', error);
        updateProgress({
          phase: 'error',
          message: error instanceof Error ? error.message : '生成失败',
        });
        updateHistory(historyId, { status: 'error' });
        setIsGenerating(false);
      }
    },
    [
      resetProgress,
      updateProgress,
      handleEvent,
      user?.id,
      addHistory,
      updateHistory,
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
    if (currentHistoryId) {
      updateHistory(currentHistoryId, { status: 'error' });
    }
    setIsGenerating(false);
    resetProgress();
  }, [currentTaskId, currentHistoryId, resetProgress, updateHistory]);

  // 处理模板选择
  const handleTemplateSelect = useCallback(
    (template: (typeof DOCS_TEMPLATES)[0]) => {
      setTemplatePrompt(template.prompt);
    },
    []
  );

  // 模板提示语应用后清除，以便下次点击同一模板仍能触发
  useEffect(() => {
    if (templatePrompt) {
      const timer = setTimeout(() => setTemplatePrompt(null), 100);
      return () => clearTimeout(timer);
    }
  }, [templatePrompt]);

  // 复用历史记录（仅复制设置到输入框）
  const handleReuseHistory = useCallback((item: DocsHistoryItem) => {
    setTemplatePrompt(item.prompt);
    setShowHistory(false);
  }, []);

  // 恢复历史结果（查看完整结果）
  const handleRestoreHistory = useCallback(
    (item: DocsHistoryItem) => {
      if (item.result) {
        setRestoredResult(item.result);
        // 更新 progress 状态为 completed
        updateProgress({
          phase: 'completed',
          percentage: 100,
          message: '已恢复历史结果',
        });
        setShowHistory(false);
      }
    },
    [updateProgress]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* 头部 */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">{agentConfig.name}</h1>
              <p className="text-xs text-gray-500">{agentConfig.description}</p>
            </div>
          </div>
          {/* 历史记录按钮 */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'rounded-lg p-2 transition-colors',
              showHistory
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            )}
            title="历史记录"
          >
            <History className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* 历史记录面板 */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-gray-200 bg-gray-50"
          >
            <div className="max-h-[280px] overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">生成历史</h3>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    清空
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">
                  暂无历史记录
                </p>
              ) : (
                <div className="space-y-2">
                  {history.slice(0, 20).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2 hover:border-gray-300"
                    >
                      <div className="mr-2 min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">
                          {item.prompt}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600">
                            {DOC_TYPE_OPTIONS.find(
                              (t) => t.id === item.documentType
                            )?.name || item.documentType}
                          </span>
                          {item.status === 'success' ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : item.status === 'error' ? (
                            <span className="text-xs text-red-500">失败</span>
                          ) : (
                            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* 查看结果按钮（仅成功且有结果时显示） */}
                        {item.status === 'success' && item.result && (
                          <button
                            onClick={() => handleRestoreHistory(item)}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                            title="查看结果"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleReuseHistory(item)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                          title="复用"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeHistory(item.id)}
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI 解析结果提示 */}
      <AnimatePresence>
        {parsedIntent && isGenerating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">AI 理解:</span>
              {parsedIntent.urls.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  📎 {parsedIntent.urls.length} 个链接
                </span>
              )}
              {parsedIntent.documentType && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                  📄{' '}
                  {DOC_TYPE_OPTIONS.find(
                    (t) => t.id === parsedIntent.documentType
                  )?.name || parsedIntent.documentType}
                </span>
              )}
              {parsedIntent.detailLevel && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  📊{' '}
                  {DETAIL_LEVEL_OPTIONS.find(
                    (l) => l.id === parsedIntent.detailLevel
                  )?.name || '适中'}
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
              {DOCS_TEMPLATES.map((template) => (
                <motion.button
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTemplateSelect(template)}
                  className="rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"
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
              <div className="mx-auto max-w-3xl">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* 左侧 - AI 思考过程 */}
                  <div className="lg:col-span-1">
                    <AIThinkingPanel
                      useAgentStore
                      currentTool="document_creation"
                      currentDescription="正在生成文档..."
                    />
                  </div>

                  {/* 右侧 - 进度条 */}
                  <div className="lg:col-span-2">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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
                </div>
              </div>
            </div>
          )}

        {/* 结果展示 */}
        {progress.phase === 'completed' && (result || restoredResult) && (
          <div className="mb-8">
            <div className="mx-auto max-w-4xl">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <h3 className="text-lg font-semibold">
                      {restoredResult ? '历史结果' : '生成完成'}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        resetProgress();
                        setRestoredResult(null);
                      }}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      重新生成
                    </button>
                    {((restoredResult || result)?.artifacts || []).map(
                      (artifact) => (
                        <a
                          key={artifact.id}
                          href={artifact.url}
                          download
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4" />
                          下载 DOCX
                        </a>
                      )
                    )}
                  </div>
                </div>
                {result?.summary && (
                  <p className="text-gray-600">{result.summary}</p>
                )}
                <div className="mt-4 text-sm text-gray-500">
                  耗时:{' '}
                  {(((restoredResult || result)?.duration || 0) / 1000).toFixed(
                    1
                  )}
                  s
                </div>
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
            agentType={AgentType.DOCS}
            placeholder="直接描述你想要的文档，AI会自动理解。例如：&#10;• 基于 https://example.com 撰写一份详细的研究报告&#10;• 写一篇关于AI发展的简洁文章&#10;• 整理这个链接的内容为会议纪要"
            onSubmit={handleSubmit}
            isProcessing={isGenerating}
            initialPrompt={templatePrompt || ''}
          />
          <p className="mt-2 text-center text-xs text-gray-400">
            支持直接粘贴URL、指定文档类型、详细程度等，AI会自动理解
          </p>
        </div>
      </div>

      {/* 进度遮罩（全屏模式） */}
      <AnimatePresence>
        {isGenerating && progress.phase === 'executing' && (
          <ProgressOverlay progress={progress} onCancel={handleCancel} />
        )}
      </AnimatePresence>
    </div>
  );
}
