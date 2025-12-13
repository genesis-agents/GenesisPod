'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { CollectionConfigurationPanel } from './CollectionConfigurationPanel';

type ResourceType = 'PAPER' | 'BLOG' | 'REPORT' | 'YOUTUBE_VIDEO' | 'NEWS';
type ManagementTab = 'configuration' | 'monitoring' | 'quality';

const RESOURCE_TYPES: Array<{
  id: ResourceType;
  name: string;
  icon: string;
  description: string;
}> = [
  {
    id: 'PAPER',
    name: '学术论文',
    icon: '📄',
    description: 'arXiv、IEEE等学术库',
  },
  {
    id: 'BLOG',
    name: '研究博客',
    icon: '📝',
    description: '大厂研究博客',
  },
  {
    id: 'REPORT',
    name: '商业报告',
    icon: '📊',
    description: 'Gartner、SemiAnalysis等',
  },
  {
    id: 'YOUTUBE_VIDEO',
    name: 'YouTube视频',
    icon: '🎬',
    description: '技术视频内容',
  },
  {
    id: 'NEWS',
    name: '科技新闻',
    icon: '📰',
    description: '技术新闻网站',
  },
];

const MANAGEMENT_TABS: Array<{
  id: ManagementTab;
  name: string;
  icon?: React.ComponentType<{ className?: string }> | null;
  emoji?: string;
}> = [
  {
    id: 'configuration',
    name: '采集配置',
    emoji: '⚙️',
  },
  {
    id: 'monitoring',
    name: '监控',
    icon: BarChart3,
  },
  {
    id: 'quality',
    name: '质量',
    icon: AlertCircle,
  },
];

export function NewDataManagementPage() {
  const [selectedResourceType, setSelectedResourceType] =
    useState<ResourceType>('PAPER');
  const [activeTab, setActiveTab] = useState<ManagementTab>('configuration');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Mock statistics data
  const stats = {
    totalCollected: 1234,
    todayCollected: 45,
    successRate: 98.5,
    duplicates: 34,
    qualityScore: 4.2,
    needsReview: 12,
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar - Resource Type Selection */}
      <div
        className={`border-r border-gray-200 bg-white transition-all duration-300 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
          {!sidebarCollapsed && (
            <h2 className="font-semibold text-gray-900">采集源</h2>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded p-1 hover:bg-gray-100"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="space-y-2 p-3">
          {RESOURCE_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedResourceType(type.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedResourceType === type.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={type.description}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{type.icon}</span>
                {!sidebarCollapsed && <span>{type.name}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col">
        {/* Top Navigation Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex items-center gap-4 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {RESOURCE_TYPES.find((t) => t.id === selectedResourceType)?.name}
            </h1>
            <div className="ml-auto flex gap-2">
              {MANAGEMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.emoji ? (
                    <span>{tab.emoji}</span>
                  ) : tab.icon ? (
                    <tab.icon className="h-4 w-4" />
                  ) : null}
                  {tab.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content and Statistics */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 overflow-auto p-6">
            {activeTab === 'configuration' && (
              <CollectionConfigurationPanel
                resourceType={selectedResourceType}
              />
            )}

            {activeTab === 'monitoring' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">采集监控</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">今日采集</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {stats.todayCollected}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">成功率</p>
                    <p className="mt-2 text-3xl font-bold text-green-600">
                      {stats.successRate}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">重复项</p>
                    <p className="mt-2 text-3xl font-bold text-orange-600">
                      {stats.duplicates}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'quality' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">数据质量</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">质量评分</p>
                    <p className="mt-2 text-3xl font-bold text-blue-600">
                      {stats.qualityScore}/5
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">待审核</p>
                    <p className="mt-2 text-3xl font-bold text-yellow-600">
                      {stats.needsReview}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm text-gray-600">总采集数</p>
                    <p className="mt-2 text-3xl font-bold text-purple-600">
                      {stats.totalCollected}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Statistics */}
          <div className="w-80 border-l border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">采集统计</h3>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    总数据量
                  </span>
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-900">
                  {stats.totalCollected}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    今日新增
                  </span>
                  <div className="text-2xl text-green-600">📈</div>
                </div>
                <p className="mt-2 text-2xl font-bold text-green-900">
                  +{stats.todayCollected}
                </p>
              </div>

              <div className="rounded-lg bg-orange-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    重复项
                  </span>
                  <div className="text-2xl text-orange-600">🔄</div>
                </div>
                <p className="mt-2 text-2xl font-bold text-orange-900">
                  {stats.duplicates}
                </p>
              </div>

              <div className="rounded-lg bg-yellow-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    需审核
                  </span>
                  <div className="text-2xl text-yellow-600">⚠️</div>
                </div>
                <p className="mt-2 text-2xl font-bold text-yellow-900">
                  {stats.needsReview}
                </p>
              </div>

              <div className="rounded-lg bg-purple-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    质量评分
                  </span>
                  <div className="text-2xl text-purple-600">⭐</div>
                </div>
                <p className="mt-2 text-2xl font-bold text-purple-900">
                  {stats.qualityScore}/5
                </p>
              </div>

              <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                查看详细报告
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
