'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Settings,
  Activity,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { AdminTabs, type AdminTab } from '@/components/admin/shared';
import SystemSettings from '@/components/admin/settings/SystemSettings';
import EmailSettings from '@/components/admin/settings/EmailSettings';
import MonitoringPageContent from './monitoring/content';
import LogsPageContent from './logs/content';
import NotificationsPageContent from './notifications/content';
import MCPServerPageContent from './mcp-server/content';
import SecurityPageContent from '../access/security/content';
import FeedbackPageContent from '../feedback/content';

/**
 * 系统管理 Hub（L1 Infrastructure 4 卡之一）
 *
 * 2026-05-12 重构：从 dashboard 中转页改为 AdminTabs(mode='route') 直接聚合。
 * 旧子页 (/admin/system/{monitoring,logs,notifications,mcp-server,site,email}
 * 及 /admin/access/security, /admin/feedback) 通过 embedded 属性内嵌于此。
 *
 * 4 Tabs（按运维动作划分）：
 *   - ops:      运行监控 = monitoring + logs
 *   - settings: 基础配置 = site + email + mcp-server
 *   - messages: 消息中心 = notifications + feedback
 *   - security: 安全审计 = access/security
 */

type SystemTabKey = 'ops' | 'settings' | 'messages' | 'security';
const DEFAULT_TAB: SystemTabKey = 'ops';
const VALID_TABS: readonly SystemTabKey[] = [
  'ops',
  'settings',
  'messages',
  'security',
] as const;

function SystemHubInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const tabs: AdminTab[] = useMemo(
    () => [
      { key: 'ops', label: t('admin.system.tabs.ops'), icon: Activity },
      {
        key: 'settings',
        label: t('admin.system.tabs.settings'),
        icon: SlidersHorizontal,
      },
      { key: 'messages', label: t('admin.system.tabs.messages'), icon: Bell },
      {
        key: 'security',
        label: t('admin.system.tabs.security'),
        icon: ShieldCheck,
      },
    ],
    [t]
  );

  const rawTab = searchParams?.get('tab');
  const activeTab: SystemTabKey = (VALID_TABS as readonly string[]).includes(
    rawTab ?? ''
  )
    ? (rawTab as SystemTabKey)
    : DEFAULT_TAB;

  return (
    <AdminPageLayout
      title={t('admin.nav.systemManagement')}
      description={t('admin.system.description')}
      icon={Settings}
      domain="system"
    >
      <div className="space-y-6">
        <AdminTabs tabs={tabs} mode="route" paramName="tab" />

        {activeTab === 'ops' && (
          <div className="space-y-8">
            <MonitoringPageContent embedded />
            <div className="border-t border-gray-200 pt-8">
              <LogsPageContent embedded />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8">
            <SystemSettings />
            <div className="border-t border-gray-200 pt-8">
              <EmailSettings />
            </div>
            <div className="border-t border-gray-200 pt-8">
              <MCPServerPageContent embedded />
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="space-y-8">
            <NotificationsPageContent embedded />
            <div className="border-t border-gray-200 pt-8">
              <FeedbackPageContent embedded />
            </div>
          </div>
        )}

        {activeTab === 'security' && <SecurityPageContent embedded />}
      </div>
    </AdminPageLayout>
  );
}

export default function SystemManagementPage() {
  return (
    <Suspense fallback={null}>
      <SystemHubInner />
    </Suspense>
  );
}
