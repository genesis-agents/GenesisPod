'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';

interface WritingProject {
  id: string;
  name: string;
  description?: string;
  genre: string;
  targetWords: number;
  currentWords: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function AIWritingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/ai-writing/projects`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        setProjects(await res.json());
      } else {
        setMessage(t('aiWriting.errors.loadFailed'));
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('aiWriting.errors.loadFailed');
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void fetchProjects();
  }, [user]);

  const handleViewDetail = (project: WritingProject) => {
    router.push(`/ai-writing/${project.id}`);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PLANNING: 'bg-gray-100 text-gray-700',
      OUTLINING: 'bg-blue-100 text-blue-700',
      WRITING: 'bg-amber-100 text-amber-700',
      REVISING: 'bg-purple-100 text-purple-700',
      COMPLETED: 'bg-green-100 text-green-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: string) => {
    const key = status.toLowerCase() as keyof typeof statusKeys;
    const statusKeys = {
      planning: 'planning',
      outlining: 'outlining',
      writing: 'writing',
      revising: 'revising',
      completed: 'completed',
    };
    return t(`aiWriting.status.${statusKeys[key] || 'planning'}`);
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <AppShell>
        <main className="flex-1 p-12">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-800">
              {t('aiWriting.signIn.title')}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {t('aiWriting.signIn.description')}
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          {/* Header */}
          <div className="mb-6">
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {t('aiWriting.title')}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t('aiWriting.subtitle')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/ai-writing/new')}
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
                {t('aiWriting.newProject')}
              </button>
            </div>
          </div>

          {/* Features Overview */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">{t('aiWriting.storyBible')}</h3>
              <p className="mt-1 text-xs text-gray-500">Centralized settings management</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">{t('aiWriting.characters')}</h3>
              <p className="mt-1 text-xs text-gray-500">Character state tracking</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">{t('aiWriting.consistency')}</h3>
              <p className="mt-1 text-xs text-gray-500">Automated consistency checks</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">{t('aiWriting.parallel.title')}</h3>
              <p className="mt-1 text-xs text-gray-500">Multi-writer parallel execution</p>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </div>
          )}

          {/* Projects */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {t('aiWriting.myProjects')}
                </h2>
              </div>
              <button
                onClick={() => void fetchProjects()}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                {t('aiWriting.refresh')}
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">
                {t('aiWriting.loading')}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
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
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  {t('aiWriting.empty.noProjects')}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {t('aiWriting.empty.noProjectsDesc')}
                </p>
                <button
                  onClick={() => router.push('/ai-writing/new')}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('aiWriting.empty.createFirst')}
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleViewDetail(project)}
                    className="cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <h3 className="font-medium text-gray-900">{project.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </div>
                    {project.description && (
                      <p className="mb-3 line-clamp-2 text-sm text-gray-500">{project.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{project.genre}</span>
                      <span>{project.currentWords.toLocaleString()} / {project.targetWords.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, (project.currentWords / project.targetWords) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
