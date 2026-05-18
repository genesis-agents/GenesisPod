'use client';

/**
 * /settings/notifications — 独立路由的通知偏好页（带 AppShell）
 *
 * UI 重构 2026-05-18：原 580 行 inline 实现已抽出为 NotificationPreferencesView
 * 共享组件，profile?tab=notifications 与本页共用同一组件。本页仅做 AppShell 壳 +
 * 面包屑（用户从 ai-radar drawer 跳过来时可返回个人资料）。
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { NotificationPreferencesView } from '@/components/settings/NotificationPreferencesView';

export default function NotificationsSettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-6">
        <Link
          href="/profile?tab=notifications"
          className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" />
          在个人资料中查看 / 编辑
        </Link>
        <NotificationPreferencesView showHeader />
      </div>
    </AppShell>
  );
}
