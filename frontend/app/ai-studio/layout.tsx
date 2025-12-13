'use client';

/**
 * AI Studio Layout
 * 使用全局可折叠 Sidebar
 */

import Sidebar from '@/components/layout/Sidebar';

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
