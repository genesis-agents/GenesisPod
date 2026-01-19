'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  Link2,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  useSocialConnections,
  SocialPlatformConnection,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores/toastStore';

// Platform types matching backend
type PlatformType = 'WECHAT_MP' | 'XIAOHONGSHU';

// Platform configuration
const PLATFORMS: Record<
  PlatformType,
  { name: string; icon: string; color: string; bgColor: string }
> = {
  WECHAT_MP: {
    name: 'WeChat MP',
    icon: '/icons/wechat.svg',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  XIAOHONGSHU: {
    name: 'Xiaohongshu',
    icon: '/icons/xiaohongshu.svg',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
  },
};

export default function ConnectionsTab() {
  const { t } = useTranslation();
  const {
    connections,
    loading,
    error,
    fetchConnections,
    removeConnection,
    testConnection,
    refreshConnection,
  } = useSocialConnections();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | null>(
    null
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load connections on mount
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleAddConnection = (platform: PlatformType) => {
    setSelectedPlatform(platform);
    setShowAddModal(true);
  };

  const handleRefresh = async () => {
    await fetchConnections();
    toast.success(t('common.refresh') + ' ' + t('common.success'));
  };

  const handleDeleteConnection = async (
    connection: SocialPlatformConnection
  ) => {
    if (!confirm(t('aiSocial.confirm.disconnect'))) return;

    setDeletingId(connection.id);
    const success = await removeConnection(
      connection.platformType as 'WECHAT_MP' | 'XIAOHONGSHU'
    );
    setDeletingId(null);

    if (success) {
      toast.success(t('aiSocial.toast.deleted'));
    } else {
      toast.error(error || t('common.error'));
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    setTestingId(connectionId);
    const result = await testConnection(connectionId);
    setTestingId(null);

    if (result.success) {
      toast.success(result.message || t('aiSocial.connections.connected'));
    } else {
      toast.error(result.message || t('common.error'));
    }
  };

  const handleRefreshConnection = async (connectionId: string) => {
    const result = await refreshConnection(connectionId);
    if (result) {
      toast.success(t('common.success'));
    } else {
      toast.error(error || t('common.error'));
    }
  };

  const getStatusIcon = (isActive: boolean) => {
    if (isActive) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getConnectionForPlatform = (
    platformType: PlatformType
  ): SocialPlatformConnection | undefined => {
    return connections.find((c) => c.platformType === platformType);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('aiSocial.connections.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.connections.description')}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('aiSocial.connections.refresh')}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Available Platforms */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(PLATFORMS).map(([key, platform]) => {
          const platformType = key as PlatformType;
          const existingConnection = getConnectionForPlatform(platformType);

          return (
            <div
              key={key}
              className={`relative rounded-xl border p-6 transition-all ${
                existingConnection
                  ? 'border-gray-200 bg-white'
                  : 'border-dashed border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
              }`}
            >
              {/* Platform Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${platform.bgColor}`}
                  >
                    <span className={`text-xl font-bold ${platform.color}`}>
                      {platform.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {t(`aiSocial.platforms.${platformType.toLowerCase()}`)}
                    </h3>
                    {existingConnection?.accountName && (
                      <p className="text-sm text-gray-500">
                        @{existingConnection.accountName}
                      </p>
                    )}
                  </div>
                </div>
                {existingConnection &&
                  getStatusIcon(existingConnection.isActive)}
              </div>

              {/* Connection Status */}
              {existingConnection ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{t('aiSocial.connections.status')}:</span>
                    <span
                      className={
                        existingConnection.isActive
                          ? 'text-green-600'
                          : 'text-red-500'
                      }
                    >
                      {existingConnection.isActive
                        ? t('aiSocial.connections.connected')
                        : t('aiSocial.connections.disconnected')}
                    </span>
                  </div>
                  {existingConnection.lastCheckAt && (
                    <div className="text-xs text-gray-400">
                      {t('aiSocial.connections.lastSync')}:{' '}
                      {new Date(
                        existingConnection.lastCheckAt
                      ).toLocaleString()}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() =>
                        handleTestConnection(existingConnection.id)
                      }
                      disabled={testingId === existingConnection.id}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testingId === existingConnection.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Settings className="h-4 w-4" />
                      )}
                      {t('aiSocial.connections.configure')}
                    </button>
                    <button
                      onClick={() => handleDeleteConnection(existingConnection)}
                      disabled={deletingId === existingConnection.id}
                      className="flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === existingConnection.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleAddConnection(platformType)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                  <Plus className="h-4 w-4" />
                  {t('aiSocial.connections.connect')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State - Only show if no connections and not loading */}
      {connections.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <Link2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            {t('aiSocial.connections.emptyTitle')}
          </h3>
          <p className="mb-6 text-sm text-gray-500">
            {t('aiSocial.connections.emptyDescription')}
          </p>
        </div>
      )}

      {/* Info Notice */}
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <div className="text-sm text-amber-700">
          <p className="font-medium">
            {t('aiSocial.connections.notice.title')}
          </p>
          <p className="mt-1">{t('aiSocial.connections.notice.description')}</p>
        </div>
      </div>

      {/* Add Connection Modal */}
      {showAddModal && selectedPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">
              {t('aiSocial.connections.addTitle', {
                platform: t(
                  `aiSocial.platforms.${selectedPlatform.toLowerCase()}`
                ),
              })}
            </h3>
            <p className="mb-6 text-sm text-gray-500">
              {t('aiSocial.connections.addDescription')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  // TODO: Implement OAuth or session-based connection
                  toast.info('平台连接功能即将上线');
                  setShowAddModal(false);
                }}
                className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                {t('aiSocial.connections.startAuth')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
