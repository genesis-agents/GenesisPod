'use client';

import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AIModelSettings from '@/components/admin/ai-config/AIModelSettings';
import { AutoConfigureButton } from '@/components/shared/model-config/AutoConfigureButton';

export default function AIModelsPage() {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AdminPageLayout
      title={t('admin.nav.models')}
      description={t('admin.tabDescriptions.aiModels')}
      icon={Bot}
      domain="ai"
      actions={
        <div className="flex items-center gap-2">
          <AutoConfigureButton
            endpoint="/admin/ai-models/auto-configure"
            disabledReason="先为任一 Provider 配置一个模型（作为 Key 发现源）"
            confirmSubtitle="基于现有 AIModel 里的 Key 扫描 Provider /v1/models"
            bullets={[
              '遍历现有 AIModel 表，按 provider 聚合可用的 apiKey / secretKey',
              '调 Provider 的 /v1/models 拉最新模型列表',
              '按推荐矩阵为每个 modelType 选 modelId；命中即创建 AIModel',
              '每个 modelType 第一个命中自动设为系统默认 (isDefault)',
              '已存在的 (provider, modelId) 不会重复创建',
            ]}
            successNote="结果可以随时在下方列表里编辑、删除或改默认；推荐矩阵可在「推荐矩阵」Tab 编辑。"
            onDone={() => setRefreshKey((k) => k + 1)}
          />
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
      <AIModelSettings
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        refreshKey={refreshKey}
      />
    </AdminPageLayout>
  );
}
