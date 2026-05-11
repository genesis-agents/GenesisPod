'use client';

/**
 * ToolsManagement —— 2026-05-11 W3r2 4-tab structure
 *
 * AI Engine 4 张卡片之一（与 模型/技能/知识 平级）。4 个 tab：
 *   - 内置工具 (BuiltinToolsTable)：implemented:true 的 Registry 工具，按
 *     category 分组（web-search / web-extraction / ...），每行启用 / 测试。
 *   - API 服务工具 (APIServicesTable)：implemented:false 的 DB-only API key
 *     持有者（firecrawl / jina / elevenlabs / perplexity ...），按用途分组
 *     （网页搜索 / 学术搜索 / 政策研究 / 内容抓取 / TTS / ...），每行
 *     启用 / 测试 + 抽屉内 API Key 配置。
 *   - MCP 工具 (MCPMarketplaceTable)：市场卡片，预设 + 自定义，已安装/已连接
 *     在卡片标识。
 *   - 第三方工具 (ScrapingSourcesTable)：industry-report 的 config.sources
 *     抓取源列表，单表格直接呈现。
 */
import { useState } from 'react';
import { Zap, Wrench, Server, Globe } from 'lucide-react';
import { BuiltinToolsTable } from './tools/BuiltinToolsTable';
import { APIServicesTable } from './tools/APIServicesTable';
import { MCPMarketplaceTable } from './tools/MCPMarketplaceTable';
import { ScrapingSourcesTable } from './tools/ScrapingSourcesTable';

type TabKey = 'builtin' | 'api-services' | 'mcp' | 'third-party';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Zap }> = [
  { key: 'builtin', label: '内置工具', icon: Zap },
  { key: 'api-services', label: 'API 服务工具', icon: Wrench },
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
      {activeTab === 'api-services' && <APIServicesTable />}
      {activeTab === 'mcp' && <MCPMarketplaceTable />}
      {activeTab === 'third-party' && <ScrapingSourcesTable />}
    </div>
  );
}
