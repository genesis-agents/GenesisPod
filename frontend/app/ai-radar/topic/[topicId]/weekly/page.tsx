'use client';

/**
 * Radar Weekly Briefing detail page — FC-5
 *
 * /ai-radar/topic/:topicId/weekly[?week=YYYY-MM-DD]
 *
 * 渲染：top10 ⭐⭐⭐ 信号 + 延续叙事 narrativeMap + new entities
 * 设计来源：daily-briefing-redesign-2026-05-18.md §4.3 + §6.2
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Calendar, Loader2, Sparkles, Star } from 'lucide-react';

import { useWeeklyBriefing } from '@/hooks/domain/useWeeklyBriefing';
import { useTranslation } from '@/lib/i18n';
import { TierBadge } from '@/components/common/badges/TierBadge';
import { WhyItMattersCallout } from '@/components/common/callouts/WhyItMattersCallout';

export default function WeeklyBriefingPage() {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const topicId = params?.topicId ?? null;
  const week = search?.get('week') ?? undefined;
  const { t: _t } = useTranslation();

  const { data, loading, error } = useWeeklyBriefing(topicId, week);
  const [, setRetry] = useState(0);
  useEffect(() => {
    if (error && error.status !== 404) setRetry((n) => n + 1);
  }, [error]);

  if (!topicId) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => router.push(`/ai-radar/topic/${topicId}`)}
        className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回主题详情
      </button>

      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Calendar className="h-6 w-6 text-violet-600" />
        <h1 className="text-2xl font-semibold text-slate-800">本周精选</h1>
        {data && (
          <span className="text-sm text-slate-500">
            · {data.weekStart} — {data.weekEnd}
          </span>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      )}

      {!loading && !data && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center text-sm text-slate-500">
          本周尚无周报。每周日 18:00 UTC 自动生成。
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* 总览 */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center text-violet-600">
                  <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
                  <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
                  <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
                </span>
                <span className="font-semibold">
                  {data.payload.tier3Count}
                </span>
                <span className="text-xs text-slate-400">最高评级</span>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <span className="font-semibold">
                  {data.payload.candidatesTotal}
                </span>
                <span className="ml-1 text-xs text-slate-400">候选总数</span>
              </span>
              {data.payload.narrativeMap.length > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    <span className="font-semibold">
                      {data.payload.narrativeMap.length}
                    </span>
                    <span className="ml-1 text-xs text-slate-400">
                      延续叙事
                    </span>
                  </span>
                </>
              )}
            </div>

            {data.payload.newEntities.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-500" />
                <span className="mr-1 text-xs font-medium text-slate-700">
                  本周新出现：
                </span>
                {data.payload.newEntities.slice(0, 10).map((entity) => (
                  <span
                    key={entity}
                    className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                  >
                    {entity}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* TOP 10 signals */}
          {data.payload.topSignals.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                TOP 10 ⭐⭐⭐ 信号
              </h2>
              <div className="space-y-4">
                {data.payload.topSignals.slice(0, 10).map((s, idx) => (
                  <article
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-500">
                          {idx + 1}.
                        </span>
                        <TierBadge tier={s.tier} size="sm" />
                        <h3 className="text-base font-semibold text-slate-800">
                          {s.title}
                        </h3>
                      </div>
                      <span className="text-xs text-slate-400">
                        {s.sourceBriefingDate}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      {s.oneLineTakeaway}
                    </p>
                    {s.whyItMatters && (
                      <div className="mt-2">
                        <WhyItMattersCallout>
                          <p className="text-sm text-slate-700">
                            {s.whyItMatters}
                          </p>
                        </WhyItMattersCallout>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Narrative threads */}
          {data.payload.narrativeMap.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                延续叙事
              </h2>
              <div className="space-y-3">
                {data.payload.narrativeMap.map((n) => (
                  <div
                    key={n.narrativeId}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-800">
                        {n.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        · {n.episodes.length} 集
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      最新：{n.latestTitle}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
