'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Cpu,
  Database,
  Zap,
  TrendingUp,
  Clock,
  DollarSign,
  Server,
  AlertCircle,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';

// ==================== Types ====================

interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; percentage: number };
  uptime: number;
  activeTasks: number;
  queuedTasks: number;
  collectionsPerMinute: number;
  errorRate: number;
}

interface ErrorStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  resolved: number;
  unresolved: number;
  byComponent: Record<string, number>;
  byErrorCode: Record<string, number>;
  trend: Array<{ date: string; count: number }>;
}

interface AggregatedError {
  errorCode: string;
  count: number;
  latestMessage: string;
  latestOccurrence: string;
  severity: string;
  component: string | null;
}

interface AIMetricsSummary {
  totalCalls: number;
  successRate: number;
  avgDuration: number;
  totalTokens: number;
  estimatedCost: number;
  byModel: Record<string, { calls: number; tokens: number; cost: number }>;
  byType: Record<
    string,
    { calls: number; successRate: number; avgDuration: number }
  >;
  trend: Array<{ date: string; calls: number; tokens: number; cost: number }>;
}

interface RealtimeMetrics {
  lastHour: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    successRate: number;
    avgDuration: number;
    totalTokens: number;
    errorCounts: Record<string, number>;
  };
  callsPerMinute: Array<{ minute: string; calls: number }>;
}

interface AIDiagnosis {
  tools: { total: number; healthy: number; unhealthy: number };
  skills: { total: number; enabled: number; disabled: number };
  mcpServers: { total: number; connected: number; disconnected: number };
  externalTools: {
    total: number;
    configured: number;
    unconfigured: number;
  };
  breakpoints: Array<{
    code: string;
    severity: string;
    location: string;
    description: string;
    recommendation: string;
  }>;
}

interface DashboardData {
  warnings?: string[];
  errors: {
    stats: ErrorStats;
    topErrors: AggregatedError[];
  } | null;
  aiMetrics: {
    summary: AIMetricsSummary;
    realtime: RealtimeMetrics;
    modelUsage: Array<{
      modelId: string;
      totalCalls: number;
      successfulCalls: number;
      totalTokens: number;
      estimatedCost: number;
    }>;
  } | null;
  aiDiagnosis: AIDiagnosis | null;
}

// ==================== Helper Functions ====================

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

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600 bg-red-50';
    case 'error':
      return 'text-orange-600 bg-orange-50';
    case 'warning':
      return 'text-yellow-600 bg-yellow-50';
    case 'high':
      return 'text-red-600 bg-red-50';
    case 'medium':
      return 'text-orange-600 bg-orange-50';
    case 'low':
      return 'text-yellow-600 bg-yellow-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

// ==================== Components ====================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
  trend?: { value: number; label: string };
}) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
    amber: 'text-amber-600',
    cyan: 'text-cyan-600',
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        <Icon className={`h-8 w-8 ${colorClasses[color]} opacity-50`} />
      </div>
      {trend && (
        <div className="mt-2 flex items-center text-xs">
          <TrendingUp
            className={`mr-1 h-3 w-3 ${trend.value >= 0 ? 'text-green-500' : 'text-red-500'}`}
          />
          <span
            className={trend.value >= 0 ? 'text-green-500' : 'text-red-500'}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
          <span className="ml-1 text-gray-400">{trend.label}</span>
        </div>
      )}
    </div>
  );
}

