'use client';

import Link from 'next/link';
import {
  Settings,
  Globe,
  Shield,
  Mail,
  ArrowRight,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { cn } from '@/lib/utils/common';

interface SystemCard {
  id: string;
  titleKey: string;
  descriptionKey: string;
  href: string;
  icon: React.ElementType;
  status: 'configured' | 'pending' | 'warning';
  statusLabel: string;
}

const SYSTEM_CARDS: SystemCard[] = [
  {
    id: 'site',
    titleKey: 'admin.system.cards.site.title',
    descriptionKey: 'admin.system.cards.site.description',
    href: '/admin/system/site',
    icon: Globe,
    status: 'configured',
    statusLabel: 'Configured',
  },
  {
    id: 'security',
    titleKey: 'admin.system.cards.security.title',
    descriptionKey: 'admin.system.cards.security.description',
    href: '/admin/access/security',
    icon: Shield,
    status: 'configured',
    statusLabel: 'Active',
  },
  {
    id: 'email',
    titleKey: 'admin.system.cards.email.title',
    descriptionKey: 'admin.system.cards.email.description',
    href: '/admin/system/email',
    icon: Mail,
    status: 'pending',
    statusLabel: 'Not Configured',
  },
];

const STATUS_STYLES = {
  configured: {
    badge: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle,
  },
  pending: {
    badge: 'bg-gray-100 text-gray-600',
    icon: AlertCircle,
  },
  warning: {
    badge: 'bg-amber-100 text-amber-700',
    icon: AlertCircle,
  },
};

export default function SystemManagementPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout
      title={t('admin.nav.systemManagement')}
      description={t('admin.system.description')}
      icon={Settings}
      domain="system"
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SYSTEM_CARDS.map((card) => {
          const Icon = card.icon;
          const statusStyle = STATUS_STYLES[card.status];
          const StatusIcon = statusStyle.icon;

          return (
            <Link
              key={card.id}
              href={card.href}
              className="group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                  <Icon className="h-6 w-6" />
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    statusStyle.badge
                  )}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {card.statusLabel}
                </span>
              </div>

              {/* Content */}
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                  {t(card.titleKey)}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-gray-500">
                  {t(card.descriptionKey)}
                </p>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center text-sm font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                <span>Configure</span>
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </AdminPageLayout>
  );
}
