'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import * as api from '@/lib/api/ai-writing';

interface CreateProjectForm {
  name: string;
  description: string;
  genre: string;
  targetWords: number;
  writingStyle?: string;
  targetAudience?: string;
  pov?: string;
  tense?: string;
}

const GENRES = [
  'Fantasy',
  'Sci-Fi',
  'Romance',
  'Mystery',
  'Thriller',
  'Horror',
  'Literary Fiction',
  'Historical Fiction',
  'Young Adult',
  'Other',
];

const POV_OPTIONS = [
  { value: 'first', label: 'First Person' },
  { value: 'third-limited', label: 'Third Person Limited' },
  { value: 'third-omniscient', label: 'Third Person Omniscient' },
  { value: 'second', label: 'Second Person' },
];

const TENSE_OPTIONS = [
  { value: 'past', label: 'Past Tense' },
  { value: 'present', label: 'Present Tense' },
];

export default function NewWritingProjectPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateProjectForm>({
    name: '',
    description: '',
    genre: 'Fantasy',
    targetWords: 100000,
    writingStyle: '',
    targetAudience: '',
    pov: 'third-limited',
    tense: 'past',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('aiWriting.errors.nameRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const project = await api.createProject({
        name: form.name,
        description: form.description,
        genre: form.genre,
        targetWords: form.targetWords,
      });
      router.push(`/ai-writing/${project.id}`);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : t('aiWriting.errors.createFailed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
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
        <div className="mx-auto max-w-2xl px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.back()}
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
              {t('common.back')}
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {t('aiWriting.createProject')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('aiWriting.createProjectDesc')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Project Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                {t('aiWriting.form.projectName')} *
              </label>
              <input
                type="text"
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder={t('aiWriting.form.projectNamePlaceholder')}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700"
              >
                {t('aiWriting.form.description')}
              </label>
              <textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder={t('aiWriting.form.descriptionPlaceholder')}
              />
            </div>

            {/* Genre & Target Words */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="genre"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.form.genre')}
                </label>
                <select
                  id="genre"
                  value={form.genre}
                  onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {GENRES.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="targetWords"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.form.targetWords')}
                </label>
                <input
                  type="number"
                  id="targetWords"
                  value={form.targetWords}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targetWords: parseInt(e.target.value) || 0,
                    })
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  min={1000}
                  step={1000}
                />
              </div>
            </div>

            {/* POV & Tense */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pov"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.form.pov')}
                </label>
                <select
                  id="pov"
                  value={form.pov}
                  onChange={(e) => setForm({ ...form, pov: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {POV_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="tense"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('aiWriting.form.tense')}
                </label>
                <select
                  id="tense"
                  value={form.tense}
                  onChange={(e) => setForm({ ...form, tense: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {TENSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Writing Style */}
            <div>
              <label
                htmlFor="writingStyle"
                className="block text-sm font-medium text-gray-700"
              >
                {t('aiWriting.form.writingStyle')}
              </label>
              <input
                type="text"
                id="writingStyle"
                value={form.writingStyle}
                onChange={(e) =>
                  setForm({ ...form, writingStyle: e.target.value })
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder={t('aiWriting.form.writingStylePlaceholder')}
              />
            </div>

            {/* Target Audience */}
            <div>
              <label
                htmlFor="targetAudience"
                className="block text-sm font-medium text-gray-700"
              >
                {t('aiWriting.form.targetAudience')}
              </label>
              <input
                type="text"
                id="targetAudience"
                value={form.targetAudience}
                onChange={(e) =>
                  setForm({ ...form, targetAudience: e.target.value })
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder={t('aiWriting.form.targetAudiencePlaceholder')}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {loading && (
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
                )}
                {t('aiWriting.form.create')}
              </button>
            </div>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
