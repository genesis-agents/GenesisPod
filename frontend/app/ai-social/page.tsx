'use client';

/**
 * AI Social 主页（PR-4 UI 候选 A 单视图重构 2026-05-17）
 *
 * 设计稿：docs/architecture/ai-app/social/ui-redesign-2026-05-17.md
 * - 取消旧 3 tab 切换（内容管理 / Missions / 平台连接），单视图 = 内容列表
 * - 平台连接拆独立路由 /ai-social/connections（按工作流顺序入口前置）
 * - 点击列表行 → 右 480px slide-over `ContentDetailDrawer`：状态 / 发布表单 / 进度时间线
 * - 发布唯一路径 = runSocialMission（按 depth 派 13/4 stage pipeline），删旧双轨
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { LogIn, Share2, Link2, Bot, ShieldAlert } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SocialErrorFallback } from '@/components/ai-social/SocialErrorFallback';
import ContentsTab from '@/components/ai-social/ContentsTab';
import ContentDetailDrawer from '@/components/ai-social/ContentDetailDrawer';
import {
  getConnections,
  type SocialContent,
  type SocialPlatformConnection,
} from '@/services/ai-social/api';
import { logger } from '@/lib/utils/logger';

export default function AISocialPage() {
  const { user, isLoading, isAdmin } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  // PR-4: 单一视图 + slide-over drawer（替代旧 3 tab + 双发布路径）
  const [drawerContent, setDrawerContent] = useState<SocialContent | null>(
    null
  );
  const [connections, setConnections] = useState<SocialPlatformConnection[]>(
    []
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // 加载 connections 给 drawer 用（drawer 内部不重复请求）
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const resp = (await getConnections()) as
          | SocialPlatformConnection[]
          | { connections: SocialPlatformConnection[] };
        const list = Array.isArray(resp) ? resp : (resp.connections ?? []);
        setConnections(list);
      } catch (err) {
        logger.warn('[AISocialPage] getConnections failed:', err);
      }
    })();
  }, [user]);

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
              onClick={() => router.push('/login')}
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
          {/* Header（PR-4: 取消 3 tab，移除 SlideIn 动画包装；连接管理作头部链接） */}
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

                {/* 连接管理入口（旧 ConnectionsTab 拆独立路由） */}
                <button
                  type="button"
                  onClick={() => router.push('/ai-social/connections')}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Link2 className="h-4 w-4" />
                  连接管理 ({connections.filter((c) => c.isActive).length})
                </button>
              </div>
            </div>
          </div>

          {/* 主视图 = 内容列表（点 row 开 drawer） */}
          <div className="p-8">
            <ContentsTab
              key={refreshKey}
              onSelectContent={(content) => setDrawerContent(content)}
            />
          </div>

          {/* Slide-over drawer */}
          {drawerContent && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-40 bg-gray-900/30"
                onClick={() => setDrawerContent(null)}
              />
              <ContentDetailDrawer
                content={drawerContent}
                connections={connections}
                onClose={() => setDrawerContent(null)}
                onMissionStarted={() => {
                  // mission 启动后刷新列表（按状态过滤即时反映）
                  setRefreshKey((k) => k + 1);
                }}
              />
            </>
          )}
        </main>
      </ErrorBoundary>
    </AppShell>
  );
}
