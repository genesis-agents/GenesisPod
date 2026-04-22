'use client';

import { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import { StorageInventoryPanel } from '@/components/admin/data-management';
import StorageSettings from '@/components/admin/settings/StorageSettings';

type TabKey = 'inventory' | 'providers';

export default function StorageAdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('inventory');

  return (
    <AdminPageLayout
      title={t('admin.nav.storage')}
      description="数据库体积、R2 对象存储用量、Off-load 迁移进度 + 存储 provider 配置"
      icon={HardDrive}
      domain="data"
      maxWidth="7xl"
    >
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('inventory')}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'inventory'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          存储清单
        </button>
        <button
          onClick={() => setTab('providers')}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'providers'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Provider 配置
        </button>
      </div>

      {tab === 'inventory' && <StorageInventoryPanel />}
      {tab === 'providers' && <StorageSettings />}
    </AdminPageLayout>
  );
}
