'use client';

/**
 * AI Radar Favorites list — FC-6
 *
 * /ai-radar/favorites
 * 用户已收藏的 signal 跨主题汇总，按收藏时间倒序
 */

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Loader2,
} from 'lucide-react';

import { useFavoritesList } from '@/hooks/domain/useFavoritesList';
import { TierBadge } from '@/components/common/badges/TierBadge';
import { WhyItMattersCallout } from '@/components/common/callouts/WhyItMattersCallout';

export default function RadarFavoritesPage() {
  const router = useRouter();
  const { data, loading, error } = useFavoritesList(100);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <button
        type="button"
        onClick={() => router.push('/ai-radar')}
        className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        返回雷达列表
      </button>

      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Bookmark className="h-6 w-6 text-violet-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-slate-800">我的收藏</h1>
        <span className="text-sm text-slate-500">
          · {data.length} 条信号
        </span>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          加载失败：{error.message ?? '未知错误'}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center">
          <p className="text-base font-medium text-slate-600">
            还没有收藏的信号
          </p>
          <p className="mt-1 text-sm text-slate-400">
            在精选卡片右下角点击收藏按钮即可加入这里
          </p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="space-y-4">
          {data.map((f) => (
            <FavoriteCard key={f.signalId} fav={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FavoriteCard({
  fav,
}: {
  fav: ReturnType<typeof useFavoritesList>['data'][number];
}) {
  const router = useRouter();
  const expired = fav.signal === null;

  return (
    <article
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        expired ? 'border-gray-100 opacity-70' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {fav.signal && <TierBadge tier={fav.signal.tier} size="sm" />}
          <h2 className="text-base font-semibold text-slate-800">
            {fav.signal?.title ?? '(已过期，原始 briefing 已清理)'}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-xs text-slate-400">
          <span>来自「{fav.topicName}」</span>
          {fav.briefingDate && <span>{fav.briefingDate}</span>}
        </div>
      </div>

      {fav.signal && (
        <>
          <p className="mt-3 text-sm font-medium text-slate-700">
            {fav.signal.oneLineTakeaway}
          </p>
          {fav.signal.whyItMatters && (
            <div className="mt-2">
              <WhyItMattersCallout>
                <p className="text-sm text-slate-700">
                  {fav.signal.whyItMatters}
                </p>
              </WhyItMattersCallout>
            </div>
          )}
          {fav.signal.whatsNext && (
            <p className="mt-2 text-sm text-slate-600">
              <span className="mr-1 font-medium text-slate-700">
                接下来看什么：
              </span>
              {fav.signal.whatsNext}
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span>收藏于 {formatDate(fav.favoritedAt)}</span>
        <button
          type="button"
          onClick={() =>
            router.push(
              `/ai-radar/topic/${fav.topicId}${fav.briefingDate ? `?date=${fav.briefingDate}` : ''}`,
            )
          }
          className="inline-flex items-center gap-1 text-violet-600 hover:underline"
        >
          查看主题
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </article>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
