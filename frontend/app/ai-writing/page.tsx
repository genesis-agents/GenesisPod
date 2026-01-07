'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';

// AI Writing Team - 5 Agents
const WRITING_TEAM = [
  {
    id: 'architect',
    name: '故事架构师',
    role: 'Leader',
    icon: '👑',
    color: 'purple',
    desc: '任务分解、调度协调、质量把控',
  },
  {
    id: 'writer',
    name: '创作作家',
    role: 'Worker',
    icon: '✍️',
    color: 'blue',
    desc: '内容创作，支持并行写作',
  },
  {
    id: 'keeper',
    name: '设定守护者',
    role: 'Worker',
    icon: '📚',
    color: 'amber',
    desc: '维护Story Bible，确保设定一致',
  },
  {
    id: 'checker',
    name: '一致性检查员',
    role: 'Worker',
    icon: '🔍',
    color: 'green',
    desc: '验证角色、时间线、世界观一致性',
  },
  {
    id: 'editor',
    name: '润色编辑',
    role: 'Worker',
    icon: '🎨',
    color: 'rose',
    desc: '文字打磨、风格统一',
  },
];

// Writing types
const WRITING_TYPES = [
  { id: 'NOVEL', label: '长篇小说', icon: '📚', desc: '50000字+，多卷多章' },
  { id: 'SHORT_STORY', label: '短篇小说', icon: '📖', desc: '3000-20000字' },
  { id: 'SERIAL', label: '连载小说', icon: '📰', desc: '持续更新' },
  { id: 'SCRIPT', label: '剧本', icon: '🎬', desc: '影视/舞台剧本' },
];

