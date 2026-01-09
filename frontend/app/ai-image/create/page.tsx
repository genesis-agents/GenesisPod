'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import ImageGenerator from '@/components/ai-image/ImageGenerator';
import AppShell from '@/components/layout/AppShell';

function AIImageCreateContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialImageId = searchParams.get('id') || undefined;

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppShell>
      <div className="h-full">
        <ImageGenerator initialImageId={initialImageId} />
      </div>
    </AppShell>
  );
}

export default function AIImageCreatePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
          </div>
        </AppShell>
      }
    >
      <AIImageCreateContent />
    </Suspense>
  );
}
