'use client';

/**
 * AI Radar Layout —— 全局 Sidebar wrapper
 *
 * 严格对齐 ai-insights / ai-research / agent-playground / custom-agents / admin
 * 范式：每个 ai-app 模块顶层用 AppShell wrap，让左侧 Sidebar + MobileNav 保留
 * 在所有子页（列表 + 详情）。
 */

import AppShell from '@/components/layout/AppShell';

export default function RadarLayout({
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
