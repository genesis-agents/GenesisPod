'use client';

import { useState, useMemo } from 'react';
import { Users, UserPlus, Shield, Trash2, Edit, Search } from 'lucide-react';
import { useAdminUsers } from '@/hooks/domain';
import {
  LoadingState,
  ErrorState,
  EmptyState,
  useConfirm,
} from '@/components/ui';

// Export components for use in page layout
export function UsersAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
    >
      <UserPlus className="h-5 w-5" />
      Add User
    </button>
  );
}

export function UsersSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        placeholder="Search users by name or email..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
      />
    </div>
  );
}

interface UsersSettingsProps {
  searchQuery: string;
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
}

export default function UsersSettings({
  searchQuery,
  showAddModal,
  setShowAddModal,
}: UsersSettingsProps) {
  const { users, loading, error, refreshUsers, deleteUser, isDeleting } =
    useAdminUsers();

  const { confirm, dialog } = useConfirm({
    title: '确认删除',
    description: '删除后无法恢复，确定要删除这个用户吗？',
    type: 'danger',
    confirmText: '删除',
  });

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          (user.email || '')
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (user.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [users, searchQuery]
  );

  const handleDeleteUser = (userId: string) => {
    confirm(async () => {
      await deleteUser(userId);
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-700';
      case 'editor':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    return status === 'active'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-500';
  };

  if (loading) {
    return <LoadingState text="加载用户数据..." />;
  }

  if (error) {
    return (
      <ErrorState
        error={error.message || '未知错误'}
        onRetry={refreshUsers}
        title="加载用户失败"
      />
    );
  }

  return (
    <>
      {dialog}
      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  <Users className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p>No users found</p>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                        <span className="text-sm font-medium text-violet-600">
                          {(user.name || user.email || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name || user.email || 'Unknown User'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email || '-'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeColor(
                        user.status
                      )}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={isDeleting}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Role Permissions Info */}
      <div className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-violet-600" />
          <h3 className="font-medium text-gray-900">Role Permissions</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 font-medium text-red-700">Admin</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Full system access</li>
              <li>• User management</li>
              <li>• System configuration</li>
            </ul>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 font-medium text-blue-700">Editor</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Create/edit content</li>
              <li>• Manage resources</li>
              <li>• Run AI features</li>
            </ul>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 font-medium text-gray-700">Viewer</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• View content only</li>
              <li>• Read-only access</li>
              <li>• No modifications</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