export default function AIWritingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { projects, isLoadingProjects, fetchProjects, createProject } =
    useAIWritingStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prompt, setPrompt] = useState('');
  const [selectedType, setSelectedType] = useState<string>('NOVEL');
  const [isCreating, setIsCreating] = useState(false);
  const [showTeamPreview, setShowTeamPreview] = useState(false);

  useEffect(() => {
    if (user) {
      void fetchProjects();
    }
  }, [user, fetchProjects]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 400) + 'px';
    }
  }, [prompt]);

  const handleStartWriting = async () => {
    if (!prompt.trim()) return;

    setIsCreating(true);
    try {
      // Extract title from first line or first 50 chars
      const firstLine = prompt.split('\n')[0];
      const title =
        firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;

      const project = await createProject({
        name: title,
        description: prompt,
        genre: selectedType,
        targetWords: selectedType === 'NOVEL' ? 100000 : 20000,
      });
      router.push(`/ai-writing/${project.id}`);
    } catch {
      // Error handled by store
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenProject = (projectId: string) => {
    router.push(`/ai-writing/${projectId}`);
  };

  const getStatusInfo = (status: string) => {
    const info: Record<string, { label: string; color: string; icon: string }> =
      {
        PLANNING: {
          label: '规划中',
          color: 'bg-purple-100 text-purple-700',
          icon: '🎯',
        },
        OUTLINING: {
          label: '大纲设计',
          color: 'bg-blue-100 text-blue-700',
          icon: '📋',
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
      info[status] || {
        label: status,
        color: 'bg-gray-100 text-gray-600',
        icon: '📝',
      }
    );
  };

  const wordCount = prompt.length;

  if (authLoading) return null;

  if (!user) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
              <span className="text-5xl">✍️</span>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-gray-800">
              AI 写作团队
            </h2>
            <p className="mb-4 text-gray-500">
              5 位 AI 专家协作，帮你完成长篇创作
            </p>
            <div className="flex justify-center gap-2">
              {WRITING_TEAM.map((agent) => (
                <span
                  key={agent.id}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow"
                  title={agent.name}
                >
                  {agent.icon}
                </span>
              ))}
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-amber-50/30">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI 写作团队</h1>
              <p className="mt-1 text-gray-500">
                描述你的创作需求，5 位 AI 专家将协作完成
              </p>
            </div>
            <button
              onClick={() => setShowTeamPreview(!showTeamPreview)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-amber-300 hover:bg-amber-50"
            >
              <span>👥</span>
              查看团队
            </button>
          </div>

          {/* Team Preview Panel */}
          {showTeamPreview && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h3 className="mb-3 font-medium text-gray-800">
                AI 写作团队成员
              </h3>
              <div className="grid gap-3 sm:grid-cols-5">
                {WRITING_TEAM.map((agent) => (
                  <div
                    key={agent.id}
                    className="rounded-lg bg-white p-3 shadow-sm"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{agent.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {agent.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {agent.role}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">{agent.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-white/80 p-3">
                <h4 className="mb-2 text-sm font-medium text-gray-700">
                  一致性保障机制
                </h4>
                <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-100 text-purple-600">
                      1
                    </span>
                    <span>Story Bible 设定共识</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-blue-600">
                      2
                    </span>
                    <span>写前上下文注入</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-green-100 text-green-600">
                      3
                    </span>
                    <span>写后一致性验证</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Input Card */}
          <div className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Writing Type Selection */}
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {WRITING_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      selectedType === type.id
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div className="p-6">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`描述你的创作需求...

可以包含：
• 故事梗概、核心冲突、世界观设定
• 主要角色及其关系
• 风格偏好、参考作品
• 目标字数、章节规划

支持大段文本输入（如完整的故事大纲）`}
                className="min-h-[200px] w-full resize-none border-none text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
                style={{ fontSize: '15px', lineHeight: '1.7' }}
              />

              {/* Word Count & Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{wordCount.toLocaleString()} 字符</span>
                  {wordCount > 1000 && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      详细需求 ✓
                    </span>
                  )}
                </div>
                <button
                  onClick={handleStartWriting}
                  disabled={!prompt.trim() || isCreating}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 font-medium text-white shadow transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <svg
                        className="h-5 w-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      团队组建中...
                    </>
                  ) : (
                    <>
                      <span>🚀</span>
                      启动写作团队
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Recent Projects */}
          {projects.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">
                  进行中的项目
                </h2>
                <span className="text-sm text-gray-400">
                  {projects.length} 个项目
                </span>
              </div>
              {isLoadingProjects ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => {
                    const statusInfo = getStatusInfo(project.status);
                    const progress =
                      project.targetWords > 0
                        ? Math.round(
                            (project.currentWords / project.targetWords) * 100
                          )
                        : 0;

                    return (
                      <button
                        key={project.id}
                        onClick={() => handleOpenProject(project.id)}
                        className="group rounded-xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-amber-300 hover:shadow-lg"
                      >
                        <div className="mb-3 flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="line-clamp-1 font-semibold text-gray-900 group-hover:text-amber-700">
                              {project.name}
                            </h3>
                            <span className="text-xs text-gray-400">
                              {project.genre || '未分类'}
                            </span>
                          </div>
                          <span
                            className={`ml-2 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusInfo.color}`}
                          >
                            <span>{statusInfo.icon}</span>
                            {statusInfo.label}
                          </span>
                        </div>

                        {project.description && (
                          <p className="mb-4 line-clamp-2 text-sm text-gray-500">
                            {project.description}
                          </p>
                        )}

                        {/* Progress */}
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="text-gray-500">
                            {project.currentWords.toLocaleString()} /{' '}
                            {project.targetWords.toLocaleString()} 字
                          </span>
                          <span className="font-medium text-amber-600">
                            {progress}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>

                        {/* Team Status */}
                        <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
                          <div className="flex -space-x-1">
                            {WRITING_TEAM.slice(0, 3).map((agent) => (
                              <span
                                key={agent.id}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs ring-2 ring-white"
                                title={agent.name}
                              >
                                {agent.icon}
                              </span>
                            ))}
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-500 ring-2 ring-white">
                              +2
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!isLoadingProjects && projects.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
              <div className="mx-auto mb-4 flex justify-center gap-2">
                {WRITING_TEAM.map((agent) => (
                  <span
                    key={agent.id}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow"
                  >
                    {agent.icon}
                  </span>
                ))}
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-700">
                开始你的第一个创作项目
              </h3>
              <p className="text-sm text-gray-500">
                在上方输入你的创作需求，AI 写作团队将为你协作完成
              </p>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
