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
  ChevronRight,
  FolderOpen,
  MessageCircle,
} from 'lucide-react';
import RAGStatusIndicator, { RAGServiceStatus } from './RAGStatusIndicator';
import WechatDataSourcePanel from './WechatDataSourcePanel';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';

// Sub-tabs for data sources
type DataSourceSubTab =
  | 'overview'
  | 'bookmarks'
  | 'notes'
  | 'images'
  | 'notion'
  | 'google-drive'
  | 'wechat';

interface DataSourcesTabProps {
  /** Initial sub-tab to show */
  initialSubTab?: DataSourceSubTab;
  /** Callback when sub-tab changes */
  onSubTabChange?: (subTab: DataSourceSubTab) => void;
  /** Render function for bookmarks content */
  renderBookmarks?: () => React.ReactNode;
  /** Render function for notes content */
  renderNotes?: () => React.ReactNode;
  /** Render function for images content */
  renderImages?: () => React.ReactNode;
  /** Render function for Notion content */
  renderNotion?: () => React.ReactNode;
  /** Render function for Google Drive content */
  renderGoogleDrive?: () => React.ReactNode;
  /** Render function for WeChat content */
  renderWechat?: () => React.ReactNode;
}

// 数据源配置类型
interface DataSourceConfig {
  type: string;
  icon: typeof HardDrive;
  color: string;
  connectedColor: string;
  settingsUrl?: string;
  isInternal?: boolean;
  subTab?: DataSourceSubTab;
}

