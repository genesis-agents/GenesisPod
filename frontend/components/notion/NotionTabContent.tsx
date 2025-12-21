'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getConnections,
  getConnectUrl,
  disconnectNotion,
  triggerSync,
  getSyncStatus,
  getPages,
  NotionConnection,
  NotionPage,
  SyncStatus,
} from '@/lib/api/notion';

export default function NotionTabContent() {
  const router = useRouter();
  const [connections, setConnections] = useState<NotionConnection[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [connResult, statusResult, pagesResult] = await Promise.all([
        getConnections(),
        getSyncStatus(),
        getPages({
          page: pagination.page,
          limit: pagination.limit,
          search: search || undefined,
        }),
      ]);
      setConnections(connResult.connections);
      setSyncStatuses(statusResult.status);
      setPages(pagesResult.pages);
      setPagination(pagesResult.pagination);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load Notion data'
      );
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 定时刷新同步状态
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const statusResult = await getSyncStatus();
        setSyncStatuses(statusResult.status);
      } catch {
        // 忽略刷新错误
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const result = await getConnectUrl();
      // Redirect to Notion OAuth in same tab
      window.location.href = result.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start connection'
      );
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (
      !confirm('Are you sure you want to disconnect this Notion workspace?')
    ) {
      return;
    }

    try {
      await disconnectNotion(connectionId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const handleSync = async (connectionId: string, fullSync = false) => {
    try {
      await triggerSync(connectionId, fullSync);
      const statusResult = await getSyncStatus();
      setSyncStatuses(statusResult.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    }
  };

  const handlePageClick = (page: NotionPage) => {
    router.push(`/notion/${page.id}`);
  };

  const getSyncStatusForConnection = (
    connectionId: string
  ): SyncStatus | undefined => {
    return syncStatuses.find((s) => s.connectionId === connectionId);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // 判断是否为 URL（用于 workspace icon）
  const isUrl = (str: string | null | undefined): boolean => {
    if (!str) return false;
    return str.startsWith('http://') || str.startsWith('https://');
  };

  // 渲染工作区图标
  const renderWorkspaceIcon = (
    icon: string | null | undefined,
    size: 'sm' | 'md' | 'lg' = 'md'
  ) => {
    const sizeClasses = {
      sm: 'h-5 w-5',
      md: 'h-8 w-8',
      lg: 'h-10 w-10',
    };

    if (!icon) {
      // Notion 默认图标
      return (
        <div
          className={`${sizeClasses[size]} flex items-center justify-center rounded-md bg-gray-100`}
        >
          <svg
            className="h-4 w-4 text-gray-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.763 7.279V9.014l-1.215-.14c-.093-.513.28-.886.747-.933l3.223-.186z" />
          </svg>
        </div>
      );
    }

    if (isUrl(icon)) {
      // URL 类型图标 - 渲染为图片
      return (
        <img
          src={icon}
          alt="Workspace icon"
          className={`${sizeClasses[size]} rounded-md object-cover`}
          onError={(e) => {
            // 图片加载失败时显示默认图标
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }

    // Emoji 类型图标
    const textSizeClasses = {
      sm: 'text-lg',
      md: 'text-xl',
      lg: 'text-2xl',
    };
    return <span className={textSizeClasses[size]}>{icon}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  // 没有连接时显示连接界面
  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <svg
          className="h-16 w-16 text-gray-400"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.763 7.279V9.014l-1.215-.14c-.093-.513.28-.886.747-.933l3.223-.186zM2.877 0C1.076.093.076.793.076 2.294v17.37C.076 21.16.793 21.998 2.32 22L18.48 23c1.542.008 1.945-.328 3.034-1.634l3.3-4.453c.842-1.12 1.186-1.68 1.186-2.614V4.34c0-1.26-.56-1.96-2.1-1.867L4.553.2C3.085.107 2.877.093 2.877 0z" />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Connect your Notion workspace
        </h3>
        <p className="mt-1 max-w-md text-center text-gray-500">
          Sync your Notion pages and databases to DeepDive. Your notes will
          appear here after connecting.
        </p>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-6 flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-white hover:bg-gray-800 disabled:opacity-50"
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
              Connect Notion
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* 工作区状态栏 - 优化设计 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {connections.map((conn) => {
              const syncStatus = getSyncStatusForConnection(conn.id);
              return (
                <div key={conn.id} className="flex items-center gap-3">
                  {/* 工作区图标 */}
                  <div className="relative">
                    {renderWorkspaceIcon(conn.workspaceIcon, 'md')}
                    {/* 连接状态指示点 */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                        conn.status === 'ACTIVE'
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                  </div>
                  {/* 工作区信息 */}
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900">
                      {conn.workspaceName || 'Notion Workspace'}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{conn.pagesCount} pages</span>
                      <span>·</span>
                      <span>{conn.databasesCount || 0} databases</span>
                      {syncStatus?.isSyncing && (
                        <>
                          <span>·</span>
                          <span className="flex items-center text-blue-600">
                            <svg
                              className="mr-1 h-3 w-3 animate-spin"
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
                            Syncing...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSync(connections[0]?.id)}
              disabled={syncStatuses.some((s) => s.isSyncing)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
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
      </div>

      {/* 设置面板 - 优化设计 */}
      {showSettings && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Workspace Settings
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between px-4 py-4"
              >
                <div className="flex items-center gap-3">
                  {renderWorkspaceIcon(conn.workspaceIcon, 'sm')}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {conn.workspaceName || 'Notion Workspace'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Last synced:{' '}
                      {conn.lastSyncAt ? formatDate(conn.lastSyncAt) : 'Never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSync(conn.id, true)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    Full Sync
                  </button>
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 px-4 py-3">
            <button
              onClick={handleConnect}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add another workspace
            </button>
          </div>
        </div>
      )}

      {/* 搜索栏 - 优化设计 */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // 实时搜索（防抖）
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          placeholder="Search pages by title..."
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pl-11 text-sm transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
        />
        <svg
          className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* 页面列表 - 优化设计 */}
      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16">
          <svg
            className="h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">
            {search
              ? 'No pages found matching your search.'
              : 'No pages synced yet.'}
          </p>
          {!search && (
            <button
              onClick={() => handleSync(connections[0]?.id)}
              className="mt-3 text-sm font-medium text-gray-900 hover:text-gray-700"
            >
              Sync now to fetch your Notion pages
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => handlePageClick(page)}
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                {/* 页面图标 */}
                <div className="flex-shrink-0">
                  {page.icon ? (
                    isUrl(page.icon) ? (
                      <img
                        src={page.icon}
                        alt=""
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <span className="text-xl">{page.icon}</span>
                    )
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-100">
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {/* 页面信息 */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-600">
                    {page.title || 'Untitled'}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Updated {formatDate(page.notionUpdatedAt)}
                  </p>
                </div>
              </div>
              {/* 底部操作栏 */}
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <div className="flex items-center gap-1.5">
                  {page.isLocallyModified && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <svg
                        className="mr-1 h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 8 8"
                      >
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                      Modified
                    </span>
                  )}
                  {page.linkedResourceId && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Linked
                    </span>
                  )}
                </div>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Open in Notion"
                >
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 - 优化设计 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <div className="text-sm text-gray-600">
            <span className="font-medium">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>
            {' - '}
            <span className="font-medium">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>
            {' of '}
            <span className="font-medium">{pagination.total}</span>
            {' pages'}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
              }
              disabled={pagination.page === 1}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Previous
            </button>
            <span className="px-3 text-sm text-gray-500">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              disabled={pagination.page === pagination.totalPages}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Next
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
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
