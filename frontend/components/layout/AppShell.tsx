'use client';

import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * AppShell - Unified layout component for desktop and mobile
 *
 * Includes:
 * - MobileNav (visible on mobile, hidden on md+)
 * - Sidebar (hidden on mobile, visible on md+)
 * - Main content area with proper spacing
 */
export default function AppShell({ children, className = '' }: AppShellProps) {
  return (
    <>
      {/* Mobile Navigation - Only visible on small screens */}
      <MobileNav />

      {/* Main Layout Container */}
      <div className={`flex h-screen bg-gray-50 ${className}`}>
        {/* Desktop Sidebar - Hidden on mobile */}
        <Sidebar />

        {/* Main Content */}
        {children}
      </div>
    </>
  );
}
