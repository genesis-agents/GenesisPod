'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Coins } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';

// Constants
const LOW_BALANCE_THRESHOLD = 500;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_TRANSACTION_LIMIT = 50;

interface CreditAccount {
  userId: string;
  email: string;
  username: string | null;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  isFrozen: boolean;
  createdAt: string;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  moduleType?: string;
  operationType?: string;
  createdAt: string;
}

interface CreditsStats {
  totalAccounts: number;
  totalBalance: number;
  totalEarned: number;
  totalSpent: number;
  frozenAccounts: number;
  lowBalanceAccounts: number;
}

const TYPE_COLORS: Record<string, string> = {
  INITIAL: 'bg-green-100 text-green-800',
  DAILY_CHECKIN: 'bg-blue-100 text-blue-800',
  TASK_REWARD: 'bg-purple-100 text-purple-800',
  ADMIN_GRANT: 'bg-indigo-100 text-indigo-800',
  PURCHASE: 'bg-emerald-100 text-emerald-800',
  AI_ASK: 'bg-orange-100 text-orange-800',
  AI_STUDIO: 'bg-amber-100 text-amber-800',
  AI_TEAMS: 'bg-rose-100 text-rose-800',
  AI_OFFICE: 'bg-pink-100 text-pink-800',
  AI_SIMULATION: 'bg-cyan-100 text-cyan-800',
  REFUND: 'bg-teal-100 text-teal-800',
  ADJUSTMENT: 'bg-gray-100 text-gray-800',
};

