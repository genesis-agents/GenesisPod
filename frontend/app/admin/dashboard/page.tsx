'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Copy,
  Database,
  Activity,
  Clock,
  AlertCircle,
  Cpu,
  HardDrive,
  History as HistoryIcon,
  CheckCircle,
  LayoutDashboard,
  Radio,
  ClipboardList,
} from 'lucide-react';
import {
  getDashboardStats,
  CollectionTask,
  getRunningTasks,
  getSystemMetrics,
  getHistory,
  getHistoryStats,
  HistoryRecord,
  HistoryStats,
} from '@/lib/api/data-collection';

// Type for system metrics response
interface SystemMetrics {
  cpu?: { usage?: number; cores?: number };
  memory?: { percentage?: number; used?: number; total?: number };
  activeTasks?: number;
  queuedTasks?: number;
}

type TabType = 'overview' | 'live' | 'history';

interface FormattedStats {
  totalSources: number;
  activeSources: number;
  totalTasks: number;
  runningTasks: number;
  todayCollected: number;
  todaySuccess: number;
  todayFailed: number;
  todayDuplicates: number;
  avgQuality: number;
  successRate: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Overview state
  const [stats, setStats] = useState<FormattedStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<CollectionTask[]>([]);

  // Live state
  const [runningTasks, setRunningTasks] = useState<CollectionTask[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch overview data
  const fetchOverviewData = useCallback(async () => {
    try {
      const response = await getDashboardStats();
      const data = response.data;
      setStats({
        totalSources: data.sourceStats.total,
        activeSources: data.sourceStats.active,
        totalTasks: data.taskStats.total,
        runningTasks: data.taskStats.running,
        todayCollected: data.todayStats.collected,
        todaySuccess: Math.round(
          data.todayStats.collected * (data.todayStats.successRate / 100)
        ),
        todayFailed: 0,
        todayDuplicates: 0,
        avgQuality: data.todayStats.avgQuality,
        successRate: data.todayStats.successRate,
      });
      setRecentTasks(data.recentTasks || []);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    }
  }, []);

  // Fetch live data
  const fetchLiveData = useCallback(async () => {
    try {
      const [tasksResponse, metricsResponse] = await Promise.all([
        getRunningTasks(),
        getSystemMetrics(),
      ]);
      setRunningTasks(tasksResponse.data);
      setMetrics(metricsResponse.data as SystemMetrics | null);
    } catch (err) {
      console.error('Failed to fetch live data:', err);
    }
  }, []);

  // Fetch history data
  const fetchHistoryData = useCallback(async () => {
    try {
      const [historyResponse, statsResponse] = await Promise.all([
        getHistory({ limit: 50 }),
        getHistoryStats(period),
      ]);
      setHistory(historyResponse.data);
      setHistoryStats(statsResponse.data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, [period]);

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchOverviewData(),
          fetchLiveData(),
          fetchHistoryData(),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [fetchOverviewData, fetchLiveData, fetchHistoryData]);

  // Auto-refresh based on active tab
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === 'overview') {
      interval = setInterval(() => void fetchOverviewData(), 30000);
    } else if (activeTab === 'live') {
      interval = setInterval(() => void fetchLiveData(), 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, fetchOverviewData, fetchLiveData]);

  // Refresh history when period changes
  useEffect(() => {
    if (activeTab === 'history') {
      void fetchHistoryData();
    }
  }, [period, activeTab, fetchHistoryData]);

  // Helper functions
  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            <Activity className="h-3 w-3 animate-pulse" />
            Running
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
    }
  };

