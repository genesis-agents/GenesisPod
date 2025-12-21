/**
 * Notion 集成 API 客户端
 */

import { apiClient } from './client';
import { getAuthHeader } from '../utils/auth';

// ==================== 类型定义 ====================

export interface NotionConnection {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  workspaceIcon: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'ERROR';
  lastSyncAt: string | null;
  lastError: string | null;
  syncConfig: SyncConfig;
  pagesCount: number;
  databasesCount: number;
  createdAt: string;
}

export interface SyncConfig {
  autoSync: boolean;
  syncInterval: number;
  syncOnStartup: boolean;
  syncPages: boolean;
  syncDatabases: boolean;
  maxPagesPerSync: number;
}

export interface NotionPage {
  id: string;
  notionPageId: string;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  url: string;
  parentType: string | null;
  parentId: string | null;
  blocks?: any[];
  plainTextContent?: string;
  notionCreatedAt: string;
  notionUpdatedAt: string;
  syncStatus: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED';
  lastSyncedAt: string | null;
  isLocallyModified: boolean;
  linkedResourceId: string | null;
  connection?: {
    id: string;
    workspaceName: string | null;
    workspaceIcon: string | null;
  };
  versions?: Array<{
    id: string;
    version: number;
    source: string;
    createdAt: string;
  }>;
}

export interface NotionDatabase {
  id: string;
  notionDbId: string;
  title: string;
  description: string | null;
  icon: string | null;
  url: string;
  properties?: Record<string, any>;
  items?: any[];
  itemCount: number;
  syncStatus: string;
  lastSyncedAt: string | null;
  connection?: {
    id: string;
    workspaceName: string | null;
  };
}

export interface SyncStatus {
  connectionId: string;
  workspaceName: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  lastSync: SyncHistoryItem | null;
}

export interface SyncHistoryItem {
  id: string;
  syncType: 'full' | 'incremental' | 'manual';
  status: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED';
  pagesProcessed: number;
  pagesCreated: number;
  pagesUpdated: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errors: string[] | null;
}

export interface PaginatedPages {
  pages: NotionPage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ==================== API 方法 ====================

/**
 * 获取 Notion OAuth 授权 URL
 */
export async function getConnectUrl(): Promise<{ url: string }> {
  return apiClient.get('/api/v1/notion/connect', {
    headers: getAuthHeader(),
  });
}

/**
 * 完成 OAuth 连接
 */
export async function connectNotion(
  code: string,
  redirectUri?: string
): Promise<{
  success: boolean;
  connectionId: string;
  workspaceName: string;
  message: string;
}> {
  return apiClient.post(
    '/api/v1/notion/connect',
    { code, redirectUri },
    { headers: getAuthHeader() }
  );
}

/**
 * 断开 Notion 连接
 */
export async function disconnectNotion(connectionId: string): Promise<{ success: boolean }> {
  return apiClient.delete(`/api/v1/notion/disconnect/${connectionId}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取用户的所有连接
 */
export async function getConnections(): Promise<{ connections: NotionConnection[] }> {
  return apiClient.get('/api/v1/notion/connections', {
    headers: getAuthHeader(),
  });
}

/**
 * 获取连接详情
 */
export async function getConnection(connectionId: string): Promise<{ connection: NotionConnection }> {
  return apiClient.get(`/api/v1/notion/connections/${connectionId}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 更新连接配置
 */
export async function updateConnection(
  connectionId: string,
  syncConfig: Partial<SyncConfig>
): Promise<{ connection: NotionConnection }> {
  return apiClient.patch(
    `/api/v1/notion/connections/${connectionId}`,
    { syncConfig },
    { headers: getAuthHeader() }
  );
}

/**
 * 触发同步
 */
export async function triggerSync(
  connectionId?: string,
  fullSync = false
): Promise<{ success: boolean; syncId: string; connectionIds: string[] }> {
  return apiClient.post(
    '/api/v1/notion/sync',
    { connectionId, fullSync },
    { headers: getAuthHeader() }
  );
}

/**
 * 获取同步状态
 */
export async function getSyncStatus(connectionId?: string): Promise<{ status: SyncStatus[] }> {
  const params = connectionId ? `?connectionId=${connectionId}` : '';
  return apiClient.get(`/api/v1/notion/sync/status${params}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取同步历史
 */
export async function getSyncHistory(
  connectionId: string,
  limit = 10
): Promise<{ history: SyncHistoryItem[] }> {
  return apiClient.get(`/api/v1/notion/sync/history/${connectionId}?limit=${limit}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取页面列表
 */
export async function getPages(params: {
  connectionId?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedPages> {
  const searchParams = new URLSearchParams();
  if (params.connectionId) searchParams.append('connectionId', params.connectionId);
  if (params.search) searchParams.append('search', params.search);
  if (params.page) searchParams.append('page', String(params.page));
  if (params.limit) searchParams.append('limit', String(params.limit));

  return apiClient.get(`/api/v1/notion/pages?${searchParams.toString()}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取页面详情
 */
export async function getPage(pageId: string): Promise<{ page: NotionPage }> {
  return apiClient.get(`/api/v1/notion/pages/${pageId}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 更新页面（本地修改）
 */
export async function updatePage(
  pageId: string,
  blocks: any[]
): Promise<{ page: NotionPage }> {
  return apiClient.patch(
    `/api/v1/notion/pages/${pageId}`,
    { blocks },
    { headers: getAuthHeader() }
  );
}

/**
 * 推送本地修改到 Notion
 */
export async function pushToNotion(pageId: string): Promise<{ success: boolean }> {
  return apiClient.post(`/api/v1/notion/pages/${pageId}/push`, {}, {
    headers: getAuthHeader(),
  });
}

/**
 * 链接页面到资源
 */
export async function linkToResource(
  pageId: string,
  resourceId: string
): Promise<{ success: boolean }> {
  return apiClient.post(
    `/api/v1/notion/pages/${pageId}/link`,
    { resourceId },
    { headers: getAuthHeader() }
  );
}

/**
 * 取消链接
 */
export async function unlinkFromResource(pageId: string): Promise<{ success: boolean }> {
  return apiClient.delete(`/api/v1/notion/pages/${pageId}/link`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取数据库列表
 */
export async function getDatabases(
  connectionId?: string
): Promise<{ databases: NotionDatabase[] }> {
  const params = connectionId ? `?connectionId=${connectionId}` : '';
  return apiClient.get(`/api/v1/notion/databases${params}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取数据库详情
 */
export async function getDatabase(databaseId: string): Promise<{ database: NotionDatabase }> {
  return apiClient.get(`/api/v1/notion/databases/${databaseId}`, {
    headers: getAuthHeader(),
  });
}

/**
 * 获取集成配置状态
 */
export async function getConfig(): Promise<{ configured: boolean; callbackUrl: string }> {
  return apiClient.get('/api/v1/notion/config', {
    headers: getAuthHeader(),
  });
}

export default {
  getConnectUrl,
  connectNotion,
  disconnectNotion,
  getConnections,
  getConnection,
  updateConnection,
  triggerSync,
  getSyncStatus,
  getSyncHistory,
  getPages,
  getPage,
  updatePage,
  pushToNotion,
  linkToResource,
  unlinkFromResource,
  getDatabases,
  getDatabase,
  getConfig,
};
