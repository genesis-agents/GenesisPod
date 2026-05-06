'use client';

import AppShell from '@/components/layout/AppShell';

export default function CustomAgentsLayout({
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
