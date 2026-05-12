'use client';

/**
 * Wiki Settings Modal — KB-level config viewer + editor (inline page count,
 * inline token budget, ingest max tokens, auto-lint cadence). Extracted from
 * WikiTab.tsx for the project's god-class size guard.
 */

import { useEffect, useState } from 'react';
import { Loader2, X, Languages } from 'lucide-react';
import { wikiApi, type WikiKbConfig, type WikiLocale } from '@/lib/api/wiki';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';

type LocaleMode = 'zh' | 'en' | 'both';

function localesToMode(locales: WikiLocale[] | undefined): LocaleMode {
  if (!locales || locales.length === 0) return 'zh';
  const hasZh = locales.includes('zh');
  const hasEn = locales.includes('en');
  if (hasZh && hasEn) return 'both';
  if (hasEn) return 'en';
  return 'zh';
}

function modeToLocales(mode: LocaleMode): WikiLocale[] {
  if (mode === 'both') return ['en', 'zh']; // sorted to match backend dedup+sort
  return [mode];
}

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
        enabledLocales: config.enabledLocales,
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
      <div className="flex max-h-[90vh] w-[680px] flex-col overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#ffffff,#f8fafc)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
              KB Configuration
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {t('library.wiki.settings.title')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('library.wiki.settings.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('library.wiki.query.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            </div>
          )}
          {!loading && config && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <ConfigCard
                  eyebrow="Query Path A"
                  title={t('library.wiki.settings.inlinePageCountLabel')}
                  description="How many wiki pages can stay inline before query fallback becomes necessary."
                >
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </ConfigCard>
                <ConfigCard
                  eyebrow="Query Budget"
                  title={t('library.wiki.settings.inlineTokenBudgetLabel')}
                  description="Controls how much inline wiki context can be packed into a single grounded answer."
                >
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </ConfigCard>
                <ConfigCard
                  eyebrow="Ingest Budget"
                  title={t('library.wiki.settings.ingestMaxTokensLabel')}
                  description="Sets the document budget the LLM can use while compiling wiki proposals."
                >
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </ConfigCard>
                <ConfigCard
                  eyebrow="Automation"
                  title={t('library.wiki.settings.cronLintDailyBudgetLabel')}
                  description="Daily budget for automatic lint passes that keep the wiki coherent at scale."
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </ConfigCard>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <label className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {t('library.wiki.settings.cronLintEnabled')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Run scheduled lint checks so contradictions, stale pages,
                      and missing links are surfaced without manual audits.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.cronLintEnabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        cronLintEnabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4"
                  />
                </label>
              </div>
              <LocalePickerCard
                mode={localesToMode(config.enabledLocales)}
                onChange={(m) =>
                  setConfig({ ...config, enabledLocales: modeToLocales(m) })
                }
              />
            </>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('library.wiki.settings.cancel')}
          </button>
          <button
            onClick={() => void save()}
            disabled={loading || saving || !config}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('library.wiki.settings.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ConfigCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
        {eyebrow}
      </div>
      <label className="mt-2 block text-sm font-medium text-slate-900">
        {title}
      </label>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LocalePickerCard({
  mode,
  onChange,
}: {
  mode: LocaleMode;
  onChange: (m: LocaleMode) => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ value: LocaleMode; labelKey: string }> = [
    { value: 'zh', labelKey: 'library.wiki.settings.enabledLocales.zh' },
    { value: 'en', labelKey: 'library.wiki.settings.enabledLocales.en' },
    { value: 'both', labelKey: 'library.wiki.settings.enabledLocales.both' },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
        Languages
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-900">
        <Languages className="h-4 w-4 text-violet-500" />
        {t('library.wiki.settings.enabledLocales.title')}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {t('library.wiki.settings.enabledLocales.description')}
      </p>
      <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {options.map((o) => {
          const active = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={
                'rounded-lg px-3 py-1.5 text-xs font-medium transition ' +
                (active
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900')
              }
            >
              {t(o.labelKey)}
            </button>
          );
        })}
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
