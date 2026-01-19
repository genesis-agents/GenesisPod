'use client';

import { useState } from 'react';
import { AdminPageLayout } from '@/components/admin/layout';
import DatabaseManagement from '@/components/admin/DatabaseManagement';
import { DataManagementDashboard } from '@/components/admin/data-management/DataManagementDashboard';
import { Database, Settings } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

type TabType = 'collection' | 'storage';

export default function Page() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('storage');

  return (
    <AdminPageLayout
      title={t('admin.nav.dataManagement')}
      description={t('admin.tabDescriptions.dataManagement')}
      icon={Database}
      domain="data"
    >
      {/* Tab Navigation */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'storage'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          <Database className="h-4 w-4" />
          数据库存储
        </button>
        <button
          onClick={() => setActiveTab('collection')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'collection'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
          }`}
        >
          <Settings className="h-4 w-4" />
          数据采集
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'storage' && <DatabaseManagement />}
      {activeTab === 'collection' && (
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <DataManagementDashboard />
        </div>
      )}
    </AdminPageLayout>
  );
}
