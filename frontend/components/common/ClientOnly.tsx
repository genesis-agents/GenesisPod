'use client';

/**
 * ClientOnly - 客户端渲染边界组件
 *
 * 解决 React Hydration Error 的核心组件：
 * - 在 SSR 阶段渲染 fallback（默认为空）
 * - 在客户端 hydration 完成后渲染实际内容
 * - 确保 SSR/CSR 输出一致，避免 hydration mismatch
 *
 * 使用场景：
 * - 组件依赖 localStorage/sessionStorage
 * - 组件依赖 window/document 对象
 * - 组件输出依赖客户端状态（如当前时间、随机数）
 */

import { useState, useEffect, type ReactNode } from 'react';

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * useHydrated - Hook 版本的客户端检测
 *
 * 用于条件渲染场景，比 ClientOnly 组件更灵活
 *
 * @example
 * function MyComponent() {
 *   const isHydrated = useHydrated();
 *   return isHydrated ? <ClientContent /> : <Skeleton />;
 * }
 */
export function useHydrated(): boolean {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated;
}

export default ClientOnly;
