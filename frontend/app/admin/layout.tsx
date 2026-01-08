'use client';

import AppShell from '@/components/layout/AppShell';
import {
  LayoutDashboard,
  Database,
  Users,
  Bot,
  Plug,
  Shield,
  HardDrive,
  Settings,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Admin tabs ordered by management best practices:
  // 1. Overview (Dashboard) - first for quick status check
  // 2. Core Settings (AI Models, External API) - system configuration
  // 3. Content Management (Collection, Whitelists) - data management
  // 4. Access Control (Users) - security and permissions
  // 5. Infrastructure (Storage) - system resources last
  const tabs = [
    {
      name: 'Dashboard',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      description: 'System overview and key metrics',
    },
    {
      name: 'AI Models',
      href: '/admin/ai-models',
      icon: Bot,
      description: 'AI model configuration',
    },
    {
      name: 'AI Teams',
      href: '/admin/ai-teams',
      icon: UsersRound,
      description: 'AI team templates configuration',
    },
    {
      name: 'External API',
      href: '/admin/external-api',
      icon: Plug,
      description: 'Search and third-party API configuration',
    },
    {
      name: 'Collection',
      href: '/admin/collection',
      icon: Database,
      description: 'Data sources and collection rules',
    },
    {
      name: 'Whitelists',
      href: '/admin/whitelists',
      icon: Shield,
      description: 'Source whitelist management',
    },
    {
      name: 'Users',
      href: '/admin/users',
      icon: Users,
      description: 'User accounts and permissions',
    },
    {
      name: 'Storage',
      href: '/admin/storage',
      icon: HardDrive,
      description: 'Database storage management',
    },
    {
      name: 'Settings',
      href: '/admin/settings',
      icon: Settings,
      description: 'System configuration',
    },
  ];

  const isTabActive = (href: string) => {
    if (pathname === href) return true;
    if (pathname?.startsWith(href + '/')) return true;
    return false;
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-gray-100 bg-white/50 px-8 py-6 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Admin Console
                </h1>
                <p className="text-sm text-gray-500">
                  System management and configuration
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-100 bg-white/50 backdrop-blur-sm">
            <div className="px-8">
              <nav
                className="flex space-x-1 overflow-x-auto"
                aria-label="Admin tabs"
              >
                {tabs.map((tab) => {
                  const isActive = isTabActive(tab.href);
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="group relative flex-shrink-0 px-4 py-3.5 transition-all"
                      title={tab.description}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 transition-colors ${
                            isActive
                              ? 'text-blue-600'
                              : 'text-gray-500 group-hover:text-gray-700'
                          }`}
                        />
                        <span
                          className={`text-sm font-medium transition-colors ${
                            isActive
                              ? 'text-gray-900'
                              : 'text-gray-700 group-hover:text-gray-900'
                          }`}
                        >
                          {tab.name}
                        </span>
                      </div>

                      {/* Active indicator */}
                      <div
                        className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${
                          isActive ? 'bg-blue-600' : 'bg-transparent'
                        }`}
                      />
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
