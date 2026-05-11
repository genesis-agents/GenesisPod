'use client';

import Link from 'next/link';
import {
  Settings,
  Globe,
  Shield,
  Mail,
  Radio,
  Activity,
  ScrollText,
  Bell,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { cn } from '@/lib/utils/common';

/**
 * 系统管理（L1 Infrastructure 4 卡之一）
 *
 * Wave 4 阶段：4 个子区，按运维动作划分：
 *   1. 运行监控（monitoring + logs）
 *   2. 消息通知（notifications + feedback）
 *   3. 基础设置（site + email + mcp-server）
 *   4. 安全审计（security）
 *
 * 子区以卡片链接到既有子页。后续可演进为 AdminTabs 内嵌。
 */

interface SystemSection {
  id: string;
  titleKey: string;
  descriptionKey: string;
  href: string;
  icon: LucideIcon;
  group: 'ops' | 'messages' | 'settings' | 'security';
}

const SECTIONS: SystemSection[] = [
  {
    id: 'monitoring',
    titleKey: 'admin.nav.monitoring',
    descriptionKey: 'admin.tabDescriptions.monitoring',
    href: '/admin/system/monitoring',
    icon: Activity,
    group: 'ops',
  },
  {
    id: 'logs',
    titleKey: 'admin.nav.logs',
    descriptionKey: 'admin.tabDescriptions.logs',
    href: '/admin/system/logs',
    icon: ScrollText,
    group: 'ops',
  },
  {
    id: 'notifications',
    titleKey: 'admin.nav.notifications',
    descriptionKey: 'admin.tabDescriptions.notifications',
    href: '/admin/system/notifications',
    icon: Bell,
    group: 'messages',
  },
  {
    id: 'feedback',
    titleKey: 'admin.nav.feedback',
    descriptionKey: 'admin.tabDescriptions.feedback',
    href: '/admin/feedback',
    icon: MessageSquare,
    group: 'messages',
  },
  {
    id: 'site',
    titleKey: 'admin.nav.site',
    descriptionKey: 'admin.tabDescriptions.site',
    href: '/admin/system/site',
    icon: Globe,
    group: 'settings',
  },
  {
    id: 'email',
    titleKey: 'admin.nav.email',
    descriptionKey: 'admin.tabDescriptions.email',
    href: '/admin/system/email',
    icon: Mail,
    group: 'settings',
  },
  {
    id: 'mcpServer',
    titleKey: 'admin.nav.mcpServer',
    descriptionKey: 'admin.tabDescriptions.mcpServer',
    href: '/admin/system/mcp-server',
    icon: Radio,
    group: 'settings',
  },
  {
    id: 'security',
    titleKey: 'admin.nav.security',
    descriptionKey: 'admin.tabDescriptions.security',
    href: '/admin/access/security',
    icon: ShieldCheck,
    group: 'security',
  },
];

const GROUPS: {
  id: SystemSection['group'];
  titleKey: string;
  descriptionKey: string;
}[] = [
  {
    id: 'ops',
    titleKey: 'admin.system.groups.ops',
    descriptionKey: 'admin.system.groups.opsDesc',
  },
  {
    id: 'messages',
    titleKey: 'admin.system.groups.messages',
    descriptionKey: 'admin.system.groups.messagesDesc',
  },
  {
    id: 'settings',
    titleKey: 'admin.system.groups.settings',
    descriptionKey: 'admin.system.groups.settingsDesc',
  },
  {
    id: 'security',
    titleKey: 'admin.system.groups.security',
    descriptionKey: 'admin.system.groups.securityDesc',
  },
];

export default function SystemManagementPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.systemManagement')}
      description={t('admin.system.description')}
      icon={Settings}
      domain="system"
    >
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const sections = SECTIONS.filter((s) => s.group === group.id);
          return (
            <section key={group.id}>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-gray-900">
                  {t(group.titleKey)}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {t(group.descriptionKey)}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      className={cn(
                        'group block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all',
                        'hover:border-slate-400 hover:shadow-md'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 group-hover:text-slate-800">
                            {t(section.titleKey)}
                          </h3>
                          <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">
                            {t(section.descriptionKey)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center text-sm font-medium text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                        <span>{t('common.open')}</span>
                        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AdminPageLayout>
  );
}
