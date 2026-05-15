'use client';

import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores';
import {
  useSocialConnections,
  SocialPlatformType,
  SocialContentType,
} from '@/hooks/domain/useAISocial';
import {
  ArrowLeft,
  Check,
  User,
  AlertCircle,
  Loader2,
  Plus,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { ClientDate } from '@/components/common/ClientDate';

export function AccountSelector() {
  const { t } = useTranslation();
  const { platform, connectionId, setConnection, setSkipAccount, setStep } =
    useSocialCreateStore();

  const { connections, loading, fetchConnections } = useSocialConnections();

  // Map content type to platform type
  const platformMap: Record<SocialContentType, SocialPlatformType> = {
    WECHAT_ARTICLE: 'WECHAT_MP',
    XIAOHONGSHU_NOTE: 'XIAOHONGSHU',
  };

  const platformLabels: Record<SocialContentType, string> = {
    WECHAT_ARTICLE: t('aiSocial.contentTypes.wechat_article'),
    XIAOHONGSHU_NOTE: t('aiSocial.contentTypes.xiaohongshu_note'),
  };

  // Get platform type for filtering
  const targetPlatform = platform ? platformMap[platform] : null;

  // Filter connections for selected platform
  const availableConnections = connections.filter(
    (c) => c.platformType === targetPlatform && c.isActive
  );

  // Load connections on mount
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleSelectAccount = (id: string, name: string | null) => {
    setConnection(id, name);
    setStep(4);
  };

  const handleSkip = () => {
    setSkipAccount(true);
    setStep(4);
  };

  const getPlatformGradient = () => {
    if (platform === 'WECHAT_ARTICLE') {
      return {
        icon: 'from-green-500 to-emerald-600',
        bg: 'from-green-50 to-emerald-50',
      };
    }
    return {
      icon: 'from-red-500 to-rose-600',
      bg: 'from-red-50 to-rose-50',
    };
  };

  const gradient = getPlatformGradient();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(2)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.create.selectAccount') || 'Select Account'}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.selectAccountDesc') ||
              `Choose a ${platform ? platformLabels[platform] : ''} account to publish with`}
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        </div>
      ) : availableConnections.length === 0 ? (
        /* No accounts state */
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${gradient.bg}`}
          >
            <User className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mb-2 font-semibold text-gray-900">
            {t('aiSocial.create.noAccounts') || 'No Connected Accounts'}
          </h3>
          <p className="mb-6 text-sm text-gray-500">
            {t('aiSocial.create.noAccountsDesc') ||
              `Connect a ${platform ? platformLabels[platform] : ''} account to enable publishing`}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/ai-social?tab=connections"
              className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${gradient.icon} px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90`}
            >
              <Plus className="h-4 w-4" />
              {t('aiSocial.create.connectAccount') || 'Connect Account'}
            </Link>
            <button
              onClick={handleSkip}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <SkipForward className="h-4 w-4" />
              {t('aiSocial.create.skipForNow') || 'Skip for Now'}
            </button>
          </div>
        </div>
      ) : (
        /* Account list */
        <div className="space-y-4">
          {/* Refresh button */}
          <div className="flex justify-end">
            <button
              onClick={() => fetchConnections()}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              {t('common.refresh') || 'Refresh'}
            </button>
          </div>

          {/* Account cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {availableConnections.map((account) => {
              const isSelected = connectionId === account.id;

              return (
                <button
                  key={account.id}
                  onClick={() =>
                    handleSelectAccount(account.id, account.accountName)
                  }
                  className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
                    isSelected
                      ? 'border-transparent ring-2 ring-rose-500'
                      : 'border-gray-200 hover:border-transparent hover:shadow-lg'
                  }`}
                >
                  {/* Background gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradient.bg} ${
                      isSelected
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    } transition-opacity`}
                  />

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}

                  <div className="relative flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      {account.avatarUrl ? (
                        <img
                          src={account.avatarUrl}
                          alt={account.accountName || 'Account'}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${gradient.icon}`}
                        >
                          <User className="h-7 w-7 text-white" />
                        </div>
                      )}
                      {/* Active indicator */}
                      <div
                        className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white ${
                          account.isActive ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-gray-900">
                        {account.accountName || t('aiSocial.create.unnamed')}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {account.accountId || account.id.slice(0, 8)}
                      </p>
                      {account.expiresAt && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          {t('aiSocial.create.expiresAt') || 'Expires'}:{' '}
                          <ClientDate date={account.expiresAt} format="date" />
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Skip option */}
          <div className="flex items-center justify-center pt-4">
            <button
              onClick={handleSkip}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <SkipForward className="h-4 w-4" />
              {t('aiSocial.create.skipAccountSelection') ||
                'Skip account selection (save as draft)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
