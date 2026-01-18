'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Bot,
  Database,
  ShieldCheck,
  Globe,
  ArrowRight,
  Settings,
  Users,
  Key,
  Mail,
  HardDrive,
  Wrench,
  Plug,
  Shield,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { ADMIN_COLORS } from '@/lib/admin/styles';

interface QuickLinkItem {
  labelKey: string;
  href: string;
  icon: React.ElementType;
  descriptionKey: string;
}

interface QuickLinkSection {
  titleKey: string;
  domain: 'ai' | 'data' | 'access' | 'system';
  icon: React.ElementType;
  items: QuickLinkItem[];
}

const QUICK_LINKS: QuickLinkSection[] = [
  {
    titleKey: 'admin.nav.aiConfig',
    domain: 'ai',
    icon: Bot,
    items: [
      {
        labelKey: 'admin.nav.models',
        href: '/admin/ai/models',
        icon: Bot,
        descriptionKey: 'admin.tabDescriptions.aiModels',
      },
      {
        labelKey: 'admin.nav.teams',
        href: '/admin/ai/teams',
        icon: UsersRound,
        descriptionKey: 'admin.tabDescriptions.aiTeams',
      },
      {
        labelKey: 'admin.nav.capabilities',
        href: '/admin/ai/capabilities',
        icon: Wrench,
        descriptionKey: 'admin.tabDescriptions.capabilities',
      },
      {
        labelKey: 'admin.nav.externalServices',
        href: '/admin/ai/external-services',
        icon: Plug,
        descriptionKey: 'admin.tabDescriptions.externalApi',
      },
    ],
  },
  {
    titleKey: 'admin.nav.dataManagement',
    domain: 'data',
    icon: Database,
    items: [
      {
        labelKey: 'admin.nav.collection',
        href: '/admin/data/collection',
        icon: Database,
        descriptionKey: 'admin.tabDescriptions.collection',
      },
      {
        labelKey: 'admin.nav.whitelists',
        href: '/admin/data/whitelists',
        icon: Shield,
        descriptionKey: 'admin.tabDescriptions.whitelists',
      },
      {
        labelKey: 'admin.nav.quality',
        href: '/admin/data/quality',
        icon: Sparkles,
        descriptionKey: 'admin.tabDescriptions.quality',
      },
    ],
  },
  {
    titleKey: 'admin.nav.accessControl',
    domain: 'access',
    icon: ShieldCheck,
    items: [
      {
        labelKey: 'admin.nav.users',
        href: '/admin/access/users',
        icon: Users,
        descriptionKey: 'admin.tabDescriptions.users',
      },
      {
        labelKey: 'admin.nav.secrets',
        href: '/admin/access/secrets',
        icon: Key,
        descriptionKey: 'admin.tabDescriptions.secrets',
      },
      {
        labelKey: 'admin.nav.security',
        href: '/admin/access/security',
        icon: ShieldCheck,
        descriptionKey: 'admin.tabDescriptions.security',
      },
    ],
  },
  {
    titleKey: 'admin.nav.systemSettings',
    domain: 'system',
    icon: Globe,
    items: [
      {
        labelKey: 'admin.nav.site',
        href: '/admin/system/site',
        icon: Globe,
        descriptionKey: 'admin.tabDescriptions.site',
      },
      {
        labelKey: 'admin.nav.email',
        href: '/admin/system/email',
        icon: Mail,
        descriptionKey: 'admin.tabDescriptions.email',
      },
      {
        labelKey: 'admin.nav.storage',
        href: '/admin/system/storage',
        icon: HardDrive,
        descriptionKey: 'admin.tabDescriptions.storage',
      },
    ],
  },
];

export default function OverviewPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.overview.title')}
      description={t('admin.overview.subtitle')}
      icon={LayoutDashboard}
      domain="overview"
    >
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <Settings className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {t('admin.overview.welcome')}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {t('admin.overview.welcomeDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {QUICK_LINKS.map((section) => {
            const colors = ADMIN_COLORS[section.domain];
            const SectionIcon = section.icon;

            return (
              <div
                key={section.domain}
                className="rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                {/* Section Header */}
                <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                  <div className={`rounded-lg p-2 ${colors.bg}`}>
                    <SectionIcon className={`h-5 w-5 ${colors.icon}`} />
                  </div>
                  <h3 className="font-semibold text-gray-900">
                    {t(section.titleKey)}
                  </h3>
                </div>

                {/* Section Items */}
                <div className="divide-y divide-gray-50">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50"
                      >
                        <ItemIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {t(item.labelKey)}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {t(item.descriptionKey)}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminPageLayout>
  );
}
