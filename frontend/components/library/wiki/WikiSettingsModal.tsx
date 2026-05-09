'use client';

/**
 * Wiki Settings Modal — KB-level config viewer + editor (inline page count,
 * inline token budget, ingest max tokens, auto-lint cadence). Extracted from
 * WikiTab.tsx for the project's god-class size guard.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { wikiApi, type WikiKbConfig } from '@/lib/api/wiki';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';

export default function WikiSettingsModal({
  kbId,
  onClose,
}: {
  kbId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<WikiKbConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .getConfig(kbId)
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
      })
      .catch((err) => {
        logger?.error?.('[wiki] getConfig failed', err);
        if (!cancelled) setError(t('library.wiki.settings.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, t]);

  const save = async () => {
    if (!config || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await wikiApi.updateConfig(kbId, {
        inlinePageCount: config.inlinePageCount,
        inlineTokenBudget: config.inlineTokenBudget,
        ingestMaxTokens: config.ingestMaxTokens,
        cronLintEnabled: config.cronLintEnabled,
        cronLintDailyBudgetCalls: config.cronLintDailyBudgetCalls,
      });
      setConfig(result);
      onClose();
    } catch (err) {
      logger?.error?.('[wiki] updateConfig failed', err);
      setError(
        err instanceof Error
          ? err.message
          : t('library.wiki.settings.saveFailed')
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[90vh] w-[560px] flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {t('library.wiki.settings.title')}
            </h3>
            <p className="text-xs text-gray-500">
              {t('library.wiki.settings.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label={t('library.wiki.query.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            </div>
          )}
          {!loading && config && (
            <>
              <Field label={t('library.wiki.settings.inlinePageCountLabel')}>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={config.inlinePageCount}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      inlinePageCount: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </Field>
              <Field label={t('library.wiki.settings.inlineTokenBudgetLabel')}>
                <input
                  type="number"
                  min={10000}
                  max={5000000}
                  step={1000}
                  value={config.inlineTokenBudget}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      inlineTokenBudget: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </Field>
              <Field label={t('library.wiki.settings.ingestMaxTokensLabel')}>
                <input
                  type="number"
                  min={1000}
                  max={500000}
                  step={1000}
                  value={config.ingestMaxTokens}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      ingestMaxTokens: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </Field>
              <Field
                label={t('library.wiki.settings.cronLintDailyBudgetLabel')}
              >
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={config.cronLintDailyBudgetCalls}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cronLintDailyBudgetCalls: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.cronLintEnabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cronLintEnabled: e.target.checked,
                    })
                  }
                />
                {t('library.wiki.settings.cronLintEnabled')}
              </label>
            </>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('library.wiki.settings.cancel')}
          </button>
          <button
            onClick={() => void save()}
            disabled={loading || saving || !config}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('library.wiki.settings.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children}
    </div>
  );
}
