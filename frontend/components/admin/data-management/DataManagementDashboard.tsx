'use client';

import React, { useState } from 'react';
import {
  Settings,
  BarChart3,
  Activity,
  CheckSquare,
  FileText,
  BookOpen,
  BarChart2,
  Youtube,
  Newspaper,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ConfigurationView } from './ConfigurationView';
import { QualityView } from './QualityView';
import { MonitoringView } from './MonitoringView';

type ResourceType = 'PAPER' | 'BLOG' | 'REPORT' | 'YOUTUBE_VIDEO' | 'NEWS';
type ManagementTab = 'overview' | 'configuration' | 'monitoring' | 'quality';

interface DashboardSummary {
  totalResources: number;
  newToday: number;
  successRate: number;
  errorTasks: number;
  pendingTasks: number;
}

interface RecentTask {
  id: string;
  sourceUrl: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  errorMessage: string | null;
}

const RESOURCE_TYPES: Array<{
  id: ResourceType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { id: 'PAPER', name: '学术论文', icon: FileText, color: 'text-blue-600' },
  { id: 'BLOG', name: '研究博客', icon: BookOpen, color: 'text-purple-600' },
  { id: 'REPORT', name: '商业报告', icon: BarChart2, color: 'text-amber-600' },
  {
    id: 'YOUTUBE_VIDEO',
    name: 'YouTube视频',
    icon: Youtube,
    color: 'text-red-600',
  },
  { id: 'NEWS', name: '科技新闻', icon: Newspaper, color: 'text-green-600' },
];

const MANAGEMENT_TABS: Array<{
  id: ManagementTab;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    id: 'overview',
    name: '概览',
    icon: BarChart3,
    description: '全局数据采集概览',
  },
  {
    id: 'configuration',
    name: '配置',
    icon: Settings,
    description: '采集规则和白名单配置',
  },
  {
    id: 'monitoring',
    name: '监控',
    icon: Activity,
    description: '实时监控任务执行',
  },
  {
    id: 'quality',
    name: '质量',
    icon: CheckSquare,
    description: '数据质量管理',
  },
];

const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await fetch('/api/v1/data-management/dashboard/summary');
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard summary');
  }
  return response.json();
};

const fetchRecentTasks = async (): Promise<RecentTask[]> => {
  const response = await fetch(
    '/api/v1/data-management/dashboard/recent-tasks'
  );
  if (!response.ok) {
    throw new Error('Failed to fetch recent tasks');
  }
  return response.json();
};

export function DataManagementDashboard() {
  const [selectedResourceType, setSelectedResourceType] =
    useState<ResourceType>('PAPER');
  const [activeTab, setActiveTab] = useState<ManagementTab>('overview');

  const { data: dashboardSummary, isLoading: isSummaryLoading } = useQuery<
    DashboardSummary,
    Error
  >({
    queryKey: ['dashboardSummary'],
    queryFn: fetchDashboardSummary,
    staleTime: 30000,
  });

  const { data: recentTasks, isLoading: areTasksLoading } = useQuery<
    RecentTask[],
    Error
  >({
    queryKey: ['recentTasks'],
    queryFn: fetchRecentTasks,
    staleTime: 30000,
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* 页面头部 - 极简设计 */}
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-gray-600" />
          <h1 className="text-lg font-semibold text-gray-900">数据采集管理</h1>
        </div>
      </div>

      {/* 资源类型 Tabs - 优化设计 */}
      <div className="border-b border-gray-200 bg-white px-8">
        <div className="flex gap-0.5 overflow-x-auto">
          {RESOURCE_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = selectedResourceType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => setSelectedResourceType(type.id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? `border-blue-600 ${type.color} bg-blue-50`
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {type.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 主面板 */}
        <div className="flex-1 overflow-auto">
          {/* 功能 Tabs - 专业设计 */}
          <div className="border-b border-gray-200 bg-white px-8 py-4">
            <div className="flex gap-3">
              {MANAGEMENT_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'border border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs font-medium text-gray-600">
              {MANAGEMENT_TABS.find((t) => t.id === activeTab)?.description}
            </p>
          </div>

          {/* 内容面板 */}
          <div className="px-8 py-6">
            {activeTab === 'overview' && (
              <div className="w-full">
                <h2 className="mb-6 text-xl font-semibold text-gray-900">
                  数据采集概览
                </h2>
                {isSummaryLoading ? (
                  <div className="flex h-48 items-center justify-center text-gray-500">
                    加载中...
                  </div>
                ) : dashboardSummary ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {/* 总数据量 */}
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                          总数据量
                        </p>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {dashboardSummary.totalResources.toLocaleString()}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          今日: +{dashboardSummary.newToday}
                        </p>
                      </div>

                      {/* 成功率 */}
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                          成功率
                        </p>
                        <p className="mt-3 text-2xl font-bold text-green-600">
                          {dashboardSummary.successRate}%
                        </p>
                        <div className="mt-3 h-1 overflow-hidden rounded-full bg-green-100">
                          <div
                            className="h-full bg-green-600"
                            style={{
                              width: `${dashboardSummary.successRate}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* 待处理 */}
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                          待处理任务
                        </p>
                        <p className="mt-3 text-2xl font-bold text-blue-600">
                          {dashboardSummary.pendingTasks}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          等待系统处理
                        </p>
                      </div>

                      {/* 失败任务 */}
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                          失败任务
                        </p>
                        <p className="mt-3 text-2xl font-bold text-red-600">
                          {dashboardSummary.errorTasks}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">需人工介入</p>
                      </div>
                    </div>

                    {/* 最近任务 */}
                    <div>
                      <h3 className="mb-4 text-lg font-semibold text-gray-900">
                        最近任务
                      </h3>
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        {areTasksLoading ? (
                          <div className="flex h-32 items-center justify-center text-gray-500">
                            <svg
                              className="mr-2 h-5 w-5 animate-spin"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            加载中...
                          </div>
                        ) : recentTasks && recentTasks.length > 0 ? (
                          <div className="divide-y divide-gray-200">
                            {recentTasks.map((task) => (
                              <div
                                key={task.id}
                                className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-gray-900">
                                    {task.sourceUrl}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {new Date(task.createdAt).toLocaleString(
                                      'zh-CN'
                                    )}
                                  </p>
                                  {task.errorMessage && (
                                    <p className="mt-1 truncate text-xs text-red-600">
                                      错误: {task.errorMessage}
                                    </p>
                                  )}
                                </div>
                                <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                                  <span
                                    className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      task.status === 'SUCCESS'
                                        ? 'bg-green-100 text-green-800'
                                        : task.status === 'FAILED'
                                          ? 'bg-red-100 text-red-800'
                                          : task.status === 'PENDING'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : task.status === 'PROCESSING'
                                              ? 'bg-blue-100 text-blue-800'
                                              : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {task.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-32 flex-col items-center justify-center text-gray-500">
                            <svg
                              className="mb-2 h-8 w-8 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <p>暂无采集任务</p>
                            <p className="mt-1 text-xs">
                              请在配置中添加采集规则
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center text-red-500">
                    加载失败
                  </div>
                )}
              </div>
            )}

            {activeTab === 'configuration' && (
              <div className="w-full">
                <ConfigurationView resourceType={selectedResourceType} />
              </div>
            )}

            {activeTab === 'monitoring' && (
              <div className="w-full">
                <MonitoringView resourceType={selectedResourceType} />
              </div>
            )}

            {activeTab === 'quality' && (
              <div className="w-full">
                <QualityView resourceType={selectedResourceType} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
