'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChunkErrorHandler } from '@/components/shared/ChunkErrorHandler';
import { ToastContainer } from '@/components/ui/Toast';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ChunkErrorHandler />
      <AuthProvider>{children}</AuthProvider>
      <ToastContainer />
    </QueryClientProvider>
  );
}
