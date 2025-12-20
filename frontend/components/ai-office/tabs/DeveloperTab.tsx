'use client';

/**
 * AI Developer Tab 内容组件
 * 在 AI Office 页面的 Tab 中使用
 * 智能代码助手 - 代码生成、解释、优化、Bug修复、测试
 */

/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Code2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

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

// 代码模板定义
const DEVELOPER_TEMPLATES = [
  {
    id: 'code-generation',
    name: '代码生成',
    description: '根据描述生成代码',
    icon: '💻',
    prompt: '实现一个[功能描述]的函数',
  },
  {
    id: 'code-explain',
    name: '代码解释',
    description: '解释代码的功能和原理',
    icon: '📖',
    prompt: '解释以下代码的功能',
  },
  {
    id: 'code-optimize',
    name: '代码优化',
    description: '优化代码性能和可读性',
    icon: '⚡',
    prompt: '优化以下代码',
  },
  {
    id: 'bug-fix',
    name: 'Bug 修复',
    description: '分析并修复代码问题',
    icon: '🐛',
    prompt: '修复以下代码中的问题',
  },
  {
    id: 'unit-test',
    name: '单元测试',
    description: '生成单元测试代码',
    icon: '🧪',
    prompt: '为以下代码生成单元测试',
  },
];

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
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 设置选项
  const [language, setLanguage] = useState('typescript');
  const [includeTests, setIncludeTests] = useState(true);
  const [testFramework, setTestFramework] = useState('jest');
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
        // 添加选项
        const enhancedInput: AgentInput = {
          ...input,
          options: {
            ...input.options,
            language,
            includeTests,
            testFramework,
          },
        };

        // 调用 API 开始生成
        const taskResponse = await executeAgent(
          enhancedInput,
          AgentType.DEVELOPER
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
      language,
      includeTests,
      testFramework,
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
  const handleTemplateSelect = (template: (typeof DEVELOPER_TEMPLATES)[0]) => {
    console.log('Selected template:', template);
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50">
      {/* 左侧面板 + 右侧内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧控制面板 */}
        <div className="flex w-80 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
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
            <Link
              href="/ai-office/developer"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="在新窗口打开完整版"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>

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

          {/* 快速模板 */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="mb-3 text-sm font-medium text-gray-700">快速开始</h3>
            <div className="space-y-2">
              {DEVELOPER_TEMPLATES.map((template) => (
                <motion.button
                  key={template.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleTemplateSelect(template)}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-green-300 hover:bg-green-50"
                >
                  <span className="text-xl">{template.icon}</span>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {template.name}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {template.description}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200 p-4">
            <PromptBar
              agentType={AgentType.DEVELOPER}
              placeholder="描述你需要的代码..."
              onSubmit={handleSubmit}
              isProcessing={isGenerating}
            />
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
                  选择模板或输入描述，开始生成代码
                </p>
              </div>
            </div>
          )}

          {/* 进度展示 */}
          {(isGenerating || progress.phase !== 'idle') &&
            progress.phase !== 'completed' && (
              <div className="flex flex-1 items-center justify-center p-8">
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
              </div>
            )}

          {/* 结果展示 */}
          {progress.phase === 'completed' && result && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    生成完成
                  </h3>
                  <button
                    onClick={() => resetProgress()}
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新生成
                  </button>
                </div>
                <p className="mb-4 text-gray-600">{result.summary}</p>
                <div className="mb-6 text-sm text-gray-500">
                  耗时: {(result.duration / 1000).toFixed(1)}s | Tokens:{' '}
                  {result.tokensUsed}
                </div>

                {/* 代码块展示 */}
                <div className="space-y-4">
                  {result.artifacts.map((artifact, index) => (
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
                              <span className="text-green-500">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              <span>复制</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="overflow-x-auto bg-gray-900 p-4 text-gray-100">
                        <code className="text-sm">
                          {(artifact as any).content || ''}
                        </code>
                      </pre>
                    </div>
                  ))}
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
