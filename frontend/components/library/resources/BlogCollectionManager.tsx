'use client';

import { config } from '@/lib/utils/config';

/**
 * Blog Collection Manager Component
 * 用于管理博客采集的前端界面
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/utils/logger';
import {
  RefreshCw,
  Settings,
  Play,
  Pause,
  Clock,
  Database,
  Activity,
  TrendingUp,
} from 'lucide-react';

interface BlogSource {
  id: string;
  name: string;
  displayName: string;
  category: 'enterprise' | 'analyst' | 'research';
  blogUrl?: string;
  logoUrl?: string;
  lastCollected?: string;
  status: string;
}

interface CollectionTask {
  id: string;
  sourceId: string;
  sourceName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  postsCollected: number;
  postsSaved: number;
  error?: string;
}

interface SchedulerConfig {
  enabled: boolean;
  cronExpression: string;
  maxConcurrent: number;
  activeTasks: number;
}

interface BlogCollectionManagerProps {
  apiBaseUrl?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const BlogCollectionManager: React.FC<BlogCollectionManagerProps> = ({
  apiBaseUrl = '${config.apiUrl}/blog',
  autoRefresh = true,
  refreshInterval = 30000,
}) => {
  const [sources, setSources] = useState<BlogSource[]>([]);
  const [schedulerConfig, setSchedulerConfig] =
    useState<SchedulerConfig | null>(null);
  const [activeTasks, setActiveTasks] = useState<CollectionTask[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 */6 * * *');

  // 获取数据源列表
  const fetchSources = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/sources`);
      const result = await response.json();
      if (result.success) {
        setSources(result.data);
      }
    } catch (error) {
      logger.error('Error fetching sources:', error);
    }
  };

  // 获取调度器状态
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/scheduler/status`);
      const result = await response.json();
      if (result.success) {
        setSchedulerConfig(result.data);
        setActiveTasks(result.data.tasks || []);
      }
    } catch (error) {
      logger.error('Error fetching scheduler status:', error);
    }
  };

  // 获取统计信息
  const fetchStats = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/stats`);
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      logger.error('Error fetching stats:', error);
    }
  };

  // 初始化数据
  useEffect(() => {
    fetchSources();
    fetchSchedulerStatus();
    fetchStats();
  }, [apiBaseUrl]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSchedulerStatus();
      fetchStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // 手动触发采集
  const handleTriggerCollection = async (sourceId?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      });

      const result = await response.json();
      if (result.success) {
        setTimeout(() => {
          fetchSchedulerStatus();
          fetchStats();
          setLoading(false);
        }, 2000);
      }
    } catch (error) {
      logger.error('Error triggering collection:', error);
      setLoading(false);
    }
  };

  // 更新调度器配置
  const handleUpdateConfig = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/scheduler/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cronExpression,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setSchedulerConfig(result.data);
        setShowSettings(false);
      }
    } catch (error) {
      logger.error('Error updating config:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题和操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Blog Collection Manager
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            自动采集来自全球知名企业和分析机构的最新博客文章
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              fetchSources();
              fetchSchedulerStatus();
              fetchStats();
            }}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>

          <button
            onClick={() => handleTriggerCollection()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            全量采集
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            <Settings className="h-4 w-4" />
            设置
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-4 text-lg font-semibold">采集器设置</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Cron 表达式（采集周期）
              </label>
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 */6 * * * (每6小时采集一次)"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                示例：0 0 * * * (每天午夜采集) | 0 */6 * * * (每6小时采集一次)
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpdateConfig}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
              >
                保存设置
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg bg-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-400"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">总计博客文章</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {stats.totalPosts}
                </p>
              </div>
              <Database className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">采集源</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {sources.length}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">活跃任务</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {activeTasks.length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-orange-500" />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">采集器状态</p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    stats.collectionStatus === 'active'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {stats.collectionStatus === 'active' ? '运行中' : '已停止'}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* 数据源列表 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">采集数据源</h3>

        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 hover:bg-gray-100"
            >
              <div className="flex items-center gap-3">
                {source.logoUrl && (
                  <img
                    src={source.logoUrl}
                    alt={source.displayName}
                    className="h-10 w-10 rounded object-cover"
                  />
                )}

                <div>
                  <p className="font-medium text-gray-900">
                    {source.displayName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {source.category} •{' '}
                    {source.lastCollected
                      ? new Date(source.lastCollected).toLocaleString('zh-CN')
                      : '未采集'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleTriggerCollection(source.id)}
                disabled={loading}
                className="flex items-center gap-1 rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                采集
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 活跃任务 */}
      {activeTasks.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            活跃采集任务
          </h3>

          <div className="space-y-2">
            {activeTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded bg-gray-50 p-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{task.sourceName}</p>
                  <p className="text-xs text-gray-500">
                    {task.status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500"></span>
                        采集中...
                      </span>
                    )}
                    {task.status === 'completed' && (
                      <span className="text-green-600">
                        ✓ 采集成功 ({task.postsCollected} 篇, 保存{' '}
                        {task.postsSaved} 篇)
                      </span>
                    )}
                    {task.status === 'failed' && (
                      <span className="text-red-600">
                        ✗ 采集失败: {task.error}
                      </span>
                    )}
                  </p>
                </div>

                <span
                  className={`text-xs font-semibold ${
                    task.status === 'in_progress'
                      ? 'text-yellow-600'
                      : task.status === 'completed'
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}
                >
                  {task.status === 'in_progress'
                    ? '进行中'
                    : task.status === 'completed'
                      ? '已完成'
                      : '失败'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近采集的文章 */}
      {stats?.recentPosts && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            最近采集的文章
          </h3>

          <div className="space-y-2">
            {stats.recentPosts.map((post: any) => (
              <a
                key={post.id}
                href={`/reports/${post.id}`}
                className="block rounded bg-gray-50 p-3 hover:bg-blue-50"
              >
                <p className="line-clamp-2 font-medium text-blue-600 hover:underline">
                  {post.title}
                </p>
                <p className="text-xs text-gray-500">
                  {post.publisherName} •{' '}
                  {new Date(post.publishedAt).toLocaleString('zh-CN')}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogCollectionManager;
