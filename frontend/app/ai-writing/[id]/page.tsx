'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useAIWritingStore } from '@/stores/aiWritingStore';

export default function WritingWorkspacePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, isLoading: authLoading } = useAuth();

  const {
    currentProject,
    volumes,
    currentChapter,
    isLoadingProjects,
    isLoadingVolumes,
    error,
    fetchProject,
    fetchVolumes,
    fetchChapter,
    updateChapter,
    createVolume,
    createChapter,
    startMission,
    isMissionRunning,
    clearError,
  } = useAIWritingStore();

  const [editorContent, setEditorContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Load project and volumes
  useEffect(() => {
    if (user && projectId) {
      void fetchProject(projectId);
      void fetchVolumes(projectId);
    }
  }, [user, projectId, fetchProject, fetchVolumes]);

  // Update editor content when chapter changes
  useEffect(() => {
    if (currentChapter?.content) {
      setEditorContent(currentChapter.content);
    } else {
      setEditorContent('');
    }
  }, [currentChapter]);

  // Auto-save with debounce
  const saveContent = useCallback(async () => {
    if (!currentChapter || editorContent === currentChapter.content) return;

    setIsSaving(true);
    try {
      await updateChapter(currentChapter.id, editorContent);
    } catch {
      // Error handled by store
    } finally {
      setIsSaving(false);
    }
  }, [currentChapter, editorContent, updateChapter]);

  // Debounced save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentChapter && editorContent !== currentChapter.content) {
        void saveContent();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [editorContent, currentChapter, saveContent]);

  const handleSelectChapter = (chapterId: string) => {
    // Save current before switching
    if (currentChapter && editorContent !== currentChapter.content) {
      void saveContent();
    }
    void fetchChapter(chapterId);
  };

  const handleCreateVolume = async () => {
    const title = prompt(t('aiWriting.workspace.newVolumeTitle'));
    if (!title) return;

    try {
      await createVolume(projectId, {
        title,
        volumeNumber: volumes.length + 1,
      });
    } catch {
      // Error handled by store
    }
  };

  const handleCreateChapter = async (volumeId: string) => {
    const title = prompt(t('aiWriting.workspace.newChapterTitle'));
    if (!title) return;

    const volume = volumes.find((v) => v.id === volumeId);
    const chapterNumber = (volume?.chapters?.length || 0) + 1;

    try {
      const chapter = await createChapter(volumeId, { title, chapterNumber });
      void fetchChapter(chapter.id);
    } catch {
      // Error handled by store
    }
  };

  const handleStartAI = async () => {
    if (!aiPrompt.trim()) return;

    try {
      await startMission(projectId, {
        prompt: aiPrompt,
        missionType: 'chapter',
      });
      setAiPrompt('');
      setShowAIPanel(false);
    } catch {
      // Error handled by store
    }
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const getTotalWords = () => {
    let total = 0;
    volumes.forEach((v) => {
      v.chapters?.forEach((c) => {
        total += c.wordCount || 0;
      });
    });
    return total;
  };

  if (authLoading || isLoadingProjects) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-amber-600" />
        </main>
      </AppShell>
    );
  }

  if (!user) {
    router.push('/ai-writing');
    return null;
  }

  if (error && !currentProject) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">
              {t('aiWriting.errors.loadFailed')}
            </h2>
            <p className="mb-4 text-sm text-gray-500">{error}</p>
            <button
              onClick={() => router.push('/ai-writing')}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              {t('aiWriting.backToList')}
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex flex-1 flex-col overflow-hidden bg-gray-50">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ai-writing')}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                <h1 className="font-semibold text-gray-900">
                  {currentProject?.name || t('aiWriting.loading')}
                </h1>
                <p className="text-xs text-gray-500">
                  {getTotalWords().toLocaleString()} /{' '}
                  {(currentProject?.targetWords || 0).toLocaleString()}{' '}
                  {t('aiWriting.words')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSaving && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                  {t('common.saving')}
                </span>
              )}
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  showAIPanel
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
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
                  AI
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Chapter List */}
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
            <div className="p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('aiWriting.workspace.chapters')}
                </span>
                <button
                  onClick={handleCreateVolume}
                  className="rounded p-1 text-gray-400 hover:text-amber-600"
                  title={t('aiWriting.workspace.addVolume')}
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>

              {isLoadingVolumes ? (
                <div className="py-4 text-center">
                  <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-amber-600" />
                </div>
              ) : volumes.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="mb-2 text-xs text-gray-400">
                    {t('aiWriting.workspace.noChapters')}
                  </p>
                  <button
                    onClick={handleCreateVolume}
                    className="text-xs font-medium text-amber-600 hover:text-amber-700"
                  >
                    {t('aiWriting.workspace.createFirst')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {volumes.map((volume) => (
                    <div key={volume.id}>
                      <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-gray-700">
                        <span>{volume.title}</span>
                        <button
                          onClick={() => handleCreateChapter(volume.id)}
                          className="rounded p-0.5 text-gray-400 hover:text-amber-600"
                        >
                          <svg
                            className="h-3.5 w-3.5"
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
                        </button>
                      </div>
                      {volume.chapters?.map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => handleSelectChapter(chapter.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            currentChapter?.id === chapter.id
                              ? 'bg-amber-50 font-medium text-amber-700'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{chapter.title}</span>
                            <span className="text-xs text-gray-400">
                              {chapter.wordCount || 0}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {currentChapter ? (
              <>
                <div className="flex-shrink-0 border-b border-gray-100 bg-white px-6 py-3">
                  <input
                    type="text"
                    value={currentChapter.title}
                    readOnly
                    className="w-full border-none bg-transparent text-lg font-semibold text-gray-900 outline-none"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    placeholder={t('aiWriting.workspace.startWriting')}
                    className="h-full min-h-[500px] w-full resize-none border-none bg-transparent text-base leading-relaxed text-gray-800 outline-none"
                  />
                </div>
                <div className="flex-shrink-0 border-t border-gray-100 bg-white px-6 py-2 text-xs text-gray-400">
                  {getWordCount(editorContent).toLocaleString()}{' '}
                  {t('aiWriting.words')}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                    <svg
                      className="h-8 w-8 text-gray-400"
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
                  <h3 className="mb-1 font-medium text-gray-600">
                    {t('aiWriting.workspace.selectChapter')}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {t('aiWriting.workspace.selectChapterDesc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* AI Panel */}
          {showAIPanel && (
            <div className="flex w-72 flex-shrink-0 flex-col border-l border-gray-200 bg-white">
              <div className="border-b border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">
                    {t('aiWriting.workspace.aiAssistant')}
                  </h3>
                  <button
                    onClick={() => setShowAIPanel(false)}
                    className="rounded p-1 text-gray-400 hover:text-gray-600"
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
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  <button className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100">
                    {t('aiWriting.workspace.continueWriting')}
                  </button>
                  <button className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100">
                    {t('aiWriting.workspace.rewrite')}
                  </button>
                  <button className="w-full rounded-lg bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100">
                    {t('aiWriting.workspace.expand')}
                  </button>
                </div>
                <div className="mt-4">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={t('aiWriting.workspace.aiPromptPlaceholder')}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleStartAI}
                    disabled={!aiPrompt.trim() || isMissionRunning}
                    className="mt-2 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isMissionRunning
                      ? t('aiWriting.workspace.generating')
                      : t('aiWriting.workspace.generate')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Toast */}
        {error && (
          <div className="fixed bottom-4 right-4 max-w-sm rounded-lg border border-red-100 bg-red-50 p-4 shadow-lg">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
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
          </div>
        )}
      </main>
    </AppShell>
  );
}
