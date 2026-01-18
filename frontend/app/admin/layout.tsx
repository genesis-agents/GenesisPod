'use client';

import AppShell from '@/components/layout/AppShell';
import { AdminTabNav } from '@/components/admin/layout';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell hideSidebar>
      <div className="flex h-full w-full flex-col overflow-hidden">
        {/* Tab 导航 */}
        <AdminTabNav />

        {/* 主内容区域 */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </AppShell>
  );
}
