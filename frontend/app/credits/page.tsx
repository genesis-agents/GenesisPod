'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  useCredits,
  useCreditsStats,
  useCreditRules,
  useCheckinHistory,
} from '@/hooks/domain';
import { useCreditsTransactions } from '@/hooks/domain/useCredits';

/**
 * 积分中心页面
 */
export default function CreditsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const {
    account,
    isLoading,
    checkinStatus,
    isCheckingIn,
    performCheckin,
    showCheckinModal,
    refreshAccount,
    refreshCheckinStatus,
  } = useCredits();
  const { stats, loading: statsLoading } = useCreditsStats();
  const { rules, loading: rulesLoading } = useCreditRules();
  const { transactions, loading: txLoading } = useCreditsTransactions({
    limit: 10,
  });
  const { history: checkinHistory, loading: historyLoading } =
    useCheckinHistory(7);

  // 确保数组类型安全
  const safeCheckinHistory = Array.isArray(checkinHistory)
    ? checkinHistory
    : [];
  const safeRules = Array.isArray(rules) ? rules : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  // 未登录重定向
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/credits');
    }
  }, [authLoading, user, router]);

  // 处理签到
  const handleCheckin = async () => {
    if (!checkinStatus?.canCheckin || isCheckingIn) return;
    await performCheckin();
    showCheckinModal();
    refreshAccount();
    refreshCheckinStatus();
  };

  if (authLoading || isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* 顶部概览卡片 */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* 当前余额 */}
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white shadow-lg">
            <div className="mb-2 text-sm font-medium opacity-80">
              {t('credits.currentBalance')}
            </div>
            <div className="mb-4 text-4xl font-bold">
              {account?.balance?.toLocaleString() ?? 0}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-80">{t('credits.credits')}</span>
              {checkinStatus?.canCheckin && (
                <button
                  onClick={handleCheckin}
                  disabled={isCheckingIn}
                  className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/30 disabled:opacity-50"
                >
                  {isCheckingIn ? (
                    <span className="flex items-center gap-1">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {t('credits.checkin')}
                    </span>
                  ) : (
                    t('credits.checkin')
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 累计获得 */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-2 text-sm font-medium text-gray-500">
              {t('credits.totalEarned')}
            </div>
            <div className="mb-4 text-3xl font-bold text-green-600">
              +
              {stats?.totalEarned?.toLocaleString() ??
                account?.totalEarned?.toLocaleString() ??
                0}
            </div>
            <div className="text-sm text-gray-500">
              {t('credits.todaySpent')}:{' '}
              {stats?.todaySpent ?? account?.todaySpent ?? 0}
            </div>
          </div>

          {/* 累计消耗 */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-2 text-sm font-medium text-gray-500">
              {t('credits.totalSpent')}
            </div>
            <div className="mb-4 text-3xl font-bold text-gray-700">
              {stats?.totalSpent?.toLocaleString() ??
                account?.totalSpent?.toLocaleString() ??
                0}
            </div>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>
                {t('credits.weekSpent')}: {stats?.weekSpent ?? 0}
              </span>
              <span>
                {t('credits.monthSpent')}: {stats?.monthSpent ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* 签到区域 */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {t('credits.dailyCheckin')}
          </h2>
          <div className="flex items-center gap-6">
            {/* 签到日历（最近7天） */}
            <div className="flex gap-2">
              {safeCheckinHistory.map((day, idx) => (
                <div
                  key={idx}
                  className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-green-100 text-green-700"
                  title={`${new Date(day.date).toLocaleDateString()} - ${day.credits} ${t('credits.credits')}`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                  <span className="text-xs font-medium">{day.streakDays}</span>
                </div>
              ))}
              {/* 填充空位 */}
              {Array.from({
                length: Math.max(0, 7 - safeCheckinHistory.length),
              }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400"
                >
                  <span className="text-lg">?</span>
                </div>
              ))}
            </div>

            {/* 连续签到信息 */}
            <div className="flex-1">
              <p className="text-gray-600">
                {checkinStatus?.hasCheckedInToday
                  ? t('credits.streakDays', { days: checkinStatus.streakDays })
                  : checkinStatus?.message
                    ? checkinStatus.message
                    : t('credits.dailyCheckinDesc', { credits: 50 })}
              </p>
              {!checkinStatus?.hasCheckedInToday && !checkinStatus?.message && (
                <p className="mt-1 text-sm text-gray-500">
                  {t('credits.streakRewardDesc')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 积分规则 */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {t('credits.creditsRules')}
            </h2>
            <div className="space-y-3">
              {safeRules.slice(0, 8).map((rule) => (
                <div
                  key={`${rule.moduleType}-${rule.operationType}`}
                  className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-700">
                      {rule.name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {rule.moduleType} / {rule.operationType}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="font-semibold text-blue-600">
                      {rule.baseCredits}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">
                      {t('credits.perOperation')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 最近交易记录 */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {t('credits.transactions')}
            </h2>
            {safeTransactions.length > 0 ? (
              <div className="space-y-3">
                {safeTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-4 border-b border-gray-100 pb-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-700">
                        {tx.description}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 font-semibold ${
                        tx.amount > 0 ? 'text-green-600' : 'text-gray-700'
                      }`}
                    >
                      {tx.amount > 0 ? '+' : ''}
                      {tx.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                {t('credits.noTransactions')}
              </div>
            )}
          </div>
        </div>

        {/* 获取积分方式 */}
        <div className="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {t('credits.earnWays')}
          </h2>
          <p className="mb-4 text-gray-600">{t('credits.earnWaysDesc')}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">
                {t('credits.dailyCheckin')}
              </h3>
              <p className="text-sm text-gray-500">
                {t('credits.dailyCheckinDesc', { credits: 50 })}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                <svg
                  className="h-5 w-5 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">
                {t('credits.streakReward')}
              </h3>
              <p className="text-sm text-gray-500">
                {t('credits.streakRewardDesc')}
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 opacity-50 shadow-sm">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900">
                {t('credits.moreWays')}
              </h3>
              <p className="text-sm text-gray-500">
                {t('credits.comingSoonWays')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
