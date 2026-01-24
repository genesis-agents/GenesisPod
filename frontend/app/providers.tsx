'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/lib/i18n';
import { ChunkErrorHandler } from '@/components/common/ChunkErrorHandler';
import { ToastContainer } from '@/components/ui/Toast';
import { toast } from '@/stores';
import { CheckinModal, InsufficientCreditsModal } from '@/components/credits';

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

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ChunkErrorHandler />
        <AuthProvider>{children}</AuthProvider>
        <ToastContainer />
        <CheckinModal />
        <InsufficientCreditsModal />
      </I18nProvider>
    </QueryClientProvider>
  );
}
