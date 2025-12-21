'use client';

/**
 * AI Developer Tab 内容组件
 * 在 AI Office 页面的 Tab 中使用
 * 智能代码助手 - 代码生成、解释、优化、Bug修复、测试
 */

/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Copy,
  Check,
  Code2,
  ExternalLink,
  History,
  Trash2,
  Loader2,
  Send,
  Eye,
  Play,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';

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
import { useAgentStore, useThinkingSteps } from '@/stores/agentStore';
import {
  useDeveloperHistoryStore,
  formatRelativeTime,
  DeveloperHistoryItem,
} from '@/stores/developerHistoryStore';
import {
  executeAgent,
  subscribeToTask,
  cancelTask,
} from '@/lib/ai-office/agents/api';
import {
  executeCode,
  formatExecutionResult,
  ExecuteCodeResult,
} from '@/lib/ai-office/code-execution';
import { cn } from '@/lib/utils/common';

// 编程语言选项
const LANGUAGE_OPTIONS = [
  { id: 'typescript', name: 'TypeScript' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
  { id: 'cpp', name: 'C++' },
];

// 测试框架选项
const TEST_FRAMEWORK_OPTIONS = [
  { id: 'jest', name: 'Jest' },
  { id: 'vitest', name: 'Vitest' },
  { id: 'mocha', name: 'Mocha' },
  { id: 'pytest', name: 'pytest' },
  { id: 'junit', name: 'JUnit' },
];

export default function DeveloperTab() {
  const agentConfig = AGENT_CONFIGS[AgentType.DEVELOPER];
  const {
    progress,
    updateProgress,
    resetProgress,
    handleEvent,
    result,
    reset,
  } = useAgentStore();

  // 组件挂载时重置状态，避免跨 Tab 状态污染
  useEffect(() => {
    reset();
  }, [reset]);

  // 历史记录
  const { history, addHistory, updateHistory, removeHistory, clearHistory } =
    useDeveloperHistoryStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // 恢复的历史结果
  const [restoredResult, setRestoredResult] = useState<
    DeveloperHistoryItem['result'] | null
  >(null);
  // 代码执行状态
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);
  const [executionResults, setExecutionResults] = useState<
    Record<number, ExecuteCodeResult>
  >({});

  // 设置选项
  const [language, setLanguage] = useState('typescript');
  const [includeTests, setIncludeTests] = useState(true);
  const [testFramework, setTestFramework] = useState('jest');

  // Prompt 输入
  const [promptValue, setPromptValue] = useState('');

  // 处理提交
  const handleSubmit = useCallback(async () => {
    if (!promptValue.trim() || isGenerating) return;

    setIsGenerating(true);
    resetProgress();
    updateProgress({
      phase: 'planning',
      percentage: 0,
      message: '正在分析需求...',
    });

    // 添加到历史记录
    const historyId = addHistory({
      prompt: promptValue.trim(),
      language,
      includeTests,
      testFramework,
      status: 'pending',
    });
    setCurrentHistoryId(historyId);

    try {
      // 构建输入
      const input: AgentInput = {
        prompt: promptValue.trim(),
        options: {
          language,
          includeTests,
          testFramework,
        },
      };

      // 调用 API 开始生成
      const taskResponse = await executeAgent(input, AgentType.DEVELOPER);
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
                      content: a.content || '',
                    })) || [],
                  tokensUsed: eventResult.tokensUsed || 0,
                  duration: eventResult.duration || 0,
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
  }, [
    promptValue,
    language,
    includeTests,
    testFramework,
    isGenerating,
    resetProgress,
    updateProgress,
    handleEvent,
    addHistory,
    updateHistory,
  ]);

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

  // 复用历史记录（仅复制设置）
  const handleReuseHistory = (item: DeveloperHistoryItem) => {
    setPromptValue(item.prompt);
    setLanguage(item.language);
    setIncludeTests(item.includeTests);
    setTestFramework(item.testFramework);
    setShowHistory(false);
  };

  // 恢复历史结果（查看完整结果）
  const handleRestoreHistory = (item: DeveloperHistoryItem) => {
    if (item.result) {
      setPromptValue(item.prompt);
      setLanguage(item.language);
      setIncludeTests(item.includeTests);
      setTestFramework(item.testFramework);
      setRestoredResult(item.result);
      // 更新 progress 状态为 completed
      updateProgress({
        phase: 'completed',
        percentage: 100,
        message: '已恢复历史结果',
      });
      setShowHistory(false);
    }
  };

  // 复制代码
  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // 执行代码
  const handleRunCode = async (code: string, index: number) => {
    if (executingIndex !== null) return;

    setExecutingIndex(index);
    // 清除之前的执行结果
    setExecutionResults((prev) => {
      const newResults = { ...prev };
      delete newResults[index];
      return newResults;
    });

    try {
      // 根据当前语言设置确定执行语言
      const execLanguage =
        language === 'typescript'
          ? 'typescript'
          : language === 'javascript'
            ? 'javascript'
            : language === 'python'
              ? 'python'
              : 'javascript';

      const result = await executeCode({
        code,
        language: execLanguage as 'javascript' | 'typescript' | 'python',
        timeout: 30000,
      });

      setExecutionResults((prev) => ({
        ...prev,
        [index]: result,
      }));
    } catch (error) {
      console.error('Code execution failed:', error);
      setExecutionResults((prev) => ({
        ...prev,
        [index]: {
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          executionTime: 0,
        },
      }));
    } finally {
      setExecutingIndex(null);
    }
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50">
      {/* 左侧面板 + 右侧内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧控制面板 */}
        <div className="flex w-[420px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{agentConfig.icon}</span>
              <div>
                <h2 className="font-medium text-gray-900">
                  {agentConfig.name}
                </h2>
                <p className="text-xs text-gray-500">
                  {agentConfig.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* 历史记录按钮 */}
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  'rounded-lg p-1.5 transition-colors',
                  showHistory
                    ? 'bg-green-100 text-green-600'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                )}
                title="操作历史"
              >
                <History className="h-4 w-4" />
              </button>
              <Link
                href="/ai-office/developer"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="在新窗口打开完整版"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* 历史记录面板 */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-gray-100 bg-gray-50"
              >
                <div className="max-h-[280px] overflow-y-auto p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">
                      操作历史
                    </h3>
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
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                {item.language}
                              </span>
                              {item.status === 'success' ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : item.status === 'error' ? (
                                <span className="text-xs text-red-500">
                                  失败
                                </span>
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
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-600"
                              title="复用设置"
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

          {/* 语言选择 */}
          <div className="border-b border-gray-100 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">编程语言</h3>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLanguage(lang.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    language === lang.id
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>

          {/* 测试选项 */}
          <div className="border-b border-gray-100 p-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeTests}
                onChange={(e) => setIncludeTests(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">
                包含单元测试
              </span>
            </label>
            {includeTests && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEST_FRAMEWORK_OPTIONS.map((fw) => (
                  <button
                    key={fw.id}
                    onClick={() => setTestFramework(fw.id)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs transition-colors',
                      testFramework === fw.id
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {fw.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 放大的 Prompt 输入区域 */}
          <div className="flex flex-1 flex-col p-4">
            <div className="mb-2">
              <h3 className="text-sm font-medium text-gray-700">
                描述你的需求
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                支持代码生成、解释、优化、Bug修复、单元测试
              </p>
            </div>

            <div className="relative flex-1">
              <textarea
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`例如：
• 实现一个快速排序算法
• 解释这段代码的功能
• 优化这个数据库查询
• 帮我修复这个 Bug
• 生成单元测试`}
                className="h-full min-h-[180px] w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none disabled:bg-gray-50"
                disabled={isGenerating}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Enter 发送，Shift + Enter 换行
              </p>
              <button
                onClick={handleSubmit}
                disabled={!promptValue.trim() || isGenerating}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>生成代码</span>
              </button>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 空状态 */}
          {!isGenerating && progress.phase === 'idle' && !result && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Code2 className="mx-auto h-16 w-16 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  AI Developer
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  输入代码需求，AI 帮你生成代码
                </p>
              </div>
            </div>
          )}

          {/* 进度展示 */}
          {(isGenerating || progress.phase !== 'idle') &&
            progress.phase !== 'completed' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
                {/* 进度条 */}
                <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
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

                {/* AI 思考过程面板 */}
                <div className="w-full max-w-md">
                  <AIThinkingPanel useAgentStore className="shadow-sm" />
                </div>
              </div>
            )}

          {/* 结果展示 */}
          {progress.phase === 'completed' && (result || restoredResult) && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {restoredResult ? '历史结果' : '生成完成'}
                  </h3>
                  <button
                    onClick={() => {
                      resetProgress();
                      setRestoredResult(null);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新生成
                  </button>
                </div>
                {/* 显示摘要（仅 result 有） */}
                {result?.summary && (
                  <p className="mb-4 text-gray-600">{result.summary}</p>
                )}
                <div className="mb-6 text-sm text-gray-500">
                  耗时:{' '}
                  {(((restoredResult || result)?.duration || 0) / 1000).toFixed(
                    1
                  )}
                  s | Tokens: {(restoredResult || result)?.tokensUsed || 0}
                </div>

                {/* 代码块展示 */}
                <div className="space-y-4">
                  {((restoredResult || result)?.artifacts || []).map(
                    (artifact, index) => {
                      const execResult = executionResults[index];
                      const isExecuting = executingIndex === index;
                      const canExecute =
                        language === 'typescript' ||
                        language === 'javascript' ||
                        language === 'python';

                      return (
                        <div
                          key={artifact.id}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                        >
                          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Code2 className="h-4 w-4 text-gray-500" />
                              <span className="text-sm font-medium text-gray-700">
                                {artifact.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* 运行按钮 */}
                              {canExecute && (
                                <button
                                  onClick={() =>
                                    handleRunCode(
                                      (artifact as any).content || '',
                                      index
                                    )
                                  }
                                  disabled={isExecuting}
                                  className={cn(
                                    'flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors',
                                    isExecuting
                                      ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                                  )}
                                >
                                  {isExecuting ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span>执行中...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-4 w-4" />
                                      <span>运行</span>
                                    </>
                                  )}
                                </button>
                              )}
                              {/* 复制按钮 */}
                              <button
                                onClick={() =>
                                  handleCopyCode(
                                    (artifact as any).content || '',
                                    index
                                  )
                                }
                                className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
                              >
                                {copiedIndex === index ? (
                                  <>
                                    <Check className="h-4 w-4 text-green-500" />
                                    <span className="text-green-500">
                                      已复制
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-4 w-4" />
                                    <span>复制</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <pre className="overflow-x-auto bg-gray-900 p-4 text-gray-100">
                            <code className="text-sm">
                              {(artifact as any).content || ''}
                            </code>
                          </pre>

                          {/* 执行结果展示 */}
                          {execResult && (
                            <div
                              className={cn(
                                'border-t px-4 py-3',
                                execResult.success
                                  ? 'border-green-200 bg-green-50'
                                  : 'border-red-200 bg-red-50'
                              )}
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <Terminal
                                  className={cn(
                                    'h-4 w-4',
                                    execResult.success
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  )}
                                />
                                <span
                                  className={cn(
                                    'text-sm font-medium',
                                    execResult.success
                                      ? 'text-green-700'
                                      : 'text-red-700'
                                  )}
                                >
                                  {execResult.success ? '执行成功' : '执行失败'}
                                  <span className="ml-2 font-normal text-gray-500">
                                    ({execResult.executionTime}ms)
                                  </span>
                                </span>
                              </div>
                              <pre
                                className={cn(
                                  'overflow-x-auto rounded p-3 text-sm',
                                  execResult.success
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                )}
                              >
                                {formatExecutionResult(execResult)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>
          )}
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
