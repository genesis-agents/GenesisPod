'use client';

import { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Edit,
  Search,
  Coins,
  Lock,
  Unlock,
  Plus,
} from 'lucide-react';
import { useAdminUsers } from '@/hooks/domain';
import { LoadingState, ErrorState, useConfirm } from '@/components/ui';

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

// Grant Credits Modal
function GrantCreditsModal({
  isOpen,
  onClose,
  onGrant,
  userName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onGrant: (amount: number, reason: string) => void;
  userName: string;
}) {
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Grant Credits to {userName}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              min="1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Welcome bonus, Promotion reward"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onGrant(parseInt(amount) || 0, reason);
              onClose();
            }}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Grant Credits
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersSettings({
  searchQuery,
  showAddModal,
  setShowAddModal,
}: UsersSettingsProps) {
  const {
    users,
    loading,
    error,
    refreshUsers,
    deleteUser,
    isDeleting,
    grantCredits,
    toggleCreditFreeze,
    isCreditsLoading,
  } = useAdminUsers();

  const [grantModalUser, setGrantModalUser] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { confirm, dialog } = useConfirm({
    title: 'Confirm Delete',
    description:
      'This action cannot be undone. Are you sure you want to delete this user?',
    type: 'danger',
    confirmText: 'Delete',
  });

  const { confirm: confirmFreeze, dialog: freezeDialog } = useConfirm({
    title: 'Confirm Freeze',
    description:
      "This will freeze the user's credit account. They will not be able to use credits.",
    type: 'warning',
    confirmText: 'Freeze',
  });

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          (user.email || '')
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (user.username || '')
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      ),
    [users, searchQuery]
  );

  const handleDeleteUser = (userId: string) => {
    confirm(async () => {
      await deleteUser(userId);
    });
  };

  const handleToggleFreeze = (userId: string, currentlyFrozen: boolean) => {
    if (!currentlyFrozen) {
      confirmFreeze(async () => {
        await toggleCreditFreeze(userId, true);
      });
    } else {
      toggleCreditFreeze(userId, false);
    }
  };

  const handleGrantCredits = async (amount: number, reason: string) => {
    if (grantModalUser) {
      await grantCredits(grantModalUser.id, amount, reason);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const normalizedRole = role?.toLowerCase();
    switch (normalizedRole) {
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
    return <LoadingState text="Loading users..." />;
  }

  if (error) {
    return (
      <ErrorState
        error={error.message || 'Unknown error'}
        onRetry={refreshUsers}
        title="Failed to load users"
      />
    );
  }

  return (
    <>
      {dialog}
      {freezeDialog}
      <GrantCreditsModal
        isOpen={!!grantModalUser}
        onClose={() => setGrantModalUser(null)}
        onGrant={handleGrantCredits}
        userName={grantModalUser?.name || 'User'}
      />

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
                Credits
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
                  colSpan={6}
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
                          {(user.name || user.username || user.email || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name ||
                            user.username ||
                            user.email ||
                            'Unknown User'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email || '-'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getRoleBadgeColor(
                        user.role
                      )}`}
                    >
                      {user.role?.toLowerCase() || 'user'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusBadgeColor(
                        user.status
                      )}`}
                    >
                      {user.status || 'active'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {user.credits ? (
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                            <Coins className="h-4 w-4 text-amber-500" />
                            {user.credits.balance.toLocaleString()}
                          </div>
                          {user.credits.isFrozen && (
                            <span className="text-xs text-red-600">Frozen</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <div className="flex items-center justify-end gap-1">
                      {/* Grant Credits */}
                      <button
                        onClick={() =>
                          setGrantModalUser({
                            id: user.id,
                            name:
                              user.name ||
                              user.username ||
                              user.email ||
                              'User',
                          })
                        }
                        disabled={isCreditsLoading}
                        className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                        title="Grant Credits"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {/* Freeze/Unfreeze */}
                      {user.credits && (
                        <button
                          onClick={() =>
                            handleToggleFreeze(
                              user.id,
                              user.credits?.isFrozen || false
                            )
                          }
                          disabled={isCreditsLoading}
                          className={`rounded p-1.5 ${
                            user.credits.isFrozen
                              ? 'text-green-500 hover:bg-green-50 hover:text-green-600'
                              : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                          } disabled:opacity-50`}
                          title={
                            user.credits.isFrozen
                              ? 'Unfreeze Account'
                              : 'Freeze Account'
                          }
                        >
                          {user.credits.isFrozen ? (
                            <Unlock className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      {/* Edit */}
                      <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <Edit className="h-4 w-4" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={isDeleting}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
              <li>Full system access</li>
              <li>User management</li>
              <li>System configuration</li>
            </ul>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 font-medium text-blue-700">Editor</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>Create/edit content</li>
              <li>Manage resources</li>
              <li>Run AI features</li>
            </ul>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <h4 className="mb-2 font-medium text-gray-700">Viewer</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>View content only</li>
              <li>Read-only access</li>
              <li>No modifications</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
