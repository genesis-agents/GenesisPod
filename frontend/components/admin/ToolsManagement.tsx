'use client';

/**
 * ToolsManagement —— 2026-05-11 W3r table-first refactor (round 2)
 *
 * AI Engine 4 张卡片之一（与 模型/技能/知识 平级）。3 个 tab：
 *   - 内置工具 (BuiltinToolsTable)：所有工具（registry + DB-only）按 category 分组，
 *     每行带启用 / 测试，抽屉内含 API Key 配置（之前在第三方 sub-tab 的 API 服务
 *     合并进来了，避免重叠）。industry-report 不展示在这里。
 *   - MCP 工具 (MCPMarketplaceTable)：市场风格卡片，预设 + 自定义两组，已安装/
 *     已连接在卡片右上角标识，未安装走"安装"对话框配置 env vars。
 *   - 第三方工具 (ScrapingSourcesTable)：去 sub-tab，直接表格呈现 industry-report
 *     的 config.sources（抓取源列表）。
 */
import { useState } from 'react';
import { Zap, Server, Globe } from 'lucide-react';
import { BuiltinToolsTable } from './tools/BuiltinToolsTable';
import { MCPMarketplaceTable } from './tools/MCPMarketplaceTable';
import { ScrapingSourcesTable } from './tools/ScrapingSourcesTable';

type TabKey = 'builtin' | 'mcp' | 'third-party';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Zap }> = [
  { key: 'builtin', label: '内置工具', icon: Zap },
  { key: 'mcp', label: 'MCP 工具', icon: Server },
  { key: 'third-party', label: '第三方工具', icon: Globe },
];

export default function ToolsManagement() {
  const [activeTab, setActiveTab] = useState<TabKey>('builtin');

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'builtin' && <BuiltinToolsTable />}
      {activeTab === 'mcp' && <MCPMarketplaceTable />}
      {activeTab === 'third-party' && <ScrapingSourcesTable />}
    </div>
  );
}
