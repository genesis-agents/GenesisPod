'use client';

/**
 * Root Providers - 应用全局 Context 提供者
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/lib/i18n';
import { ChunkErrorHandler } from '@/components/common/ChunkErrorHandler';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastContainer } from '@/components/ui/Toast';
import { toast } from '@/stores';
import { CheckinModal, InsufficientCreditsModal } from '@/components/credits';
import { GlobalAIBarProvider } from '@/components/ai-bar';
import { ByokOnboardingGuard } from '@/components/byok/ByokOnboardingGuard';

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

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ChunkErrorHandler />
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
          </>
        )}
      </I18nProvider>
    </QueryClientProvider>
  );
}
