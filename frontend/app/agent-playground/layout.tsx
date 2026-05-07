'use client';

import AppShell from '@/components/layout/AppShell';
import { MobileRedirectBanner } from '@/components/agent-playground/overhaul/MobileRedirectBanner';

export default function AgentPlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <main className="flex flex-1 flex-col overflow-hidden">
        <MobileRedirectBanner />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </main>
    </AppShell>
  );
}
