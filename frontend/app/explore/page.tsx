'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import AppShell from '@/components/layout/AppShell';

// Lazy-load heavy component (4200+ lines)
const ExploreContent = dynamic(
  () => import('@/components/explore/core/ExploreContent'),
  {
    loading: () => (
      <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50">
        <div className="flex items-center justify-center py-40">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </main>
    ),
    ssr: false,
  }
);

export default function ExplorePage() {
  return (
    <AppShell className="relative w-screen overflow-hidden">
      <Suspense
        fallback={
          <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50">
            <div className="flex items-center justify-center py-40">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          </main>
        }
      >
        <ExploreContent />
      </Suspense>
    </AppShell>
  );
}
