/**
 * Admin 导航配置
 * 定义侧边栏结构、路由映射和路由重定向
 */

import {
  LayoutDashboard,
  Bot,
  UsersRound,
  Wrench,
  Plug,
  Database,
  Shield,
  Sparkles,
  Users,
  Key,
  KeySquare,
  Inbox,
  ShieldCheck,
  Globe,
  Mail,
  HardDrive,
  Cpu,
  Coins,
  CreditCard,
  Bell,
  MessageSquare,
  ScrollText,
  Activity,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import { type AdminDomain } from './styles';

// 导航项类型
export interface NavItem {
  key: string;
  labelKey: string; // i18n key
  href: string;
  icon: LucideIcon;
}

// 导航分组类型
export interface NavGroup {
  key: string;
  titleKey: string; // i18n key
  domain: AdminDomain;
  icon: LucideIcon;
  items: NavItem[];
}

// 导航配置
export const ADMIN_NAVIGATION: NavGroup[] = [
  {
    key: 'overview',
    titleKey: 'admin.nav.overview',
    domain: 'overview',
    icon: LayoutDashboard,
    items: [
      {
        key: 'dashboard',
        labelKey: 'admin.nav.dashboard',
        href: '/admin/overview',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    key: 'ai',
    titleKey: 'admin.nav.aiConfig',
    domain: 'ai',
    icon: Bot,
    items: [
      {
        key: 'models',
        labelKey: 'admin.nav.models',
        href: '/admin/ai/models',
        icon: Bot,
      },
      {
        key: 'recommendations',
        labelKey: 'admin.nav.recommendations',
        href: '/admin/ai/recommendations',
        icon: Sparkles,
      },
      {
        key: 'teams',
        labelKey: 'admin.nav.teams',
        href: '/admin/ai/teams',
        icon: UsersRound,
      },
      {
        key: 'skills',
        labelKey: 'admin.nav.skills',
        href: '/admin/ai/skills',
        icon: Sparkles,
      },
      {
        key: 'tools',
        labelKey: 'admin.nav.tools',
        href: '/admin/ai/tools',
        icon: Wrench,
      },
      {
        key: 'infra-report',
        labelKey: 'admin.nav.infraReport',
        href: '/reports/agent-infra-impact.html',
        icon: Cpu,
      },
    ],
  },
  {
    key: 'data',
    titleKey: 'admin.nav.dataManagement',
    domain: 'data',
    icon: Database,
    items: [
      {
        key: 'collection',
        labelKey: 'admin.nav.collection',
        href: '/admin/data/collection',
        icon: Database,
      },
      {
        key: 'whitelists',
        labelKey: 'admin.nav.whitelists',
        href: '/admin/data/whitelists',
        icon: Shield,
      },
      {
        key: 'quality',
        labelKey: 'admin.nav.quality',
        href: '/admin/data/quality',
        icon: Sparkles,
      },
    ],
  },
  {
    key: 'access',
    titleKey: 'admin.nav.accessControl',
    domain: 'access',
    icon: ShieldCheck,
    items: [
      {
        key: 'users',
        labelKey: 'admin.nav.users',
        href: '/admin/access/users',
        icon: Users,
      },
      {
        key: 'permissions',
        labelKey: 'admin.nav.permissions',
        href: '/admin/access/permissions',
        icon: Shield,
      },
      {
        key: 'credits',
        labelKey: 'admin.nav.credits',
        href: '/admin/access/credits',
        icon: Coins,
      },
      {
        key: 'billing',
        labelKey: 'admin.nav.billing',
        href: '/admin/access/billing',
        icon: CreditCard,
      },
      {
        key: 'secrets',
        labelKey: 'admin.nav.secrets',
        href: '/admin/access/secrets',
        icon: Key,
      },
      {
        key: 'distributable-keys',
        labelKey: 'admin.nav.distributableKeys',
        href: '/admin/access/distributable-keys',
        icon: KeySquare,
      },
      {
        key: 'key-assignments',
        labelKey: 'admin.nav.keyAssignments',
        href: '/admin/access/key-assignments',
        icon: Users,
      },
      {
        key: 'key-requests',
        labelKey: 'admin.nav.keyRequests',
        href: '/admin/access/key-requests',
        icon: Inbox,
      },
      {
        key: 'feedback',
        labelKey: 'admin.nav.feedback',
        href: '/admin/feedback',
        icon: MessageSquare,
      },
      {
        key: 'security',
        labelKey: 'admin.nav.security',
        href: '/admin/access/security',
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: 'system',
    titleKey: 'admin.nav.systemSettings',
    domain: 'system',
    icon: Globe,
    items: [
      {
        key: 'site',
        labelKey: 'admin.nav.site',
        href: '/admin/system/site',
        icon: Globe,
      },
      {
        key: 'email',
        labelKey: 'admin.nav.email',
        href: '/admin/system/email',
        icon: Mail,
      },
      {
        key: 'storage',
        labelKey: 'admin.nav.storage',
        href: '/admin/storage',
        icon: HardDrive,
      },
      {
        key: 'notifications',
        labelKey: 'admin.nav.notifications',
        href: '/admin/system/notifications',
        icon: Bell,
      },
      {
        key: 'logs',
        labelKey: 'admin.nav.logs',
        href: '/admin/system/logs',
        icon: ScrollText,
      },
      {
        key: 'monitoring',
        labelKey: 'admin.nav.monitoring',
        href: '/admin/system/monitoring',
        icon: Activity,
      },
      {
        key: 'mcp-server',
        labelKey: 'admin.nav.mcpServer',
        href: '/admin/system/mcp-server',
        icon: Radio,
      },
    ],
  },
];

// 旧路由到新路由的重定向映射
export const ROUTE_REDIRECTS: Record<string, string> = {
  '/admin/dashboard': '/admin/overview',
  '/admin/ai-models': '/admin/ai/models',
  '/admin/ai-teams': '/admin/ai/teams',
  '/admin/capabilities': '/admin/ai/skills',
  '/admin/ai/capabilities': '/admin/ai/skills',
  '/admin/external-api': '/admin/ai/tools',
  '/admin/ai/external-services': '/admin/ai/tools',
  '/admin/collection': '/admin/data/collection',
  '/admin/whitelists': '/admin/data/whitelists',
  '/admin/users': '/admin/access/users',
  '/admin/secrets': '/admin/access/secrets',
};

// 获取所有导航项（扁平化）
export function getAllNavItems(): NavItem[] {
  return ADMIN_NAVIGATION.flatMap((group) => group.items);
}

// 根据路径获取当前导航项
export function getNavItemByPath(pathname: string): NavItem | undefined {
  const allItems = getAllNavItems();
  return allItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  );
}

// 根据路径获取当前导航分组
export function getNavGroupByPath(pathname: string): NavGroup | undefined {
  return ADMIN_NAVIGATION.find((group) =>
    group.items.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )
  );
}

// 检查路径是否匹配导航项
export function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (pathname === itemHref) return true;
  if (pathname.startsWith(itemHref + '/')) return true;
  return false;
}

// 检查路径是否属于某个分组
export function isNavGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isNavItemActive(item.href, pathname));
}

// 获取面包屑数据
export interface BreadcrumbItem {
  label: string;
  labelKey: string;
  href?: string;
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Admin', labelKey: 'admin.console', href: '/admin' },
  ];

  const group = getNavGroupByPath(pathname);
  if (group) {
    breadcrumbs.push({
      label: group.key,
      labelKey: group.titleKey,
    });

    const item = getNavItemByPath(pathname);
    if (item) {
      breadcrumbs.push({
        label: item.key,
        labelKey: item.labelKey,
        href: item.href,
      });
    }
  }

  return breadcrumbs;
}
