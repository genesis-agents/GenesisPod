'use client';

/**
 * AI Studio Layout
 * 使用全局可折叠 Sidebar
 */

import AppShell from '@/components/layout/AppShell';

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
