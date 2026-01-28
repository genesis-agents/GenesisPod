'use client';

/**
 * Root Providers - 应用全局 Context 提供者
 *
 * ★ Hydration 策略：
 * - 所有 Context Providers 必须在 SSR 和 CSR 渲染相同的初始状态
 * - 客户端特定的状态（localStorage、window 等）只能在 useEffect 中读取
 * - 使用 isHydrated 状态控制客户端特定 UI 的渲染时机
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, createContext, useContext } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/lib/i18n';
import { ChunkErrorHandler } from '@/components/common/ChunkErrorHandler';
import { ToastContainer } from '@/components/ui/Toast';
import { toast } from '@/stores';
import { CheckinModal, InsufficientCreditsModal } from '@/components/credits';

/**
 * Hydration Context - 全局 hydration 状态
 * 子组件可以通过 useHydration() 检查是否已完成 hydration
 */
const HydrationContext = createContext<boolean>(false);

export function useHydration(): boolean {
  return useContext(HydrationContext);
}

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
    <HydrationContext.Provider value={isHydrated}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ChunkErrorHandler />
          <AuthProvider>{children}</AuthProvider>
          <ToastContainer />
          {/* ★ 这些模态框依赖客户端状态，只在 hydration 完成后渲染 */}
          {isHydrated && (
            <>
              <CheckinModal />
              <InsufficientCreditsModal />
            </>
          )}
        </I18nProvider>
      </QueryClientProvider>
    </HydrationContext.Provider>
  );
}
