'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, UserPlus, X, Search, Loader2, ArrowRight } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import ClientDate from '@/components/common/ClientDate';
import Link from 'next/link';

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

interface SearchUser {
  id: string;
  email: string;
  username: string | null;
  role: string;
}

export default function PermissionsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PermissionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add admin modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  // Action feedback
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 3000);
  }, []);

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

  const handleSearchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '10',
      });
      const res = await fetch(`${config.apiUrl}/admin/users?${params}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      const result = json?.data ?? json;
      const users = result?.users ?? result ?? [];
      // Filter out users who are already admins
      setSearchResults(
        Array.isArray(users)
          ? users.filter((u: SearchUser) => u.role !== 'ADMIN')
          : []
      );
    } catch (err) {
      logger.error('Failed to search users:', err);
      showMessage('error', 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const handlePromoteToAdmin = async (userId: string) => {
    setPromoting(userId);
    try {
      const res = await fetch(`${config.apiUrl}/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' }),
      });
      if (!res.ok) throw new Error('Failed to promote user');
      showMessage('success', t('admin.permissions.promoteSuccess'));
      setShowAddModal(false);
      setSearchQuery('');
      setSearchResults([]);
      await fetchData();
    } catch (err) {
      logger.error('Failed to promote user:', err);
      showMessage('error', t('admin.permissions.errors.promoteFailed'));
    } finally {
      setPromoting(null);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    try {
      const res = await fetch(`${config.apiUrl}/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'USER' }),
      });
      if (!res.ok) throw new Error('Failed to remove admin');
      showMessage('success', t('admin.permissions.removeSuccess'));
      await fetchData();
    } catch (err) {
      logger.error('Failed to remove admin:', err);
      showMessage('error', t('admin.permissions.errors.removeFailed'));
    }
  };

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
      actions={
        <div className="flex items-center gap-3">
          <Link
            href="/admin/access/users"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            {t('admin.permissions.manageAllUsers')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            {t('admin.permissions.addAdmin')}
          </button>
        </div>
      }
    >
      {/* Action Message Toast */}
      {actionMessage && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 shadow-lg ${
            actionMessage.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

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
                    <th className="px-4 py-2 text-right">
                      {t('admin.permissions.columns.actions')}
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
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => void handleRemoveAdmin(admin.id)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          {t('admin.permissions.removeAdmin')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!data?.admins || data.admins.length === 0) && (
                    <tr>
                      <td
                        colSpan={6}
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

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold">
                {t('admin.permissions.addAdmin')}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSearchUsers} className="mb-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('admin.permissions.searchPlaceholder')}
                    className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('common.search')
                  )}
                </button>
              </form>

              <div className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    {t('admin.permissions.searchHint')}
                  </div>
                ) : (
                  searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                    >
                      <div>
                        <div className="text-sm font-medium">{user.email}</div>
                        {user.username && (
                          <div className="text-xs text-gray-500">
                            @{user.username}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => void handlePromoteToAdmin(user.id)}
                        disabled={promoting === user.id}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        {promoting === user.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          t('admin.permissions.promote')
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
