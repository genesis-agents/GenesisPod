'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useAIWritingStore } from '@/stores/aiWritingStore';

export default function AIWritingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const {
    projects,
    isLoadingProjects,
    error,
    fetchProjects,
    deleteProject,
    clearError,
  } = useAIWritingStore();

  useEffect(() => {
    if (user) {
      void fetchProjects();
    }
  }, [user, fetchProjects]);

  const handleCreateProject = () => {
    router.push('/ai-writing/new');
  };

  const handleOpenProject = (projectId: string) => {
    router.push(`/ai-writing/${projectId}`);
  };

  const handleDeleteProject = async (
    e: React.MouseEvent,
    projectId: string
  ) => {
    e.stopPropagation();
    if (confirm(t('aiWriting.confirmDelete'))) {
      try {
        await deleteProject(projectId);
      } catch {
        // Error handled by store
      }
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PLANNING: 'bg-slate-100 text-slate-600',
      OUTLINING: 'bg-blue-100 text-blue-600',
      WRITING: 'bg-amber-100 text-amber-600',
      REVISING: 'bg-purple-100 text-purple-600',
      COMPLETED: 'bg-green-100 text-green-600',
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      PLANNING: t('aiWriting.status.planning'),
      OUTLINING: t('aiWriting.status.outlining'),
      WRITING: t('aiWriting.status.writing'),
      REVISING: t('aiWriting.status.revising'),
      COMPLETED: t('aiWriting.status.completed'),
    };
    return texts[status] || status;
  };

  const getProgressPercent = (current: number, target: number) => {
    if (!target || target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
              <svg
                className="h-8 w-8 text-amber-600"
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
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-800">
              {t('aiWriting.signIn.title')}
            </h2>
            <p className="text-sm text-gray-500">
              {t('aiWriting.signIn.description')}
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('aiWriting.title')}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {t('aiWriting.subtitle')}
              </p>
            </div>
            <button
              onClick={handleCreateProject}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
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
              {t('aiWriting.newProject')}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-4">
              <span className="text-sm text-red-700">{error}</span>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700"
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
          )}

          {/* Projects Grid */}
          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-amber-600"></div>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
                <svg
                  className="h-10 w-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-900">
                {t('aiWriting.empty.noProjects')}
              </h3>
              <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500">
                {t('aiWriting.empty.noProjectsDesc')}
              </p>
              <button
                onClick={handleCreateProject}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
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
                {t('aiWriting.empty.createFirst')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleOpenProject(project.id)}
                  className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-amber-300 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="line-clamp-1 font-semibold text-gray-900 transition-colors group-hover:text-amber-700">
                      {project.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(project.status)}`}
                    >
                      {getStatusText(project.status)}
                    </span>
                  </div>

                  {project.description && (
                    <p className="mb-4 line-clamp-2 text-sm text-gray-500">
                      {project.description}
                    </p>
                  )}

                  <div className="mb-3 flex items-center justify-between text-xs text-gray-400">
                    <span>{project.genre || t('aiWriting.noGenre')}</span>
                    <span>
                      {project.currentWords.toLocaleString()} /{' '}
                      {project.targetWords.toLocaleString()}
                    </span>
                  </div>

                  <div className="relative h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-all"
                      style={{
                        width: `${getProgressPercent(project.currentWords, project.targetWords)}%`,
                      }}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-xs text-gray-400">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="text-gray-400 opacity-0 transition-colors hover:text-red-500 group-hover:opacity-100"
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
                </div>
              ))}

              {/* Create New Card */}
              <div
                onClick={handleCreateProject}
                className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-5 transition-all hover:border-amber-400 hover:bg-amber-50/30"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <svg
                    className="h-6 w-6 text-gray-400"
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
                </div>
                <span className="text-sm font-medium text-gray-600">
                  {t('aiWriting.newProject')}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
