'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Zap,
  Server,
  Key,
  Users,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';
import { AdminPageLayout } from '@/components/admin/layout';

// ==================== Types ====================

interface MCPServerStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  activeSessions: number;
  metrics24h: {
    totalCalls: number;
    successRate: number;
    avgDuration: number;
  };
}

interface MCPServerMetrics {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgDuration: number;
  byTool: Record<
    string,
    { calls: number; errors: number; avgDuration: number }
  >;
  byApiKey: Record<string, { calls: number; lastUsed: string }>;
  recentErrors: Array<{
    toolName: string;
    errorType: string;
    timestamp: string;
  }>;
}

interface MCPSession {
  sessionId: string;
  clientInfo?: { name: string; version: string };
  createdAt: string;
}

// ==================== Helpers ====================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDuration(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'healthy':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Healthy',
      };
    case 'degraded':
      return {
        icon: AlertCircle,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        label: 'Degraded',
      };
    default:
      return {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Unhealthy',
      };
  }
}

// ==================== Sub-Components ====================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    purple: 'text-purple-600',
    amber: 'text-amber-600',
    cyan: 'text-cyan-600',
    slate: 'text-slate-600',
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
    </div>
  );
}

// ==================== Main Component ====================

export default function MCPServerPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MCPServerStatus | null>(null);
  const [metrics, setMetrics] = useState<MCPServerMetrics | null>(null);
  const [sessions, setSessions] = useState<MCPSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'tools' | 'metrics' | 'sessions'
  >('overview');

  const fetchData = useCallback(async () => {
    try {
      const headers = getAuthHeader();

      const [statusRes, metricsRes, sessionsRes] = await Promise.all([
        fetch(`${config.apiUrl}/admin/mcp-server/status`, { headers }).catch(
          () => null
        ),
        fetch(`${config.apiUrl}/admin/mcp-server/metrics`, { headers }).catch(
          () => null
        ),
        fetch(`${config.apiUrl}/admin/mcp-server/sessions`, {
          headers,
        }).catch(() => null),
      ]);

      if (statusRes?.ok) {
        const data = await statusRes.json();
        setStatus(data?.data ?? data);
      }

      if (metricsRes?.ok) {
        const data = await metricsRes.json();
        setMetrics(data?.data ?? data);
      }

      if (sessionsRes?.ok) {
        const data = await sessionsRes.json();
        const parsed = data?.data ?? data;
        setSessions(parsed?.sessions ?? []);
      }

      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t('admin.mcpServer.errors.fetchFailed');
      setError(message);
      logger.error('Failed to fetch MCP Server data:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => void fetchData(), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const statusCfg = status ? getStatusConfig(status.status) : null;
  const StatusIcon = statusCfg?.icon ?? AlertCircle;

  const renderOverviewTab = () => (
    <>
      {/* Server Status Banner */}
      {status && statusCfg && (
        <div
          className={`mb-6 flex items-center gap-4 rounded-lg border p-4 ${statusCfg.bg} ${statusCfg.border}`}
        >
          <StatusIcon className={`h-8 w-8 ${statusCfg.color}`} />
          <div>
            <h3 className={`text-lg font-semibold ${statusCfg.color}`}>
              {t(`admin.mcpServer.status.${status.status}`)}
            </h3>
            <p className="text-sm text-gray-600">
              {t('admin.mcpServer.status.uptime')}:{' '}
              {formatUptime(status.uptime)}
              {' / '}
              {status.toolCount}{' '}
              {t('admin.mcpServer.status.toolCount').toLowerCase()}
              {' / '}
              {status.activeSessions}{' '}
              {t('admin.mcpServer.status.activeSessions').toLowerCase()}
            </p>
          </div>
        </div>
      )}

      {/* 24h Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title={t('admin.mcpServer.status.toolCount')}
          value={status?.toolCount ?? 0}
          icon={Wrench}
          color="blue"
        />
        <StatCard
          title={t('admin.mcpServer.status.totalCalls')}
          value={status?.metrics24h?.totalCalls ?? 0}
          icon={Zap}
          color="purple"
        />
        <StatCard
          title={t('admin.mcpServer.status.successRate')}
          value={`${(status?.metrics24h?.successRate ?? 100).toFixed(1)}%`}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title={t('admin.mcpServer.status.avgDuration')}
          value={formatDuration(status?.metrics24h?.avgDuration ?? 0)}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Tool Quick View */}
      {status?.tools && status.tools.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            {t('admin.mcpServer.tools.title')}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {status.tools.map((tool) => {
              const toolMetrics = metrics?.byTool?.[tool.name];
              return (
                <div
                  key={tool.name}
                  className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-blue-50 p-2">
                      <Wrench className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-mono truncate text-sm font-semibold text-gray-900">
                        {tool.name}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                        {tool.description}
                      </p>
                      {toolMetrics && (
                        <div className="mt-2 flex gap-3 text-xs text-gray-400">
                          <span>
                            {toolMetrics.calls}{' '}
                            {t('admin.mcpServer.tools.calls').toLowerCase()}
                          </span>
                          {toolMetrics.errors > 0 && (
                            <span className="text-red-500">
                              {toolMetrics.errors}{' '}
                              {t('admin.mcpServer.tools.errors').toLowerCase()}
                            </span>
                          )}
                          <span>{formatDuration(toolMetrics.avgDuration)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {metrics?.recentErrors && metrics.recentErrors.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            {t('admin.mcpServer.metrics.recentErrors')}
          </h3>
          <div className="rounded-lg bg-white shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">
                      {t('admin.mcpServer.tools.name')}
                    </th>
                    <th className="px-4 py-3">
                      {t('admin.mcpServer.metrics.errorType')}
                    </th>
                    <th className="px-4 py-3">
                      {t('admin.mcpServer.metrics.timestamp')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {metrics.recentErrors.map((err, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="font-mono px-4 py-3 text-sm text-gray-900">
                        {err.toolName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          {err.errorType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(err.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderToolsTab = () => (
    <>
      {status?.tools && status.tools.length > 0 ? (
        <div className="space-y-4">
          {status.tools.map((tool) => {
            const toolMetrics = metrics?.byTool?.[tool.name];
            return (
              <div
                key={tool.name}
                className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-mono text-base font-semibold text-gray-900">
                      {tool.name}
                    </h4>
                    <p className="mt-1 text-sm text-gray-500">
                      {tool.description}
                    </p>
                  </div>
                  {toolMetrics && (
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-xs text-gray-400">
                          {t('admin.mcpServer.tools.calls')}
                        </p>
                        <p className="text-lg font-bold text-blue-600">
                          {toolMetrics.calls}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">
                          {t('admin.mcpServer.tools.errors')}
                        </p>
                        <p
                          className={`text-lg font-bold ${toolMetrics.errors > 0 ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {toolMetrics.errors}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">
                          {t('admin.mcpServer.tools.avgDuration')}
                        </p>
                        <p className="text-lg font-bold text-purple-600">
                          {formatDuration(toolMetrics.avgDuration)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
          <Wrench className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          No tools registered
        </div>
      )}
    </>
  );

  const renderMetricsTab = () => (
    <>
      {metrics && metrics.totalCalls > 0 ? (
        <>
          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              title={t('admin.mcpServer.status.totalCalls')}
              value={metrics.totalCalls}
              icon={Zap}
              color="blue"
            />
            <StatCard
              title={t('admin.mcpServer.status.successRate')}
              value={`${metrics.successRate.toFixed(1)}%`}
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title={t('admin.mcpServer.status.avgDuration')}
              value={formatDuration(metrics.avgDuration)}
              icon={Clock}
              color="purple"
            />
            <StatCard
              title={t('admin.mcpServer.tools.errors')}
              value={metrics.errorCount}
              icon={AlertTriangle}
              color="red"
            />
          </div>

          {/* By Tool */}
          {Object.keys(metrics.byTool).length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                {t('admin.mcpServer.metrics.byTool')}
              </h3>
              <div className="rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.name')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.calls')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.errors')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.avgDuration')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(metrics.byTool).map(
                        ([toolName, stats]) => (
                          <tr key={toolName} className="hover:bg-gray-50">
                            <td className="font-mono px-4 py-3 text-sm text-gray-900">
                              {toolName}
                            </td>
                            <td className="px-4 py-3 font-bold text-blue-600">
                              {stats.calls}
                            </td>
                            <td
                              className={`px-4 py-3 font-bold ${stats.errors > 0 ? 'text-red-600' : 'text-green-600'}`}
                            >
                              {stats.errors}
                            </td>
                            <td className="px-4 py-3 text-purple-600">
                              {formatDuration(stats.avgDuration)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* By API Key */}
          {Object.keys(metrics.byApiKey).length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                {t('admin.mcpServer.metrics.byApiKey')}
              </h3>
              <div className="rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.metrics.apiKey')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.calls')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.metrics.lastUsed')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(metrics.byApiKey).map(
                        ([apiKey, stats]) => (
                          <tr key={apiKey} className="hover:bg-gray-50">
                            <td className="font-mono px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center gap-2">
                                <Key className="h-4 w-4 text-gray-400" />
                                {apiKey}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-blue-600">
                              {stats.calls}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {formatDate(stats.lastUsed)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Recent Errors */}
          {metrics.recentErrors.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                {t('admin.mcpServer.metrics.recentErrors')}
              </h3>
              <div className="rounded-lg bg-white shadow">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.tools.name')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.metrics.errorType')}
                        </th>
                        <th className="px-4 py-3">
                          {t('admin.mcpServer.metrics.timestamp')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {metrics.recentErrors.map((err, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="font-mono px-4 py-3 text-sm text-gray-900">
                            {err.toolName}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                              {err.errorType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {formatDate(err.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
          <Server className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          {t('admin.mcpServer.metrics.noData')}
        </div>
      )}
    </>
  );

  const renderSessionsTab = () => (
    <>
      {sessions.length > 0 ? (
        <div className="rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">
                    {t('admin.mcpServer.sessions.sessionId')}
                  </th>
                  <th className="px-4 py-3">
                    {t('admin.mcpServer.sessions.client')}
                  </th>
                  <th className="px-4 py-3">
                    {t('admin.mcpServer.sessions.createdAt')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((session) => (
                  <tr key={session.sessionId} className="hover:bg-gray-50">
                    <td className="font-mono px-4 py-3 text-xs text-gray-900">
                      {session.sessionId}
                    </td>
                    <td className="px-4 py-3">
                      {session.clientInfo ? (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-900">
                            {session.clientInfo.name}
                          </span>
                          <span className="text-xs text-gray-400">
                            v{session.clientInfo.version}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(session.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500">
          <Users className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          {t('admin.mcpServer.sessions.noSessions')}
        </div>
      )}
    </>
  );

  const tabs = ['overview', 'tools', 'metrics', 'sessions'] as const;

  return (
    <AdminPageLayout
      title={t('admin.mcpServer.title')}
      description={t('admin.mcpServer.description')}
      icon={Radio}
      domain="system"
      actions={
        <button
          onClick={() => void fetchData()}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className="h-4 w-4" />
          {t('common.refresh') || 'Refresh'}
        </button>
      }
    >
      <div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {t(`admin.mcpServer.tabs.${tab}`)}
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
            {activeTab === 'tools' && renderToolsTab()}
            {activeTab === 'metrics' && renderMetricsTab()}
            {activeTab === 'sessions' && renderSessionsTab()}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
