'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';

interface BillingOverview {
  totalSpent: number;
  todaySpent: number;
  monthSpent: number;
  activeSpenders: number;
  byModule: { module: string; spent: number; count: number }[];
  byModel: { model: string; spent: number; tokens: number; count: number }[];
  dailyTrend: { date: string; spent: number }[];
}

const MODULE_LABELS: Record<string, string> = {
  'ai-ask': 'AI Ask',
  'ai-studio': 'AI Research',
  'topic-insights': 'Topic Insights',
  'ai-teams': 'AI Teams',
  'ai-office': 'AI Office',
  'ai-writing': 'AI Writing',
  'ai-image': 'AI Image',
  'ai-simulation': 'AI Simulation',
  'ai-social': 'AI Social',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function BillingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/billing/overview`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(t('admin.billing.errors.fetchFailed'));
      const json = await res.json();
      setData(json?.data ?? json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.billing.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch billing overview:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const stats = data
    ? [
        {
          label: t('admin.billing.stats.totalSpent'),
          value: formatNumber(data.totalSpent),
        },
        {
          label: t('admin.billing.stats.todaySpent'),
          value: formatNumber(data.todaySpent),
        },
        {
          label: t('admin.billing.stats.monthSpent'),
          value: formatNumber(data.monthSpent),
        },
        {
          label: t('admin.billing.stats.activeSpenders'),
          value: data.activeSpenders,
        },
      ]
    : [];

  return (
    <AdminPageLayout
      title={t('admin.billing.title')}
      description={t('admin.billing.description')}
      icon={CreditCard}
      domain="access"
      maxWidth="7xl"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-400">
          {t('admin.billing.loading')}
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border bg-white p-4 shadow-sm"
              >
                <div className="text-sm text-gray-500">{stat.label}</div>
                <div className="mt-1 text-2xl font-semibold">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* By Module */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <h3 className="font-medium">{t('admin.billing.byModule')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-2">
                        {t('admin.billing.columns.module')}
                      </th>
                      <th className="px-4 py-2 text-right">
                        {t('admin.billing.columns.spent')}
                      </th>
                      <th className="px-4 py-2 text-right">
                        {t('admin.billing.columns.calls')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.byModule
                      .sort((a, b) => b.spent - a.spent)
                      .map((row) => (
                        <tr
                          key={row.module}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 font-medium">
                            {MODULE_LABELS[row.module] ?? row.module}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {formatNumber(row.spent)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {formatNumber(row.count)}
                          </td>
                        </tr>
                      ))}
                    {(!data?.byModule || data.byModule.length === 0) && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-gray-400"
                        >
                          {t('admin.billing.noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Model */}
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-4 py-3">
                <h3 className="font-medium">{t('admin.billing.byModel')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-2">
                        {t('admin.billing.columns.model')}
                      </th>
                      <th className="px-4 py-2 text-right">
                        {t('admin.billing.columns.spent')}
                      </th>
                      <th className="px-4 py-2 text-right">
                        {t('admin.billing.columns.tokens')}
                      </th>
                      <th className="px-4 py-2 text-right">
                        {t('admin.billing.columns.calls')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.byModel
                      .sort((a, b) => b.spent - a.spent)
                      .map((row) => (
                        <tr
                          key={row.model}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 font-medium">{row.model}</td>
                          <td className="px-4 py-2 text-right">
                            {formatNumber(row.spent)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {formatNumber(row.tokens)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {formatNumber(row.count)}
                          </td>
                        </tr>
                      ))}
                    {(!data?.byModel || data.byModel.length === 0) && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-gray-400"
                        >
                          {t('admin.billing.noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Daily Trend */}
          <div className="mt-6 rounded-xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h3 className="font-medium">{t('admin.billing.dailyTrend')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2">
                      {t('admin.billing.columns.date')}
                    </th>
                    <th className="px-4 py-2 text-right">
                      {t('admin.billing.columns.spent')}
                    </th>
                    <th className="px-4 py-2">
                      {t('admin.billing.columns.bar')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const trendSlice = data?.dailyTrend.slice(-14) ?? [];
                    if (trendSlice.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-8 text-center text-gray-400"
                          >
                            {t('admin.billing.noData')}
                          </td>
                        </tr>
                      );
                    }
                    const maxSpent = Math.max(
                      ...trendSlice.map((d) => d.spent),
                      1
                    );
                    return trendSlice.map((row) => {
                      const pct = (row.spent / maxSpent) * 100;
                      return (
                        <tr
                          key={row.date}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2 text-gray-600">
                            {row.date}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {formatNumber(row.spent)}
                          </td>
                          <td className="px-4 py-2">
                            <div className="h-2 w-full rounded-full bg-gray-100">
                              <div
                                className="h-2 rounded-full bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
