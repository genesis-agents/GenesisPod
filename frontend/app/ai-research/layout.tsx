'use client';

/**
 * AI Studio Layout
 * 使用全局可折叠 Sidebar
 *
 * ★ 禁用 SSR 以彻底避免 hydration 错误
 * AppShell/Sidebar 依赖 useAuth/useTranslation 等客户端状态
 */

import dynamic from 'next/dynamic';

// ★ 禁用 AppShell 的 SSR - 它包含 Sidebar，而 Sidebar 依赖客户端状态
const AppShell = dynamic(() => import('@/components/layout/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="border-3 h-10 w-10 animate-spin rounded-full border-gray-300 border-t-violet-600" />
    </div>
  ),
});

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <main className="flex-1 overflow-hidden">{children}</main>
    </AppShell>
  );
}
