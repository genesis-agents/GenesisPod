'use client';

import { Suspense } from 'react';
import ExploreContent from '@/components/explore/ExploreContent';

function ExplorePageContent() {
  // ExploreContent handles the id parameter internally
  // When id is present, it loads the resource and shows detail view
  return <ExploreContent />;
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <ExplorePageContent />
    </Suspense>
  );
}
