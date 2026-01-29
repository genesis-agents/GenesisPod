'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import ClientDate from '@/components/common/ClientDate';

interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface PermissionsOverview {
  totalUsers: number;
  adminCount: number;
  activeUsers: number;
  recentNewUsers: number;
  admins: AdminUser[];
}

export default function PermissionsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PermissionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/permissions/overview`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(t('admin.permissions.errors.fetchFailed'));
      const json = await res.json();
      setData(json?.data ?? json);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.permissions.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch permissions overview:', err);
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
          label: t('admin.permissions.stats.adminCount'),
          value: data.adminCount,
        },
        {
          label: t('admin.permissions.stats.regularUsers'),
          value: data.totalUsers - data.adminCount,
        },
        {
          label: t('admin.permissions.stats.activeUsers'),
          value: data.activeUsers,
        },
        {
          label: t('admin.permissions.stats.recentNew'),
          value: data.recentNewUsers,
        },
      ]
    : [];

  return (
    <AdminPageLayout
      title={t('admin.permissions.title')}
      description={t('admin.permissions.description')}
      icon={Shield}
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
          {t('admin.permissions.loading')}
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

          {/* Admin List */}
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h3 className="font-medium">
                {t('admin.permissions.adminList')}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2">
                      {t('admin.permissions.columns.email')}
                    </th>
                    <th className="px-4 py-2">
                      {t('admin.permissions.columns.username')}
                    </th>
                    <th className="px-4 py-2">
                      {t('admin.permissions.columns.role')}
                    </th>
                    <th className="px-4 py-2">
                      {t('admin.permissions.columns.createdAt')}
                    </th>
                    <th className="px-4 py-2">
                      {t('admin.permissions.columns.lastLogin')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.admins.map((admin) => (
                    <tr
                      key={admin.id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 font-medium">{admin.email}</td>
                      <td className="px-4 py-2">{admin.username ?? '-'}</td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        <ClientDate date={admin.createdAt} />
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {admin.lastLoginAt ? (
                          <ClientDate date={admin.lastLoginAt} />
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!data?.admins || data.admins.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        {t('admin.permissions.noAdmins')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
