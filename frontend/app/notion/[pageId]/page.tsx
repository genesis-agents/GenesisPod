'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function NotionRedirect() {
  const params = useParams();
  const router = useRouter();
  const pageId = params?.pageId as string;

  useEffect(() => {
    if (pageId) {
      router.replace(`/library/notion/${pageId}`);
    }
  }, [pageId, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
    </div>
  );
}
