'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Image,
  FileText,
  Database,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Zap,
  Clock,
  Archive,
  Activity,
  MessageSquare,
  BookOpen,
  Settings,
  TrendingDown,
  Shield,
  BarChart3,
  Sparkles,
  Brain,
  Lightbulb,
  Target,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/utils/auth';
import { ClientDate } from '@/components/common/ClientDate';

interface StorageCategory {
  name: string;
  displayName: string;
  count: number;
  estimatedSizeMB: number;
  description: string;
  cleanupRecommendation?: string;
  canCleanup: boolean;
}

interface StorageStats {
  totalCategories: number;
  totalRecords: number;
  estimatedTotalSizeMB: number;
  categories: StorageCategory[];
  recommendations: string[];
}

interface CleanupResult {
  success: boolean;
  category: string;
  deletedCount: number;
  freedSizeMB: number;
  message: string;
}

interface TableSize {
  tableName: string;
  rowCount: number;
  totalSizeMB: number;
  dataSizeMB: number;
  indexSizeMB: number;
  toastSizeMB: number;
}

interface DatabaseAnalysis {
  totalDatabaseSizeMB: number;
  tables: TableSize[];
  largestTables: TableSize[];
  recommendations: string[];
}

interface AIDiagnosis {
  summary: string;
  healthScore: number;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    recommendation: string;
    autoFixable: boolean;
    fixAction?: string;
  }>;
  optimizations: Array<{
    title: string;
    description: string;
    potentialSavings: string;
    action: string;
  }>;
  timestamp: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const ADMIN_KEY = 'deepdive-admin-cleanup-2024';

// Icon mapping for categories
const categoryIcons: Record<string, React.ReactNode> = {
  generatedImages: <Image className="h-5 w-5 text-purple-600" />,
  rawData: <Database className="h-5 w-5 text-blue-600" />,
  resources: <BookOpen className="h-5 w-5 text-green-600" />,
  notes: <FileText className="h-5 w-5 text-amber-600" />,
  researchProjectSources: <Archive className="h-5 w-5 text-indigo-600" />,
  collectionTasks: <Settings className="h-5 w-5 text-gray-600" />,
  importTasks: <Activity className="h-5 w-5 text-cyan-600" />,
  parsedMetadata: <Clock className="h-5 w-5 text-orange-600" />,
  deduplicationRecords: <Shield className="h-5 w-5 text-pink-600" />,
  dataQualityMetrics: <TrendingDown className="h-5 w-5 text-red-600" />,
  userActivities: <Activity className="h-5 w-5 text-teal-600" />,
  topicMessages: <MessageSquare className="h-5 w-5 text-violet-600" />,
};

// Icon background colors
const categoryBgColors: Record<string, string> = {
  generatedImages: 'bg-purple-100',
  rawData: 'bg-blue-100',
  resources: 'bg-green-100',
  notes: 'bg-amber-100',
  researchProjectSources: 'bg-indigo-100',
  collectionTasks: 'bg-gray-100',
  importTasks: 'bg-cyan-100',
  parsedMetadata: 'bg-orange-100',
  deduplicationRecords: 'bg-pink-100',
  dataQualityMetrics: 'bg-red-100',
  userActivities: 'bg-teal-100',
  topicMessages: 'bg-violet-100',
};

