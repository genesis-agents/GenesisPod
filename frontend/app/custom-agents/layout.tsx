'use client';

import AppShell from '@/components/layout/AppShell';

export default function CustomAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {/* flex flex-col + min-h-0：让子页面 MissionDetailFrame 的 flex-1
          高度链生效（与 ai-social/ai-radar/agent-playground 对齐） */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </AppShell>
  );
}
