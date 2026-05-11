'use client';

import { useState } from 'react';
import { Bot, Plus, Sparkles, Settings2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AIModelSettings from '@/components/admin/ai-config/AIModelSettings';
import SystemModelInventoryPanel from '@/components/admin/ai-config/SystemModelInventoryPanel';
import { ProviderDiscoverModal } from '@/components/admin/ai-config/ProviderDiscoverModal';
import { BYOKDictionaryModal } from '@/components/admin/ai-config/BYOKDictionaryModal';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

export default function AIModelsPage() {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showDictionary, setShowDictionary] = useState(false);

  const handleDiscoverConfirm = async (payload: {
    endpoint: string;
    apiKey: string;
    apiFormat: string;
    selected: Array<{ modelId: string; modelType: string }>;
  }) => {
    // 批量调 /admin/ai-models POST 创建（沿用现有 admin AIModel CRUD endpoint）
    for (const item of payload.selected) {
      try {
        await fetch(`${config.apiBaseUrl}/admin/ai-models`, {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.modelId,
            provider: 'custom',
            modelId: item.modelId,
            modelType: item.modelType,
            displayName: item.modelId,
            apiEndpoint: payload.endpoint,
            apiFormat: payload.apiFormat,
            isEnabled: true,
            isDefault: false,
          }),
        });
      } catch (err) {
        logger.error('[discover] create model failed', item.modelId, err);
      }
    }
    window.location.reload();
  };

  return (
    <AdminPageLayout
      title={t('admin.nav.models')}
      description={t('admin.tabDescriptions.aiModels')}
      icon={Bot}
      domain="ai"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDictionary(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="管理 BYOK 字典：AI Providers / API Formats / Model Types"
          >
            <Settings2 className="h-5 w-5" />
            字典管理
          </button>
          <button
            onClick={() => setShowDiscoverModal(true)}
            className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <Sparkles className="h-5 w-5" />
            AI 一键配置
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus className="h-5 w-5" />
            Add Model
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 系统模型全景：按 type/provider 分布 + 用户配置 + 24h 调用指标 */}
        <SystemModelInventoryPanel />

        <AIModelSettings
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />

        <ProviderDiscoverModal
          open={showDiscoverModal}
          onClose={() => setShowDiscoverModal(false)}
          onConfirm={handleDiscoverConfirm}
        />

        <BYOKDictionaryModal
          open={showDictionary}
          onClose={() => setShowDictionary(false)}
        />
      </div>
    </AdminPageLayout>
  );
}
