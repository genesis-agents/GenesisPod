'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

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

function formatRelativeTime(dateString: string): string {
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

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default function CreditsManagementPage() {
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [stats, setStats] = useState<CreditsStats | null>(null);
  const [loading, setLoading] = useState(true);
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

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (search) params.append('search', search);

      const response = await fetch(
        `${config.apiUrl}/admin/credits/accounts?${params.toString()}`,
        { headers: getAuthHeader() }
      );

      if (response.ok) {
        const result = await response.json();
        const data = result?.data ?? result;
        setAccounts(data.accounts || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      logger.error('Failed to fetch credit accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/admin/credits/stats`, {
        headers: getAuthHeader(),
      });
      if (response.ok) {
        const result = await response.json();
        setStats(result?.data ?? result);
      }
    } catch (error) {
      logger.error('Failed to fetch credits stats:', error);
    }
  };

  const fetchTransactions = async (userId: string) => {
    setLoadingTransactions(true);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/credits/transactions/${userId}?limit=50`,
        { headers: getAuthHeader() }
      );
      if (response.ok) {
        const result = await response.json();
        const data = result?.data ?? result;
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      logger.error('Failed to fetch transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    void fetchAccounts();
    void fetchStats();
  }, [fetchAccounts]);

  const handleSelectAccount = (account: CreditAccount) => {
    setSelectedAccount(account);
    void fetchTransactions(account.userId);
  };

  const handleGrantCredits = async () => {
    if (!selectedAccount || !grantAmount) return;

    setGranting(true);
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
            amount: parseInt(grantAmount, 10),
            reason: grantReason || 'Admin grant',
          }),
        }
      );

      if (response.ok) {
        await fetchAccounts();
        await fetchStats();
        await fetchTransactions(selectedAccount.userId);
        setShowGrantModal(false);
        setGrantAmount('');
        setGrantReason('');
      }
    } catch (error) {
      logger.error('Failed to grant credits:', error);
    } finally {
      setGranting(false);
    }
  };

  const handleToggleFreeze = async (account: CreditAccount) => {
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
            reason: account.isFrozen ? 'Admin unfreeze' : 'Admin freeze',
          }),
        }
      );

      if (response.ok) {
        await fetchAccounts();
        if (selectedAccount?.userId === account.userId) {
          setSelectedAccount({ ...account, isFrozen: !account.isFrozen });
        }
      }
    } catch (error) {
      logger.error('Failed to toggle freeze:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchAccounts();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Credits Management
          </h1>
          <p className="text-gray-600">
            Manage user credit accounts and transactions
          </p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(stats.totalAccounts)}
              </div>
              <div className="text-sm text-gray-500">Total Accounts</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-indigo-600">
                {formatNumber(stats.totalBalance)}
              </div>
              <div className="text-sm text-gray-500">Total Balance</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-green-600">
                {formatNumber(stats.totalEarned)}
              </div>
              <div className="text-sm text-gray-500">Total Earned</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-orange-600">
                {formatNumber(stats.totalSpent)}
              </div>
              <div className="text-sm text-gray-500">Total Spent</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-red-600">
                {stats.frozenAccounts}
              </div>
              <div className="text-sm text-gray-500">Frozen</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="text-2xl font-bold text-yellow-600">
                {stats.lowBalanceAccounts}
              </div>
              <div className="text-sm text-gray-500">Low Balance</div>
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
                  placeholder="Search by email or username..."
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Search
                </button>
              </form>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No accounts found
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
                              Frozen
                            </span>
                          )}
                          {account.balance < 500 && !account.isFrozen && (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                              Low
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
                  Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                >
                  Next
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
                        Grant
                      </button>
                      <button
                        onClick={() => handleToggleFreeze(selectedAccount)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          selectedAccount.isFrozen
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {selectedAccount.isFrozen ? 'Unfreeze' : 'Freeze'}
                      </button>
                    </div>
                  </div>

                  {/* Account Stats */}
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-gray-900">
                        {formatNumber(selectedAccount.balance)}
                      </div>
                      <div className="text-xs text-gray-500">Balance</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-green-600">
                        {formatNumber(selectedAccount.totalEarned)}
                      </div>
                      <div className="text-xs text-gray-500">Earned</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <div className="text-lg font-bold text-orange-600">
                        {formatNumber(selectedAccount.totalSpent)}
                      </div>
                      <div className="text-xs text-gray-500">Spent</div>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="max-h-96 overflow-y-auto">
                  <div className="sticky top-0 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                    Recent Transactions
                  </div>
                  {loadingTransactions ? (
                    <div className="p-4 text-center text-gray-500">
                      Loading...
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No transactions
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
                                {formatRelativeTime(tx.createdAt)}
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
              <div className="flex h-full items-center justify-center p-8 text-gray-500">
                Select an account to view details
              </div>
            )}
          </div>
        </div>

        {/* Grant Credits Modal */}
        {showGrantModal && selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Grant Credits
              </h3>
              <p className="mb-4 text-sm text-gray-600">
                Grant credits to {selectedAccount.email}
              </p>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount
                </label>
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                />
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowGrantModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleGrantCredits()}
                  disabled={!grantAmount || granting}
                  className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {granting ? 'Granting...' : 'Grant Credits'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
