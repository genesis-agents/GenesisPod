'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  runResearchTeam,
  type BudgetProfile,
  type RunMissionInput,
} from '@/services/agent-playground/api';
import { Loader2, Sparkles } from 'lucide-react';

export function DemoLauncher() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 从 query 预填（"更新"按钮跳转过来时带 topic/depth/language）
  const initTopic = searchParams?.get('topic') ?? '';
  const initDepth = (searchParams?.get('depth') ??
    'standard') as RunMissionInput['depth'];
  const initLang = (searchParams?.get('language') ??
    'zh-CN') as RunMissionInput['language'];

  const [topic, setTopic] = useState(initTopic);
  const [depth, setDepth] = useState<RunMissionInput['depth']>(
    ['quick', 'standard', 'deep'].includes(initDepth) ? initDepth : 'standard'
  );
  const [language, setLanguage] = useState<RunMissionInput['language']>(
    initLang === 'en-US' ? 'en-US' : 'zh-CN'
  );
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfile>('medium');
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
        budgetProfile,
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
          {t('playground.researchTeam.topicLabel') || '研究 Topic'}
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={
            t('playground.researchTeam.topicPlaceholder') ||
            '例如：AI agents market 2026 Q2'
          }
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          maxLength={200}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            {t('playground.researchTeam.depth') || '研究深度'}
          </label>
          <select
            value={depth}
            onChange={(e) =>
              setDepth(e.target.value as RunMissionInput['depth'])
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="quick">快速（2-3 维度）</option>
            <option value="standard">标准（3-5 维度）</option>
            <option value="deep">深度（5-7 维度）</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            {t('playground.researchTeam.language') || '输出语言'}
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
            预算档位
          </label>
          <select
            value={budgetProfile}
            onChange={(e) => setBudgetProfile(e.target.value as BudgetProfile)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            title="低/中/高 决定 token 上限；不限 几乎不设上限（按用户 BYOK 余额限制）"
          >
            <option value="low">低（约 $0.1）</option>
            <option value="medium">中（约 $0.5，默认）</option>
            <option value="high">高（约 $2，深度研究）</option>
            <option value="unlimited">不限（仅受 BYOK 余额限制）</option>
          </select>
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
            {t('playground.researchTeam.starting') || '启动中…'}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {t('playground.researchTeam.start') || '启动研究团队'}
          </>
        )}
      </button>
    </form>
  );
}
