'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/lib/i18n';
import AIToolsTab from '@/components/ai-marketplace/AIToolsTab';
import AISkillsTab from '@/components/ai-marketplace/AISkillsTab';

type TabType = 'tools' | 'skills';

function AIMarketplaceContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get('tab') as TabType) || 'tools';

  const setActiveTab = (tab: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <AppShell>
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-50 to-white">
        {/* Header */}
        <div className="border-b border-gray-100 bg-white px-8 pb-0 pt-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {t('aiMarketplace.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('aiMarketplace.subtitle')}
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('tools')}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'tools'
                  ? 'text-cyan-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('aiMarketplace.tabs.tools')}
              {activeTab === 'tools' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'skills'
                  ? 'text-violet-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('aiMarketplace.tabs.skills')}
              {activeTab === 'skills' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1">
          {activeTab === 'tools' && <AIToolsTab />}
          {activeTab === 'skills' && <AISkillsTab />}
        </div>
      </div>
    </AppShell>
  );
}

export default function AIMarketplacePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-cyan-600" />
          </div>
        </AppShell>
      }
    >
      <AIMarketplaceContent />
    </Suspense>
  );
}
