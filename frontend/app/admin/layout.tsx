'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import { AdminSidebar } from '@/components/admin/layout';

const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load sidebar state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true');
    }
  }, []);

  // Save sidebar state to localStorage
  const handleCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  };

  return (
    <AppShell>
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleCollapsedChange}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </AppShell>
  );
}
