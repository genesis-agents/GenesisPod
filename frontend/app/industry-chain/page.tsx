'use client';

/**
 * Industry Chain landing — the real entry point for the feature.
 *
 * The backend exposes POST /industry-chain/analyze {topic} -> { chainId }, then
 * a viewer at /industry-chain/[chainId]. This page lets the user enter a topic,
 * kicks off the analysis, and routes to the viewer.
 *
 * Layout follows the full-width app-page norm (sticky PageHeaderHero + px-8 body)
 * used by ai-research / ai-radar / ai-insights — NOT a narrow centered column.
 * Example chains fill the page with guided entry points (ai-ask welcome pattern).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Network, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Button } from '@/components/ui/primitives/button';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { industryChainApi } from '@/services/industry-chain/api';
import { logger } from '@/lib/utils/logger';

// 示例产业链（点击直接发起分析）——填充引导，对齐 ai-ask 欢迎页的建议范式。
// 是「建议项」非「用户资产」，故用轻量建议磁贴而非 AssetCard。
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

  const theme = MODULE_THEMES.industryChain;

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
          <div className="mt-3 flex justify-end">
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

        {/* 示例产业链 */}
        <div className="mt-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" aria-hidden />
            <h2 className="text-sm font-semibold text-gray-900">
              {t('industryChain.examplesTitle')}
            </h2>
            <span className="text-xs text-gray-400">
              {t('industryChain.examplesHint')}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.map((ex) => {
              const label = locale === 'zh' ? ex.zh : ex.en;
              return (
                <button
                  key={ex.en}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setTopic(label);
                    void startAnalysis(label);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Network className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-sm text-gray-700">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
