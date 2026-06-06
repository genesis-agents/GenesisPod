'use client';

/**
 * Industry Chain layout — wraps the landing + viewer in the global AppShell
 * (collapsible Sidebar) so the feature is a first-class app entry, consistent
 * with ai-research / ai-insights / etc.
 */

import AppShell from '@/components/layout/AppShell';

export default function IndustryChainLayout({
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
