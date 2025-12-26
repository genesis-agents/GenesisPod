'use client';

import { useState, useCallback } from 'react';
import { Cloud, Loader2, AlertCircle } from 'lucide-react';
import { useGoogleDrive } from '@/hooks/domain';
import { useGoogleDriveImport } from '@/hooks/domain/useGoogleDriveImport';
import { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';

/**
 * Google Drive TAB 主内容组件
 * 检查连接状态，显示连接引导或文件浏览器
 */
export default function GoogleDriveTabContent() {
  const [showSettings, setShowSettings] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ show: false, message: '', type: 'info' });

  const {
    connections,
    connection,
    isConnected,
    loading,
    error,
    connect,
    disconnect,
    refresh,
    triggerSync,
    isSyncing,
  } = useGoogleDrive({
    immediate: true,
    refreshInterval: 30000, // 30秒自动刷新
  });

  // 使用临时 ID 来满足 hook 规则，实际会在有连接时被覆盖
  const importHook = useGoogleDriveImport({
    connectionId: connection?.id || 'temp',
    onComplete: (progress) => {
      const successCount = progress.successCount;
      const failedCount = progress.failedCount;
      setImportStatus({
        show: true,
        message:
          failedCount > 0
            ? `Imported ${successCount} files. ${failedCount} failed.`
            : `Successfully imported ${successCount} file${successCount !== 1 ? 's' : ''}`,
        type: failedCount > 0 ? 'error' : 'success',
      });
    },
    onError: (err) => {
      setImportStatus({
        show: true,
        message: err.message || 'Failed to import files',
        type: 'error',
      });
    },
  });

  // 处理连接
  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  // 处理断开连接
  const handleDisconnect = async (connectionId: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Are you sure you want to disconnect Google Drive?')) {
      return;
    }

    try {
      await disconnect(connectionId);
      await refresh();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  // 处理同步
  const handleSync = async (connectionId: string) => {
    try {
      await triggerSync(connectionId);
      setImportStatus({
        show: true,
        message: 'Sync started successfully',
        type: 'success',
      });
      setTimeout(
        () => setImportStatus({ show: false, message: '', type: 'info' }),
        3000
      );
    } catch (err) {
      setImportStatus({
        show: true,
        message: err instanceof Error ? err.message : 'Failed to start sync',
        type: 'error',
      });
    }
  };

  // 处理导入文件
  const handleImportFiles = useCallback(
    async (fileIds: string[]) => {
      if (!connection) return;

      try {
        // 首先选择文件
        importHook.selectAll(fileIds);

        // 然后执行导入
        await importHook.importFiles({
          includeMetadata: true,
          generateSummary: true,
          extractText: true,
        });
      } catch (err) {
        setImportStatus({
          show: true,
          message:
            err instanceof Error ? err.message : 'Failed to import files',
          type: 'error',
        });
      }
    },
    [importHook, connection]
  );

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  // 没有连接时显示连接界面
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <Cloud className="h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Connect your Google Drive
        </h3>
        <p className="mt-1 max-w-md text-center text-gray-500">
          Access and import your Google Drive files to DeepDive. Your files will
          appear here after connecting.
        </p>
        <button
          onClick={handleConnect}
          className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white transition-colors hover:bg-blue-700"
        >
          <Cloud className="h-5 w-5" />
          Connect Google Drive
        </button>
        {error && (
          <p className="mt-3 text-sm text-red-600">
            {error.message || 'Connection failed'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 状态提示 */}
      {importStatus.show && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            importStatus.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : importStatus.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm">{importStatus.message}</span>
            <button
              onClick={() =>
                setImportStatus({ show: false, message: '', type: 'info' })
              }
              className="text-current hover:opacity-70"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 连接信息头部 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-4">
          {/* 左侧：账户信息 */}
          <div className="flex items-center gap-4">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center gap-3">
                {/* 用户头像 */}
                <div className="relative">
                  {conn.photoUrl ? (
                    <img
                      src={conn.photoUrl}
                      alt={conn.displayName || conn.email}
                      className="h-10 w-10 rounded-full border-2 border-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">
                      {(conn.displayName || conn.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                      conn.status === 'ACTIVE'
                        ? 'bg-green-500'
                        : conn.status === 'ERROR'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                    }`}
                  />
                </div>

                {/* 账户信息 */}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">
                    {conn.displayName || 'Google Drive'}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{conn.email}</span>
                    <span>·</span>
                    <span>{conn.filesCount} files</span>
                    <span>·</span>
                    <span>{formatSize(conn.totalSize)}</span>
                    {isSyncing && (
                      <>
                        <span>·</span>
                        <span className="flex items-center text-blue-600">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Syncing...
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => connection && handleSync(connection.id)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Sync
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-lg p-2 transition-colors ${
                showSettings
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 设置面板 */}
        {showSettings && (
          <div className="border-t border-gray-100">
            <div className="divide-y divide-gray-100">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between px-4 py-4"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-gray-900">
                      {conn.displayName || conn.email}
                    </div>
                    <div className="text-xs text-gray-500">
                      Last synced: {formatDate(conn.lastSyncAt)}
                    </div>
                    {conn.lastError && (
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="h-3 w-3" />
                        {conn.lastError}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 文件浏览器 */}
      {connection && (
        <GoogleDriveFileBrowser
          connectionId={connection.id}
          onImport={handleImportFiles}
        />
      )}

      {/* 导入进度指示 */}
      {importHook.importing && connection && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-blue-900">
                Importing files...
              </span>
              {importHook.progress && (
                <span className="text-xs text-blue-700">
                  {importHook.progressPercent}% (
                  {importHook.progress.processedFiles}/
                  {importHook.progress.totalFiles})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
