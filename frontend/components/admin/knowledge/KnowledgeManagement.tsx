'use client';

/**
 * KnowledgeManagement —— 2026-05-11 W1 stub
 *
 * AI Engine 4 张卡片之一（与 模型/工具/技能 平级），admin 视角对全系统
 * 知识资产的统一管理入口。3 个 tab 全表格视图，行点击 → 右侧抽屉详情：
 *   - 知识库：跨用户 KB 列表（owner / 文档数 / 大小 / 同步状态）
 *   - 文档：跨 KB 的 doc 列表（raw / chunks / embed 状态）
 *   - Wiki：跨 KB 的 wiki 页面列表（最新 markdown / diff）
 *
 * W1 是结构 stub —— tab 切换可用，内容占位"建设中"。
 * W2 接通 backend admin 列表接口 + 表格 + 抽屉真数据。
 *
 * 风格约束：light-only + Lucide + 与 BYOKDictionaryModal / 模型管理一致。
 */

import { useState } from 'react';
import { BookOpen, FileText, BookText, Construction } from 'lucide-react';

type TabKey = 'kbs' | 'documents' | 'wiki';

const TABS: Array<{ key: TabKey; label: string; icon: typeof BookOpen }> = [
  { key: 'kbs', label: '知识库', icon: BookOpen },
  { key: 'documents', label: '文档', icon: FileText },
  { key: 'wiki', label: 'Wiki', icon: BookText },
];

const PLACEHOLDER_HINT: Record<TabKey, string> = {
  kbs: '跨用户 KB 列表（name / owner / 类型 / 文档数 / 已嵌入 chunks / 大小 / 上次同步 / 状态）。行点击 → 抽屉看文档列表、Wiki/KG 启用开关、自动同步配置、强制重嵌入。',
  documents:
    '跨 KB 的全局文档列表（title / KB / sourceType / 大小 / chunk 数 / status / 上次处理时间）。行点击 → 抽屉看 raw 内容预览、chunks 列表、embedding 状态、错误日志、重新处理按钮。',
  wiki: '跨 KB 的 Wiki 页面列表（slug / KB / 维度 / 字数 / 最近改动）。行点击 → 抽屉看 markdown 渲染 + 最近 WikiDiff 列表 + revert 操作。',
};

export default function KnowledgeManagement() {
  const [activeTab, setActiveTab] = useState<TabKey>('kbs');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
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

      {/* Tab content — W1 stub placeholder */}
      <div className="rounded-lg border border-gray-200 bg-white p-12">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Construction className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">建设中</h3>
          <p className="text-sm leading-relaxed text-gray-600">
            {PLACEHOLDER_HINT[activeTab]}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            W2 接通 backend admin 列表接口，表格 + 抽屉真数据上线
          </p>
        </div>
      </div>
    </div>
  );
}
