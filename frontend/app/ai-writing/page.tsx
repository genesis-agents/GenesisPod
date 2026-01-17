'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useAIWritingStore } from '@/stores/aiWritingStore';
import { getStylePresets, type WritingStylePreset } from '@/lib/api/ai-writing';
import { WRITING_AGENT_REGISTRY } from '@/lib/ai-writing/agent-config';
import ShareModal from '@/components/common/ShareModal';

// AI Writing Team - Preview (5 core agents) - 使用统一配置
const AI_TEAM_PREVIEW = Object.values(WRITING_AGENT_REGISTRY)
  .filter((agent) => !agent.supportsMultiInstance || agent.id === 'writer')
  .map((agent) => ({
    id: agent.id,
    icon: agent.icon,
    name: agent.nameCn,
    color: agent.gradient,
  }));

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
  { value: 200000, label: '20万字' },
  { value: 500000, label: '50万字+' },
  { value: 1000000, label: '100万字+' },
];

// Style category labels
const STYLE_CATEGORY_LABELS: Record<string, string> = {
  chinese_martial_arts: '中国武侠名家',
  chinese_web_novel: '中国网文流派',
  foreign: '外国经典风格',
  custom: '其他风格',
};

// Vibrant gradient color schemes for project cards
const PROJECT_GRADIENTS = [
  {
    from: 'from-amber-500',
    to: 'to-orange-600',
    shadow: 'shadow-amber-500/30',
  },
  {
    from: 'from-violet-500',
    to: 'to-purple-600',
    shadow: 'shadow-violet-500/30',
  },
  { from: 'from-blue-500', to: 'to-cyan-500', shadow: 'shadow-blue-500/30' },
  {
    from: 'from-emerald-500',
    to: 'to-teal-500',
    shadow: 'shadow-emerald-500/30',
  },
  { from: 'from-pink-500', to: 'to-rose-500', shadow: 'shadow-pink-500/30' },
  {
    from: 'from-indigo-500',
    to: 'to-blue-600',
    shadow: 'shadow-indigo-500/30',
  },
  {
    from: 'from-fuchsia-500',
    to: 'to-pink-500',
    shadow: 'shadow-fuchsia-500/30',
  },
  { from: 'from-cyan-500', to: 'to-blue-500', shadow: 'shadow-cyan-500/30' },
];

function getProjectGradient(projectId: string) {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash << 5) - hash + projectId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PROJECT_GRADIENTS.length;
  return PROJECT_GRADIENTS[index];
}

