'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  hideSidebar?: boolean;
}

/**
 * AppShell - Unified layout component for desktop and mobile
 *
 * Includes:
 * - MobileNav (visible on mobile, hidden on md+)
 * - Sidebar (hidden on mobile, visible on md+) - can be hidden with hideSidebar prop
 * - Main content area with proper spacing
 *
 * ★ 使用 isMounted 模式避免 hydration 错误
 * Sidebar/MobileNav 依赖 useAuth/useTranslation 等客户端状态，
 * SSR 时渲染简化版布局，CSR 后再渲染完整组件。
 */
export default function AppShell({
  children,
  className = '',
  hideSidebar = false,
}: AppShellProps) {
  // ★ 关键：SSR 时 isMounted=false，只渲染占位符
  // CSR hydration 后 useEffect 运行，isMounted=true，渲染完整 Sidebar
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // SSR 阶段：渲染不含 Sidebar/MobileNav 的简化布局
  // 这确保 SSR 输出与 CSR 首次渲染一致（都没有 Sidebar）
  if (!isMounted) {
    return (
      <div className={`flex h-screen bg-gray-50 ${className}`}>
        {/* SSR 阶段：用固定宽度占位符代替 Sidebar，避免布局跳动 */}
        {!hideSidebar && (
          <aside className="hidden h-full w-52 flex-shrink-0 border-r border-gray-200 bg-white md:block" />
        )}
        {children}
      </div>
    );
  }

  return (
    <>
      {/* Mobile Navigation - Only visible on small screens */}
      {!hideSidebar && <MobileNav />}

      {/* Main Layout Container */}
      <div className={`flex h-screen bg-gray-50 ${className}`}>
        {/* Desktop Sidebar - Hidden on mobile, or when hideSidebar is true */}
        {!hideSidebar && <Sidebar />}

        {/* Main Content */}
        {children}
      </div>
    </>
  );
}
