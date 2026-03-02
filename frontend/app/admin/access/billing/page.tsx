'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, X, Loader2 } from 'lucide-react';
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

interface DailyDetail {
  date: string;
  totalSpent: number;
  transactionCount: number;
  transactions: {
    id: string;
    amount: number;
    module: string | null;
    model: string | null;
    description: string | null;
    userEmail: string;
    userName: string | null;
    createdAt: string;
  }[];
  byModule: { module: string | null; spent: number; count: number }[];
  byModel: { model: string | null; spent: number; count: number }[];
}

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

  // Daily drill-down
  const [dailyDetail, setDailyDetail] = useState<DailyDetail | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/billing/overview`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(t('admin.billing.errors.fetchFailed'));
      const json = (await res.json()) as
        | { data?: BillingOverview }
        | BillingOverview;
      setData(
        (json as { data?: BillingOverview })?.data ?? (json as BillingOverview)
      );
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

  const fetchDailyDetail = async (date: string) => {
    setLoadingDaily(true);
    try {
      const res = await fetch(`${config.apiUrl}/admin/billing/daily/${date}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to fetch daily detail');
      const json = await res.json();
      setDailyDetail(json?.data ?? json);
    } catch (err) {
      logger.error('Failed to fetch daily billing detail:', err);
    } finally {
      setLoadingDaily(false);
    }
  };

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
                          className="cursor-pointer border-b last:border-0 hover:bg-blue-50"
                          onClick={() => void fetchDailyDetail(row.date)}
                        >
                          <td className="px-4 py-2 text-blue-600 underline decoration-dotted">
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

      {/* Daily Detail Modal */}
      {(dailyDetail || loadingDaily) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {t('admin.billing.dailyDetail')} {dailyDetail?.date ?? ''}
                </h3>
                {dailyDetail && (
                  <p className="text-sm text-gray-500">
                    {t('admin.billing.columns.spent')}:{' '}
                    {formatNumber(dailyDetail.totalSpent)} |{' '}
                    {t('admin.billing.columns.calls')}:{' '}
                    {dailyDetail.transactionCount}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDailyDetail(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingDaily ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : dailyDetail ? (
                <>
                  {/* Summary by module & model */}
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-3">
                      <h4 className="mb-2 text-sm font-medium text-gray-700">
                        {t('admin.billing.byModule')}
                      </h4>
                      {dailyDetail.byModule.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {t('admin.billing.noData')}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {dailyDetail.byModule
                            .sort((a, b) => b.spent - a.spent)
                            .map((m) => (
                              <div
                                key={m.module}
                                className="flex justify-between text-sm"
                              >
                                <span>
                                  {MODULE_LABELS[m.module ?? ''] ?? m.module}
                                </span>
                                <span className="font-medium">
                                  {formatNumber(m.spent)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border p-3">
                      <h4 className="mb-2 text-sm font-medium text-gray-700">
                        {t('admin.billing.byModel')}
                      </h4>
                      {dailyDetail.byModel.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {t('admin.billing.noData')}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {dailyDetail.byModel
                            .sort((a, b) => b.spent - a.spent)
                            .map((m) => (
                              <div
                                key={m.model}
                                className="flex justify-between text-sm"
                              >
                                <span>{m.model}</span>
                                <span className="font-medium">
                                  {formatNumber(m.spent)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Transaction list */}
                  <h4 className="mb-2 text-sm font-medium text-gray-700">
                    {t('admin.billing.transactions')}
                  </h4>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left text-gray-500">
                          <th className="px-3 py-2">
                            {t('admin.billing.columns.time')}
                          </th>
                          <th className="px-3 py-2">
                            {t('admin.billing.columns.user')}
                          </th>
                          <th className="px-3 py-2">
                            {t('admin.billing.columns.module')}
                          </th>
                          <th className="px-3 py-2">
                            {t('admin.billing.columns.model')}
                          </th>
                          <th className="px-3 py-2 text-right">
                            {t('admin.billing.columns.spent')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyDetail.transactions.map((tx) => (
                          <tr
                            key={tx.id}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="px-3 py-2 text-gray-500">
                              {new Date(tx.createdAt).toLocaleTimeString()}
                            </td>
                            <td className="px-3 py-2">{tx.userEmail}</td>
                            <td className="px-3 py-2">
                              {MODULE_LABELS[tx.module ?? ''] ??
                                tx.module ??
                                '-'}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {tx.model ?? '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatNumber(tx.amount)}
                            </td>
                          </tr>
                        ))}
                        {dailyDetail.transactions.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-6 text-center text-gray-400"
                            >
                              {t('admin.billing.noData')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
