'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIWritingStore } from '@/stores/aiWritingStore';

// AI Writing Team - 5 Agents
const WRITING_TEAM = [
  { id: 'architect', icon: '👑', name: '架构师' },
  { id: 'writer', icon: '✍️', name: '作家' },
  { id: 'keeper', icon: '📚', name: '守护者' },
  { id: 'checker', icon: '🔍', name: '检查员' },
  { id: 'editor', icon: '🎨', name: '编辑' },
];

// Genre options
const GENRES = [
  { value: 'NOVEL', label: '长篇小说' },
  { value: 'SHORT_STORY', label: '短篇小说' },
  { value: 'FANTASY', label: '奇幻' },
  { value: 'SCIFI', label: '科幻' },
  { value: 'ROMANCE', label: '言情' },
  { value: 'MYSTERY', label: '悬疑' },
  { value: 'OTHER', label: '其他' },
];

// Word count options
const WORD_COUNTS = [
  { value: 10000, label: '1万字' },
  { value: 30000, label: '3万字' },
  { value: 50000, label: '5万字' },
  { value: 100000, label: '10万字' },
  { value: 200000, label: '20万字+' },
];

export default function AIWritingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    projects,
    isLoadingProjects,
    fetchProjects,
    createProject,
    deleteProject,
  } = useAIWritingStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    description: '',
    genre: 'NOVEL',
    targetWords: 50000,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    if (user) {
      void fetchProjects();
    }
  }, [user, fetchProjects]);

  const handleCreate = async () => {
    if (!createForm.description.trim()) return;

    setIsCreating(true);
    try {
      // Extract title from first line or first 30 chars
      const firstLine = createForm.description.split('\n')[0];
      const title =
        firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine;

      const project = await createProject({
        name: title,
        description: createForm.description,
        genre: createForm.genre,
        targetWords: createForm.targetWords,
      });
      setShowCreateDialog(false);
      setCreateForm({ description: '', genre: 'NOVEL', targetWords: 50000 });
      router.push(`/ai-writing/${project.id}`);
    } catch {
      // Error handled by store
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('确定要删除这个作品吗？')) {
      await deleteProject(projectId);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; color: string }> = {
      PLANNING: { label: '规划中', color: 'bg-purple-100 text-purple-700' },
      OUTLINING: { label: '大纲设计', color: 'bg-blue-100 text-blue-700' },
      WRITING: { label: '写作中', color: 'bg-amber-100 text-amber-700' },
      REVISING: { label: '修订中', color: 'bg-orange-100 text-orange-700' },
      COMPLETED: { label: '已完成', color: 'bg-green-100 text-green-700' },
    };
    return (
      config[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
    );
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
              <span className="text-5xl">✍️</span>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-gray-800">AI 写作</h2>
            <p className="mb-4 text-gray-500">5 位 AI 专家协作，帮你完成创作</p>
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
        <div className="mx-auto max-w-6xl px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI 写作</h1>
              <p className="mt-1 text-gray-500">
                5 位 AI 专家协作，帮你完成创作
              </p>
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 font-medium text-white shadow transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-md"
            >
              <span>+</span>
              开始创作
            </button>
          </div>

          {/* Projects Grid */}
          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : projects.length === 0 ? (
            /* Empty State */
            <div
              onClick={() => setShowCreateDialog(true)}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 py-20 text-center transition-all hover:border-amber-300 hover:bg-amber-50/30"
            >
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
                开始你的第一个创作
              </h3>
              <p className="text-sm text-gray-500">
                描述你的想法，AI 写作团队将协作完成
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* New Project Card */}
              <button
                onClick={() => setShowCreateDialog(true)}
                className="group flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 p-6 transition-all hover:border-amber-300 hover:bg-amber-50/30"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-2xl transition-colors group-hover:bg-amber-100">
                  +
                </div>
                <span className="font-medium text-gray-600 group-hover:text-amber-700">
                  开始创作
                </span>
                <span className="mt-1 text-sm text-gray-400">描述你的想法</span>
              </button>

              {/* Project Cards */}
              {projects.map((project) => {
                const status = getStatusBadge(project.status);
                const progress =
                  project.targetWords > 0
                    ? Math.round(
                        (project.currentWords / project.targetWords) * 100
                      )
                    : 0;

                return (
                  <div
                    key={project.id}
                    onClick={() => router.push(`/ai-writing/${project.id}`)}
                    className="group relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-amber-200 hover:shadow-lg"
                  >
                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDelete(e, project.id)}
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
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

                    {/* Header */}
                    <div className="mb-3">
                      <div className="flex items-start justify-between">
                        <h3 className="line-clamp-1 pr-8 text-lg font-semibold text-gray-900 group-hover:text-amber-700">
                          {project.name}
                        </h3>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {project.genre || '未分类'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {project.description && (
                      <p className="mb-4 line-clamp-2 text-sm text-gray-500">
                        {project.description}
                      </p>
                    )}

                    {/* Progress */}
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
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
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-gray-50 pt-3">
                      <div className="flex -space-x-1.5">
                        {WRITING_TEAM.map((agent) => (
                          <span
                            key={agent.id}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs ring-2 ring-white"
                            title={agent.name}
                          >
                            {agent.icon}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">开始创作</h2>
              <button
                onClick={() => setShowCreateDialog(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
              >
                <svg
                  className="h-5 w-5 text-gray-400"
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

            {/* Body */}
            <div className="p-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                你想写什么？
              </label>
              <textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
                placeholder="描述你的故事想法...&#10;&#10;例如：一个程序员穿越到三国时代，用现代知识改变历史的故事"
                rows={5}
                className="w-full rounded-xl border border-gray-200 p-4 text-gray-900 placeholder-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                autoFocus
              />

              {/* Options Toggle */}
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="mt-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${showOptions ? 'rotate-180' : ''}`}
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
                可选设置
              </button>

              {/* Options */}
              {showOptions && (
                <div className="mt-4 grid gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">
                      类型
                    </label>
                    <select
                      value={createForm.genre}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, genre: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    >
                      {GENRES.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">
                      预计字数
                    </label>
                    <select
                      value={createForm.targetWords}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          targetWords: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    >
                      {WORD_COUNTS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.description.trim() || isCreating}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-medium text-white transition-all hover:from-amber-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    创建中...
                  </>
                ) : (
                  '开始创作'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
