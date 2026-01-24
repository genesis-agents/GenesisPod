'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';

import { logger } from '@/lib/utils/logger';
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams?.get('token');
      const refreshToken = searchParams?.get('refreshToken');

      if (!token || !refreshToken) {
        logger.error('Missing tokens in callback URL');
        router.push('/');
        return;
      }

      try {
        // Fetch user info with the token
        const response = await fetch(`${config.apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user info');
        }

        const user = await response.json();

        // Save authentication state
        login(user, token, refreshToken);

        // Redirect to home page
        router.push('/');
      } catch (error) {
        logger.error('Authentication failed:', error);
        router.push('/');
      }
    };

    handleCallback();
  }, [searchParams, router, login]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-lg font-medium text-gray-900">Logging in...</p>
        <p className="mt-2 text-sm text-gray-500">
          Please wait while we complete your authentication
        </p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-lg font-medium text-gray-900">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
