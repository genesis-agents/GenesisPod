'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import type { Chapter } from '@/lib/api/ai-writing';

// AI Writing Team - 8 Agents (max configuration)
// Leader decides actual count at runtime
const WRITING_AGENTS = [
  {
    id: 'architect',
    name: '故事架构师',
    icon: '👑',
    color: 'bg-purple-500',
    desc: '统筹规划',
  },
  {
    id: 'keeper',
    name: '设定守护者',
    icon: '📚',
    color: 'bg-indigo-500',
    desc: '世界观',
  },
  {
    id: 'writer-1',
    name: '作家①',
    icon: '✍️',
    color: 'bg-blue-500',
    desc: '内容创作',
  },
  {
    id: 'writer-2',
    name: '作家②',
    icon: '✍️',
    color: 'bg-sky-500',
    desc: '内容创作',
  },
  {
    id: 'writer-3',
    name: '作家③',
    icon: '✍️',
    color: 'bg-cyan-500',
    desc: '内容创作',
  },
  {
    id: 'checker-1',
    name: '检查员①',
    icon: '🔍',
    color: 'bg-amber-500',
    desc: '逻辑校验',
  },
  {
    id: 'checker-2',
    name: '检查员②',
    icon: '🔍',
    color: 'bg-orange-500',
    desc: '逻辑校验',
  },
  {
    id: 'editor',
    name: '润色编辑',
    icon: '🎨',
    color: 'bg-green-500',
    desc: '文字打磨',
  },
];

