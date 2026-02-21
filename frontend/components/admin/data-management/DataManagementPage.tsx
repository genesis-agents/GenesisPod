'use client';

import React, { useState } from 'react';
import { Plus, Shield, Settings, BarChart3, Upload } from 'lucide-react';
import { DataImportDialog } from './DataImportDialog';
import { SourceWhitelistManager } from './SourceWhitelistManager';
import { CollectionRuleManager } from './CollectionRuleManager';
import { CollectionMonitor } from './CollectionMonitor';
import { DataQualityManager } from './DataQualityManager';

type ResourceType =
  | 'PAPER'
  | 'PROJECT'
  | 'NEWS'
  | 'YOUTUBE_VIDEO'
  | 'RSS'
  | 'REPORT'
  | 'EVENT';

const RESOURCE_TYPES: Array<{
  id: ResourceType;
  name: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    id: 'PAPER',
    name: '学术论文',
    icon: '📄',
    description: '从arXiv、IEEE等学术库导入论文',
  },
  {
    id: 'PROJECT',
    name: '开源项目',
    icon: '💻',
    description: '从GitHub、GitLab等导入开源项目',
  },
  {
    id: 'NEWS',
    name: '科技新闻',
    icon: '📰',
    description: '从TechCrunch、Ars Technica等导入新闻',
  },
  {
    id: 'YOUTUBE_VIDEO',
    name: 'YouTube视频',
    icon: '🎬',
    description: '从YouTube导入技术视频',
  },
  {
    id: 'RSS',
    name: 'RSS订阅',
    icon: '🔔',
    description: '添加RSS订阅源进行定期采集',
  },
  {
    id: 'REPORT',
    name: '行业报告',
    icon: '📊',
    description: '从Gartner、Forrester等导入报告',
  },
  {
    id: 'EVENT',
    name: '技术活动',
    icon: '🎪',
    description: '从会议、研讨会导入活动信息',
  },
];

export function DataManagementPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedResourceType, setSelectedResourceType] =
    useState<ResourceType>('PAPER');
  const [activeTab, setActiveTab] = useState('whitelists');

  const handleImportClick = (resourceType: ResourceType) => {
    setSelectedResourceType(resourceType);
    setImportDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">数据管理中心</h1>
        <p className="mt-2 text-gray-600">
          统一管理各类数据的导入、采集规则、质量控制和监控
        </p>
      </div>

      {/* 快速导入卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {RESOURCE_TYPES.map((type) => (
          <div
            key={type.id}
            onClick={() => handleImportClick(type.id)}
            className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-lg"
          >
            <div className="mb-3 text-3xl">{type.icon}</div>
            <h3 className="text-sm font-semibold">{type.name}</h3>
            <p className="mt-1 text-xs text-gray-600">{type.description}</p>
            <button className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50">
              <Plus className="mb-0.5 mr-1 inline h-3 w-3" />
              导入
            </button>
          </div>
        ))}
      </div>

      {/* 管理标签页 */}
      <div className="space-y-4">
        <div className="border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('whitelists')}
              className={`border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === 'whitelists'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Shield className="mr-1 inline h-4 w-4" />
              白名单
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === 'rules'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="mr-1 inline h-4 w-4" />
              采集规则
            </button>
            <button
              onClick={() => setActiveTab('monitor')}
              className={`border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === 'monitor'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart3 className="mr-1 inline h-4 w-4" />
              监控
            </button>
            <button
              onClick={() => setActiveTab('quality')}
              className={`border-b-2 px-1 py-4 text-sm font-medium ${
                activeTab === 'quality'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Upload className="mr-1 inline h-4 w-4" />
              质量
            </button>
          </div>
        </div>

        {/* 来源白名单管理 */}
        {activeTab === 'whitelists' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold">来源白名单管理</h2>
              <p className="mt-1 text-sm text-gray-600">
                为每个资源类型配置允许的数据源，确保数据来源合法性
              </p>
              <div className="mt-4">
                <SourceWhitelistManager />
              </div>
            </div>
          </div>
        )}

        {/* 采集规则管理 */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold">采集规则配置</h2>
              <p className="mt-1 text-sm text-gray-600">
                定义采集调度、并发限制、去重策略和质量过滤
              </p>
              <div className="mt-4">
                <CollectionRuleManager />
              </div>
            </div>
          </div>
        )}

        {/* 采集监控 */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold">采集任务监控</h2>
              <p className="mt-1 text-sm text-gray-600">
                实时监控采集任务状态、统计数据和错误信息
              </p>
              <div className="mt-4">
                <CollectionMonitor />
              </div>
            </div>
          </div>
        )}

        {/* 数据质量管理 */}
        {activeTab === 'quality' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold">数据质量管理</h2>
              <p className="mt-1 text-sm text-gray-600">
                管理数据去重、质量评分、问题标记和审核状态
              </p>
              <div className="mt-4">
                <DataQualityManager />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 导入对话框 */}
      <DataImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        resourceType={selectedResourceType}
      />
    </div>
  );
}
