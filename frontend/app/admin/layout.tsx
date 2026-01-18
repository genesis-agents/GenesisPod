'use client';

import AppShell from '@/components/layout/AppShell';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {/* Main Content Area - Full width, no Admin sidebar/tabs */}
      <main className="flex h-full flex-1 flex-col overflow-hidden">
        {/* Page Content - Full width */}
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </AppShell>
  );
}
