'use client';

import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { ByokOnboardingBanner } from '@/components/byok/ByokOnboardingBanner';

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
 * 版本更新提示已从顶部横幅迁移到通知中心（推送）—— 见
 * backend `NotificationPresetsService.notifyVersionUpdate`。
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
      <div className={`flex h-screen flex-col bg-gray-50 ${className}`}>
        <div className="flex min-h-0 flex-1">
          {/* Desktop Sidebar - Hidden on mobile, or when hideSidebar is true */}
          {!hideSidebar && <Sidebar />}

          {/* Main Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* BYOK 引导横幅（未配置 Key 时温和提示）—— empty:hidden 确保
                banner 不显示时不占 padding 高度，避免主内容底部内容被裁切 */}
            <div className="px-4 pt-3 md:px-6 [&:empty]:hidden [&:has(>:empty)]:hidden">
              <ByokOnboardingBanner />
            </div>
            <div className="flex min-h-0 flex-1">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
