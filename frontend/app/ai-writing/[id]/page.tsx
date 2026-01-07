'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import type { Chapter } from '@/lib/api/ai-writing';

// AI Writing Team - 5 Agents
const WRITING_TEAM = [
  {
    id: 'architect',
    name: '故事架构师',
    role: 'Leader',
    icon: '👑',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    activeColor: 'bg-purple-500',
    desc: '任务分解、调度协调',
  },
  {
    id: 'writer',
    name: '创作作家',
    role: 'Worker',
    icon: '✍️',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    activeColor: 'bg-blue-500',
    desc: '内容创作',
  },
  {
    id: 'keeper',
    name: '设定守护者',
    role: 'Worker',
    icon: '📚',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    activeColor: 'bg-amber-500',
    desc: 'Story Bible 维护',
  },
  {
    id: 'checker',
    name: '一致性检查员',
    role: 'Worker',
    icon: '🔍',
    color: 'bg-green-100 text-green-700 border-green-200',
    activeColor: 'bg-green-500',
    desc: '角色/时间线验证',
  },
  {
    id: 'editor',
    name: '润色编辑',
    role: 'Worker',
    icon: '🎨',
    color: 'bg-rose-100 text-rose-700 border-rose-200',
    activeColor: 'bg-rose-500',
    desc: '文字打磨',
  },
];

// Mission status config
const missionStatusConfig: Record<
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

