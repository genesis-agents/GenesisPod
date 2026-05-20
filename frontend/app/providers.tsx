'use client';

/**
 * Root Providers - 应用全局 Context 提供者
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/lib/i18n';
import { clearWikiLocalStorage } from '@/lib/utils/auth';
import { ChunkErrorHandler } from '@/components/common/ChunkErrorHandler';
import { ThemeApplier } from '@/components/common/ThemeApplier';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastContainer } from '@/components/ui/Toast';
import { toast } from '@/stores';
import {
  CheckinModal,
  InsufficientCreditsModal,
} from '@/components/common/credits';
import { GlobalAIBarProvider } from '@/components/ai-bar';
import { ByokOnboardingGuard } from '@/components/common/byok/ByokOnboardingGuard';
import { GlobalByokErrorModal } from '@/components/common/byok/GlobalByokErrorModal';

/**
 * Create QueryClient with global error handling
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30 * 1000, // 30 seconds
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (error: Error) => {
          // Show error toast for mutations
          const message = error.message || 'An error occurred';
          toast.error('Operation Failed', message);
        },
      },
    },
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [isHydrated, setIsHydrated] = useState(false);

  // ★ 标记 hydration 完成
  // 这个 effect 只在客户端运行，服务端渲染时 isHydrated 始终为 false
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // ★ v1.5.3 §11 v1.5.x: multi-tab logout sync — when another tab clears
  // the auth token, mirror the cleanup in this tab so the previous user's
  // Wiki localStorage doesn't leak into the next user's session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key === 'deepdive_auth_tokens' && e.newValue === null) {
        clearWikiLocalStorage();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ChunkErrorHandler />
        <ThemeApplier />
        <ErrorBoundary>
          <AuthProvider>
            <ByokOnboardingGuard>
              <GlobalAIBarProvider>{children}</GlobalAIBarProvider>
            </ByokOnboardingGuard>
          </AuthProvider>
        </ErrorBoundary>
        <ToastContainer />
        {isHydrated && (
          <>
            <CheckinModal />
            <InsufficientCreditsModal />
            <GlobalByokErrorModal />
          </>
        )}
      </I18nProvider>
    </QueryClientProvider>
  );
}
