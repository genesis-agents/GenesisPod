'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useAIWritingStore } from '@/stores/aiWritingStore';

export default function NewProjectPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { createProject, error, clearError } = useAIWritingStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetWords, setTargetWords] = useState(50000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        targetWords,
      });
      router.push(`/ai-writing/${project.id}`);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/ai-writing');
  };

  if (authLoading) return null;

  if (!user) {
    router.push('/ai-writing');
    return null;
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="mx-auto max-w-xl px-6 py-12">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={handleCancel}
              className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
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
              {t('common.back')}
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('aiWriting.createProject.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('aiWriting.createProject.subtitle')}
            </p>
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

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-5">
              {/* Project Name */}
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.createProject.name')}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('aiWriting.createProject.namePlaceholder')}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.createProject.description')}
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'aiWriting.createProject.descriptionPlaceholder'
                  )}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Target Words */}
              <div>
                <label
                  htmlFor="targetWords"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.createProject.targetWords')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="targetWords"
                    value={targetWords}
                    onChange={(e) =>
                      setTargetWords(parseInt(e.target.value) || 0)
                    }
                    min={1000}
                    step={1000}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 pr-16 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {t('aiWriting.words')}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {t('aiWriting.createProject.targetWordsHint')}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {t('common.creating')}
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t('aiWriting.createProject.submit')}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
