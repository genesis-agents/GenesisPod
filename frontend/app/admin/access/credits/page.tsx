'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Coins, Settings, Sparkles, X, Save, Loader2 } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import ClientDate from '@/components/common/ClientDate';

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

interface CreditRule {
  moduleType: string;
  operationType: string;
  baseCredits: number;
  name: string;
  isActive: boolean;
}

// Module display names - matches DEFAULT_RULES in credit-rules.service.ts
const MODULE_NAMES: Record<string, string> = {
  'ai-ask': 'AI Ask',
  'deep-research': 'Deep Research',
  'topic-research': 'Topic Research',
  'notebook-research': 'Notebook Research',
  'ai-teams': 'AI Teams',
  'ai-office': 'AI Office',
  'ai-writing': 'AI Writing',
  'ai-image': 'AI Image',
  'ai-simulation': 'AI Simulation',
  'ai-social': 'AI Social',
  library: 'Library',
  notes: 'Notes',
  collections: 'Collections',
  explore: 'Explore',
};

// Operation type display names
const OPERATION_NAMES: Record<string, string> = {
  // AI Ask
  chat: 'Chat',
  'rag-chat': 'RAG Chat',
  // AI Research
  'research-quick': 'Quick Research',
  'research-standard': 'Standard Research',
  'research-deep': 'Deep Research',
  // Topic Research
  refresh: 'Refresh',
  create: 'Create',
  // AI Teams
  'ai-reply': 'AI Reply',
  debate: 'Debate',
  summary: 'Summary',
  // AI Office
  'generate-ppt': 'Generate PPT',
  'generate-doc': 'Generate Doc',
  'rerender-page': 'Rerender Page',
  // AI Writing
  'generate-article': 'Generate Article',
  'generate-chapter': 'Generate Chapter',
  rewrite: 'Rewrite',
  continue: 'Continue',
  // AI Image
  generate: 'Generate',
  edit: 'Edit',
  variation: 'Variation',
  // AI Simulation
  run: 'Run',
  analysis: 'Analysis',
  // AI Social
  'generate-post': 'Generate Post',
  'generate-thread': 'Generate Thread',
  // Library
  'ai-summary': 'AI Summary',
  'ai-extract': 'AI Extract',
  'ai-explanation': 'AI Explanation',
  'ai-classify': 'AI Classify',
  'ai-cluster': 'AI Cluster',
  // Notes
  'extract-key-points': 'Extract Key Points',
  'find-connections': 'Find Connections',
  summarize: 'Summarize',
  // Collections
  'ai-batch-tags': 'AI Batch Tags',
  'ai-smart-classify': 'AI Smart Classify',
  'ai-theme-cluster': 'AI Theme Cluster',
  // Social
  'adapt-version': 'Adapt Version',
  // Notebook Research
  // (chat already defined above)
  // Explore
  'ai-search': 'AI Search',
  'ai-recommend': 'AI Recommend',
};

const TYPE_COLORS: Record<string, string> = {
  INITIAL: 'bg-green-100 text-green-800',
  DAILY_CHECKIN: 'bg-blue-100 text-blue-800',
  TASK_REWARD: 'bg-purple-100 text-purple-800',
  ADMIN_GRANT: 'bg-indigo-100 text-indigo-800',
  PURCHASE: 'bg-emerald-100 text-emerald-800',
  AI_ASK: 'bg-orange-100 text-orange-800',
  AI_TEAMS: 'bg-rose-100 text-rose-800',
  AI_OFFICE: 'bg-pink-100 text-pink-800',
  AI_SIMULATION: 'bg-cyan-100 text-cyan-800',
  AI_WRITING: 'bg-violet-100 text-violet-800',
  AI_IMAGE: 'bg-fuchsia-100 text-fuchsia-800',
  AI_SOCIAL: 'bg-lime-100 text-lime-800',
  DEEP_RESEARCH: 'bg-amber-100 text-amber-800',
  TOPIC_RESEARCH: 'bg-yellow-100 text-yellow-800',
  NOTEBOOK_RESEARCH: 'bg-sky-100 text-sky-800',
  LIBRARY: 'bg-emerald-100 text-emerald-800',
  NOTES: 'bg-stone-100 text-stone-800',
  COLLECTIONS: 'bg-slate-100 text-slate-800',
  REFUND: 'bg-teal-100 text-teal-800',
  ADJUSTMENT: 'bg-gray-100 text-gray-800',
};

