'use client';

/**
 * ToolsManagement —— 2026-05-11 W3 table-first refactor
 *
 * AI Engine 4 张卡片之一（与 模型/技能/知识 平级），admin 视角对所有工具的统一管理。
 * 3 个 tab 全表格视图，行点击 → 右侧抽屉详情：
 *   - 内置工具：ToolRegistry 实现的工具（implemented:true）。toggle 启用 / 测试
 *   - MCP 工具：MCP servers（stdio / sse）。连接 / 断开 / 删除
 *   - 第三方工具：
 *       · API 服务 sub-tab：DB-only 配置工具（implemented:false）
 *       · 抓取源 sub-tab：industry-report 的 config.sources 子表
 *
 * 风格约束：light-only + Lucide + 与 KnowledgeManagement / BYOKDictionaryModal 一致。
 */
import { useState } from 'react';
import { Zap, Server, Globe } from 'lucide-react';
import { BuiltinToolsTable } from './tools/BuiltinToolsTable';
import { MCPServersTable } from './tools/MCPServersTable';
import { ThirdPartyToolsTable } from './tools/ThirdPartyToolsTable';

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
      {activeTab === 'mcp' && <MCPServersTable />}
      {activeTab === 'third-party' && <ThirdPartyToolsTable />}
    </div>
  );
}