export default function AIWritingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const {
    projects,
    isLoadingProjects,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  } = useAIWritingStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    description: '',
    genre: 'NOVEL',
    targetWords: 50000,
    writingStyle: '', // 写作风格预设ID
  });
  const [isCreating, setIsCreating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Style presets
  const [stylePresets, setStylePresets] = useState<WritingStylePreset[]>([]);
  const [isLoadingStyles, setIsLoadingStyles] = useState(false);

  // Edit modal state
  const [editingProject, setEditingProject] = useState<
    (typeof projects)[0] | null
  >(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    genre: '',
    targetWords: 50000,
    writingStyle: '',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Share modal state
  const [shareProject, setShareProject] = useState<(typeof projects)[0] | null>(
    null
  );

  useEffect(() => {
    if (user) {
      void fetchProjects();
    }
  }, [user, fetchProjects]);

  // Fetch style presets when dialog opens (create or edit)
  useEffect(() => {
    const dialogOpen = showCreateDialog || editingProject !== null;
    if (dialogOpen && stylePresets.length === 0 && !isLoadingStyles) {
      setIsLoadingStyles(true);
      getStylePresets()
        .then((res) => {
          setStylePresets(res.presets || []);
        })
        .catch(() => {
          // Ignore errors
        })
        .finally(() => {
          setIsLoadingStyles(false);
        });
    }
  }, [showCreateDialog, editingProject, stylePresets.length, isLoadingStyles]);

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
        writingStyle: createForm.writingStyle || undefined,
      });
      setShowCreateDialog(false);
      setCreateForm({
        description: '',
        genre: 'NOVEL',
        targetWords: 50000,
        writingStyle: '',
      });
      router.push(`/ai-writing/${project.id}`);
    } catch {
      // Error handled by store
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm(t('aiWriting.actions.confirmDelete'))) {
      await deleteProject(projectId);
    }
  };

  const handleToggleVisibility = async (
    e: React.MouseEvent,
    project: (typeof projects)[0]
  ) => {
    e.stopPropagation();
    const newVisibility =
      project.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    await updateProject(project.id, { visibility: newVisibility });
  };

  const handleShare = (e: React.MouseEvent, project: (typeof projects)[0]) => {
    e.stopPropagation();
    setShareProject(project);
  };

  const handleEdit = (e: React.MouseEvent, project: (typeof projects)[0]) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditForm({
      name: project.name,
      description: project.description || '',
      genre: project.genre || 'NOVEL',
      targetWords: project.targetWords || 50000,
      writingStyle: project.writingStyle || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;
    setIsEditing(true);
    try {
      await updateProject(editingProject.id, editForm);
      setEditingProject(null);
    } catch {
      // Error handled by store
    } finally {
      setIsEditing(false);
    }
  };

  const getGenreLabel = (genre: string) => {
    return GENRES.find((g) => g.value === genre)?.label || genre;
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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  };

  // Filter projects by search query
  const filteredProjects = projects.filter((project) => {
    if (!searchQuery) return true;
    return (
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <svg
            className="h-16 w-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700">
            {t('aiWriting.signIn.title')}
          </h2>
          <p className="text-gray-500">{t('aiWriting.signIn.description')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        {/* Header - Sticky */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {t('aiWriting.title')}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t('aiWriting.subtitle', { count: 5 })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                开始创作
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-4">
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={t('aiWriting.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
            </div>
          ) : filteredProjects.length === 0 && !searchQuery ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-700">
                {t('aiWriting.empty.noProjects')}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {t('aiWriting.empty.noProjectsDesc')}
              </p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                开始创作
              </button>
            </div>
          ) : filteredProjects.length === 0 && searchQuery ? (
            /* No Search Results */
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-700">
                {t('aiWriting.noResults.title')}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {t('aiWriting.noResults.description')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProjects.map((project) => {
                const status = getStatusBadge(project.status);
                const progress =
                  project.targetWords > 0
                    ? Math.round(
                        (project.currentWords / project.targetWords) * 100
                      )
                    : 0;
                const gradient = getProjectGradient(project.id);

                return (
                  <div
                    key={project.id}
                    onClick={() => router.push(`/ai-writing/${project.id}`)}
                    className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
                  >
                    {/* Visibility & Edit & Delete Buttons */}
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => handleToggleVisibility(e, project)}
                        className={`rounded-lg bg-white p-1.5 shadow-sm transition-colors ${
                          project.visibility === 'PUBLIC'
                            ? 'text-green-500 hover:bg-green-50 hover:text-green-600'
                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                        }`}
                        title={
                          project.visibility === 'PUBLIC'
                            ? t('aiWriting.visibility.public')
                            : t('aiWriting.visibility.private')
                        }
                      >
                        {project.visibility === 'PUBLIC' ? (
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
                              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        ) : (
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
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        )}
                      </button>
                      {project.visibility === 'PUBLIC' && (
                        <button
                          onClick={(e) => handleShare(e, project)}
                          className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm hover:bg-blue-50 hover:text-blue-600"
                          title={t('share.shareWriting')}
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
                        </button>
                      )}
                      <button
                        onClick={(e) => handleEdit(e, project)}
                        className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm hover:bg-blue-50 hover:text-blue-600"
                        title={t('aiWriting.actions.edit')}
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, project.id)}
                        className="rounded-lg bg-white p-1.5 text-gray-400 shadow-sm hover:bg-red-50 hover:text-red-600"
                        title={t('aiWriting.actions.delete')}
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Avatar with gradient */}
                    <div className="flex items-start justify-between">
                      <div
                        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient.from} ${gradient.to} shadow-lg ${gradient.shadow} transition-transform group-hover:scale-105`}
                      >
                        <span className="text-2xl drop-shadow-sm">✍️</span>
                        <div className="absolute inset-0 rounded-2xl ring-2 ring-white/20 transition-all group-hover:ring-4 group-hover:ring-white/30" />
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h3 className="mt-3 truncate text-base font-semibold text-gray-900 group-hover:text-amber-600">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                        {project.description}
                      </p>
                    )}

                    {/* Progress */}
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          {project.currentWords.toLocaleString()} /{' '}
                          {project.targetWords.toLocaleString()}{' '}
                          {t('aiWriting.unit.words')}
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

                    {/* Footer: Genre + Time */}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {getGenreLabel(project.genre || 'NOVEL')}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTime(project.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Create New Card */}
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-amber-400 hover:bg-amber-50"
              >
                <svg
                  className="h-10 w-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="mt-2 text-sm font-medium text-gray-600">
                  {t('aiWriting.createDialog.title')}
                </span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('aiWriting.createDialog.title')}
              </h2>
              <button
                onClick={() => setShowCreateDialog(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-6 w-6"
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

            {/* Content - Scrollable */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  你想写什么？ *
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="描述你的故事想法...&#10;&#10;例如：一个程序员穿越到三国时代，用现代知识改变历史的故事"
                  rows={5}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  autoFocus
                />
              </div>

              {/* Options Toggle */}
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
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
                <div className="space-y-4 rounded-xl bg-gray-50 p-4">
                  {/* Row 1: Genre and Word Count */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-500">
                        类型
                      </label>
                      <select
                        value={createForm.genre}
                        onChange={(e) =>
                          setCreateForm({
                            ...createForm,
                            genre: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
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
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      >
                        {WORD_COUNTS.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Writing Style (full width) */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">
                      写作风格
                    </label>
                    <select
                      value={createForm.writingStyle}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          writingStyle: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      disabled={isLoadingStyles}
                    >
                      <option value="">自动推荐（根据类型）</option>
                      {/* Group by category */}
                      {Object.entries(STYLE_CATEGORY_LABELS).map(
                        ([category, label]) => {
                          const presetsInCategory = stylePresets.filter(
                            (p) => p.category === category
                          );
                          if (presetsInCategory.length === 0) return null;
                          return (
                            <optgroup key={category} label={label}>
                              {presetsInCategory.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                  {preset.name} - {preset.description}
                                </option>
                              ))}
                            </optgroup>
                          );
                        }
                      )}
                    </select>
                    {createForm.writingStyle && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {
                          stylePresets.find(
                            (p) => p.id === createForm.writingStyle
                          )?.representative
                        }
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* AI Team Preview */}
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="mb-3 text-xs font-medium text-amber-700">
                  AI 写作团队
                </p>
                <div className="flex items-center gap-3">
                  {AI_TEAM_PREVIEW.map((agent) => (
                    <div key={agent.id} className="flex flex-col items-center">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} text-lg shadow-sm`}
                      >
                        {agent.icon}
                      </span>
                      <span className="mt-1 text-xs text-gray-500">
                        {agent.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer - Fixed at bottom */}
            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.description.trim() || isCreating}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? '创建中...' : '开始创作'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">编辑作品</h2>
              <button
                onClick={() => setEditingProject(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-6 w-6"
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

            {/* Content */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  作品名称 *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  作品简介
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Options */}
              <div className="space-y-4 rounded-xl bg-gray-50 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-500">
                      类型
                    </label>
                    <select
                      value={editForm.genre}
                      onChange={(e) =>
                        setEditForm({ ...editForm, genre: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
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
                      目标字数
                    </label>
                    <select
                      value={editForm.targetWords}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          targetWords: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    >
                      {WORD_COUNTS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Writing Style */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-500">
                    写作风格
                  </label>
                  <select
                    value={editForm.writingStyle}
                    onChange={(e) =>
                      setEditForm({ ...editForm, writingStyle: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    disabled={isLoadingStyles}
                  >
                    <option value="">自动推荐（根据类型）</option>
                    {Object.entries(STYLE_CATEGORY_LABELS).map(
                      ([category, label]) => {
                        const presetsInCategory = stylePresets.filter(
                          (p) => p.category === category
                        );
                        if (presetsInCategory.length === 0) return null;
                        return (
                          <optgroup key={category} label={label}>
                            {presetsInCategory.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name} - {preset.description}
                              </option>
                            ))}
                          </optgroup>
                        );
                      }
                    )}
                  </select>
                  {editForm.writingStyle && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      {
                        stylePresets.find((p) => p.id === editForm.writingStyle)
                          ?.representative
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setEditingProject(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim() || isEditing}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditing ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareProject && (
        <ShareModal
          isOpen={!!shareProject}
          onClose={() => setShareProject(null)}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/writing/${shareProject.id}`}
          title={shareProject.name}
          description={shareProject.description}
        />
      )}
    </AppShell>
  );
}
