'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Check, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  getConnections,
  getConnectUrl,
  disconnectNotion,
  NotionConnection,
} from '@/services/notion/api';
import { GoogleDriveConnectionCard } from '@/components/library/integrations/google-drive/GoogleDriveConnectionCard';
import { FeishuBindingCard } from '@/components/library/integrations/feishu/FeishuBindingCard';
import ClientDate from '@/components/common/ClientDate';
import { SettingsSectionCard } from '@/components/common/cards/SettingsSectionCard';
import { logger } from '@/lib/utils/logger';

const NotionLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.62c-.094-.42.14-1.026.793-1.073l3.456-.233 4.763 7.279V9.014l-1.215-.14c-.093-.513.28-.886.747-.933l3.223-.186z" />
  </svg>
);

/**
 * 集成 /me/integrations — Notion / Google Drive / 飞书 连接器。
 * Notion 状态机内联（多工作区）；Drive / 飞书 复用现成卡片。从 profile god-page 抽出。
 */
export function IntegrationsSection() {
  const { t } = useTranslation();
  const [notionConnections, setNotionConnections] = useState<
    NotionConnection[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getConnections();
      setNotionConnections(result.connections);
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await getConnectUrl();
      window.location.href = result.url;
    } catch (error) {
      logger.error('Failed to connect Notion:', error);
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm(t('profile.integrations.disconnectConfirm'))) return;
    try {
      await disconnectNotion(connectionId);
      await fetchIntegrations();
    } catch (error) {
      logger.error('Failed to disconnect Notion:', error);
    }
  };

  const notionConnected = notionConnections.length > 0;

  return (
    <div className="space-y-6">
      {/* Notion */}
      <SettingsSectionCard
        icon={
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900">
            <NotionLogo className="h-7 w-7 text-white" />
          </div>
        }
        title={t('profile.integrations.notionIntegration')}
        description={t('profile.integrations.notionDesc')}
        action={
          notionConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" />
              {notionConnections.length} {t('me.integrations.workspaces')}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              {t('me.integrations.notConnected')}
            </span>
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : notionConnected ? (
          <div className="space-y-4">
            <div className="space-y-3">
              {notionConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center gap-3">
                    {conn.workspaceIcon &&
                    conn.workspaceIcon.startsWith('http') ? (
                      <img
                        src={conn.workspaceIcon}
                        alt=""
                        className="h-8 w-8 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100">
                        <NotionLogo className="h-5 w-5 text-gray-500" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">
                        {conn.workspaceName || 'Notion Workspace'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {conn.pagesCount || 0} {t('me.integrations.pages')}
                        {conn.lastSyncAt && (
                          <>
                            {' · '}
                            <ClientDate date={conn.lastSyncAt} format="date" />
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    {t('profile.integrations.disconnect')}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                {t('profile.integrations.addWorkspace')}
              </button>
              <Link
                href="/library?tab=notion"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                {t('profile.integrations.viewNotionPages')}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <NotionLogo className="h-4 w-4" />
            )}
            {t('profile.integrations.connectNotion')}
          </button>
        )}
      </SettingsSectionCard>

      {/* Google Drive */}
      <GoogleDriveConnectionCard />

      {/* 飞书 */}
      <FeishuBindingCard />
    </div>
  );
}
