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
        getPages({ page: pagination.page, limit: pagination.limit, search: search || undefined }),
      ]);
      setConnections(connResult.connections);
      setSyncStatuses(statusResult.status);
      setPages(pagesResult.pages);
      setPagination(pagesResult.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Notion data');
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
      window.open(result.url, 'notion-oauth', 'width=600,height=700');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start connection');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this Notion workspace?')) {
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const getSyncStatusForConnection = (connectionId: string): SyncStatus | undefined => {
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
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.763 7.279V9.014l-1.215-.14c-.093-.513.28-.886.747-.933l3.223-.186zM2.877 0C1.076.093.076.793.076 2.294v17.37C.076 21.16.793 21.998 2.32 22L18.48 23c1.542.008 1.945-.328 3.034-1.634l3.3-4.453c.842-1.12 1.186-1.68 1.186-2.614V4.34c0-1.26-.56-1.96-2.1-1.867L4.553.2C3.085.107 2.877.093 2.877 0z"/>
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Connect your Notion workspace
        </h3>
        <p className="mt-1 max-w-md text-center text-gray-500">
          Sync your Notion pages and databases to DeepDive. Your notes will appear here after connecting.
        </p>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="mt-6 flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {connecting ? (
            <>
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* 工作区状态栏 */}
      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-4">
          {connections.map((conn) => {
            const syncStatus = getSyncStatusForConnection(conn.id);
            return (
              <div key={conn.id} className="flex items-center gap-2">
                {conn.workspaceIcon ? (
                  <span className="text-lg">{conn.workspaceIcon}</span>
                ) : (
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447z"/>
                  </svg>
                )}
                <span className="text-sm font-medium text-gray-700">
                  {conn.workspaceName || conn.workspaceId}
                </span>
                {syncStatus?.isSyncing && (
                  <span className="flex items-center text-xs text-blue-600">
                    <svg className="mr-1 h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Syncing
                  </span>
                )}
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                  conn.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {conn.pagesCount} pages
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync(connections[0]?.id)}
            disabled={syncStatuses.some((s) => s.isSyncing)}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Sync Now
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-md bg-white p-1.5 text-gray-500 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-sm font-medium text-gray-900">Workspace Settings</h3>
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{conn.workspaceName || conn.workspaceId}</span>
                <span className="text-xs text-gray-500">
                  Last synced: {conn.lastSyncAt ? formatDate(conn.lastSyncAt) : 'Never'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSync(conn.id, true)}
                  className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                >
                  Full Sync
                </button>
                <button
                  onClick={() => handleDisconnect(conn.id)}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleConnect}
            className="mt-2 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add another workspace
          </button>
        </div>
      )}

      {/* 搜索栏 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Notion pages..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 pl-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-800">
          Search
        </button>
      </form>

      {/* 页面列表 */}
      {pages.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          {search ? 'No pages found matching your search.' : 'No pages synced yet. Click "Sync Now" to fetch your Notion pages.'}
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => handlePageClick(page)}
              className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    {page.icon ? (
                      <span className="text-xl">{page.icon}</span>
                    ) : (
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900 group-hover:text-blue-600">
                      {page.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {formatDate(page.notionUpdatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {page.isLocallyModified && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                      Modified
                    </span>
                  )}
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} pages
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === pagination.totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
