'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  ADMIN_NAVIGATION,
  isNavItemActive,
  isNavGroupActive,
  type NavGroup,
} from '@/lib/admin/navigation';
import { ADMIN_COLORS } from '@/lib/admin/styles';
import { cn } from '@/lib/utils/common';

/**
 * AdminTabNav - 顶部 Tab 导航组件
 *
 * 结构：
 * - 主 Tab 栏：显示所有导航分组
 * - 子 Tab 栏：当选中有多个子项的分组时显示
 */
export default function AdminTabNav() {
  const pathname = usePathname() || '';
  const { t } = useTranslation();

  // 获取当前激活的分组
  const activeGroup = ADMIN_NAVIGATION.find((group) =>
    isNavGroupActive(group, pathname)
  );

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* 主 Tab 栏 */}
      <div className="border-b border-gray-100">
        <div className="flex items-center px-4">
          {/* Logo/Title */}
          <Link
            href="/admin/overview"
            className="mr-8 flex items-center gap-2 py-3"
          >
            <span className="text-lg font-semibold text-gray-900">
              {t('admin.console')}
            </span>
          </Link>

          {/* 主导航 Tabs */}
          <nav className="flex items-center gap-1">
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
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <span>← {t('admin.backToSite')}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 子 Tab 栏 - 仅当分组有多个子项时显示 */}
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
  const colors = ADMIN_COLORS[group.domain];
  const Icon = group.icon;

  // 对于单项分组，直接链接到该项
  // 对于多项分组，链接到第一个子项
  const href = group.items[0].href;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? `${colors.bg} ${colors.text}`
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{t(group.titleKey)}</span>
    </Link>
  );
}

interface SubTabBarProps {
  group: NavGroup;
  pathname: string;
  t: (key: string) => string;
}

function SubTabBar({ group, pathname, t }: SubTabBarProps) {
  const colors = ADMIN_COLORS[group.domain];

  return (
    <div className="bg-gray-50/50 px-4 py-2">
      <nav className="flex items-center gap-1">
        {group.items.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
          const ItemIcon = item.icon;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? `bg-white shadow-sm ${colors.text} font-medium`
                  : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
              )}
            >
              <ItemIcon className="h-3.5 w-3.5" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
