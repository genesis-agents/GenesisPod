'use client';

import { useState } from 'react';
import { Bot, Plus, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';
import AIModelSettings from '@/components/admin/ai-config/AIModelSettings';
import SystemModelInventoryPanel from '@/components/admin/ai-config/SystemModelInventoryPanel';
import { AIProvidersSettings } from '@/components/admin/ai-config/AIProvidersSettings';
import { ApiFormatsSettings } from '@/components/admin/ai-config/ApiFormatsSettings';
import { ModelTypesSettings } from '@/components/admin/ai-config/ModelTypesSettings';
import { ProviderDiscoverModal } from '@/components/admin/ai-config/ProviderDiscoverModal';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

type SectionKey = 'providers' | 'apiFormats' | 'modelTypes';

export default function AIModelsPage() {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    providers: false,
    apiFormats: false,
    modelTypes: false,
  });

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

  const toggle = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const sections: Array<{
    key: SectionKey;
    title: string;
    desc: string;
    render: () => JSX.Element;
  }> = [
    {
      key: 'providers',
      title: 'AI Providers（数据驱动）',
      desc: '添加任意新 provider 立刻可用，无需改代码',
      render: () => <AIProvidersSettings />,
    },
    {
      key: 'apiFormats',
      title: 'API Formats',
      desc: '4 内置 + 自定义 OpenAI-兼容微调',
      render: () => <ApiFormatsSettings />,
    },
    {
      key: 'modelTypes',
      title: 'Model Types',
      desc: '11 内置 + 自定义类型',
      render: () => <ModelTypesSettings />,
    },
  ];

  return (
    <AdminPageLayout
      title={t('admin.nav.models')}
      description={t('admin.tabDescriptions.aiModels')}
      icon={Bot}
      domain="ai"
      actions={
        <div className="flex items-center gap-2">
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

        {/* 2026-05-11 P8: 三个 admin 字典维护页（数据驱动 BYOK） */}
        <div className="space-y-3">
          {sections.map((s) => (
            <div
              key={s.key}
              className="rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggle(s.key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expanded[s.key] ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {s.title}
                    </h3>
                    <p className="text-xs text-gray-500">{s.desc}</p>
                  </div>
                </div>
              </button>
              {expanded[s.key] && (
                <div className="border-t border-gray-200 p-4">{s.render()}</div>
              )}
            </div>
          ))}
        </div>

        <AIModelSettings
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
        />

        <ProviderDiscoverModal
          open={showDiscoverModal}
          onClose={() => setShowDiscoverModal(false)}
          onConfirm={handleDiscoverConfirm}
        />
      </div>
    </AdminPageLayout>
  );
}
