'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  isVerified: boolean;
  oauthProvider: string | null;
  subscriptionTier: string;
  createdAt: string;
  lastLoginAt: string | null;
  isAdmin: boolean;
  credits: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    isFrozen: boolean;
  } | null;
  _count: {
    notes: number;
    comments: number;
    collections: number;
  };
}

interface SystemStats {
  users?: {
    total?: number;
    active?: number;
    newLast7Days?: number;
  };
  resources?: {
    total?: number;
  };
}

// 格式化相对时间
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);

  // 积分发放相关状态
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [grantAmount, setGrantAmount] = useState('1000');
  const [grantDescription, setGrantDescription] = useState('');
  const [granting, setGranting] = useState(false);
  const [initializingCredits, setInitializingCredits] = useState(false);

  useEffect(() => {
    void fetchUsers();
    void fetchSystemStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/users?page=${page}&limit=15&search=${search}`,
        { headers: getAuthHeader() }
      );
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/admin/stats`, {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const data = (await response.json()) as SystemStats;
        setSystemStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleToggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/users/${userId}/status`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isActive: !isActive }),
        }
      );
      if (response.ok) {
        void fetchUsers();
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error);
    }
  };

  // 打开发放积分弹窗
  const openGrantModal = (user: AdminUser) => {
    setSelectedUser(user);
    setGrantAmount('1000');
    setGrantDescription('管理员发放');
    setGrantModalOpen(true);
  };

  // 发放积分
  const handleGrantCredits = async () => {
    if (!selectedUser || !grantAmount) return;

    setGranting(true);
    try {
      const response = await fetch(`${config.apiUrl}/admin/credits/grant`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: parseInt(grantAmount, 10),
          description: grantDescription || '管理员发放',
        }),
      });

      if (response.ok) {
        setGrantModalOpen(false);
        void fetchUsers();
      } else {
        const error = await response.json();
        alert(`发放失败: ${error.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to grant credits:', error);
      alert('发放失败');
    } finally {
      setGranting(false);
    }
  };

  // 为所有用户初始化积分账户
  const handleInitializeAllCredits = async () => {
    if (
      !confirm(
        '确定要为所有没有积分账户的用户创建账户吗？每个新账户将获得 10000 积分。'
      )
    ) {
      return;
    }

    setInitializingCredits(true);
    try {
      const response = await fetch(`${config.apiUrl}/admin/credits/init-all`, {
        method: 'POST',
        headers: getAuthHeader(),
      });

      if (response.ok) {
        const result = await response.json();
        alert(
          `初始化完成！\n新建账户: ${result.data.created}\n跳过: ${result.data.skipped}\n总用户: ${result.data.total}`
        );
        void fetchUsers();
      } else {
        const error = await response.json();
        alert(`初始化失败: ${error.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to initialize credits:', error);
      alert('初始化失败');
    } finally {
      setInitializingCredits(false);
    }
  };

  return (
    <div className="p-8">
      {/* Stats Cards */}
      {systemStats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">Total Users</p>
              <div className="rounded-lg bg-purple-50 p-2">
                <svg
                  className="h-5 w-5 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {systemStats.users?.total || 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">Active Users</p>
              <div className="rounded-lg bg-green-50 p-2">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {systemStats.users?.active || 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">New (7 days)</p>
              <div className="rounded-lg bg-blue-50 p-2">
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {systemStats.users?.newLast7Days || 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Total Resources
              </p>
              <div className="rounded-lg bg-orange-50 p-2">
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {systemStats.resources?.total || 0}
            </p>
          </div>
        </div>
      )}

      {/* User Table */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              User Management
            </h2>
            <div className="flex gap-3">
              {/* 初始化积分账户按钮 */}
              <button
                onClick={() => void handleInitializeAllCredits()}
                disabled={initializingCredits}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
              >
                {initializingCredits ? (
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
                ) : (
                  <svg
                    className="h-4 w-4"
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
                )}
                Init All Credits
              </button>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Credits</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last Login</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-medium text-white">
                            {(u.username || u.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {u.username || '-'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {u.oauthProvider || 'email'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {u.email}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          u.isAdmin
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    {/* Credits Column */}
                    <td className="px-5 py-4">
                      {u.credits ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-blue-600">
                            {u.credits.balance.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            Spent: {u.credits.totalSpent.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          No account
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            u.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-red-500'}`}
                          ></span>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {u.isVerified && (
                          <span
                            className="text-blue-500"
                            title="Email Verified"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      <span
                        title={
                          u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString()
                            : 'Never'
                        }
                      >
                        {formatRelativeTime(u.lastLoginAt)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {/* Grant Credits Button */}
                        <button
                          onClick={() => openGrantModal(u)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
                          title="Grant Credits"
                        >
                          +Credits
                        </button>
                        <button
                          onClick={() =>
                            void handleToggleUserStatus(u.id, u.isActive)
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            u.isActive
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {u.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grant Credits Modal */}
      {grantModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Grant Credits
            </h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Granting credits to:{' '}
                <span className="font-medium">
                  {selectedUser.username || selectedUser.email}
                </span>
              </p>
              <p className="text-sm text-gray-500">
                Current balance:{' '}
                <span className="font-medium text-blue-600">
                  {selectedUser.credits?.balance?.toLocaleString() ??
                    'No account'}
                </span>
              </p>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount
              </label>
              <input
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter amount"
                min="1"
              />
            </div>
            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                value={grantDescription}
                onChange={(e) => setGrantDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Reason for granting credits"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setGrantModalOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleGrantCredits()}
                disabled={granting || !grantAmount}
                className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-2 font-medium text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:opacity-50"
              >
                {granting ? 'Granting...' : 'Grant Credits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
