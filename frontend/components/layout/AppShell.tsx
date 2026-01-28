'use client';

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
 * ★ Hydration 问题已在 Providers 层面统一处理（isMounted 模式）
 */
export default function AppShell({
  children,
  className = '',
  hideSidebar = false,
}: AppShellProps) {
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
