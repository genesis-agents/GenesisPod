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
import { LogIn, Share2, Link2, ShieldAlert } from 'lucide-react';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { useTranslation } from '@/lib/i18n';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SocialErrorFallback } from '@/components/ai-social/feedback/SocialErrorFallback';
import TasksTab from '@/components/ai-social/tabs/TasksTab';
import { LoadingState } from '@/components/ui/states';
import {
  getConnections,
  type SocialPlatformConnection,
} from '@/services/ai-social/api';
import { logger } from '@/lib/utils/logger';

export default function AISocialPage() {
  const { user, isLoading, isAdmin } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  // PR-V5: 意图驱动重设计 — 单一 TasksTab 列表 + NewTaskDialog 弹窗
  // ContentDetailDrawer 移到 /mission/[taskId] 详情页（PR-V7），列表点击行 → 跳详情
  const [connections, setConnections] = useState<SocialPlatformConnection[]>(
    []
  );

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
    return <LoadingState fullScreen text={t('aiSocial.loading')} />;
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
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
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center">
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
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <SocialErrorFallback
          onReset={() => window.location.reload()}
          onReload={() => window.location.reload()}
          onGoHome={() => (window.location.href = '/')}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* Header（PR-4: 取消 3 tab，移除 SlideIn 动画包装；连接管理作头部链接） */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <PageHeaderHero
            title={t('aiSocial.title')}
            subtitle={t('aiSocial.subtitle')}
            icon={<Share2 className="h-7 w-7 text-white" />}
            iconGradient="from-rose-500 to-pink-600"
            iconShadowClass="shadow-rose-500/25"
            actions={
              <button
                type="button"
                onClick={() => router.push('/ai-social/connections')}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Link2 className="h-4 w-4" />
                {t('aiSocial.connectionsLink')} (
                {connections.filter((c) => c.isActive).length})
              </button>
            }
          />
        </div>

        {/* 主视图 = 任务列表（点 row 跳 /mission/[taskId]）*/}
        <div className="p-8">
          <TasksTab />
        </div>
      </div>
    </ErrorBoundary>
  );
}
