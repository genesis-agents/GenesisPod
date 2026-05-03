'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { User, LogOut, LogIn, UserCircle, Coins, Bot } from 'lucide-react';
import Link from 'next/link';
import { useCreditsStore } from '@/stores';
import { useTranslation } from '@/lib/i18n';

interface UserProfileButtonProps {
  isCollapsed?: boolean;
}

/**
 * UserProfileButton - User authentication and profile button
 *
 * Features:
 * - Login button when not authenticated
 * - User avatar with dropdown menu when authenticated
 * - Logout functionality
 * - Adapts to sidebar collapsed/expanded state
 */
export default function UserProfileButton({
  isCollapsed = false,
}: UserProfileButtonProps) {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ bottom: 0, left: 0 });
  const { t } = useTranslation();
  const {
    account,
    checkinStatus,
    isCheckingIn,
    fetchBalance,
    fetchCheckinStatus,
    performCheckin,
    showCheckinModal,
  } = useCreditsStore();

  // 初始化加载积分数据
  useEffect(() => {
    if (user) {
      fetchBalance();
      fetchCheckinStatus();
    }
  }, [user, fetchBalance, fetchCheckinStatus]);

  // 处理签到
  const handleCheckin = async () => {
    if (!checkinStatus?.canCheckin || isCheckingIn) return;
    await performCheckin();
    showCheckinModal();
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div
        className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm`}
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
      </div>
    );
  }

  // Not logged in - show login button
  if (!user) {
    return (
      <button
        onClick={() => router.push('/login')}
        className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50`}
        title="Login"
      >
        <LogIn className="h-5 w-5 flex-shrink-0" />
        {!isCollapsed && <span>Login</span>}
      </button>
    );
  }

  // Logged in - show user profile with dropdown
  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!showMenu && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
              bottom: window.innerHeight - rect.top + 8,
              left: rect.left,
            });
          }
          setShowMenu(!showMenu);
        }}
        className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50`}
        title={user.username || user.email}
      >
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username || user.email}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-3.5 w-3.5 text-gray-600" />
          )}
        </div>
        {!isCollapsed && (
          <span className="flex-1 truncate text-left text-gray-900">
            {user.fullName ||
              user.username ||
              user.email?.split('@')[0] ||
              'User'}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          className="fixed z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{
            bottom: `${menuPosition.bottom}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          <div className="border-b border-gray-200 p-3">
            <div className="font-medium text-gray-900">
              {user.fullName || user.username || 'User'}
            </div>
            <div className="mt-0.5 truncate text-sm text-gray-500">
              {user.email}
            </div>
            {/* Credits Balance */}
            <div className="mt-2 flex items-center justify-between rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">
                  {t('credits.balance')}
                </span>
              </div>
              <span className="font-semibold text-blue-600">
                {account?.balance ?? 0}
              </span>
            </div>
          </div>
          <div className="p-1">
            <Link
              href="/profile"
              onClick={() => setShowMenu(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <UserCircle className="h-4 w-4" />
              <span>{t('common.profile')}</span>
            </Link>
            <Link
              href="/me/ai"
              onClick={() => setShowMenu(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Bot className="h-4 w-4" />
              <span>{t('common.myAIConfig')}</span>
            </Link>
            <Link
              href="/credits"
              onClick={() => setShowMenu(false)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Coins className="h-4 w-4" />
              <span>{t('credits.center')}</span>
            </Link>
            {checkinStatus?.canCheckin && (
              <button
                onClick={() => {
                  handleCheckin();
                  setShowMenu(false);
                }}
                disabled={isCheckingIn}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
              >
                {isCheckingIn ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-300 border-t-green-600" />
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                  </svg>
                )}
                <span>{t('credits.checkin')}</span>
              </button>
            )}
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => {
                logout();
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
