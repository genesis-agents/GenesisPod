'use client';

import AppShell from '@/components/layout/AppShell';
import { AdminTabNav } from '@/components/admin/layout';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {/* Main Content Area - Full height flex column */}
      <main className="flex h-full flex-1 flex-col overflow-hidden">
        {/* Admin Tab Navigation */}
        <AdminTabNav />

        {/* Page Content */}
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </AppShell>
  );
}
