'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';

interface Character {
  id: string;
  name: string;
  role: string;
  description?: string;
}

interface Volume {
  id: string;
  volumeNumber: number;
  title: string;
  synopsis?: string;
  targetWords?: number;
  chapters: {
    id: string;
    chapterNumber: number;
    title: string;
    status: string;
    wordCount: number;
  }[];
}

interface StoryBible {
  id: string;
  characters: Character[];
  worldSettings: { id: string; name: string }[];
  terminologies: { id: string; term: string }[];
  timelineEvents: { id: string; title: string }[];
  factions: { id: string; name: string }[];
}

interface WritingProject {
  id: string;
  name: string;
  description?: string;
  genre: string;
  targetWords: number;
  currentWords: number;
  status: string;
  writingStyle?: string;
  targetAudience?: string;
  pov?: string;
  tense?: string;
  createdAt: string;
  updatedAt: string;
  storyBible?: StoryBible;
  volumes: Volume[];
}

export default function WritingProjectDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<WritingProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'bible' | 'volumes'>(
    'overview'
  );

  // AI Writing Mission states
  const [showWritingModal, setShowWritingModal] = useState(false);
  const [writingPrompt, setWritingPrompt] = useState('');
  const [targetWords, setTargetWords] = useState(30000);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionMessage, setMissionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/ai-writing/projects/${projectId}`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      } else if (res.status === 404) {
        setError(t('aiWriting.errors.projectNotFound'));
      } else {
        setError(t('aiWriting.errors.loadFailed'));
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t('aiWriting.errors.loadFailed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && projectId) void fetchProject();
  }, [user, projectId]);

  // Start AI Writing Mission
  const startAIWriting = async () => {
    if (!writingPrompt.trim()) {
      setMissionMessage({
        type: 'error',
        text: t('aiWriting.errors.promptRequired'),
      });
      return;
    }

    setMissionLoading(true);
    setMissionMessage(null);

    try {
      const res = await fetch(
        `${config.apiUrl}/ai-writing/projects/${projectId}/missions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          credentials: 'include',
          body: JSON.stringify({
            prompt: writingPrompt,
            missionType: 'full_story',
            targetWordCount: targetWords,
          }),
        }
      );

      if (res.ok) {
        setMissionMessage({
          type: 'success',
          text: t('aiWriting.missionStarted'),
        });
        setShowWritingModal(false);
        setWritingPrompt('');
        // Refresh project to see new status
        setTimeout(() => void fetchProject(), 2000);
      } else {
        const data = await res.json();
        setMissionMessage({
          type: 'error',
          text: data.message || t('aiWriting.errors.missionFailed'),
        });
      }
    } catch (err: unknown) {
      setMissionMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : t('aiWriting.errors.missionFailed'),
      });
    } finally {
      setMissionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PLANNING: 'bg-gray-100 text-gray-700',
      OUTLINING: 'bg-blue-100 text-blue-700',
      WRITING: 'bg-amber-100 text-amber-700',
      REVISING: 'bg-purple-100 text-purple-700',
      COMPLETED: 'bg-green-100 text-green-700',
      DRAFT: 'bg-gray-100 text-gray-700',
      IN_PROGRESS: 'bg-amber-100 text-amber-700',
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
      draft: 'draft',
      in_progress: 'inProgress',
    };
    return t(`aiWriting.status.${statusKeys[key] || 'planning'}`);
  };

  if (authLoading || loading) {
    return (
      <AppShell>
        <main className="flex-1 p-12">
          <div className="flex items-center justify-center">
            <svg
              className="h-8 w-8 animate-spin text-amber-600"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </main>
      </AppShell>
    );
  }

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

  if (error || !project) {
    return (
      <AppShell>
        <main className="flex-1 p-12">
          <div className="mx-auto max-w-3xl rounded-2xl border border-red-100 bg-red-50 p-10 text-center">
            <h2 className="text-xl font-semibold text-red-800">
              {error || t('aiWriting.errors.projectNotFound')}
            </h2>
            <button
              onClick={() => router.push('/ai-writing')}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t('aiWriting.backToProjects')}
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  const totalChapters = project.volumes.reduce(
    (sum, v) => sum + v.chapters.length,
    0
  );
  const completedChapters = project.volumes.reduce(
    (sum, v) => sum + v.chapters.filter((c) => c.status === 'COMPLETED').length,
    0
  );

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/ai-writing')}
              className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t('aiWriting.backToProjects')}
            </button>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {project.name}
                  </h1>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(project.status)}`}
                  >
                    {getStatusLabel(project.status)}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-1 text-sm text-gray-500">
                    {project.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                  <span>{project.genre}</span>
                  {project.pov && <span>{project.pov}</span>}
                  {project.tense && <span>{project.tense}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setWritingPrompt(project.description || '');
                    setShowWritingModal(true);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700"
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {t('aiWriting.startAIWriting')}
                </button>
                <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {t('common.edit')}
                </button>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t('aiWriting.progress')}</span>
                <span className="font-medium text-gray-900">
                  {project.currentWords.toLocaleString()} /{' '}
                  {project.targetWords.toLocaleString()} {t('aiWriting.words')}
                </span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-amber-500 transition-all"
                  style={{
                    width: `${Math.min(100, (project.currentWords / project.targetWords) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>
                  {completedChapters} / {totalChapters}{' '}
                  {t('aiWriting.chaptersCompleted')}
                </span>
                <span>
                  {Math.round(
                    (project.currentWords / project.targetWords) * 100
                  )}
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex gap-6">
              {(['overview', 'bible', 'volumes'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {t(`aiWriting.tabs.${tab}`)}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Project Details */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">
                  {t('aiWriting.projectDetails')}
                </h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">
                      {t('aiWriting.form.genre')}
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {project.genre}
                    </dd>
                  </div>
                  {project.pov && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">
                        {t('aiWriting.form.pov')}
                      </dt>
                      <dd className="font-medium text-gray-900">
                        {project.pov}
                      </dd>
                    </div>
                  )}
                  {project.tense && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">
                        {t('aiWriting.form.tense')}
                      </dt>
                      <dd className="font-medium text-gray-900">
                        {project.tense}
                      </dd>
                    </div>
                  )}
                  {project.writingStyle && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">
                        {t('aiWriting.form.writingStyle')}
                      </dt>
                      <dd className="font-medium text-gray-900">
                        {project.writingStyle}
                      </dd>
                    </div>
                  )}
                  {project.targetAudience && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">
                        {t('aiWriting.form.targetAudience')}
                      </dt>
                      <dd className="font-medium text-gray-900">
                        {project.targetAudience}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Quick Stats */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">
                  {t('aiWriting.quickStats')}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {project.volumes.length}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('aiWriting.volumes')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {totalChapters}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('aiWriting.chapters')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {project.storyBible?.characters.length || 0}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('aiWriting.characters')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {project.currentWords.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('aiWriting.words')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bible' && (
            <div className="space-y-6">
              {/* Characters */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {t('aiWriting.characters')}
                  </h3>
                  <button className="text-sm text-amber-600 hover:text-amber-700">
                    + {t('aiWriting.addCharacter')}
                  </button>
                </div>
                {project.storyBible?.characters.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {project.storyBible.characters.map((char) => (
                      <div
                        key={char.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="font-medium text-gray-900">
                          {char.name}
                        </div>
                        <div className="text-xs text-gray-500">{char.role}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {t('aiWriting.noCharacters')}
                  </p>
                )}
              </div>

              {/* World Settings */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-gray-900">
                  {t('aiWriting.worldSettings')}
                </h3>
                {project.storyBible?.worldSettings.length ? (
                  <div className="flex flex-wrap gap-2">
                    {project.storyBible.worldSettings.map((ws) => (
                      <span
                        key={ws.id}
                        className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                      >
                        {ws.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {t('aiWriting.noWorldSettings')}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'volumes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {t('aiWriting.volumesAndChapters')}
                </h3>
                <button className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t('aiWriting.addVolume')}
                </button>
              </div>

              {project.volumes.length ? (
                project.volumes.map((volume) => (
                  <div
                    key={volume.id}
                    className="rounded-xl border border-gray-100 bg-white shadow-sm"
                  >
                    <div className="border-b border-gray-100 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {t('aiWriting.volume')} {volume.volumeNumber}:{' '}
                            {volume.title}
                          </h4>
                          {volume.synopsis && (
                            <p className="mt-1 text-sm text-gray-500">
                              {volume.synopsis}
                            </p>
                          )}
                        </div>
                        <button className="text-sm text-amber-600 hover:text-amber-700">
                          + {t('aiWriting.addChapter')}
                        </button>
                      </div>
                    </div>
                    {volume.chapters.length ? (
                      <div className="divide-y divide-gray-50">
                        {volume.chapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            className="flex items-center justify-between p-3 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-600">
                                {chapter.chapterNumber}
                              </span>
                              <span className="text-sm text-gray-900">
                                {chapter.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400">
                                {chapter.wordCount.toLocaleString()}{' '}
                                {t('aiWriting.words')}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(chapter.status)}`}
                              >
                                {getStatusLabel(chapter.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500">
                        {t('aiWriting.noChapters')}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                  <h3 className="text-sm font-medium text-gray-900">
                    {t('aiWriting.noVolumes')}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t('aiWriting.createFirstVolume')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Mission Message Toast */}
      {missionMessage && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg ${
            missionMessage.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{missionMessage.text}</span>
            <button
              onClick={() => setMissionMessage(null)}
              className="ml-2 text-white/80 hover:text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* AI Writing Modal */}
      {showWritingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {t('aiWriting.startAIWriting')}
              </h2>
              <button
                onClick={() => setShowWritingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Prompt */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('aiWriting.writingPrompt')} *
                </label>
                <textarea
                  value={writingPrompt}
                  onChange={(e) => setWritingPrompt(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder={t('aiWriting.writingPromptPlaceholder')}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t('aiWriting.writingPromptHint')}
                </p>
              </div>

              {/* Target Words */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('aiWriting.form.targetWords')}
                </label>
                <input
                  type="number"
                  value={targetWords}
                  onChange={(e) =>
                    setTargetWords(parseInt(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  min={1000}
                  step={1000}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowWritingModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={startAIWriting}
                disabled={missionLoading || !writingPrompt.trim()}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {missionLoading ? (
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
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {t('aiWriting.starting')}
                  </>
                ) : (
                  <>
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    {t('aiWriting.startWriting')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
