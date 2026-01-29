'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';

interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; percentage: number };
  uptime: number;
  activeTasks: number;
  queuedTasks: number;
  collectionsPerMinute: number;
  errorRate: number;
}

interface RunningTask {
  id: string;
  name: string;
  sourceName: string;
  status: string;
  progress: number;
  currentStep: string;
  collected: number;
  duplicates: number;
  failed: number;
  startedAt: string | null;
  elapsedTime: number;
  estimatedTimeLeft: number;
}

interface AIDiagnosis {
  tools: { total: number; healthy: number; unhealthy: number };
  skills: { total: number; healthy: number; unhealthy: number };
  mcpServers: { total: number; healthy: number; unhealthy: number };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

export default function MonitoringPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [tasks, setTasks] = useState<RunningTask[]>([]);
  const [diagnosis, setDiagnosis] = useState<AIDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const [metricsRes, tasksRes, diagRes] = await Promise.all([
        fetch(`${config.apiUrl}/data-collection/monitor/metrics`, { headers }),
        fetch(`${config.apiUrl}/data-collection/monitor/tasks`, { headers }),
        fetch(`${config.apiUrl}/admin/ai/diagnose`, { headers }).catch(
          () => null
        ),
      ]);

      if (!metricsRes.ok)
        throw new Error(t('admin.monitoring.errors.fetchFailed'));

      const metricsData = await metricsRes.json();
      setMetrics(metricsData?.data ?? metricsData);

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks((tasksData?.data ?? tasksData) || []);
      }

      if (diagRes?.ok) {
        const diagData = await diagRes.json();
        setDiagnosis(diagData?.data ?? diagData);
      }

      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.monitoring.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void fetchData(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  return (
    <AdminPageLayout
      title={t('admin.monitoring.title')}
      description={t('admin.monitoring.description')}
      icon={Activity}
      domain="system"
      actions={
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            autoRefresh
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <RefreshCw
            className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`}
          />
          {autoRefresh
            ? t('admin.monitoring.autoRefreshOn')
            : t('admin.monitoring.autoRefreshOff')}
        </button>
      }
    >
      <div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            {t('common.loading')}
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {metrics && (
              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.cpu.usage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('admin.monitoring.cpuUsage')}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="text-2xl font-bold text-purple-600">
                    {metrics.memory.percentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('admin.monitoring.memoryUsage')} (
                    {formatBytes(metrics.memory.used)} /{' '}
                    {formatBytes(metrics.memory.total)})
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="text-2xl font-bold text-green-600">
                    {formatUptime(metrics.uptime)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('admin.monitoring.uptime')}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="text-2xl font-bold text-amber-600">
                    {metrics.activeTasks}
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('admin.monitoring.activeTasks')}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-4 shadow">
                  <div className="text-2xl font-bold text-red-600">
                    {metrics.errorRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {t('admin.monitoring.errorRate')}
                  </div>
                </div>
              </div>
            )}

            {/* Running Tasks */}
            <div className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                {t('admin.monitoring.runningTasks')}
              </h3>
              <div className="rounded-lg bg-white shadow">
                {tasks.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    {t('admin.monitoring.noRunningTasks')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.taskName')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.source')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.progress')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.collected')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.duplicates')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.failed')}
                          </th>
                          <th className="px-4 py-3">
                            {t('admin.monitoring.elapsed')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {tasks.map((task) => (
                          <tr key={task.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {task.name}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {task.sourceName}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 rounded-full bg-gray-200">
                                  <div
                                    className="h-2 rounded-full bg-blue-600"
                                    style={{
                                      width: `${Math.min(task.progress, 100)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">
                                  {task.progress.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-green-600">
                              {task.collected}
                            </td>
                            <td className="px-4 py-3 text-amber-600">
                              {task.duplicates}
                            </td>
                            <td className="px-4 py-3 text-red-600">
                              {task.failed}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {formatElapsed(task.elapsedTime)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* AI Service Diagnosis */}
            {diagnosis && (
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900">
                  {t('admin.monitoring.aiDiagnosis')}
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(['tools', 'skills', 'mcpServers'] as const).map((key) => {
                    const data = diagnosis[key];
                    if (!data) return null;
                    const labelKey = key === 'mcpServers' ? 'mcp' : key;
                    return (
                      <div key={key} className="rounded-lg bg-white p-4 shadow">
                        <h4 className="mb-2 font-medium text-gray-900">
                          {t(
                            `admin.monitoring.ai${labelKey.charAt(0).toUpperCase() + labelKey.slice(1)}`
                          )}
                        </h4>
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-2xl font-bold text-green-600">
                              {data.healthy}
                            </span>
                            <span className="ml-1 text-sm text-gray-500">
                              {t('admin.monitoring.healthy')}
                            </span>
                          </div>
                          {data.unhealthy > 0 && (
                            <div>
                              <span className="text-2xl font-bold text-red-600">
                                {data.unhealthy}
                              </span>
                              <span className="ml-1 text-sm text-gray-500">
                                {t('admin.monitoring.unhealthy')}
                              </span>
                            </div>
                          )}
                          <div className="ml-auto text-sm text-gray-400">
                            {t('admin.monitoring.total')}: {data.total}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