export default function WritingProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();

  const {
    currentProject,
    isLoadingProjects,
    volumes,
    isLoadingVolumes,
    storyBible,
    characters,
    error,
    fetchProject,
    fetchVolumes,
    fetchStoryBible,
    fetchCharacters,
    startMission,
    isMissionRunning,
    missionMessage,
    clearError,
  } = useAIWritingStore();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'chapters' | 'bible' | 'output'
  >('overview');
  const [expandedVolume, setExpandedVolume] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Simulated active agents for demo
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());

  // Load project data
  useEffect(() => {
    if (user && projectId) {
      void fetchProject(projectId);
      void fetchVolumes(projectId);
      void fetchStoryBible(projectId);
      void fetchCharacters(projectId);
    }
  }, [
    user,
    projectId,
    fetchProject,
    fetchVolumes,
    fetchStoryBible,
    fetchCharacters,
  ]);

  // Simulate agent activity when mission is running
  useEffect(() => {
    if (isMissionRunning) {
      const interval = setInterval(() => {
        const agentIds = WRITING_TEAM.map((a) => a.id);
        const randomAgents = new Set<string>();
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
          randomAgents.add(
            agentIds[Math.floor(Math.random() * agentIds.length)]
          );
        }
        setActiveAgents(randomAgents);
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setActiveAgents(new Set());
    }
  }, [isMissionRunning]);

  const handleStartMission = async (
    missionType: 'outline' | 'chapter' | 'full_story'
  ) => {
    if (!currentProject) return;
    try {
      await startMission(projectId, {
        prompt: currentProject.description || currentProject.name,
        missionType,
      });
    } catch {
      // Error handled by store
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim() || !currentProject) return;
    try {
      await startMission(projectId, {
        prompt: feedback,
        missionType: 'chapter',
        additionalInstructions: '根据用户反馈优化内容',
      });
      setFeedback('');
      setShowFeedbackInput(false);
    } catch {
      // Error handled by store
    }
  };

  const handleExport = (format: 'txt' | 'md' | 'docx') => {
    if (!currentProject) return;

    // Collect all chapter content
    const allContent = volumes
      .flatMap((v) => v.chapters || [])
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c) => `# ${c.title}\n\n${c.content || ''}`)
      .join('\n\n---\n\n');

    const content = `# ${currentProject.name}\n\n${currentProject.description || ''}\n\n---\n\n${allContent}`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}.${format === 'md' ? 'md' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!currentProject) return;
    const shareUrl = `${window.location.origin}/ai-writing/${projectId}/share`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: currentProject.name,
          text: currentProject.description,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert('链接已复制到剪贴板');
    }
  };

  const getProgressPercent = () => {
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

  const statusConfig = missionStatusConfig[currentProject.status] || {
    label: currentProject.status,
    color: 'bg-gray-100 text-gray-600',
    icon: '📝',
  };

  return (
    <AppShell>
      <main className="flex h-full flex-col overflow-hidden bg-gray-50">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
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
                <h1 className="text-xl font-bold text-gray-900">
                  {currentProject.name}
                </h1>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.color}`}
                  >
                    {statusConfig.icon} {statusConfig.label}
                  </span>
                  <span className="text-gray-400">
                    {currentProject.currentWords.toLocaleString()} /{' '}
                    {currentProject.targetWords.toLocaleString()} 字
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                分享
              </button>
              <button
                onClick={() => handleExport('md')}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-white px-6">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: '概览', icon: '🎯' },
              { id: 'chapters', label: '章节', icon: '📖' },
              { id: 'bible', label: 'Story Bible', icon: '📚' },
              { id: 'output', label: '输出', icon: '📤' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-3">
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

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* AI Team Status */}
              <div className="lg:col-span-2">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                    <span>👥</span> AI 写作团队
                    {isMissionRunning && (
                      <span className="ml-2 flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                        工作中
                      </span>
                    )}
                  </h3>

                  {/* Team Grid */}
                  <div className="mb-6 grid gap-3 sm:grid-cols-5">
                    {WRITING_TEAM.map((agent) => {
                      const isActive = activeAgents.has(agent.id);
                      return (
                        <div
                          key={agent.id}
                          className={`relative rounded-xl border p-3 text-center transition-all ${
                            isActive
                              ? `${agent.color} border-2 shadow-md`
                              : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          {isActive && (
                            <span className="absolute -right-1 -top-1 flex h-3 w-3">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                            </span>
                          )}
                          <span className="mb-2 block text-2xl">
                            {agent.icon}
                          </span>
                          <div className="text-xs font-medium text-gray-800">
                            {agent.name}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            {agent.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mission Status */}
                  {isMissionRunning ? (
                    <div className="rounded-lg bg-amber-50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                        <span className="font-medium text-amber-800">
                          任务执行中...
                        </span>
                      </div>
                      <p className="text-sm text-amber-700">
                        {missionMessage || '团队正在协作处理您的请求'}
                      </p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">
                        选择要执行的任务类型：
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <button
                          onClick={() => handleStartMission('outline')}
                          className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-medium text-purple-700 transition-all hover:bg-purple-100"
                        >
                          <span className="mb-1 block text-lg">📋</span>
                          生成大纲
                        </button>
                        <button
                          onClick={() => handleStartMission('chapter')}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100"
                        >
                          <span className="mb-1 block text-lg">✍️</span>
                          写作章节
                        </button>
                        <button
                          onClick={() => handleStartMission('full_story')}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition-all hover:bg-amber-100"
                        >
                          <span className="mb-1 block text-lg">📖</span>
                          完整写作
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Feedback Section */}
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800">
                    <span>💬</span> 反馈与优化
                  </h3>
                  {showFeedbackInput ? (
                    <div>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="描述你希望调整的内容..."
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                      />
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => setShowFeedbackInput(false)}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSubmitFeedback}
                          disabled={!feedback.trim() || isMissionRunning}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          提交反馈
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowFeedbackInput(true)}
                      className="w-full rounded-lg border-2 border-dashed border-gray-200 py-4 text-sm text-gray-500 transition-colors hover:border-amber-300 hover:text-amber-600"
                    >
                      + 提供反馈，让 AI 团队继续优化
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-4">
                {/* Project Info */}
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="mb-4 font-semibold text-gray-800">
                    📊 项目统计
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">当前字数</span>
                      <span className="font-medium">
                        {currentProject.currentWords.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">目标字数</span>
                      <span className="font-medium">
                        {currentProject.targetWords.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">完成进度</span>
                      <span className="font-medium text-amber-600">
                        {getProgressPercent()}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">卷数</span>
                      <span className="font-medium">{volumes.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">章节数</span>
                      <span className="font-medium">
                        {volumes.reduce(
                          (acc, v) => acc + (v.chapters?.length || 0),
                          0
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">角色数</span>
                      <span className="font-medium">{characters.length}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {currentProject.description && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h3 className="mb-3 font-semibold text-gray-800">
                      📝 项目描述
                    </h3>
                    <p className="whitespace-pre-wrap text-sm text-gray-600">
                      {currentProject.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chapters Tab */}
          {activeTab === 'chapters' && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Volume/Chapter List */}
              <div className="lg:col-span-1">
                <div className="rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <h3 className="font-semibold text-gray-800">章节目录</h3>
                  </div>
                  <div className="max-h-[600px] overflow-auto p-2">
                    {isLoadingVolumes ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                      </div>
                    ) : volumes.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-500">
                        暂无章节，点击"生成大纲"开始
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {volumes.map((volume) => (
                          <div key={volume.id}>
                            <button
                              onClick={() =>
                                setExpandedVolume(
                                  expandedVolume === volume.id
                                    ? null
                                    : volume.id
                                )
                              }
                              className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
                            >
                              <span>
                                第{volume.volumeNumber}卷 {volume.title}
                              </span>
                              <svg
                                className={`h-4 w-4 text-gray-400 transition-transform ${
                                  expandedVolume === volume.id
                                    ? 'rotate-180'
                                    : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                            {expandedVolume === volume.id &&
                              volume.chapters && (
                                <div className="ml-4 mt-1 space-y-1">
                                  {volume.chapters.map((chapter) => (
                                    <button
                                      key={chapter.id}
                                      onClick={() =>
                                        setSelectedChapter(chapter)
                                      }
                                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                        selectedChapter?.id === chapter.id
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'text-gray-600 hover:bg-gray-50'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span>
                                          第{chapter.chapterNumber}章{' '}
                                          {chapter.title}
                                        </span>
                                        {chapter.wordCount > 0 && (
                                          <span className="text-xs text-gray-400">
                                            {chapter.wordCount}字
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Chapter Content */}
              <div className="lg:col-span-2">
                <div className="rounded-xl border border-gray-200 bg-white">
                  {selectedChapter ? (
                    <>
                      <div className="border-b border-gray-100 px-5 py-4">
                        <h3 className="text-lg font-semibold text-gray-800">
                          第{selectedChapter.chapterNumber}章{' '}
                          {selectedChapter.title}
                        </h3>
                        {selectedChapter.synopsis && (
                          <p className="mt-1 text-sm text-gray-500">
                            {selectedChapter.synopsis}
                          </p>
                        )}
                      </div>
                      <div className="max-h-[500px] overflow-auto p-5">
                        {selectedChapter.content ? (
                          <div className="prose prose-sm prose-gray max-w-none">
                            <div className="whitespace-pre-wrap leading-relaxed text-gray-700">
                              {selectedChapter.content}
                            </div>
                          </div>
                        ) : (
                          <div className="py-12 text-center text-gray-500">
                            <span className="mb-2 block text-3xl">📝</span>
                            <p>此章节尚未写作</p>
                            <button
                              onClick={() => handleStartMission('chapter')}
                              className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                            >
                              开始写作
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <span className="mb-3 text-4xl">📖</span>
                      <p>选择左侧章节查看内容</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Story Bible Tab */}
          {activeTab === 'bible' && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Core Settings */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                  <span>📖</span> 核心设定
                </h3>
                {storyBible ? (
                  <div className="space-y-4">
                    {storyBible.premise && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          故事前提
                        </label>
                        <p className="text-sm text-gray-700">
                          {storyBible.premise}
                        </p>
                      </div>
                    )}
                    {storyBible.theme && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          主题
                        </label>
                        <p className="text-sm text-gray-700">
                          {storyBible.theme}
                        </p>
                      </div>
                    )}
                    {storyBible.tone && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          基调
                        </label>
                        <p className="text-sm text-gray-700">
                          {storyBible.tone}
                        </p>
                      </div>
                    )}
                    {storyBible.setting && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          世界观
                        </label>
                        <p className="text-sm text-gray-700">
                          {storyBible.setting}
                        </p>
                      </div>
                    )}
                    {storyBible.writingStyle && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          写作风格
                        </label>
                        <p className="text-sm text-gray-700">
                          {storyBible.writingStyle}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-gray-500">
                    Story Bible 将由 AI 团队自动生成和维护
                  </div>
                )}
              </div>

              {/* Characters */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                  <span>👥</span> 角色设定 ({characters.length})
                </h3>
                {characters.length > 0 ? (
                  <div className="space-y-3">
                    {characters.map((char) => (
                      <div key={char.id} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">
                            {char.name}
                          </span>
                          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                            {char.role}
                          </span>
                        </div>
                        {char.description && (
                          <p className="mt-1 text-xs text-gray-600">
                            {char.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-gray-500">
                    角色将由 AI 团队自动创建
                  </div>
                )}
              </div>

              {/* Consistency Check Info */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                  <span>🔍</span> 一致性保障机制
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-purple-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        1
                      </span>
                      <span className="font-medium text-purple-800">
                        写前注入
                      </span>
                    </div>
                    <p className="text-xs text-purple-700">
                      加载 Story Bible、角色状态、世界观约束到写作上下文
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        2
                      </span>
                      <span className="font-medium text-blue-800">
                        写后验证
                      </span>
                    </div>
                    <p className="text-xs text-blue-700">
                      检查角色、时间线、世界观、术语、情节的一致性
                    </p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                        3
                      </span>
                      <span className="font-medium text-green-800">
                        冲突解决
                      </span>
                    </div>
                    <p className="text-xs text-green-700">
                      自动修复简单冲突，更新 Story Bible
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Output Tab */}
          {activeTab === 'output' && (
            <div className="space-y-6">
              {/* Export Options */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                  <span>📤</span> 导出选项
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <button
                    onClick={() => handleExport('txt')}
                    className="flex flex-col items-center rounded-xl border-2 border-gray-200 p-6 transition-all hover:border-amber-300 hover:bg-amber-50"
                  >
                    <span className="mb-2 text-3xl">📄</span>
                    <span className="font-medium text-gray-800">纯文本</span>
                    <span className="text-xs text-gray-500">.txt 格式</span>
                  </button>
                  <button
                    onClick={() => handleExport('md')}
                    className="flex flex-col items-center rounded-xl border-2 border-gray-200 p-6 transition-all hover:border-amber-300 hover:bg-amber-50"
                  >
                    <span className="mb-2 text-3xl">📝</span>
                    <span className="font-medium text-gray-800">Markdown</span>
                    <span className="text-xs text-gray-500">.md 格式</span>
                  </button>
                  <button
                    onClick={() => alert('Word 导出功能即将推出')}
                    className="flex flex-col items-center rounded-xl border-2 border-dashed border-gray-200 p-6 opacity-60"
                  >
                    <span className="mb-2 text-3xl">📘</span>
                    <span className="font-medium text-gray-800">Word 文档</span>
                    <span className="text-xs text-gray-500">即将推出</span>
                  </button>
                </div>
              </div>

              {/* Share Options */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
                  <span>🔗</span> 分享
                </h3>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 font-medium text-white transition-colors hover:bg-amber-600"
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
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    复制分享链接
                  </button>
                  <span className="text-sm text-gray-500">
                    分享链接可让他人查看你的作品
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-800">
                    <span>👁️</span> 预览
                  </h3>
                </div>
                <div className="max-h-[400px] overflow-auto p-5">
                  <div className="prose prose-sm prose-gray max-w-none">
                    <h1>{currentProject.name}</h1>
                    {currentProject.description && (
                      <p className="lead">{currentProject.description}</p>
                    )}
                    <hr />
                    {volumes.length > 0 ? (
                      volumes.map((volume) => (
                        <div key={volume.id}>
                          <h2>
                            第{volume.volumeNumber}卷 {volume.title}
                          </h2>
                          {volume.chapters?.map((chapter) => (
                            <div key={chapter.id}>
                              <h3>
                                第{chapter.chapterNumber}章 {chapter.title}
                              </h3>
                              {chapter.content ? (
                                <div className="whitespace-pre-wrap">
                                  {chapter.content.slice(0, 500)}...
                                </div>
                              ) : (
                                <p className="italic text-gray-400">待写作</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500">
                        开始写作后，内容将在此预览
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
