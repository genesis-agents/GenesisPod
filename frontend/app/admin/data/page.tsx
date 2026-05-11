'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Database,
  HardDrive,
  Layers,
  Compass,
  Shield,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { AdminTabs, type AdminTab } from '@/components/admin/shared';
import {
  StorageInventoryPanel,
  TableManagementContent,
  BrokenResourcesCard,
} from '@/components/admin/data-management';
import DataQualityManagement from '@/components/admin/data-management/DataQualityManagement';
import WhitelistManagement from '@/components/admin/WhitelistManagement';

/**
 * 数据管理（L1 Infrastructure 4 卡之一）
 *
 * Wave 4 精化（2026-05-11）：从 dashboard-card → AdminTabs 内嵌形态。
 * 4 Tab 按数据生命周期组织：源 → 存储 → 资产 → 治理。
 *
 * 子路由（/admin/storage、/admin/data-management、/admin/resources、/admin/data/{collection,whitelists,quality}）
 * 保留可用作 deep-link 兜底（独立页含 AdminPageLayout 包装）。
 */

type DataTab = 'sources' | 'storage' | 'assets' | 'governance';

function DataPageInner() {
  const { t } = useTranslation();
  const tabs: AdminTab[] = [
    { key: 'sources', label: t('admin.data.groups.source'), icon: Compass },
    { key: 'storage', label: t('admin.data.groups.storage'), icon: HardDrive },
    { key: 'assets', label: t('admin.data.groups.asset'), icon: Layers },
    {
      key: 'governance',
      label: t('admin.data.groups.governance'),
      icon: Sparkles,
    },
  ];

  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab');
  const tab: DataTab =
    rawTab === 'storage' ||
    rawTab === 'assets' ||
    rawTab === 'governance' ||
    rawTab === 'sources'
      ? rawTab
      : 'sources';

  return (
    <AdminPageLayout
      title={t('admin.nav.dataManagementHub')}
      description={t('admin.data.description')}
      icon={Database}
      domain="data"
    >
      <div className="mb-6">
        <AdminTabs tabs={tabs} mode="route" />
      </div>

      {tab === 'sources' && (
        <div className="space-y-6">
          {/* 白名单 */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              <h2 className="text-base font-semibold text-gray-900">
                {t('admin.nav.whitelists')}
              </h2>
            </div>
            <WhitelistManagement />
          </section>

          {/* 采集源链接到独立页（页面内容较复杂，未在 Tab 内嵌） */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-base font-semibold text-gray-900">
                    {t('admin.nav.collection')}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {t('admin.tabDescriptions.collection')}
                </p>
              </div>
              <Link
                href="/admin/data/collection"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
              >
                {t('common.open')}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </div>
      )}

      {tab === 'storage' && <StorageInventoryPanel />}

      {tab === 'assets' && <TableManagementContent />}

      {tab === 'governance' && (
        <div className="space-y-6">
          <BrokenResourcesCard />
          <DataQualityManagement />
        </div>
      )}
    </AdminPageLayout>
  );
}

export default function DataManagementPage() {
  return (
    <Suspense fallback={null}>
      <DataPageInner />
    </Suspense>
  );
}
