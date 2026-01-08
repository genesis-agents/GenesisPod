'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import WritingCanvasView from '@/components/ai-writing/WritingCanvasView';
import type { Chapter } from '@/lib/api/ai-writing';

// AI Writing Team - 5 Agents
const WRITING_TEAM = [
  {
    id: 'architect',
    name: '故事架构师',
    role: 'leader' as const,
    icon: '👑',
    color: 'purple',
    desc: '任务分解、调度协调',
  },
  {
    id: 'writer',
    name: '创作作家',
    role: 'worker' as const,
    icon: '✍️',
    color: 'blue',
    desc: '内容创作',
  },
  {
    id: 'keeper',
    name: '设定守护者',
    role: 'worker' as const,
    icon: '📚',
    color: 'amber',
    desc: '世界观维护',
  },
  {
    id: 'checker',
    name: '一致性检查员',
    role: 'worker' as const,
    icon: '🔍',
    color: 'green',
    desc: '一致性验证',
  },
  {
    id: 'editor',
    name: '润色编辑',
    role: 'worker' as const,
    icon: '🎨',
    color: 'rose',
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
    missionMessage,
    clearError,
  } = useAIWritingStore();

  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [userInput, setUserInput] = useState('');
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [currentTask, setCurrentTask] = useState<{
    type: string;
    progress: number;
    message: string;
  } | null>(null);

  // Load project data
  useEffect(() => {
    if (user && projectId) {
      void fetchProject(projectId);
      void fetchVolumes(projectId);
    }
  }, [user, projectId, fetchProject, fetchVolumes]);

  // Simulate agent activity when mission is running
  useEffect(() => {
    if (isMissionRunning) {
      // Start with architect
      setActiveAgents(new Set(['architect']));
      setCurrentTask({
        type: 'planning',
        progress: 10,
        message: missionMessage || '分析任务需求...',
      });

      const interval = setInterval(() => {
        setCurrentTask((prev) => {
          if (!prev) return null;
          const newProgress = Math.min(prev.progress + 5, 95);

          // Simulate different agents becoming active
          if (newProgress < 30) {
            setActiveAgents(new Set(['architect']));
            return {
              ...prev,
              progress: newProgress,
              message: '规划故事结构...',
            };
          } else if (newProgress < 50) {
            setActiveAgents(new Set(['architect', 'writer']));
            return { ...prev, progress: newProgress, message: '生成内容中...' };
          } else if (newProgress < 70) {
            setActiveAgents(new Set(['writer', 'keeper']));
            return {
              ...prev,
              progress: newProgress,
              message: '检查世界观一致性...',
            };
          } else if (newProgress < 85) {
            setActiveAgents(new Set(['checker']));
            return { ...prev, progress: newProgress, message: '验证一致性...' };
          } else {
            setActiveAgents(new Set(['editor']));
            return { ...prev, progress: newProgress, message: '润色文字...' };
          }
        });
      }, 1500);

      return () => clearInterval(interval);
    } else {
      setActiveAgents(new Set());
      setCurrentTask(null);
    }
  }, [isMissionRunning, missionMessage]);

  const handleStartWriting = async () => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: userInput || currentProject.description || '开始写作',
        missionType: 'outline',
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
        additionalInstructions: '根据用户指令进行操作',
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

  const getStatusBadge = (status: string) => {
    const config: Record<
      string,
      { label: string; color: string; icon: string }
    > = {
      PLANNING: {
        label: '规划中',
        color: 'bg-purple-100 text-purple-700',
        icon: '📋',
      },
      OUTLINING: {
        label: '大纲设计',
        color: 'bg-blue-100 text-blue-700',
        icon: '📝',
      },
      WRITING: {
        label: '写作中',
        color: 'bg-amber-100 text-amber-700',
        icon: '✍️',
      },
      REVISING: {
        label: '修订中',
        color: 'bg-orange-100 text-orange-700',
        icon: '🔧',
      },
      COMPLETED: {
        label: '已完成',
        color: 'bg-green-100 text-green-700',
        icon: '✅',
      },
    };
    return (
      config[status] || {
        label: status,
        color: 'bg-gray-100 text-gray-600',
        icon: '📝',
      }
    );
  };

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

  const status = getStatusBadge(currentProject.status);

  return (
    <AppShell>
      <main className="flex h-full flex-col overflow-hidden bg-gray-50">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/ai-writing')}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
              >
                <svg
                  className="h-5 w-5 text-gray-500"
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
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                  >
                    {status.icon} {status.label}
                  </span>
                  <span className="text-gray-400">
                    {currentProject.currentWords.toLocaleString()} /{' '}
                    {currentProject.targetWords.toLocaleString()} 字
                    <span className="ml-2 text-amber-600">
                      ({getProgress()}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
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

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-2">
            <span className="text-sm text-red-700">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Main Content: Left Canvas + Right Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Canvas */}
          <div className="flex w-1/2 flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="font-semibold text-gray-800">AI 写作团队</h2>
            </div>
            <div className="flex-1 overflow-hidden">
              <WritingCanvasView
                agents={WRITING_TEAM.map((agent) => ({
                  id: agent.id,
                  name: agent.name,
                  role:
                    agent.role === 'leader'
                      ? 'story-architect'
                      : agent.id === 'keeper'
                        ? 'bible-keeper'
                        : agent.id === 'checker'
                          ? 'consistency-checker'
                          : (agent.id as 'writer' | 'editor'),
                  status: activeAgents.has(agent.id) ? 'working' : 'idle',
                  completedTasks: 0,
                  totalTasks: 0,
                }))}
                workingAgentIds={activeAgents}
                mission={
                  currentTask
                    ? {
                        id: 'current-mission',
                        title: currentProject?.name || '写作任务',
                        status: 'IN_PROGRESS',
                        phase:
                          currentTask.progress < 30
                            ? 'planning'
                            : currentTask.progress < 70
                              ? 'executing'
                              : 'reviewing',
                        tasks: [],
                        progress: currentTask.progress,
                        wordCount: currentProject?.currentWords || 0,
                        targetWordCount: currentProject?.targetWords || 50000,
                      }
                    : null
                }
                onAgentClick={(agent) => {
                  // Could show agent details
                }}
              />
            </div>
          </div>

          {/* Right: Creation Panel */}
          <div className="flex w-1/2 flex-col bg-gray-50">
            {/* Current Task Status */}
            {(isMissionRunning || currentTask) && (
              <div className="shrink-0 border-b border-gray-200 bg-white p-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                    <span className="font-medium text-amber-800">
                      {currentTask?.message || '处理中...'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ width: `${currentTask?.progress || 0}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {Array.from(activeAgents).map((agentId) => {
                      const agent = WRITING_TEAM.find((a) => a.id === agentId);
                      return agent ? (
                        <span
                          key={agentId}
                          className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-700"
                        >
                          {agent.icon} {agent.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Chapter List */}
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">章节列表</h3>
                <span className="text-sm text-gray-400">
                  {allChapters.length} 章
                </span>
              </div>

              {isLoadingVolumes ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                </div>
              ) : allChapters.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center">
                  <span className="mb-2 block text-3xl">📝</span>
                  <p className="mb-4 text-gray-500">还没有章节</p>
                  <button
                    onClick={handleStartWriting}
                    disabled={isMissionRunning}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    开始生成大纲
                  </button>
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
                      className={`w-full rounded-xl border bg-white p-4 text-left transition-all ${
                        selectedChapter?.id === chapter.id
                          ? 'border-amber-300 ring-2 ring-amber-100'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
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
                          <div>
                            <div className="font-medium text-gray-800">
                              第{chapter.chapterNumber}章 {chapter.title}
                            </div>
                            {chapter.synopsis && (
                              <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                                {chapter.synopsis}
                              </div>
                            )}
                          </div>
                        </div>
                        {chapter.wordCount > 0 && (
                          <span className="text-xs text-gray-400">
                            {chapter.wordCount.toLocaleString()} 字
                          </span>
                        )}
                      </div>

                      {/* Expanded Content */}
                      {selectedChapter?.id === chapter.id &&
                        chapter.content && (
                          <div className="mt-4 max-h-60 overflow-auto rounded-lg bg-gray-50 p-4">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                              {chapter.content}
                            </div>
                          </div>
                        )}
                    </button>
                  ))}

                  {/* Continue Button */}
                  {allChapters.length > 0 && !isMissionRunning && (
                    <button
                      onClick={handleContinueWriting}
                      className="w-full rounded-xl border-2 border-dashed border-gray-200 bg-white py-4 text-center text-sm font-medium text-gray-500 transition-all hover:border-amber-300 hover:text-amber-600"
                    >
                      + 继续写作下一章
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="shrink-0 border-t border-gray-200 bg-white p-4">
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
                  placeholder="给团队发消息...（如：调整第3章的节奏，让对话更自然）"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 p-3 text-sm placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  disabled={isMissionRunning}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!userInput.trim() || isMissionRunning}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
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
