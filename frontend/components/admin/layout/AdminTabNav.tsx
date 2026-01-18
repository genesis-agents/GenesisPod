'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  ADMIN_NAVIGATION,
  isNavItemActive,
  isNavGroupActive,
  type NavGroup,
} from '@/lib/admin/navigation';
import { cn } from '@/lib/utils/common';

/**
 * AdminTabNav - 精致的顶部 Tab 导航组件
 */
export default function AdminTabNav() {
  const pathname = usePathname() || '';
  const { t } = useTranslation();

  const activeGroup = ADMIN_NAVIGATION.find((group) =>
    isNavGroupActive(group, pathname)
  );

  return (
    <div className="relative">
      {/* 主导航栏 - 精致的玻璃态效果 */}
      <div className="border-b border-gray-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50">
        <div className="flex h-14 items-center px-6">
          {/* Logo/Title - 更精致的标题设计 */}
          <Link
            href="/admin/overview"
            className="group mr-10 flex items-center gap-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200/50 transition-shadow group-hover:shadow-lg group-hover:shadow-indigo-300/50">
              <Settings className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-gray-900">
                {t('admin.console')}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Management
              </span>
            </div>
          </Link>

          {/* 主导航 Tabs - 更精致的样式 */}
          <nav className="flex items-center">
            {ADMIN_NAVIGATION.map((group) => (
              <MainTab
                key={group.key}
                group={group}
                pathname={pathname}
                t={t}
              />
            ))}
          </nav>

          {/* 右侧：返回主站 */}
          <div className="ml-auto">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('admin.backToSite')}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 子 Tab 栏 - 更精致的二级导航 */}
      {activeGroup && activeGroup.items.length > 1 && (
        <SubTabBar group={activeGroup} pathname={pathname} t={t} />
      )}
    </div>
  );
}

interface MainTabProps {
  group: NavGroup;
  pathname: string;
  t: (key: string) => string;
}

function MainTab({ group, pathname, t }: MainTabProps) {
  const isActive = isNavGroupActive(group, pathname);
  const Icon = group.icon;
  const href = group.items[0].href;

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200',
        isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 transition-colors',
          isActive ? 'text-indigo-500' : 'text-gray-400'
        )}
      />
      <span>{t(group.titleKey)}</span>
      {/* 激活指示器 - 精致的底部线条 */}
      {isActive && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
      )}
    </Link>
  );
}

interface SubTabBarProps {
  group: NavGroup;
  pathname: string;
  t: (key: string) => string;
}

function SubTabBar({ group, pathname, t }: SubTabBarProps) {
  return (
    <div className="border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm">
      <div className="px-6">
        <nav className="flex items-center gap-1 py-2">
          {group.items.map((item) => {
            const isActive = isNavItemActive(item.href, pathname);
            const ItemIcon = item.icon;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-white font-medium text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                    : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
                )}
              >
                <ItemIcon
                  className={cn(
                    'h-3.5 w-3.5',
                    isActive ? 'text-indigo-500' : 'text-gray-400'
                  )}
                />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
