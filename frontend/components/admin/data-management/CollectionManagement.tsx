'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/utils/config';
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
  FileText,
  Video,
  Newspaper,
  FolderGit2,
  Rss,
  BarChart3,
  Calendar,
  Globe,
  Clock,
  Zap,
  Settings,
  Play,
  TrendingUp,
  Scale,
} from 'lucide-react';

interface CollectionRule {
  id: string;
  resourceType: string;
  cronExpression: string;
  maxConcurrent: number;
  timeout: number;
  isActive: boolean;
  description?: string;
  lastExecutedAt?: string;
  nextScheduledAt?: string;
}

interface CollectionStats {
  resourceType: string;
  totalCollected: number;
  totalSuccessful: number;
  totalFailed: number;
  totalDuplicates: number;
  averageQualityScore: number;
  successRate: number;
  lastCollectionAt?: string;
}

const resourceTypeIcons: Record<string, React.ReactNode> = {
  YOUTUBE_VIDEO: <Video className="h-6 w-6" />,
  PAPER: <FileText className="h-6 w-6" />,
  BLOG: <Globe className="h-6 w-6" />,
  NEWS: <Newspaper className="h-6 w-6" />,
  PROJECT: <FolderGit2 className="h-6 w-6" />,
  RSS: <Rss className="h-6 w-6" />,
  REPORT: <BarChart3 className="h-6 w-6" />,
  EVENT: <Calendar className="h-6 w-6" />,
  POLICY: <Scale className="h-6 w-6" />,
};

const resourceTypeColors: Record<
  string,
  { bg: string; text: string; border: string; gradient: string }
> = {
  YOUTUBE_VIDEO: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-100',
    gradient: 'from-red-500 to-red-600',
  },
  PAPER: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-100',
    gradient: 'from-blue-500 to-blue-600',
  },
  BLOG: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-100',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  NEWS: {
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    border: 'border-violet-100',
    gradient: 'from-violet-500 to-violet-600',
  },
  PROJECT: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100',
    gradient: 'from-amber-500 to-amber-600',
  },
  RSS: {
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    border: 'border-orange-100',
    gradient: 'from-orange-500 to-orange-600',
  },
  REPORT: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-100',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  EVENT: {
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    border: 'border-pink-100',
    gradient: 'from-pink-500 to-pink-600',
  },
  POLICY: {
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    border: 'border-teal-100',
    gradient: 'from-teal-500 to-teal-600',
  },
};

