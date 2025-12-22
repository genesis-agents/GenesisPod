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
  Presentation,
} from 'lucide-react';

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
  officeDocuments: <Presentation className="h-5 w-5 text-rose-600" />,
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
  officeDocuments: 'bg-rose-100',
};

interface AIDiagnosis {
  summary: string;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    recommendation: string;
    potentialSavings?: string;
  }>;
  cleanupPlan: Array<{
    step: number;
    action: string;
    target: string;
    expectedSavings: string;
  }>;
  overallScore: number;
}

export default function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dbAnalysis, setDbAnalysis] = useState<DatabaseAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingDb, setAnalyzingDb] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);
  const [deepCleaning, setDeepCleaning] = useState(false);
  const [cleaning, setCleaning] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showDbAnalysis, setShowDbAnalysis] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosis | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [showAIDiagnosis, setShowAIDiagnosis] = useState(false);

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
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load storage stats:', error);
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
      const data = await res.json();
      setDbAnalysis(data);
      setShowDbAnalysis(true);
    } catch (error) {
      console.error('Failed to load database analysis:', error);
      setMessage({ type: 'error', text: 'Failed to load database analysis' });
    } finally {
      setAnalyzingDb(false);
    }
  }, []);

  // Run AI Diagnosis
  const runAIDiagnosis = useCallback(async () => {
    setDiagnosing(true);
    try {
      // First ensure we have the latest data
      const [statsRes, dbRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/storage/stats?key=${ADMIN_KEY}`),
        fetch(`${API_BASE}/api/v1/storage/database-analysis?key=${ADMIN_KEY}`),
      ]);

      const statsData = await statsRes.json();
      const dbData = await dbRes.json();

      // Call AI to analyze the data
      const aiRes = await fetch(`${API_BASE}/api/v1/ai/simple-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:
            'Analyze this storage data and provide optimization recommendations.',
          stream: false,
          messages: [
            {
              role: 'system',
              content: `You are a database storage optimization expert. Analyze the provided storage data and provide actionable recommendations in JSON format.

Return a JSON object with this exact structure:
{
  "summary": "Brief overall assessment (1-2 sentences)",
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "Issue title",
      "description": "Detailed description",
      "recommendation": "What to do",
      "potentialSavings": "e.g., ~50MB"
    }
  ],
  "cleanupPlan": [
    {
      "step": 1,
      "action": "Action description",
      "target": "Target table/category",
      "expectedSavings": "Expected savings"
    }
  ],
  "overallScore": 0-100
}

Focus on:
1. Tables with excessive TOAST data (like generated_images)
2. Orphaned or stale data
3. Tables that could benefit from VACUUM
4. Data that can be safely cleaned up
5. Cost optimization opportunities`,
            },
            {
              role: 'user',
              content: `Analyze this storage data and provide optimization recommendations:

**Storage Statistics:**
- Total Records: ${statsData.totalRecords}
- Estimated Size: ${statsData.estimatedTotalSizeMB}MB
- Categories: ${JSON.stringify(statsData.categories?.slice(0, 5), null, 2)}

**Database Analysis:**
- Total DB Size: ${dbData.totalDatabaseSizeMB}MB
- Largest Tables: ${JSON.stringify(dbData.largestTables, null, 2)}

Provide detailed analysis and actionable cleanup plan.`,
            },
          ],
        }),
      });

      if (!aiRes.ok) {
        throw new Error('AI analysis failed');
      }

      const aiData = await aiRes.json();
      const content = aiData.response || aiData.content || '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const diagnosis = JSON.parse(jsonMatch[0]) as AIDiagnosis;
        setAiDiagnosis(diagnosis);
        setShowAIDiagnosis(true);
        setStats(statsData);
        setDbAnalysis(dbData);
      } else {
        throw new Error('Could not parse AI response');
      }
    } catch (error) {
      console.error('AI Diagnosis failed:', error);
      setMessage({
        type: 'error',
        text: 'AI diagnosis failed. Please try again.',
      });
    } finally {
      setDiagnosing(false);
    }
  }, []);

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
        // Reload analysis to show updated sizes
        loadDbAnalysis();
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run VACUUM' });
    } finally {
      setVacuuming(false);
    }
  };

  // Run VACUUM FULL ALL (Deep Clean)
  const handleDeepClean = async () => {
    if (
      !confirm(
        'Run VACUUM FULL on all tables? This will LOCK tables during operation and may take several minutes. Use during low traffic periods. Continue?'
      )
    ) {
      return;
    }
    setDeepCleaning(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/storage/vacuum-full-all?key=${ADMIN_KEY}`,
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
      setMessage({ type: 'error', text: 'Failed to run Deep Clean' });
    } finally {
      setDeepCleaning(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Storage Management
              </h1>
              <p className="text-sm text-gray-500">
                Manage Railway storage resources to control costs
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadStats}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            <button
              onClick={loadDbAnalysis}
              disabled={analyzingDb}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
            >
              {analyzingDb ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
              Analyze DB
            </button>
            <button
              onClick={runAIDiagnosis}
              disabled={diagnosing}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
            >
              {diagnosing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI Diagnosis
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
              <div className="text-sm font-medium text-gray-500">
                Categories
              </div>
              <div className="mt-1 text-3xl font-bold text-gray-900">
                {stats.totalCategories}
              </div>
            </div>
          </div>
        )}

        {/* AI Diagnosis Results */}
        {showAIDiagnosis && aiDiagnosis && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI Storage Diagnosis
              </h2>
              <button
                onClick={() => setShowAIDiagnosis(false)}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                Hide
              </button>
            </div>

            {/* Overall Score */}
            <div className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium opacity-80">
                    Health Score
                  </div>
                  <div className="mt-1 text-4xl font-bold">
                    {aiDiagnosis.overallScore}/100
                  </div>
                </div>
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full ${
                    aiDiagnosis.overallScore >= 80
                      ? 'bg-green-400/30'
                      : aiDiagnosis.overallScore >= 50
                        ? 'bg-yellow-400/30'
                        : 'bg-red-400/30'
                  }`}
                >
                  {aiDiagnosis.overallScore >= 80 ? (
                    <CheckCircle className="h-8 w-8" />
                  ) : aiDiagnosis.overallScore >= 50 ? (
                    <AlertTriangle className="h-8 w-8" />
                  ) : (
                    <AlertTriangle className="h-8 w-8" />
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm opacity-90">{aiDiagnosis.summary}</p>
            </div>

            {/* Issues */}
            {aiDiagnosis.issues.length > 0 && (
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h3 className="mb-4 font-semibold text-gray-900">
                  Detected Issues ({aiDiagnosis.issues.length})
                </h3>
                <div className="space-y-3">
                  {aiDiagnosis.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border-l-4 p-4 ${
                        issue.severity === 'critical'
                          ? 'border-red-500 bg-red-50'
                          : issue.severity === 'warning'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-blue-500 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4
                          className={`font-medium ${
                            issue.severity === 'critical'
                              ? 'text-red-800'
                              : issue.severity === 'warning'
                                ? 'text-yellow-800'
                                : 'text-blue-800'
                          }`}
                        >
                          {issue.title}
                        </h4>
                        {issue.potentialSavings && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                            Save {issue.potentialSavings}
                          </span>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-sm ${
                          issue.severity === 'critical'
                            ? 'text-red-700'
                            : issue.severity === 'warning'
                              ? 'text-yellow-700'
                              : 'text-blue-700'
                        }`}
                      >
                        {issue.description}
                      </p>
                      <p
                        className={`mt-2 text-sm font-medium ${
                          issue.severity === 'critical'
                            ? 'text-red-800'
                            : issue.severity === 'warning'
                              ? 'text-yellow-800'
                              : 'text-blue-800'
                        }`}
                      >
                        → {issue.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cleanup Plan */}
            {aiDiagnosis.cleanupPlan.length > 0 && (
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <h3 className="mb-4 font-semibold text-gray-900">
                  Recommended Cleanup Plan
                </h3>
                <div className="space-y-2">
                  {aiDiagnosis.cleanupPlan.map((step) => (
                    <div
                      key={step.step}
                      className="flex items-center gap-4 rounded-lg bg-gray-50 p-3"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-600">
                        {step.step}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {step.action}
                        </div>
                        <div className="text-xs text-gray-500">
                          Target: {step.target}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          {step.expectedSavings}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleFullCleanup}
                  disabled={cleaning !== null}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                >
                  {cleaning === 'all' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Execute Cleanup Plan
                </button>
              </div>
            )}
          </div>
        )}

        {/* Real Database Analysis */}
        {showDbAnalysis && dbAnalysis && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                Real Database Analysis (PostgreSQL)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleVacuum}
                  disabled={vacuuming || deepCleaning}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50"
                >
                  {vacuuming ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  VACUUM
                </button>
                <button
                  onClick={handleDeepClean}
                  disabled={vacuuming || deepCleaning}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-red-600 hover:to-orange-600 disabled:opacity-50"
                >
                  {deepCleaning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3" />
                  )}
                  Deep Clean
                </button>
                <button
                  onClick={() => setShowDbAnalysis(false)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  Hide
                </button>
              </div>
            </div>

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

            {/* All Tables */}
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h3 className="mb-4 font-semibold text-gray-900">
                All Tables ({dbAnalysis.tables.length})
              </h3>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Table</th>
                      <th className="pb-2 text-right font-medium">Rows</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                      <th className="pb-2 text-right font-medium">Data</th>
                      <th className="pb-2 text-right font-medium">Index</th>
                      <th className="pb-2 text-right font-medium">TOAST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbAnalysis.tables.map((table) => (
                      <tr
                        key={table.tableName}
                        className="border-b border-gray-100"
                      >
                        <td className="py-2 font-medium text-gray-900">
                          {table.tableName}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {table.rowCount.toLocaleString()}
                        </td>
                        <td className="py-2 text-right font-medium text-indigo-600">
                          {formatSize(table.totalSizeMB)}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {formatSize(table.dataSizeMB)}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {formatSize(table.indexSizeMB)}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {table.toastSizeMB > 0
                            ? formatSize(table.toastSizeMB)
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DB Recommendations */}
            {dbAnalysis.recommendations.length > 0 && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5">
                <h3 className="flex items-center gap-2 font-semibold text-purple-800">
                  <AlertTriangle className="h-5 w-5" />
                  Database Recommendations
                </h3>
                <ul className="mt-3 space-y-2">
                  {dbAnalysis.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-purple-700"
                    >
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-purple-500" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {!loading && stats && stats.recommendations.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Cleanup Recommendations
            </h3>
            <ul className="mt-3 space-y-2">
              {stats.recommendations.map((rec, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-700"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Storage Categories Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : stats ? (
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
                  'WARNING: This will permanently delete ALL generated images from ALL users. This action cannot be undone! Are you sure?'
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
                  'WARNING: This will permanently delete ALL raw collection data (both pending and processed). This action cannot be undone! Are you sure?'
                )
              }
              disabled={cleaning !== null}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
            >
              {cleaning === 'deleteAllRawData' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Delete All Raw Data
            </button>
            <button
              onClick={() =>
                handleCleanup(
                  'office-documents/all',
                  'deleteAllPPT',
                  'WARNING: This will permanently delete ALL PPT documents from ALL users. This action cannot be undone! Are you sure?'
                )
              }
              disabled={cleaning !== null}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-700 disabled:opacity-50"
            >
              {cleaning === 'deleteAllPPT' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Presentation className="h-4 w-4" />
              )}
              Delete All PPT
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
          <h3 className="flex items-center gap-2 font-medium text-blue-900">
            <HardDrive className="h-5 w-5" />
            About Railway Storage
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Railway charges based on storage usage. This dashboard helps you
            monitor and manage storage across different data categories. Size
            estimates are approximate and based on average record sizes. Regular
            cleanup of old data helps control costs while preserving important
            information.
          </p>
        </div>
      </div>
    </div>
  );
}
