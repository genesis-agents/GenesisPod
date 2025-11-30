'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useResourceStore } from '@/stores/aiOfficeStore';
import UserProfileButton from './UserProfileButton';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // 默认折叠，但读取localStorage的设置
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });
  const pathname = usePathname();
  const aiOfficeResourceCount = useResourceStore(
    (state) => state.resources.length
  );
  const { isAdmin } = useAuth();

  // 持久化折叠状态
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const isActive = (path: string) => pathname === path;

  return (
    <aside
      className={`${isCollapsed ? 'w-16' : 'w-52'} relative flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ${className}`}
    >
      {/* Collapse/Expand Button - Vertically Centered */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="group absolute -right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 shadow-sm ring-1 ring-gray-200/50 transition-all duration-200 hover:shadow-md hover:ring-blue-300/50"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
        className={`flex items-center p-4 ${isCollapsed ? 'justify-center' : ''}`}
      >
        {isCollapsed ? (
          /* Collapsed Logo - Pure line art style */
          <Link href="/" className="group" title="DeepDive Engine">
            <svg
              className="h-8 w-8 text-gray-700 transition-colors duration-200 group-hover:text-blue-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Diving arrow - simple line art */}
              <path d="M12 3v14" />
              <path d="M5 10l7 7 7-7" />
              {/* Depth waves */}
              <path d="M8 20h8" opacity="0.5" />
            </svg>
          </Link>
        ) : (
          /* Expanded Logo - Line art + Text */
          <Link
            href="/"
            className="group flex items-center gap-2"
            title="DeepDive Engine"
          >
            <svg
              className="h-7 w-7 flex-shrink-0 text-gray-700 transition-colors duration-200 group-hover:text-blue-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Diving arrow - simple line art */}
              <path d="M12 3v14" />
              <path d="M5 10l7 7 7-7" />
              {/* Depth waves */}
              <path d="M8 20h8" opacity="0.5" />
            </svg>

            <div className="flex flex-col leading-none">
              <span className="text-[14px] font-semibold tracking-tight text-gray-800">
                DeepDive
              </span>
              <span className="text-[9px] font-medium tracking-wider text-gray-400">
                ENGINE
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-2">
        <div className="space-y-1">
          <Link
            href="/"
            onClick={(e) => {
              // Force navigation even if already on homepage
              if (pathname === '/') {
                e.preventDefault();
                window.location.href = '/';
              }
            }}
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive('/')
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
            {!isCollapsed && <span>Explore</span>}
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
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              isActive('/library')
                ? 'bg-amber-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="Sparkle"
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
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            {!isCollapsed && <span>Sparkle</span>}
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
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} relative rounded-lg px-3 py-2.5 text-sm font-medium ${
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
            {!isCollapsed && (
              <div className="flex flex-1 items-center justify-between">
                <span>AI Office</span>
                {aiOfficeResourceCount > 0 && (
                  <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {aiOfficeResourceCount}
                  </span>
                )}
              </div>
            )}
            {isCollapsed && aiOfficeResourceCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                {aiOfficeResourceCount > 9 ? '9+' : aiOfficeResourceCount}
              </span>
            )}
          </Link>

          <Link
            href="/studio"
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/studio')
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
            {!isCollapsed && <span>AI Studio</span>}
          </Link>

          <Link
            href="/ai-group"
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
              pathname?.startsWith('/ai-group')
                ? 'bg-green-50 text-gray-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            title="AI Group"
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
            {!isCollapsed && <span>AI Group</span>}
          </Link>

          {isAdmin && (
            <Link
              href="/data-collection/dashboard"
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium ${
                pathname?.startsWith('/data-collection')
                  ? 'bg-purple-50 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              title="Settings"
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
              {!isCollapsed && <span>Settings</span>}
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
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
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
          {!isCollapsed && <span>Notifications</span>}
        </Link>

        {/* User Profile / Login Button */}
        <div className={`${isCollapsed ? '' : ''}`}>
          <UserProfileButton isCollapsed={isCollapsed} />
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
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
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
          {!isCollapsed && <span>Labs</span>}
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
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2 text-sm ${
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
          {!isCollapsed && <span>Feedback</span>}
        </Link>
      </div>
    </aside>
  );
}
