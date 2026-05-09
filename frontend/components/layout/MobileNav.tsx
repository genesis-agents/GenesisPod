'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import UserProfileButton from './UserProfileButton';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { CURRENT_VERSION } from '@/lib/utils/changelog';

interface MobileNavProps {
  className?: string;
}

export default function MobileNav({ className = '' }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { t } = useTranslation();

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (prefix: string) => pathname?.startsWith(prefix);

  // Quick entry
  const quickEntry = {
    href: '/ai-ask',
    label: t('nav.aiAsk'),
    icon: 'lightbulb',
    activeClass: 'bg-violet-50',
  };

  // Materials & Knowledge section
  const materialsItems = [
    {
      href: '/explore',
      label: t('nav.aiExplore'),
      icon: 'search',
      activeClass: 'bg-pink-50',
    },
    {
      href: '/library',
      label: t('nav.myLibrary'),
      icon: 'book',
      activeClass: 'bg-indigo-50',
    },
  ];

  // Research & Analysis section
  const researchItems = [
    {
      href: '/ai-insights',
      label: t('nav.aiInsights'),
      icon: 'eye',
      activeClass: 'bg-purple-50',
      prefix: true,
    },
    {
      href: '/ai-research',
      label: t('nav.aiResearch'),
      icon: 'flask',
      activeClass: 'bg-indigo-50',
      prefix: true,
    },
  ];

  // Planning & Decision section
  const planningItems = [
    {
      href: '/ai-teams',
      label: t('nav.myTeams'),
      icon: 'users',
      activeClass: 'bg-green-50',
      prefix: true,
    },
    {
      href: '/ai-planning',
      label: t('nav.aiPlanning'),
      icon: 'clipboard',
      activeClass: 'bg-amber-50',
      prefix: true,
    },
    {
      href: '/ai-simulation',
      label: t('nav.aiSimulation'),
      icon: 'grid',
      activeClass: 'bg-indigo-50',
      prefix: true,
    },
  ];

  // Creative Writing section
  const creativeItems = [
    {
      href: '/ai-office',
      label: t('nav.aiReports'),
      icon: 'pie',
      activeClass: 'bg-blue-50',
      prefix: true,
    },
    {
      href: '/ai-writing',
      label: t('nav.aiWriting'),
      icon: 'pen',
      activeClass: 'bg-amber-50',
      prefix: true,
    },
  ];

  // Admin-only creative tools — AI 社媒 暂时隐藏
  const adminCreativeItems: typeof creativeItems = [];

  // 创新 Labs section
  const collabLabItems = [
    {
      href: '/agent-playground',
      label: t('nav.playground'),
      icon: 'lightbulb',
      activeClass: 'bg-purple-50',
      prefix: true,
    },
  ];

  // 工具市场 / AI 商店 — 暂时不要

  const bottomNavItems = [
    { href: '/notifications', label: t('nav.notifications'), icon: 'bell' },
  ];

  const getIcon = (iconName: string) => {
    const iconClass = 'h-5 w-5 flex-shrink-0';
    switch (iconName) {
      case 'lightbulb':
        return (
          <svg
            className={iconClass}
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
        );
      case 'clipboard':
        return (
          <svg
            className={iconClass}
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
        );
      case 'eye':
        return (
          <svg
            className={iconClass}
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
        );
      case 'search':
        return (
          <svg
            className={iconClass}
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
        );
      case 'book':
        return (
          <svg
            className={iconClass}
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
        );
      case 'image':
        return (
          <svg
            className={iconClass}
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
        );
      case 'chart':
        return (
          <svg
            className={iconClass}
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
        );
      case 'pie':
        return (
          <svg
            className={iconClass}
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
        );
      case 'users':
        return (
          <svg
            className={iconClass}
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
        );
      case 'code':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
        );
      case 'pen':
        return (
          <svg
            className={iconClass}
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
        );
      case 'grid':
        return (
          <svg
            className={iconClass}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
            <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={1.5} />
            <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
            <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={1.5} />
          </svg>
        );
      case 'store':
        return (
          <svg
            className={iconClass}
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
        );
      case 'bell':
        return (
          <svg
            className={iconClass}
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
        );
      case 'flask':
        return (
          <svg
            className={iconClass}
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
        );
      case 'message':
        return (
          <svg
            className={iconClass}
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
        );
      case 'settings':
        return (
          <svg
            className={iconClass}
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
        );
      case 'share':
        return (
          <svg
            className={iconClass}
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
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Mobile Header - Only visible on small screens */}
      <header
        className={`fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden ${className}`}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <BrandLogo
            variant="full"
            iconClassName="h-8 w-auto"
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

        {/* Menu Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          {isOpen ? (
            <X className="h-6 w-6 text-gray-700" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700" />
          )}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <nav
        className={`fixed bottom-0 right-0 top-14 z-40 w-72 transform bg-white shadow-xl transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto">
          {/* Main Navigation */}
          <div className="flex-1 px-3 py-4">
            <div className="space-y-1">
              {/* Quick Entry - AI Ask */}
              <Link
                href={quickEntry.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(quickEntry.href) || isActivePrefix(quickEntry.href)
                    ? `${quickEntry.activeClass} text-gray-900`
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getIcon(quickEntry.icon)}
                <span>{quickEntry.label}</span>
              </Link>

              {/* Section: Materials & Knowledge */}
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {t('nav.sections.materialsKnowledge')}
              </div>
              {materialsItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? `${item.activeClass} text-gray-900`
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getIcon(item.icon)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* Section: Research & Analysis */}
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {t('nav.sections.researchAnalysis')}
              </div>
              {researchItems.map((item) => {
                const active = item.prefix
                  ? isActivePrefix(item.href)
                  : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? `${item.activeClass} text-gray-900`
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getIcon(item.icon)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* Section: Planning & Decision */}
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {t('nav.sections.planningDecision')}
              </div>
              {planningItems.map((item) => {
                const active = item.prefix
                  ? isActivePrefix(item.href)
                  : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? `${item.activeClass} text-gray-900`
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getIcon(item.icon)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* Section: Creative Writing */}
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {t('nav.sections.creativeWriting')}
              </div>
              {creativeItems.map((item) => {
                const active = item.prefix
                  ? isActivePrefix(item.href)
                  : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? `${item.activeClass} text-gray-900`
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getIcon(item.icon)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {isAdmin &&
                adminCreativeItems.map((item) => {
                  const active = item.prefix
                    ? isActivePrefix(item.href)
                    : isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? `${item.activeClass} text-gray-900`
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {getIcon(item.icon)}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}

              {/* Section: 创新 Labs */}
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {t('nav.sections.collabLab')}
              </div>
              {collabLabItems.map((item) => {
                const active = item.prefix
                  ? isActivePrefix(item.href)
                  : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? `${item.activeClass} text-gray-900`
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {getIcon(item.icon)}
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* AI 商店 / 工具市场 — 暂时不要；管理后台直接接在创新 Labs 下 */}

              {isAdmin && (
                <Link
                  href="/admin/overview"
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActivePrefix('/admin')
                      ? 'bg-purple-50 text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {getIcon('settings')}
                  <span>{t('nav.admin')}</span>
                </Link>
              )}
            </div>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-gray-200 px-3 py-4">
            <div className="space-y-1">
              {bottomNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    isActive(item.href)
                      ? 'bg-pink-50 text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {getIcon(item.icon)}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* User Profile */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <UserProfileButton isCollapsed={false} />
            </div>

            {/* Language Switcher */}
            <div className="mt-3">
              <LanguageSwitcher variant="sidebar" />
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for mobile header */}
      <div className="h-14 md:hidden" />
    </>
  );
}
