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
      // Backend sends authorization code that needs to be exchanged for tokens
      const code = searchParams?.get('code');
      // Legacy support: direct token parameters
      const directToken = searchParams?.get('token');
      const directRefreshToken = searchParams?.get('refreshToken');

      // Handle legacy direct token flow
      if (directToken && directRefreshToken) {
        try {
          const response = await fetch(`${config.apiUrl}/auth/me`, {
            headers: {
              Authorization: `Bearer ${directToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch user info');
          }

          const result = await response.json();
          const user = result?.data ?? result;
          login(user, directToken, directRefreshToken);
          router.push('/');
          return;
        } catch (error) {
          logger.error('Authentication failed with direct tokens:', error);
          router.push('/');
          return;
        }
      }

      // Handle authorization code exchange flow
      if (!code) {
        logger.error('Missing authorization code in callback URL');
        router.push('/');
        return;
      }

      try {
        // Exchange authorization code for tokens
        const exchangeResponse = await fetch(`${config.apiUrl}/auth/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!exchangeResponse.ok) {
          throw new Error('Failed to exchange authorization code');
        }

        const exchangeResult = await exchangeResponse.json();
        // Handle wrapped response { success: true, data: {...} }
        const tokenData = exchangeResult?.data ?? exchangeResult;
        const { accessToken, refreshToken, user } = tokenData;

        if (!accessToken || !refreshToken) {
          throw new Error('Invalid token response');
        }

        // If user not in response, fetch user info
        let userData = user;
        if (!userData) {
          const userResponse = await fetch(`${config.apiUrl}/auth/me`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!userResponse.ok) {
            throw new Error('Failed to fetch user info');
          }

          const userResult = await userResponse.json();
          userData = userResult?.data ?? userResult;
        }

        // Save authentication state
        login(userData, accessToken, refreshToken);

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