function formatRelativeTime(
  dateString: string,
  t: (key: string) => string
): string | null {
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
  // Return null to use ClientDate component
  return null;
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

  // Credit rules configuration
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [creditRules, setCreditRules] = useState<CreditRule[]>([]);
  const [editedRules, setEditedRules] = useState<Record<string, number>>({});
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

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

  // Fetch credit rules
  const fetchCreditRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const response = await fetch(`${config.apiUrl}/credits/rules`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch credit rules');
      }
      const result = await response.json();
      const data = result?.data ?? result;
      setCreditRules(Array.isArray(data) ? data : []);
      setEditedRules({});
    } catch (err) {
      logger.error('Failed to fetch credit rules:', err);
      showMessage('error', t('admin.credits.errors.rulesFailed'));
    } finally {
      setLoadingRules(false);
    }
  }, [t, showMessage]);

  // Save credit rule
  const saveCreditRule = useCallback(
    async (moduleType: string, operationType: string, baseCredits: number) => {
      try {
        const response = await fetch(
          `${config.apiUrl}/admin/credits/rules/update`,
          {
            method: 'POST',
            headers: {
              ...getAuthHeader(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ moduleType, operationType, baseCredits }),
          }
        );
        if (!response.ok) {
          throw new Error('Failed to update rule');
        }
        return true;
      } catch (err) {
        logger.error('Failed to update credit rule:', err);
        return false;
      }
    },
    []
  );

  // Save all edited rules
  const saveAllRules = useCallback(async () => {
    const edits = Object.entries(editedRules);
    if (edits.length === 0) {
      setShowRulesModal(false);
      return;
    }

    setSavingRules(true);
    let successCount = 0;

    for (const [key, baseCredits] of edits) {
      const [moduleType, operationType] = key.split(':');
      const success = await saveCreditRule(
        moduleType,
        operationType,
        baseCredits
      );
      if (success) successCount++;
    }

    setSavingRules(false);

    if (successCount === edits.length) {
      showMessage('success', t('admin.credits.rulesSaved'));
      setShowRulesModal(false);
      setEditedRules({});
      await fetchCreditRules();
    } else {
      showMessage('error', t('admin.credits.errors.ruleSaveFailed'));
    }
  }, [editedRules, saveCreditRule, fetchCreditRules, showMessage, t]);

  // Handle rule edit
  const handleRuleEdit = useCallback((rule: CreditRule, newValue: number) => {
    const key = `${rule.moduleType}:${rule.operationType}`;
    if (newValue === rule.baseCredits) {
      setEditedRules((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setEditedRules((prev) => ({ ...prev, [key]: newValue }));
    }
  }, []);

  // Open rules modal
  const openRulesModal = useCallback(() => {
    setShowRulesModal(true);
    void fetchCreditRules();
  }, [fetchCreditRules]);

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
      actions={
        <button
          onClick={openRulesModal}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <Settings className="h-4 w-4" />
          {t('admin.credits.configureRules')}
        </button>
      }
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
                                {formatRelativeTime(tx.createdAt, t) || (
                                  <ClientDate
                                    date={tx.createdAt}
                                    format="date"
                                  />
                                )}
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

        {/* Credit Rules Configuration Modal */}
        {showRulesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t('admin.credits.rulesTitle')}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {t('admin.credits.rulesDescription')}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRulesModal(false);
                    setEditedRules({});
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="max-h-[60vh] overflow-y-auto p-6">
                {loadingRules ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    <span className="ml-2 text-gray-500">
                      {t('common.loading')}
                    </span>
                  </div>
                ) : creditRules.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    {t('admin.credits.noRules')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {creditRules.map((rule) => {
                      const key = `${rule.moduleType}:${rule.operationType}`;
                      const editedValue = editedRules[key];
                      const currentValue =
                        editedValue !== undefined
                          ? editedValue
                          : rule.baseCredits;
                      const isEdited = editedValue !== undefined;
                      const moduleName =
                        MODULE_NAMES[rule.moduleType] || rule.moduleType;
                      const operationName =
                        OPERATION_NAMES[rule.operationType] ||
                        rule.operationType;

                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                            isEdited
                              ? 'border-indigo-300 bg-indigo-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {rule.name ||
                                  `${moduleName} - ${operationName}`}
                              </span>
                              {!rule.isActive && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                                  {t('admin.credits.inactive')}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-gray-400">
                              {moduleName} / {operationName}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={currentValue}
                                onChange={(e) =>
                                  handleRuleEdit(
                                    rule,
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                min="0"
                                className={`w-24 rounded-lg border px-3 py-2 text-right text-sm ${
                                  isEdited
                                    ? 'border-indigo-400 bg-white'
                                    : 'border-gray-300'
                                }`}
                              />
                              <span className="text-sm text-gray-500">
                                {t('admin.credits.creditsUnit')}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                handleRuleEdit(rule, rule.baseCredits * 2)
                              }
                              className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                              title={t('admin.credits.aiSuggest')}
                            >
                              <Sparkles className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t px-6 py-4">
                <div className="text-sm text-gray-500">
                  {Object.keys(editedRules).length > 0 && (
                    <span className="text-indigo-600">
                      {t('admin.credits.unsavedChanges').replace(
                        '{count}',
                        String(Object.keys(editedRules).length)
                      )}
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowRulesModal(false);
                      setEditedRules({});
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => void saveAllRules()}
                    disabled={
                      Object.keys(editedRules).length === 0 || savingRules
                    }
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingRules ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
