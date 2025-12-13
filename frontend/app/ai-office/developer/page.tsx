'use client';

/**
 * AI Developer 页面
 * 智能代码助手
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  Settings,
  Check,
  Code2,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

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

export default function DeveloperPage() {
  const agentConfig = AGENT_CONFIGS[AgentType.DEVELOPER];
  const { progress, updateProgress, resetProgress, handleEvent, result } =
    useAgentStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 设置选项
  const [language, setLanguage] = useState('typescript');
  const [includeTests, setIncludeTests] = useState(true);
  const [testFramework, setTestFramework] = useState('jest');

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
              <div className="bg-muted/50 space-y-4 rounded-xl p-4">
                {/* 编程语言 */}
                <div>
                  <h3 className="mb-3 font-medium">编程语言</h3>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => setLanguage(lang.id)}
                        className={cn(
                          'rounded-lg border px-4 py-2 text-sm transition-all',
                          language === lang.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {lang.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 包含测试 */}
                <div className="flex items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeTests}
                      onChange={(e) => setIncludeTests(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span className="font-medium">包含单元测试</span>
                  </label>

                  {includeTests && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">
                        测试框架:
                      </span>
                      <select
                        value={testFramework}
                        onChange={(e) => setTestFramework(e.target.value)}
                        className="bg-background rounded-lg border px-3 py-1 text-sm"
                      >
                        {TEST_FRAMEWORK_OPTIONS.map((fw) => (
                          <option key={fw.id} value={fw.id}>
                            {fw.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
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
              {DEVELOPER_TEMPLATES.map((template) => (
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
                  <button
                    onClick={() => resetProgress()}
                    className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新生成
                  </button>
                </div>
                <p className="text-muted-foreground mb-4">{result.summary}</p>
                <div className="text-muted-foreground mb-6 text-sm">
                  耗时: {(result.duration / 1000).toFixed(1)}s | Tokens:{' '}
                  {result.tokensUsed}
                </div>

                {/* 代码块展示 */}
                <div className="space-y-4">
                  {result.artifacts.map((artifact, index) => (
                    <div
                      key={artifact.id}
                      className="bg-muted/50 overflow-hidden rounded-lg"
                    >
                      <div className="flex items-center justify-between border-b px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Code2 className="text-muted-foreground h-4 w-4" />
                          <span className="text-sm font-medium">
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
                          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
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
                      <pre className="overflow-x-auto p-4">
                        <code className="text-sm">
                          {(artifact as any).content || ''}
                        </code>
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 输入区域 - 始终显示在底部 */}
        <div className="from-background via-background fixed bottom-0 left-0 right-0 bg-gradient-to-t to-transparent p-4">
          <div className="container mx-auto max-w-3xl">
            <PromptBar
              agentType={AgentType.DEVELOPER}
              placeholder="描述你需要的代码，例如：实现一个防抖函数，支持取消和立即执行..."
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