export default function CollectionManagement() {
  const [rules, setRules] = useState<CollectionRule[]>([]);
  const [stats, setStats] = useState<CollectionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<CollectionRule | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({
    resourceType: 'PAPER',
    cronExpression: '0 */6 * * *',
    maxConcurrent: 3,
    timeout: 300,
    description: '',
  });

  useEffect(() => {
    fetchRulesAndStats();
  }, []);

  const fetchRulesAndStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const [rulesRes, statsRes] = await Promise.all([
        fetch(`${config.apiUrl}/data-management/rules`),
        fetch(`${config.apiUrl}/data-management/dashboard/summary`),
      ]);

      if (!rulesRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const rulesData = await rulesRes.json();
      const statsData = await statsRes.json();

      setRules(rulesData.data || []);
      setStats(statsData.data?.statistics || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    try {
      const res = await fetch(`${config.apiUrl}/data-management/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (!res.ok) throw new Error('Failed to create rule');

      setNewRule({
        resourceType: 'PAPER',
        cronExpression: '0 */6 * * *',
        maxConcurrent: 3,
        timeout: 300,
        description: '',
      });
      setShowAddModal(false);
      await fetchRulesAndStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleToggleRule = async (rule: CollectionRule) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/data-management/rules/${rule.resourceType}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...rule, isActive: !rule.isActive }),
        }
      );

      if (!res.ok) throw new Error('Failed to update rule');
      await fetchRulesAndStats();
      if (selectedRule?.resourceType === rule.resourceType) {
        setSelectedRule({ ...rule, isActive: !rule.isActive });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleExecuteRule = async (resourceType: string) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/data-management/rules/${resourceType}/execute`,
        {
          method: 'POST',
        }
      );

      if (!res.ok) throw new Error('Failed to execute rule');
      await fetchRulesAndStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute rule');
    }
  };

  const handleDeleteRule = async (resourceType: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const res = await fetch(
        `${config.apiUrl}/data-management/rules/${resourceType}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete rule');
      setSelectedRule(null);
      await fetchRulesAndStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const getColors = (resourceType: string) => {
    return (
      resourceTypeColors[resourceType] || {
        bg: 'bg-gray-50',
        text: 'text-gray-600',
        border: 'border-gray-100',
        gradient: 'from-gray-500 to-gray-600',
      }
    );
  };

  const getIcon = (resourceType: string) => {
    return resourceTypeIcons[resourceType] || <Globe className="h-6 w-6" />;
  };

  const getStatsForRule = (resourceType: string) => {
    return stats.find((s) => s.resourceType === resourceType);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading collection settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200/50 bg-red-50/50 p-4 backdrop-blur-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Collection Rules
            </h2>
            <p className="text-sm text-gray-500">
              {rules.length} active collectors
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchRulesAndStats()}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30"
          >
            <Plus className="h-4 w-4" />
            New Rule
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rules.length === 0 ? (
          <div className="col-span-full rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <Settings className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900">
              No collection rules
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new collection rule
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Rule
            </button>
          </div>
        ) : (
          rules.map((rule) => {
            const colors = getColors(rule.resourceType);
            const ruleStats = getStatsForRule(rule.resourceType);
            return (
              <div
                key={rule.id}
                onClick={() => setSelectedRule(rule)}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white p-5 shadow-sm transition-all hover:scale-[1.02] hover:shadow-xl ${colors.border}`}
              >
                {/* Gradient accent */}
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colors.gradient}`}
                />

                {/* Header */}
                <div className="mb-4 flex items-start justify-between">
                  <div className={`rounded-xl p-3 ${colors.bg} ${colors.text}`}>
                    {getIcon(rule.resourceType)}
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      rule.isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {rule.isActive ? 'Active' : 'Paused'}
                  </div>
                </div>

                {/* Title */}
                <h3 className="mb-1 font-semibold text-gray-900">
                  {rule.resourceType.replace(/_/g, ' ')}
                </h3>

                {/* Schedule */}
                <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{rule.cronExpression}</span>
                </div>

                {/* Stats */}
                {ruleStats && (
                  <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                    <div>
                      <div className="text-xs text-gray-500">Collected</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {ruleStats.totalCollected}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-lg font-semibold text-gray-900">
                          {ruleStats.successRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Actions (visible on hover) */}
                <div className="absolute bottom-4 right-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecuteRule(rule.resourceType);
                    }}
                    className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
                    title="Run now"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Statistics Summary */}
      {stats.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Collection Overview</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">
                {stats.reduce((acc, s) => acc + s.totalCollected, 0)}
              </div>
              <div className="text-sm text-gray-500">Total Collected</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">
                {stats.reduce((acc, s) => acc + s.totalSuccessful, 0)}
              </div>
              <div className="text-sm text-gray-500">Successful</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-2xl font-bold text-red-600">
                {stats.reduce((acc, s) => acc + s.totalFailed, 0)}
              </div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="text-2xl font-bold text-amber-600">
                {stats.reduce((acc, s) => acc + s.totalDuplicates, 0)}
              </div>
              <div className="text-sm text-gray-500">Duplicates</div>
            </div>
          </div>
        </div>
      )}

      {/* Rule Detail Modal */}
      {selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div
              className={`relative overflow-hidden rounded-t-2xl ${getColors(selectedRule.resourceType).bg} px-6 py-5`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${getColors(selectedRule.resourceType).gradient}`}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-xl bg-white/80 p-2.5 ${getColors(selectedRule.resourceType).text}`}
                  >
                    {getIcon(selectedRule.resourceType)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedRule.resourceType.replace(/_/g, ' ')}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Collection Rule Settings
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRule(null)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-white/50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="space-y-5 p-6">
              {/* Status Toggle */}
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
                <div>
                  <h4 className="font-medium text-gray-900">Rule Status</h4>
                  <p className="text-sm text-gray-500">
                    {selectedRule.isActive
                      ? 'Collection is running on schedule'
                      : 'Collection is paused'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleRule(selectedRule)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    selectedRule.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      selectedRule.isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Configuration */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs">Schedule</span>
                    </div>
                    <div className="font-mono mt-1 text-sm text-gray-900">
                      {selectedRule.cronExpression}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Zap className="h-4 w-4" />
                      <span className="text-xs">Concurrency</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {selectedRule.maxConcurrent} tasks
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              {getStatsForRule(selectedRule.resourceType) && (
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Statistics</h4>
                  <div className="grid grid-cols-4 gap-2">
                    {(() => {
                      const ruleStats = getStatsForRule(
                        selectedRule.resourceType
                      )!;
                      return (
                        <>
                          <div className="rounded-lg bg-gray-50 p-3 text-center">
                            <div className="text-lg font-bold text-gray-900">
                              {ruleStats.totalCollected}
                            </div>
                            <div className="text-xs text-gray-500">
                              Collected
                            </div>
                          </div>
                          <div className="rounded-lg bg-emerald-50 p-3 text-center">
                            <div className="text-lg font-bold text-emerald-600">
                              {ruleStats.totalSuccessful}
                            </div>
                            <div className="text-xs text-gray-500">Success</div>
                          </div>
                          <div className="rounded-lg bg-red-50 p-3 text-center">
                            <div className="text-lg font-bold text-red-600">
                              {ruleStats.totalFailed}
                            </div>
                            <div className="text-xs text-gray-500">Failed</div>
                          </div>
                          <div className="rounded-lg bg-blue-50 p-3 text-center">
                            <div className="text-lg font-bold text-blue-600">
                              {ruleStats.successRate.toFixed(0)}%
                            </div>
                            <div className="text-xs text-gray-500">Rate</div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                onClick={() => handleDeleteRule(selectedRule.resourceType)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete Rule
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExecuteRule(selectedRule.resourceType)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Play className="h-4 w-4" />
                  Run Now
                </button>
                <button
                  onClick={() => setSelectedRule(null)}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Create Collection Rule
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Resource Type
                </label>
                <select
                  value={newRule.resourceType}
                  onChange={(e) =>
                    setNewRule({ ...newRule, resourceType: e.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option>PAPER</option>
                  <option>BLOG</option>
                  <option>NEWS</option>
                  <option>YOUTUBE_VIDEO</option>
                  <option>PROJECT</option>
                  <option>EVENT</option>
                  <option>REPORT</option>
                  <option>POLICY</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Schedule (Cron)
                </label>
                <input
                  type="text"
                  value={newRule.cronExpression}
                  onChange={(e) =>
                    setNewRule({ ...newRule, cronExpression: e.target.value })
                  }
                  placeholder="0 */6 * * *"
                  className="font-mono mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  e.g., '0 */6 * * *' = every 6 hours
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Max Concurrent
                  </label>
                  <input
                    type="number"
                    value={newRule.maxConcurrent}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        maxConcurrent: parseInt(e.target.value),
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Timeout (sec)
                  </label>
                  <input
                    type="number"
                    value={newRule.timeout}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        timeout: parseInt(e.target.value),
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRule}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
