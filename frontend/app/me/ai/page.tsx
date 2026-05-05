'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Key, Wand2, UserCog } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { UserApiKeysTab } from '@/components/profile/UserApiKeysTab';
import { UserModelsManagement } from '@/components/profile/UserModelsManagement';
import { MyAgentsTab } from '@/components/custom-agents/MyAgentsTab';

type Tab = 'keys' | 'models' | 'agents';

function parseTab(raw: string | null): Tab {
  if (raw === 'models') return 'models';
  if (raw === 'agents') return 'agents';
  return 'keys';
}

function MyAIContent() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    parseTab(searchParams?.get('tab') ?? null)
  );

  // Sync tab → URL ?tab=
  useEffect(() => {
    const current = searchParams?.get('tab');
    if (current !== tab) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', tab);
      router.replace(`/me/ai?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Redirect to home if not logged in
  useEffect(() => {
    if (!isLoading && !user) router.push('/');
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppShell>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sticky Header —— 对齐 AdminPageLayout 的 header 风格 */}
        <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25">
                <Bot className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {t('common.myAIConfig')}
                </h1>
                <p className="mt-0.5 text-sm text-gray-500">
                  {t('common.myAIConfigSubtitle')}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-6">
            {/* Tabs */}
            <div className="mb-6 flex items-center gap-1 border-b border-gray-200">
              <TabButton
                active={tab === 'keys'}
                onClick={() => setTab('keys')}
                icon={<Key className="h-4 w-4" />}
                label={t('common.apiKeys')}
              />
              <TabButton
                active={tab === 'models'}
                onClick={() => setTab('models')}
                icon={<Wand2 className="h-4 w-4" />}
                label={t('common.myModels')}
              />
              <TabButton
                active={tab === 'agents'}
                onClick={() => setTab('agents')}
                icon={<UserCog className="h-4 w-4" />}
                label="我的 Agent"
              />
            </div>

            {tab === 'keys' && <UserApiKeysTab />}
            {tab === 'models' && <UserModelsManagement />}
            {tab === 'agents' && <MyAgentsTab />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MyAIPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      }
    >
      <MyAIContent />
    </Suspense>
  );
}
