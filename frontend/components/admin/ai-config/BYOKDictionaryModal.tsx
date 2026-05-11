'use client';

/**
 * BYOKDictionaryModal —— 2026-05-11 字典管理 Modal
 *
 * 把 BYOK 数据驱动的 3 个字典维护 (AI Providers / API Formats / Model Types)
 * 收纳进一个按钮触发的 Modal，避免在 /admin/ai/models 主页面平铺三个折叠面板
 * 占空间 + 不专业。
 *
 * 风格：light-only + Lucide + 与 ProviderDiscoverModal / Add Model 视觉一致。
 */

import { useState } from 'react';
import { X, Globe, KeyRound, Tag } from 'lucide-react';
import { AIProvidersSettings } from './AIProvidersSettings';
import { ApiFormatsSettings } from './ApiFormatsSettings';
import { ModelTypesSettings } from './ModelTypesSettings';

type TabKey = 'providers' | 'apiFormats' | 'modelTypes';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: typeof Globe;
  desc: string;
}> = [
  {
    key: 'providers',
    label: 'AI Providers',
    icon: Globe,
    desc: '添加任意新 provider，立刻可用，无需改代码',
  },
  {
    key: 'apiFormats',
    label: 'API Formats',
    icon: KeyRound,
    desc: '4 内置 + 自定义 OpenAI 兼容微调',
  },
  {
    key: 'modelTypes',
    label: 'Model Types',
    icon: Tag,
    desc: '11 内置 + 自定义模型类型',
  },
];

export function BYOKDictionaryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('providers');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              BYOK 字典管理
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              数据驱动配置：admin 在此维护，前端表单自动出现，无需改代码
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 bg-gray-50 px-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active tab desc */}
        <div className="border-b border-gray-100 bg-blue-50/50 px-6 py-2 text-xs text-gray-600">
          {TABS.find((t) => t.key === activeTab)?.desc}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto bg-white p-6">
          {activeTab === 'providers' && <AIProvidersSettings />}
          {activeTab === 'apiFormats' && <ApiFormatsSettings />}
          {activeTab === 'modelTypes' && <ModelTypesSettings />}
        </div>
      </div>
    </div>
  );
}
