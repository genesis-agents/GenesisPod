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
  RefreshCw,
  ExternalLink,
  Loader2,
  FolderOpen,
  Zap,
  MoreHorizontal,
  ArrowUpRight,
  HelpCircle,
  Clock,
} from 'lucide-react';
import RAGStatusIndicator, {
  RAGServiceStatus,
} from '../knowledge-base/RAGStatusIndicator';
import ConnectionStatusBadge, {
  ConnectionStatus,
} from './ConnectionStatusBadge';
import FeishuDataSourcePanel from '../import-panels/FeishuDataSourcePanel';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useTranslation } from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
// Sub-tabs for data sources
type DataSourceSubTab =
  | 'overview'
  | 'bookmarks'
  | 'notes'
  | 'images'
  | 'notion'
  | 'google-drive'
  | 'feishu';

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
  /** Render function for Feishu content */
  renderFeishu?: () => React.ReactNode;
}

// Data source configuration type
interface DataSourceConfig {
  type: string;
  icon: typeof HardDrive;
  color: string;
  bgGradient: string;
  connectedColor: string;
  settingsUrl?: string;
  isInternal?: boolean;
  subTab?: DataSourceSubTab;
}

// Data source type configurations (name/description via i18n)
const DATA_SOURCE_CONFIGS: DataSourceConfig[] = [
  {
    type: 'GOOGLE_DRIVE',
    icon: HardDrive,
    color: 'text-green-600',
    bgGradient: 'from-green-50/50 to-transparent',
    connectedColor: 'bg-green-100 text-green-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'google-drive',
  },
  {
    type: 'NOTION',
    icon: FileText,
    color: 'text-gray-600',
    bgGradient: 'from-gray-50/50 to-transparent',
    connectedColor: 'bg-gray-100 text-gray-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'notion',
  },
  {
    type: 'FEISHU',
    icon: Zap,
    color: 'text-blue-600',
    bgGradient: 'from-blue-50/50 to-transparent',
    connectedColor: 'bg-blue-100 text-blue-700',
    settingsUrl: '/profile?tab=integrations',
    isInternal: false,
    subTab: 'feishu',
  },
  {
    type: 'BOOKMARK',
    icon: Bookmark,
    color: 'text-orange-600',
    bgGradient: 'from-orange-50/50 to-transparent',
    connectedColor: 'bg-orange-100 text-orange-700',
    isInternal: true,
    subTab: 'bookmarks',
  },
  {
    type: 'NOTE',
    icon: StickyNote,
    color: 'text-yellow-600',
    bgGradient: 'from-yellow-50/50 to-transparent',
    connectedColor: 'bg-yellow-100 text-yellow-700',
    isInternal: true,
    subTab: 'notes',
  },
  {
    type: 'IMAGE',
    icon: Image,
    color: 'text-pink-600',
    bgGradient: 'from-pink-50/50 to-transparent',
    connectedColor: 'bg-pink-100 text-pink-700',
    isInternal: true,
    subTab: 'images',
  },
  {
    type: 'UPLOAD',
    icon: Upload,
    color: 'text-blue-600',
    bgGradient: 'from-blue-50/50 to-transparent',
    connectedColor: 'bg-blue-100 text-blue-700',
    isInternal: true,
  },
  {
    type: 'URL',
    icon: LinkIcon,
    color: 'text-purple-600',
    bgGradient: 'from-purple-50/50 to-transparent',
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

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟`;
  if (diffHours < 24) return `${diffHours}小时`;
  return `${diffDays}天`;
}

/**
 * Personal Data Sources TAB
 * Displays user's connected data source status with sub-navigation
 */
export default function DataSourcesTab({
  initialSubTab = 'overview',
  onSubTabChange,
  renderBookmarks,
  renderNotes,
  renderImages,
  renderNotion,
  renderGoogleDrive,
  renderFeishu,
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
    try {
      const embeddingResponse = await fetch(
        `${config.apiUrl}/rag/embedding-config`,
        {
          headers: { ...getAuthHeader() },
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
    } catch {
      setRagServiceStatus((prev) => ({
        ...prev,
        embedding: {
          status: 'error',
          error: t('dataSources.errors.embeddingConnectionFailed'),
        },
      }));
    }

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
          }
        );

        if (gdResponse.ok) {
          const gdData = await gdResponse.json();
          const connection = gdData.connection;
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

      // Internal sources are always "connected"
      ['BOOKMARK', 'NOTE', 'IMAGE', 'UPLOAD', 'URL'].forEach((type) => {
        statuses[type] = {
          type,
          isConnected: true,
        };
      });

      setDataSourceStatuses(statuses);
    } catch (error) {
      logger.error('Failed to fetch data source statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (type: string) => {
    setSyncing(type);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchDataSourceStatuses();
    } catch (error) {
      logger.error(`Failed to sync ${type}:`, error);
    } finally {
      setSyncing(null);
    }
  };

  // Get connection status for badge
  const getConnectionStatus = (
    status: DataSourceStatus | undefined
  ): ConnectionStatus => {
    if (!status) return 'disconnected';
    if (status.needsReauth) return 'needs_reauth';
    if (status.lastError) return 'error';
    if (status.isConnected) return 'connected';
    return 'disconnected';
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
      case 'feishu':
        return renderFeishu ? renderFeishu() : <FeishuDataSourcePanel />;
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
      <div className="animate-fade-in space-y-8">
        {/* Header with RAG Status Indicator */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {t('dataSources.overviewTitle')}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('dataSources.overviewDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RAGStatusIndicator
              status={ragServiceStatus}
              onRefresh={fetchRAGServiceStatus}
            />
            <button
              onClick={fetchDataSourceStatuses}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow"
            >
              <RefreshCw className="h-4 w-4" />
              {t('dataSources.refreshStatus')}
            </button>
          </div>
        </div>

        {/* External Data Sources - 3 column grid */}
        <div>
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
            <ExternalLink className="h-4 w-4" />
            {t('dataSources.external')}
          </h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DATA_SOURCE_CONFIGS.filter((ds) => !ds.isInternal).map(
              (source) => {
                const Icon = source.icon;
                const status = dataSourceStatuses[source.type];
                const isConnected = status?.isConnected ?? false;
                const connectionStatus = getConnectionStatus(status);
                const isSyncing = syncing === source.type;

                return (
                  <div
                    key={source.type}
                    className={`
                      group relative overflow-hidden rounded-lg border bg-white p-5
                      shadow-sm transition-all duration-300
                      ease-out hover:-translate-y-1 hover:shadow-lg
                      ${
                        isConnected
                          ? 'border-green-200/60 shadow-green-100/50'
                          : status?.needsReauth
                            ? 'border-amber-200/60'
                            : 'border-gray-200'
                      }
                    `}
                  >
                    {/* Gradient background overlay for connected state */}
                    {isConnected && (
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${source.bgGradient} pointer-events-none`}
                      />
                    )}

                    {/* Status Badge - positioned at top right */}
                    <div className="absolute right-3 top-3">
                      <ConnectionStatusBadge
                        status={isSyncing ? 'syncing' : connectionStatus}
                      />
                    </div>

                    {/* Icon and Title */}
                    <div className="relative flex items-start gap-3">
                      <div
                        className={`
                          flex h-12 w-12 items-center justify-center rounded-lg
                          transition-transform duration-200 group-hover:scale-110
                          ${source.connectedColor}
                        `}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1 pr-20">
                        <h4 className="font-semibold text-gray-900">
                          {t(`dataSources.types.${source.type}.name`)}
                        </h4>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {t(`dataSources.types.${source.type}.description`)}
                        </p>
                      </div>
                    </div>

                    {/* Last Sync Time */}
                    {isConnected && status?.lastSyncAt && (
                      <div className="relative mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {t('dataSources.timeAgo', {
                            time: formatRelativeTime(status.lastSyncAt),
                          })}
                        </span>
                      </div>
                    )}

                    {/* Error Info */}
                    {status?.lastError && (
                      <p className="relative mt-2 line-clamp-1 text-xs text-amber-600">
                        {status.lastError}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="relative mt-4 flex items-center gap-2">
                      {isConnected ? (
                        <>
                          {source.subTab && (
                            <button
                              onClick={() =>
                                setActiveSubTab(
                                  source.subTab as DataSourceSubTab
                                )
                              }
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                            >
                              <FolderOpen className="h-4 w-4" />
                              {t('dataSources.browse')}
                            </button>
                          )}
                          {/* More actions dropdown button */}
                          <div className="relative">
                            <button
                              onClick={() => handleSync(source.type)}
                              disabled={isSyncing}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                              title={t('dataSources.moreActions')}
                            >
                              {isSyncing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </>
                      ) : status?.needsReauth ? (
                        <a
                          href={source.settingsUrl || '#'}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t('dataSources.reauthorize')}
                        </a>
                      ) : (
                        <a
                          href={source.settingsUrl || '#'}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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

        {/* Internal Data Sources - Vertical centered cards */}
        <div>
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
            <HardDrive className="h-4 w-4" />
            {t('dataSources.internal')}
          </h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {DATA_SOURCE_CONFIGS.filter((ds) => ds.isInternal).map((source) => {
              const Icon = source.icon;
              const hasSubTab = !!source.subTab;

              return (
                <button
                  key={source.type}
                  onClick={() =>
                    source.subTab &&
                    setActiveSubTab(source.subTab as DataSourceSubTab)
                  }
                  disabled={!hasSubTab}
                  className={`
                    group relative flex min-h-[140px] flex-col items-center justify-center
                    rounded-lg border bg-white p-5 text-center
                    transition-all duration-300 ease-out
                    ${
                      hasSubTab
                        ? 'cursor-pointer hover:-translate-y-1 hover:border-gray-300 hover:shadow-lg'
                        : 'cursor-default opacity-80'
                    }
                  `}
                >
                  {/* Arrow indicator for clickable cards */}
                  {hasSubTab && (
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <ArrowUpRight className="h-4 w-4 text-gray-400" />
                    </div>
                  )}

                  {/* Icon with hover scale effect */}
                  <div
                    className={`
                      flex h-12 w-12 items-center justify-center rounded-lg
                      transition-all duration-200 group-hover:scale-110
                      ${source.connectedColor}
                    `}
                  >
                    <Icon className="h-6 w-6" />
                  </div>

                  {/* Title */}
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    {t(`dataSources.types.${source.type}.name`)}
                  </p>

                  {/* Subtitle */}
                  <p className="mt-1 text-xs text-gray-500">
                    {hasSubTab
                      ? t('dataSources.clickToBrowse')
                      : source.type === 'UPLOAD'
                        ? t('dataSources.addContent')
                        : t('dataSources.importUrl')}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Help Section - Enhanced with gradient and numbered badges */}
        <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50/50 p-5">
          <div className="flex gap-4">
            {/* Icon container */}
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <HelpCircle className="h-5 w-5 text-blue-600" />
            </div>

            {/* Content */}
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900">
                {t('dataSources.howToUse')}
              </h4>
              <ul className="mt-3 space-y-2">
                {[1, 2, 3].map((num) => (
                  <li key={num} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-medium text-blue-800">
                      {num}
                    </span>
                    <span className="text-sm text-blue-800">
                      {t(`dataSources.howToUseHints.${num}`)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Learn more link */}
              <a
                href="#"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {t('common.learnMore')}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation with underline indicator */}
      <div className="relative border-b border-gray-200">
        <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`
                  relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium
                  transition-colors duration-200
                  ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-900'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                {tab.name}

                {/* Active underline indicator */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 animate-scale-in rounded-full
                    bg-blue-600 transition-all duration-300"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab Content */}
      {renderSubTabContent()}
    </div>
  );
}
