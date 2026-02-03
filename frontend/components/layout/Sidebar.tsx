'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserProfileButton from './UserProfileButton';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';

// Sidebar Panel Toggle Icon - left narrow, right wide
// Fill shows current visible state: expanded = right filled, collapsed = left filled
function SidebarToggleIcon({
  state,
}: {
  state: 'expanded' | 'collapsed' | 'pinned';
}) {
  // When expanded/pinned: right (content area) is visible, so fill right
  // When collapsed: left (sidebar) is minimized, so fill left
  const isExpanded = state === 'expanded' || state === 'pinned';
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-7">
      {/* Outer frame */}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Left narrow panel - fill when collapsed */}
      <rect
        x="3"
        y="3"
        width="6"
        height="18"
        rx="2"
        fill={!isExpanded ? '#6b7280' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Right wide panel - fill when expanded */}
      <rect
        x="9"
        y="3"
        width="12"
        height="18"
        rx="2"
        fill={isExpanded ? '#9ca3af' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  // 三种状态: expanded(默认展开), collapsed(收起), pinned(固定)
  const [sidebarState, setSidebarState] = useState<
    'expanded' | 'collapsed' | 'pinned'
  >('expanded');

  // 悬停展开
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { t } = useTranslation();

  // 展开逻辑：pinned时始终展开，collapsed时hover展开，expanded时展开
  const showExpanded =
    sidebarState === 'pinned' ||
    sidebarState === 'expanded' ||
    (sidebarState === 'collapsed' && isHovered);

  // 点击切换状态: expanded → collapsed → pinned → expanded
  const handleToggle = () => {
    if (sidebarState === 'expanded') {
      setSidebarState('collapsed');
      setIsHovered(false);
    } else if (sidebarState === 'collapsed') {
      setSidebarState('pinned');
    } else {
      setSidebarState('expanded');
    }
  };

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
      className={`${showExpanded ? 'w-52' : 'w-16'} relative z-40 hidden h-full flex-col overflow-hidden border-r border-gray-200 bg-white transition-all duration-300 md:flex ${className}`}
    >
      {/* Header - ChatGPT style */}
      <div
        className={`flex flex-shrink-0 items-center overflow-hidden px-3 py-2.5 ${showExpanded ? 'justify-between' : 'justify-center'}`}
      >
        {!showExpanded ? (
          /* Collapsed state: Logo with hover -> Toggle button */
          <button
            onClick={handleToggle}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:bg-gray-100"
            title="Open sidebar"
          >
            {/* Default: Show Logo */}
            <svg
              className="h-8 w-8 transition-all duration-200 group-hover:scale-75 group-hover:opacity-0"
              viewBox="0 0 32 32"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="logoGradientCollapsed"
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
                stroke="url(#logoGradientCollapsed)"
                strokeWidth="2"
                fill="none"
              />
              <circle cx="16" cy="6" r="3" fill="#0F2A46" />
              <circle cx="26" cy="16" r="3" fill="#2BB7DA" />
              <circle cx="16" cy="26" r="3" fill="#7C5BFE" />
              <circle cx="6" cy="16" r="3" fill="#2BB7DA" />
              <circle
                cx="16"
                cy="16"
                r="3"
                fill="url(#logoGradientCollapsed)"
              />
            </svg>
            {/* Hover: Show Toggle icon */}
            <span className="absolute text-gray-600 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              <SidebarToggleIcon state={sidebarState} />
            </span>
          </button>
        ) : (
          /* Expanded state: Logo + Text on left */
          <Link
            href="/"
            className="group relative flex items-center gap-2.5"
            title="Raven AI Engine"
          >
            <svg
              className="h-8 w-8 flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
              viewBox="0 0 32 32"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="logoGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#0F2A46" />
                  <stop offset="40%" stopColor="#2BB7DA" />
                  <stop offset="100%" stopColor="#7C5BFE" />
                </linearGradient>
                <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#7C5BFE" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#7C5BFE" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Central glow */}
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="url(#glow)"
                className="opacity-50 group-hover:opacity-80"
              />
              {/* Circular connection - holding hands ring */}
              <circle
                cx="16"
                cy="16"
                r="10"
                stroke="url(#logoGradient)"
                strokeWidth="2"
                fill="none"
                className="group-hover:stroke-[#2BB7DA]"
              />
              {/* Four agent nodes around the circle */}
              <circle
                cx="16"
                cy="6"
                r="3"
                fill="#0F2A46"
                className="transition-colors group-hover:fill-[#2BB7DA]"
              />
              <circle
                cx="26"
                cy="16"
                r="3"
                fill="#2BB7DA"
                className="transition-colors group-hover:fill-[#7C5BFE]"
              />
              <circle
                cx="16"
                cy="26"
                r="3"
                fill="#7C5BFE"
                className="transition-colors group-hover:fill-[#0F2A46]"
              />
              <circle
                cx="6"
                cy="16"
                r="3"
                fill="#2BB7DA"
                className="transition-colors group-hover:fill-[#7C5BFE]"
              />
              {/* Engine core at center */}
              <circle
                cx="16"
                cy="16"
                r="3"
                fill="url(#logoGradient)"
                className="transition-transform group-hover:scale-110"
              />
            </svg>

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <span
                  className="logo-shimmer text-[15px] font-bold tracking-tight"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  Raven
                </span>
                <span className="rounded bg-gradient-to-r from-blue-500 to-indigo-500 px-1 py-0.5 text-[7px] font-bold text-white">
                  v{process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'}
                </span>
              </div>
              <span className="logo-shimmer text-[9px] font-medium tracking-[0.15em]">
                AI ENGINE
              </span>
            </div>
          </Link>
        )}
        {/* Toggle button - only in expanded state */}
        {showExpanded && (
          <button
            onClick={handleToggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title={
              sidebarState === 'pinned' ? 'Unpin sidebar' : 'Collapse sidebar'
            }
          >
            <SidebarToggleIcon state={sidebarState} />
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-3 py-1">
        <div className="space-y-1">
          {/* AI Ask - Primary AI Chat Entry */}
          <Link
            href="/ai-ask"
            onClick={(e) => {
              if (pathname === '/ai-ask') {
                e.preventDefault();
                window.location.href = '/ai-ask';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive('/ai-ask') || pathname?.startsWith('/ai-ask')
                ? 'bg-violet-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiAsk')}
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
            {showExpanded && <span>{t('nav.aiAsk')}</span>}
          </Link>

          {/* Section: Materials & Knowledge */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.materialsKnowledge')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/explore"
            onClick={(e) => {
              if (pathname === '/explore') {
                e.preventDefault();
                window.location.href = '/explore';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              isActive('/explore')
                ? 'bg-pink-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiExplore')}
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
            {showExpanded && <span>{t('nav.aiExplore')}</span>}
          </Link>

          <Link
            href="/library"
            onClick={(e) => {
              if (pathname === '/library') {
                e.preventDefault();
                window.location.href = '/library';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              isActive('/library')
                ? 'bg-indigo-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.myLibrary')}
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
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            {showExpanded && <span>{t('nav.myLibrary')}</span>}
          </Link>

          {/* Section: AI Teams */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.aiTeams')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/ai-image"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-image')
                ? 'bg-pink-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiImage')}
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiImage')}</span>}
          </Link>

          <Link
            href="/ai-writing"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-writing')
                ? 'bg-amber-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiWriting')}
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiWriting')}</span>}
          </Link>

          <Link
            href="/ai-research"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-research')
                ? 'bg-purple-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiResearch')}
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
            {showExpanded && <span>{t('nav.aiResearch')}</span>}
          </Link>

          <Link
            href="/ai-office"
            onClick={(e) => {
              if (pathname === '/ai-office') {
                e.preventDefault();
                window.location.href = '/ai-office';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} relative rounded-lg px-3 py-2 text-sm font-medium ${
              isActive('/ai-office') || pathname?.startsWith('/ai-office')
                ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-gray-900 shadow-sm'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiReports')}
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
            {showExpanded && <span>{t('nav.aiReports')}</span>}
          </Link>

          <Link
            href="/ai-simulation"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-simulation')
                ? 'bg-indigo-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiSimulation')}
          >
            <svg
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
              <circle cx="6.5" cy="6.5" r="2" strokeWidth={1.5} />
              <circle
                cx="17.5"
                cy="17.5"
                r="2"
                strokeWidth={1.5}
                fill="currentColor"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiSimulation')}</span>}
          </Link>

          <Link
            href="/ai-teams"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-teams')
                ? 'bg-green-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.myTeams')}
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
            {showExpanded && <span>{t('nav.myTeams')}</span>}
          </Link>

          {/* Section: AI Tools */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.aiTools')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/ai-store"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
              pathname?.startsWith('/ai-store') ||
              pathname?.startsWith('/ai-skills')
                ? 'bg-cyan-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiStore')}
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
            {showExpanded && <span>{t('nav.aiStore')}</span>}
          </Link>

          {isAdmin && (
            <Link
              href="/ai-social"
              className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
                pathname?.startsWith('/ai-social')
                  ? 'bg-rose-50 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              title={t('nav.aiSocial')}
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
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              {showExpanded && <span>{t('nav.aiSocial')}</span>}
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin/overview"
              className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm font-medium ${
                pathname?.startsWith('/admin')
                  ? 'bg-purple-50 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              title={t('nav.admin')}
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
              {showExpanded && <span>{t('nav.admin')}</span>}
            </Link>
          )}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="flex-shrink-0 space-y-0 border-t border-gray-200 px-3 py-1.5">
        <Link
          href="/notifications"
          onClick={(e) => {
            // Force navigation even if already on notifications page
            if (pathname === '/notifications') {
              e.preventDefault();
              window.location.href = '/notifications';
            }
          }}
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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
          {showExpanded && <span>{t('nav.notifications')}</span>}
        </Link>

        {/* User Profile / Login Button */}
        <div>
          <UserProfileButton isCollapsed={!showExpanded} />
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher variant={showExpanded ? 'sidebar' : 'icon'} />

        <Link
          href="/changelog"
          onClick={(e) => {
            // Force navigation even if already on changelog page
            if (pathname === '/changelog') {
              e.preventDefault();
              window.location.href = '/changelog';
            }
          }}
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
            isActive('/changelog')
              ? 'bg-pink-50 text-gray-900'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          title="What's New"
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
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
          {showExpanded && <span>{t('nav.whatsNew')}</span>}
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
          className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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
          {showExpanded && <span>{t('nav.feedback')}</span>}
        </Link>
      </div>
    </aside>
  );
}
