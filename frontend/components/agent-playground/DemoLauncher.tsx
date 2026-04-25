'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  runResearchTeam,
  type RunMissionInput,
} from '@/lib/api/agent-playground';
import { Loader2, Sparkles } from 'lucide-react';

export function DemoLauncher() {
  const { t } = useTranslation();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState<RunMissionInput['depth']>('standard');
  const [language, setLanguage] =
    useState<RunMissionInput['language']>('zh-CN');
  const [maxCredits, setMaxCredits] = useState(300);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { missionId } = await runResearchTeam({
        topic: topic.trim(),
        depth,
        language,
        maxCredits,
      });
      // 双重保险：API client 已校验，这里再 guard 一次
      if (!missionId || missionId === 'undefined') {
        throw new Error('Server did not return a missionId');
      }
      router.push(`/agent-playground/research-team/${missionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // 必修 #10: 跳转或失败都要重置；防 navigation 异常时按钮永久 loading
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-5"
    >
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-900">
          {t('playground.researchTeam.topicLabel') || 'Topic'}
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={
            t('playground.researchTeam.topicPlaceholder') ||
            'e.g. AI agents market 2026 Q2'
          }
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          maxLength={200}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            {t('playground.researchTeam.depth') || 'Depth'}
          </label>
          <select
            value={depth}
            onChange={(e) =>
              setDepth(e.target.value as RunMissionInput['depth'])
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="quick">Quick (2-3 dims)</option>
            <option value="standard">Standard (3-5)</option>
            <option value="deep">Deep (5-7)</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            {t('playground.researchTeam.language') || 'Language'}
          </label>
          <select
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as RunMissionInput['language'])
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            {t('playground.researchTeam.maxCredits') || 'Max Credits'}
          </label>
          <input
            type="number"
            value={maxCredits}
            onChange={(e) => setMaxCredits(Number(e.target.value))}
            min={50}
            max={5000}
            step={50}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !topic.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('playground.researchTeam.starting') || 'Starting…'}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {t('playground.researchTeam.start') || 'Run Research Team'}
          </>
        )}
      </button>
    </form>
  );
}
