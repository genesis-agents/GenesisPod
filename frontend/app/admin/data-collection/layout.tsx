'use client';

import Sidebar from '@/components/layout/Sidebar';
import {
  LayoutDashboard,
  Database,
  Users,
  Bot,
  Plug,
  Shield,
  HardDrive,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AIAssistant from '@/components/admin/AIAssistant';

type AIAssistantContext =
  | 'whitelist'
  | 'quality'
  | 'ai-models'
  | 'system'
  | 'dashboard'
  | 'users'
  | 'collection'
  | 'external-api'
  | 'storage';

export default function DataCollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    // 核心管理
    {
      name: 'Dashboard',
      href: '/data-collection/dashboard',
      icon: LayoutDashboard,
      description: 'System overview and key metrics',
    },
    {
      name: 'Users',
      href: '/data-collection/users',
      icon: Users,
      description: 'User accounts and permissions',
    },
    {
      name: 'Collection',
      href: '/data-collection/config',
      icon: Database,
      description: 'Data sources and collection rules',
    },
    {
      name: 'Whitelists',
      href: '/data-collection/whitelists',
      icon: Shield,
      description: 'Source whitelist management',
    },
    {
      name: 'AI Models',
      href: '/data-collection/ai-models',
      icon: Bot,
      description: 'AI model configuration',
    },
    {
      name: 'External API',
      href: '/data-collection/external-api',
      icon: Plug,
      description: 'Search and third-party API configuration',
    },
    // 存储管理
    {
      name: 'Storage',
      href: '/data-collection/storage',
      icon: HardDrive,
      description: 'Railway storage management',
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50/30">
      <Sidebar />
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
                  System Management
                </h1>
                <p className="text-sm text-gray-500">
                  Admin control panel for system management
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-100 bg-white/50 backdrop-blur-sm">
            <div className="px-8">
              <nav className="flex space-x-1" aria-label="Data collection tabs">
                {tabs.map((tab) => {
                  const isActive = pathname === tab.href;
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="group relative px-4 py-3.5 transition-all"
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

      {/* AI Assistant - 根据当前路由自动切换上下文 */}
      <AIAssistant context={getAIContext(pathname)} />
    </div>
  );
}

// 根据路径获取 AI 助手上下文
function getAIContext(pathname: string): AIAssistantContext {
  if (pathname.includes('/whitelists')) return 'whitelist';
  if (pathname.includes('/quality')) return 'quality';
  if (pathname.includes('/ai-models')) return 'ai-models';
  if (pathname.includes('/external-api')) return 'external-api';
  if (pathname.includes('/storage')) return 'storage';
  if (pathname.includes('/users')) return 'users';
  if (
    pathname.includes('/config') ||
    pathname.includes('/scheduler') ||
    pathname.includes('/batch')
  )
    return 'collection';
  return 'dashboard';
}
