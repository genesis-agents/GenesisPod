'use client';

/**
 * KnowledgeManagement —— 2026-05-11 W2 functional
 *
 * AI Engine 4 张卡片之一（与 模型/工具/技能 平级），admin 视角对全系统
 * 知识资产的统一管理入口。3 个 tab 全表格视图，行点击 → 右侧抽屉详情：
 *   - 知识库：跨用户 KB 列表（owner / 文档数 / 成员 / 状态 / 同步时间）
 *   - 文档：跨 KB 的 doc 列表（raw / chunks / embed 状态 / 错误）
 *   - Wiki：跨 KB 的 wiki 页面列表（slug / 分类 / 引用源 / 出向链接）
 *
 * 风格约束：light-only + Lucide + 与 BYOKDictionaryModal / 模型管理一致。
 */

import { useState } from 'react';
import { BookOpen, FileText, BookText } from 'lucide-react';
import { KnowledgeBaseTable } from './KnowledgeBaseTable';
import { DocumentTable } from './DocumentTable';
import { WikiPageTable } from './WikiPageTable';

type TabKey = 'kbs' | 'documents' | 'wiki';

const TABS: Array<{ key: TabKey; label: string; icon: typeof BookOpen }> = [
  { key: 'kbs', label: '知识库', icon: BookOpen },
  { key: 'documents', label: '文档', icon: FileText },
  { key: 'wiki', label: 'Wiki', icon: BookText },
];

export default function KnowledgeManagement() {
  const [activeTab, setActiveTab] = useState<TabKey>('kbs');

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

      {activeTab === 'kbs' && <KnowledgeBaseTable />}
      {activeTab === 'documents' && <DocumentTable />}
      {activeTab === 'wiki' && <WikiPageTable />}
    </div>
  );
}
