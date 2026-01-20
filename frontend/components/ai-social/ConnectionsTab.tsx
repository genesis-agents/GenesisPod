'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  QrCode,
  X,
} from 'lucide-react';
import {
  useSocialConnections,
  SocialPlatformConnection,
  InitConnectionResponse,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores/toastStore';

// Platform types matching backend
type PlatformType = 'WECHAT_MP' | 'XIAOHONGSHU';

// Login modal state
interface LoginModalState {
  isOpen: boolean;
  platform: PlatformType | null;
  status: 'idle' | 'loading' | 'scanning' | 'success' | 'error';
  screenshot: string | null;
  message: string;
}

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
    startConnection,
    checkConnection,
  } = useSocialConnections();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Login modal state
  const [loginModal, setLoginModal] = useState<LoginModalState>({
    isOpen: false,
    platform: null,
    status: 'idle',
    screenshot: null,
    message: '',
  });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load connections on mount
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Close login modal
  const closeLoginModal = useCallback(() => {
    stopPolling();
    setLoginModal({
      isOpen: false,
      platform: null,
      status: 'idle',
      screenshot: null,
      message: '',
    });
  }, [stopPolling]);

  // Handle add connection - start login flow
  const handleAddConnection = async (platform: PlatformType) => {
    setLoginModal({
      isOpen: true,
      platform,
      status: 'loading',
      screenshot: null,
      message: '正在启动登录...',
    });

    const result = await startConnection(platform);

    if (result.status === 'existing') {
      setLoginModal((prev) => ({
        ...prev,
        status: 'success',
        message: result.message || '平台已连接',
      }));
      toast.success(result.message || '平台已连接');
      setTimeout(closeLoginModal, 1500);
      return;
    }

    if (result.status === 'pending' && result.screenshot) {
      setLoginModal((prev) => ({
        ...prev,
        status: 'scanning',
        screenshot: result.screenshot || null,
        message: '请扫码登录',
      }));

      // Start polling for verification
      pollingRef.current = setInterval(async () => {
        const verifyResult = await checkConnection(platform);

        if (verifyResult.status === 'success') {
          stopPolling();
          setLoginModal((prev) => ({
            ...prev,
            status: 'success',
            message: verifyResult.message || '连接成功',
          }));
          toast.success(verifyResult.message || '连接成功');
          setTimeout(closeLoginModal, 1500);
        } else if (
          verifyResult.status === 'pending' &&
          verifyResult.screenshot
        ) {
          // Update screenshot if changed
          setLoginModal((prev) => ({
            ...prev,
            screenshot: verifyResult.screenshot || prev.screenshot,
          }));
        } else if (verifyResult.status === 'error') {
          stopPolling();
          setLoginModal((prev) => ({
            ...prev,
            status: 'error',
            message: verifyResult.message || '验证失败',
          }));
        }
      }, 3000); // Poll every 3 seconds
      return;
    }

    // Error
    setLoginModal((prev) => ({
      ...prev,
      status: 'error',
      message: result.message || '启动登录失败',
    }));
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

      {/* Login Modal with QR Code */}
      {loginModal.isOpen && loginModal.platform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {t('aiSocial.connections.addTitle', {
                  platform: t(
                    `aiSocial.platforms.${loginModal.platform.toLowerCase()}`
                  ),
                })}
              </h3>
              <button
                onClick={closeLoginModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content based on status */}
            <div className="min-h-[300px]">
              {loginModal.status === 'loading' && (
                <div className="flex h-[300px] flex-col items-center justify-center">
                  <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
                  <p className="mt-4 text-sm text-gray-500">
                    {loginModal.message}
                  </p>
                </div>
              )}

              {loginModal.status === 'scanning' && loginModal.screenshot && (
                <div className="flex flex-col items-center">
                  <p className="mb-4 text-sm text-gray-600">
                    请使用
                    {loginModal.platform === 'WECHAT_MP' ? '微信' : '小红书'}
                    扫描下方二维码登录
                  </p>
                  <div className="relative overflow-hidden rounded-lg border border-gray-200">
                    <img
                      src={loginModal.screenshot}
                      alt="Login QR Code"
                      className="max-h-[400px] w-auto"
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>等待扫码确认...</span>
                  </div>
                </div>
              )}

              {loginModal.status === 'success' && (
                <div className="flex h-[300px] flex-col items-center justify-center">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                  <p className="mt-4 text-lg font-medium text-gray-900">
                    {loginModal.message}
                  </p>
                </div>
              )}

              {loginModal.status === 'error' && (
                <div className="flex h-[300px] flex-col items-center justify-center">
                  <XCircle className="h-16 w-16 text-red-500" />
                  <p className="mt-4 text-lg font-medium text-gray-900">
                    {loginModal.message}
                  </p>
                  <button
                    onClick={() => handleAddConnection(loginModal.platform!)}
                    className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    重试
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {loginModal.status === 'scanning' && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <button
                  onClick={closeLoginModal}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
