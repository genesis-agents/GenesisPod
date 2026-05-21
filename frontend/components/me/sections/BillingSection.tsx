'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  TrendingUp,
  Bookmark,
  Eye,
  MessageSquare,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { useCredits, useCreditsStats, useCheckinHistory } from '@/hooks/domain';
import { useCreditsTransactions } from '@/hooks/domain/useCredits';
import { config } from '@/lib/utils/config';
import ClientDate from '@/components/common/ClientDate';
import { SettingsSectionCard } from '@/components/ui/cards/SettingsSectionCard';
import { logger } from '@/lib/utils/logger';

interface UserStats {
  memberSince: string;
  stats: {
    bookmarked: number;
    viewed: number;
    comments: number;
    notes: number;
    reports: number;
    chatSessions: number;
    topicsCreated: number;
    imagesGenerated: number;
  };
}

/**
 * 账单 /me/billing — 积分余额 + 签到 + 积分明细 + 用量统计。
 * 整合原 /credits 页（无支付/订阅系统，积分通过签到获取）+ /auth/stats 用量统计。
 */
export function BillingSection() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const {
    account,
    checkinStatus,
    isCheckingIn,
    performCheckin,
    showCheckinModal,
    refreshAccount,
    refreshCheckinStatus,
  } = useCredits();
  const { stats } = useCreditsStats();
  const { transactions } = useCreditsTransactions({ limit: 10 });
  const { history: checkinHistory } = useCheckinHistory(7);

  const [userStats, setUserStats] = useState<UserStats | null>(null);

  const safeCheckinHistory = Array.isArray(checkinHistory)
    ? checkinHistory
    : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const fetchUserStats = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${config.apiUrl}/auth/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const result = (await response.json()) as
          | { data?: UserStats }
          | UserStats;
        const data = 'data' in result && result.data ? result.data : result;
        setUserStats(data as UserStats);
      }
    } catch (error) {
      logger.error('Failed to fetch user stats:', error);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchUserStats();
  }, [fetchUserStats]);

  const handleCheckin = async () => {
    if (!checkinStatus?.canCheckin || isCheckingIn) return;
    await performCheckin();
    showCheckinModal();
    void refreshAccount();
    void refreshCheckinStatus();
  };

  return (
    <div className="space-y-6">
      {/* 积分概览 */}
      <div className="grid gap-4 md:grid-cols-3">
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
                {t('credits.checkin')}
              </button>
            )}
          </div>
        </div>

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

      {/* 每日签到 */}
      <SettingsSectionCard title={t('credits.dailyCheckin')}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex gap-2">
            {safeCheckinHistory.map((day, idx) => (
              <div
                key={idx}
                className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-green-100 text-green-700"
              >
                <Gift className="h-5 w-5" />
                <span className="text-xs font-medium">{day.streakDays}</span>
              </div>
            ))}
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
          <div className="flex-1">
            <p className="text-gray-600">
              {checkinStatus?.hasCheckedInToday
                ? t('credits.streakDays', { days: checkinStatus.streakDays })
                : checkinStatus?.message ||
                  t('credits.dailyCheckinDesc', { credits: 50 })}
            </p>
          </div>
        </div>
      </SettingsSectionCard>

      {/* 积分明细 */}
      <SettingsSectionCard title={t('credits.transactions')}>
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
                    <ClientDate date={tx.createdAt} format="datetime" />
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
      </SettingsSectionCard>

      {/* 用量统计 */}
      <SettingsSectionCard title={t('me.billing.usage')}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <UsageStat
            icon={<Bookmark className="h-5 w-5 text-violet-600" />}
            label={t('profile.stats.bookmarked')}
            value={userStats?.stats.bookmarked ?? 0}
          />
          <UsageStat
            icon={<Eye className="h-5 w-5 text-blue-600" />}
            label={t('profile.stats.resourcesViewed')}
            value={userStats?.stats.viewed ?? 0}
          />
          <UsageStat
            icon={<MessageSquare className="h-5 w-5 text-green-600" />}
            label={t('profile.stats.comments')}
            value={userStats?.stats.comments ?? 0}
          />
          <UsageStat
            icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
            label={t('profile.stats.aiChats')}
            value={userStats?.stats.chatSessions ?? 0}
          />
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="h-4 w-4" />
          {t('profile.stats.memberSince')}:{' '}
          {userStats?.memberSince ? (
            <ClientDate
              date={userStats.memberSince}
              format="date"
              dateOptions={{ year: 'numeric', month: 'long' }}
            />
          ) : (
            'N/A'
          )}
        </div>
      </SettingsSectionCard>
    </div>
  );
}

function UsageStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
