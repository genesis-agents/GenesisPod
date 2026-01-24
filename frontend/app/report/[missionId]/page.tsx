'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Legacy redirect page for backward compatibility
 * Redirects /report/[missionId] to /ai-writing/report/[missionId]
 */
export default function LegacyReportRedirect() {
  const params = useParams();
  const router = useRouter();
  const missionId = params?.missionId as string;

  useEffect(() => {
    if (missionId) {
      router.replace(`/ai-writing/report/${missionId}`);
    }
  }, [missionId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <svg
          className="mx-auto h-12 w-12 animate-spin text-green-500"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="mt-4 text-gray-600">正在跳转...</p>
      </div>
    </div>
  );
}
