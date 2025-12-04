'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ExploreContent from '@/components/explore/ExploreContent';

function ExplorePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  useEffect(() => {
    // Legacy URL with id parameter - redirect to resource page
    if (id) {
      router.replace(`/resource/${id}`);
    }
  }, [id, router]);

  // If has id, show loading while redirecting
  if (id) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Otherwise show the Explore page content
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
