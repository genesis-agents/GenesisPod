'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import { useWritingWebSocket } from '@/hooks/useWritingWebSocket';
import type { Chapter } from '@/lib/api/ai-writing';

// Dynamic import for Canvas component
const WritingCanvas = dynamic(
  () => import('@/components/ai-writing/WritingCanvas'),
  { ssr: false }
);

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

  const [userInput, setUserInput] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // WebSocket for real-time updates
  const wsState = useWritingWebSocket(projectId, isMissionRunning);

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
            <div className="flex items-center gap-2">
              {/* Export */}
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
          {/* Left: Embedded Canvas */}
          <div className="flex w-96 shrink-0 flex-col rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 via-white to-violet-50 shadow-sm">
            {/* Canvas Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-800">AI 写作团队</h2>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    isMissionRunning
                      ? 'bg-green-100 text-green-700'
                      : missionCompleted
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isMissionRunning
                    ? '进行中'
                    : missionCompleted
                      ? '已完成'
                      : '待开始'}
                </span>
              </div>
            </div>

            {/* Tree Visualization */}
            <div className="relative flex-1 overflow-hidden">
              {/* Current Step */}
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-500">
                  {missionMessage || '等待任务开始...'}
                </p>
              </div>

              {/* Agent Tree */}
              <div className="relative mx-auto mt-4 px-4">
                {/* SVG Lines - use viewBox for proper scaling */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ zIndex: 0 }}
                  viewBox="0 0 400 200"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Leader to members */}
                  {[0, 1, 2, 3].map((i) => {
                    const leaderX = 200; // center
                    const memberX = 50 + i * 100; // 50, 150, 250, 350
                    return (
                      <path
                        key={i}
                        d={`M ${leaderX} 70 C ${leaderX} 110 ${memberX} 110 ${memberX} 150`}
                        fill="none"
                        stroke={
                          missionCompleted || isMissionRunning
                            ? '#10B981'
                            : '#E2E8F0'
                        }
                        strokeWidth="2"
                        strokeDasharray={
                          missionCompleted || isMissionRunning ? '0' : '4'
                        }
                      />
                    );
                  })}
                </svg>

                {/* Leader Node */}
                <div className="relative z-10 flex flex-col items-center">
                  <div className="text-lg">👑</div>
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-xl shadow-md ${
                      activeAgentIds.includes('architect')
                        ? 'animate-pulse bg-violet-500 ring-4 ring-green-300'
                        : missionCompleted
                          ? 'bg-violet-500 ring-2 ring-green-300'
                          : 'bg-violet-500'
                    }`}
                  >
                    <span className="text-white">📐</span>
                  </div>
                  <div className="mt-1 text-center">
                    <div className="text-xs font-medium text-slate-700">
                      故事架构师
                    </div>
                  </div>
                </div>

                {/* Member Nodes */}
                <div className="relative z-10 mt-8 flex justify-around">
                  {[
                    {
                      id: 'keeper',
                      icon: '📚',
                      name: '设定守护者',
                      color: 'bg-indigo-500',
                    },
                    {
                      id: 'writer-1',
                      icon: '✍️',
                      name: '作家',
                      color: 'bg-amber-500',
                    },
                    {
                      id: 'checker-1',
                      icon: '🔍',
                      name: '检查员',
                      color: 'bg-green-500',
                    },
                    {
                      id: 'editor',
                      icon: '📝',
                      name: '编辑',
                      color: 'bg-pink-500',
                    },
                  ].map((agent) => {
                    const isActive = activeAgentIds.includes(agent.id);
                    return (
                      <div
                        key={agent.id}
                        className="flex flex-col items-center"
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm shadow ${agent.color} ${
                            isActive
                              ? 'animate-pulse ring-4 ring-green-300'
                              : missionCompleted
                                ? 'ring-2 ring-green-300'
                                : ''
                          }`}
                        >
                          <span className="text-white">{agent.icon}</span>
                        </div>
                        <div className="mt-1 text-center">
                          <div className="text-xs text-slate-600">
                            {agent.name}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress Bar */}
              {(isMissionRunning || missionCompleted) && (
                <div className="absolute bottom-16 left-4 right-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>整体进度</span>
                    <span className="font-medium text-amber-600">
                      {Math.round(missionProgress)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
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

            {/* Action Buttons - Like AI Teams Canvas */}
            <div className="flex items-center justify-center gap-2 border-t border-gray-100 bg-white/80 px-4 py-3">
              <button
                onClick={handleStartWriting}
                disabled={isMissionRunning}
                className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>+</span>
                创建任务
              </button>
              <button
                onClick={handleContinueWriting}
                disabled={isMissionRunning || allChapters.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                继续任务
              </button>
              <button
                disabled={!isMissionRunning}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消任务
              </button>
            </div>
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
                  /* Chapter List - Click to open modal */
                  <div className="space-y-2">
                    {allChapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        onClick={() => setSelectedChapter(chapter)}
                        className="block w-full rounded-xl border border-gray-100 bg-white p-4 text-left transition-all hover:border-amber-200 hover:bg-amber-50"
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

        {/* Chapter Content Modal */}
        {selectedChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
              {/* Modal Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    第{selectedChapter.chapterNumber}章 {selectedChapter.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {selectedChapter.wordCount > 0 && (
                      <span>
                        {selectedChapter.wordCount.toLocaleString()} 字
                      </span>
                    )}
                    {selectedChapter.synopsis && (
                      <span className="text-gray-400">
                        {selectedChapter.synopsis}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedChapter(null)}
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto px-6 py-4">
                {selectedChapter.content ? (
                  <div className="prose prose-gray max-w-none">
                    <div className="whitespace-pre-wrap leading-relaxed text-gray-700">
                      {selectedChapter.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <span className="mb-4 text-4xl">📝</span>
                    <p className="text-gray-500">暂无内容</p>
                    <p className="mt-1 text-sm text-gray-400">
                      该章节尚未生成内容
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  onClick={() => {
                    if (!selectedChapter.content) return;
                    const blob = new Blob([selectedChapter.content], {
                      type: 'text/plain;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `第${selectedChapter.chapterNumber}章-${selectedChapter.title}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!selectedChapter.content}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  下载
                </button>
                <button
                  onClick={() => setSelectedChapter(null)}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
