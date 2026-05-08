'use client';

import { useState, useMemo, useEffect } from 'react';
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
  X,
  History,
  Monitor,
  Globe,
  Calendar,
  UserCheck,
  UserCog,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { GrantKeyModal } from '@/components/admin/byok/GrantKeyModal';
import {
  useAdminUsers,
  useUserStats,
  type User,
  type CreateUserData,
  type LoginHistoryItem,
} from '@/hooks/domain';
import { useTranslation } from '@/lib/i18n';
import { LoadingState, ErrorState, useConfirm } from '@/components/ui';
import ClientDate from '@/components/common/ClientDate';

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

// Add User Modal - Form order: Email, Password, Role
function AddUserModal({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateUserData) => Promise<void>;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    password: '',
    role: 'USER',
  });

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!formData.email) return;
    await onCreate(formData);
    setFormData({ email: '', password: '', role: 'USER' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content - Order: Email, Password, Role */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="user@example.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password || ''}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder="Enter password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'USER' | 'ADMIN',
                })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.email || !formData.password || isLoading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Login History Modal
function LoginHistoryModal({
  isOpen,
  onClose,
  history,
  userName,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  history: LoginHistoryItem[];
  userName: string;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('admin.users.loginHistory.title')}
            </h2>
            <p className="text-sm text-gray-500">{userName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <History className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p>{t('admin.users.loginHistory.noHistory')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
                        <Monitor className="h-5 w-5 text-violet-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                          {item.device || 'Unknown Device'}
                          {item.browser && (
                            <span className="text-gray-500">
                              - {item.browser}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {item.os && <span>{item.os}</span>}
                          {item.ipAddress && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {item.ipAddress}
                            </span>
                          )}
                          {item.location && <span>{item.location}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3.5 w-3.5" />
                      <ClientDate date={item.loginAt} format="datetime" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit User Modal
function EditUserModal({
  isOpen,
  onClose,
  onSave,
  user,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<User>) => Promise<void>;
  user: User | null;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    username: '',
    role: 'USER' as 'USER' | 'ADMIN' | 'user' | 'admin',
    status: 'active' as 'active' | 'inactive' | 'banned',
  });

  // Reset form when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        role: user.role,
        status: user.status,
      });
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async () => {
    await onSave(user.id, formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Edit User</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              placeholder="johndoe"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    role: e.target.value as 'USER' | 'ADMIN',
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as 'active' | 'inactive' | 'banned',
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="banned">Banned</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
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

// Statistics Cards Component
function UserStatsCards() {
  const { t } = useTranslation();
  const { stats, loading } = useUserStats();

  if (loading || !stats) {
    return (
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-100"
          />
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: t('admin.users.stats.totalUsers'),
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-violet-50 text-violet-600',
    },
    {
      label: t('admin.users.stats.weeklyActive'),
      value: stats.weeklyActiveUsers,
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: t('admin.users.stats.newThisMonth'),
      value: stats.newUsersThisMonth,
      icon: UserPlus,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: t('admin.users.stats.adminCount'),
      value: stats.adminCount,
      icon: UserCog,
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {stat.value.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-xl p-3 ${stat.color}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function UsersSettings({
  searchQuery,
  showAddModal,
  setShowAddModal,
}: UsersSettingsProps) {
  const { t } = useTranslation();
  const {
    users,
    loading,
    error,
    refreshUsers,
    createUser,
    updateUser,
    deleteUser,
    isCreating,
    isUpdating,
    isDeleting,
    grantCredits,
    toggleCreditFreeze,
    isCreditsLoading,
    fetchLoginHistory,
    pagination,
    page,
    goToPage,
    nextPage,
    prevPage,
  } = useAdminUsers();

  const [grantModalUser, setGrantModalUser] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // PR-D 2026-05-08: 模型权益授权 Modal（截图红框位置 ACTIONS 列 🔑 按钮）
  const [grantKeyUser, setGrantKeyUser] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Login history state
  const [loginHistoryUser, setLoginHistoryUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch login history when user is selected
  const handleViewLoginHistory = async (user: User) => {
    setLoginHistoryUser({
      id: user.id,
      name: user.name || user.username || user.email || 'User',
    });
    setLoadingHistory(true);
    try {
      const history = await fetchLoginHistory(user.id, 5);
      setLoginHistory(history);
    } catch {
      setLoginHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

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

      <AddUserModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreate={async (data) => {
          await createUser(data);
        }}
        isLoading={isCreating}
      />

      <EditUserModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        onSave={async (id, data) => {
          await updateUser(id, data);
        }}
        user={editingUser}
        isLoading={isUpdating}
      />

      {/* PR-D 2026-05-08: 授权模型权益 Modal（行内 🔑 按钮触发） */}
      {grantKeyUser && (
        <GrantKeyModal
          userId={grantKeyUser.id}
          userLabel={grantKeyUser.label}
          onClose={() => setGrantKeyUser(null)}
        />
      )}

      <LoginHistoryModal
        isOpen={!!loginHistoryUser}
        onClose={() => {
          setLoginHistoryUser(null);
          setLoginHistory([]);
        }}
        history={loginHistory}
        userName={loginHistoryUser?.name || 'User'}
        isLoading={loadingHistory}
      />

      {/* Statistics Cards */}
      <UserStatsCards />

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
                {t('admin.users.loginHistory.title')}
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
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={() => handleViewLoginHistory(user)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50"
                    >
                      <History className="h-4 w-4" />
                      <span>View History</span>
                    </button>
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
                      {/* PR-D 2026-05-08: 授权模型权益（KeyRound 图标，截图红框位置） */}
                      <button
                        onClick={() =>
                          setGrantKeyUser({
                            id: user.id,
                            label:
                              user.email ||
                              user.name ||
                              user.username ||
                              user.id,
                          })
                        }
                        className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                        title="授权 API Key 模型权益"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {/* Edit */}
                      <button
                        onClick={() => setEditingUser(user)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
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

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {t('common.showing')} {(page - 1) * pagination.limit + 1}-
            {Math.min(page * pagination.limit, pagination.total)}{' '}
            {t('common.of')} {pagination.total}{' '}
            {t('admin.users.title').toLowerCase()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevPage}
              disabled={page === 1}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.previous')}
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === pagination.totalPages ||
                    Math.abs(p - page) <= 1
                )
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="px-1 text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => goToPage(p)}
                      className={`min-w-[32px] rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-violet-600 text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
            </div>
            <button
              onClick={nextPage}
              disabled={page === pagination.totalPages}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