export default function DatabaseManagement() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dbAnalysis, setDbAnalysis] = useState<DatabaseAnalysis | null>(null);
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingDb, setAnalyzingDb] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);
  const [cleaning, setCleaning] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load storage statistics
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/stats?key=${ADMIN_KEY}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch storage stats');
      }
      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setStats(data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load storage statistics' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load real database analysis
  const loadDbAnalysis = useCallback(async () => {
    setAnalyzingDb(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/database-analysis?key=${ADMIN_KEY}`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch database analysis');
      }
      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setDbAnalysis(data);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load database analysis' });
    } finally {
      setAnalyzingDb(false);
    }
  }, []);

  // AI Diagnosis - analyze database and generate recommendations
  const runAIDiagnosis = useCallback(async () => {
    if (!stats || !dbAnalysis) {
      setMessage({ type: 'error', text: 'Please wait for data to load first' });
      return;
    }

    setDiagnosing(true);
    setMessage(null);

    try {
      // Generate AI diagnosis based on current data
      const issues: AIDiagnosis['issues'] = [];
      const optimizations: AIDiagnosis['optimizations'] = [];
      let healthScore = 100;

      // Analyze database size
      if (dbAnalysis.totalDatabaseSizeMB > 500) {
        healthScore -= 20;
        issues.push({
          severity: 'critical',
          title: 'Database size exceeds 500MB',
          description: `Current size: ${dbAnalysis.totalDatabaseSizeMB.toFixed(2)}MB. Railway charges based on storage usage.`,
          recommendation:
            'Run Full Cleanup to remove unnecessary data and reduce costs.',
          autoFixable: true,
          fixAction: 'fullCleanup',
        });
      } else if (dbAnalysis.totalDatabaseSizeMB > 300) {
        healthScore -= 10;
        issues.push({
          severity: 'warning',
          title: 'Database size approaching limit',
          description: `Current size: ${dbAnalysis.totalDatabaseSizeMB.toFixed(2)}MB. Consider cleanup to prevent cost increase.`,
          recommendation: 'Review large tables and clean up old data.',
          autoFixable: false,
        });
      }

      // Analyze categories for cleanup opportunities
      const cleanableCategories = stats.categories.filter(
        (c) => c.canCleanup && c.count > 0
      );
      if (cleanableCategories.length > 0) {
        const totalCleanable = cleanableCategories.reduce(
          (sum, c) => sum + c.estimatedSizeMB,
          0
        );
        if (totalCleanable > 10) {
          healthScore -= 5;
          issues.push({
            severity: 'warning',
            title: `${cleanableCategories.length} categories have cleanable data`,
            description: `Approximately ${totalCleanable.toFixed(2)}MB can be freed.`,
            recommendation:
              'Click cleanup buttons on individual categories or run Full Cleanup.',
            autoFixable: true,
            fixAction: 'fullCleanup',
          });
        }
      }

      // Check for large TOAST data (indicates large text/JSON fields)
      const tablesWithLargeToast = dbAnalysis.largestTables.filter(
        (t) => t.toastSizeMB > 10
      );
      if (tablesWithLargeToast.length > 0) {
        healthScore -= 5;
        tablesWithLargeToast.forEach((table) => {
          issues.push({
            severity: 'info',
            title: `Large TOAST data in ${table.tableName}`,
            description: `${table.toastSizeMB.toFixed(2)}MB of TOAST data (large text/JSON fields).`,
            recommendation:
              'Consider archiving old records or optimizing data storage.',
            autoFixable: false,
          });
        });
      }

      // Generate optimizations based on stats
      stats.categories.forEach((category) => {
        if (category.cleanupRecommendation) {
          optimizations.push({
            title: `Clean ${category.displayName}`,
            description: category.cleanupRecommendation,
            potentialSavings: `~${category.estimatedSizeMB.toFixed(2)}MB`,
            action: category.name,
          });
        }
      });

      // Add VACUUM recommendation if database is large
      if (dbAnalysis.totalDatabaseSizeMB > 100) {
        optimizations.push({
          title: 'Run VACUUM ANALYZE',
          description:
            'Reclaim disk space and update query planner statistics.',
          potentialSavings: 'Improves performance',
          action: 'vacuum',
        });
      }

      // Generate summary
      let summary = '';
      if (healthScore >= 90) {
        summary =
          'Database is in excellent health. No immediate action required.';
      } else if (healthScore >= 70) {
        summary =
          'Database is healthy but has some optimization opportunities.';
      } else if (healthScore >= 50) {
        summary =
          'Database needs attention. Several issues should be addressed.';
      } else {
        summary =
          'Database requires immediate attention. Critical issues detected.';
      }

      const diagnosis: AIDiagnosis = {
        summary,
        healthScore: Math.max(0, healthScore),
        issues,
        optimizations,
        timestamp: new Date().toISOString(),
      };

      setAiDiagnosis(diagnosis);
      setMessage({ type: 'success', text: 'AI diagnosis completed' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run AI diagnosis' });
    } finally {
      setDiagnosing(false);
    }
  }, [stats, dbAnalysis]);

  // Auto-optimize based on AI recommendations
  const runAutoOptimize = async () => {
    if (!aiDiagnosis) return;

    const fixableIssues = aiDiagnosis.issues.filter((i) => i.autoFixable);
    if (fixableIssues.length === 0) {
      setMessage({
        type: 'info' as 'success',
        text: 'No auto-fixable issues found',
      });
      return;
    }

    if (
      !confirm(
        `This will automatically fix ${fixableIssues.length} issues. Continue?`
      )
    ) {
      return;
    }

    setOptimizing('auto');
    setMessage(null);

    try {
      // Run full cleanup
      const res = await fetch(
        `${API_BASE}/api/v1/storage/cleanup/all?key=${ADMIN_KEY}`,
        { method: 'POST' }
      );
      const result = await res.json();

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Auto-optimization completed: ${result.totalDeleted} records deleted, ~${result.totalFreedMB}MB freed`,
        });
        // Refresh all data
        await Promise.all([loadStats(), loadDbAnalysis()]);
        // Re-run diagnosis
        setTimeout(() => runAIDiagnosis(), 1000);
      } else {
        setMessage({ type: 'error', text: 'Auto-optimization failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run auto-optimization' });
    } finally {
      setOptimizing(null);
    }
  };

  // Run VACUUM
  const handleVacuum = async () => {
    if (
      !confirm(
        'Run VACUUM ANALYZE to reclaim space? This may take a few minutes.'
      )
    ) {
      return;
    }
    setVacuuming(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/vacuum?key=${ADMIN_KEY}`,
        { method: 'POST' }
      );
      const result = await res.json();
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
      if (result.success) {
        loadDbAnalysis();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run VACUUM' });
    } finally {
      setVacuuming(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadDbAnalysis();
  }, [loadStats, loadDbAnalysis]);

  // Generic cleanup handler
  const handleCleanup = async (
    endpoint: string,
    category: string,
    confirmMessage: string
  ) => {
    if (!confirm(confirmMessage)) {
      return;
    }

    setCleaning(category);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/${endpoint}?key=${ADMIN_KEY}`,
        {
          method: endpoint.includes('/all') ? 'DELETE' : 'POST',
        }
      );
      const result: CleanupResult = await res.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message,
        });
        loadStats();
        loadDbAnalysis();
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Cleanup failed',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to cleanup ${category}` });
    } finally {
      setCleaning(null);
    }
  };

  // Full cleanup
  const handleFullCleanup = async () => {
    if (
      !confirm(
        'This will run cleanup on all categories (images, raw data, tasks, metadata, activities). Continue?'
      )
    ) {
      return;
    }

    setCleaning('all');
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/cleanup/all?key=${ADMIN_KEY}`,
        {
          method: 'POST',
        }
      );
      const result = await res.json();
      if (result.success) {
        setMessage({
          type: 'success',
          text: `Full cleanup completed: ${result.totalDeleted} records deleted, ~${result.totalFreedMB}MB freed`,
        });
        loadStats();
        loadDbAnalysis();
      } else {
        setMessage({
          type: 'error',
          text: 'Full cleanup failed',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run full cleanup' });
    } finally {
      setCleaning(null);
    }
  };

  // Format size
  const formatSize = (mb: number) => {
    if (mb < 1) return `${Math.round(mb * 1024)} KB`;
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  // Get health score color
  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    if (score >= 50) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-800';
      default:
        return 'border-blue-200 bg-blue-50 text-blue-800';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-600" />;
      default:
        return <Lightbulb className="h-5 w-5 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => {
            loadStats();
            loadDbAnalysis();
          }}
          disabled={loading || analyzingDb}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading || analyzingDb ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
        <button
          onClick={runAIDiagnosis}
          disabled={diagnosing || loading || !stats || !dbAnalysis}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
        >
          {diagnosing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          AI Diagnosis
        </button>
        <button
          onClick={handleVacuum}
          disabled={vacuuming}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50"
        >
          {vacuuming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Run VACUUM
        </button>
        <button
          onClick={handleFullCleanup}
          disabled={cleaning !== null}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-orange-600 hover:to-red-600 disabled:opacity-50"
        >
          {cleaning === 'all' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Full Cleanup
        </button>
      </div>

      {/* Alert Message */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="flex-1">{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-current opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* AI Diagnosis Panel */}
      {aiDiagnosis && (
        <div className="space-y-4 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Brain className="h-5 w-5 text-blue-600" />
              AI Diagnosis Report
            </h2>
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 font-bold ${getHealthScoreColor(aiDiagnosis.healthScore)}`}
              >
                <Target className="h-4 w-4" />
                Health: {aiDiagnosis.healthScore}/100
              </div>
              {aiDiagnosis.issues.some((i) => i.autoFixable) && (
                <button
                  onClick={runAutoOptimize}
                  disabled={optimizing !== null}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
                >
                  {optimizing === 'auto' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  Auto Optimize
                </button>
              )}
            </div>
          </div>

          <p className="text-gray-700">{aiDiagnosis.summary}</p>

          {/* Issues */}
          {aiDiagnosis.issues.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Issues Detected</h3>
              {aiDiagnosis.issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-4 ${getSeverityColor(issue.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(issue.severity)}
                    <div className="flex-1">
                      <h4 className="font-medium">{issue.title}</h4>
                      <p className="mt-1 text-sm opacity-90">
                        {issue.description}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        Recommendation: {issue.recommendation}
                      </p>
                      {issue.autoFixable && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle className="h-3 w-3" /> Auto-fixable
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Optimizations */}
          {aiDiagnosis.optimizations.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">
                Optimization Opportunities
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {aiDiagnosis.optimizations.map((opt, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-green-200 bg-green-50/50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 flex-shrink-0 text-green-600" />
                      <div className="flex-1">
                        <h4 className="font-medium text-green-900">
                          {opt.title}
                        </h4>
                        <p className="mt-1 text-sm text-green-700">
                          {opt.description}
                        </p>
                        <p className="mt-2 text-xs font-medium text-green-600">
                          Potential savings: {opt.potentialSavings}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Diagnosed at:{' '}
            <ClientDate date={aiDiagnosis.timestamp} format="datetime" />
          </p>
        </div>
      )}

      {/* Summary Cards */}
      {!loading && stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="text-sm font-medium text-gray-500">
              Total Records
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900">
              {stats.totalRecords.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="text-sm font-medium text-gray-500">
              Estimated Size
            </div>
            <div className="mt-1 text-3xl font-bold text-blue-600">
              {formatSize(stats.estimatedTotalSizeMB)}
            </div>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="text-sm font-medium text-gray-500">Categories</div>
            <div className="mt-1 text-3xl font-bold text-gray-900">
              {stats.totalCategories}
            </div>
          </div>
        </div>
      )}

      {/* Real Database Analysis */}
      {dbAnalysis && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            PostgreSQL Database Analysis
          </h2>

          {/* DB Size Summary */}
          <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 p-5 text-white">
            <div className="text-sm font-medium opacity-80">
              Total Database Size (Actual)
            </div>
            <div className="mt-1 text-4xl font-bold">
              {formatSize(dbAnalysis.totalDatabaseSizeMB)}
            </div>
            <div className="mt-2 text-sm opacity-80">
              {dbAnalysis.tables.length} tables total
            </div>
          </div>

          {/* Top 5 Largest Tables */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h3 className="mb-4 font-semibold text-gray-900">
              Top 5 Largest Tables
            </h3>
            <div className="space-y-3">
              {dbAnalysis.largestTables.map((table, idx) => (
                <div
                  key={table.tableName}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {table.tableName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {table.rowCount.toLocaleString()} rows
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900">
                      {formatSize(table.totalSizeMB)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Data: {formatSize(table.dataSizeMB)} | Index:{' '}
                      {formatSize(table.indexSizeMB)}
                      {table.toastSizeMB > 0 && (
                        <> | TOAST: {formatSize(table.toastSizeMB)}</>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Storage Categories Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : stats ? (
        <>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Database className="h-5 w-5 text-blue-600" />
            Data Categories (
            {stats.categories.filter((c) => c.canCleanup).length} cleanable)
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.categories.map((category) => (
              <div
                key={category.name}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${categoryBgColors[category.name] || 'bg-gray-100'}`}
                    >
                      {categoryIcons[category.name] || (
                        <Database className="h-5 w-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {category.displayName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {category.count.toLocaleString()} records
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatSize(category.estimatedSizeMB)}
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-gray-500">
                  {category.description}
                </p>

                {category.cleanupRecommendation && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                    {category.cleanupRecommendation}
                  </div>
                )}

                {category.canCleanup && (
                  <button
                    onClick={() =>
                      handleCleanup(
                        `cleanup/${category.name === 'generatedImages' ? 'images' : category.name.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
                        category.name,
                        `Clean up ${category.displayName}? This action cannot be undone.`
                      )
                    }
                    disabled={cleaning !== null}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 transition-all hover:bg-orange-100 disabled:opacity-50"
                  >
                    {cleaning === category.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Cleanup
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
        <h3 className="flex items-center gap-2 font-semibold text-red-800">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h3>
        <p className="mt-2 text-sm text-red-600">
          These actions are irreversible and will permanently delete data.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() =>
              handleCleanup(
                'images/all',
                'deleteAllImages',
                'WARNING: This will permanently delete ALL generated images. This action cannot be undone!'
              )
            }
            disabled={cleaning !== null}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {cleaning === 'deleteAllImages' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete All Images
          </button>
          <button
            onClick={() =>
              handleCleanup(
                'raw-data/all',
                'deleteAllRawData',
                'WARNING: This will permanently delete ALL raw data. This action cannot be undone!'
              )
            }
            disabled={cleaning !== null}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {cleaning === 'deleteAllRawData' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete All Raw Data
          </button>
          <button
            onClick={() =>
              handleCleanup(
                'knowledge-base/all',
                'deleteAllKB',
                'WARNING: This will permanently delete ALL knowledge base data. This action cannot be undone!'
              )
            }
            disabled={cleaning !== null}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
          >
            {cleaning === 'deleteAllKB' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete All Knowledge Base
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
        <h3 className="flex items-center gap-2 font-medium text-blue-900">
          <HardDrive className="h-5 w-5" />
          About Railway Database
        </h3>
        <p className="mt-2 text-sm text-blue-700">
          Railway charges based on database storage usage. This dashboard helps
          you monitor and manage PostgreSQL data across different categories.
          Regular cleanup and VACUUM operations help reclaim space and control
          costs. Use AI Diagnosis for intelligent analysis and Auto Optimize for
          one-click optimization.
        </p>
      </div>
    </div>
  );
}
