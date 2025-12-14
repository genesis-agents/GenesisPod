'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserProfileButton from './UserProfileButton';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  // 折叠状态（持久化）
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('sidebar-collapsed');
    return stored === 'true';
  });
  // 悬停展开
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  // 锁定时始终展开，否则悬停时展开
  const showExpanded = !isCollapsed || isHovered;

  // 持久化折叠状态
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'sidebar-collapsed',
        isCollapsed ? 'true' : 'false'
      );
    }
  }, [isCollapsed]);

  // 检查鼠标是否在侧边栏内
  const checkMouseInSidebar = useCallback(() => {
    if (!sidebarRef.current) return false;
    const rect = sidebarRef.current.getBoundingClientRect();
    // 获取当前鼠标位置（通过监听 mousemove 存储的位置）
    const mouseX =
      (window as unknown as { __sidebarMouseX?: number }).__sidebarMouseX ?? -1;
    const mouseY =
      (window as unknown as { __sidebarMouseY?: number }).__sidebarMouseY ?? -1;
    return (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    );
  }, []);

  // 处理鼠标进入
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  // 处理鼠标离开 - 延迟折叠，并再次检查鼠标位置
  const handleMouseLeave = () => {
    // 清除之前的定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // 延迟折叠，并在折叠前再次确认鼠标确实离开了
    hoverTimeoutRef.current = setTimeout(() => {
      // 再次检查鼠标是否真的离开了侧边栏
      if (!checkMouseInSidebar()) {
        setIsHovered(false);
      }
    }, 300);
  };

  // 监听全局鼠标位置
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      (window as unknown as { __sidebarMouseX?: number }).__sidebarMouseX =
        e.clientX;
      (window as unknown as { __sidebarMouseY?: number }).__sidebarMouseY =
        e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // 页面导航后，检查鼠标是否还在侧边栏内
  useEffect(() => {
    // 导航后延迟检查，如果鼠标还在侧边栏内则保持展开
    const timer = setTimeout(() => {
      if (checkMouseInSidebar()) {
        setIsHovered(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [pathname, checkMouseInSidebar]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const isActive = (path: string) => pathname === path;

  return (
    <aside
      ref={sidebarRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${showExpanded ? 'w-52' : 'w-16'} relative z-40 flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ${className}`}
    >
      {/* Collapse/Expand Button - Vertically Centered */}
      <button
        onClick={() => {
          const next = !isCollapsed;
          setIsCollapsed(next);
          // 确保点击后立即展开视图（避免 hover 依赖）
          setIsHovered(!next ? false : true);
        }}
        className="group absolute -right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 shadow-sm ring-1 ring-gray-200/50 transition-all duration-200 hover:shadow-md hover:ring-blue-300/50"
        title={
          isCollapsed
            ? 'Expand sidebar (click to keep open)'
            : 'Collapse sidebar'
        }
      >
        <svg
          className={`h-4 w-4 text-gray-600 transition-all duration-200 group-hover:text-blue-600 ${isCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-400/0 to-purple-400/0 opacity-0 transition-opacity duration-200 group-hover:from-blue-400/10 group-hover:to-purple-400/10 group-hover:opacity-100" />
      </button>

      {/* Header */}
      <div
        className={`flex items-center p-4 ${!showExpanded ? 'justify-center' : ''}`}
      >
        {!showExpanded ? (
          /* Collapsed Logo - S-curve dive & rise with gradient accent */
          <Link href="/" className="group relative" title="DeepDive Engine">
            <svg
              className="h-8 w-8 transition-transform duration-300 group-hover:scale-105"
              viewBox="0 0 32 32"
              fill="none"
            >
              {/* Gradient definitions */}
              <defs>
                <linearGradient
                  id="logoGradientCollapsed"
                  x1="0%"
                  y1="100%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#0F2A46" />
                  <stop offset="50%" stopColor="#2BB7DA" />
                  <stop offset="100%" stopColor="#7C5BFE" />
                </linearGradient>
                <radialGradient id="glowCollapsed" cx="75%" cy="25%" r="50%">
                  <stop offset="0%" stopColor="#7C5BFE" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#7C5BFE" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Glow effect at top right */}
              <circle
                cx="24"
                cy="8"
                r="6"
                fill="url(#glowCollapsed)"
                className="opacity-70 transition-opacity duration-300 group-hover:opacity-100"
              />
              {/* S-curve: dive down then rise up - 深潜后上升 */}
              <path
                d="M8 6 C8 6, 12 8, 12 14 C12 20, 16 22, 16 22 C16 22, 20 20, 20 14 C20 10, 24 8, 24 6"
                stroke="url(#logoGradientCollapsed)"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-300"
              />
              {/* Anchor base - 稳固基底 */}
              <path
                d="M10 26 L22 26"
                stroke="#0F2A46"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.4"
              />
              {/* Rising light burst - 向上的光芒 */}
              <circle
                cx="24"
                cy="6"
                r="2"
                fill="#7C5BFE"
                className="group-hover:r-3 transition-all duration-300"
              />
            </svg>
          </Link>
        ) : (
          /* Expanded Logo - S-curve + Text with gradient */
          <Link
            href="/"
            className="group relative flex items-center gap-2.5"
            title="DeepDive Engine"
          >
            <svg
              className="h-8 w-8 flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
              viewBox="0 0 32 32"
              fill="none"
            >
              {/* Gradient definitions */}
              <defs>
                <linearGradient
                  id="logoGradient"
                  x1="0%"
                  y1="100%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#0F2A46" />
                  <stop offset="50%" stopColor="#2BB7DA" />
                  <stop offset="100%" stopColor="#7C5BFE" />
                </linearGradient>
                <radialGradient id="glow" cx="75%" cy="25%" r="50%">
                  <stop offset="0%" stopColor="#7C5BFE" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#7C5BFE" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Glow effect at top right */}
              <circle
                cx="24"
                cy="8"
                r="6"
                fill="url(#glow)"
                className="opacity-70 transition-opacity duration-300 group-hover:opacity-100"
              />
              {/* S-curve: dive down then rise up - 深潜后上升 */}
              <path
                d="M8 6 C8 6, 12 8, 12 14 C12 20, 16 22, 16 22 C16 22, 20 20, 20 14 C20 10, 24 8, 24 6"
                stroke="url(#logoGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-300"
              />
              {/* Anchor base - 稳固基底 */}
              <path
                d="M10 26 L22 26"
                stroke="#0F2A46"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.4"
              />
              {/* Rising light burst - 向上的光芒 */}
              <circle
                cx="24"
                cy="6"
                r="2"
                fill="#7C5BFE"
                className="group-hover:r-3 transition-all duration-300"
              />
            </svg>

            <div className="flex flex-col leading-none">
              <div className="flex items-center gap-1">
                <span
                  className="bg-gradient-to-r from-[#0F2A46] via-[#2BB7DA] to-[#7C5BFE] bg-clip-text text-[15px] font-bold tracking-tight text-transparent"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  DeepDive
                </span>
                <span className="rounded bg-gradient-to-r from-amber-500 to-orange-500 px-1 py-0.5 text-[7px] font-bold text-white">
                  Beta
                </span>
              </div>
              <span className="text-[9px] font-medium tracking-[0.15em] text-[#0F2A46]/50">
                ENGINE
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {/* Ask AI - Primary AI Chat Entry */}
          <Link
            href="/ask"
            onClick={(e) => {
              if (pathname === '/ask') {
                e.preventDefault();
                window.location.href = '/ask';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive('/ask') || pathname?.startsWith('/ask')
                ? 'bg-violet-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Ask DeepDive AI"
          >
            {/* Ask AI Icon - Lightbulb/Inspiration (consistent line style) */}
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            {showExpanded && <span>Ask AI</span>}
          </Link>

          {/* Divider */}
          <div className="my-2 border-t border-gray-200/60" />

          <Link
            href="/explore"
            onClick={(e) => {
              // Force navigation even if already on explore page
              if (pathname === '/explore') {
                e.preventDefault();
                window.location.href = '/explore';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive('/explore')
                ? 'bg-pink-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Explore"
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {showExpanded && <span>Explore</span>}
          </Link>

          <Link
            href="/library"
            onClick={(e) => {
              // Force navigation even if already on library page
              if (pathname === '/library') {
                e.preventDefault();
                window.location.href = '/library';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive('/library')
                ? 'bg-amber-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Library"
          >
            {/* Library icon - book/collection */}
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            {showExpanded && <span>Library</span>}
          </Link>

          <Link
            href="/ai-studio"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/ai-studio')
                ? 'bg-purple-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Studio"
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            {showExpanded && <span>AI Studio</span>}
          </Link>

          <Link
            href="/ai-office"
            onClick={(e) => {
              // Force navigation even if already on ai-office page
              if (pathname === '/ai-office') {
                e.preventDefault();
                window.location.href = '/ai-office';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} relative rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive('/ai-office') || pathname?.startsWith('/ai-office')
                ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-gray-900 shadow-sm'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Office"
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
              />
            </svg>
            {showExpanded && <span>AI Office</span>}
          </Link>

          <Link
            href="/ai-teams"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/ai-teams')
                ? 'bg-green-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Teams"
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {showExpanded && <span>AI Teams</span>}
          </Link>

          <Link
            href="/ai-simulation"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/ai-simulation')
                ? 'bg-indigo-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Simulation"
          >
            {/* 战略推演图标 - 棋盘/对弈风格 */}
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {/* 棋盘格子 */}
              <rect
                x="3"
                y="3"
                width="7"
                height="7"
                rx="1"
                strokeWidth={1.5}
                fill={
                  pathname?.startsWith('/ai-simulation')
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'none'
                }
              />
              <rect
                x="14"
                y="3"
                width="7"
                height="7"
                rx="1"
                strokeWidth={1.5}
              />
              <rect
                x="3"
                y="14"
                width="7"
                height="7"
                rx="1"
                strokeWidth={1.5}
              />
              <rect
                x="14"
                y="14"
                width="7"
                height="7"
                rx="1"
                strokeWidth={1.5}
                fill={
                  pathname?.startsWith('/ai-simulation')
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'none'
                }
              />
              {/* 对弈棋子 */}
              <circle cx="6.5" cy="6.5" r="2" strokeWidth={1.5} />
              <circle
                cx="17.5"
                cy="17.5"
                r="2"
                strokeWidth={1.5}
                fill="currentColor"
              />
            </svg>
            {showExpanded && <span>AI Simulation</span>}
          </Link>

          <Link
            href="/ai-store"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/ai-store')
                ? 'bg-cyan-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Store"
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            {showExpanded && <span>AI Store</span>}
          </Link>

          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
                pathname?.startsWith('/admin')
                  ? 'bg-purple-50 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Admin"
            >
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {showExpanded && <span>Admin</span>}
            </Link>
          )}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="flex flex-1 flex-col justify-end space-y-1 border-t border-gray-200 p-3">
        <Link
          href="/notifications"
          onClick={(e) => {
            // Force navigation even if already on notifications page
            if (pathname === '/notifications') {
              e.preventDefault();
              window.location.href = '/notifications';
            }
          }}
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
            isActive('/notifications')
              ? 'bg-pink-50 text-gray-900'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          title="Notifications"
        >
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {showExpanded && <span>Notifications</span>}
        </Link>

        {/* User Profile / Login Button */}
        <div>
          <UserProfileButton isCollapsed={!showExpanded} />
        </div>

        <Link
          href="/labs"
          onClick={(e) => {
            // Force navigation even if already on labs page
            if (pathname === '/labs') {
              e.preventDefault();
              window.location.href = '/labs';
            }
          }}
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
            isActive('/labs')
              ? 'bg-pink-50 text-gray-900'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          title="Labs"
        >
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          {showExpanded && <span>Labs</span>}
        </Link>
        <Link
          href="/feedback"
          onClick={(e) => {
            // Force navigation even if already on feedback page
            if (pathname === '/feedback') {
              e.preventDefault();
              window.location.href = '/feedback';
            }
          }}
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
            isActive('/feedback')
              ? 'bg-pink-50 text-gray-900'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          title="Feedback"
        >
          <svg
            className="h-5 w-5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {showExpanded && <span>Feedback</span>}
        </Link>
      </div>
    </aside>
  );
}
