'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import { LoadingState } from '@/components/ui/states/LoadingState';

import { logger } from '@/lib/utils/logger';

// Auth callback uses direct backend URL to bypass CDN/proxy.
// The Next.js rewrite proxy goes through Railway's Fastly CDN edge,
// which can return 503 under load ("Pop visit count exceeded").
// Critical auth flows must not depend on CDN availability.
const getAuthApiUrl = () => config.streamApiUrl;

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const exchangedRef = useRef(false);

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
          const response = await fetch(`${getAuthApiUrl()}/auth/me`, {
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

      // Prevent duplicate exchange (React StrictMode fires useEffect twice)
      if (exchangedRef.current) {
        return;
      }
      exchangedRef.current = true;

      try {
        // Exchange authorization code for tokens (direct to backend, bypass CDN)
        const exchangeResponse = await fetch(
          `${getAuthApiUrl()}/auth/exchange`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
          }
        );

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
          const userResponse = await fetch(`${getAuthApiUrl()}/auth/me`, {
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

  return <LoadingState fullScreen text="Logging in..." size="lg" />;
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={<LoadingState fullScreen text="Loading..." size="lg" />}
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
