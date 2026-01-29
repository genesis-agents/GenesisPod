'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Send, Loader2 } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import ClientDate from '@/components/common/ClientDate';

interface NotificationStats {
  totalCount: number;
  todayCount: number;
  unreadRate: number;
  typeCount: number;
  byType: Record<string, number>;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  read: boolean;
  createdAt: string;
}

interface PaginatedResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  totalPages: number;
}

const TYPE_COLORS: Record<string, string> = {
  SYSTEM: 'bg-blue-100 text-blue-800',
  UPDATE: 'bg-purple-100 text-purple-800',
  TIP: 'bg-green-100 text-green-800',
  CREDITS_LOW: 'bg-red-100 text-red-800',
  CREDITS_RECEIVED: 'bg-emerald-100 text-emerald-800',
  RESEARCH_COMPLETED: 'bg-indigo-100 text-indigo-800',
  TASK_ASSIGNED: 'bg-yellow-100 text-yellow-800',
  MENTION: 'bg-pink-100 text-pink-800',
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [notifData, setNotifData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Broadcast form
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiUrl}/admin/notifications/stats`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(t('admin.notifications.errors.fetchFailed'));
      const json = await res.json();
      setStats(json?.data ?? json);
    } catch (err) {
      logger.error('Failed to fetch notification stats:', err);
    }
  }, [t]);

  const fetchRecent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const res = await fetch(
        `${config.apiUrl}/admin/notifications/recent?${params}`,
        { headers: getAuthHeader() }
      );
      if (!res.ok) throw new Error(t('admin.notifications.errors.fetchFailed'));
      const json = await res.json();
      setNotifData(json?.data ?? json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.notifications.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch recent notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setSending(true);
    setActionMessage(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/admin/notifications/broadcast`,
        {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: broadcastTitle,
            message: broadcastMessage,
          }),
        }
      );
      if (!res.ok)
        throw new Error(t('admin.notifications.errors.broadcastFailed'));
      const json = await res.json();
      const result = json?.data ?? json;
      setActionMessage(
        t('admin.notifications.broadcastSuccess').replace(
          '{count}',
          String(result.sent)
        )
      );
      setBroadcastTitle('');
      setBroadcastMessage('');
      void fetchStats();
      void fetchRecent();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.notifications.errors.broadcastFailed');
      setActionMessage(message);
      logger.error('Failed to broadcast notification:', err);
    } finally {
      setSending(false);
    }
  };

  const statCards = stats
    ? [
        {
          label: t('admin.notifications.stats.totalCount'),
          value: stats.totalCount,
        },
        {
          label: t('admin.notifications.stats.todayCount'),
          value: stats.todayCount,
        },
        {
          label: t('admin.notifications.stats.unreadRate'),
          value: `${stats.unreadRate}%`,
        },
        {
          label: t('admin.notifications.stats.typeCount'),
          value: stats.typeCount,
        },
      ]
    : [];

  return (
    <AdminPageLayout
      title={t('admin.notifications.title')}
      description={t('admin.notifications.description')}
      icon={Bell}
      domain="system"
      maxWidth="7xl"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {actionMessage && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {actionMessage}
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <div className="text-sm text-gray-500">{stat.label}</div>
            <div className="mt-1 text-2xl font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Broadcast Form */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">
              {t('admin.notifications.broadcast')}
            </h3>
          </div>
          <form onSubmit={handleBroadcast} className="space-y-3 p-4">
            <input
              type="text"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder={t('admin.notifications.titlePlaceholder')}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder={t('admin.notifications.messagePlaceholder')}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <button
              type="submit"
              disabled={
                sending || !broadcastTitle.trim() || !broadcastMessage.trim()
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('admin.notifications.sendButton')}
            </button>
          </form>
        </div>

        {/* Recent Notifications */}
        <div className="rounded-xl border bg-white shadow-sm lg:col-span-2">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">
              {t('admin.notifications.recentTitle')}
            </h3>
          </div>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-gray-400">
              {t('admin.notifications.loading')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-2">
                        {t('admin.notifications.columns.type')}
                      </th>
                      <th className="px-4 py-2">
                        {t('admin.notifications.columns.title')}
                      </th>
                      <th className="px-4 py-2">
                        {t('admin.notifications.columns.user')}
                      </th>
                      <th className="px-4 py-2">
                        {t('admin.notifications.columns.time')}
                      </th>
                      <th className="px-4 py-2">
                        {t('admin.notifications.columns.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifData?.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[item.type] ?? 'bg-gray-100 text-gray-800'}`}
                          >
                            {item.type}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2 font-medium">
                          {item.title}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {item.userEmail}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          <ClientDate date={item.createdAt} />
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${item.read ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}
                          >
                            {item.read
                              ? t('admin.notifications.read')
                              : t('admin.notifications.unread')}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!notifData?.items || notifData.items.length === 0) && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-gray-400"
                        >
                          {t('admin.notifications.noNotifications')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {notifData && notifData.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
                  >
                    {t('admin.notifications.previous')}
                  </button>
                  <span className="text-sm text-gray-500">
                    {page} / {notifData.totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setPage(Math.min(notifData.totalPages, page + 1))
                    }
                    disabled={page >= notifData.totalPages}
                    className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
                  >
                    {t('admin.notifications.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
}