function formatRelativeTime(
  dateString: string,
  t: (key: string) => string
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('common.time.justNow');
  if (diffMins < 60)
    return t('common.time.minutesAgo').replace('{n}', String(diffMins));
  if (diffHours < 24)
    return t('common.time.hoursAgo').replace('{n}', String(diffHours));
  if (diffDays < 7)
    return t('common.time.daysAgo').replace('{n}', String(diffDays));
  return date.toLocaleDateString();
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default function CreditsManagementPage() {
  const { t } = useTranslation();

  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [stats, setStats] = useState<CreditsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selected account for detail view
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(
    null
  );
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Grant credits modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Action feedback
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 3000);
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: DEFAULT_PAGE_SIZE.toString(),
      });
      if (search) params.append('search', search);

      const response = await fetch(
        `${config.apiUrl}/admin/credits/accounts?${params.toString()}`,
        { headers: getAuthHeader() }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || t('admin.credits.errors.fetchFailed')
        );
      }

      const result = await response.json();
      const data = result?.data ?? result;
      setAccounts(data.accounts || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.credits.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch credit accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, t]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${config.apiUrl}/admin/credits/stats`, {
        headers: getAuthHeader(),
      });

      if (!response.ok) {
        throw new Error(t('admin.credits.errors.statsFailed'));
      }

      const result = await response.json();
      setStats(result?.data ?? result);
    } catch (err) {
      logger.error('Failed to fetch credits stats:', err);
    }
  }, [t]);

  const fetchTransactions = useCallback(
    async (userId: string) => {
      setLoadingTransactions(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/admin/credits/transactions/${userId}?limit=${DEFAULT_TRANSACTION_LIMIT}`,
          { headers: getAuthHeader() }
        );

        if (!response.ok) {
          throw new Error(t('admin.credits.errors.transactionsFailed'));
        }

        const result = await response.json();
        const data = result?.data ?? result;
        setTransactions(data.transactions || []);
      } catch (err) {
        logger.error('Failed to fetch transactions:', err);
        showMessage('error', t('admin.credits.errors.transactionsFailed'));
      } finally {
        setLoadingTransactions(false);
      }
    },
    [t, showMessage]
  );

  useEffect(() => {
    void fetchAccounts();
    void fetchStats();
  }, [fetchAccounts, fetchStats]);

  const handleSelectAccount = useCallback(
    (account: CreditAccount) => {
      setSelectedAccount(account);
      void fetchTransactions(account.userId);
    },
    [fetchTransactions]
  );

  const handleGrantCredits = async () => {
    if (!selectedAccount || !grantAmount) return;

    const amount = parseInt(grantAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setGrantError(t('admin.credits.errors.invalidAmount'));
      return;
    }

    setGranting(true);
    setGrantError(null);

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/users/${selectedAccount.userId}/credits/grant`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            reason: grantReason || t('admin.credits.defaultGrantReason'),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || t('admin.credits.errors.grantFailed')
        );
      }

      // Refresh data
      await Promise.all([
        fetchAccounts(),
        fetchStats(),
        fetchTransactions(selectedAccount.userId),
      ]);

      setShowGrantModal(false);
      setGrantAmount('');
      setGrantReason('');
      showMessage(
        'success',
        t('admin.credits.grantSuccess').replace('{amount}', String(amount))
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.credits.errors.grantFailed');
      setGrantError(message);
      logger.error('Failed to grant credits:', err);
    } finally {
      setGranting(false);
    }
  };

  const handleToggleFreeze = async (account: CreditAccount) => {
    const action = account.isFrozen ? 'unfreeze' : 'freeze';

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/users/${account.userId}/credits/freeze`,
        {
          method: 'POST',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            freeze: !account.isFrozen,
            reason: account.isFrozen
              ? t('admin.credits.unfreezeReason')
              : t('admin.credits.freezeReason'),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || t('admin.credits.errors.freezeFailed')
        );
      }

      await fetchAccounts();

      if (selectedAccount?.userId === account.userId) {
        setSelectedAccount({ ...account, isFrozen: !account.isFrozen });
      }

      showMessage(
        'success',
        action === 'freeze'
          ? t('admin.credits.freezeSuccess')
          : t('admin.credits.unfreezeSuccess')
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.credits.errors.freezeFailed');
      showMessage('error', message);
      logger.error('Failed to toggle freeze:', err);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchAccounts();
  };

  // Memoized computed values
  const lowBalanceCount = useMemo(
    () =>
      accounts.filter((a) => a.balance < LOW_BALANCE_THRESHOLD && !a.isFrozen)
        .length,
    [accounts]
  );

  return (
    <AdminPageLayout
      title={t('admin.credits.title')}
      description={t('admin.credits.description')}
      icon={Coins}
      domain="access"
    >
      <div>
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

        {/* Error State */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(stats.totalAccounts)}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.totalAccounts')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-indigo-600">
                {formatNumber(stats.totalBalance)}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.totalBalance')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-green-600">
                {formatNumber(stats.totalEarned)}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.totalEarned')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-orange-600">
                {formatNumber(stats.totalSpent)}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.totalSpent')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-red-600">
                {stats.frozenAccounts}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.frozen')}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.lowBalanceAccounts}
              </div>
              <div className="text-sm text-gray-500">
                {t('admin.credits.stats.lowBalance')}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Accounts List */}
          <div className="rounded-lg bg-white shadow">
            <div className="border-b p-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('admin.credits.searchPlaceholder')}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {t('common.search')}
                </button>
              </form>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">
                {t('common.loading')}
              </div>
            ) : accounts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {t('admin.credits.noAccounts')}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {accounts.map((account) => (
                  <div
                    key={account.userId}
                    className={`cursor-pointer p-4 transition-colors hover:bg-gray-50 ${
                      selectedAccount?.userId === account.userId
                        ? 'bg-indigo-50'
                        : ''
                    }`}
                    onClick={() => handleSelectAccount(account)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {account.email}
                        </div>
                        {account.username && (
                          <div className="text-sm text-gray-500">
                            @{account.username}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          {formatNumber(account.balance)}
                        </div>
                        <div className="flex items-center gap-2">
                          {account.isFrozen && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                              {t('admin.credits.frozen')}
                            </span>
                          )}
                          {account.balance < LOW_BALANCE_THRESHOLD &&
                            !account.isFrozen && (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                                {t('admin.credits.low')}
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t p-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <span className="text-sm text-gray-500">
                  {t('common.pageOf')
                    .replace('{page}', String(page))
                    .replace('{total}', String(totalPages))}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </div>

          {/* Account Detail */}
          <div className="rounded-lg bg-white shadow">
            {selectedAccount ? (
              <>
                <div className="border-b p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedAccount.email}
                      </h2>
                      {selectedAccount.username && (
                        <p className="text-sm text-gray-500">
                          @{selectedAccount.username}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowGrantModal(true)}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                      >
                        {t('admin.credits.grant')}
                      </button>
                      <button
                        onClick={() => handleToggleFreeze(selectedAccount)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          selectedAccount.isFrozen
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {selectedAccount.isFrozen
                          ? t('admin.credits.unfreeze')
                          : t('admin.credits.freeze')}
                      </button>
                    </div>
                  </div>

                  {/* Account Stats */}
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-gray-900">
                        {formatNumber(selectedAccount.balance)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('admin.credits.balance')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-green-600">
                        {formatNumber(selectedAccount.totalEarned)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('admin.credits.earned')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-orange-600">
                        {formatNumber(selectedAccount.totalSpent)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('admin.credits.spent')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="max-h-96 overflow-y-auto">
                  <div className="sticky top-0 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                    {t('admin.credits.recentTransactions')}
                  </div>
                  {loadingTransactions ? (
                    <div className="p-4 text-center text-gray-500">
                      {t('common.loading')}
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      {t('admin.credits.noTransactions')}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  TYPE_COLORS[tx.type] ||
                                  'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {tx.type.replace(/_/g, ' ')}
                              </span>
                              <p className="mt-1 text-sm text-gray-600">
                                {tx.description}
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`font-semibold ${
                                  tx.amount > 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {tx.amount > 0 ? '+' : ''}
                                {formatNumber(tx.amount)}
                              </div>
                              <div className="text-xs text-gray-400">
                                {formatRelativeTime(tx.createdAt, t)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center p-8 text-gray-500">
                {t('admin.credits.selectAccount')}
              </div>
            )}
          </div>
        </div>

        {/* Grant Credits Modal */}
        {showGrantModal && selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                {t('admin.credits.grantTitle')}
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                {t('admin.credits.grantTo').replace(
                  '{email}',
                  selectedAccount.email
                )}
              </p>

              {grantError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  {grantError}
                </div>
              )}

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('admin.credits.amount')}
                </label>
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => {
                    setGrantAmount(e.target.value);
                    setGrantError(null);
                  }}
                  placeholder={t('admin.credits.amountPlaceholder')}
                  min="1"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                />
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t('admin.credits.reason')}
                </label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder={t('admin.credits.reasonPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowGrantModal(false);
                    setGrantError(null);
                    setGrantAmount('');
                    setGrantReason('');
                  }}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => void handleGrantCredits()}
                  disabled={!grantAmount || granting}
                  className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {granting
                    ? t('common.processing')
                    : t('admin.credits.grantButton')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
