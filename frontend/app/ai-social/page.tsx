'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { LogIn, Share2, Link2, FileText, Bot, ShieldAlert } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SocialErrorFallback } from '@/components/ai-social/SocialErrorFallback';
import ConnectionsTab from '@/components/ai-social/ConnectionsTab';
import ContentsTab from '@/components/ai-social/ContentsTab';
import { AnimatePresence } from 'framer-motion';
import { SlideIn } from '@/components/ui/animations';

type TabType = 'connections' | 'contents';

/**
 * AI Social 页面
 * 将内容发布到社交媒体平台（微信公众号、小红书等）
 * 仅管理员可见
 *
 * URL ?tab=connections / ?tab=contents 支持深链（AccountSelector "Connect Account"
 * 按钮 / 外部分享都靠这个）。不带参或非法值默认 'contents'。
 */
export default function AISocialPage() {
  const { user, isLoading, isAdmin, loginWithGoogle } = useAuth();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const initialTab: TabType =
    searchParams?.get('tab') === 'connections' ? 'connections' : 'contents';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-t-transparent" />
          <p className="text-gray-500">{t('aiSocial.loading')}</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/25">
                <Share2 className="h-10 w-10 text-white" />
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              {t('aiSocial.signIn.title')}
            </h1>
            <p className="mb-8 text-gray-500">
              {t('aiSocial.signIn.description')}
            </p>
            <button
              onClick={loginWithGoogle}
              className="inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:shadow-xl hover:shadow-rose-500/30"
            >
              <LogIn className="h-5 w-5" />
              {t('aiSocial.signIn.button')}
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <AppShell>
        <main className="flex flex-1 items-center justify-center">
          <div className="mx-auto max-w-md text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-400 to-gray-500 shadow-lg shadow-gray-500/25">
                <ShieldAlert className="h-10 w-10 text-white" />
              </div>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              {t('aiSocial.accessDenied.title')}
            </h1>
            <p className="mb-8 text-gray-500">
              {t('aiSocial.accessDenied.description')}
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  const tabs = [
    {
      id: 'contents' as TabType,
      label: t('aiSocial.tabs.contents'),
      icon: FileText,
    },
    {
      id: 'connections' as TabType,
      label: t('aiSocial.tabs.connections'),
      icon: Link2,
    },
  ];

  return (
    <AppShell>
      <ErrorBoundary
        fallback={
          <SocialErrorFallback
            onReset={() => window.location.reload()}
            onReload={() => window.location.reload()}
            onGoHome={() => (window.location.href = '/')}
          />
        }
      >
        <main className="flex-1 overflow-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
            <div className="px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/25">
                    <Share2 className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold text-gray-900">
                        {t('aiSocial.title')}
                      </h1>
                      <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
                        <Bot className="h-3 w-3" />
                        AI
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {t('aiSocial.subtitle')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-6 flex gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-rose-100 text-rose-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'connections' && (
                <SlideIn key="connections" direction="left">
                  <ConnectionsTab />
                </SlideIn>
              )}
              {activeTab === 'contents' && (
                <SlideIn key="contents" direction="right">
                  <ContentsTab />
                </SlideIn>
              )}
            </AnimatePresence>
          </div>
        </main>
      </ErrorBoundary>
    </AppShell>
  );
}
