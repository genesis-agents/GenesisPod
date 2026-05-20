'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import {
  ADMIN_NAVIGATION,
  isNavItemActive,
  isNavGroupActive,
  type NavGroup,
  type NavItem,
} from '@/lib/features/admin/navigation';
import { ADMIN_COLORS, type AdminDomain } from '@/lib/features/admin/styles';
import { cn } from '@/lib/utils/common';

interface AdminSidebarProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function AdminSidebar({
  collapsed = false,
  onCollapsedChange,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => {
      // Auto-expand the active group on initial load
      const initial: Record<string, boolean> = {};
      ADMIN_NAVIGATION.forEach((group) => {
        initial[group.key] = isNavGroupActive(group, pathname || '');
      });
      return initial;
    }
  );

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleCollapseToggle = () => {
    onCollapsedChange?.(!collapsed);
  };

  const getDomainColorClasses = (domain: AdminDomain, isActive: boolean) => {
    const colors = ADMIN_COLORS[domain];
    if (isActive) {
      return `${colors.bg} ${colors.text}`;
    }
    return 'text-gray-600 hover:bg-gray-50 hover:text-gray-900';
  };

  const getGroupIconColor = (domain: AdminDomain, isExpanded: boolean) => {
    const colors = ADMIN_COLORS[domain];
    return isExpanded ? colors.icon : 'text-gray-400';
  };

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-100 bg-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
        {!collapsed && (
          <span className="text-sm font-semibold text-gray-900">
            {t('admin.console')}
          </span>
        )}
        <button
          onClick={handleCollapseToggle}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600',
            collapsed && 'mx-auto'
          )}
          title={
            collapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')
          }
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {ADMIN_NAVIGATION.map((group) => (
          <NavGroupComponent
            key={group.key}
            group={group}
            pathname={pathname || ''}
            collapsed={collapsed}
            expanded={expandedGroups[group.key] ?? false}
            onToggle={() => toggleGroup(group.key)}
            t={t}
            getDomainColorClasses={getDomainColorClasses}
            getGroupIconColor={getGroupIconColor}
          />
        ))}
      </nav>
    </aside>
  );
}

interface NavGroupComponentProps {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
  getDomainColorClasses: (domain: AdminDomain, isActive: boolean) => string;
  getGroupIconColor: (domain: AdminDomain, isExpanded: boolean) => string;
}

function NavGroupComponent({
  group,
  pathname,
  collapsed,
  expanded,
  onToggle,
  t,
  getDomainColorClasses,
  getGroupIconColor,
}: NavGroupComponentProps) {
  const isGroupActive = isNavGroupActive(group, pathname);
  const Icon = group.icon;
  const colors = ADMIN_COLORS[group.domain];

  // Single item group (like Overview) - render as direct link
  if (group.items.length === 1) {
    const item = group.items[0];
    const isActive = isNavItemActive(item.href, pathname);

    if (collapsed) {
      return (
        <Link
          href={item.href}
          className={cn(
            'mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            getDomainColorClasses(group.domain, isActive)
          )}
          title={t(item.labelKey)}
        >
          <Icon className="h-5 w-5" />
        </Link>
      );
    }

    return (
      <Link
        href={item.href}
        className={cn(
          'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          getDomainColorClasses(group.domain, isActive)
        )}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span>{t(item.labelKey)}</span>
      </Link>
    );
  }

  // Multi-item group with expandable children
  if (collapsed) {
    // Show only group icon in collapsed mode
    return (
      <div className="mb-1">
        <button
          onClick={onToggle}
          className={cn(
            'mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            isGroupActive
              ? `${colors.bg} ${colors.icon}`
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          )}
          title={t(group.titleKey)}
        >
          <Icon className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isGroupActive && expanded
            ? `${colors.bg} ${colors.text}`
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5 flex-shrink-0',
            getGroupIconColor(group.domain, expanded || isGroupActive)
          )}
        />
        <span className="flex-1 text-left">{t(group.titleKey)}</span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Group items */}
      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-100 pl-3">
          {group.items.map((item) => (
            <NavItemComponent
              key={item.key}
              item={item}
              pathname={pathname}
              domain={group.domain}
              t={t}
              getDomainColorClasses={getDomainColorClasses}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NavItemComponentProps {
  item: NavItem;
  pathname: string;
  domain: AdminDomain;
  t: (key: string) => string;
  getDomainColorClasses: (domain: AdminDomain, isActive: boolean) => string;
}

function NavItemComponent({
  item,
  pathname,
  domain,
  t,
  getDomainColorClasses,
}: NavItemComponentProps) {
  const isActive = isNavItemActive(item.href, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
        getDomainColorClasses(domain, isActive)
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