export default function WritingProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    currentProject,
    isLoadingProjects,
    volumes,
    isLoadingVolumes,
    error,
    fetchProject,
    fetchVolumes,
    startMission,
    isMissionRunning,
    missionProgress,
    missionMessage,
    missionCompleted,
    activeAgentIds,
    clearError,
  } = useAIWritingStore();

  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [userInput, setUserInput] = useState('');

  // Load project data
  useEffect(() => {
    if (user && projectId) {
      void fetchProject(projectId);
      void fetchVolumes(projectId);
    }
  }, [user, projectId, fetchProject, fetchVolumes]);

  const handleStartWriting = async () => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: userInput || currentProject.description || '开始写作',
        missionType: 'full_story',
      });
      setUserInput('');
    } catch {
      // Error handled by store
    }
  };

  const handleContinueWriting = async () => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: userInput || '继续写作下一章',
        missionType: 'chapter',
      });
      setUserInput('');
    } catch {
      // Error handled by store
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !currentProject || isMissionRunning) return;
    try {
      await startMission(projectId, {
        prompt: userInput,
        missionType: 'chapter',
      });
      setUserInput('');
    } catch {
      // Error handled by store
    }
  };

  const handleExport = () => {
    if (!currentProject) return;
    const allContent = volumes
      .flatMap((v) => v.chapters || [])
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c) => `# ${c.title}\n\n${c.content || ''}`)
      .join('\n\n---\n\n');
    const content = `# ${currentProject.name}\n\n${currentProject.description || ''}\n\n---\n\n${allContent}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get all chapters sorted
  const allChapters = volumes
    .flatMap((v) => v.chapters || [])
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const getProgress = () => {
    if (!currentProject || !currentProject.targetWords) return 0;
    return Math.min(
      100,
      Math.round(
        (currentProject.currentWords / currentProject.targetWords) * 100
      )
    );
  };

  if (authLoading || isLoadingProjects) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </main>
      </AppShell>
    );
  }

  if (!user) {
    router.push('/ai-writing');
    return null;
  }

  if (!currentProject) {
    return (
      <AppShell>
        <main className="flex flex-1 flex-col items-center justify-center p-8">
          <span className="mb-4 text-5xl">📖</span>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">
            项目不存在
          </h2>
          <button
            onClick={() => router.push('/ai-writing')}
            className="text-amber-600 hover:underline"
          >
            返回项目列表
          </button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-gray-50">
        {/* Compact Header */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ai-writing')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  {currentProject.name}
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>
                    {currentProject.currentWords.toLocaleString()} /{' '}
                    {currentProject.targetWords.toLocaleString()} 字
                  </span>
                  <span className="font-medium text-amber-600">
                    ({getProgress()}%)
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              导出
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 gap-4 overflow-hidden p-4">
          {/* Left: AI Team Canvas */}
          <div className="flex w-80 shrink-0 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold text-gray-800">AI 写作团队</h2>
              {isMissionRunning && (
                <p className="mt-1 text-xs text-amber-600">
                  {missionMessage || '协作中...'}
                </p>
              )}
            </div>

            {/* Agent Flow Visualization */}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
              {WRITING_AGENTS.map((agent, index) => {
                const isActive =
                  isMissionRunning && activeAgentIds.includes(agent.id);
                const isPast = missionCompleted; // All agents show as completed when mission done

                return (
                  <div
                    key={agent.id}
                    className="flex w-full items-center gap-3"
                  >
                    {/* Connection Line */}
                    {index > 0 && (
                      <div className="absolute left-[2.35rem] -mt-8 h-6 w-0.5 bg-gray-200" />
                    )}

                    {/* Agent Node */}
                    <div
                      className={`
                        relative flex w-full items-center gap-3 rounded-xl p-3 transition-all duration-300
                        ${isActive ? 'bg-amber-50 shadow-md ring-2 ring-amber-400' : ''}
                        ${isPast ? 'bg-green-50' : ''}
                        ${!isActive && !isPast ? 'bg-gray-50' : ''}
                      `}
                    >
                      {/* Icon */}
                      <div
                        className={`
                          flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg
                          ${isActive ? 'animate-pulse bg-amber-500 text-white' : ''}
                          ${isPast ? 'bg-green-500 text-white' : ''}
                          ${!isActive && !isPast ? agent.color + ' text-white' : ''}
                        `}
                      >
                        {isPast ? '✓' : agent.icon}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800">
                          {agent.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {agent.desc}
                        </div>
                      </div>

                      {/* Status Indicator */}
                      {isActive && (
                        <div className="flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            {(isMissionRunning || missionCompleted) && (
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>{missionCompleted ? '创作完成' : '整体进度'}</span>
                  <span>{Math.round(missionProgress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full transition-all duration-500 ${
                      missionCompleted
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500'
                    }`}
                    style={{ width: `${missionProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: Content Area */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Chapter List or Empty State */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 className="font-semibold text-gray-800">章节列表</h2>
                <span className="text-sm text-gray-400">
                  {allChapters.length} 章
                </span>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {isLoadingVolumes ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                ) : allChapters.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    {isMissionRunning ? (
                      <div className="w-full max-w-md space-y-6">
                        {/* Header */}
                        <div className="text-center">
                          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-800">
                            AI 团队正在创作中
                          </h3>
                          <p className="mt-1 text-sm font-medium text-amber-600">
                            {missionMessage}
                          </p>
                        </div>

                        {/* Progress Steps */}
                        <div className="rounded-xl bg-gray-50 p-4">
                          <div className="space-y-3">
                            {[
                              {
                                id: 'architect',
                                label: '规划故事结构',
                                icon: '👑',
                              },
                              {
                                id: 'keeper',
                                label: '建立世界观设定',
                                icon: '📚',
                              },
                              {
                                id: 'writer-1',
                                label: '创作故事内容',
                                icon: '✍️',
                                group: ['writer-1', 'writer-2', 'writer-3'],
                              },
                              {
                                id: 'checker-1',
                                label: '校验内容一致性',
                                icon: '🔍',
                                group: ['checker-1', 'checker-2'],
                              },
                              {
                                id: 'editor',
                                label: '润色文字表达',
                                icon: '🎨',
                              },
                            ].map((step, idx) => {
                              const isStepActive = step.group
                                ? step.group.some((id) =>
                                    activeAgentIds.includes(id)
                                  )
                                : activeAgentIds.includes(step.id);
                              const isStepDone =
                                !isMissionRunning ||
                                (step.group
                                  ? !step.group.some((id) =>
                                      activeAgentIds.includes(id)
                                    ) && activeAgentIds.length > 0
                                  : !activeAgentIds.includes(step.id) &&
                                    activeAgentIds.length > 0);
                              // Calculate if step is done based on progress
                              const stepThreshold = (idx + 1) * 20;
                              const isDone = missionProgress >= stepThreshold;

                              return (
                                <div
                                  key={step.id}
                                  className="flex items-center gap-3"
                                >
                                  <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                                      isStepActive
                                        ? 'animate-pulse bg-amber-500 text-white ring-4 ring-amber-200'
                                        : isDone
                                          ? 'bg-green-500 text-white'
                                          : 'bg-gray-200 text-gray-400'
                                    }`}
                                  >
                                    {isDone && !isStepActive ? '✓' : step.icon}
                                  </div>
                                  <span
                                    className={`text-sm ${
                                      isStepActive
                                        ? 'font-medium text-amber-700'
                                        : isDone
                                          ? 'text-green-700'
                                          : 'text-gray-400'
                                    }`}
                                  >
                                    {step.label}
                                    {isStepActive && (
                                      <span className="ml-2 text-amber-500">
                                        进行中...
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div>
                          <div className="mb-2 flex justify-between text-xs text-gray-500">
                            <span>整体进度</span>
                            <span className="font-medium text-amber-600">
                              {Math.round(missionProgress)}%
                            </span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                              style={{ width: `${missionProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Tip */}
                        <p className="text-center text-xs text-gray-400">
                          创作过程约需 1-2 分钟，请耐心等待
                        </p>
                      </div>
                    ) : missionCompleted ? (
                      <>
                        <span className="mb-4 text-5xl">✅</span>
                        <h3 className="mb-2 text-lg font-semibold text-gray-800">
                          创作任务已完成
                        </h3>
                        <p className="mb-6 max-w-xs text-sm text-gray-500">
                          AI 团队已完成创作，请刷新页面查看结果
                        </p>
                        <button
                          onClick={() => fetchVolumes(projectId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-3 font-medium text-white shadow-lg shadow-green-200 transition-all hover:from-green-600 hover:to-emerald-600"
                        >
                          <span>🔄</span>
                          刷新内容
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="mb-4 text-5xl">📝</span>
                        <h3 className="mb-2 text-lg font-semibold text-gray-800">
                          开始你的创作
                        </h3>
                        <p className="mb-6 max-w-xs text-sm text-gray-500">
                          {currentProject.description ||
                            '点击下方按钮，AI 团队将自动完成故事创作'}
                        </p>
                        <button
                          onClick={handleStartWriting}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-medium text-white shadow-lg shadow-amber-200 transition-all hover:from-amber-600 hover:to-orange-600"
                        >
                          <span>✨</span>
                          一键生成故事
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allChapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        onClick={() =>
                          setSelectedChapter(
                            selectedChapter?.id === chapter.id ? null : chapter
                          )
                        }
                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                          selectedChapter?.id === chapter.id
                            ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                              chapter.content
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {chapter.content ? '✓' : chapter.chapterNumber}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-800">
                              第{chapter.chapterNumber}章 {chapter.title}
                            </div>
                            {chapter.synopsis && (
                              <div className="truncate text-xs text-gray-400">
                                {chapter.synopsis}
                              </div>
                            )}
                          </div>
                          {chapter.wordCount > 0 && (
                            <span className="shrink-0 text-xs text-gray-400">
                              {chapter.wordCount.toLocaleString()} 字
                            </span>
                          )}
                        </div>
                        {selectedChapter?.id === chapter.id &&
                          chapter.content && (
                            <div className="mt-3 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3">
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                                {chapter.content}
                              </div>
                            </div>
                          )}
                      </button>
                    ))}

                    {/* Continue Writing Button */}
                    {!isMissionRunning && (
                      <button
                        onClick={handleContinueWriting}
                        className="w-full rounded-xl border-2 border-dashed border-gray-200 py-4 text-gray-500 transition-all hover:border-amber-300 hover:text-amber-600"
                      >
                        + 继续写作下一章
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="给 AI 团队发指令...（如：调整第3章的节奏，让对话更自然）"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 p-3 text-sm placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  disabled={isMissionRunning}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || isMissionRunning}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
