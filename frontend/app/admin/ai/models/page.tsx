'use client';

import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AIModelSettings from '@/components/admin/ai-config/AIModelSettings';
import SystemModelInventoryPanel from '@/components/admin/ai-config/SystemModelInventoryPanel';

export default function AIModelsPage() {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <AdminPageLayout
      title={t('admin.nav.models')}
      description={t('admin.tabDescriptions.aiModels')}
      icon={Bot}
      domain="ai"
      actions={
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          Add Model
        </button>
      }
    >
      <div className="space-y-6">
        {/* 系统模型全景：按 type/provider 分布 + 用户配置 + 24h 调用指标 */}
        <SystemModelInventoryPanel />

        <AIModelSettings
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />
      </div>
    </AdminPageLayout>
  );
}
