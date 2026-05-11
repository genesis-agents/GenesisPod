/**
 * Admin 导航配置
 *
 * Wave 4 重构（2026-05-11）：sidebar 与 L1 Infrastructure 架构图对齐。
 *   - 删除旧 `data` / `access` / `system` 三组（共 18 个 NavItem）
 *   - 新建 `user` / `secret` / `data` / `system` 4 组（每组 1 个 NavItem，指向合并页）
 *   - 旧 deep-link 通过 ROUTE_REDIRECTS 重定向（permissions/credits/billing → users
 *     key-requests → secrets；其余子页保持可直接访问，由合并页索引）
 */

import {
  LayoutDashboard,
  Bot,
  UsersRound,
  Wrench,
  Database,
  Sparkles,
  Users,
  Key,
  Settings,
  BarChart3,
  Network,
  Cpu,
  Shield,
  ShieldCheck,
  Inbox,
  FileText,
  Workflow,
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
        key: 'harness',
        labelKey: 'admin.nav.harness',
        href: '/admin/ai/harness',
        icon: Network,
      },
      {
        key: 'agents',
        labelKey: 'admin.nav.agents',
        href: '/admin/ai/agents',
        icon: Cpu,
      },
      {
        key: 'guardrails',
        labelKey: 'admin.nav.guardrails',
        href: '/admin/ai/guardrails',
        icon: ShieldCheck,
      },
      {
        key: 'approvals',
        labelKey: 'admin.nav.approvals',
        href: '/admin/ai/approvals',
        icon: Inbox,
      },
      {
        key: 'research-templates',
        labelKey: 'admin.nav.researchTemplates',
        href: '/admin/ai/research-templates',
        icon: FileText,
      },
      {
        key: 'eval',
        labelKey: 'admin.nav.eval',
        href: '/admin/ai/eval',
        icon: BarChart3,
      },
      {
        key: 'traces',
        labelKey: 'admin.nav.traces',
        href: '/admin/ai/traces',
        icon: Workflow,
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
    key: 'user',
    titleKey: 'admin.architecture.cards.infraUserManagement',
    domain: 'user',
    icon: Users,
    items: [
      {
        key: 'users',
        labelKey: 'admin.architecture.cards.infraUserManagement',
        href: '/admin/access/users',
        icon: Users,
      },
    ],
  },
  {
    key: 'secret',
    titleKey: 'admin.architecture.cards.infraSecretManagement',
    domain: 'secret',
    icon: Key,
    items: [
      {
        key: 'secrets',
        labelKey: 'admin.architecture.cards.infraSecretManagement',
        href: '/admin/access/secrets',
        icon: Key,
      },
    ],
  },
  {
    key: 'data',
    titleKey: 'admin.architecture.cards.infraDataManagement',
    domain: 'data',
    icon: Database,
    items: [
      {
        key: 'data-hub',
        labelKey: 'admin.architecture.cards.infraDataManagement',
        href: '/admin/data',
        icon: Database,
      },
    ],
  },
  {
    key: 'system',
    titleKey: 'admin.architecture.cards.infraSystemManagement',
    domain: 'system',
    icon: Settings,
    items: [
      {
        key: 'system-hub',
        labelKey: 'admin.architecture.cards.infraSystemManagement',
        href: '/admin/system',
        icon: Settings,
      },
    ],
  },
];

// 旧路由到新路由的重定向映射
//
// Wave 4 (2026-05-11) 重组：
//   permissions / credits / billing → /admin/access/users (行内按钮)
//   key-requests                   → /admin/access/secrets (Tab)
//   其余子页保留独立 URL，由合并页索引链接进入
export const ROUTE_REDIRECTS: Record<string, string> = {
  // 用户管理合并 (Wave 4A)
  '/admin/access/permissions': '/admin/access/users',
  '/admin/access/credits': '/admin/access/users',
  '/admin/access/billing': '/admin/access/users',
  // 密钥管理合并 (Wave 4B)
  '/admin/access/key-requests': '/admin/access/secrets',

  // 历史旧路径
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
