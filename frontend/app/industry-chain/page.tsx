'use client';

/**
 * Industry Chain landing — full-width app-page norm (sticky PageHeaderHero + px-8),
 * consistent with ai-research / ai-radar / ai-insights.
 *
 * 全部复用 canonical 公共件，不自造：
 *   - 历史分析列表 → AssetCard（grid，与 radar/research 一致）
 *   - 加载/空/错误态 → LoadingState / EmptyState / ErrorState
 *   - 删除确认 → ConfirmDialog
 *   - 页头 → PageHeaderHero，按钮 → Button
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Network, Loader2, ArrowRight, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Button } from '@/components/ui/primitives/button';
import { AssetCard } from '@/components/ui/cards/asset-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/dialogs/ConfirmDialog';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { industryChainApi } from '@/services/industry-chain/api';
import type { IndustryChainListItem } from '@/services/industry-chain/types';
import { logger } from '@/lib/utils/logger';

// 示例产业链（点击直接发起分析）——快速起步建议（chip 范式，区别于"已保存分析"的卡片）。
const EXAMPLES: Array<{ zh: string; en: string }> = [
  { zh: '新能源汽车动力电池产业链', en: 'EV power-battery supply chain' },
  { zh: '半导体芯片制造产业链', en: 'Semiconductor chip manufacturing chain' },
  { zh: '光伏太阳能产业链', en: 'Photovoltaic solar industry chain' },
  { zh: '人工智能大模型产业链', en: 'AI foundation-model industry chain' },
  { zh: '创新药与生物医药产业链', en: 'Innovative drug & biopharma chain' },
  { zh: '消费电子供应链', en: 'Consumer electronics supply chain' },
];

export default function IndustryChainLandingPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chains, setChains] = useState<IndustryChainListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<IndustryChainListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const theme = MODULE_THEMES.industryChain;

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setChains(await industryChainApi.list());
    } catch (e) {
      setLoadError(e instanceof Error ? e : new Error('load failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startAnalysis = async (value: string) => {
    const v = value.trim();
    if (!v || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { chainId } = await industryChainApi.analyze(v);
      router.push(`/industry-chain/${chainId}`);
    } catch (err) {
      logger.error('[IndustryChain] analyze failed:', err);
      setError(t('industryChain.analyzeFailed'));
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await industryChainApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      void reload();
    } catch (e) {
      logger.error('[IndustryChain] delete failed:', e);
    } finally {
      setDeleting(false);
    }
  };

  const statusMeta = (status: string): { label: string; className: string } => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: t('industryChain.statusCompleted'),
          className: 'bg-emerald-50 text-emerald-700',
        };
      case 'FAILED':
        return {
          label: t('industryChain.statusFailed'),
          className: 'bg-red-50 text-red-700',
        };
      case 'PLANNING':
        return {
          label: t('industryChain.statusPlanning'),
          className: 'bg-gray-100 text-gray-600',
        };
      default:
        return {
          label: t('industryChain.statusRunning'),
          className: 'bg-amber-50 text-amber-700',
        };
    }
  };

  let historyBody: React.ReactNode;
  if (loading) {
    historyBody = <LoadingState text={t('industryChain.loadingHistory')} />;
  } else if (loadError) {
    historyBody = (
      <ErrorState error={loadError} onRetry={() => void reload()} />
    );
  } else if (chains.length === 0) {
    historyBody = (
      <EmptyState
        title={t('industryChain.historyEmpty')}
        description={t('industryChain.historyEmptyDesc')}
      />
    );
  } else {
    historyBody = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {chains.map((c) => {
          const s = statusMeta(c.status);
          return (
            <AssetCard
              key={c.id}
              title={c.topic}
              icon={<Network className="h-6 w-6 text-white" aria-hidden />}
              gradient={theme.gradient}
              badges={[
                { key: 'status', label: s.label, className: s.className },
              ]}
              stats={[
                {
                  key: 'nodes',
                  icon: <Network className="h-3.5 w-3.5" aria-hidden />,
                  text: `${c.entityCount}${t('industryChain.nodeCountSuffix')}`,
                },
              ]}
              timestamp={c.createdAt}
              onClick={() => router.push(`/industry-chain/${c.id}`)}
              extraActions={[
                {
                  key: 'delete',
                  icon: <Trash2 className="h-4 w-4" aria-hidden />,
                  title: t('industryChain.deleteConfirm'),
                  tone: 'danger',
                  onClick: () => setDeleteTarget(c),
                },
              ]}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
        <PageHeaderHero
          title={t('industryChain.title')}
          subtitle={t('industryChain.subtitle')}
          icon={<Network className="h-7 w-7 text-white" aria-hidden />}
          iconGradient={theme.gradient}
        />
      </div>

      <div className="px-8 py-6">
        {/* 输入区（全宽卡片） */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="industry-chain-topic"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            {t('industryChain.topicLabel')}
          </label>
          <textarea
            id="industry-chain-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void startAnalysis(topic);
              }
            }}
            placeholder={t('industryChain.topicPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {/* 示例：快速起步建议（chip） */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            {EXAMPLES.map((ex) => {
              const label = locale === 'zh' ? ex.zh : ex.en;
              return (
                <button
                  key={ex.en}
                  type="button"
                  disabled={submitting}
                  onClick={() => setTopic(label)}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-60"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => void startAnalysis(topic)}
              disabled={!topic.trim() || submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden />
              )}
              {submitting
                ? t('industryChain.analyzing')
                : t('industryChain.analyze')}
            </Button>
          </div>
        </div>

        {/* 历史分析 */}
        <div className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            {t('industryChain.history')}
          </h2>
          {historyBody}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('industryChain.deleteTitle')}
        description={t('industryChain.deleteDesc')}
        confirmText={t('industryChain.deleteConfirm')}
        type="danger"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
