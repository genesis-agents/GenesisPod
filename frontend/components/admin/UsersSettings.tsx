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
import { CreditCard } from 'lucide-react';
import { GrantKeyModal } from '@/components/admin/byok/GrantKeyModal';
import {
  AdminModal,
  AdminDrawer,
  AdminStatsCards,
  AdminStatusBadge,
  type AdminStatCard,
} from '@/components/admin/shared';
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
      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
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
        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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

  const handleSubmit = async () => {
    if (!formData.email) return;
    await onCreate(formData);
    setFormData({ email: '', password: '', role: 'USER' });
    onClose();
  };

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title="Add New User"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.email || !formData.password || isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create User'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
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
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>
    </AdminModal>
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

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title={t('admin.users.loginHistory.title')}
      description={userName}
      size="lg"
      footer={
        <button
          onClick={onClose}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Close
        </button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <Monitor className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      {item.device || 'Unknown Device'}
                      {item.browser && (
                        <span className="text-gray-500">- {item.browser}</span>
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
    </AdminModal>
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

  const handleSubmit = async () => {
    if (!user) return;
    await onSave(user.id, formData);
    onClose();
  };

  return (
    <AdminDrawer
      open={isOpen && !!user}
      onClose={onClose}
      title="Edit User"
      description={user?.email}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            value={user?.email ?? ''}
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
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="banned">Banned</option>
            </select>
          </div>
        </div>
      </div>
    </AdminDrawer>
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

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title="Grant Credits"
      description={userName}
      size="sm"
      footer={
        <>
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Grant Credits
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>
    </AdminModal>
  );
}

// Statistics Cards Component
function UserStatsCards() {
  const { t } = useTranslation();
  const { stats, loading } = useUserStats();

  const cards: AdminStatCard[] = stats
    ? [
        {
          label: t('admin.users.stats.totalUsers'),
          value: stats.totalUsers.toLocaleString(),
          icon: Users,
          semantic: 'blue',
        },
        {
          label: t('admin.users.stats.weeklyActive'),
          value: stats.weeklyActiveUsers.toLocaleString(),
          icon: TrendingUp,
          semantic: 'emerald',
        },
        {
          label: t('admin.users.stats.newThisMonth'),
          value: stats.newUsersThisMonth.toLocaleString(),
          icon: UserPlus,
          semantic: 'blue',
        },
        {
          label: t('admin.users.stats.adminCount'),
          value: stats.adminCount.toLocaleString(),
          icon: UserCog,
          semantic: 'amber',
        },
      ]
    : [];

  return <AdminStatsCards cards={cards} loading={loading} className="mb-6" />;
}

// Wave 4 精化 (2026-05-11): 行内 [积分] 按钮触发，合并 余额展示 + 发放 + 冻结
function UserCreditsDrawer({
  user,
  onClose,
  onGrant,
  onToggleFreeze,
  isLoading,
}: {
  user: User | null;
  onClose: () => void;
  onGrant: (amount: number, reason: string) => Promise<void>;
  onToggleFreeze: (userId: string, currentlyFrozen: boolean) => void;
  isLoading: boolean;
}) {
  const [amount, setAmount] = useState('100');
  const [reason, setReason] = useState('');

  if (!user) {
    return null;
  }

  const balance = user.credits?.balance ?? 0;
  const isFrozen = user.credits?.isFrozen ?? false;

  return (
    <AdminDrawer
      open={!!user}
      onClose={onClose}
      title="积分管理"
      description={user.email ?? user.username ?? user.id}
      size="md"
    >
      <div className="space-y-6">
        {/* 当前余额卡 */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-gray-500">当前余额</div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Coins className="h-6 w-6 text-amber-500" />
                {balance.toLocaleString()}
              </div>
            </div>
            {isFrozen && <AdminStatusBadge status="error" label="已冻结" dot />}
          </div>
        </div>

        {/* 发放积分 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-900">发放积分</h3>
          <div className="space-y-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="数量"
              min="1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="原因（可选，例：欢迎奖励）"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={async () => {
                const n = parseInt(amount, 10) || 0;
                if (n <= 0) return;
                await onGrant(n, reason);
                setAmount('100');
                setReason('');
              }}
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? '处理中...' : '发放积分'}
            </button>
          </div>
        </div>

        {/* 账户状态切换 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-900">账户状态</h3>
          <button
            onClick={() => onToggleFreeze(user.id, isFrozen)}
            disabled={isLoading}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              isFrozen
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            } disabled:opacity-50`}
          >
            {isFrozen ? (
              <>
                <Unlock className="h-4 w-4" /> 解冻账户
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> 冻结账户
              </>
            )}
          </button>
        </div>
      </div>
    </AdminDrawer>
  );
}

// Wave 4 精化: 行内 [计费] 按钮触发的账单 Drawer（骨架）
function UserBillingDrawer({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  if (!user) {
    return null;
  }
  const balance = user.credits?.balance ?? 0;
  const totalEarned = user.credits?.totalEarned ?? 0;
  const totalSpent = user.credits?.totalSpent ?? 0;

  return (
    <AdminDrawer
      open={!!user}
      onClose={onClose}
      title="计费"
      description={user.email ?? user.username ?? user.id}
      size="md"
    >
      <div className="space-y-6">
        {/* 账单汇总 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-xs text-gray-500">余额</div>
            <div className="mt-1 text-lg font-bold text-blue-700">
              {balance.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-xs text-gray-500">累计获得</div>
            <div className="mt-1 text-lg font-bold text-emerald-700">
              {totalEarned.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-xs text-gray-500">累计消耗</div>
            <div className="mt-1 text-lg font-bold text-amber-700">
              {totalSpent.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Placeholder 提示 */}
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-600">订阅与详细账单</p>
          <p className="mt-1 text-xs text-gray-400">
            后端 ?scope=self stats API 完成后接入
          </p>
        </div>
      </div>
    </AdminDrawer>
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

  // Wave 4 精化: 行内 [积分][计费] Drawer state
  const [creditsUser, setCreditsUser] = useState<User | null>(null);
  const [billingUser, setBillingUser] = useState<User | null>(null);

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

      {/* Wave 4 精化: 行内 [积分] Drawer */}
      <UserCreditsDrawer
        user={creditsUser}
        onClose={() => setCreditsUser(null)}
        onGrant={async (amount, reason) => {
          if (creditsUser) {
            await grantCredits(creditsUser.id, amount, reason);
          }
        }}
        onToggleFreeze={handleToggleFreeze}
        isLoading={isCreditsLoading}
      />

      {/* Wave 4 精化: 行内 [计费] Drawer (骨架) */}
      <UserBillingDrawer
        user={billingUser}
        onClose={() => setBillingUser(null)}
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                        <span className="text-sm font-medium text-blue-600">
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
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      <History className="h-4 w-4" />
                      <span>View History</span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    {/*
                      Wave 4 精化 (2026-05-11): 行内 5 图标 → 4 命名按钮 + Delete 兜底
                      映射: [资料] = Edit, [权限] = 授权 API Key 模型权益,
                            [积分] = 余额/发放/冻结合并 (UserCreditsDrawer),
                            [计费] = 订阅与账单 (UserBillingDrawer)
                    */}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        资料
                      </button>
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
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        权限
                      </button>
                      <button
                        onClick={() => setCreditsUser(user)}
                        disabled={isCreditsLoading}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                      >
                        积分
                      </button>
                      <button
                        onClick={() => setBillingUser(user)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        计费
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={isDeleting}
                        className="ml-1 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Delete"
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
                          ? 'bg-blue-600 text-white'
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
          <Shield className="h-5 w-5 text-blue-600" />
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
