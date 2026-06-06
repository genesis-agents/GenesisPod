'use client';

/**
 * Industry Chain landing — the real entry point for the feature.
 *
 * The backend exposes POST /industry-chain/analyze {topic} -> { chainId }, then
 * a viewer at /industry-chain/[chainId]. Before this page there was no way to
 * START an analysis (the viewer needs a chainId) and no nav link. This page lets
 * the user enter a topic, kicks off the analysis, and routes to the viewer.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Network, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Button } from '@/components/ui/primitives/button';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { industryChainApi } from '@/services/industry-chain/api';
import { logger } from '@/lib/utils/logger';

export default function IndustryChainLandingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = MODULE_THEMES.industryChain;

  const handleAnalyze = async () => {
    const value = topic.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { chainId } = await industryChainApi.analyze(value);
      router.push(`/industry-chain/${chainId}`);
    } catch (err) {
      logger.error('[IndustryChain] analyze failed:', err);
      setError(t('industryChain.analyzeFailed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PageHeaderHero
          title={t('industryChain.title')}
          subtitle={t('industryChain.subtitle')}
          icon={<Network className="h-6 w-6 text-white" aria-hidden />}
          iconGradient={theme.gradient}
        />

        <div className="mt-8">
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
                void handleAnalyze();
              }
            }}
            placeholder={t('industryChain.topicPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <Button
              onClick={() => void handleAnalyze()}
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
      </div>
    </div>
  );
}
