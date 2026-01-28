'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useTranslation } from '@/lib/i18n';
import AIToolsTab from '@/components/ai-store/AIToolsTab';
import AISkillsTab from '@/components/ai-store/AISkillsTab';

type TabType = 'tools' | 'skills';

function AIStoreContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams?.get('tab') as TabType) || 'tools';

  const setActiveTab = (tab: TabType) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto">
        {/* Header - Sticky */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
                <svg
                  className="h-7 w-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('aiStore.title')}
                </h1>
                <p className="text-sm text-gray-500">{t('aiStore.subtitle')}</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="mt-4 flex gap-1">
              <button
                onClick={() => setActiveTab('tools')}
                className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'tools'
                    ? 'text-cyan-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('aiStore.tabs.tools')}
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
                {t('aiStore.tabs.skills')}
                {activeTab === 'skills' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1">
          {activeTab === 'tools' && <AIToolsTab />}
          {activeTab === 'skills' && <AISkillsTab />}
        </div>
      </main>
    </AppShell>
  );
}

export default function AIStorePage() {
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
      <AIStoreContent />
    </Suspense>
  );
}