  if (loading && !stats && !metrics) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !stats && !metrics) {
    return (
      <div className="flex h-96 items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-2 text-sm text-gray-900">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Data Collection Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Monitor and manage your data collection tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'live' && (
            <div className="mr-2 flex items-center gap-2 text-sm text-gray-500">
              <Radio className="h-4 w-4 animate-pulse text-green-500" />
              Live
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'live'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Radio className="h-4 w-4" />
          Live Monitor
          {runningTasks.length > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-xs text-white">
              {runningTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'history'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Collected Today</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.todayCollected}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-600">+12.5%</span>
                    <span className="text-gray-500">vs yesterday</span>
                  </div>
                </div>
                <div className="rounded-lg bg-blue-100 p-2">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Success Rate</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.successRate.toFixed(1)}%
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-600">
                      {stats.todaySuccess} succeeded
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-100 p-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Tasks</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.runningTasks}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-blue-600">
                      {stats.totalTasks} total tasks
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-violet-100 p-2">
                  <Activity className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Avg Quality</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {stats.avgQuality.toFixed(1)}
                  </p>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-600">+3.2%</span>
                    <span className="text-gray-500">this week</span>
                  </div>
                </div>
                <div className="rounded-lg bg-amber-100 p-2">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Tasks */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="font-semibold text-gray-900">Recent Tasks</h3>
              <p className="text-sm text-gray-500">
                Latest collection activity
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {recentTasks.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-500">
                  No recent tasks found
                </div>
              ) : (
                recentTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-gray-900">
                            {task.name}
                          </h4>
                          {getStatusBadge(task.status)}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {task.successItems} collected
                          </span>
                          <span className="flex items-center gap-1">
                            <Copy className="h-3.5 w-3.5" />
                            {task.duplicateItems} duplicates
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatRelativeTime(task.startedAt)}
                          </span>
                        </div>
                        {task.status === 'RUNNING' && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>Progress</span>
                              <span>{task.progress.toFixed(1)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full bg-blue-600 transition-all"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <button
              onClick={() => router.push('/data-collection/config')}
              className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center transition-all hover:cursor-pointer hover:border-blue-300 hover:bg-blue-50/50"
            >
              <Database className="mx-auto h-8 w-8 text-gray-400" />
              <h4 className="mt-2 font-medium text-gray-900">
                Add Data Source
              </h4>
              <p className="text-sm text-gray-500">
                Configure a new data source
              </p>
            </button>
            <button
              onClick={() => router.push('/data-collection/scheduler')}
              className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center transition-all hover:cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              <Activity className="mx-auto h-8 w-8 text-gray-400" />
              <h4 className="mt-2 font-medium text-gray-900">Create Task</h4>
              <p className="text-sm text-gray-500">
                Start a new collection task
              </p>
            </button>
            <button
              onClick={() => router.push('/data-collection/scheduler')}
              className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center transition-all hover:cursor-pointer hover:border-violet-300 hover:bg-violet-50/50"
            >
              <Clock className="mx-auto h-8 w-8 text-gray-400" />
              <h4 className="mt-2 font-medium text-gray-900">Schedule Job</h4>
              <p className="text-sm text-gray-500">
                Set up automated collection
              </p>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'live' && (
        <div className="space-y-6">
          {/* System Metrics */}
          {metrics && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">CPU Usage</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {metrics.cpu?.usage?.toFixed(1) || 0}%
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {metrics.cpu?.cores || 0} cores
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-100 p-2">
                    <Cpu className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Memory Usage</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {metrics.memory?.percentage?.toFixed(1) || 0}%
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {(
                        (metrics.memory?.used || 0) /
                        1024 /
                        1024 /
                        1024
                      ).toFixed(1)}{' '}
                      GB /
                      {(
                        (metrics.memory?.total || 0) /
                        1024 /
                        1024 /
                        1024
                      ).toFixed(1)}{' '}
                      GB
                    </p>
                  </div>
                  <div className="rounded-lg bg-purple-100 p-2">
                    <HardDrive className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Active / Queued</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {metrics.activeTasks || 0} / {metrics.queuedTasks || 0}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Collection tasks
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-100 p-2">
                    <Database className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Running Tasks */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="font-semibold text-gray-900">Running Tasks</h3>
              <p className="text-sm text-gray-500">
                {runningTasks.length} task{runningTasks.length !== 1 ? 's' : ''}{' '}
                currently running
              </p>
            </div>

            {runningTasks.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Activity className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  No running tasks
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Tasks will appear here when they start
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {runningTasks.map((task) => (
                  <div key={task.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-gray-900">
                            {task.name}
                          </h4>
                          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            <Activity className="h-3 w-3 animate-pulse" />
                            Running
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            {task.successItems} success
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                            {task.failedItems} failed
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Started {formatRelativeTime(task.startedAt)}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>
                              Progress: {task.processedItems} /{' '}
                              {task.totalItems || '?'}
                            </span>
                            <span>{task.progress.toFixed(1)}%</span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Period Filter */}
          <div className="flex justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod('day')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  period === 'day'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setPeriod('week')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  period === 'week'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  period === 'month'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Stats Summary */}
          {historyStats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Total Tasks</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {historyStats.totalTasks}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  <span>{historyStats.completedTasks} completed</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Total Collected</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {historyStats.totalCollected.toLocaleString()}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <Copy className="h-3 w-3" />
                  <span>{historyStats.totalDuplicates} duplicates</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Success Rate</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {historyStats.successRate.toFixed(1)}%
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                  <TrendingUp className="h-3 w-3" />
                  <span>Trending up</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Avg Duration</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatDuration(Math.round(historyStats.avgDuration))}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>Per task</span>
                </div>
              </div>
            </div>
          )}

          {/* History List */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="font-semibold text-gray-900">Task History</h3>
              <p className="text-sm text-gray-500">{history.length} records</p>
            </div>

            {history.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <HistoryIcon className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  No history found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Completed tasks will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {history.map((item) => (
                  <div key={item.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">
                            {item.taskName}
                          </h4>
                          {item.status === 'COMPLETED' && (
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          )}
                          {item.status === 'FAILED' && (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          Source: {item.sourceName}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            {item.successItems} collected
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Copy className="h-3.5 w-3.5" />
                            {item.duplicateItems} duplicates
                          </span>
                          {item.failedItems > 0 && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                                {item.failedItems} failed
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(item.duration)}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatRelativeTime(item.completedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
