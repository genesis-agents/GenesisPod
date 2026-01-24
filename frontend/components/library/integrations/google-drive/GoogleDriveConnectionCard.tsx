'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGoogleDrive } from '@/hooks/domain/useGoogleDrive';
import { useTranslation } from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
/**
 * Google Drive 连接卡片组件
 *
 * 显示 Google Drive 连接状态和操作
 */
export function GoogleDriveConnectionCard() {
  const { t } = useTranslation();
  const {
    connections,
    isConnected,
    loading,
    error,
    connect,
    disconnect,
    refresh,
  } = useGoogleDrive();

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // 处理连接
  const handleConnect = async () => {
    setConnecting(true);
    setLocalError(null);
    try {
      await connect();
    } catch (error) {
      logger.error('Failed to connect Google Drive:', error);
      setLocalError('Failed to connect. Please try again.');
      setConnecting(false);
    }
  };

  // 处理断开连接
  const handleDisconnect = async (connectionId: string, email: string) => {
    if (!confirm(`Are you sure you want to disconnect ${email}?`)) {
      return;
    }

    setDisconnecting(connectionId);
    setLocalError(null);
    try {
      await disconnect(connectionId);
      await refresh();
    } catch (error) {
      logger.error('Failed to disconnect:', error);
      setLocalError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  };

  // 格式化存储空间
  const formatStorageSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // 格式化日期
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // 获取状态颜色
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600';
      case 'ERROR':
        return 'text-red-600';
      case 'EXPIRED':
        return 'text-orange-600';
      case 'REVOKED':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  // 获取状态文本
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'ERROR':
        return 'Error';
      case 'EXPIRED':
        return 'Expired';
      case 'REVOKED':
        return 'Revoked';
      default:
        return status;
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white">
          <svg className="h-8 w-8" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Google Drive Integration
          </h2>
          <p className="text-sm text-gray-500">
            Sync and manage your Google Drive files
          </p>
        </div>
      </div>

      {/* Error Display */}
      {(error || localError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            {localError || error?.message || 'An error occurred'}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && !isConnected ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : isConnected ? (
        /* Connected State */
        <div className="space-y-4">
          {/* Connected Accounts */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <svg
                className="h-5 w-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="font-medium text-green-800">
                Connected Accounts
              </span>
            </div>

            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {conn.photoUrl ? (
                      <img
                        src={conn.photoUrl}
                        alt={conn.displayName || conn.email}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-600">
                        {(conn.displayName || conn.email)
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}

                    {/* Account Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          {conn.displayName || conn.email}
                        </p>
                        <span
                          className={`text-xs font-medium ${getStatusColor(conn.status)}`}
                        >
                          {getStatusText(conn.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{conn.email}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        {conn.totalSize !== undefined && conn.totalSize > 0 && (
                          <>
                            <span>{formatStorageSize(conn.totalSize)}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>
                          {conn.filesCount ?? 0} files, {conn.foldersCount ?? 0}{' '}
                          folders
                        </span>
                        <span>•</span>
                        <span>Last synced: {formatDate(conn.lastSyncAt)}</span>
                      </div>
                      {conn.lastError && (
                        <p className="mt-1 text-xs text-red-600">
                          Error: {conn.lastError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleDisconnect(conn.id, conn.email)}
                    disabled={disconnecting === conn.id}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnecting === conn.id ? (
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Disconnecting...
                      </span>
                    ) : (
                      'Disconnect'
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add Another Account */}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Another Account
          </button>

          {/* Quick Link to Library */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div>
              <p className="font-medium text-gray-900">
                View Google Drive Files
              </p>
              <p className="text-sm text-gray-500">
                Access and manage your synced files
              </p>
            </div>
            <Link
              href="/library?tab=google-drive"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Open Library
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      ) : (
        /* Not Connected State */
        <div className="space-y-6">
          {/* Setup Guide */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="mb-3 font-medium text-blue-900">
              How to Connect Google Drive
            </h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  1
                </div>
                <div>
                  <p className="font-medium text-blue-900">
                    Click "Connect Google Drive"
                  </p>
                  <p className="text-sm text-blue-700">
                    You'll be redirected to Google's authorization page
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  2
                </div>
                <div>
                  <p className="font-medium text-blue-900">
                    Grant Access Permissions
                  </p>
                  <p className="text-sm text-blue-700">
                    Allow DeepDive to access your Google Drive files
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  3
                </div>
                <div>
                  <p className="font-medium text-blue-900">Start Syncing</p>
                  <p className="text-sm text-blue-700">
                    Your files will be automatically synced to your library
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Connect Button */}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {connecting ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                </svg>
                Connect Google Drive
              </>
            )}
          </button>

          {/* Privacy Note */}
          <p className="text-center text-xs text-gray-500">
            We only access files you explicitly grant permission to. Your data
            is encrypted and never shared with third parties.
          </p>
        </div>
      )}
    </div>
  );
}