// 数据源类型配置 (name/description 通过 i18n 获取)
const DATA_SOURCE_CONFIGS: DataSourceConfig[] = [
  {
    type: 'GOOGLE_DRIVE',
    icon: HardDrive,
    color: 'bg-green-50 text-green-600 border-green-200',
    connectedColor: 'bg-green-100 text-green-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'google-drive',
  },
  {
    type: 'NOTION',
    icon: FileText,
    color: 'bg-gray-50 text-gray-600 border-gray-200',
    connectedColor: 'bg-gray-100 text-gray-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'notion',
  },
  {
    type: 'WECHAT',
    icon: MessageCircle,
    color: 'bg-green-50 text-green-600 border-green-200',
    connectedColor: 'bg-green-100 text-green-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'wechat',
  },
  {
    type: 'BOOKMARK',
    icon: Bookmark,
    color: 'bg-orange-50 text-orange-600 border-orange-200',
    connectedColor: 'bg-orange-100 text-orange-700',
    isInternal: true,
    subTab: 'bookmarks',
  },
  {
    type: 'NOTE',
    icon: StickyNote,
    color: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    connectedColor: 'bg-yellow-100 text-yellow-700',
    isInternal: true,
    subTab: 'notes',
  },
  {
    type: 'IMAGE',
    icon: Image,
    color: 'bg-pink-50 text-pink-600 border-pink-200',
    connectedColor: 'bg-pink-100 text-pink-700',
    isInternal: true,
    subTab: 'images',
  },
  {
    type: 'UPLOAD',
    icon: Upload,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    connectedColor: 'bg-blue-100 text-blue-700',
    isInternal: true,
  },
  {
    type: 'URL',
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
  needsReauth?: boolean;
}

// RAGServiceStatus 从 RAGStatusIndicator 组件导入

/**
 * 个人数据源 TAB
 * 显示用户连接的数据源状态，支持子导航
 */
export default function DataSourcesTab({
  initialSubTab = 'overview',
  onSubTabChange,
  renderBookmarks,
  renderNotes,
  renderImages,
  renderNotion,
  renderGoogleDrive,
  renderWechat,
}: DataSourcesTabProps) {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] =
    useState<DataSourceSubTab>(initialSubTab);

  // Notify parent when sub-tab changes
  useEffect(() => {
    onSubTabChange?.(activeSubTab);
  }, [activeSubTab, onSubTabChange]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [dataSourceStatuses, setDataSourceStatuses] = useState<
    Record<string, DataSourceStatus>
  >({});
  const [ragServiceStatus, setRagServiceStatus] = useState<RAGServiceStatus>({
    embedding: { status: 'loading' },
    database: { status: 'loading' },
  });

  // Fetch RAG service status
  const fetchRAGServiceStatus = async () => {
    // Check embedding service
    try {
      const embeddingResponse = await fetch(
        `${config.apiUrl}/rag/embedding-config`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json();
        setRagServiceStatus((prev) => ({
          ...prev,
          embedding: {
            status: 'ok',
            modelId: embeddingData.modelId,
            provider: embeddingData.provider,
            dimensions: embeddingData.dimensions,
          },
        }));
      } else {
        setRagServiceStatus((prev) => ({
          ...prev,
          embedding: {
            status: 'error',
            error: t('dataSources.errors.embeddingConfigFailed'),
          },
        }));
      }
    } catch (error) {
      setRagServiceStatus((prev) => ({
        ...prev,
        embedding: {
          status: 'error',
          error: t('dataSources.errors.embeddingConnectionFailed'),
        },
      }));
    }

    // Database is assumed OK if we can fetch other data
    setRagServiceStatus((prev) => ({
      ...prev,
      database: { status: 'ok' },
    }));
  };

  // Fetch data source statuses
  useEffect(() => {
    fetchDataSourceStatuses();
    fetchRAGServiceStatus();
  }, []);

  const fetchDataSourceStatuses = async () => {
    setLoading(true);
    try {
      const statuses: Record<string, DataSourceStatus> = {};

      // Fetch Google Drive connection status
      try {
        const gdResponse = await fetch(
          `${config.apiUrl}/google-drive/connection`,
          {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }
        );

        if (gdResponse.ok) {
          const gdData = await gdResponse.json();
          // Backend returns { connection: {...} | null }
          const connection = gdData.connection;
          // 检查status是否为ACTIVE
          // 如果status是ERROR/EXPIRED/REVOKED，显示为需要重新授权
          const isActive = connection && connection.status === 'ACTIVE';
          const needsReauth = connection && !isActive;
          statuses['GOOGLE_DRIVE'] = {
            type: 'GOOGLE_DRIVE',
            isConnected: isActive,
            lastSyncAt: connection?.lastSyncAt,
            lastError: needsReauth
              ? connection.lastError || t('dataSources.errors.authExpired')
              : undefined,
            needsReauth: needsReauth,
          };
        } else {
          statuses['GOOGLE_DRIVE'] = {
            type: 'GOOGLE_DRIVE',
            isConnected: false,
          };
        }
      } catch {
        statuses['GOOGLE_DRIVE'] = {
          type: 'GOOGLE_DRIVE',
          isConnected: false,
        };
      }

      // Fetch Notion connection status
      try {
        const notionResponse = await fetch(
          `${config.apiUrl}/notion/connections`,
          {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }
        );

        if (notionResponse.ok) {
          const notionData = await notionResponse.json();
          const hasConnections =
            notionData.connections && notionData.connections.length > 0;
          statuses['NOTION'] = {
            type: 'NOTION',
            isConnected: hasConnections,
            itemCount: notionData.connections?.length || 0,
          };
        } else {
          statuses['NOTION'] = {
            type: 'NOTION',
            isConnected: false,
          };
        }
      } catch {
        statuses['NOTION'] = {
          type: 'NOTION',
          isConnected: false,
        };
      }

      // Fetch WeChat Work binding status
      try {
        const wechatResponse = await fetch(
          `${config.apiUrl}/wechat-data-source/binding`,
          {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }
        );

        if (wechatResponse.ok) {
          const wechatData = await wechatResponse.json();
          statuses['WECHAT'] = {
            type: 'WECHAT',
            isConnected: wechatData.isBound ?? false,
          };
        } else {
          statuses['WECHAT'] = {
            type: 'WECHAT',
            isConnected: false,
          };
        }
      } catch {
        statuses['WECHAT'] = {
          type: 'WECHAT',
          isConnected: false,
        };
      }

      // Internal sources are always "connected"
      ['BOOKMARK', 'NOTE', 'IMAGE', 'UPLOAD', 'URL'].forEach((type) => {
        statuses[type] = {
          type,
          isConnected: true,
        };
      });

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

  // Sub-tab navigation items
  const subTabs = [
    {
      id: 'overview' as const,
      name: t('dataSources.tabs.overview'),
      icon: FolderOpen,
    },
    {
      id: 'bookmarks' as const,
      name: t('dataSources.tabs.bookmarks'),
      icon: Bookmark,
    },
    {
      id: 'notes' as const,
      name: t('dataSources.tabs.notes'),
      icon: StickyNote,
    },
    { id: 'images' as const, name: t('dataSources.tabs.images'), icon: Image },
    { id: 'notion' as const, name: 'Notion', icon: FileText },
    { id: 'google-drive' as const, name: 'Google Drive', icon: HardDrive },
    { id: 'wechat' as const, name: 'WeChat', icon: MessageCircle },
  ];

  // Render sub-tab content
  const renderSubTabContent = () => {
    switch (activeSubTab) {
      case 'bookmarks':
        return renderBookmarks ? (
          renderBookmarks()
        ) : (
          <div className="py-12 text-center text-gray-500">
            {t('dataSources.placeholder.bookmarks')}
          </div>
        );
      case 'notes':
        return renderNotes ? (
          renderNotes()
        ) : (
          <div className="py-12 text-center text-gray-500">
            {t('dataSources.placeholder.notes')}
          </div>
        );
      case 'images':
        return renderImages ? (
          renderImages()
        ) : (
          <div className="py-12 text-center text-gray-500">
            {t('dataSources.placeholder.images')}
          </div>
        );
      case 'notion':
        return renderNotion ? (
          renderNotion()
        ) : (
          <div className="py-12 text-center text-gray-500">
            {t('dataSources.placeholder.notion')}
          </div>
        );
      case 'google-drive':
        return renderGoogleDrive ? (
          renderGoogleDrive()
        ) : (
          <div className="py-12 text-center text-gray-500">
            {t('dataSources.placeholder.googleDrive')}
          </div>
        );
      case 'wechat':
        return renderWechat ? renderWechat() : <WechatDataSourcePanel />;
      default:
        return renderOverview();
    }
  };

  // Render overview (original content)
  const renderOverview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header with RAG Status Indicator */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t('dataSources.overviewTitle')}
            </h3>
            <p className="text-sm text-gray-500">
              {t('dataSources.overviewDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* RAG Status Indicator - 小型状态指示器 */}
            <RAGStatusIndicator
              status={ragServiceStatus}
              onRefresh={fetchRAGServiceStatus}
            />
            <button
              onClick={fetchDataSourceStatuses}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              {t('dataSources.refreshStatus')}
            </button>
          </div>
        </div>

        {/* External Data Sources */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
            <ExternalLink className="h-4 w-4" />
            {t('dataSources.external')}
          </h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {DATA_SOURCE_CONFIGS.filter((ds) => !ds.isInternal).map(
              (source) => {
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
                            {t(`dataSources.types.${source.type}.name`)}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {t(`dataSources.types.${source.type}.description`)}
                          </p>
                        </div>
                      </div>

                      {/* Connection Status */}
                      <div className="flex items-center gap-1.5">
                        {isConnected ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="text-xs font-medium text-green-600">
                              {t('dataSources.connected')}
                            </span>
                          </>
                        ) : status?.needsReauth ? (
                          <>
                            <XCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-xs font-medium text-amber-600">
                              {t('dataSources.needsReauth')}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {t('dataSources.notConnected')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Last Sync Info */}
                    {isConnected && status?.lastSyncAt && (
                      <p className="mt-3 text-xs text-gray-500">
                        {t('dataSources.lastSync')}:{' '}
                        {new Date(status.lastSyncAt).toLocaleString()}
                      </p>
                    )}

                    {/* Error Info */}
                    {status?.lastError && (
                      <p className="mt-2 text-xs text-amber-600">
                        {status.lastError}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex gap-2">
                      {isConnected ? (
                        <>
                          {source.subTab && (
                            <button
                              onClick={() =>
                                setActiveSubTab(
                                  source.subTab as DataSourceSubTab
                                )
                              }
                              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                              <FolderOpen className="h-4 w-4" />
                              {t('dataSources.browse')}
                            </button>
                          )}
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
                            {t('dataSources.sync')}
                          </button>
                          {source.settingsUrl && (
                            <a
                              href={source.settingsUrl}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              <Settings className="h-4 w-4" />
                              {t('dataSources.settings')}
                            </a>
                          )}
                        </>
                      ) : status?.needsReauth ? (
                        <a
                          href={source.settingsUrl || '#'}
                          className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t('dataSources.reauthorize')}
                        </a>
                      ) : (
                        <a
                          href={source.settingsUrl || '#'}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          {t('dataSources.connect')}
                        </a>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Internal Data Sources */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
            <HardDrive className="h-4 w-4" />
            {t('dataSources.internal')}
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {DATA_SOURCE_CONFIGS.filter((ds) => ds.isInternal).map((source) => {
              const Icon = source.icon;

              return (
                <div
                  key={source.type}
                  onClick={() =>
                    source.subTab &&
                    setActiveSubTab(source.subTab as DataSourceSubTab)
                  }
                  className={`flex items-center gap-3 rounded-lg border bg-white p-4 transition-all ${source.color} ${source.subTab ? 'cursor-pointer hover:shadow-md' : 'cursor-default opacity-80'}`}
                  role={source.subTab ? 'button' : undefined}
                  tabIndex={source.subTab ? 0 : undefined}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${source.connectedColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {t(`dataSources.types.${source.type}.name`)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {source.subTab
                        ? t('dataSources.clickToBrowse')
                        : t(`dataSources.types.${source.type}.description`)}
                    </p>
                  </div>
                  {source.subTab && (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Help Section */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h4 className="text-sm font-medium text-blue-900">
            {t('dataSources.howToUse')}
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-blue-700">
            <li>{t('dataSources.howToUseHints.1')}</li>
            <li>{t('dataSources.howToUseHints.2')}</li>
            <li>{t('dataSources.howToUseHints.3')}</li>
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeSubTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Sub-tab Content */}
      {renderSubTabContent()}
    </div>
  );
}