function TrendChart({
  data,
  label,
  color = 'blue',
}: {
  data: Array<{ date: string; count?: number; calls?: number }>;
  label: string;
  color?: string;
}) {
  const maxValue = Math.max(...data.map((d) => d.count ?? d.calls ?? 0), 1);

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">{label}</p>
      <div className="flex h-24 items-end gap-1">
        {data.map((item, i) => {
          const value = item.count ?? item.calls ?? 0;
          const height = Math.max((value / maxValue) * 100, 4);
          return (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div
                className={`w-full rounded-t ${colorClasses[color]} transition-all`}
                style={{ height: `${height}%` }}
                title={`${item.date}: ${value}`}
              />
              <span className="mt-1 text-[10px] text-gray-400">
                {item.date.slice(-2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthIndicator({
  status,
  label,
}: {
  status: 'healthy' | 'degraded' | 'unhealthy';
  label: string;
}) {
  const statusConfig = {
    healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
    degraded: {
      icon: AlertCircle,
      color: 'text-yellow-500',
      bg: 'bg-yellow-50',
    },
    unhealthy: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 ${config.bg}`}
    >
      <Icon className={`h-5 w-5 ${config.color}`} />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );
}

// ==================== Main Component ====================

export default function MonitoringPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'ai'>(
    'overview'
  );

  const fetchData = useCallback(async () => {
    try {
      const headers = getAuthHeader();

      // Fetch both endpoints independently — one failure should not block the other
      const [metricsRes, dashboardRes] = await Promise.all([
        fetch(`${config.apiUrl}/data-collection/monitor/metrics`, {
          headers,
        }).catch((err: unknown) => {
          logger.error('Failed to fetch metrics:', err);
          return null;
        }),
        fetch(`${config.apiUrl}/admin/monitoring/dashboard`, { headers }).catch(
          (err: unknown) => {
            logger.error('Failed to fetch dashboard:', err);
            return null;
          }
        ),
      ]);

      // Process metrics (independent)
      if (metricsRes?.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData?.data ?? metricsData);
        setError(null);
      } else {
        setError(t('admin.monitoring.errors.fetchFailed'));
        logger.error(
          'Metrics fetch failed:',
          metricsRes ? `status ${metricsRes.status}` : 'network error'
        );
      }

      // Process dashboard (independent)
      if (dashboardRes?.ok) {
        const dashboardData = await dashboardRes.json();
        setDashboard(dashboardData?.data ?? dashboardData);
        setDashboardError(null);
      } else {
        setDashboardError(
          dashboardRes
            ? `Dashboard returned status ${dashboardRes.status}`
            : 'Dashboard fetch failed'
        );
        logger.error(
          'Dashboard fetch failed:',
          dashboardRes ? `status ${dashboardRes.status}` : 'network error'
        );
      }
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

  const renderOverviewTab = () => (
    <>
      {/* System Health */}
      {dashboard ? (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            System Health
          </h3>
          <div className="flex flex-wrap gap-3">
            <HealthIndicator
              status={
                dashboard?.aiDiagnosis?.breakpoints?.length === 0
                  ? 'healthy'
                  : 'degraded'
              }
              label="AI Engine"
            />
            <HealthIndicator
              status={
                dashboard?.errors?.stats?.critical === 0
                  ? 'healthy'
                  : 'unhealthy'
              }
              label="Error Rate"
            />
            <HealthIndicator
              status={
                (dashboard?.aiMetrics?.summary?.successRate ?? 100) >= 95
                  ? 'healthy'
                  : 'degraded'
              }
              label="AI Success Rate"
            />
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          Dashboard data unavailable. System health indicators require dashboard
          data.
        </div>
      )}

      {/* Stats Cards */}
      {metrics && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            title="CPU Usage"
            value={`${metrics.cpu.usage.toFixed(1)}%`}
            subtitle={`${metrics.cpu.cores} cores`}
            icon={Cpu}
            color="blue"
          />
          <StatCard
            title="Memory"
            value={`${metrics.memory.percentage.toFixed(1)}%`}
            subtitle={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
            icon={Database}
            color="purple"
          />
          <StatCard
            title="Uptime"
            value={formatUptime(metrics.uptime)}
            icon={Clock}
            color="green"
          />
          <StatCard
            title="Active Tasks"
            value={metrics.activeTasks}
            subtitle={`${metrics.queuedTasks} queued`}
            icon={Activity}
            color="amber"
          />
          <StatCard
            title="Error Rate"
            value={`${metrics.errorRate.toFixed(1)}%`}
            icon={AlertTriangle}
            color="red"
          />
        </div>
      )}

      {/* AI Metrics Quick View */}
      {dashboard?.aiMetrics?.summary ? (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            AI Engine (Last 7 Days)
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              title="Total Calls"
              value={formatNumber(dashboard.aiMetrics.summary.totalCalls)}
              icon={Zap}
              color="blue"
            />
            <StatCard
              title="Success Rate"
              value={`${dashboard.aiMetrics.summary.successRate.toFixed(1)}%`}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Avg Latency"
              value={`${dashboard.aiMetrics.summary.avgDuration}ms`}
              icon={Clock}
              color="purple"
            />
            <StatCard
              title="Est. Cost"
              value={formatCost(dashboard.aiMetrics.summary.estimatedCost)}
              icon={DollarSign}
              color="amber"
            />
          </div>
        </div>
      ) : (
        dashboard && (
          <div className="mb-6 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
            No AI metrics data available for the last 7 days.
          </div>
        )
      )}

      {/* AI Diagnosis */}
      {dashboard?.aiDiagnosis ? (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            AI Capabilities
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-white p-4 shadow">
              <h4 className="mb-2 font-medium text-gray-900">Tools</h4>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-2xl font-bold text-green-600">
                    {dashboard.aiDiagnosis.tools.healthy}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">healthy</span>
                </div>
                {dashboard.aiDiagnosis.tools.unhealthy > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-red-600">
                      {dashboard.aiDiagnosis.tools.unhealthy}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">
                      unhealthy
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <h4 className="mb-2 font-medium text-gray-900">Skills</h4>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-2xl font-bold text-green-600">
                    {dashboard.aiDiagnosis.skills.enabled}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">enabled</span>
                </div>
                <div className="ml-auto text-sm text-gray-400">
                  Total: {dashboard.aiDiagnosis.skills.total}
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <h4 className="mb-2 font-medium text-gray-900">MCP Servers</h4>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-2xl font-bold text-green-600">
                    {dashboard.aiDiagnosis.mcpServers.connected}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">connected</span>
                </div>
                {dashboard.aiDiagnosis.mcpServers.disconnected > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-red-600">
                      {dashboard.aiDiagnosis.mcpServers.disconnected}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">
                      disconnected
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <h4 className="mb-2 font-medium text-gray-900">External APIs</h4>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-2xl font-bold text-green-600">
                    {dashboard.aiDiagnosis.externalTools.configured}
                  </span>
                  <span className="ml-1 text-sm text-gray-500">configured</span>
                </div>
                {dashboard.aiDiagnosis.externalTools.unconfigured > 0 && (
                  <div>
                    <span className="text-2xl font-bold text-amber-600">
                      {dashboard.aiDiagnosis.externalTools.unconfigured}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">missing</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Breakpoints */}
          {dashboard.aiDiagnosis.breakpoints.length > 0 && (
            <div className="mt-4 rounded-lg bg-red-50 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-red-800">
                <AlertTriangle className="h-5 w-5" />
                Issues Detected ({dashboard.aiDiagnosis.breakpoints.length})
              </h4>
              <div className="space-y-2">
                {dashboard.aiDiagnosis.breakpoints.slice(0, 5).map((bp, i) => (
                  <div
                    key={i}
                    className={`rounded p-2 ${getSeverityColor(bp.severity)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{bp.code}</span>
                      <span className="text-sm">{bp.description}</span>
                    </div>
                    <p className="mt-1 text-xs opacity-75">
                      {bp.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        dashboard && (
          <div className="mb-6 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
            No AI capabilities data available.
          </div>
        )
      )}
    </>
  );

  const renderErrorsTab = () => (
    <>
      {/* Error Stats */}
      {dashboard?.errors?.stats && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Error Statistics (Last 7 Days)
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard
              title="Total Errors"
              value={dashboard.errors.stats.total}
              icon={AlertTriangle}
              color="red"
            />
            <StatCard
              title="Critical"
              value={dashboard.errors.stats.critical}
              icon={XCircle}
              color="red"
            />
            <StatCard
              title="Errors"
              value={dashboard.errors.stats.error}
              icon={AlertCircle}
              color="amber"
            />
            <StatCard
              title="Warnings"
              value={dashboard.errors.stats.warning}
              icon={AlertTriangle}
              color="amber"
            />
            <StatCard
              title="Unresolved"
              value={dashboard.errors.stats.unresolved}
              icon={Clock}
              color="purple"
            />
          </div>
        </div>
      )}

      {/* Error Trend */}
      {dashboard?.errors?.stats?.trend && (
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <TrendChart
            data={dashboard.errors.stats.trend}
            label="Errors per Day"
            color="red"
          />
        </div>
      )}

      {/* Top Errors */}
      {dashboard?.errors?.topErrors &&
        dashboard.errors.topErrors.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">
              Top Errors (Unresolved)
            </h3>
            <div className="rounded-lg bg-white shadow">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Error Code</th>
                      <th className="px-4 py-3">Count</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Component</th>
                      <th className="px-4 py-3">Latest Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.errors.topErrors.map((err, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="font-mono px-4 py-3 text-sm text-gray-900">
                          {err.errorCode}
                        </td>
                        <td className="px-4 py-3 font-bold text-red-600">
                          {err.count}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${getSeverityColor(err.severity)}`}
                          >
                            {err.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {err.component || '-'}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 text-gray-500">
                          {err.latestMessage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      {/* Errors by Component */}
      {dashboard?.errors?.stats?.byComponent && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Errors by Component
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(dashboard.errors.stats.byComponent).map(
              ([component, count]) => (
                <div key={component} className="rounded-lg bg-white p-4 shadow">
                  <p className="text-sm text-gray-500">{component}</p>
                  <p className="text-2xl font-bold text-red-600">{count}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Empty state when no error data */}
      {!dashboard?.errors && (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          {dashboard
            ? 'No error tracking data available.'
            : 'Dashboard data unavailable. Error tracking requires dashboard data.'}
        </div>
      )}
    </>
  );

  const renderAITab = () => (
    <>
      {/* AI Metrics Summary */}
      {dashboard?.aiMetrics?.summary && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            AI Metrics Summary (Last 7 Days)
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard
              title="Total Calls"
              value={formatNumber(dashboard.aiMetrics.summary.totalCalls)}
              icon={Zap}
              color="blue"
            />
            <StatCard
              title="Success Rate"
              value={`${dashboard.aiMetrics.summary.successRate.toFixed(1)}%`}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Avg Latency"
              value={`${dashboard.aiMetrics.summary.avgDuration}ms`}
              icon={Clock}
              color="purple"
            />
            <StatCard
              title="Total Tokens"
              value={formatNumber(dashboard.aiMetrics.summary.totalTokens)}
              icon={Server}
              color="cyan"
            />
            <StatCard
              title="Est. Cost"
              value={formatCost(dashboard.aiMetrics.summary.estimatedCost)}
              icon={DollarSign}
              color="amber"
            />
          </div>
        </div>
      )}

      {/* AI Calls Trend */}
      {dashboard?.aiMetrics?.summary?.trend && (
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <TrendChart
            data={dashboard.aiMetrics.summary.trend}
            label="AI Calls per Day"
            color="blue"
          />
        </div>
      )}

      {/* Realtime Metrics */}
      {dashboard?.aiMetrics?.realtime && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Realtime (Last Hour)
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              title="Calls"
              value={dashboard.aiMetrics.realtime.lastHour.totalCalls}
              icon={Zap}
              color="blue"
            />
            <StatCard
              title="Success Rate"
              value={`${dashboard.aiMetrics.realtime.lastHour.successRate.toFixed(1)}%`}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Avg Latency"
              value={`${dashboard.aiMetrics.realtime.lastHour.avgDuration}ms`}
              icon={Clock}
              color="purple"
            />
            <StatCard
              title="Tokens"
              value={formatNumber(
                dashboard.aiMetrics.realtime.lastHour.totalTokens
              )}
              icon={Server}
              color="cyan"
            />
          </div>
        </div>
      )}

      {/* Model Usage */}
      {dashboard?.aiMetrics?.modelUsage &&
        dashboard.aiMetrics.modelUsage.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">
              Model Usage
            </h3>
            <div className="rounded-lg bg-white shadow">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3">Total Calls</th>
                      <th className="px-4 py-3">Success</th>
                      <th className="px-4 py-3">Tokens</th>
                      <th className="px-4 py-3">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.aiMetrics.modelUsage.map((model, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="font-mono px-4 py-3 text-sm text-gray-900">
                          {model.modelId}
                        </td>
                        <td className="px-4 py-3 text-blue-600">
                          {formatNumber(model.totalCalls)}
                        </td>
                        <td className="px-4 py-3 text-green-600">
                          {formatNumber(model.successfulCalls)}
                        </td>
                        <td className="px-4 py-3 text-purple-600">
                          {formatNumber(model.totalTokens)}
                        </td>
                        <td className="px-4 py-3 text-amber-600">
                          {formatCost(model.estimatedCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      {/* By Type */}
      {dashboard?.aiMetrics?.summary?.byType && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            By Operation Type
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(dashboard.aiMetrics.summary.byType).map(
              ([type, stats]) => (
                <div key={type} className="rounded-lg bg-white p-4 shadow">
                  <h4 className="mb-2 font-medium capitalize text-gray-900">
                    {type.replace(/_/g, ' ')}
                  </h4>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatNumber(stats.calls)}
                  </p>
                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>{stats.successRate.toFixed(1)}% success</span>
                    <span>{stats.avgDuration}ms avg</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Empty state when no AI metrics data */}
      {!dashboard?.aiMetrics && (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          {dashboard
            ? 'No AI metrics data available.'
            : 'Dashboard data unavailable. AI metrics require dashboard data.'}
        </div>
      )}
    </>
  );

  return (
    <AdminPageLayout
      title={t('admin.monitoring.title')}
      description="System health, error tracking, and AI metrics"
      icon={Activity}
      domain="system"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
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
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
        </div>
      }
    >
      <div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {dashboardError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 p-4 text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">
              Dashboard data unavailable: {dashboardError}
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {(['overview', 'errors', 'ai'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab === 'overview' && 'Overview'}
                {tab === 'errors' && 'Error Tracking'}
                {tab === 'ai' && 'AI Metrics'}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            {t('common.loading')}
          </div>
        ) : (
          <>
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'errors' && renderErrorsTab()}
            {activeTab === 'ai' && renderAITab()}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
