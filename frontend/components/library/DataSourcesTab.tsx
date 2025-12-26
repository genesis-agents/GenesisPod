'use client';

import { useState, useEffect } from 'react';
import {
  HardDrive,
  FileText,
  Bookmark,
  StickyNote,
  Image,
  Link as LinkIcon,
  Upload,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Settings,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

// 数据源配置类型
interface DataSourceConfig {
  type: string;
  name: string;
  description: string;
  icon: typeof HardDrive;
  color: string;
  connectedColor: string;
  settingsUrl?: string;
  isInternal?: boolean;
}

// 数据源类型配置
const DATA_SOURCE_CONFIGS: DataSourceConfig[] = [
  {
    type: 'GOOGLE_DRIVE',
    name: 'Google Drive',
    description: '同步 Google Drive 文件到知识库',
    icon: HardDrive,
    color: 'bg-green-50 text-green-600 border-green-200',
    connectedColor: 'bg-green-100 text-green-700',
    settingsUrl: '/settings/integrations/google-drive',
    isInternal: false,
  },
  {
    type: 'NOTION',
    name: 'Notion',
    description: '同步 Notion 页面到知识库',
    icon: FileText,
    color: 'bg-gray-50 text-gray-600 border-gray-200',
    connectedColor: 'bg-gray-100 text-gray-700',
    settingsUrl: '/settings/integrations/notion',
    isInternal: false,
  },
  {
    type: 'BOOKMARK',
    name: '书签',
    description: '平台内保存的书签资源',
    icon: Bookmark,
    color: 'bg-orange-50 text-orange-600 border-orange-200',
    connectedColor: 'bg-orange-100 text-orange-700',
    isInternal: true,
  },
  {
    type: 'NOTE',
    name: '笔记',
    description: '平台内创建的笔记内容',
    icon: StickyNote,
    color: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    connectedColor: 'bg-yellow-100 text-yellow-700',
    isInternal: true,
  },
  {
    type: 'IMAGE',
    name: '图片',
    description: '图片文件（支持 OCR 提取文字）',
    icon: Image,
    color: 'bg-pink-50 text-pink-600 border-pink-200',
    connectedColor: 'bg-pink-100 text-pink-700',
    isInternal: true,
  },
  {
    type: 'UPLOAD',
    name: '上传文件',
    description: '手动上传的文档文件',
    icon: Upload,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    connectedColor: 'bg-blue-100 text-blue-700',
    isInternal: true,
  },
  {
    type: 'URL',
    name: 'URL 抓取',
    description: '从网页 URL 抓取的内容',
    icon: LinkIcon,
    color: 'bg-purple-50 text-purple-600 border-purple-200',
    connectedColor: 'bg-purple-100 text-purple-700',
    isInternal: true,
  },
];

interface DataSourceStatus {
  type: string;
  isConnected: boolean;
  lastSyncAt?: string;
  itemCount?: number;
  lastError?: string;
}

/**
 * 个人数据源 TAB
 * 显示用户连接的数据源状态
 */
export default function DataSourcesTab() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [dataSourceStatuses, setDataSourceStatuses] = useState<
    Record<string, DataSourceStatus>
  >({});

  // Fetch data source statuses
  useEffect(() => {
    fetchDataSourceStatuses();
  }, []);

  const fetchDataSourceStatuses = async () => {
    setLoading(true);
    try {
      // Fetch Google Drive connection status
      const gdResponse = await fetch(
        `${config.apiUrl}/google-drive/connection`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      const statuses: Record<string, DataSourceStatus> = {};

      if (gdResponse.ok) {
        const gdData = await gdResponse.json();
        statuses['GOOGLE_DRIVE'] = {
          type: 'GOOGLE_DRIVE',
          isConnected: gdData.isConnected,
          lastSyncAt: gdData.lastSyncAt,
        };
      }

      // Internal sources are always "connected"
      ['BOOKMARK', 'NOTE', 'IMAGE', 'UPLOAD', 'URL'].forEach((type) => {
        statuses[type] = {
          type,
          isConnected: true,
        };
      });

      // Notion connection status (if implemented)
      statuses['NOTION'] = {
        type: 'NOTION',
        isConnected: false, // TODO: Implement Notion connection check
      };

      setDataSourceStatuses(statuses);
    } catch (error) {
      console.error('Failed to fetch data source statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (type: string) => {
    setSyncing(type);
    try {
      // Implement sync logic based on type
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate sync
      await fetchDataSourceStatuses();
    } catch (error) {
      console.error(`Failed to sync ${type}:`, error);
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">个人数据源</h3>
          <p className="text-sm text-gray-500">
            管理你的数据源连接，这些数据可以导入到知识库
          </p>
        </div>
        <button
          onClick={fetchDataSourceStatuses}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          刷新状态
        </button>
      </div>

      {/* External Data Sources */}
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
          <ExternalLink className="h-4 w-4" />
          外部数据源
        </h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {DATA_SOURCE_CONFIGS.filter((ds) => !ds.isInternal).map((source) => {
            const Icon = source.icon;
            const status = dataSourceStatuses[source.type];
            const isConnected = status?.isConnected ?? false;

            return (
              <div
                key={source.type}
                className={`rounded-xl border-2 bg-white p-5 transition-all ${
                  isConnected
                    ? 'border-green-200 hover:border-green-300'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${source.color}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {source.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {source.description}
                      </p>
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div className="flex items-center gap-1.5">
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-medium text-green-600">
                          已连接
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-gray-400" />
                        <span className="text-xs text-gray-500">未连接</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Last Sync Info */}
                {isConnected && status?.lastSyncAt && (
                  <p className="mt-3 text-xs text-gray-500">
                    上次同步: {new Date(status.lastSyncAt).toLocaleString()}
                  </p>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => handleSync(source.type)}
                        disabled={syncing === source.type}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        {syncing === source.type ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        同步
                      </button>
                      {source.settingsUrl && (
                        <a
                          href={source.settingsUrl}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <Settings className="h-4 w-4" />
                          设置
                        </a>
                      )}
                    </>
                  ) : (
                    <a
                      href={source.settingsUrl || '#'}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                    >
                      连接
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Internal Data Sources */}
      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
          <HardDrive className="h-4 w-4" />
          平台内数据
        </h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {DATA_SOURCE_CONFIGS.filter((ds) => ds.isInternal).map((source) => {
            const Icon = source.icon;

            return (
              <div
                key={source.type}
                className={`flex items-center gap-3 rounded-lg border bg-white p-4 ${source.color}`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${source.connectedColor}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {source.name}
                  </p>
                  <p className="text-xs text-gray-500">可用</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Help Section */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <h4 className="text-sm font-medium text-blue-900">如何使用数据源？</h4>
        <ul className="mt-2 space-y-1 text-sm text-blue-700">
          <li>• 连接外部数据源后，可以在创建知识库时选择作为数据来源</li>
          <li>• 平台内数据（书签、笔记等）可以直接导入到知识库</li>
          <li>• 同步功能会自动更新知识库中的内容</li>
        </ul>
      </div>
    </div>
  );
}
