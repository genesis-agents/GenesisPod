'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserProfileButton from './UserProfileButton';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { CURRENT_VERSION } from '@/lib/utils/changelog';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { config } from '@/lib/utils/config';
import { useUnreadNotificationCount } from '@/hooks/domain/useNotifications';
import { useNotificationSocket } from '@/hooks/domain/useNotificationSocket';
import { usePublishedCustomAgents } from '@/components/custom-agents/usePublishedCustomAgents';

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

// ★ R-CA 风险#2 清零：每个 custom agent 用首字 + hash 颜色 chip，
//   collapsed 状态下也能区分。
const AGENT_COLORS: Array<{ bg: string; text: string }> = [
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
];

function agentInitial(displayName: string): string {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return '?';
  // 中文取第一个字符；英文取首字大写（数字 / emoji 也直接取第一）
  return trimmed.codePointAt(0)
    ? String.fromCodePoint(trimmed.codePointAt(0)!).toUpperCase()
    : '?';
}

function hashAgentColor(id: string): number {
  // 简单 djb2 哈希取色板索引
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AGENT_COLORS.length;
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

  // 通知 unread badge：拉模式 + socket 推模式（实时增量）
  const { count: unreadCount, refresh: refreshUnreadCount } =
    useUnreadNotificationCount();
  useNotificationSocket({
    onNewNotification: () => void refreshUnreadCount(),
    onBroadcast: () => void refreshUnreadCount(),
  });

  // ★ 2026-05-05 R-CA: 我自定义的 PUBLISHED agents（动态侧栏菜单项，截 5 个）
  const { items: publishedAgents } = usePublishedCustomAgents();
  const sidebarAgents = publishedAgents.slice(0, 5);
  const hasMoreAgents = publishedAgents.length > sidebarAgents.length;

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
      {/* Header */}
      <div
        className={`flex flex-shrink-0 items-center overflow-hidden border-b border-gray-100 px-3 py-3 ${showExpanded ? 'justify-between' : 'justify-center'}`}
      >
        {!showExpanded ? (
          /* Collapsed state: Logo with hover -> Toggle button */
          <button
            onClick={handleToggle}
            className="group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-gray-100"
            title="Open sidebar"
          >
            {/* Default: Show Logo */}
            <BrandLogo
              variant="icon"
              iconClassName="h-8 w-8 transition-all duration-200 group-hover:scale-75 group-hover:opacity-0"
            />
            {/* Hover: Show Toggle icon */}
            <span className="absolute text-gray-600 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              <SidebarToggleIcon state={sidebarState} />
            </span>
          </button>
        ) : (
          /* Expanded state: Logo + Text on left */
          <Link
            href="/"
            className="group flex items-center"
            title={config.brand.fullName}
          >
            <BrandLogo
              variant="full"
              iconClassName="h-[18px] w-auto flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
              subtitle={
                <Link
                  href="/changelog"
                  onClick={(e) => e.stopPropagation()}
                  className="transition-colors hover:text-[#18181b]"
                >
                  v{CURRENT_VERSION}
                </Link>
              }
            />
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
      <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
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
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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

          {/* Section: Knowledge */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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

          {/* Section: Research & Analysis */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.researchAnalysis')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/ai-insights"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith('/ai-insights')
                ? 'bg-purple-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiInsights')}
          >
            {/* AI Insights Icon - Eye with sparkle (distinct from AI Ask lightbulb) */}
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
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiInsights')}</span>}
          </Link>

          <Link
            href="/ai-research"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith('/ai-research')
                ? 'bg-indigo-50 text-gray-900'
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
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiResearch')}</span>}
          </Link>

          {/* Section: Planning & Decision */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.planningDecision')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/ai-teams"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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

          <Link
            href="/ai-planning"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith('/ai-planning')
                ? 'bg-amber-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.aiPlanning')}
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            {showExpanded && <span>{t('nav.aiPlanning')}</span>}
          </Link>

          <Link
            href="/ai-simulation"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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

          {/* Section: Creative Writing */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.creativeWriting')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/ai-office"
            onClick={(e) => {
              if (pathname === '/ai-office') {
                e.preventDefault();
                window.location.href = '/ai-office';
              }
            }}
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} relative rounded-lg px-3 py-1.5 text-sm font-medium ${
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
            href="/ai-writing"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
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

          {/* AI 社媒 — 暂时隐藏（用户未开放） */}

          {/* Section: 创新 Labs */}
          {showExpanded && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {t('nav.sections.collabLab')}
            </div>
          )}
          {!showExpanded && (
            <div className="my-1 border-t border-gray-200/60" />
          )}

          <Link
            href="/agent-playground"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith('/agent-playground')
                ? 'bg-purple-50 text-purple-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.playground')}
          >
            {/* 2026-05-12: 烧瓶图标（实验场语义），与 AI Ask 的 lightbulb 区分。 */}
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
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
              />
            </svg>
            {showExpanded && <span>{t('nav.playground')}</span>}
          </Link>

          {/* AI 商店 / 工具市场 — 暂时不要 */}

          {/* Section: 我的 Agent ★ 2026-05-05 R-CA: 动态列出 PUBLISHED custom agents */}
          {sidebarAgents.length > 0 && (
            <>
              {showExpanded && (
                <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {t('nav.sections.myAgents')}
                </div>
              )}
              {!showExpanded && (
                <div className="my-1 border-t border-gray-200/60" />
              )}
              {sidebarAgents.map((agent) => {
                const href = `/custom-agents/${agent.id}`;
                const isActive = pathname === href;
                // ★ R-CA 风险#2 清零：首字 + 按 agent.id hash 取颜色，
                //   collapsed 状态下也能区分多个 agent（不再都是同一 sparkles 图标）
                const initial = agentInitial(agent.displayName);
                const colorIdx = hashAgentColor(agent.id);
                const palette = AGENT_COLORS[colorIdx];
                return (
                  <Link
                    key={agent.id}
                    href={href}
                    className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
                      isActive
                        ? 'bg-rose-50 text-rose-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    title={agent.displayName}
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${palette.bg} ${palette.text}`}
                      aria-hidden="true"
                    >
                      {initial}
                    </span>
                    {showExpanded && (
                      <span className="line-clamp-1">{agent.displayName}</span>
                    )}
                  </Link>
                );
              })}
              {showExpanded && hasMoreAgents && (
                <Link
                  href="/me/ai?tab=agents"
                  className="flex items-center gap-3 rounded-lg px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                  title={t('nav.myAgentsViewAll')}
                >
                  <span className="ml-8">
                    {t('nav.myAgentsViewAll')}（{publishedAgents.length}）
                  </span>
                </Link>
              )}
              {showExpanded && (
                <Link
                  href="/me/ai?tab=agents"
                  className="flex items-center gap-3 rounded-lg px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                  title={t('nav.myAgentsManage')}
                >
                  <svg
                    className="ml-1 h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>{t('nav.myAgentsManage')}</span>
                </Link>
              )}
            </>
          )}

          {/* 管理后台已挪到底部 (UserProfileButton 下方)，统一"账号/系统/语言"
              收纳到底部分区，主导航只承载内容性入口。2026-05-12 用户反馈 Screenshot_57。 */}
        </div>
      </nav>

      {/* Bottom Navigation —— pb-3 留呼吸位，防被视口/任务栏裁切；
          space-y-0.5 让 notifications / user / language 间距清晰 */}
      <div className="flex-shrink-0 space-y-0.5 border-t border-gray-200 px-3 pb-3 pt-1.5">
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
          <span className="relative flex-shrink-0">
            <svg
              className="h-5 w-5"
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
            {unreadCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
                aria-label={`${unreadCount} unread notifications`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
          {showExpanded && (
            <span className="flex flex-1 items-center justify-between">
              <span>{t('nav.notifications')}</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          )}
        </Link>

        {/* User Profile / Login Button */}
        <div>
          <UserProfileButton isCollapsed={!showExpanded} />
        </div>

        {/* 系统 (admin only) — 2026-05-12: 挪到 UserProfileButton 下方，
            与"账号/语言"同列归到底部分区。布局与 notifications 一致。 */}
        {isAdmin && (
          <Link
            href="/admin/overview"
            className={`flex items-center ${!showExpanded ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith('/admin')
                ? 'bg-purple-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={t('nav.system')}
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
            {showExpanded && <span>{t('nav.system')}</span>}
          </Link>
        )}

        {/* Language Switcher */}
        <LanguageSwitcher variant={showExpanded ? 'sidebar' : 'icon'} />
      </div>
    </aside>
  );
}
