'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
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

/**
 * ★ 全局 Loading 组件 - SSR/CSR hydration 期间显示
 * 这确保 SSR 和 CSR 首次渲染输出完全相同，避免任何 hydration mismatch
 */
function GlobalLoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        {/* Logo */}
        <svg className="h-16 w-16" viewBox="0 0 32 32" fill="none">
          <defs>
            <linearGradient
              id="loadingLogoGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#0F2A46" />
              <stop offset="40%" stopColor="#2BB7DA" />
              <stop offset="100%" stopColor="#7C5BFE" />
            </linearGradient>
          </defs>
          <circle
            cx="16"
            cy="16"
            r="10"
            stroke="url(#loadingLogoGradient)"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="16" cy="6" r="3" fill="#0F2A46" />
          <circle cx="26" cy="16" r="3" fill="#2BB7DA" />
          <circle cx="16" cy="26" r="3" fill="#7C5BFE" />
          <circle cx="6" cy="16" r="3" fill="#2BB7DA" />
          <circle cx="16" cy="16" r="3" fill="url(#loadingLogoGradient)" />
        </svg>
        {/* Spinner */}
        <div className="border-3 h-8 w-8 animate-spin rounded-full border-gray-200 border-t-violet-600" />
      </div>
    </div>
  );
}

/**
 * ★ Providers 组件 - 使用 isMounted 模式彻底解决 hydration 问题
 *
 * 原理：
 * 1. SSR 阶段：isMounted=false → 渲染 GlobalLoadingScreen
 * 2. CSR 首次渲染（hydration）：isMounted=false → 渲染 GlobalLoadingScreen（与 SSR 一致！）
 * 3. CSR useEffect 执行后：isMounted=true → 渲染实际应用内容
 *
 * 这样 SSR 和 CSR 首次渲染的输出完全相同，不会有任何 hydration mismatch。
 * 所有依赖客户端状态的组件（useAuth, useTranslation, Zustand stores 等）
 * 都在 isMounted=true 之后才渲染，此时已经完成 hydration。
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ★ 关键：SSR 和 CSR hydration 阶段都渲染相同的 loading 界面
  // 这确保不会有任何 hydration mismatch
  if (!isMounted) {
    return <GlobalLoadingScreen />;
  }

  // ★ 只有在客户端 hydration 完成后才渲染实际内容
  // 此时所有客户端状态（localStorage, auth, i18n 等）都已就绪
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
